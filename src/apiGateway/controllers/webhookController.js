// [scaffold] ID: T4.4 | Date: 2026-05-18 | Description: Webhook 路由——签名校验后入队触发工作流
'use strict';

const express = require('express');
const { z } = require('zod');

const { validate } = require('../middlewares/validateMiddleware');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { createGithubSignatureMiddleware } = require('../middlewares/webhookSignature');
const { success } = require('../response/envelope');
const { ValidationError, NotFoundError } = require('../../infrastructure/errors/AppError');
const { WORKFLOW_QUEUE } = require('./workflowController');
const { logger } = require('../../observability/logger');

const ProviderParamSchema = z.object({
    provider: z.enum(['github']),
});

/**
 * @param {{ workflowRegistry, executionStore, queue, providers }} deps
 * providers: { github: { secret, workflowId } }
 */
function buildWebhookRouter(deps) {
    const router = express.Router();
    const providers = deps.providers || {};

    if (providers.github?.secret) {
        const sigMiddleware = createGithubSignatureMiddleware({ secret: providers.github.secret });
        router.post(
            '/github',
            express.raw({ type: '*/*', limit: '256kb' }),
            sigMiddleware,
            validate({ params: ProviderParamSchema.partial() }),
            asyncHandler(async (req, res) => handleGithub(req, res, deps, providers.github)),
        );
    }

    return router;
}

async function handleGithub(req, res, deps, githubConfig) {
    const workflowId = githubConfig.workflowId;
    if (!workflowId) {
        throw new ValidationError('GitHub webhook 未配置 workflowId');
    }
    if (!deps.workflowRegistry.list().some((w) => w.id === workflowId)) {
        throw new NotFoundError(`webhook 关联的工作流不存在: ${workflowId}`);
    }
    const payload = parseRawBody(req.body);
    const execution = deps.executionStore.create({ workflowId, input: payload });
    deps.queue.enqueue(WORKFLOW_QUEUE, {
        workflowId,
        executionId: execution.id,
        input: payload,
    });
    logger.info({ provider: 'github', executionId: execution.id }, 'webhook accepted');
    res.status(202).json(success({ executionId: execution.id }));
}

function parseRawBody(buf) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return null;
    }
    try {
        return JSON.parse(buf.toString('utf8'));
    } catch {
        return { raw: buf.toString('utf8').slice(0, 1000) };
    }
}

module.exports = { buildWebhookRouter };
