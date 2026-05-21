// [ui] ID: WEBUI-V2.3-PROJECTS | Date: 2026-05-21 | Description: Projects 视图纯 HTML builder——项目行/详情区块/读写表单 + badge 映射，无 DOM 变更
'use strict';

import { escapeHtml, formatTime } from '../../lib/utils.js';

const HEALTH_DOT = { green: 'dot-success', yellow: 'dot-warning', red: 'dot-error' };
const PROJECT_STATUS_BADGE = { active: 'badge-primary', paused: 'badge-neutral', done: 'badge-success', blocked: 'badge-error' };
const TASK_STATUS_BADGE = { open: 'badge-neutral', in_progress: 'badge-primary', blocked: 'badge-error', done: 'badge-success', skipped: 'badge-neutral' };
const TASK_PRIORITY_BADGE = { low: 'badge-neutral', normal: 'badge-neutral', high: 'badge-warning', urgent: 'badge-error' };
const REMINDER_SEVERITY_BADGE = { low: 'badge-neutral', normal: 'badge-neutral', high: 'badge-warning' };
const EVENT_SEVERITY_DOT = { low: 'dot-neutral', normal: 'dot-neutral', high: 'dot-warning', critical: 'dot-error' };

export const ENUMS = {
    projectStatus: ['active', 'paused', 'done', 'blocked'],
    health: ['green', 'yellow', 'red'],
    taskStatus: ['open', 'in_progress', 'blocked', 'done', 'skipped'],
    taskPriority: ['low', 'normal', 'high', 'urgent'],
    reminderSeverity: ['low', 'normal', 'high'],
    eventSeverity: ['low', 'normal', 'high', 'critical'],
};

function badge(text, cls) {
    return `<span class="badge ${cls || 'badge-neutral'}">${escapeHtml(text)}</span>`;
}

function optionsHtml(list, selected) {
    return list.map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`).join('');
}

export function projectRowHtml(project, selected) {
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(project.projectId)}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${HEALTH_DOT[project.health] || 'dot-neutral'} shrink-0"></span>
                <span class="t-sm t-medium t-truncate flex-1">${escapeHtml(project.name)}</span>
                ${badge(project.status, PROJECT_STATUS_BADGE[project.status])}
            </div>
            <div class="flex items-center justify-between mt-1 pl-4 gap-2">
                <span class="t-xs text-secondary t-truncate">${escapeHtml(project.phase)}</span>
                <span class="t-xs text-tertiary t-num shrink-0">${project.completion}%</span>
            </div>
        </li>
    `;
}

export function detailHeaderHtml(project) {
    return `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${HEALTH_DOT[project.health] || 'dot-neutral'}"></span>
                <h1 class="t-base t-truncate">${escapeHtml(project.name)}</h1>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary">${escapeHtml(project.phase)}</span>
                ${badge(project.status, PROJECT_STATUS_BADGE[project.status])}
            </div>
            <button id="pj-pf-edit" class="btn btn-secondary focus-ring">Edit</button>
        </header>
    `;
}

export function profileHtml(project) {
    return `
        <section class="p-6 bd-b" id="pj-profile">
            <div class="flex items-center justify-between mb-3">
                <div class="t-xs t-upper t-medium text-tertiary">Profile</div>
                <span class="t-xs text-tertiary">updated ${escapeHtml(formatTime(project.updatedAt))}</span>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-3">
                ${metricHtml('Health', project.health)}
                ${metricHtml('Completion', `${project.completion}%`)}
                ${metricHtml('Status', project.status)}
            </div>
            <div class="t-sm">${escapeHtml(project.summary || '—')}</div>
        </section>
    `;
}

function metricHtml(label, value) {
    return `
        <div>
            <div class="t-xs t-upper t-medium text-tertiary mb-1">${escapeHtml(label)}</div>
            <div class="t-sm t-medium">${escapeHtml(value ?? '—')}</div>
        </div>
    `;
}

export function profileEditHtml(project) {
    return `
        <section class="p-6 bd-b flex flex-col gap-2" id="pj-profile">
            <div class="t-xs t-upper t-medium text-tertiary mb-1">Edit profile</div>
            <label class="t-xs text-tertiary">phase<input id="pj-pf-phase" class="input compact" value="${escapeHtml(project.phase)}"></label>
            <div class="flex gap-2">
                <label class="t-xs text-tertiary flex-1">status<select id="pj-pf-status" class="input compact">${optionsHtml(ENUMS.projectStatus, project.status)}</select></label>
                <label class="t-xs text-tertiary flex-1">health<select id="pj-pf-health" class="input compact">${optionsHtml(ENUMS.health, project.health)}</select></label>
                <label class="t-xs text-tertiary flex-1">completion<input id="pj-pf-completion" class="input compact" type="number" min="0" max="100" value="${project.completion}"></label>
            </div>
            <label class="t-xs text-tertiary">summary<textarea id="pj-pf-summary" class="input-area" rows="3">${escapeHtml(project.summary || '')}</textarea></label>
            <div class="flex items-center gap-2 mt-1">
                <button id="pj-pf-save" class="btn btn-primary focus-ring">Save</button>
                <button id="pj-pf-cancel" class="btn btn-secondary focus-ring">Cancel</button>
            </div>
        </section>
    `;
}

