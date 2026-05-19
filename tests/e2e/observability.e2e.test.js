// [test] ID: T5.5 | Date: 2026-05-18 | Description: 可观测性端到端（trace 查询 + /metrics）
'use strict';

const request = require('supertest');
const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');

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

async function bootApp(overrides = {}) {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const registry = createWorkflowRegistry();
    registry.register('tool-only', TOOL_WORKFLOW);
    const app = createApp({
        db: driver,
        jwtSecret: JWT_SECRET,
        rateLimitBypass: true,
        workflowRegistry: registry,
        ...overrides,
    });
    return { app, driver };
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
    beforeEach(async () => {
        ctx = await bootApp();
        token = signTestToken({ sub: 'u1' }, JWT_SECRET);
    });
    afterEach(() => ctx.driver.close());

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

    describe('/metrics 强制鉴权（V1.1.2）', () => {
        let guarded;
        beforeEach(async () => {
            guarded = await bootApp({ metricsToken: 'secret-metrics' });
        });
        afterEach(async () => {
            await guarded.driver.close();
        });

        test('无任何凭据 → 401', async () => {
            const r = await request(guarded.app).get('/metrics');
            expect(r.status).toBe(401);
        });

        test('正确 x-metrics-token 头 → 200（兼容保留）', async () => {
            const r = await request(guarded.app).get('/metrics').set('x-metrics-token', 'secret-metrics');
            expect(r.status).toBe(200);
        });

        test('错误 x-metrics-token 值 → 401', async () => {
            const r = await request(guarded.app).get('/metrics').set('x-metrics-token', 'wrong-value');
            expect(r.status).toBe(401);
        });

        test('正确 Authorization: Bearer 头 → 200', async () => {
            const r = await request(guarded.app).get('/metrics').set('Authorization', 'Bearer secret-metrics');
            expect(r.status).toBe(200);
        });

        test('Bearer scheme 大小写兼容 → 200', async () => {
            const r = await request(guarded.app).get('/metrics').set('Authorization', 'bearer secret-metrics');
            expect(r.status).toBe(200);
        });

        test('错误 Bearer token → 401', async () => {
            const r = await request(guarded.app).get('/metrics').set('Authorization', 'Bearer wrong-value');
            expect(r.status).toBe(401);
        });

        test('Authorization 头存在但格式非法 → 401（不回退 x-metrics-token）', async () => {
            const r = await request(guarded.app)
                .get('/metrics')
                .set('Authorization', 'Bearer')
                .set('x-metrics-token', 'secret-metrics');
            expect(r.status).toBe(401);
        });
    });

    test('生产环境缺 METRICS_TOKEN → createApp 启动失败（fail-fast）', async () => {
        const prevEnv = process.env.NODE_ENV;
        const prevToken = process.env.METRICS_TOKEN;
        process.env.NODE_ENV = 'production';
        delete process.env.METRICS_TOKEN;
        try {
            await expect(bootApp()).rejects.toThrow(/METRICS_TOKEN 必须在生产环境配置/);
            // 空字符串同样视为未配置
            await expect(bootApp({ metricsToken: '' })).rejects.toThrow(/METRICS_TOKEN 必须在生产环境配置/);
        } finally {
            process.env.NODE_ENV = prevEnv;
            if (prevToken === undefined) {
                delete process.env.METRICS_TOKEN;
            } else {
                process.env.METRICS_TOKEN = prevToken;
            }
        }
    });
});
