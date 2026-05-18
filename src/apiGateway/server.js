// [scaffold] ID: T1.6+T4.x+T5.x | Date: 2026-05-18 | Description: Express 应用工厂——装配中间件、路由、错误处理、可观测性
'use strict';

const express = require('express');

const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { createAuthMiddleware } = require('./middlewares/authMiddleware');
const { createRateLimiter } = require('./middlewares/rateLimiter');
const { success } = require('./response/envelope');

const { buildRouter: buildAgentRouter } = require('../agentManager/agentController');
const { buildService } = require('../agentManager/agentService');
const { buildRepository } = require('../agentManager/agentRepository');

const { buildWorkflowRouter } = require('./controllers/workflowController');
const { buildWebhookRouter } = require('./controllers/webhookController');
const { buildExecutionTraceRouter, buildMetricsRouter } = require('./controllers/observabilityController');

const { createInMemoryAdapter } = require('../infrastructure/queue/inMemoryAdapter');
const { createWorkflowRegistry } = require('../workflowEngine/workflowRegistry');
const { buildExecutionStore } = require('../workflowEngine/executionStore');
const { createNodeRunner } = require('../workflowEngine/nodeRunner');
const { createWorkflowExecutor } = require('../workflowEngine/workflowExecutor');
const { createRegistry } = require('../toolRegistry/toolRegistry');
const { registerBuiltins } = require('../toolRegistry/builtinTools');

const { buildMemoryRepository } = require('../memoryManager/memoryRepository');
const { buildMemoryStore } = require('../memoryManager/memoryStore');
const { buildIoorRepository } = require('../observability/ioorRepository');
const { buildTraceRepository } = require('../observability/traceRepository');
const { buildAuditRepository } = require('../domain/audit/auditRepository');
const { createIoorRecorder } = require('../observability/ioorRecorder');
const { createTraceCollector } = require('../observability/traceCollector');
const { createMetricsExporter } = require('../observability/metricsExporter');

function createApp(overrides = {}) {
    const app = express();
    app.disable('x-powered-by');
    const deps = buildDependencies(overrides);
    mountHealthAndWebhooks(app, deps, overrides);
    mountMetricsEndpoint(app, deps, overrides);
    mountProtectedRoutes(app, deps, overrides);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}

function buildDependencies(overrides) {
    const agentService =
        overrides.agentService || buildService(overrides.agentRepository || buildRepository(overrides.db));
    const toolRegistry = overrides.toolRegistry || buildToolRegistry();
    const llmClient = overrides.llmClient || stubLLMClient();
    const memoryStore = overrides.memoryStore || buildMemoryStore(buildMemoryRepository(overrides.db));
    const ioorRecorder = overrides.ioorRecorder || buildDefaultIoorRecorder(overrides.db);
    const traceCollector =
        overrides.traceCollector || createTraceCollector({ traceRepository: buildTraceRepository(overrides.db) });
    const metricsExporter = overrides.metricsExporter || createMetricsExporter();
    const nodeRunner =
        overrides.nodeRunner || createNodeRunner({ toolRegistry, agentService, llmClient, memoryStore, ioorRecorder });
    return {
        agentService,
        workflowRegistry: overrides.workflowRegistry || createWorkflowRegistry(),
        executionStore: overrides.executionStore || buildExecutionStore(overrides.db),
        queue: overrides.queue || createInMemoryAdapter(),
        executor: overrides.executor || createWorkflowExecutor(nodeRunner),
        ioorRepository: overrides.ioorRepository || buildIoorRepository(overrides.db),
        traceCollector,
        metricsExporter,
    };
}

function buildDefaultIoorRecorder(db) {
    return createIoorRecorder({
        ioorRepository: buildIoorRepository(db),
        auditRepository: buildAuditRepository(db),
    });
}

function buildToolRegistry() {
    const reg = createRegistry();
    registerBuiltins(reg);
    return reg;
}

function stubLLMClient() {
    return {
        chat: async () => ({
            content: '',
            reasoning_content: null,
            tokenUsage: { prompt: 0, completion: 0, total: 0, cached_prompt_tokens: 0 },
            latencyMs: 0,
        }),
    };
}

function mountHealthAndWebhooks(app, deps, overrides) {
    app.get('/healthz', (req, res) => res.json(success({ status: 'ok', uptime: process.uptime() })));
    app.get('/readyz', (req, res) => handleReadyz(req, res, deps));
    if (overrides.webhookProviders) {
        app.use(
            '/webhooks',
            buildWebhookRouter({
                workflowRegistry: deps.workflowRegistry,
                executionStore: deps.executionStore,
                queue: deps.queue,
                providers: overrides.webhookProviders,
            }),
        );
    }
}

function handleReadyz(req, res, deps) {
    const checks = { db: false, queue: false };
    try {
        deps.executionStore.findById('exec_readyz_probe');
        checks.db = true;
    } catch {
        checks.db = false;
    }
    checks.queue = typeof deps.queue?.enqueue === 'function';
    const ok = Object.values(checks).every(Boolean);
    res.status(ok ? 200 : 503).json(success({ status: ok ? 'ready' : 'not_ready', checks }));
}

function mountMetricsEndpoint(app, deps, overrides) {
    const metricsToken = overrides.metricsToken ?? process.env.METRICS_TOKEN;
    app.use('/metrics', buildMetricsRouter({ metricsExporter: deps.metricsExporter, metricsToken }));
}

function mountProtectedRoutes(app, deps, overrides) {
    const authMiddleware =
        overrides.authMiddleware ||
        createAuthMiddleware({
            secret: overrides.jwtSecret || process.env.JWT_SECRET,
            disabled: overrides.authDisabled,
        });
    const rateLimit = overrides.rateLimiter || createRateLimiter({ bypass: overrides.rateLimitBypass ?? true });

    app.use(express.json({ limit: '1mb' }));
    app.use(authMiddleware);
    app.use(rateLimit);

    app.use('/agents', buildAgentRouter(deps.agentService));
    app.use(
        '/workflows/executions',
        buildExecutionTraceRouter({
            executionStore: deps.executionStore,
            ioorRepository: deps.ioorRepository,
            traceCollector: deps.traceCollector,
        }),
    );
    app.use(
        '/workflows',
        buildWorkflowRouter({
            workflowRegistry: deps.workflowRegistry,
            executionStore: deps.executionStore,
            queue: deps.queue,
            executor: deps.executor,
            metricsExporter: deps.metricsExporter,
        }),
    );
}

module.exports = { createApp };
