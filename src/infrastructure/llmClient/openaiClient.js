// [scaffold] ID: T2.8 | Date: 2026-05-18 | Description: OpenAI 兼容 Chat Completion 客户端（IOOR 元数据抓取 + 重试 + 超时）
'use strict';

const { TimeoutError, AppError } = require('../errors/AppError');

const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 30000;

class LLMError extends AppError {
    constructor(message, { status, body, cause } = {}) {
        super(message, {
            code: 'LLM_ERROR',
            status: 502,
            details: { upstreamStatus: status, body },
            cause,
        });
    }
}

/**
 * 创建 LLM 客户端
 * @param {object} options
 * @param {string} [options.apiKey]      OPENAI_API_KEY
 * @param {string} [options.baseUrl]     默认 https://api.openai.com/v1
 * @param {Function} [options.fetchImpl] 注入自定义 fetch（测试用）
 */
function createOpenAIClient(options = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const fetchImpl = options.fetchImpl ?? global.fetch;

    async function chat({ model, messages, temperature, maxTokens, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 }) {
        if (!apiKey) {
            throw new LLMError('OPENAI_API_KEY 未配置');
        }
        const body = buildRequestBody({ model, messages, temperature, maxTokens });
        return await invokeWithRetry({ fetchImpl, baseUrl, apiKey, body, timeoutMs, retries });
    }

    return { chat };
}

function buildRequestBody({ model, messages, temperature, maxTokens }) {
    const body = { model, messages };
    if (temperature !== undefined) {
        body.temperature = temperature;
    }
    if (maxTokens !== undefined) {
        body.max_tokens = maxTokens;
    }
    return body;
}

async function invokeWithRetry({ fetchImpl, baseUrl, apiKey, body, timeoutMs, retries }) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await invokeOnce({ fetchImpl, baseUrl, apiKey, body, timeoutMs });
        } catch (err) {
            lastError = err;
            if (!isRetryable(err) || attempt === retries) {
                throw err;
            }
            await sleep(Math.min(2 ** attempt * 500, 4000));
        }
    }
    throw lastError;
}

async function invokeOnce({ fetchImpl, baseUrl, apiKey, body, timeoutMs }) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    timer.unref?.();
    const startedAt = Date.now();
    try {
        const res = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: ctl.signal,
        });
        const latencyMs = Date.now() - startedAt;
        return await handleResponse(res, latencyMs, body);
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new TimeoutError(`LLM 调用超时 ${timeoutMs}ms`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function handleResponse(res, latencyMs, requestBody) {
    const text = await res.text();
    if (!res.ok) {
        throw new LLMError(`LLM 调用失败: ${res.status}`, { status: res.status, body: text });
    }
    const payload = JSON.parse(text);
    return normalizeChatResponse(payload, latencyMs, requestBody);
}

function normalizeChatResponse(payload, latencyMs, requestBody) {
    const choice = payload.choices?.[0] ?? {};
    const message = choice.message ?? {};
    return {
        content: message.content ?? '',
        reasoning_content: message.reasoning_content ?? null,
        finishReason: choice.finish_reason ?? null,
        tokenUsage: extractTokenUsage(payload.usage),
        model: payload.model ?? requestBody.model,
        latencyMs,
        raw: payload,
    };
}

function extractTokenUsage(usage) {
    return {
        prompt: usage?.prompt_tokens ?? 0,
        completion: usage?.completion_tokens ?? 0,
        total: usage?.total_tokens ?? 0,
        cached_prompt_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };
}

function isRetryable(err) {
    if (err instanceof TimeoutError) {
        return true;
    }
    if (err instanceof LLMError) {
        const s = err.details?.upstreamStatus;
        return s === 429 || (s >= 500 && s < 600);
    }
    return false;
}

function sleep(ms) {
    return new Promise((r) => {
        const t = setTimeout(r, ms);
        t.unref?.();
    });
}

module.exports = { createOpenAIClient, LLMError };
