// [planner] ID: PAM-3 | Date: 2026-05-19 | Description: 内置工具 taskList——按项目列出任务，支持 status/priority 过滤与分页
'use strict';

const { ListTasksFilterSchema } = require('../../../domain/projectAssistant/schemas/taskSchema');
const { buildTaskRepository } = require('../../../domain/projectAssistant/repositories/taskRepository');

async function handler(params, context = {}) {
    const repo = buildTaskRepository(context.db);
    const { items, total } = await repo.list(params);
    return { ok: true, data: { items, total } };
}

module.exports = {
    name: 'taskList',
    description: '按项目列出任务，支持 status/priority 过滤与分页',
    paramsSchema: ListTasksFilterSchema,
    handler,
    timeoutMs: 5000,
};
