// [test] ID: V2.2-SSE | Date: 2026-05-21 | Description: POST /agents/:id/invoke/stream 集成——SSE 事件序列 / 传输脱敏 / 错误降级
'use strict';

const request = require('supertest');

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');

const JWT_SECRET = 'sse-stream-secret';

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
                tokenUsage: { prompt: 8, completion: 4, total: 12, cached_prompt_tokens: 0 },
                latencyMs: 1,
            });
        },
    };
}

function failingLLM() {
    return { chat: () => Promise.reject(new Error('LLM down')) };
}

async function bootApp(llmClient) {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const app = createApp({ db: driver, jwtSecret: JWT_SECRET, rateLimitBypass: true, llmClient });
    return { app, driver };
}

function authed(req, token) {
    return req.set('Authorization', `Bearer ${token}`);
}

function parseSse(text) {
    return String(text)
        .split('\n\n')
        .map((block) => block.trim())
        .filter((block) => block.length > 0 && !block.startsWith(':'))
        .map((block) => {
            const line = block.split('\n').find((l) => l.startsWith('data:'));
            return line ? JSON.parse(line.slice(line.indexOf(':') + 1).trim()) : null;
        })
        .filter((event) => event !== null);
}

async function createAgent(ctx, token, tools) {
    const created = await authed(request(ctx.app).post('/agents'), token).send({
        name: 'sse-agent',
        model: 'gpt-x',
        tools,
        status: 'enabled',
    });
    return created.body.data.id;
}

describe('POST /agents/:id/invoke/stream (SSE) 集成', () => {
    let ctx;
    let token;

    afterEach(async () => {
        if (ctx?.driver?.close) {
            await ctx.driver.close();
        }
    });

    test('流式 invoke → start / turn×N / done 事件序列', async () => {
        ctx = await bootApp(
            mockLLM([
                { content: null, toolCalls: [{ id: 'c1', name: 'taskList', arguments: { projectId: 'demo' } }] },
                { content: '完成', toolCalls: [] },
            ]),
        );
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const agentId = await createAgent(ctx, token, ['taskList']);

        const r = await authed(request(ctx.app).post(`/agents/${agentId}/invoke/stream`), token)
            .buffer(true)
            .send({ prompt: '列出任务' });

        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toMatch(/text\/event-stream/u);
        const events = parseSse(r.text);
        expect(events[0].type).toBe('start');
        expect(events.filter((e) => e.type === 'turn')).toHaveLength(2);
        expect(events[events.length - 1].type).toBe('done');
        expect(events[events.length - 1].stopReason).toBe('final');
        expect(events[events.length - 1].turnCount).toBe(2);
    });

    test('传输脱敏：toolCalls.arguments 敏感键在 SSE 流里被 [REDACTED]', async () => {
        ctx = await bootApp(
            mockLLM([
                {
                    content: null,
                    toolCalls: [
                        { id: 'c1', name: 'taskList', arguments: { projectId: 'demo', apiKey: 'sk-LEAK-me-now' } },
                    ],
                },
                { content: 'ok', toolCalls: [] },
            ]),
        );
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const agentId = await createAgent(ctx, token, ['taskList']);

        const r = await authed(request(ctx.app).post(`/agents/${agentId}/invoke/stream`), token)
            .buffer(true)
            .send({ prompt: 'x' });

        expect(r.status).toBe(200);
        expect(r.text).not.toContain('sk-LEAK-me-now');
        expect(r.text).toContain('[REDACTED]');
        const turn = parseSse(r.text).find((e) => e.type === 'turn');
        expect(turn.toolCalls[0].arguments.apiKey).toBe('[REDACTED]');
        expect(turn.toolCalls[0].arguments.projectId).toBe('demo');
    });

    test('loop 抛错 → error 事件而非挂起', async () => {
        ctx = await bootApp(failingLLM());
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const agentId = await createAgent(ctx, token, []);

        const r = await authed(request(ctx.app).post(`/agents/${agentId}/invoke/stream`), token)
            .buffer(true)
            .send({ prompt: 'x' });

        expect(r.status).toBe(200);
        const events = parseSse(r.text);
        expect(events.some((e) => e.type === 'start')).toBe(true);
        const errorEvent = events.find((e) => e.type === 'error');
        expect(errorEvent).toBeDefined();
        expect(errorEvent.message).toMatch(/LLM down/u);
    });

    test('不存在的 agent → 404 JSON（开流前，未进 SSE）', async () => {
        ctx = await bootApp(mockLLM([]));
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const r = await authed(request(ctx.app).post('/agents/ghost/invoke/stream'), token).send({ prompt: 'x' });
        expect(r.status).toBe(404);
    });
});
