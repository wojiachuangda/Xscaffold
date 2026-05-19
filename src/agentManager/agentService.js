// [refactor] ID: V1.5-A.1-S5 | Date: 2026-05-19 | Description: Agent 业务编排层（async；严禁直接调 SQL；依赖 repository 抽象）
'use strict';

const { CreateAgentSchema, UpdateAgentSchema, ListAgentsFilterSchema } = require('./agentSchema');
const { NotFoundError, ValidationError } = require('../infrastructure/errors/AppError');

/**
 * @param {{ findById, findByName, findAll, create, update, remove }} repository
 */
function buildService(repository) {
    if (!repository) {
        throw new Error('agentService 需要注入 repository');
    }

    async function createAgent(input) {
        const parsed = parseOrThrow(CreateAgentSchema, input);
        return await repository.create(parsed);
    }

    async function updateAgent(id, patch) {
        const parsed = parseOrThrow(UpdateAgentSchema, patch);
        return await repository.update(id, parsed);
    }

    async function deleteAgent(id) {
        await repository.remove(id);
        return { id };
    }

    async function getAgentById(id) {
        const agent = await repository.findById(id);
        if (!agent) {
            throw new NotFoundError(`Agent 不存在: ${id}`);
        }
        return agent;
    }

    async function listAgents(filter = {}) {
        const parsed = parseOrThrow(ListAgentsFilterSchema, filter);
        return await repository.findAll(parsed);
    }

    return { createAgent, updateAgent, deleteAgent, getAgentById, listAgents };
}

function parseOrThrow(schema, input) {
    const r = schema.safeParse(input);
    if (!r.success) {
        throw new ValidationError('入参不合法', formatZodIssues(r.error));
    }
    return r.data;
}

function formatZodIssues(zodError) {
    return zodError.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        message: i.message,
    }));
}

module.exports = { buildService, formatZodIssues };
