// [ui] ID: WEBUI-V2.3-AUTOMATION | Date: 2026-05-21 | Description: Workflow 目录页——三栏 list + Definition + Execution History + Run；接 /workflows、/workflows/executions、POST execute
'use strict';

import { runWorkflow } from '../lib/actions.js';
import { api } from '../lib/api.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatDuration, formatTime, showToast } from '../lib/utils.js';

const RUN_TONE = {
    SUCCESS: { dot: 'dot-success', badge: 'badge-success', label: 'ok' },
    FAILED: { dot: 'dot-error', badge: 'badge-error', label: 'failed' },
    STUCK: { dot: 'dot-error', badge: 'badge-error', label: 'stuck' },
    TIMEOUT: { dot: 'dot-warning', badge: 'badge-warning', label: 'timeout' },
    RUNNING: { dot: 'dot-success', badge: 'badge-neutral', label: 'running' },
    PENDING: { dot: 'dot-neutral', badge: 'badge-neutral', label: 'pending' },
};

const HISTORY_LIMIT = 20;

// workflowId -> { items, total } | 'loading' | 'error'
const historyCache = {};
// workflowId -> nextRun(ISO)，来自 /workflows/schedules
let scheduleMap = {};

export async function renderAutomation() {
    const workflows = state.workflows || [];
    els.viewBody.innerHTML = shellHtml(workflows);
    if (workflows.length === 0) {
        renderDetailEmpty();
        return;
    }
    await loadSchedules();
    if (state.view !== 'automation') {
        return; // fetch 期间切走视图
    }
    renderList(workflows);
    const selected = workflows.find((w) => w.id === state.selectedId) || workflows[0];
    state.selectedId = selected.id;
    openDetail(selected);
}

async function loadSchedules() {
    try {
        const payload = await api('/workflows/schedules');
        scheduleMap = {};
        for (const s of payload.data || []) {
            scheduleMap[s.workflowId] = s.nextRun;
        }
    } catch (_err) {
        scheduleMap = {};
    }
}

function shellHtml(workflows) {
    return `
        <aside class="w-list bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <span class="t-base">Workflows</span>
                <span class="t-xs text-tertiary">${workflows.length}</span>
            </div>
            <ul id="wf-list" class="flex-1 overflow-y-auto scroll-thin">${workflows.length === 0 ? '<li class="empty">No workflows</li>' : ''}</ul>
            <div class="px-4 py-2 bd-t t-xs text-tertiary">read-only · /workflows</div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="wf-detail" class="flex-1 min-h-0 flex flex-col overflow-hidden"></div>
        </main>
    `;
}

function renderList(workflows) {
    const ul = document.getElementById('wf-list');
    if (!ul) {
        return;
    }
    ul.innerHTML = workflows.map((w) => workflowRowHtml(w, w.id === state.selectedId)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => selectWorkflow(workflows, li.dataset.id));
    });
}

function selectWorkflow(workflows, id) {
    state.selectedId = id;
    document.querySelectorAll('#wf-list li[data-id]').forEach((li) => {
        li.classList.toggle('row-sel', li.dataset.id === id);
    });
    const workflow = workflows.find((w) => w.id === id);
    if (workflow) {
        openDetail(workflow);
    }
}

