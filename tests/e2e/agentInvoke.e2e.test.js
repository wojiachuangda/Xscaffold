// [test] ID: V2-AGENT-LOOP | Date: 2026-05-20 | Description: POST /agents/:id/invoke 端到端——注入 mock LLM 驱动真实 toolRegistry 调 PA tool
'use strict';

const request = require('supertest');

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');

const JWT_SECRET = 'agent-invoke-secret';

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

async function bootApp(llmClient) {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const app = createApp({ db: driver, jwtSecret: JWT_SECRET, rateLimitBypass: true, llmClient });
    return { app, driver };
}

function authed(req, token) {
    return req.set('Authorization', `Bearer ${token}`);
}

describe('POST /agents/:id/invoke (agentic loop) E2E', () => {
    let ctx;
    let token;

    afterEach(async () => {
        if (ctx?.driver?.close) {
            await ctx.driver.close();
        }
    });

    test('agent 调 taskList → 回灌 → 最终答复', async () => {
        const llm = mockLLM([
            { content: null, toolCalls: [{ id: 'c1', name: 'taskList', arguments: { projectId: 'demo' } }] },
            { content: '项目 demo 当前有任务列表', toolCalls: [] },
        ]);
        ctx = await bootApp(llm);
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);

        // 准备数据：project + 1 task
        await authed(request(ctx.app).put('/projects/demo'), token).send({
            projectId: 'demo',
            phase: 'MVP',
            status: 'active',
            health: 'green',
            completion: 10,
            summary: '',
        });
        await authed(request(ctx.app).post('/projects/demo/tasks'), token).send({
            projectId: 'demo',
            taskId: 't-1',
            title: 'demo task',
        });

        const created = await authed(request(ctx.app).post('/agents'), token).send({
            name: 'pa-helper',
            model: 'gpt-x',
            tools: ['taskList'],
            status: 'enabled',
        });
        const agentId = created.body.data.id;

        const r = await authed(request(ctx.app).post(`/agents/${agentId}/invoke`), token).send({
            prompt: '列出 demo 项目的任务',
        });

        expect(r.status).toBe(200);
        expect(r.body.data.stopReason).toBe('final');
        expect(r.body.data.content).toBe('项目 demo 当前有任务列表');
        expect(r.body.data.turns).toHaveLength(2);
        const obs = r.body.data.turns[0].observations[0];
        expect(obs.name).toBe('taskList');
        expect(obs.ok).toBe(true);
        expect(obs.data.data.total).toBe(1);
    });

    test('agent 调白名单外 tool → 拒绝', async () => {
        const llm = mockLLM([
            {
                content: null,
                toolCalls: [{ id: 'c1', name: 'projectGenerateDigest', arguments: { projectId: 'demo' } }],
            },
            { content: '无法完成', toolCalls: [] },
        ]);
        ctx = await bootApp(llm);
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);

        const created = await authed(request(ctx.app).post('/agents'), token).send({
            name: 'narrow-agent',
            model: 'gpt-x',
            tools: ['taskList'],
            status: 'enabled',
        });

        const r = await authed(request(ctx.app).post(`/agents/${created.body.data.id}/invoke`), token).send({
            prompt: 'generate digest',
        });

        expect(r.status).toBe(200);
        const obs = r.body.data.turns[0].observations[0];
        expect(obs.ok).toBe(false);
        expect(obs.error).toMatch(/not allowed/u);
    });

    test('invoke 不存在的 agent → 404', async () => {
        ctx = await bootApp(mockLLM([]));
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const r = await authed(request(ctx.app).post('/agents/ghost/invoke'), token).send({ prompt: 'hi' });
        expect(r.status).toBe(404);
    });

    test('invoke 空 prompt → 400', async () => {
        ctx = await bootApp(mockLLM([]));
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
        const created = await authed(request(ctx.app).post('/agents'), token).send({
            name: 'a',
            model: 'gpt-x',
            tools: [],
            status: 'enabled',
        });
        const r = await authed(request(ctx.app).post(`/agents/${created.body.data.id}/invoke`), token).send({
            prompt: '',
        });
        expect(r.status).toBe(400);
    });
});
