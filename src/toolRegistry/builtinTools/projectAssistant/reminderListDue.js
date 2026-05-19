// [planner] ID: PAM-5 | Date: 2026-05-19 | Description: 内置工具 reminderListDue——查询到期且未完成的提醒（按 dueAt 升序）
'use strict';

const { ListDueRemindersSchema } = require('../../../domain/projectAssistant/schemas/reminderSchema');
const { buildReminderRepository } = require('../../../domain/projectAssistant/repositories/reminderRepository');

async function handler(params, context = {}) {
    const repo = buildReminderRepository(context.db);
    const { items, total } = await repo.listDue(params);
    return { ok: true, data: { items, total } };
}

module.exports = {
    name: 'reminderListDue',
    description: '查询到期且状态为 open 的提醒，按 dueAt 升序，支持 projectId 过滤与分页',
    paramsSchema: ListDueRemindersSchema,
    handler,
    timeoutMs: 5000,
};
