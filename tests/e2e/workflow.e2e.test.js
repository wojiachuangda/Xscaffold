// [test] ID: T2.9 | Date: 2026-05-18 | Description: 工作流端到端测试（Agent + 工具 + 条件分支 + 输出传递）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');

const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildRepository } = require('../../src/agentManager/agentRepository');
const { buildService: buildAgentService } = require('../../src/agentManager/agentService');

const { createRegistry } = require('../../src/toolRegistry/toolRegistry');
const { registerBuiltins } = require('../../src/toolRegistry/builtinTools');

const { createNodeRunner } = require('../../src/workflowEngine/nodeRunner');
const { createWorkflowExecutor } = require('../../src/workflowEngine/workflowExecutor');

async function bootEnv() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const agentService = buildAgentService(buildRepository(driver));
    const toolRegistry = createRegistry();
    registerBuiltins(toolRegistry);

    const llmCalls = [];
    const llmClient = {
        chat: jest.fn().mockImplementation(async ({ messages }) => {
            llmCalls.push(messages);
            // 简单回声 LLM：返回 user message 的内容 + tokens
            const content = messages[messages.length - 1].content;
            return {
                content,
                reasoning_content: null,
                tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
                latencyMs: 1,
                finishReason: 'stop',
                model: 'mock',
            };
        }),
    };

    const nodeRunner = createNodeRunner({ toolRegistry, agentService, llmClient });
    const executor = createWorkflowExecutor(nodeRunner);
    return { driver, agentService, toolRegistry, llmClient, executor, llmCalls };
}

describe('工作流端到端', () => {
    let env;
    beforeEach(async () => {
        env = await bootEnv();
    });
    afterEach(() => env.driver.close());

    test('US-01：两个 Agent 顺序执行，下游读取上游输出', async () => {
        const planner = await env.agentService.createAgent({ name: 'planner', model: 'gpt-3.5-turbo' });
        const executor = await env.agentService.createAgent({ name: 'executor', model: 'gpt-3.5-turbo' });

        const r = await env.executor.execute({
            name: 'two-agents',
            nodes: [
                { id: 'plan', type: 'agent', agentId: planner.id, input: '帮我规划: 学习 React' },
                { id: 'exec', type: 'agent', agentId: executor.id, input: '执行计划: {{plan.content}}' },
            ],
            edges: [{ from: 'plan', to: 'exec' }],
        });

        expect(r.status).toBe('SUCCESS');
        expect(r.context.plan.content).toContain('学习 React');
        expect(r.context.exec.content).toContain('执行计划: 帮我规划: 学习 React');
        expect(env.llmClient.chat).toHaveBeenCalledTimes(2);
    });

    test('US-02：条件分支根据上游输出选择路径', async () => {
        const r = await env.executor.execute({
            name: 'router',
            nodes: [
                { id: 'sum', type: 'tool', toolName: 'addNumbers', params: { a: 10, b: 20 } },
                { id: 'check', type: 'condition', expression: '{{sum.result}} > 15' },
                { id: 'high', type: 'tool', toolName: 'addNumbers', params: { a: 1, b: 1 } },
                { id: 'low', type: 'tool', toolName: 'addNumbers', params: { a: 99, b: 99 } },
            ],
            edges: [
                { from: 'sum', to: 'check' },
                { from: 'check', to: 'high', condition: 'true' },
                { from: 'check', to: 'low', condition: 'false' },
            ],
        });

        expect(r.status).toBe('SUCCESS');
        expect(r.context.sum.result).toBe(30);
        expect(r.context.check.branch).toBe('true');
        expect(r.context.high.result).toBe(2);
        expect(r.context.low).toBeUndefined();
        expect(r.nodeStates.low).toBe('PENDING');
    });

    test('节点失败 → 工作流状态 FAILED + 错误透出', async () => {
        env.llmClient.chat.mockRejectedValue(new Error('mock failure'));
        const a = await env.agentService.createAgent({ name: 'flaky', model: 'gpt-3.5-turbo' });
        const r = await env.executor.execute({
            name: 'fail-case',
            nodes: [{ id: 'n', type: 'agent', agentId: a.id, input: 'hi' }],
            edges: [],
        });
        expect(r.status).toBe('FAILED');
        expect(r.error.message).toContain('mock failure');
        expect(r.nodeStates.n).toBe('FAILED');
    });

    test('工作流定义不合法 → 抛 ValidationError', async () => {
        await expect(
            env.executor.execute({
                name: 'x',
                nodes: [
                    { id: 'a', type: 'agent', agentId: 'p' },
                    { id: 'b', type: 'agent', agentId: 'p' },
                ],
                edges: [
                    { from: 'a', to: 'b' },
                    { from: 'b', to: 'a' },
                ],
            }),
        ).rejects.toThrow(/工作流定义不合法/);
    });

    test('工具节点参数模板渲染', async () => {
        const r = await env.executor.execute({
            name: 'tpl',
            nodes: [
                { id: 'first', type: 'tool', toolName: 'addNumbers', params: { a: 5, b: 7 } },
                {
                    id: 'second',
                    type: 'tool',
                    toolName: 'addNumbers',
                    params: { a: '{{first.result}}', b: 100 },
                },
            ],
            edges: [{ from: 'first', to: 'second' }],
        });
        expect(r.context.first.result).toBe(12);
        expect(r.context.second.result).toBe(112);
    });
});
