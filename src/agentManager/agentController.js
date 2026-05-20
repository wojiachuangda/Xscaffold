// [refactor] ID: V1.5-A.1-S6 | Date: 2026-05-19 | Description: Agent REST 路由控制器（async service；仅抛 AppError 由全局中间件兜底）
'use strict';

const express = require('express');
const { z } = require('zod');

const { validate } = require('../apiGateway/middlewares/validateMiddleware');
const { asyncHandler } = require('../apiGateway/middlewares/asyncHandler');
const { success } = require('../apiGateway/response/envelope');
const { CreateAgentSchema, UpdateAgentSchema, ListAgentsFilterSchema } = require('./agentSchema');
const { runAgentLoop, newInvocationId } = require('./agentRunner');

const IdParamSchema = z.object({ id: z.string().min(1).max(64) });

const InvokeAgentSchema = z
    .object({
        prompt: z.string().min(1).max(8000),
        sessionId: z.string().min(1).max(128).optional(),
    })
    .strict();

/**
 * @param {{ createAgent, updateAgent, deleteAgent, getAgentById, listAgents }} service
 * @param {{ llmClient, toolRegistry, ioorRecorder, db }} [invokeDeps] agentic loop 运行时依赖
 */
function mountInvokeRoute(router, service, invokeDeps) {
    router.post(
        '/:id/invoke',
        validate({ params: IdParamSchema, body: InvokeAgentSchema }),
        asyncHandler(async (req, res) => {
            const agent = await service.getAgentById(req.params.id);
            const ctx = { executionId: newInvocationId(), sessionId: req.body.sessionId };
            const result = await runAgentLoop({ agent, prompt: req.body.prompt, deps: invokeDeps, ctx });
            res.json(success(result));
        }),
    );
}

function buildRouter(service, invokeDeps = {}) {
    const router = express.Router();

    mountInvokeRoute(router, service, invokeDeps);

    router.post(
        '/',
        validate({ body: CreateAgentSchema }),
        asyncHandler(async (req, res) => {
            const agent = await service.createAgent(req.body);
            res.status(201).json(success(agent));
        }),
    );

    router.get(
        '/',
        validate({ query: ListAgentsFilterSchema }),
        asyncHandler(async (req, res) => {
            const { items, total } = await service.listAgents(req.query);
            res.json(success(items, { total, limit: req.query.limit, offset: req.query.offset }));
        }),
    );

    router.get(
        '/:id',
        validate({ params: IdParamSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(await service.getAgentById(req.params.id)));
        }),
    );

    router.put(
        '/:id',
        validate({ params: IdParamSchema, body: UpdateAgentSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(await service.updateAgent(req.params.id, req.body)));
        }),
    );

    router.delete(
        '/:id',
        validate({ params: IdParamSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(await service.deleteAgent(req.params.id)));
        }),
    );

    return router;
}

module.exports = { buildRouter };
