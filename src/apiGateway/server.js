// [refactor] ID: V1.5-A.1-S6 | Date: 2026-05-19 | Description: Express 应用工厂——装配中间件、路由、错误处理、可观测性（async store/repo）
'use strict';

const path = require('path');

const express = require('express');

const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { createAuthMiddleware } = require('./middlewares/authMiddleware');
const { createApiKeyMiddleware } = require('./middlewares/apiKeyMiddleware');
const { createCorsMiddleware } = require('./middlewares/corsMiddleware');
const { createRateLimiter } = require('./middlewares/rateLimiter');
const { success } = require('./response/envelope');
const { logger } = require('../observability/logger');
const { loadFromFileSync } = require('../configManager/configLoader');

const { buildRouter: buildAgentRouter } = require('../agentManager/agentController');
const { buildService } = require('../agentManager/agentService');
const { buildRepository } = require('../agentManager/agentRepository');

const { buildWorkflowRouter, enqueueWorkflowExecution } = require('./controllers/workflowController');
const { buildWebhookRouter } = require('./controllers/webhookController');
const { buildExecutionTraceRouter, buildMetricsRouter } = require('./controllers/observabilityController');
const { buildRuntimeRouter } = require('./controllers/runtimeController');

const { parseQueueConfig, createQueue } = require('../infrastructure/queue');
const { createWorkflowRegistry, loadFromDirectorySync } = require('../workflowEngine/workflowRegistry');
const { createScheduler } = require('../workflowEngine/scheduler');
const { buildExecutionStore } = require('../workflowEngine/executionStore');
const { createNodeRunner } = require('../workflowEngine/nodeRunner');
const { createWorkflowExecutor } = require('../workflowEngine/workflowExecutor');
const { createRegistry } = require('../toolRegistry/toolRegistry');
const { registerBuiltins } = require('../toolRegistry/builtinTools');

const { buildUserRepository } = require('../identity/userRepository');
const { buildApiKeyRepository } = require('../identity/apiKeyRepository');

const { buildMemoryRepository } = require('../memoryManager/memoryRepository');
const { buildMemoryStore } = require('../memoryManager/memoryStore');
const { buildIoorRepository } = require('../observability/ioorRepository');
const { buildTraceRepository } = require('../observability/traceRepository');
const { buildAuditRepository } = require('../domain/audit/auditRepository');
const { createIoorRecorder } = require('../observability/ioorRecorder');
const { createTraceCollector } = require('../observability/traceCollector');
const { createMetricsExporter } = require('../observability/metricsExporter');
const { createOpenAIClient } = require('../infrastructure/llmClient/openaiClient');

const { buildProjectRepository } = require('../domain/projectAssistant/repositories/projectRepository');
const { buildTaskRepository } = require('../domain/projectAssistant/repositories/taskRepository');
const { buildEventRepository } = require('../domain/projectAssistant/repositories/eventRepository');
const { buildReminderRepository } = require('../domain/projectAssistant/repositories/reminderRepository');
const { buildProjectAssistantService } = require('../domain/projectAssistant/projectAssistantService');
const { buildProjectAssistantRouter } = require('../domain/projectAssistant/projectAssistantController');

function createApp(overrides = {}) {
    const app = express();
    app.disable('x-powered-by');
    const deps = buildDependencies(overrides);
    // 暴露依赖到 app.locals.deps —— main.js 优雅停机时需要 await deps.queue.close()
    app.locals.deps = deps;
    // CORS 必须在所有路由之前：预检 OPTIONS 要在 JSON body parser / 鉴权之前 204 短路
    app.use(overrides.corsMiddleware || createCorsMiddleware({ allowedOrigins: overrides.corsAllowedOrigins }));
    mountHealthAndWebhooks(app, deps, overrides);
    mountMetricsEndpoint(app, deps, overrides);
    mountProtectedRoutes(app, deps, overrides);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}