export function tasksSectionHtml(tasks) {
    const body = tasks.length === 0 ? emptyHtml('No tasks') : tasks.map(taskRowHtml).join('');
    return sectionHtml('Tasks', 'pj-task', taskFormHtml(), `<ul id="pj-task-list" class="divide-bd">${body}</ul>`);
}

function taskRowHtml(task) {
    return `
        <li class="row">
            <div class="flex items-center gap-2 min-w-0">
                <span class="t-sm t-medium t-truncate flex-1">${escapeHtml(task.title)}</span>
                ${badge(task.status, TASK_STATUS_BADGE[task.status])}
                ${badge(task.priority, TASK_PRIORITY_BADGE[task.priority])}
            </div>
            ${task.notes ? `<div class="t-xs text-secondary mt-1 pl-1">${escapeHtml(task.notes)}</div>` : ''}
        </li>
    `;
}

function taskFormHtml() {
    return `
        <input id="pj-task-id" class="input compact" placeholder="task id（自然主键）">
        <input id="pj-task-title" class="input compact" placeholder="title">
        <div class="flex gap-2">
            <select id="pj-task-status" class="input compact flex-1">${optionsHtml(ENUMS.taskStatus, 'open')}</select>
            <select id="pj-task-priority" class="input compact flex-1">${optionsHtml(ENUMS.taskPriority, 'normal')}</select>
        </div>
        <input id="pj-task-notes" class="input compact" placeholder="notes（可选）">
        <button id="pj-task-save" class="btn btn-primary focus-ring">Save task</button>
    `;
}

export function remindersSectionHtml(reminders) {
    const body = reminders.length === 0 ? emptyHtml('No reminders') : reminders.map(reminderRowHtml).join('');
    return sectionHtml('Reminders', 'pj-rem', reminderFormHtml(), `<ul id="pj-rem-list" class="divide-bd">${body}</ul>`);
}

function reminderRowHtml(reminder) {
    return `
        <li class="row">
            <div class="flex items-center gap-2 min-w-0">
                <span class="t-sm t-medium t-truncate flex-1">${escapeHtml(reminder.title)}</span>
                ${badge(reminder.severity, REMINDER_SEVERITY_BADGE[reminder.severity])}
                <span class="t-xs text-tertiary shrink-0">${escapeHtml(formatTime(reminder.dueAt))}</span>
            </div>
            ${reminder.content ? `<div class="t-xs text-secondary mt-1 pl-1">${escapeHtml(reminder.content)}</div>` : ''}
        </li>
    `;
}

function reminderFormHtml() {
    return `
        <input id="pj-rem-title" class="input compact" placeholder="title">
        <input id="pj-rem-content" class="input compact" placeholder="content（可选）">
        <div class="flex gap-2">
            <input id="pj-rem-due" class="input compact flex-1" type="datetime-local">
            <select id="pj-rem-severity" class="input compact">${optionsHtml(ENUMS.reminderSeverity, 'normal')}</select>
        </div>
        <button id="pj-rem-save" class="btn btn-primary focus-ring">Save reminder</button>
    `;
}

export function eventsSectionHtml(events) {
    const body = events.length === 0 ? emptyHtml('No events') : events.map(eventRowHtml).join('');
    return sectionHtml('Events', 'pj-ev', eventFormHtml(), `<ol id="pj-ev-list" class="flex flex-col gap-2">${body}</ol>`);
}

function eventRowHtml(event) {
    return `
        <li class="tl">
            <span class="tl-dot ${EVENT_SEVERITY_DOT[event.severity] || 'dot-neutral'}"></span>
            <div class="flex items-center gap-2 min-w-0">
                <span class="t-xs t-mono text-tertiary shrink-0">${escapeHtml(event.type)}</span>
                <span class="t-sm t-truncate">${escapeHtml(event.title)}</span>
            </div>
            <div class="t-xs text-tertiary mt-1">${escapeHtml(formatTime(event.createdAt))}</div>
            ${event.content ? `<div class="t-xs text-secondary mt-1">${escapeHtml(event.content)}</div>` : ''}
        </li>
    `;
}

function eventFormHtml() {
    return `
        <input id="pj-ev-type" class="input compact" placeholder="type（小写+下划线，如 note_added）">
        <input id="pj-ev-title" class="input compact" placeholder="title">
        <input id="pj-ev-content" class="input compact" placeholder="content（可选）">
        <select id="pj-ev-severity" class="input compact">${optionsHtml(ENUMS.eventSeverity, 'normal')}</select>
        <button id="pj-ev-save" class="btn btn-primary focus-ring">Save event</button>
    `;
}

function sectionHtml(title, prefix, formHtml, listHtml) {
    return `
        <section class="p-6 bd-b">
            <div class="flex items-center justify-between mb-2">
                <div class="t-xs t-upper t-medium text-tertiary">${escapeHtml(title)}</div>
                <button id="${prefix}-add" class="btn btn-ghost btn-icon focus-ring" title="Add">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
            </div>
            <div id="${prefix}-form" class="hidden flex flex-col gap-2 mb-3 p-3 bg-soft bd rounded">${formHtml}</div>
            ${listHtml}
        </section>
    `;
}

function emptyHtml(text) {
    return `<li class="empty">${escapeHtml(text)}</li>`;
}
