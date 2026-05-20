// [test] ID: V2-PA-INTEGRATION | Date: 2026-05-20 | Description: Project Assistant 9 个 REST endpoint 端到端（CRUD + 一致性校验 + 分页过滤）
'use strict';

const request = require('supertest');

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');

const JWT_SECRET = 'pa-e2e-secret';

async function bootApp() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const app = createApp({ db: driver, jwtSecret: JWT_SECRET, rateLimitBypass: true });
    return { app, driver };
}

function authed(req, token) {
    return req.set('Authorization', `Bearer ${token}`);
}

describe('Project Assistant REST E2E', () => {
    let ctx;
    let token;

    beforeEach(async () => {
        ctx = await bootApp();
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
    });

    afterEach(async () => {
        if (ctx.driver?.close) {
            await ctx.driver.close();
        }
    });

    test('PUT /projects/:id upsert → GET /projects/:id 取回', async () => {
        const put = await authed(request(ctx.app).put('/projects/demo'), token).send({
            projectId: 'demo',
            phase: 'MVP',
            status: 'active',
            health: 'green',
            completion: 30,
            summary: 'initial summary',
        });
        expect(put.status).toBe(200);
        expect(put.body.data.projectId).toBe('demo');

        const get = await authed(request(ctx.app).get('/projects/demo'), token);
        expect(get.status).toBe(200);
        expect(get.body.data.phase).toBe('MVP');
        expect(get.body.data.completion).toBe(30);
    });

    test('PUT /projects/:id body.projectId 与 URL 不一致 → 400', async () => {
        const r = await authed(request(ctx.app).put('/projects/demo'), token).send({
            projectId: 'other',
            phase: 'MVP',
        });
        expect(r.status).toBe(400);
        expect(r.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('GET /projects/:id 不存在 → 404', async () => {
        const r = await authed(request(ctx.app).get('/projects/ghost'), token);
        expect(r.status).toBe(404);
        expect(r.body.error.code).toBe('NOT_FOUND');
    });

    test('GET /projects 返回 listAll + 分页 meta', async () => {
        await seedProject(ctx, token, 'demo-a', { health: 'green' });
        await seedProject(ctx, token, 'demo-b', { health: 'yellow' });

        const r = await authed(request(ctx.app).get('/projects?limit=10'), token);
        expect(r.status).toBe(200);
        expect(r.body.meta.total).toBe(2);
        expect(r.body.data.map((p) => p.projectId).sort()).toEqual(['demo-a', 'demo-b']);
    });

    test('GET /projects?health=yellow 过滤', async () => {
        await seedProject(ctx, token, 'demo-a', { health: 'green' });
        await seedProject(ctx, token, 'demo-b', { health: 'yellow' });

        const r = await authed(request(ctx.app).get('/projects?health=yellow'), token);
        expect(r.status).toBe(200);
        expect(r.body.meta.total).toBe(1);
        expect(r.body.data[0].projectId).toBe('demo-b');
    });

    test('POST /projects/:id/tasks → GET /projects/:id/tasks', async () => {
        await seedProject(ctx, token, 'demo');
        const post = await authed(request(ctx.app).post('/projects/demo/tasks'), token).send({
            projectId: 'demo',
            taskId: 't-1',
            title: 'First task',
            priority: 'high',
        });
        expect(post.status).toBe(201);
        expect(post.body.data.taskId).toBe('t-1');

        const list = await authed(request(ctx.app).get('/projects/demo/tasks'), token);
        expect(list.status).toBe(200);
        expect(list.body.meta.total).toBe(1);
        expect(list.body.data[0].title).toBe('First task');
    });

    test('GET /projects/:id/tasks?status=open 过滤', async () => {
        await seedProject(ctx, token, 'demo');
        await postTask(ctx, token, 'demo', { taskId: 't-1', title: 'open', status: 'open' });
        await postTask(ctx, token, 'demo', { taskId: 't-2', title: 'done', status: 'done' });

        const r = await authed(request(ctx.app).get('/projects/demo/tasks?status=open'), token);
        expect(r.status).toBe(200);
        expect(r.body.meta.total).toBe(1);
        expect(r.body.data[0].taskId).toBe('t-1');
    });

    test('POST /projects/:id/events → GET /projects/:id/events', async () => {
        await seedProject(ctx, token, 'demo');
        const post = await authed(request(ctx.app).post('/projects/demo/events'), token).send({
            projectId: 'demo',
            type: 'task_completed',
            title: 'closed t-1',
            severity: 'normal',
        });
        expect(post.status).toBe(201);
        expect(post.body.data.eventId).toMatch(/^event_[a-f0-9]+$/u);

        const list = await authed(request(ctx.app).get('/projects/demo/events?limit=10'), token);
        expect(list.status).toBe(200);
        expect(list.body.meta.total).toBe(1);
        expect(list.body.data[0].title).toBe('closed t-1');
    });

    test('POST /projects/:id/reminders → GET /projects/:id/reminders 默认 before 7 天', async () => {
        await seedProject(ctx, token, 'demo');
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const post = await authed(request(ctx.app).post('/projects/demo/reminders'), token).send({
            projectId: 'demo',
            title: 'follow up',
            dueAt: tomorrow,
        });
        expect(post.status).toBe(201);

        const list = await authed(request(ctx.app).get('/projects/demo/reminders'), token);
        expect(list.status).toBe(200);
        expect(list.body.meta.total).toBe(1);
        expect(list.body.data[0].title).toBe('follow up');
    });

    test('POST task 在不存在 project → 404', async () => {
        const r = await authed(request(ctx.app).post('/projects/ghost/tasks'), token).send({
            projectId: 'ghost',
            taskId: 't-1',
            title: 'x',
        });
        expect(r.status).toBe(404);
    });

    test('未鉴权访问 /projects → 401', async () => {
        const r = await request(ctx.app).get('/projects');
        expect(r.status).toBe(401);
    });
});

async function seedProject(ctx, token, projectId, extra = {}) {
    return authed(request(ctx.app).put(`/projects/${projectId}`), token).send({
        projectId,
        phase: 'MVP',
        status: 'active',
        health: 'green',
        completion: 0,
        summary: '',
        ...extra,
    });
}

async function postTask(ctx, token, projectId, payload) {
    return authed(request(ctx.app).post(`/projects/${projectId}/tasks`), token).send({
        projectId,
        ...payload,
    });
}
