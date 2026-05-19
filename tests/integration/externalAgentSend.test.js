// [test] ID: PAM-6 | Date: 2026-05-19 | Description: externalAgentSend 工具集成测试（mock fetch + 审计留痕 + 成功/失败/超时）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const {
    buildExternalAgentCallRepository,
} = require('../../src/domain/projectAssistant/repositories/externalAgentCallRepository');
const externalAgentSend = require('../../src/toolRegistry/builtinTools/projectAssistant/externalAgentSend');
const { TimeoutError } = require('../../src/infrastructure/errors/AppError');

const INPUT = {
    projectId: 'xscaffold',
    profile: 'claudeHttp',
    sessionId: 'xscaffold-main',
    instruction: '检查项目状态，给出阻塞点和下一步',
    timeoutMs: 120000,
};

describe('externalAgentSend tool (PAM-6)', () => {
    let driver;
    const originalFetch = global.fetch;

    beforeEach(async () => {
        driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
    });
    afterEach(() => {
        global.fetch = originalFetch;
        return driver.close();
    });

    test('成功路径：返回 completed 数据并留痕 completed 审计行', async () => {
        const captured = {};
        global.fetch = jest.fn().mockImplementation((url, init) => {
            captured.url = url;
            captured.init = init;
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ reply: 'A.1 已完成', summary: 'CI 全绿' }),
            });
        });

        const r = await externalAgentSend.handler(INPUT, { db: driver });
        expect(r.ok).toBe(true);
        expect(r.data.status).toBe('completed');
        expect(r.data.reply).toBe('A.1 已完成');
        expect(r.data.summary).toBe('CI 全绿');
        expect(r.data.durationMs).toBeGreaterThanOrEqual(0);

        // URL 固定在 profile，请求体为 PLAN §6.3 结构
        expect(captured.url).toBe('http://127.0.0.1:4567/messages');
        expect(JSON.parse(captured.init.body)).toMatchObject({
            sessionId: 'xscaffold-main',
            message: INPUT.instruction,
            metadata: { projectId: 'xscaffold', source: 'xscaffold' },
        });
    });

    test('成功后 external_agent_calls 落一条 completed 审计', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ reply: 'R', summary: 'S' }),
        });
        await externalAgentSend.handler(INPUT, { db: driver });

        const { rows } = await driver.query('SELECT * FROM external_agent_calls', []);
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('completed');
        expect(rows[0].reply).toBe('R');
    });

    test('外部返回非 2xx → 抛错并留痕 failed', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

        await expect(externalAgentSend.handler(INPUT, { db: driver })).rejects.toThrow(/HTTP 503/u);

        const repo = buildExternalAgentCallRepository(driver);
        const { rows } = await driver.query('SELECT call_id FROM external_agent_calls', []);
        const audit = await repo.findById(rows[0].call_id);
        expect(audit.status).toBe('failed');
        expect(audit.errorMessage).toMatch(/503/u);
    });

    test('调用超时 → TimeoutError 并留痕 timeout', async () => {
        global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

        await expect(externalAgentSend.handler(INPUT, { db: driver })).rejects.toThrow(TimeoutError);

        const { rows } = await driver.query('SELECT status FROM external_agent_calls', []);
        expect(rows[0].status).toBe('timeout');
    });

    test('未知 profile 被 schema 拒绝', () => {
        const r = externalAgentSend.paramsSchema.safeParse({ ...INPUT, profile: 'evil' });
        expect(r.success).toBe(false);
    });

    test('schema 拒绝超长 instruction', () => {
        const r = externalAgentSend.paramsSchema.safeParse({ ...INPUT, instruction: 'x'.repeat(12001) });
        expect(r.success).toBe(false);
    });
});
