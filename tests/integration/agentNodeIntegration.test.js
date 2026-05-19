// [test] ID: T5.2 | Date: 2026-05-19 | Description: runAgentNode 集成测试（A.1 async；记忆注入 + IOOR 记录 + 自愈触发 STUCK）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');

const { migrate } = require('../../src/infrastructure/database/migrate');
const { createNodeRunner } = require('../../src/workflowEngine/nodeRunner');
const { buildMemoryRepository } = require('../../src/memoryManager/memoryRepository');
const { buildMemoryStore } = require('../../src/memoryManager/memoryStore');
const { buildIoorRepository } = require('../../src/observability/ioorRepository');
const { buildAuditRepository } = require('../../src/domain/audit/auditRepository');
const { createIoorRecorder } = require('../../src/observability/ioorRecorder');

async function bootEnv(overrides = {}) {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const memoryStore = buildMemoryStore(buildMemoryRepository(driver));
    const ioorRecorder = createIoorRecorder({
        ioorRepository: buildIoorRepository(driver),
        auditRepository: buildAuditRepository(driver),
    });
    const ioorRepository = buildIoorRepository(driver);

    const llmClient = overrides.llmClient || {
        chat: jest.fn().mockResolvedValue({
            content: 'echo',
            reasoning_content: null,
            tokenUsage: { prompt: 5, completion: 3, total: 8, cached_prompt_tokens: 1 },
            latencyMs: 12,
        }),
    };
    const agentService = {
        getAgentById: jest.fn().mockResolvedValue({
            id: 'a1',
            model: 'gpt-4',
            tools: ['x', 'y'],
        }),
    };
    const runner = createNodeRunner({
        agentService,
        llmClient,
        toolRegistry: null,
        memoryStore,
        ioorRecorder,
    });
    return { driver, runner, llmClient, agentService, memoryStore, ioorRepository };
}

describe('runAgentNode + 记忆注入', () => {
    let env;
    beforeEach(async () => {
        env = await bootEnv();
    });
    afterEach(() => env.driver.close());

    test('首次执行：无历史，落 user+assistant 消息', async () => {
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: '你好' };
        const ctx = { sessionId: 'sess-1', executionId: 'exec-1' };
        const r = await env.runner.runNode(node, ctx);
        expect(r.content).toBe('echo');
        const history = await env.memoryStore.getHistory({ sessionId: 'sess-1' });
        expect(history).toHaveLength(2);
        expect(history[0].role).toBe('user');
        expect(history[0].content).toBe('你好');
        expect(history[1].role).toBe('assistant');
    });

    test('第二次执行：历史被注入到 LLM messages', async () => {
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: '继续' };
        const ctx = { sessionId: 'sess-2', executionId: 'exec-1' };
        await env.runner.runNode(node, ctx);
        await env.runner.runNode(node, ctx);
        const secondCall = env.llmClient.chat.mock.calls[1][0];
        expect(secondCall.messages.length).toBeGreaterThan(1); // 含历史
        // 第二次调用应至少包含上一轮的 user + assistant
        const roles = secondCall.messages.map((m) => m.role);
        expect(roles).toEqual(expect.arrayContaining(['user', 'assistant']));
    });

    test('不同 session 互不可见', async () => {
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: '问' };
        await env.runner.runNode(node, { sessionId: 's-A', executionId: 'e1' });
        await env.runner.runNode(node, { sessionId: 's-B', executionId: 'e2' });
        expect(await env.memoryStore.getHistory({ sessionId: 's-A' })).toHaveLength(2);
        expect(await env.memoryStore.getHistory({ sessionId: 's-B' })).toHaveLength(2);
    });
});

describe('runAgentNode + IOOR 记录', () => {
    let env;
    beforeEach(async () => {
        env = await bootEnv();
    });
    afterEach(() => env.driver.close());

    test('每次执行产生一条 IOOR，含 profileHash 与 token usage', async () => {
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: 'hi' };
        const ctx = { sessionId: 's', executionId: 'exec-A' };
        await env.runner.runNode(node, ctx);
        const records = await env.ioorRepository.listByExecution('exec-A');
        expect(records).toHaveLength(1);
        expect(records[0].agentId).toBe('a1');
        expect(records[0].profileHash).toMatch(/^[a-f0-9]{64}$/);
        expect(records[0].tokenUsage.cached_prompt_tokens).toBe(1);
    });

    test('IOOR 持久化的 input.messages 中包含 user prompt', async () => {
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: '查询订单' };
        await env.runner.runNode(node, { sessionId: 's', executionId: 'exec-B' });
        const records = await env.ioorRepository.listByExecution('exec-B');
        const msgs = records[0].input.messages;
        expect(msgs[msgs.length - 1].content).toBe('查询订单');
    });

    test('无 executionId 时不写 IOOR', async () => {
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: 'hi' };
        await env.runner.runNode(node, { sessionId: 's' });
        expect(await env.ioorRepository.listByExecution('')).toEqual([]);
    });
});

describe('runAgentNode + 自愈与 STUCK', () => {
    test('LLM 持续返回空字符串 → 自愈耗尽 → 抛 STUCK', async () => {
        const llmClient = {
            chat: jest.fn().mockResolvedValue({
                content: '',
                reasoning_content: null,
                tokenUsage: { prompt: 1, completion: 0, total: 1, cached_prompt_tokens: 0 },
                latencyMs: 1,
            }),
        };
        const env = await bootEnv({ llmClient });
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: 'hi' };
        await expect(env.runner.runNode(node, { executionId: 'exec-X', sessionId: 's' })).rejects.toMatchObject({
            code: 'STUCK',
        });
        // 总调用 = 1 首次 + 2 自愈 = 3
        expect(llmClient.chat).toHaveBeenCalledTimes(3);
        env.driver.close();
    });

    test('首次空 + 二次成功 → 不抛错', async () => {
        const llmClient = {
            chat: jest
                .fn()
                .mockResolvedValueOnce({
                    content: '',
                    reasoning_content: null,
                    tokenUsage: { prompt: 1, completion: 0, total: 1, cached_prompt_tokens: 0 },
                    latencyMs: 1,
                })
                .mockResolvedValueOnce({
                    content: 'recovered',
                    reasoning_content: null,
                    tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
                    latencyMs: 2,
                }),
        };
        const env = await bootEnv({ llmClient });
        const node = { id: 'n', type: 'agent', agentId: 'a1', input: 'hi' };
        const r = await env.runner.runNode(node, { executionId: 'e', sessionId: 's' });
        expect(r.content).toBe('recovered');
        expect(r.attempts).toBe(2);
        env.driver.close();
    });
});
