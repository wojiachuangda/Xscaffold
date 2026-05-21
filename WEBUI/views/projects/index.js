// [ui] ID: WEBUI-V2.3-PROJECTS | Date: 2026-05-21 | Description: Projects 视图入口——接 /projects API；左列表 + 右详情 4 区块(profile/tasks/reminders/events) 读+写
'use strict';

import { els } from '../../lib/dom.js';
import { state } from '../../lib/state.js';
import { showToast } from '../../lib/utils.js';
import {
    createReminder,
    fetchEvents,
    fetchProjects,
    fetchReminders,
    fetchTasks,
    recordEvent,
    updateProjectStatus,
    upsertTask,
} from './api.js';
import {
    detailHeaderHtml,
    eventsSectionHtml,
    profileEditHtml,
    profileHtml,
    projectRowHtml,
    remindersSectionHtml,
    tasksSectionHtml,
} from './render.js';

let projects = [];
let detail = { tasks: [], reminders: [], events: [] };

export async function renderProjects() {
    els.viewBody.innerHTML = shellHtml();
    await loadProjects();
    renderList();
    const selected = projects.find((p) => p.projectId === state.selectedId) || projects[0];
    if (!selected) {
        renderDetailEmpty();
        return;
    }
    state.selectedId = selected.projectId;
    await openDetail(selected.projectId);
}

function shellHtml() {
    return `
        <aside class="w-list bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center bd-b"><span class="t-base">Projects</span></div>
            <ul id="pj-list" class="flex-1 overflow-y-auto scroll-thin"></ul>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="pj-detail" class="flex-1 min-h-0 flex flex-col overflow-hidden"></div>
        </main>
    `;
}

async function loadProjects() {
    try {
        const result = await fetchProjects();
        projects = result.items;
    } catch (err) {
        showToast(err.message || 'Failed to load projects');
        projects = [];
    }
}

function renderList() {
    const ul = document.getElementById('pj-list');
    if (!ul) {
        return;
    }
    ul.innerHTML = projects.length === 0
        ? '<li class="empty">No projects</li>'
        : projects.map((p) => projectRowHtml(p, p.projectId === state.selectedId)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => selectProject(li.dataset.id));
    });
}

function selectProject(id) {
    state.selectedId = id;
    renderList();
    openDetail(id);
}

async function openDetail(id) {
    const project = findProject(id);
    if (!project) {
        renderDetailEmpty();
        return;
    }
    try {
        const [tasks, reminders, events] = await Promise.all([fetchTasks(id), fetchReminders(id), fetchEvents(id)]);
        detail = { tasks, reminders, events };
    } catch (err) {
        showToast(err.message || 'Failed to load project detail');
        detail = { tasks: [], reminders: [], events: [] };
    }
    renderDetail(project);
}

function renderDetail(project) {
    const target = document.getElementById('pj-detail');
    if (!target) {
        return;
    }
    target.innerHTML = `
        ${detailHeaderHtml(project)}
        <div id="pj-body" class="flex-1 min-h-0 overflow-y-auto scroll-thin">
            ${profileHtml(project)}
            ${tasksSectionHtml(detail.tasks)}
            ${remindersSectionHtml(detail.reminders)}
            ${eventsSectionHtml(detail.events)}
        </div>
    `;
    bindDetail(project);
}

function renderDetailEmpty() {
    const target = document.getElementById('pj-detail');
    if (target) {
        target.innerHTML = '<div class="empty">没有项目</div>';
    }
}

function bindDetail(project) {
    bindProfileEdit(project);
    bindAddToggle('pj-task');
    bindAddToggle('pj-rem');
    bindAddToggle('pj-ev');
    document.getElementById('pj-task-save')?.addEventListener('click', () => submitTask(project.projectId));
    document.getElementById('pj-rem-save')?.addEventListener('click', () => submitReminder(project.projectId));
    document.getElementById('pj-ev-save')?.addEventListener('click', () => submitEvent(project.projectId));
}

function bindAddToggle(prefix) {
    document.getElementById(`${prefix}-add`)?.addEventListener('click', () => {
        document.getElementById(`${prefix}-form`)?.classList.toggle('hidden');
    });
}

function bindProfileEdit(project) {
    document.getElementById('pj-pf-edit')?.addEventListener('click', () => {
        const section = document.getElementById('pj-profile');
        if (!section) {
            return;
        }
        section.outerHTML = profileEditHtml(project);
        document.getElementById('pj-pf-save')?.addEventListener('click', () => submitProfile(project.projectId));
        document.getElementById('pj-pf-cancel')?.addEventListener('click', () => {
            const restored = document.getElementById('pj-profile');
            if (restored) {
                restored.outerHTML = profileHtml(project);
            }
        });
    });
}

async function submitProfile(id) {
    const body = {
        projectId: id,
        phase: val('pj-pf-phase').trim(),
        status: val('pj-pf-status'),
        health: val('pj-pf-health'),
        completion: Number(val('pj-pf-completion')),
        summary: val('pj-pf-summary'),
    };
    try {
        const updated = await updateProjectStatus(id, body);
        mergeProject(updated);
        showToast('项目已更新');
        renderList();
        renderDetail(findProject(id));
    } catch (err) {
        showToast(err.message || '更新失败');
    }
}

async function submitTask(id) {
    const taskId = val('pj-task-id').trim();
    const title = val('pj-task-title').trim();
    if (!taskId || !title) {
        showToast('task id 和 title 必填');
        return;
    }
    const body = { projectId: id, taskId, title, status: val('pj-task-status'), priority: val('pj-task-priority') };
    const notes = val('pj-task-notes').trim();
    if (notes) {
        body.notes = notes;
    }
    await submitWrite(() => upsertTask(id, body), '任务已保存', async () => {
        detail.tasks = await fetchTasks(id);
    }, id);
}

async function submitReminder(id) {
    const title = val('pj-rem-title').trim();
    const due = val('pj-rem-due');
    if (!title || !due) {
        showToast('title 和 due 时间必填');
        return;
    }
    const body = { projectId: id, title, dueAt: new Date(due).toISOString(), severity: val('pj-rem-severity') };
    const content = val('pj-rem-content').trim();
    if (content) {
        body.content = content;
    }
    await submitWrite(() => createReminder(id, body), '提醒已创建', async () => {
        detail.reminders = await fetchReminders(id);
    }, id);
}

async function submitEvent(id) {
    const type = val('pj-ev-type').trim();
    const title = val('pj-ev-title').trim();
    if (!type || !title) {
        showToast('type 和 title 必填');
        return;
    }
    const body = { projectId: id, type, title, severity: val('pj-ev-severity') };
    const content = val('pj-ev-content').trim();
    if (content) {
        body.content = content;
    }
    await submitWrite(() => recordEvent(id, body), '事件已记录', async () => {
        detail.events = await fetchEvents(id);
    }, id);
}

// 写操作统一收口：执行写 → 提示 → 重拉受影响列表 → 重渲染详情（表单随之收起）。
async function submitWrite(writeFn, okMsg, reloadFn, id) {
    try {
        await writeFn();
        showToast(okMsg);
        await reloadFn();
        renderDetail(findProject(id));
    } catch (err) {
        showToast(err.message || '操作失败');
    }
}

function findProject(id) {
    return projects.find((p) => p.projectId === id);
}

function mergeProject(updated) {
    projects = projects.map((p) => (p.projectId === updated.projectId ? { ...p, ...updated } : p));
}

function val(id) {
    return document.getElementById(id)?.value ?? '';
}
