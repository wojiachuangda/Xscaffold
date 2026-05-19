// [planner] ID: PAM-7 | Date: 2026-05-19 | Description: 内置工具 projectGenerateDigest——生成项目摘要（markdown/json；含最近 10 条事件 + 未来 24h 提醒）
'use strict';

const { GenerateDigestInputSchema } = require('../../../domain/projectAssistant/schemas/digestSchema');
const { buildProjectRepository } = require('../../../domain/projectAssistant/repositories/projectRepository');
const { buildTaskRepository } = require('../../../domain/projectAssistant/repositories/taskRepository');
const { buildEventRepository } = require('../../../domain/projectAssistant/repositories/eventRepository');
const { buildReminderRepository } = require('../../../domain/projectAssistant/repositories/reminderRepository');
const {
    assembleDigest,
    renderMarkdown,
    rangeSinceIso,
    reminderBeforeIso,
    RECENT_EVENTS_CAP,
} = require('../../../domain/projectAssistant/digestBuilder');
const { NotFoundError } = require('../../../infrastructure/errors/AppError');

const TASK_LIST_LIMIT = 200;
const REMINDER_LIST_LIMIT = 100;

async function loadEventsInRange({ db, projectId, range, now }) {
    const recent = await buildEventRepository(db).listRecent(projectId, RECENT_EVENTS_CAP);
    if (range === 'all') {
        return recent;
    }
    const sinceIso = rangeSinceIso(range, now);
    return recent.filter((e) => e.createdAt >= sinceIso);
}

async function loadDigestData({ db, projectId, range, now }) {
    const project = await buildProjectRepository(db).getByProjectId(projectId);
    if (!project) {
        throw new NotFoundError(`项目不存在: ${projectId}`);
    }
    const tasksResult = await buildTaskRepository(db).list({ projectId, limit: TASK_LIST_LIMIT, offset: 0 });
    const events = await loadEventsInRange({ db, projectId, range, now });
    const remindersResult = await buildReminderRepository(db).listDue({
        projectId,
        before: reminderBeforeIso(now),
        limit: REMINDER_LIST_LIMIT,
        offset: 0,
    });
    return { project, tasks: tasksResult.items, events, reminders: remindersResult.items };
}

async function handler(params, context = {}) {
    const now = new Date();
    const data = await loadDigestData({ db: context.db, projectId: params.projectId, range: params.range, now });
    const digestJson = assembleDigest({ ...data, range: params.range, now });
    const digest = params.format === 'markdown' ? renderMarkdown(digestJson) : digestJson;
    return { ok: true, data: { digest } };
}

module.exports = {
    name: 'projectGenerateDigest',
    description: '生成项目摘要（markdown 或 json）；含最近 10 条事件、未来 24h 内到期提醒',
    paramsSchema: GenerateDigestInputSchema,
    handler,
    timeoutMs: 10000,
};
