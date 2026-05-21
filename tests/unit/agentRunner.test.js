// [test] ID: V2.6-LONG-SESSION | Date: 2026-05-22 | Description: runAgentLoop 单元——历史注入 / 落库时序 / abort 收尾 / 后向兼容
'use strict';

const { runAgentLoop } = require('../../src/agentManager/agentRunner');

const AGENT = { id: 'a1', name: 'A', model: 'm', tools: [], description: 'd' };

function captureLLM(contents) {
    const seen = [];
    let i = 0;
    return {
        seen,
        chat: ({ messages }) => {
            seen.push(messages.map((m) => ({ role: m.role, content: m.content })));
            const content = contents[i] ?? 'final';
            i += 1;
            return Promise.resolve({
                content,
                reasoning_content: null,
                toolCalls: [],
                tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
                latencyMs: 1,
            });
        },
    };
}

function memStore({ history = [] } = {}) {
    return {
        saveMessage: jest.fn().mockResolvedValue({ id: 'msg' }),
        getHistory: jest.fn().mockResolvedValue(history),
        countSession: jest.fn().mockResolvedValue(history.length),
        getSessionOwner: jest.fn().mockResolvedValue(null),
    };
}

const toolRegistry = { getTool: jest.fn() };

describe('runAgentLoop 长会话记忆', () => {
    test('F1：前置历史注入到 LLM messages（system + history + 新 user）', async () => {
        const llm = captureLLM(['你好']);
        const store = memStore({
            history: [
                { role: 'user', content: '我叫张三' },
                { role: 'assistant', content: '你叫张三' },
            ],
        });
        await runAgentLoop({
            agent: AGENT,
            prompt: '我叫什么',
            deps: { llmClient: llm, toolRegistry, memoryStore: store },
            ctx: { sessionId: 's1', ownerId: 'u1' },
        });
        expect(llm.seen[0].map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
        expect(llm.seen[0][3].content).toBe('我叫什么');
        expect(store.getHistory).toHaveBeenCalledWith({ sessionId: 's1', ownerId: 'u1', limit: 20 });
    });

    test('F4/F2：user 进 loop 前落库、assistant final 后落库（含 ownerId + stopReason）', async () => {
        const llm = captureLLM(['答复']);
        const store = memStore();
        const res = await runAgentLoop({
            agent: AGENT,
            prompt: 'hi',
            deps: { llmClient: llm, toolRegistry, memoryStore: store },
            ctx: { sessionId: 's', ownerId: 'u1' },
        });
        expect(res.stopReason).toBe('final');
        const saved = store.saveMessage.mock.calls.map((c) => c[0]);
        expect(saved).toHaveLength(2);
        expect(saved[0]).toMatchObject({ role: 'user', content: 'hi', ownerId: 'u1', sessionId: 's' });
        expect(saved[1]).toMatchObject({ role: 'assistant', content: '答复', ownerId: 'u1' });
        expect(saved[1].metadata.stopReason).toBe('final');
    });

    test('F3：无 sessionId → 不触记忆，messages 等价旧版 [system,user]', async () => {
        const llm = captureLLM(['ok']);
        const store = memStore();
        await runAgentLoop({
            agent: AGENT,
            prompt: 'hi',
            deps: { llmClient: llm, toolRegistry, memoryStore: store },
            ctx: {},
        });
        expect(store.saveMessage).not.toHaveBeenCalled();
        expect(store.getHistory).not.toHaveBeenCalled();
        expect(llm.seen[0].map((m) => m.role)).toEqual(['system', 'user']);
    });

    test('F5：shouldAbort 命中 → stopReason=aborted + assistant 落库带 aborted', async () => {
        const llm = captureLLM(['partial']);
        const store = memStore();
        const res = await runAgentLoop({
            agent: AGENT,
            prompt: 'hi',
            deps: { llmClient: llm, toolRegistry, memoryStore: store },
            ctx: { sessionId: 's', ownerId: 'u1' },
            shouldAbort: () => true,
        });
        expect(res.stopReason).toBe('aborted');
        const saved = store.saveMessage.mock.calls.map((c) => c[0]);
        expect(saved[0].role).toBe('user');
        expect(saved[1]).toMatchObject({ role: 'assistant', content: 'partial' });
        expect(saved[1].metadata.stopReason).toBe('aborted');
    });

    test('无 memoryStore → 不崩（兼容旧调用方）', async () => {
        const llm = captureLLM(['ok']);
        const res = await runAgentLoop({
            agent: AGENT,
            prompt: 'hi',
            deps: { llmClient: llm, toolRegistry },
            ctx: { sessionId: 's', ownerId: 'u1' },
        });
        expect(res.content).toBe('ok');
    });
});
