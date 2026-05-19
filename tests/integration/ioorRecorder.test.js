// [test] ID: T5.3 | Date: 2026-05-19 | Description: ioorRecorder 集成测试（A.1 async 契约；脱敏 + audit 降级）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');

const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildIoorRepository } = require('../../src/observability/ioorRepository');
const { buildAuditRepository } = require('../../src/domain/audit/auditRepository');
const { createIoorRecorder } = require('../../src/observability/ioorRecorder');

async function bootRecorder() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const ioorRepository = buildIoorRepository(driver);
    const auditRepository = buildAuditRepository(driver);
    const recorder = createIoorRecorder({ ioorRepository, auditRepository });
    return { driver, recorder, ioorRepository, auditRepository };
}

describe('ioorRecorder', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await bootRecorder();
    });
    afterEach(() => ctx.driver.close());

    test('正常落库 + 可按 execution 查询', async () => {
        await ctx.recorder.record({
            executionId: 'exec_a',
            nodeId: 'n1',
            turnIndex: 0,
            agentId: 'a1',
            profileHash: 'a'.repeat(64),
            modelProvider: 'openai',
            modelName: 'gpt-4',
            input: { messages: [{ role: 'user', content: 'hi' }] },
            output: { content: 'hello', reasoning_content: null },
            tokenUsage: { prompt: 3, completion: 1, total: 4, cached_prompt_tokens: 0 },
            latencyMs: 100,
        });
        const list = await ctx.ioorRepository.listByExecution('exec_a');
        expect(list).toHaveLength(1);
        expect(list[0].agentId).toBe('a1');
        expect(list[0].profileHash).toMatch(/^a+$/);
        expect(list[0].output.content).toBe('hello');
    });

    test('敏感字段写入前脱敏', async () => {
        await ctx.recorder.record({
            executionId: 'exec_b',
            nodeId: 'n1',
            turnIndex: 0,
            input: { apiKey: 'sk-secret', user: 'alice' },
            output: { content: 'ok', reasoning_content: null },
            toolCalls: [],
            observations: [],
            tokenUsage: null,
            latencyMs: null,
        });
        const list = await ctx.ioorRepository.listByExecution('exec_b');
        expect(list[0].input.apiKey).toBe('[REDACTED]');
        expect(list[0].input.user).toBe('alice');
    });

    test('工具调用 arguments 与 observations 同样脱敏', async () => {
        await ctx.recorder.record({
            executionId: 'exec_c',
            nodeId: 'n1',
            turnIndex: 1,
            input: null,
            output: null,
            toolCalls: [{ toolName: 't', arguments: { password: 'x', q: 'y' } }],
            observations: [{ toolName: 't', success: true, result: { token: 'tk', data: 'd' }, error: null }],
            tokenUsage: null,
            latencyMs: null,
        });
        const list = await ctx.ioorRepository.listByExecution('exec_c');
        expect(list[0].toolCalls[0].arguments.password).toBe('[REDACTED]');
        expect(list[0].observations[0].result.token).toBe('[REDACTED]');
    });

    test('契约校验失败 → 走 audit 降级', async () => {
        // missing required executionId
        await ctx.recorder.record({
            nodeId: 'n',
            turnIndex: 0,
            input: 'broken',
            output: null,
        });
        const dead = await ctx.auditRepository.listRecent('ioor', 10);
        expect(dead).toHaveLength(1);
    });

    test('turnIndex 排序：同 execution 多 turn 按顺序返回', async () => {
        for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await ctx.recorder.record({
                executionId: 'exec_x',
                nodeId: 'n1',
                turnIndex: i,
                input: null,
                output: null,
                toolCalls: [],
                observations: [],
                tokenUsage: null,
                latencyMs: null,
            });
        }
        const list = await ctx.ioorRepository.listByExecution('exec_x');
        expect(list.map((r) => r.turnIndex)).toEqual([0, 1, 2]);
    });
});
