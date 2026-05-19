// [planner] ID: PAM-3 | Date: 2026-05-19 | Description: 内置工具 taskUpsert——创建或更新任务（(projectId, taskId) 为自然主键）
'use strict';

const { UpsertTaskSchema } = require('../../../domain/projectAssistant/schemas/taskSchema');
const { buildTaskRepository } = require('../../../domain/projectAssistant/repositories/taskRepository');

async function handler(params, context = {}) {
    const repo = buildTaskRepository(context.db);
    const task = await repo.upsert(params);
    return {
        ok: true,
        data: { taskId: task.taskId, updatedAt: task.updatedAt },
    };
}

module.exports = {
    name: 'taskUpsert',
    description: '创建或更新任务；(projectId, taskId) 为自然主键，已存在则更新',
    paramsSchema: UpsertTaskSchema,
    handler,
    timeoutMs: 5000,
};
