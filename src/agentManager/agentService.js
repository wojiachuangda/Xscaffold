// [scaffold] ID: T1.4 | Date: 2026-05-18 | Description: Agent 业务编排层（严禁直接调 SQL；依赖 repository 抽象）
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

    function createAgent(input) {
        const parsed = parseOrThrow(CreateAgentSchema, input);
        return repository.create(parsed);
    }

    function updateAgent(id, patch) {
        const parsed = parseOrThrow(UpdateAgentSchema, patch);
        return repository.update(id, parsed);
    }

    function deleteAgent(id) {
        repository.remove(id);
        return { id };
    }

    function getAgentById(id) {
        const agent = repository.findById(id);
        if (!agent) {
            throw new NotFoundError(`Agent 不存在: ${id}`);
        }
        return agent;
    }

    function listAgents(filter = {}) {
        const parsed = parseOrThrow(ListAgentsFilterSchema, filter);
        return repository.findAll(parsed);
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
