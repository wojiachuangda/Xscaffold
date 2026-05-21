// [test] ID: V2.6-LONG-SESSION | Date: 2026-05-22 | Description: 长会话能力 DoD E2E——记忆/截断/跨用户隔离/后向兼容/指标
'use strict';

const request = require('supertest');

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildMemoryRepository } = require('../../src/memoryManager/memoryRepository');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');

const JWT_SECRET = 'long-session-secret';

// 从历史里抽「我叫X」证明历史被注入；同时记录每轮收到的 messages 供截断断言
function recallLLM() {
    const seen = [];
    return {
        seen,
        lastLen: () => (seen.length ? seen[seen.length - 1].length : 0),
        chat: ({ messages }) => {
            seen.push(messages);
            const joined = messages.map((m) => m.content || '').join('\n');
            const m = joined.match(/我叫([一-龥A-Za-z]+)/u);
            return Promise.resolve({
                content: m ? `你叫${m[1]}` : '你好',
                reasoning_content: null,
                toolCalls: [],
                tokenUsage: { prompt: 8, completion: 4, total: 12, cached_prompt_tokens: 0 },
                latencyMs: 1,
            });
        },
    };
}

async function bootApp(llmClient) {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const app = createApp({ db: driver, jwtSecret: JWT_SECRET, rateLimitBypass: true, llmClient });
    return { app, driver };
}

const authed = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function createAgent(app, token, name = 'mem-agent') {
    const r = await authed(request(app).post('/agents'), token).send({
        name,
        model: 'gpt-x',
        tools: [],
        status: 'enabled',
    });
    return r.body.data.id;
}

describe('长会话能力 E2E (DoD)', () => {
    let ctx;
    afterEach(async () => {
        if (ctx?.driver?.close) {
            await ctx.driver.close();
        }
    });

    test('D1 基本记忆：同 session 第二轮答复包含首轮提供的名字', async () => {
        ctx = await bootApp(recallLLM());
        const token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const agentId = await createAgent(ctx.app, token);

        await authed(request(ctx.app).post(`/agents/${agentId}/invoke`), token).send({
            prompt: '我叫张三',
            sessionId: 'sess-d1',
        });
        const r2 = await authed(request(ctx.app).post(`/agents/${agentId}/invoke`), token).send({
            prompt: '我叫什么名字',
            sessionId: 'sess-d1',
        });

        expect(r2.status).toBe(200);
        expect(r2.body.data.content).toContain('张三');
    });

    test('D2 后向兼容：不带 sessionId → 成功且不落库任何消息', async () => {
        ctx = await bootApp(recallLLM());
        const token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const agentId = await createAgent(ctx.app, token);

        const r = await authed(request(ctx.app).post(`/agents/${agentId}/invoke`), token).send({ prompt: 'hi' });
        expect(r.status).toBe(200);

        const { rows } = await ctx.driver.query('SELECT COUNT(*) AS n FROM messages', []);
        expect(Number(rows[0].n)).toBe(0);
    });

    test('D3 截断：80 条历史 → 调用成功且 LLM 实收 messages ≤ 窗口阈值', async () => {
        const llm = recallLLM();
        ctx = await bootApp(llm);
        const token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const agentId = await createAgent(ctx.app, token);

        // 直接灌 80 条历史（ownerId 必须等于 JWT sub=u1）
        const repo = buildMemoryRepository(ctx.driver);
        for (let i = 0; i < 80; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await repo.insert({
                sessionId: 'big',
                ownerId: 'u1',
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `turn-${i}`,
            });
        }

        const r = await authed(request(ctx.app).post(`/agents/${agentId}/invoke`), token).send({
            prompt: '继续',
            sessionId: 'big',
        });

        expect(r.status).toBe(200);
        // system(1) + 最近 20 条窗口 + 新 user(1) = 22；远小于 80+
        expect(llm.lastLen()).toBeLessThanOrEqual(22);
        expect(llm.lastLen()).toBeGreaterThan(2);
    });

    test('D5 跨用户隔离：u2 用自己 agent 访问 u1 的 session → 404，不返 u1 历史', async () => {
        ctx = await bootApp(recallLLM());
        const tokenA = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const tokenB = signTestToken({ sub: 'u2', role: 'admin' }, JWT_SECRET);
        const agentA = await createAgent(ctx.app, tokenA, 'agent-a');
        const agentB = await createAgent(ctx.app, tokenB, 'agent-b');

        // u1 在 session shared 建立归属（含含密语「我叫张三」）
        await authed(request(ctx.app).post(`/agents/${agentA}/invoke`), tokenA).send({
            prompt: '我叫张三',
            sessionId: 'shared',
        });

        // u2 用自己的 agent 访问同一 sessionId → 归属校验 404
        const r = await authed(request(ctx.app).post(`/agents/${agentB}/invoke`), tokenB).send({
            prompt: '我叫什么名字',
            sessionId: 'shared',
        });

        expect(r.status).toBe(404);
        expect(JSON.stringify(r.body)).not.toContain('张三');
    });

    test('D6 观测：带 sessionId invoke 后 /metrics 可见两个长会话指标', async () => {
        ctx = await bootApp(recallLLM());
        const token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const agentId = await createAgent(ctx.app, token);

        await authed(request(ctx.app).post(`/agents/${agentId}/invoke`), token).send({
            prompt: '我叫张三',
            sessionId: 'sess-d6',
        });

        const m = await request(ctx.app).get('/metrics');
        expect(m.status).toBe(200);
        expect(m.text).toContain('llm_history_messages_loaded');
        expect(m.text).toContain('llm_history_truncated_total');
        expect(m.text).toMatch(/llm_history_messages_loaded_count\s+\d+/u);
    });
});
