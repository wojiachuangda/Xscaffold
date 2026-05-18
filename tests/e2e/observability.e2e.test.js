// [test] ID: T5.5 | Date: 2026-05-18 | Description: 可观测性端到端（trace 查询 + /metrics）
'use strict';

const Database = require('better-sqlite3');
const request = require('supertest');

const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');
const { createWorkflowRegistry } = require('../../src/workflowEngine/workflowRegistry');

const JWT_SECRET = 'obs-secret';

const TOOL_WORKFLOW = {
    name: 'tool-only',
    version: '1.0',
    nodes: [{ id: 'sum', type: 'tool', toolName: 'addNumbers', params: { a: 2, b: 3 } }],
    edges: [],
};

function bootApp(overrides = {}) {
    const db = new Database(':memory:');
    migrate({ db });
    const registry = createWorkflowRegistry();
    registry.register('tool-only', TOOL_WORKFLOW);
    const app = createApp({
        db,
        jwtSecret: JWT_SECRET,
        rateLimitBypass: true,
        workflowRegistry: registry,
        ...overrides,
    });
    return { app, db };
}

function waitForFinal(app, token, executionId, timeout = 1000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = setInterval(async () => {
            const r = await request(app)
                .get(`/workflows/executions/${executionId}`)
                .set('Authorization', `Bearer ${token}`);
            if (r.body.data && ['SUCCESS', 'FAILED', 'STUCK'].includes(r.body.data.status)) {
                clearInterval(tick);
                resolve(r.body.data);
            } else if (Date.now() - start > timeout) {
                clearInterval(tick);
                reject(new Error('exec timeout'));
            }
        }, 10);
    });
}

describe('可观测性 E2E', () => {
    let ctx;
    let token;
    beforeEach(() => {
        ctx = bootApp();
        token = signTestToken({ sub: 'u1' }, JWT_SECRET);
    });
    afterEach(() => ctx.db.close());

    test('GET /metrics 默认豁免 JWT，返回 Prometheus 文本', async () => {
        const r = await request(ctx.app).get('/metrics');
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toContain('text/plain');
        expect(r.text).toContain('# TYPE');
    });

    test('GET /metrics 含 workflow_duration_ms 后跑一次工作流可见数据', async () => {
        const trigger = await request(ctx.app)
            .post('/workflows/tool-only/execute')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        await waitForFinal(ctx.app, token, trigger.body.data.id);
        const m = await request(ctx.app).get('/metrics');
        expect(m.text).toContain('workflow_duration_ms_count{workflow="tool-only",status="SUCCESS"} 1');
    });

    test('GET /workflows/executions/:id/trace 返回 spans + ioor', async () => {
        const trigger = await request(ctx.app)
            .post('/workflows/tool-only/execute')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        await waitForFinal(ctx.app, token, trigger.body.data.id);
        const r = await request(ctx.app)
            .get(`/workflows/executions/${trigger.body.data.id}/trace`)
            .set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(200);
        expect(r.body.data.executionId).toBe(trigger.body.data.id);
        expect(Array.isArray(r.body.data.spans)).toBe(true);
        expect(Array.isArray(r.body.data.ioor)).toBe(true);
    });

    test('GET /workflows/executions/:id/trace 不存在 → 404', async () => {
        const r = await request(ctx.app)
            .get('/workflows/executions/exec_ffffffff/trace')
            .set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(404);
    });

    test('METRICS_TOKEN 配置后 /metrics 需要正确头', async () => {
        const guarded = bootApp({ metricsToken: 'secret-metrics' });
        const denied = await request(guarded.app).get('/metrics');
        expect(denied.status).toBe(401);
        const allowed = await request(guarded.app).get('/metrics').set('x-metrics-token', 'secret-metrics');
        expect(allowed.status).toBe(200);
        guarded.db.close();
    });
});