function workflowRowHtml(workflow, selected) {
    const tone = RUN_TONE[latestStatus(workflow.id)] || { dot: 'dot-neutral' };
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(workflow.id)}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tone.dot} shrink-0"></span>
                <span class="t-sm t-medium t-truncate flex-1">${escapeHtml(workflow.name || workflow.id)}</span>
                ${workflow.trigger?.cron ? '<span class="badge badge-primary shrink-0">cron</span>' : ''}
                <span class="t-xs text-tertiary shrink-0">${workflow.nodeCount ?? '—'}n</span>
            </div>
            <div class="t-xs text-secondary t-mono pl-4 mt-1 t-truncate">${escapeHtml(workflow.id)} · ${escapeHtml(String(workflow.version ?? '1.0'))}</div>
        </li>
    `;
}

// 列表状态点从共享的 state.executions 派生（无需逐 workflow 额外 fetch）
function latestStatus(workflowId) {
    const runs = (state.executions || []).filter((e) => e.workflowId === workflowId);
    if (runs.length === 0) {
        return null;
    }
    runs.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    return runs[0].status;
}

async function openDetail(workflow) {
    renderDetail(workflow);
    await loadHistory(workflow.id);
}

function renderDetail(workflow) {
    const target = document.getElementById('wf-detail');
    if (!target) {
        return;
    }
    target.innerHTML = `
        ${detailHeaderHtml(workflow)}
        <div class="flex-1 min-h-0 overflow-y-auto scroll-thin">
            ${definitionSectionHtml(workflow)}
            ${historySectionHtml(workflow.id)}
        </div>
    `;
    document.getElementById('wf-run')?.addEventListener('click', () => triggerRun(workflow));
}

function renderDetailEmpty() {
    const target = document.getElementById('wf-detail');
    if (target) {
        target.innerHTML = '<div class="empty">没有 workflow</div>';
    }
}

function detailHeaderHtml(workflow) {
    return `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <h1 class="t-base t-truncate">${escapeHtml(workflow.name || workflow.id)}</h1>
                <span class="badge badge-neutral t-mono">${escapeHtml(String(workflow.version ?? '1.0'))}</span>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary t-mono">${escapeHtml(workflow.id)}</span>
            </div>
            <button id="wf-run" class="btn btn-primary focus-ring">Run</button>
        </header>
    `;
}

function definitionSectionHtml(workflow) {
    return `
        <section class="px-6 py-6 bd-b">
            <div class="t-xs t-upper t-medium text-tertiary mb-3">Definition</div>
            <p class="t-sm">${escapeHtml(workflow.description || 'No description provided.')}</p>
            <dl class="grid grid-cols-3 gap-x-6 mt-6">
                <div><dt class="t-xs t-upper t-medium text-tertiary mb-1">Version</dt><dd class="t-sm t-mono">${escapeHtml(String(workflow.version ?? '1.0'))}</dd></div>
                <div><dt class="t-xs t-upper t-medium text-tertiary mb-1">Nodes</dt><dd class="t-sm t-num">${workflow.nodeCount ?? '—'}</dd></div>
                <div><dt class="t-xs t-upper t-medium text-tertiary mb-1">Trigger</dt><dd class="t-sm">${triggerHtml(workflow)}</dd></div>
            </dl>
        </section>
    `;
}

function triggerHtml(workflow) {
    const cron = workflow.trigger?.cron;
    if (!cron) {
        return '<span class="text-secondary">manual</span>';
    }
    const next = scheduleMap[workflow.id];
    return `<span class="t-mono">${escapeHtml(cron)}</span>${next ? ` · next ${escapeHtml(formatTime(next))}` : ''}`;
}

function historySectionHtml(workflowId) {
    const cached = historyCache[workflowId];
    return `
        <section id="wf-history-section" class="px-6 py-6">
            <div class="flex items-baseline justify-between mb-3">
                <div class="t-xs t-upper t-medium text-tertiary">Execution History</div>
                <span class="t-xs text-tertiary">${historyMeta(cached)}</span>
            </div>
            ${historyBodyHtml(cached)}
        </section>
    `;
}

function historyMeta(cached) {
    if (!cached || cached === 'loading' || cached === 'error') {
        return '';
    }
    return `last ${cached.items.length} of ${cached.total}`;
}

function historyBodyHtml(cached) {
    if (cached === undefined || cached === 'loading') {
        return '<div class="empty">加载执行历史…</div>';
    }
    if (cached === 'error') {
        return '<div class="empty">执行历史加载失败</div>';
    }
    if (cached.items.length === 0) {
        return '<div class="empty">No executions yet</div>';
    }
    return `
        <div class="card">
            <table class="w-full t-xs">
                <thead class="bg-soft text-tertiary t-upper t-medium">
                    <tr>
                        <th class="text-left px-4 py-2"></th>
                        <th class="text-left px-4 py-2">Execution ID</th>
                        <th class="text-left px-4 py-2">Started</th>
                        <th class="text-right px-4 py-2">Duration</th>
                        <th class="text-right px-4 py-2 pr-6">Status</th>
                    </tr>
                </thead>
                <tbody class="divide-bd">${cached.items.map(historyRowHtml).join('')}</tbody>
            </table>
        </div>
    `;
}

function historyRowHtml(execution) {
    const tone = RUN_TONE[execution.status]
        || { dot: 'dot-neutral', badge: 'badge-neutral', label: String(execution.status || '—').toLowerCase() };
    return `
        <tr class="hover:bg-hover">
            <td class="pl-4 py-3 w-4"><span class="dot ${tone.dot}"></span></td>
            <td class="px-4 py-3 t-mono text-secondary">${escapeHtml(execution.id)}</td>
            <td class="px-4 py-3 t-num">${escapeHtml(formatTime(execution.startedAt))}</td>
            <td class="px-4 py-3 text-right t-num t-mono">${escapeHtml(formatDuration(execution.durationMs))}</td>
            <td class="px-4 py-3 text-right pr-6"><span class="badge ${tone.badge}">${escapeHtml(tone.label)}</span></td>
        </tr>
    `;
}

async function loadHistory(workflowId) {
    if (historyCache[workflowId] !== undefined) {
        return;
    }
    historyCache[workflowId] = 'loading';
    try {
        const payload = await api(`/workflows/executions?workflowId=${encodeURIComponent(workflowId)}&limit=${HISTORY_LIMIT}&offset=0`);
        const items = payload.data || [];
        historyCache[workflowId] = { items, total: payload.meta?.total ?? items.length };
    } catch (_err) {
        historyCache[workflowId] = 'error';
    }
    // fetch 期间用户可能切走/换选中——只在仍停留时重渲染该区
    if (state.view === 'automation' && state.selectedId === workflowId) {
        const section = document.getElementById('wf-history-section');
        if (section) {
            section.outerHTML = historySectionHtml(workflowId);
        }
    }
}

async function triggerRun(workflow) {
    try {
        await runWorkflow(workflow.id, { input: {} });
        showToast(`已触发 ${workflow.name || workflow.id}，异步执行中`);
    } catch (err) {
        showToast(err.message || '触发失败');
    }
}
