// [test] ID: T2.8 | Date: 2026-05-18 | Description: LLMClient 单元测试（正常/限流重试/超时/未配置 key）
'use strict';

const { createOpenAIClient, LLMError } = require('../../src/infrastructure/llmClient/openaiClient');
const { TimeoutError } = require('../../src/infrastructure/errors/AppError');

function mockResponse({ status = 200, json } = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => JSON.stringify(json),
    };
}

const OK_PAYLOAD = {
    id: 'cmpl_1',
    model: 'gpt-3.5-turbo',
    choices: [
        {
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'hello', reasoning_content: 'because' },
        },
    ],
    usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 4 },
    },
};

describe('createOpenAIClient.chat', () => {
    test('正常路径：返回归一化结果', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ json: OK_PAYLOAD }));
        const client = createOpenAIClient({ apiKey: 'sk-test', fetchImpl });
        const r = await client.chat({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'hi' }] });
        expect(r.content).toBe('hello');
        expect(r.reasoning_content).toBe('because');
        expect(r.finishReason).toBe('stop');
        expect(r.tokenUsage).toEqual({ prompt: 10, completion: 5, total: 15, cached_prompt_tokens: 4 });
        expect(r.model).toBe('gpt-3.5-turbo');
        expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test('未配置 API key → LLMError', async () => {
        const client = createOpenAIClient({ apiKey: '', fetchImpl: jest.fn() });
        await expect(client.chat({ model: 'm', messages: [] })).rejects.toThrow(LLMError);
    });

    test('429 限流：重试一次后成功', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce(mockResponse({ status: 429, json: { error: 'rate' } }))
            .mockResolvedValueOnce(mockResponse({ json: OK_PAYLOAD }));
        const client = createOpenAIClient({ apiKey: 'sk', fetchImpl });
        const r = await client.chat({ model: 'm', messages: [], retries: 1 });
        expect(r.content).toBe('hello');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('500 错误：重试耗尽抛 LLMError', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 500, json: { error: 'boom' } }));
        const client = createOpenAIClient({ apiKey: 'sk', fetchImpl });
        await expect(client.chat({ model: 'm', messages: [], retries: 1 })).rejects.toThrow(LLMError);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('400 错误：不重试，直接抛错', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(mockResponse({ status: 400, json: { error: 'bad' } }));
        const client = createOpenAIClient({ apiKey: 'sk', fetchImpl });
        await expect(client.chat({ model: 'm', messages: [], retries: 3 })).rejects.toThrow(LLMError);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('AbortError → TimeoutError', async () => {
        const fetchImpl = jest.fn().mockImplementation(() => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            throw err;
        });
        const client = createOpenAIClient({ apiKey: 'sk', fetchImpl });
        await expect(client.chat({ model: 'm', messages: [], retries: 0, timeoutMs: 10 })).rejects.toThrow(
            TimeoutError,
        );
    });

    test('请求体包含可选字段', async () => {
        let captured;
        const fetchImpl = jest.fn().mockImplementation((url, init) => {
            captured = JSON.parse(init.body);
            return Promise.resolve(mockResponse({ json: OK_PAYLOAD }));
        });
        const client = createOpenAIClient({ apiKey: 'sk', fetchImpl });
        await client.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], temperature: 0.7, maxTokens: 100 });
        expect(captured.temperature).toBe(0.7);
        expect(captured.max_tokens).toBe(100);
    });
});
