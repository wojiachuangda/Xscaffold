// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Executions view (token-styled) — status filter + workflow filter + pagination; on-demand fetch via fetchExecutions
'use strict';

import { openExecutionTrace } from '../lib/actions.js';
import { api } from '../lib/api.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatDuration, formatTime, showToast } from '../lib/utils.js';

const STATUS_OPTIONS = ['ALL', 'PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT'];

const STATUS_TONE = {
    SUCCESS: { dot: 'dot-success', text: 'text-success' },
    PENDING: { dot: 'dot-neutral', text: 'text-secondary' },
    RUNNING: { dot: 'dot-success', text: 'text-secondary' },
    FAILED: { dot: 'dot-error', text: 'text-error' },
    STUCK: { dot: 'dot-error', text: 'text-error' },
    TIMEOUT: { dot: 'dot-warning', text: 'text-warning' },
};

export async function fetchExecutions() {
    const params = buildQuery();
    const payload = await api(`/workflows/executions?${params.toString()}`);
    state.executions = payload.data || [];
    state.executionsTotal = payload.meta?.total ?? state.executions.length;
}

export function renderExecutions() {
    paint();
    // 进入视图即拉一次分页数据：executionsTotal 仅 fetchExecutions 会设置，
    // 否则首屏停在 0，Prev/Next 永远 disabled。
    reloadAndRender();
}

function paint() {
    els.viewBody.innerHTML = shellHtml();
    renderList();
    bindControls();
    renderDetail(pickSelected());
}

function buildQuery() {
    const params = new URLSearchParams();
    const { status, workflowId } = state.executionsFilter;
    if (status && status !== 'ALL') {
        params.set('status', status);
    }
    if (workflowId) {
        params.set('workflowId', workflowId);
    }
    params.set('limit', String(state.executionsLimit));
    params.set('offset', String(state.executionsOffset));
    return params;
}

function describeRange() {
    const total = state.executionsTotal;
    if (!total) {
        return '0 executions';
    }
    const from = state.executionsOffset + 1;
    const to = Math.min(state.executionsOffset + state.executionsLimit, total);
    return `${from}–${to} of ${total}`;
}

function pickSelected() {
    if (!state.executions || state.executions.length === 0) {
        return null;
    }
    return state.executions.find((e) => e.id === state.selectedId) || state.executions[0];
}

function shellHtml() {
    return `
        <aside class="w-list-wide bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <div class="flex items-center gap-2">
                    <span class="t-base">Executions</span>
                    <span class="t-xs text-tertiary">${describeRange()}</span>
                </div>
            </div>
            <div class="px-4 py-3 bd-b flex items-center gap-2 flex-wrap">
                ${filterControlsHtml()}
            </div>
            <ul id="ex-list" class="flex-1 overflow-y-auto scroll-thin"></ul>
            <div class="px-4 py-2 bd-t flex items-center justify-between t-xs">
                <button id="ex-prev" class="btn btn-secondary focus-ring" ${state.executionsOffset <= 0 ? 'disabled' : ''}>Prev</button>
                <span class="text-tertiary">${describeRange()}</span>
                <button id="ex-next" class="btn btn-secondary focus-ring" ${state.executionsOffset + state.executionsLimit >= state.executionsTotal ? 'disabled' : ''}>Next</button>
            </div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="ex-detail" class="flex-1 overflow-y-auto scroll-thin"></div>
        </main>
    `;
}

function filterControlsHtml() {
    return `
        <label class="t-xs text-tertiary flex items-center gap-1">
            <span>status</span>
            <select id="ex-status" class="input compact">
                ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === state.executionsFilter.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
        </label>
        <label class="t-xs text-tertiary flex items-center gap-1">
            <span>workflow</span>
            <input id="ex-workflow" class="input compact" placeholder="id" value="${escapeHtml(state.executionsFilter.workflowId)}">
        </label>
    `;
}

function renderList() {
    const ul = document.getElementById('ex-list');
    const items = state.executions || [];
    if (items.length === 0) {
        ul.innerHTML = '<li class="empty">No executions</li>';
        return;
    }
    ul.innerHTML = items.map((e) => executionRowHtml(e)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => {
            state.selectedId = li.dataset.id;
            ul.querySelectorAll('li[data-id]').forEach((n) => n.classList.toggle('row-sel', n.dataset.id === state.selectedId));
            renderDetail(items.find((e) => e.id === state.selectedId));
        });
    });
}

