// [test] ID: T6.3 | Date: 2026-05-18 | Description: PRD 4 个用户故事串联 E2E（MVP 验收基线）
'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const request = require('supertest');

const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');
const { signGithubPayload } = require('../../src/apiGateway/middlewares/webhookSignature');
const { createWorkflowRegistry } = require('../../src/workflowEngine/workflowRegistry');
const { loadFromFile } = require('../../src/configManager/configLoader');

const JWT_SECRET = 'prd-e2e-secret';
const WEBHOOK_SECRET = 'prd-e2e-webhook';
const FIXTURES = path.resolve(__dirname, '../fixtures/workflows');

function buildLLMClient(echoText = 'mock-response') {
    return {
        chat: jest.fn().mockResolvedValue({
            content: echoText,
            reasoning_content: null,
            tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
            latencyMs: 1,
        }),
    };
}

/**
 * 启动一个完整系统，返回 app/db 与可直接操作的 workflowRegistry
 */
function bootSystem(overrides = {}) {
    const db = new Database(':memory:');
    migrate({ db });
    const workflowRegistry = overrides.workflowRegistry || createWorkflowRegistry();
    const app = createApp({
        db,
        jwtSecret: JWT_SECRET,
        rateLimitBypass: true,
        workflowRegistry,
        llmClient: overrides.llmClient || buildLLMClient(),
        webhookProviders: { github: { secret: WEBHOOK_SECRET, workflowId: 'github-flow' } },
    });
    return { app, db, workflowRegistry };
}

function waitForFinal(app, token, executionId, timeout = 2000) {
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
                reject(new Error(`execution ${executionId} 未在 ${timeout}ms 内结束`));
            }
        }, 10);
    });
}

describe('PRD US-01：定义并运行一个 Agent', () => {
    let ctx;
    let token;
    beforeEach(() => {
        ctx = bootSystem();
        token = signTestToken({ sub: 'dev' }, JWT_SECRET);
    });
    afterEach(() => ctx.db.close());

    test('REST 创建 Agent → 立即查询 → 列表可见', async () => {
        const create = await request(ctx.app)
            .post('/agents')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'planner', model: 'gpt-4', tools: ['addNumbers'] });
        expect(create.status).toBe(201);
        const id = create.body.data.id;

        const get = await request(ctx.app).get(`/agents/${id}`).set('Authorization', `Bearer ${token}`);
        expect(get.status).toBe(200);
        expect(get.body.data.name).toBe('planner');

        const list = await request(ctx.app).get('/agents').set('Authorization', `Bearer ${token}`);
        expect(list.body.data.some((a) => a.id === id)).toBe(true);
    });
});

describe('PRD US-02：通过 YAML 配置一个工作流', () => {
    test('YAML 加载 → 注册 → 触发 → 上下游数据传递', async () => {
        const cfg = await loadFromFile(path.join(FIXTURES, 'valid.json'));
        const registry = createWorkflowRegistry();
        registry.register('math-pipeline', cfg);
        const ctx = bootSystem({ workflowRegistry: registry });
        const token = signTestToken({ sub: 'dev' }, JWT_SECRET);

        const trigger = await request(ctx.app)
            .post('/workflows/math-pipeline/execute')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(trigger.status).toBe(202);
        const final = await waitForFinal(ctx.app, token, trigger.body.data.id);
        expect(final.status).toBe('SUCCESS');
        expect(final.result.sum.result).toBe(30);
        expect(final.result.double.result).toBe(60);
        ctx.db.close();
    });

    test('YAML 缺字段 → loadFromFile 抛 ValidationError', async () => {
        const { ValidationError } = require('../../src/infrastructure/errors/AppError');
        await expect(loadFromFile(path.join(FIXTURES, 'invalid_missing_name.yaml'))).rejects.toThrow(ValidationError);
    });
});

