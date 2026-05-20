// [refactor] ID: V1.1.2 | Date: 2026-05-20 | Description: 可观测性路由（trace 查询 + /metrics 端点；metrics 强制 token + timing-safe 比对）
'use strict';

const express = require('express');

const { asyncHandler } = require('../middlewares/asyncHandler');
const { validate } = require('../middlewares/validateMiddleware');
const { success } = require('../response/envelope');
const { ExecutionIdParamSchema, ExecutionListQuerySchema } = require('../../workflowEngine/executionSchema');
const { AuthError } = require('../../infrastructure/errors/AppError');
const { timingSafeStringEqual } = require('../../infrastructure/security/timingSafe');

// 严格匹配 `Bearer <单段 token>`，scheme 大小写兼容；token 段不含空白
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * @param {{ traceCollector, ioorRepository, ioorRecorder, executionStore }} deps
 */
function buildExecutionTraceRouter(deps) {
    const router = express.Router();
    router.get(
        '/',
        validate({ query: ExecutionListQuerySchema }),
        asyncHandler(async (req, res) => {
            const { items, total } = await deps.executionStore.list(req.query);
            res.json(success(items, { total, limit: req.query.limit, offset: req.query.offset }));
        }),
    );
    router.get(
        '/:id/trace',
        validate({ params: ExecutionIdParamSchema }),
        asyncHandler(async (req, res) => {
            await deps.executionStore.requireById(req.params.id);
            // V1.5：查 trace 前 lazy flush 该 execution 的 IOOR 缓冲，
            // 确保 in-progress execution 的已记录 turn 也对查询可见
            if (deps.ioorRecorder) {
                await deps.ioorRecorder.flush(req.params.id);
            }
            const spans = deps.traceCollector ? await deps.traceCollector.listByExecution(req.params.id) : [];
            const ioor = deps.ioorRepository ? await deps.ioorRepository.listByExecution(req.params.id) : [];
            res.json(success({ executionId: req.params.id, spans, ioor }));
        }),
    );
    return router;
}

/**
 * @param {{ metricsExporter, metricsToken }} deps
 */
function buildMetricsRouter(deps) {
    const router = express.Router();
    router.get(
        '/',
        (req, res, next) => guardToken(req, deps.metricsToken, next),
        (req, res) => {
            res.set('content-type', 'text/plain; version=0.0.4');
            res.send(deps.metricsExporter.render());
        },
    );
    return router;
}

/**
 * 从请求提取呈递的 metrics token。
 *
 * 优先级与回退规则（V1.1.2 D-M-2）：
 * - 一旦出现 `Authorization` 头 → 走 Bearer 路径，只接受 `Bearer <单段 token>`；
 *   格式非法返回 null，且**不**回退到 x-metrics-token（避免双头语义含糊）
 * - 无 `Authorization` 头时，才回退兼容 `x-metrics-token` 头
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractPresentedToken(req) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string') {
        const match = BEARER_PATTERN.exec(authHeader.trim());
        return match ? match[1] : null;
    }
    const legacyHeader = req.headers['x-metrics-token'];
    return typeof legacyHeader === 'string' ? legacyHeader : null;
}

/**
 * /metrics 鉴权守卫。
 *
 * V1.1.2 破坏性变更：移除「token 未配置即匿名放行」。
 * 是否允许匿名由装配层（server.js）决定——非生产环境 token 缺失时
 * 装配层传入的 token 为 undefined，此处对未配置场景如何处理见下。
 *
 * 约定：token 为有效字符串时强制校验；token 为 undefined（仅非生产
 * 环境可能出现，生产已在启动期 fail-fast）时放行，保持开发期零摩擦。
 */
function guardToken(req, token, next) {
    if (token === undefined) {
        return next();
    }
    const presented = extractPresentedToken(req);
    if (!presented || !timingSafeStringEqual(presented, token)) {
        return next(new AuthError('metrics 令牌未提供或不匹配'));
    }
    return next();
}

module.exports = { buildExecutionTraceRouter, buildMetricsRouter };
