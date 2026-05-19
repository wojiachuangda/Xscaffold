// [planner] ID: PAM-2 | Date: 2026-05-19 | Description: 内置工具 projectGetStatus——读取项目当前状态
'use strict';

const { GetProjectStatusSchema } = require('../../../domain/projectAssistant/schemas/projectSchema');
const { buildProjectRepository } = require('../../../domain/projectAssistant/repositories/projectRepository');
const { NotFoundError } = require('../../../infrastructure/errors/AppError');

async function handler(params, context = {}) {
    const repo = buildProjectRepository(context.db);
    const project = await repo.getByProjectId(params.projectId);
    if (!project) {
        throw new NotFoundError(`项目不存在: ${params.projectId}`);
    }
    return { ok: true, data: project };
}

module.exports = {
    name: 'projectGetStatus',
    description: '读取项目当前状态',
    paramsSchema: GetProjectStatusSchema,
    handler,
    timeoutMs: 5000,
};