// 扁平 DI 装配：每个 overrides.X || buildY() 贡献一个分支，complexity 偏高是装配函数的固有形态；
// 拆 sub-builder 反而割裂依赖全景、增加跳转成本，故显式豁免而非硬拆。
// eslint-disable-next-line complexity
function buildDependencies(overrides) {
    const agentService =
        overrides.agentService || buildService(overrides.agentRepository || buildRepository(overrides.db));
    const userRepository = overrides.userRepository || buildUserRepository(overrides.db);
    const apiKeyRepository = overrides.apiKeyRepository || buildApiKeyRepository(overrides.db);
    const toolRegistry = overrides.toolRegistry || buildToolRegistry();
    const llmClient = resolveLLMClient(overrides);
    const memoryStore = overrides.memoryStore || buildMemoryStore(buildMemoryRepository(overrides.db));
    const ioorRecorder = overrides.ioorRecorder || buildDefaultIoorRecorder(overrides.db);
    const traceCollector =
        overrides.traceCollector || createTraceCollector({ traceRepository: buildTraceRepository(overrides.db) });
    const metricsExporter = overrides.metricsExporter || createMetricsExporter();
    const nodeRunner =
        overrides.nodeRunner || createNodeRunner({ toolRegistry, agentService, llmClient, memoryStore, ioorRecorder });
    const projectAssistantService = overrides.projectAssistantService || buildDefaultPaService(overrides);
    const workflowRegistry = overrides.workflowRegistry || buildWorkflowRegistryWithAutoload(overrides);
    const executionStore = overrides.executionStore || buildExecutionStore(overrides.db);
    const queue = overrides.queue || createQueue(parseQueueConfig());
    const scheduler =
        overrides.scheduler ||
        createScheduler({
            workflowRegistry,
            enqueue: (workflowId) =>
                enqueueWorkflowExecution({ workflowRegistry, executionStore, queue }, workflowId, {}, 'schedule'),
            logger,
        });
    return {
        agentService,
        userRepository,
        apiKeyRepository,
        projectAssistantService,
        workflowRegistry,
        executionStore,
        queue,
        scheduler,
        executor: overrides.executor || createWorkflowExecutor(nodeRunner),
        ioorRepository: overrides.ioorRepository || buildIoorRepository(overrides.db),
        // V1.5：暴露同一 recorder 实例，供 workflowController flush / trace lazy flush / main.js shutdown 共用
        ioorRecorder,
        traceCollector,
        metricsExporter,
        // V2-AGENT-LOOP：暴露给 /agents/:id/invoke 的 agentic loop 运行时依赖
        llmClient,
        toolRegistry,
        // V2.6 长会话：invoke 路径接入多轮记忆需要 memoryStore（此前仅 nodeRunner 用）
        memoryStore,
        db: overrides.db,
    };
}

/**
 * LLM 客户端选择：overrides 优先 → LLM_PROVIDER=openai 真接入 → 默认 stub（保测试 + 无 key 不崩）。
 */
function resolveLLMClient(overrides) {
    if (overrides.llmClient) {
        return overrides.llmClient;
    }
    if ((process.env.LLM_PROVIDER || 'stub') === 'openai') {
        return createOpenAIClient();
    }
    return stubLLMClient();
}

/**
 * Project Assistant 服务装配：4 个 repo 默认走 overrides.db；任一 repo 也可独立 override。
 */
function buildDefaultPaService(overrides) {
    return buildProjectAssistantService({
        projectRepository: overrides.projectRepository || buildProjectRepository(overrides.db),
        taskRepository: overrides.taskRepository || buildTaskRepository(overrides.db),
        eventRepository: overrides.eventRepository || buildEventRepository(overrides.db),
        reminderRepository: overrides.reminderRepository || buildReminderRepository(overrides.db),
    });
}

function buildDefaultIoorRecorder(db) {
    return createIoorRecorder({
        ioorRepository: buildIoorRepository(db),
        auditRepository: buildAuditRepository(db),
        bufferConfig: readIoorBufferConfig(),
    });
}

/**
 * 从环境变量读 IOOR 缓冲配置；未设的字段交由 IoorBufferConfigSchema 默认值兜底。
 */
function readIoorBufferConfig() {
    const config = {};
    const size = Number(process.env.IOOR_BATCH_SIZE);
    if (Number.isFinite(size) && size > 0) {
        config.batchSize = Math.floor(size);
    }
    const interval = Number(process.env.IOOR_BATCH_INTERVAL_MS);
    if (Number.isFinite(interval) && interval > 0) {
        config.intervalMs = Math.floor(interval);
    }
    return config;
}

function buildToolRegistry() {
    const reg = createRegistry();
    registerBuiltins(reg);
    return reg;
}

const DEFAULT_WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', 'workflows');

/**
 * 启动期容错装载 workflows/——非严格模式下，单个坏文件不影响平台启动；
 * 仅当显式 overrides.strictWorkflowLoad===true 时才把装载失败上抛。
 */
