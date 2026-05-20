// [refactor] ID: V1.5-A.1-S6 | Date: 2026-05-19 | Description: Agent REST 路由控制器（async service；仅抛 AppError 由全局中间件兜底）
'use strict';

const express = require('express');
const { z } = require('zod');

const { validate } = require('../apiGateway/middlewares/validateMiddleware');
const { asyncHandler } = require('../apiGateway/middlewares/asyncHandler');
const { success } = require('../apiGateway/response/envelope');
const { openSseStream } = require('../apiGateway/sse');
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

function mountInvokeStreamRoute(router, service, invokeDeps) {
    router.post(
        '/:id/invoke/stream',
        validate({ params: IdParamSchema, body: InvokeAgentSchema }),
        asyncHandler((req, res) => runInvokeStream(req, res, service, invokeDeps)),
    );
}

/**
 * SSE 流式 invoke：start → turn×N → done；任一步出错降级为 error 事件。
 * getAgentById 在开流前——agent 不存在仍走全局 errorHandler 的 JSON 404。
 */
async function runInvokeStream(req, res, service, invokeDeps) {
    const agent = await service.getAgentById(req.params.id);
    const ctx = { executionId: newInvocationId(), sessionId: req.body.sessionId };
    const stream = openSseStream(res);
    try {
        stream.send(buildStartEvent(ctx, agent));
        const result = await runAgentLoop({
            agent,
            prompt: req.body.prompt,
            deps: invokeDeps,
            ctx,
            onEvent: (event) => sendSafe(stream, event),
        });
        stream.send(buildDoneEvent(result));
    } catch (err) {
        stream.send({ type: 'error', message: err.message || 'invoke failed', ts: nowIso() });
    } finally {
        stream.close();
    }
}

// turn 事件单条契约异常不应中断 agent loop——IOOR 留痕优先于流式完整性。
function sendSafe(stream, event) {
    try {
        stream.send(event);
    } catch (_err) {
        /* 单事件丢弃，loop 继续 */
    }
}

function buildStartEvent(ctx, agent) {
    const event = {
        type: 'start',
        executionId: ctx.executionId,
        agentId: agent.id,
        model: agent.model,
        ts: nowIso(),
    };
    if (ctx.sessionId) {
        event.sessionId = ctx.sessionId;
    }
    return event;
}

function buildDoneEvent(result) {
    return {
        type: 'done',
        content: result.content,
        stopReason: result.stopReason,
        turnCount: result.turns.length,
        tokenUsage: result.tokenUsage,
        ts: nowIso(),
    };
}

function nowIso() {
    return new Date().toISOString();
}

function buildRouter(service, invokeDeps = {}) {
    const router = express.Router();

    mountInvokeRoute(router, service, invokeDeps);
    mountInvokeStreamRoute(router, service, invokeDeps);

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
