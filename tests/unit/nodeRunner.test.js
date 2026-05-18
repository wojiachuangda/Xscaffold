// [test] ID: T2.6 | Date: 2026-05-18 | Description: nodeRunner 单元测试（4 种节点类型 × 成功/超时/重试）
'use strict';

const { createNodeRunner } = require('../../src/workflowEngine/nodeRunner');
const { createRegistry } = require('../../src/toolRegistry/toolRegistry');
const addNumbers = require('../../src/toolRegistry/builtinTools/addNumbers');
const { TimeoutError } = require('../../src/infrastructure/errors/AppError');

function buildDeps(overrides = {}) {
    const toolRegistry = overrides.toolRegistry || createRegistry();
    if (!overrides.toolRegistry) {
        toolRegistry.register(addNumbers);
    }
    return {
        toolRegistry,
        agentService: overrides.agentService || {
            getAgentById: jest.fn().mockReturnValue({ id: 'a1', model: 'gpt-3.5-turbo' }),
        },
        llmClient: overrides.llmClient || {
            chat: jest.fn().mockResolvedValue({
                content: 'hi',
                reasoning_content: null,
                tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
                latencyMs: 5,
            }),
        },
    };
}

describe('runToolNode', () => {
    test('参数模板插值后调用工具', async () => {
        const deps = buildDeps();
        const runner = createNodeRunner(deps);
        const r = await runner.runNode(
            { id: 'n', type: 'tool', toolName: 'addNumbers', params: { a: '{{x}}', b: '{{y}}' } },
            { x: 2, y: 3 },
        );
        expect(r).toEqual({ result: 5 });
    });

    test('数字字面量保持类型', async () => {
        const deps = buildDeps();
        const runner = createNodeRunner(deps);
        const r = await runner.runNode({ id: 'n', type: 'tool', toolName: 'addNumbers', params: { a: 10, b: 5 } }, {});
        expect(r).toEqual({ result: 15 });
    });

    test('超时触发 TimeoutError', async () => {
        const reg = createRegistry();
        reg.register({
            name: 'slow',
            paramsSchema: require('zod').z.object({}).passthrough(),
            handler: () => new Promise((res) => setTimeout(res, 100)),
        });
        const runner = createNodeRunner(buildDeps({ toolRegistry: reg }));
        await expect(
            runner.runNode({ id: 'n', type: 'tool', toolName: 'slow', params: {}, timeoutMs: 20 }, {}),
        ).rejects.toThrow(TimeoutError);
    });

    test('失败时按 retry.maxAttempts 重试', async () => {
        const reg = createRegistry();
        let calls = 0;
        reg.register({
            name: 'flaky',
            paramsSchema: require('zod').z.object({}).passthrough(),
            handler: async () => {
                calls += 1;
                if (calls < 3) {
                    throw new Error('boom');
                }
                return { ok: true };
            },
        });
        const runner = createNodeRunner(buildDeps({ toolRegistry: reg }));
        const r = await runner.runNode(
            {
                id: 'n',
                type: 'tool',
                toolName: 'flaky',
                params: {},
                retry: { maxAttempts: 3, backoffMs: 1 },
            },
            {},
        );
        expect(r).toEqual({ ok: true });
        expect(calls).toBe(3);
    });

    test('重试耗尽抛错', async () => {
        const reg = createRegistry();
        reg.register({
            name: 'always-fail',
            paramsSchema: require('zod').z.object({}).passthrough(),
            handler: async () => {
                throw new Error('boom');
            },
        });
        const runner = createNodeRunner(buildDeps({ toolRegistry: reg }));
        await expect(
            runner.runNode(
                {
                    id: 'n',
                    type: 'tool',
                    toolName: 'always-fail',
                    params: {},
                    retry: { maxAttempts: 2, backoffMs: 1 },
                },
                {},
            ),
        ).rejects.toThrow(/boom/);
    });
});

describe('runAgentNode', () => {
    test('调用 agentService + llmClient', async () => {
        const deps = buildDeps();
        const runner = createNodeRunner(deps);
        const r = await runner.runNode({ id: 'n', type: 'agent', agentId: 'a1', input: '问题: {{q}}' }, { q: '世界' });
        expect(deps.agentService.getAgentById).toHaveBeenCalledWith('a1');
        expect(deps.llmClient.chat).toHaveBeenCalledWith({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: '问题: 世界' }],
        });
        expect(r.content).toBe('hi');
        expect(r.agentId).toBe('a1');
    });

    test('input 为对象时 JSON 序列化', async () => {
        const deps = buildDeps();
        const runner = createNodeRunner(deps);
        await runner.runNode({ id: 'n', type: 'agent', agentId: 'a1', input: { q: '{{x}}' } }, { x: 42 });
        expect(deps.llmClient.chat.mock.calls[0][0].messages[0].content).toBe(JSON.stringify({ q: 42 }));
    });
});

describe('runConditionNode', () => {
    test('true 分支', async () => {
        const runner = createNodeRunner(buildDeps());
        const r = await runner.runNode({ id: 'c', type: 'condition', expression: '{{score}} > 0.5' }, { score: 0.8 });
        expect(r).toEqual({ branch: 'true', value: true });
    });

    test('false 分支', async () => {
        const runner = createNodeRunner(buildDeps());
        const r = await runner.runNode({ id: 'c', type: 'condition', expression: '{{score}} > 0.5' }, { score: 0.1 });
        expect(r).toEqual({ branch: 'false', value: false });
    });
});

describe('runCodeNode', () => {
    test('模板渲染输出', async () => {
        const runner = createNodeRunner(buildDeps());
        const r = await runner.runNode({ id: 'n', type: 'code', code: 'hello {{name}}' }, { name: 'bob' });
        expect(r).toEqual({ output: 'hello bob' });
    });
});

describe('未知节点类型', () => {
    test('抛 ValidationError', async () => {
        const runner = createNodeRunner(buildDeps());
        await expect(runner.runNode({ id: 'x', type: 'unknown' }, {})).rejects.toThrow(/未知节点类型/);
    });
});