function executionRowHtml(execution) {
    const tone = STATUS_TONE[execution.status] || STATUS_TONE.PENDING;
    const selected = execution.id === state.selectedId;
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(execution.id)}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tone.dot} shrink-0"></span>
                <span class="t-sm t-medium t-truncate flex-1">${escapeHtml(execution.workflowId)}</span>
                <span class="t-xs t-medium shrink-0 ${tone.text}">${escapeHtml(execution.status)}</span>
            </div>
            <div class="flex items-center justify-between mt-1 pl-4">
                <span class="t-xs text-secondary t-mono t-truncate">${escapeHtml(execution.id)}</span>
                <span class="t-xs text-tertiary t-num shrink-0">${escapeHtml(formatTime(execution.startedAt))}</span>
            </div>
        </li>
    `;
}

function renderDetail(execution) {
    const target = document.getElementById('ex-detail');
    if (!execution) {
        target.innerHTML = '<div class="empty">Select an execution</div>';
        return;
    }
    const tone = STATUS_TONE[execution.status] || STATUS_TONE.PENDING;
    target.innerHTML = `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0 sticky top-0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tone.dot}"></span>
                <h1 class="t-base t-truncate">${escapeHtml(execution.workflowId)}</h1>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary t-mono">${escapeHtml(execution.id)}</span>
                <span class="t-xs t-medium ${tone.text}">${escapeHtml(execution.status)}</span>
            </div>
            <div class="flex items-center gap-2">
                <button class="btn btn-secondary focus-ring" data-action="trace" data-id="${escapeHtml(execution.id)}">View trace</button>
            </div>
        </header>
        <section class="grid grid-cols-4 gap-px bg-line bd-b">
            ${metricHtml('Status', execution.status, 'execution state')}
            ${metricHtml('Workflow', execution.workflowId, 'source')}
            ${metricHtml('Duration', formatDuration(execution.durationMs), 'runtime')}
            ${metricHtml('Finished', formatTime(execution.finishedAt), 'timestamp')}
        </section>
        <section class="p-6 bd-b">
            <div class="t-xs t-upper t-medium text-tertiary mb-2">Error</div>
            <pre class="code-block">${escapeHtml(JSON.stringify(execution.error || {}, null, 2))}</pre>
        </section>
        <section class="p-6">
            <div class="t-xs t-upper t-medium text-tertiary mb-2">Result</div>
            <pre class="code-block">${escapeHtml(JSON.stringify(execution.result || {}, null, 2))}</pre>
        </section>
    `;
    target.querySelector('[data-action="trace"]').addEventListener('click', (e) => {
        openExecutionTrace(e.currentTarget.dataset.id);
    });
}

function metricHtml(label, value, hint) {
    return `
        <div class="bg-panel px-6 py-4">
            <div class="t-xs t-upper t-medium text-tertiary mb-1">${escapeHtml(label)}</div>
            <div class="t-base t-num t-truncate">${escapeHtml(value ?? '—')}</div>
            <div class="t-xs text-secondary mt-1">${escapeHtml(hint)}</div>
        </div>
    `;
}

function bindControls() {
    document.getElementById('ex-status')?.addEventListener('change', (event) => {
        state.executionsFilter.status = event.target.value;
        state.executionsOffset = 0;
        reloadAndRender();
    });
    document.getElementById('ex-workflow')?.addEventListener('change', (event) => {
        state.executionsFilter.workflowId = event.target.value.trim();
        state.executionsOffset = 0;
        reloadAndRender();
    });
    document.getElementById('ex-prev')?.addEventListener('click', () => shiftPage(-1));
    document.getElementById('ex-next')?.addEventListener('click', () => shiftPage(1));
}

function shiftPage(direction) {
    const next = state.executionsOffset + direction * state.executionsLimit;
    state.executionsOffset = Math.max(0, next);
    reloadAndRender();
}

async function reloadAndRender() {
    try {
        await fetchExecutions();
    } catch (err) {
        showToast(err.message || 'Failed to load executions');
    }
    // fetch 期间用户可能已切走视图；只在仍停留 executions 时重绘，避免盖住别的 view
    if (state.view === 'executions') {
        paint();
    }
}
