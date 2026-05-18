// [scaffold] ID: T1.5 | Date: 2026-05-18 | Description: Agent REST 路由控制器（仅抛 AppError，由全局中间件兜底）
'use strict';

const express = require('express');
const { z } = require('zod');

const { validate } = require('../apiGateway/middlewares/validateMiddleware');
const { asyncHandler } = require('../apiGateway/middlewares/asyncHandler');
const { success } = require('../apiGateway/response/envelope');
const { CreateAgentSchema, UpdateAgentSchema, ListAgentsFilterSchema } = require('./agentSchema');

const IdParamSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * @param {{ createAgent, updateAgent, deleteAgent, getAgentById, listAgents }} service
 */
function buildRouter(service) {
    const router = express.Router();

    router.post(
        '/',
        validate({ body: CreateAgentSchema }),
        asyncHandler(async (req, res) => {
            const agent = service.createAgent(req.body);
            res.status(201).json(success(agent));
        }),
    );

    router.get(
        '/',
        validate({ query: ListAgentsFilterSchema }),
        asyncHandler(async (req, res) => {
            const { items, total } = service.listAgents(req.query);
            res.json(success(items, { total, limit: req.query.limit, offset: req.query.offset }));
        }),
    );

    router.get(
        '/:id',
        validate({ params: IdParamSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(service.getAgentById(req.params.id)));
        }),
    );

    router.put(
        '/:id',
        validate({ params: IdParamSchema, body: UpdateAgentSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(service.updateAgent(req.params.id, req.body)));
        }),
    );

    router.delete(
        '/:id',
        validate({ params: IdParamSchema }),
        asyncHandler(async (req, res) => {
            res.json(success(service.deleteAgent(req.params.id)));
        }),
    );

    return router;
}

module.exports = { buildRouter };
