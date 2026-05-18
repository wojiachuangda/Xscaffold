// [scaffold] ID: T4.3 | Date: 2026-05-18 | Description: 工作流路由控制器（POST execute 202 异步 + GET status）
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
        asyncHandler(async (req, res) => {
            res.json(success(deps.workflowRegistry.list()));
        }),
    );

    router.post(
        '/:id/execute',
        validate({ params: WorkflowIdParamSchema, body: ExecuteRequestSchema }),
        asyncHandler(async (req, res) => triggerExecute(req, res, deps)),
    );

    router.get(
        '/executions/:id',
        validate({ params: ExecutionIdParamSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(deps.executionStore.requireById(req.params.id)));
        }),
    );

    return router;
}

function registerWorker({ queue, executor, executionStore, workflowRegistry }) {
    queue.process(WORKFLOW_QUEUE, async (payload) => runOne(payload, { executor, executionStore, workflowRegistry }));
}

async function runOne({ workflowId, executionId, input }, { executor, executionStore, workflowRegistry }) {
    executionStore.markRunning(executionId);
    const def = workflowRegistry.get(workflowId);
    const result = await executor.execute(def, input || {});
    const finalStatus = result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
    executionStore.markFinal(executionId, {
        status: finalStatus,
        result: result.status === 'SUCCESS' ? result.context : null,
        error: result.error,
        durationMs: result.durationMs,
    });
    return { executionId, finalStatus };
}

async function triggerExecute(req, res, deps) {
    const def = deps.workflowRegistry.get(req.params.id);
    const execution = deps.executionStore.create({ workflowId: req.params.id, input: req.body.input || null });
    deps.queue.enqueue(WORKFLOW_QUEUE, {
        workflowId: req.params.id,
        executionId: execution.id,
        input: req.body.input || null,
    });
    logger.info({ workflowId: req.params.id, executionId: execution.id, nodes: def.nodes.length }, 'workflow enqueued');
    res.status(202).json(success(execution));
}

module.exports = { buildWorkflowRouter, WORKFLOW_QUEUE };
