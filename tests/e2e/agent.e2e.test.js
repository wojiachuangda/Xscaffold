// [test] ID: T1.7 | Date: 2026-05-18 | Description: Agent CRUD 端到端冒烟测试（创建→查询→更新→删除全流程）
'use strict';

const Database = require('better-sqlite3');
const request = require('supertest');

const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildRepository } = require('../../src/agentManager/agentRepository');

function bootApp() {
    const db = new Database(':memory:');
    migrate({ db });
    const app = createApp({
        agentRepository: buildRepository(db),
        db,
        authDisabled: true,
        rateLimitBypass: true,
    });
    return { app, db };
}

describe('Agent CRUD E2E', () => {
    let ctx;
    beforeEach(() => {
        ctx = bootApp();
    });
    afterEach(() => ctx.db.close());

    test('健康检查', async () => {
        const r = await request(ctx.app).get('/healthz');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({
            success: true,
            data: expect.objectContaining({ status: 'ok' }),
            error: null,
        });
    });

    test('完整 CRUD 流程', async () => {
        // CREATE
        const createRes = await request(ctx.app)
            .post('/agents')
            .send({ name: 'planner', description: '规划师', model: 'gpt-4', tools: ['t1'] });
        expect(createRes.status).toBe(201);
        expect(createRes.body.success).toBe(true);
        const id = createRes.body.data.id;
        expect(id).toMatch(/^agent_/);

        // GET by id
        const getRes = await request(ctx.app).get(`/agents/${id}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.data.name).toBe('planner');

        // LIST
        const listRes = await request(ctx.app).get('/agents');
        expect(listRes.status).toBe(200);
        expect(listRes.body.data).toHaveLength(1);
        expect(listRes.body.meta).toEqual(expect.objectContaining({ total: 1, limit: 50, offset: 0 }));

        // UPDATE
        const updRes = await request(ctx.app).put(`/agents/${id}`).send({ status: 'disabled' });
        expect(updRes.status).toBe(200);
        expect(updRes.body.data.status).toBe('disabled');

        // DELETE
        const delRes = await request(ctx.app).delete(`/agents/${id}`);
        expect(delRes.status).toBe(200);
        expect(delRes.body.data).toEqual({ id });

        // GET after delete → 404
        const after = await request(ctx.app).get(`/agents/${id}`);
        expect(after.status).toBe(404);
        expect(after.body.error.code).toBe('NOT_FOUND');
    });

    test('400 - 入参不合法', async () => {
        const r = await request(ctx.app).post('/agents').send({ model: 'gpt-4' });
        expect(r.status).toBe(400);
        expect(r.body.error.code).toBe('VALIDATION_ERROR');
        expect(r.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'name' })]));
    });

    test('409 - 名称冲突', async () => {
        await request(ctx.app).post('/agents').send({ name: 'dup', model: 'm' });
        const r = await request(ctx.app).post('/agents').send({ name: 'dup', model: 'm' });
        expect(r.status).toBe(409);
        expect(r.body.error.code).toBe('CONFLICT');
    });

    test('404 - 资源不存在', async () => {
        const r = await request(ctx.app).get('/agents/nonexistent');
        expect(r.status).toBe(404);
    });

    test('404 - 未知路径走 notFoundHandler', async () => {
        const r = await request(ctx.app).get('/unknown');
        expect(r.status).toBe(404);
        expect(r.body.error.message).toContain('/unknown');
    });

    test('列表过滤 status=enabled', async () => {
        await request(ctx.app).post('/agents').send({ name: 'a1', model: 'm', status: 'enabled' });
        await request(ctx.app).post('/agents').send({ name: 'a2', model: 'm', status: 'disabled' });
        const r = await request(ctx.app).get('/agents?status=enabled');
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(1);
        expect(r.body.data[0].name).toBe('a1');
    });
});
