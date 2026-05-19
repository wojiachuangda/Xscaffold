// [refactor] ID: V1.5-A.1-S6 | Date: 2026-05-19 | Description: 可观测性路由（trace 查询 + /metrics Prometheus 端点；async store/repo）
'use strict';

const express = require('express');

const { asyncHandler } = require('../middlewares/asyncHandler');
const { validate } = require('../middlewares/validateMiddleware');
const { success } = require('../response/envelope');
const { ExecutionIdParamSchema } = require('../../workflowEngine/executionSchema');
const { AuthError } = require('../../infrastructure/errors/AppError');

/**
 * @param {{ traceCollector, ioorRepository, executionStore }} deps
 */
function buildExecutionTraceRouter(deps) {
    const router = express.Router();
    router.get(
        '/:id/trace',
        validate({ params: ExecutionIdParamSchema }),
        asyncHandler(async (req, res) => {
            await deps.executionStore.requireById(req.params.id);
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

function guardToken(req, token, next) {
    if (!token) {
        return next();
    }
    const header = req.headers['x-metrics-token'];
    if (header !== token) {
        return next(new AuthError('metrics 令牌不匹配'));
    }
    return next();
}

module.exports = { buildExecutionTraceRouter, buildMetricsRouter };
