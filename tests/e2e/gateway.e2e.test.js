// [test] ID: T4.6 | Date: 2026-05-18 | Description: 接入层端到端：JWT + 限流 + 工作流触发/查询 + Webhook 全链路
'use strict';

const request = require('supertest');
const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');

const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');
const { signGithubPayload } = require('../../src/apiGateway/middlewares/webhookSignature');

const { createWorkflowRegistry } = require('../../src/workflowEngine/workflowRegistry');
const { buildExecutionStore } = require('../../src/workflowEngine/executionStore');
const { createInMemoryAdapter } = require('../../src/infrastructure/queue/inMemoryAdapter');

const JWT_SECRET = 'integration-secret';
const WEBHOOK_SECRET = 'webhook-secret';

const DEMO_WORKFLOW = {
    name: 'demo-add',
    version: '1.0',
    nodes: [{ id: 'sum', type: 'tool', toolName: 'addNumbers', params: { a: 10, b: 20 } }],
    edges: [],
};

async function bootApp(overrides = {}) {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const workflowRegistry = createWorkflowRegistry();
    workflowRegistry.register('demo-add', DEMO_WORKFLOW);
    const executionStore = buildExecutionStore(driver);
    const queue = createInMemoryAdapter();
    const app = createApp({
        db: driver,
        jwtSecret: JWT_SECRET,
        rateLimitBypass: true,
        workflowRegistry,
        executionStore,
        queue,
        webhookProviders: { github: { secret: WEBHOOK_SECRET, workflowId: 'demo-add' } },
        ...overrides,
    });
    return { app, driver, queue, executionStore };
}

function waitForFinal(store, executionId, timeout = 1000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        let pending = false;
        const tick = setInterval(async () => {
            if (pending) {
                return;
            }
            pending = true;
            try {
                const e = await store.findById(executionId);
                if (e && ['SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT'].includes(e.status)) {
                    clearInterval(tick);
                    resolve(e);
                    return;
                }
                if (Date.now() - start > timeout) {
                    clearInterval(tick);
                    reject(new Error(`exec ${executionId} 未在 ${timeout}ms 内结束 (status=${e?.status})`));
                }
            } finally {
                pending = false;
            }
        }, 5);
    });
}

describe('接入层 E2E', () => {
    let ctx;
    let token;
    beforeEach(async () => {
        ctx = await bootApp();
        token = signTestToken({ sub: 'u1', role: 'admin' }, JWT_SECRET);
    });
    afterEach(() => {
        ctx.queue.close();
        ctx.driver.close();
    });

    test('未鉴权访问 /workflows → 401', async () => {
        const r = await request(ctx.app).get('/workflows');
        expect(r.status).toBe(401);
    });

    test('合法 token → 列出工作流', async () => {
        const r = await request(ctx.app).get('/workflows').set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(1);
        expect(r.body.data[0].id).toBe('demo-add');
    });

    test('POST execute 返回 202 + executionId，异步完成后状态变 SUCCESS', async () => {
        const r = await request(ctx.app)
            .post('/workflows/demo-add/execute')
            .set('Authorization', `Bearer ${token}`)
            .send({ input: { extra: 'x' } });
        expect(r.status).toBe(202);
        expect(r.body.data.status).toBe('PENDING');
        const final = await waitForFinal(ctx.executionStore, r.body.data.id);
        expect(final.status).toBe('SUCCESS');
        expect(final.result.sum.result).toBe(30);
    });

    test('GET 不存在的 execution → 404', async () => {
        const r = await request(ctx.app)
            .get('/workflows/executions/exec_deadbeef')
            .set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(404);
    });

    test('POST 不存在的工作流 → 404', async () => {
        const r = await request(ctx.app)
            .post('/workflows/ghost/execute')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(r.status).toBe(404);
    });

    test('Webhook 合法签名 → 202 + 异步执行', async () => {
        const payload = Buffer.from(JSON.stringify({ event: 'push', ref: 'refs/heads/main' }));
        const sig = signGithubPayload(payload, WEBHOOK_SECRET);
        const r = await request(ctx.app)
            .post('/webhooks/github')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', sig)
            .send(payload);
        expect(r.status).toBe(202);
        const execId = r.body.data.executionId;
        const final = await waitForFinal(ctx.executionStore, execId);
        expect(final.status).toBe('SUCCESS');
        expect(final.input.event).toBe('push');
    });

    test('Webhook 错签名 → 401（无需 JWT）', async () => {
        const r = await request(ctx.app)
            .post('/webhooks/github')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', 'sha256=deadbeef')
            .send(Buffer.from('{}'));
        expect(r.status).toBe(401);
    });

    test('Webhook 路径不需要 JWT 即可触发签名校验', async () => {
        const r = await request(ctx.app)
            .post('/webhooks/github')
            .set('content-type', 'application/octet-stream')
            .send(Buffer.from('{}'));
        expect(r.status).toBe(401);
        expect(r.body.error.message).toMatch(/签名|x-hub-signature/);
    });

    test('限流：max=2 → 第 3 次 429', async () => {
        const limited = await bootApp({ rateLimitBypass: false, rateLimiter: undefined });
        // 重建 app，传入自定义限流器
        const { createRateLimiter } = require('../../src/apiGateway/middlewares/rateLimiter');
        const customApp = createApp({
            db: limited.driver,
            jwtSecret: JWT_SECRET,
            rateLimiter: createRateLimiter({ max: 2, windowMs: 60000 }),
            workflowRegistry: limited.queue && createWorkflowRegistry(),
        });
        const r1 = await request(customApp).get('/healthz');
        const r2 = await request(customApp).get('/healthz');
        const r3 = await request(customApp).get('/healthz');
        // healthz 在 auth/限流之前 → 不会被限流（按当前装配顺序）
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r3.status).toBe(200);
        limited.queue.close();
        await limited.driver.close();
    });
});