describe('PRD US-03：通过 Webhook 触发工作流', () => {
    let ctx;
    beforeEach(() => {
        const registry = createWorkflowRegistry();
        registry.register('github-flow', {
            name: 'github-flow',
            version: '1.0',
            nodes: [{ id: 'sum', type: 'tool', toolName: 'addNumbers', params: { a: 1, b: 1 } }],
            edges: [],
        });
        ctx = bootSystem({ workflowRegistry: registry });
    });
    afterEach(() => ctx.db.close());

    test('合法签名 → 202 + 异步执行成功', async () => {
        const payload = Buffer.from(JSON.stringify({ event: 'push', ref: 'refs/heads/main' }));
        const sig = signGithubPayload(payload, WEBHOOK_SECRET);
        const r = await request(ctx.app)
            .post('/webhooks/github')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', sig)
            .send(payload);
        expect(r.status).toBe(202);
        const token = signTestToken({ sub: 'ops' }, JWT_SECRET);
        const final = await waitForFinal(ctx.app, token, r.body.data.executionId);
        expect(final.status).toBe('SUCCESS');
        expect(final.input.event).toBe('push');
    });

    test('错误签名 → 401', async () => {
        const r = await request(ctx.app)
            .post('/webhooks/github')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', 'sha256=deadbeef')
            .send(Buffer.from('{}'));
        expect(r.status).toBe(401);
    });
});

describe('PRD US-04：查看 AI 的"思考-行动-观察"轨迹', () => {
    test('IOOR + spans 可查询；agent 节点带 profileHash', async () => {
        // 1) 先 boot 干净系统 + 创建 agent，拿到生成的 id
        const registry = createWorkflowRegistry();
        const ctx = bootSystem({ workflowRegistry: registry });
        const token = signTestToken({ sub: 'auditor' }, JWT_SECRET);
        const created = await request(ctx.app)
            .post('/agents')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'planner', model: 'gpt-3.5-turbo', tools: [] });
        const agentId = created.body.data.id;

        // 2) 用真实 agentId 注册工作流（registry 与 ctx 共享）
        registry.register('agent-flow', {
            name: 'agent-flow',
            version: '1.0',
            nodes: [{ id: 'ask', type: 'agent', agentId, input: '查询订单' }],
            edges: [],
        });

        // 3) 触发执行
        const trigger = await request(ctx.app)
            .post('/workflows/agent-flow/execute')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        const final = await waitForFinal(ctx.app, token, trigger.body.data.id);
        expect(final.status).toBe('SUCCESS');

        // 4) 查询 IOOR + spans
        const trace = await request(ctx.app)
            .get(`/workflows/executions/${trigger.body.data.id}/trace`)
            .set('Authorization', `Bearer ${token}`);
        expect(trace.status).toBe(200);
        expect(trace.body.data.executionId).toBe(trigger.body.data.id);
        expect(trace.body.data.ioor.length).toBe(1);
        expect(trace.body.data.ioor[0].profileHash).toMatch(/^[a-f0-9]{64}$/);
        expect(trace.body.data.ioor[0].agentId).toBe(agentId);

        ctx.db.close();
    });

    test('IOOR 中敏感字段被脱敏', async () => {
        const registry = createWorkflowRegistry();
        const ctx = bootSystem({ workflowRegistry: registry });
        const token = signTestToken({ sub: 'auditor' }, JWT_SECRET);
        const ag = await request(ctx.app)
            .post('/agents')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'p2', model: 'gpt-3.5-turbo', tools: [] });
        registry.register('secret-flow', {
            name: 'secret-flow',
            version: '1.0',
            nodes: [{ id: 'q', type: 'agent', agentId: ag.body.data.id, input: '问题: {{question}}' }],
            edges: [],
        });
        const trigger = await request(ctx.app)
            .post('/workflows/secret-flow/execute')
            .set('Authorization', `Bearer ${token}`)
            .send({ input: { question: 'hi', password: 'sk-xyz' } });
        await waitForFinal(ctx.app, token, trigger.body.data.id);
        const trace = await request(ctx.app)
            .get(`/workflows/executions/${trigger.body.data.id}/trace`)
            .set('Authorization', `Bearer ${token}`);
        // password 字段不应出现明文，即使最终 user prompt 是渲染后的字符串
        const ioorStr = JSON.stringify(trace.body.data.ioor);
        expect(ioorStr).not.toContain('"password":"sk-xyz"');
        ctx.db.close();
    });
});
