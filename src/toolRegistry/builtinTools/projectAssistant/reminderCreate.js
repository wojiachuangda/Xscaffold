// [planner] ID: PAM-5 | Date: 2026-05-19 | Description: 内置工具 reminderCreate——创建项目提醒（初始状态 open）
'use strict';

const { CreateReminderSchema } = require('../../../domain/projectAssistant/schemas/reminderSchema');
const { buildReminderRepository } = require('../../../domain/projectAssistant/repositories/reminderRepository');

async function handler(params, context = {}) {
    const repo = buildReminderRepository(context.db);
    const reminder = await repo.insert(params);
    return { ok: true, data: { reminderId: reminder.reminderId } };
}

module.exports = {
    name: 'reminderCreate',
    description: '创建项目提醒（初始状态 open）',
    paramsSchema: CreateReminderSchema,
    handler,
    timeoutMs: 5000,
};
