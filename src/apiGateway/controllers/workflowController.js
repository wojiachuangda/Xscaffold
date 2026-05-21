// [refactor] ID: V1.5-A.1-S6 | Date: 2026-05-19 | Description: 工作流路由控制器（async store；POST execute 202 异步 + GET status）
'use strict';

const express = require('express');

const { validate } = require('../middlewares/validateMiddleware');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { success } = require('../response/envelope');
const {
    ExecuteRequestSchema,
    WorkflowIdParamSchema,
    ExecutionIdParamSchema,
} = require('../../workflowEngine/executionSchema');
const { logger } = require('../../observability/logger');

const WORKFLOW_QUEUE = 'workflow.execute';

/**
 * @param {{ workflowRegistry, executionStore, queue, executor }} deps
 */
function buildWorkflowRouter(deps) {
    registerWorker(deps);

    const router = express.Router();

    router.get(
        '/',
        asyncHandler((req, res) => {
            res.json(success(deps.workflowRegistry.list()));
        }),
    );

    router.get(
        '/schedules',
        asyncHandler((req, res) => {
            res.json(success(deps.scheduler ? deps.scheduler.listJobs() : []));
        }),
    );

    router.post(
        '/:id/execute',
        validate({ params: WorkflowIdParamSchema, body: ExecuteRequestSchema }),
        asyncHandler((req, res) => triggerExecute(req, res, deps)),
    );

    router.get(
        '/executions/:id',
        validate({ params: ExecutionIdParamSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(await deps.executionStore.requireById(req.params.id)));
        }),
    );

    return router;
}

function registerWorker(deps) {
    deps.queue.process(WORKFLOW_QUEUE, (payload) => runOne(payload, deps));
}

async function runOne(payload, deps) {
    const { workflowId, executionId, input, sessionId } = payload;
    await deps.executionStore.markRunning(executionId);
    const def = deps.workflowRegistry.get(workflowId);
    const ctx = { ...(input || {}), executionId };
    if (sessionId) {
        ctx.sessionId = sessionId;
    }
    const result = await deps.executor.execute(def, ctx);
    await deps.executionStore.markFinal(executionId, {
        status: result.status,
        result: result.status === 'SUCCESS' ? result.context : null,
        error: result.error,
        durationMs: result.durationMs,
    });
    // V1.5：execution 终态确定后立即 flush 该 execution 的 IOOR 缓冲，
    // 使其对后续 trace 查询完整可见（D-IOOR-1 触发点之一）
    if (deps.ioorRecorder) {
        await deps.ioorRecorder.flush(executionId);
    }
    recordWorkflowMetrics(deps.metricsExporter, def.name, result);
    return { executionId, finalStatus: result.status };
}

function recordWorkflowMetrics(metricsExporter, workflowName, result) {
    if (!metricsExporter) {
        return;
    }
    metricsExporter.recordWorkflowDuration(workflowName, result.status, result.durationMs);
}

async function triggerExecute(req, res, deps) {
    const execution = await enqueueWorkflowExecution(deps, req.params.id, req.body.input || null, 'manual');
    res.status(202).json(success(execution));
}

/**
 * 共享执行入口：create execution + enqueue。HTTP 路由与调度器共用。
 * @param {{ workflowRegistry, executionStore, queue }} deps
 * @param {string} workflowId
 * @param {object|null} input
 * @param {'manual'|'schedule'} [source]
 * @returns {Promise<object>} execution 记录
 */
async function enqueueWorkflowExecution(deps, workflowId, input, source = 'manual') {
    const def = deps.workflowRegistry.get(workflowId);
    const execution = await deps.executionStore.create({ workflowId, input: input || null });
    await deps.queue.enqueue(WORKFLOW_QUEUE, { workflowId, executionId: execution.id, input: input || null });
    logger.info({ workflowId, executionId: execution.id, nodes: def.nodes.length, source }, 'workflow enqueued');
    return execution;
}

module.exports = { buildWorkflowRouter, enqueueWorkflowExecution, WORKFLOW_QUEUE };
