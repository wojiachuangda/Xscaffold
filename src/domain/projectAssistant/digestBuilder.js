// [planner] ID: PAM-7 | Date: 2026-05-19 | Description: digest 数据组装与 markdown 渲染（纯函数，无 I/O）
'use strict';

/** range → 时间窗口（毫秒）；all 表示不过滤 */
const RANGE_WINDOWS_MS = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
};

/** 提醒"应该关注"的前瞻窗口：未来 24 小时；与 range 无关 */
const REMINDER_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

const RECENT_EVENTS_CAP = 10;

/**
 * 计算 range 在 now 的 since cutoff ISO 串；all → null（不过滤）
 */
function rangeSinceIso(range, now) {
    if (range === 'all') {
        return null;
    }
    const windowMs = RANGE_WINDOWS_MS[range];
    return new Date(now.getTime() - windowMs).toISOString();
}

/**
 * reminderListDue 的 before：当前 + 未来 24 小时
 */
function reminderBeforeIso(now) {
    return new Date(now.getTime() + REMINDER_LOOKAHEAD_MS).toISOString();
}

function summarizeTasks(tasks) {
    return {
        total: tasks.length,
        open: tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
        items: tasks,
    };
}

/**
 * 把 4 类 raw 数据装配为 DigestJsonSchema 形状。
 */
function assembleDigest({ project, tasks, events, reminders, range, now }) {
    return {
        project,
        tasks: summarizeTasks(tasks),
        recentEvents: events.slice(0, RECENT_EVENTS_CAP),
        dueReminders: reminders,
        range,
        generatedAt: now.toISOString(),
    };
}

function renderTaskLines(tasks) {
    if (!tasks.length) {
        return '_无任务_';
    }
    return tasks.map((t) => `- [${t.status}] ${t.title} (priority: ${t.priority})`).join('\n');
}

function renderEventLines(events) {
    if (!events.length) {
        return '_无事件_';
    }
    return events.map((e) => `- [${e.severity}] ${e.type}: ${e.title}`).join('\n');
}

function renderReminderLines(reminders) {
    if (!reminders.length) {
        return '_无到期提醒_';
    }
    return reminders.map((r) => `- ${r.dueAt} — ${r.title}`).join('\n');
}

function renderHeader(project, range, generatedAt) {
    return [
        `# 项目摘要：${project.name}`,
        '',
        `- phase: ${project.phase || '_未设置_'}`,
        `- status: ${project.status} (health: ${project.health})`,
        `- completion: ${project.completion}%`,
        `- range: ${range}`,
        `- generatedAt: ${generatedAt}`,
    ];
}

/**
 * 渲染 markdown 摘要。
 */
function renderMarkdown(digest) {
    const { project, tasks, recentEvents, dueReminders, range, generatedAt } = digest;
    return [
        ...renderHeader(project, range, generatedAt),
        '',
        '## 任务',
        `共 ${tasks.total} 项，未完成 ${tasks.open} 项。`,
        '',
        renderTaskLines(tasks.items),
        '',
        '## 最近事件（最多 10 条）',
        renderEventLines(recentEvents),
        '',
        '## 24 小时内到期提醒',
        renderReminderLines(dueReminders),
        '',
        '## 项目摘要文本',
        project.summary || '_无_',
    ].join('\n');
}

module.exports = {
    assembleDigest,
    renderMarkdown,
    rangeSinceIso,
    reminderBeforeIso,
    RECENT_EVENTS_CAP,
};