function buildWorkflowRegistryWithAutoload(overrides) {
    const registry = createWorkflowRegistry();
    const dir = overrides.workflowsDir || DEFAULT_WORKFLOWS_DIR;
    const strict = overrides.strictWorkflowLoad === true;
    try {
        const { loaded, failed } = loadFromDirectorySync({
            dir,
            registry,
            loadFnSync: loadFromFileSync,
        });
        if (strict && failed.length > 0) {
            throw new Error(`strict 模式下 workflow 装载失败: ${failed.map((f) => f.id).join(', ')}`);
        }
        if (loaded.length > 0) {
            logger.info({ dir, loaded }, 'workflows auto-loaded');
        }
    } catch (err) {
        if (strict) {
            throw err;
        }
        logger.warn({ dir, err: err.message }, '[startup] workflow auto-load skipped (non-strict)');
    }
    return registry;
}

function stubLLMClient() {
    return {
        // stub：仅契合 LLMClient 接口的 async 签名；生产实现见 openaiClient.js
        // eslint-disable-next-line require-await
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
    app.get('/readyz', (req, res, next) => {
        handleReadyz(req, res, deps).catch(next);
    });
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

async function handleReadyz(req, res, deps) {
    const checks = { db: false, queue: false };
    try {
        await deps.executionStore.findById('exec_readyz_probe');
        checks.db = true;
    } catch {
        checks.db = false;
    }
    checks.queue = typeof deps.queue?.enqueue === 'function';
    const ok = Object.values(checks).every(Boolean);
    res.status(ok ? 200 : 503).json(success({ status: ok ? 'ready' : 'not_ready', checks }));
}

function mountMetricsEndpoint(app, deps, overrides) {
    const metricsToken = resolveMetricsToken(overrides);
    app.use('/metrics', buildMetricsRouter({ metricsExporter: deps.metricsExporter, metricsToken }));
}

/**
 * 解析 metrics token（V1.1.2 破坏性变更）。
 *
 * - 空字符串 / 纯空白 / 未设 一律视为「未配置」
 * - 生产环境未配置 → 启动期 throw（fail-fast，避免 /metrics 静默匿名暴露）
 * - 非生产环境未配置 → warn + 返回 undefined（开发/测试零摩擦，guardToken 放行）
 *
 * @returns {string|undefined}
 */
function resolveMetricsToken(overrides) {
    const raw = overrides.metricsToken ?? process.env.METRICS_TOKEN;
    const configured = typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
    if (configured === undefined && process.env.NODE_ENV === 'production') {
        throw new Error('METRICS_TOKEN 必须在生产环境配置非空值（V1.1.2 破坏性变更）');
    }
    if (configured === undefined) {
        logger.warn({}, 'METRICS_TOKEN 未配置：/metrics 当前匿名可访问（生产环境必须配置）');
    }
    return configured;
}

function mountProtectedRoutes(app, deps, overrides) {
    const authMiddleware =
        overrides.authMiddleware ||
        createAuthMiddleware({
            secret: overrides.jwtSecret || process.env.JWT_SECRET,
            disabled: overrides.authDisabled,
        });
    const apiKeyMiddleware =
        overrides.apiKeyMiddleware ||
        createApiKeyMiddleware({ userRepository: deps.userRepository, apiKeyRepository: deps.apiKeyRepository });
    const rateLimit = overrides.rateLimiter || createRateLimiter({ bypass: overrides.rateLimitBypass ?? true });

    app.use(express.json({ limit: '1mb' }));
    app.use(apiKeyMiddleware); // 先解析 X-API-Key → req.user；无 key 放行给 JWT/AUTH_DISABLED
    app.use(authMiddleware);
    app.use(rateLimit);

    app.use(
        '/agents',
        buildAgentRouter(deps.agentService, {
            llmClient: deps.llmClient,
            toolRegistry: deps.toolRegistry,
            ioorRecorder: deps.ioorRecorder,
            // V2.6 长会话：多轮记忆 + 历史加载/截断指标
            memoryStore: deps.memoryStore,
            metricsExporter: deps.metricsExporter,
            db: deps.db,
        }),
    );
    app.use('/projects', buildProjectAssistantRouter(deps.projectAssistantService));
    app.use('/runtime', buildRuntimeRouter({ metricsExporter: deps.metricsExporter }));
    app.use(
        '/workflows/executions',
        buildExecutionTraceRouter({
            executionStore: deps.executionStore,
            ioorRepository: deps.ioorRepository,
            ioorRecorder: deps.ioorRecorder,
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
            ioorRecorder: deps.ioorRecorder,
            metricsExporter: deps.metricsExporter,
            scheduler: deps.scheduler,
        }),
    );
}

module.exports = { createApp };
