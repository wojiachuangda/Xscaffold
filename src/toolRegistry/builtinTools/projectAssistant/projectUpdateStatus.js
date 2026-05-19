// [planner] ID: PAM-2 | Date: 2026-05-19 | Description: 内置工具 projectUpdateStatus——更新项目状态（首次调用自动 upsert，name 兜底取 projectId）
'use strict';

const { UpdateProjectStatusSchema } = require('../../../domain/projectAssistant/schemas/projectSchema');
const { buildProjectRepository } = require('../../../domain/projectAssistant/repositories/projectRepository');

async function handler(params, context = {}) {
    const { projectId, ...patch } = params;
    const repo = buildProjectRepository(context.db);
    const project = await repo.upsertStatus(projectId, patch);
    return {
        ok: true,
        data: { projectId: project.projectId, updatedAt: project.updatedAt },
    };
}

module.exports = {
    name: 'projectUpdateStatus',
    description: '更新项目状态（仅 phase/status/health/completion/summary）；首次调用自动 upsert 落库',
    paramsSchema: UpdateProjectStatusSchema,
    handler,
    timeoutMs: 5000,
};
