// [scaffold] ID: T1.6+T4.x | Date: 2026-05-18 | Description: Express 应用工厂——装配中间件、路由、错误处理与健康检查
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

const { createInMemoryAdapter } = require('../infrastructure/queue/inMemoryAdapter');
const { createWorkflowRegistry } = require('../workflowEngine/workflowRegistry');
const { buildExecutionStore } = require('../workflowEngine/executionStore');
const { createNodeRunner } = require('../workflowEngine/nodeRunner');
const { createWorkflowExecutor } = require('../workflowEngine/workflowExecutor');
const { createRegistry } = require('../toolRegistry/toolRegistry');
const { registerBuiltins } = require('../toolRegistry/builtinTools');

/**
 * 创建 Express 应用（测试可注入 overrides 中的任意依赖）
 */
function createApp(overrides = {}) {
    const app = express();
    app.disable('x-powered-by');

    const deps = buildDependencies(overrides);
    mountHealthAndWebhooks(app, deps, overrides);
    mountProtectedRoutes(app, deps, overrides);

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}

function buildDependencies(overrides) {
    const agentRepository = overrides.agentRepository || buildRepository(overrides.db);
    const agentService = overrides.agentService || buildService(agentRepository);
    const toolRegistry = overrides.toolRegistry || buildToolRegistry();
    const llmClient = overrides.llmClient || stubLLMClient();
    const nodeRunner = overrides.nodeRunner || createNodeRunner({ toolRegistry, agentService, llmClient });
    const executor = overrides.executor || createWorkflowExecutor(nodeRunner);
    const workflowRegistry = overrides.workflowRegistry || createWorkflowRegistry();
    const executionStore = overrides.executionStore || buildExecutionStore(overrides.db);
    const queue = overrides.queue || createInMemoryAdapter();
    return { agentService, workflowRegistry, executionStore, queue, executor };
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
        '/workflows',
        buildWorkflowRouter({
            workflowRegistry: deps.workflowRegistry,
            executionStore: deps.executionStore,
            queue: deps.queue,
            executor: deps.executor,
        }),
    );
}

module.exports = { createApp };
