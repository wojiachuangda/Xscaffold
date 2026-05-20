// [test] ID: V2-AGENT-LOOP | Date: 2026-05-20 | Description: agentRunner agentic loop 单测——tool 调用回灌 / 白名单拒绝 / max_iterations / tool 失败
'use strict';

const { z } = require('zod');

const { runAgentLoop } = require('../../src/agentManager/agentRunner');
const { createRegistry } = require('../../src/toolRegistry/toolRegistry');

function buildRegistry() {
    const reg = createRegistry();
    reg.register({
        name: 'echo',
        description: 'echo back msg',
        paramsSchema: z.object({ msg: z.string() }),
        handler: (params) => ({ echoed: params.msg }),
    });
    reg.register({
        name: 'boom',
        description: 'always throws',
        paramsSchema: z.object({}),
        handler: () => {
            throw new Error('boom failed');
        },
    });
    return reg;
}

function mockLLM(responses) {
    let i = 0;
    return {
        chat: () => {
            const next = responses[i] || { content: 'fallback', toolCalls: [] };
            i += 1;
            return Promise.resolve({
                content: next.content ?? null,
                reasoning_content: null,
                toolCalls: next.toolCalls || [],
                tokenUsage: { prompt: 10, completion: 5, total: 15, cached_prompt_tokens: 0 },
                latencyMs: 1,
            });
        },
    };
}

const AGENT = { id: 'ag_1', name: 'tester', description: 'a test agent', model: 'gpt-x', tools: ['echo'] };

describe('agentRunner.runAgentLoop', () => {
    test('单轮 tool 调用 → observation 回灌 → final', async () => {
        const llmClient = mockLLM([
            { content: null, toolCalls: [{ id: 'c1', name: 'echo', arguments: { msg: 'hi' } }] },
            { content: 'final answer', toolCalls: [] },
        ]);
        const result = await runAgentLoop({
            agent: AGENT,
            prompt: 'say hi',
            deps: { llmClient, toolRegistry: buildRegistry() },
        });

        expect(result.stopReason).toBe('final');
        expect(result.content).toBe('final answer');
        expect(result.turns).toHaveLength(2);
        expect(result.turns[0].observations[0]).toEqual({ name: 'echo', ok: true, data: { echoed: 'hi' } });
        expect(result.tokenUsage.total).toBe(30);
    });

    test('白名单外 tool 调用 → 拒绝不执行', async () => {
        const llmClient = mockLLM([
            { content: null, toolCalls: [{ id: 'c1', name: 'boom', arguments: {} }] },
            { content: 'ok', toolCalls: [] },
        ]);
        const result = await runAgentLoop({
            agent: AGENT,
            prompt: 'do forbidden',
            deps: { llmClient, toolRegistry: buildRegistry() },
        });

        const obs = result.turns[0].observations[0];
        expect(obs.ok).toBe(false);
        expect(obs.error).toMatch(/not allowed/u);
        expect(result.stopReason).toBe('final');
    });

    test('tool 执行抛错 → observation.ok=false 回灌', async () => {
        const agent = { ...AGENT, tools: ['boom'] };
        const llmClient = mockLLM([
            { content: null, toolCalls: [{ id: 'c1', name: 'boom', arguments: {} }] },
            { content: 'recovered', toolCalls: [] },
        ]);
        const result = await runAgentLoop({
            agent,
            prompt: 'trigger boom',
            deps: { llmClient, toolRegistry: buildRegistry() },
        });

        const obs = result.turns[0].observations[0];
        expect(obs.ok).toBe(false);
        expect(obs.error).toMatch(/boom failed/u);
        expect(result.content).toBe('recovered');
    });

    test('LLM 永不收敛 → max_iterations 停', async () => {
        const looping = {
            chat: () =>
                Promise.resolve({
                    content: null,
                    reasoning_content: null,
                    toolCalls: [{ id: 'c', name: 'echo', arguments: { msg: 'x' } }],
                    tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
                    latencyMs: 1,
                }),
        };
        const result = await runAgentLoop({
            agent: AGENT,
            prompt: 'loop forever',
            deps: { llmClient: looping, toolRegistry: buildRegistry() },
            maxIterations: 3,
        });

        expect(result.stopReason).toBe('max_iterations');
        expect(result.turns).toHaveLength(3);
    });

    test('无 tools 的 agent → 退化为纯对话', async () => {
        const agent = { ...AGENT, tools: [] };
        const llmClient = mockLLM([{ content: 'plain reply', toolCalls: [] }]);
        const result = await runAgentLoop({
            agent,
            prompt: 'hello',
            deps: { llmClient, toolRegistry: buildRegistry() },
        });

        expect(result.stopReason).toBe('final');
        expect(result.content).toBe('plain reply');
        expect(result.turns).toHaveLength(1);
    });

    test('LLM 返回 reasoning_content → 下一轮 assistant turn 透传（DeepSeek 协议）', async () => {
        const calls = [];
        const responses = [
            {
                content: null,
                reasoning_content: '<think>I should call echo first.</think>',
                toolCalls: [{ id: 'c1', name: 'echo', arguments: { msg: 'hi' } }],
            },
            { content: 'done', toolCalls: [] },
        ];
        const client = {
            chat: (args) => {
                calls.push(args);
                const next = responses[calls.length - 1] || { content: 'fallback', toolCalls: [] };
                return Promise.resolve({
                    content: next.content ?? null,
                    reasoning_content: next.reasoning_content ?? null,
                    toolCalls: next.toolCalls || [],
                    tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
                    latencyMs: 1,
                });
            },
        };
        await runAgentLoop({
            agent: AGENT,
            prompt: 'go',
            deps: { llmClient: client, toolRegistry: buildRegistry() },
        });

        expect(calls).toHaveLength(2);
        const secondMessages = calls[1].messages;
        const assistantTurn = secondMessages.find((m) => m.role === 'assistant');
        expect(assistantTurn).toBeDefined();
        expect(assistantTurn.reasoning_content).toBe('<think>I should call echo first.</think>');
    });
});
