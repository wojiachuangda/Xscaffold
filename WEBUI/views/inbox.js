// [ui] ID: WEBUI-V2.3-INBOX | Date: 2026-05-21 | Description: Inbox view — filter column + issue list (live /workflows/executions) + detail 接真 trace（GET /:id/trace 的 spans/ioor）
'use strict';

import { api } from '../lib/api.js';
import { openExecutionTrace } from '../lib/actions.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatTime } from '../lib/utils.js';

const ISSUE_STATUSES = new Set(['FAILED', 'STUCK', 'TIMEOUT']);
const SEV_TONE = {
    FAILED: { dot: 'dot-error', badge: 'badge-error', label: 'failure' },
    STUCK: { dot: 'dot-error', badge: 'badge-error', label: 'stuck' },
    TIMEOUT: { dot: 'dot-warning', badge: 'badge-warning', label: 'timeout' },
};

// node_traces.status 枚举 → 配色
const SPAN_TONE = {
    SUCCESS: { dot: 'dot-success', text: 'text-success' },
    FAILED: { dot: 'dot-error', text: 'text-error' },
    STUCK: { dot: 'dot-error', text: 'text-error' },
    TIMEOUT: { dot: 'dot-warning', text: 'text-warning' },
    RUNNING: { dot: 'dot-success', text: 'text-secondary' },
};

let filterMode = 'all';
// executionId -> { executionId, spans[], ioor[] } | 'loading' | 'error'
const traceCache = {};

export function renderInbox() {
    const issues = (state.executions || []).filter((e) => ISSUE_STATUSES.has(e.status));
    const filtered = applyFilter(issues);
    els.viewBody.innerHTML = shellHtml(issues, filtered);
    bindFilterButtons(issues);
    renderList(filtered);
    const selected = pickSelected(filtered);
    renderDetail(selected);
}

function applyFilter(issues) {
    if (filterMode === 'all') {
        return issues;
    }
    return issues.filter((e) => e.status === filterMode);
}

function pickSelected(items) {
    if (items.length === 0) {
        return null;
    }
    const found = items.find((e) => e.id === state.selectedId);
    return found || items[0];
}

function countByStatus(issues, status) {
    return issues.filter((e) => e.status === status).length;
}

function shellHtml(issues, filtered) {
    return `
        <aside class="w-filter bg-canvas bd-r shrink-0 flex flex-col">
            <div class="h-12 px-4 flex items-center bd-b"><span class="t-base">Inbox</span></div>
            <nav class="p-2 flex flex-col gap-1 flex-1" id="ib-filter">
                ${filterButtonHtml('all', 'All', issues.length, 'text-tertiary')}
                ${filterButtonHtml('FAILED', 'Failures', countByStatus(issues, 'FAILED'), 'text-error')}
                ${filterButtonHtml('TIMEOUT', 'Timeouts', countByStatus(issues, 'TIMEOUT'), 'text-warning')}
                ${filterButtonHtml('STUCK', 'Stuck', countByStatus(issues, 'STUCK'), 'text-error')}
            </nav>
            <div class="px-4 py-2 bd-t t-xs text-tertiary">live · 5s poll</div>
        </aside>
        <aside class="w-list-wide bg-panel bd-r shrink-0 flex flex-col">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <div class="flex items-center gap-2">
                    <span class="t-sm t-medium">${filterTitle()}</span>
                    <span class="t-xs text-tertiary">${filtered.length}</span>
                </div>
            </div>
            <ul id="ib-list" class="flex-1 overflow-y-auto scroll-thin">${filtered.length === 0 ? '<li class="empty">No issues</li>' : ''}</ul>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="ib-detail" class="flex-1 overflow-y-auto scroll-thin"></div>
        </main>
    `;
}

function filterTitle() {
    if (filterMode === 'all') {
        return 'All issues';
    }
    return `${filterMode} only`;
}

function filterButtonHtml(value, label, count, countCls) {
    const active = filterMode === value;
    const cls = active ? 'bg-sel text-primary' : 'text-secondary hover:bg-hover hover:text-primary';
    return `
        <button data-filter="${value}" class="t-sm t-medium px-3 py-2 text-left flex items-center justify-between focus-ring ${cls}">
            <span>${label}</span>
            <span class="t-xs t-num ${active ? 'text-tertiary' : countCls}">${count}</span>
        </button>
    `;
}

function bindFilterButtons() {
    document.querySelectorAll('#ib-filter [data-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
            filterMode = btn.dataset.filter;
            renderInbox();
        });
    });
}

function renderList(filtered) {
    const ul = document.getElementById('ib-list');
    if (filtered.length === 0) {
        return;
    }
    ul.innerHTML = filtered.map((e) => issueRowHtml(e, e.id === state.selectedId)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => {
            state.selectedId = li.dataset.id;
            ul.querySelectorAll('li[data-id]').forEach((n) => n.classList.toggle('row-sel', n.dataset.id === state.selectedId));
            renderDetail(filtered.find((e) => e.id === state.selectedId));
        });
    });
}

function issueRowHtml(execution, selected) {
    const tone = SEV_TONE[execution.status] || SEV_TONE.FAILED;
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(execution.id)}" tabindex="0">
            <div class="flex items-start gap-3">
                <span class="dot ${tone.dot} mt-1 shrink-0"></span>
                <div class="min-w-0 flex-1">
                    <div class="t-sm t-truncate">${escapeHtml(execution.workflowId)}</div>
                    <div class="flex items-center gap-2 mt-1 t-xs text-secondary">
                        <span class="t-mono">${escapeHtml(execution.id)}</span>
                        <span class="text-tertiary">·</span>
                        <span class="t-num">${escapeHtml(formatTime(execution.startedAt))}</span>
                    </div>
                </div>
                <span class="badge ${tone.badge} shrink-0">${tone.label}</span>
            </div>
        </li>
    `;
}

function renderDetail(execution) {
    const target = document.getElementById('ib-detail');
    if (!execution) {
        target.innerHTML = '<div class="empty">Select an issue from the list</div>';
        return;
    }
    const tone = SEV_TONE[execution.status] || SEV_TONE.FAILED;
    target.innerHTML = `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0 sticky top-0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tone.dot}"></span>
                <h1 class="t-base t-truncate">${escapeHtml(execution.workflowId)}</h1>
                <span class="badge ${tone.badge}">${tone.label}</span>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary t-mono">${escapeHtml(execution.id)}</span>
            </div>
            <div class="flex items-center gap-2">
                <button class="btn btn-secondary focus-ring" data-action="trace" data-id="${escapeHtml(execution.id)}">View trace</button>
                <button class="btn btn-secondary focus-ring" disabled>Acknowledge</button>
                <button class="btn btn-primary focus-ring" disabled>Resolve</button>
            </div>
        </header>
        ${summarySectionHtml(execution)}
        ${traceSectionHtml(execution.id)}
    `;
    target.querySelector('[data-action="trace"]').addEventListener('click', (e) => {
        openExecutionTrace(e.currentTarget.dataset.id);
    });
    maybeLoadTrace(execution.id);
}

function summarySectionHtml(execution) {
    const message = execution.error?.message || '(no message)';
    const code = execution.error?.code || '—';
    return `
        <section class="px-6 py-6 bd-b">
            <h2 class="t-base mb-2">${escapeHtml(message)}</h2>
            <p class="t-sm text-secondary max-w-list-wide">Error code <span class="t-mono">${escapeHtml(code)}</span> · Duration <span class="t-mono">${execution.durationMs ?? '—'}ms</span></p>
            <dl class="grid grid-cols-4 gap-x-6 gap-y-2 mt-6 t-xs">
                <div><dt class="t-upper t-medium text-tertiary mb-1">Workflow</dt><dd>${escapeHtml(execution.workflowId)}</dd></div>
                <div><dt class="t-upper t-medium text-tertiary mb-1">Started</dt><dd class="t-num">${escapeHtml(formatTime(execution.startedAt))}</dd></div>
                <div><dt class="t-upper t-medium text-tertiary mb-1">Finished</dt><dd class="t-num">${escapeHtml(formatTime(execution.finishedAt))}</dd></div>
                <div><dt class="t-upper t-medium text-tertiary mb-1">Status</dt><dd>${escapeHtml(execution.status)}</dd></div>
            </dl>
        </section>
    `;
}

// 接真 trace：spans（node_traces）+ ioor（IOOR 记录），来自 GET /workflows/executions/:id/trace
function traceSectionHtml(executionId) {
    const cached = traceCache[executionId];
    return `
        <section id="ib-trace-section" class="grid grid-cols-5 gap-6 p-6">
            <div class="card col-span-3">
                <div class="h-8 px-4 flex items-center bd-b"><span class="t-sm t-medium">Execution Trace</span></div>
                ${spansCardBody(cached)}
            </div>
            <div class="card col-span-2">
                <div class="h-8 px-4 flex items-center bd-b"><span class="t-sm t-medium">IOOR Turns</span></div>
                ${ioorCardBody(cached)}
            </div>
        </section>
    `;
}

function spansCardBody(cached) {
    if (cached === undefined || cached === 'loading') {
        return stateRow('加载 trace…');
    }
    if (cached === 'error') {
        return stateRow('trace 加载失败');
    }
    const spans = cached.spans || [];
    if (spans.length === 0) {
        return stateRow('无 trace 记录（此 execution 未产生节点 trace）');
    }
    return `<ol class="divide-bd">${spans.map(spanStepHtml).join('')}</ol>`;
}

function ioorCardBody(cached) {
    if (cached === undefined || cached === 'loading') {
        return stateRow('加载中…');
    }
    if (cached === 'error') {
        return stateRow('加载失败');
    }
    const ioor = cached.ioor || [];
    if (ioor.length === 0) {
        return stateRow('无 IOOR 记录');
    }
    return `<ol class="p-4 flex flex-col gap-3">${ioor.map(ioorItemHtml).join('')}</ol>`;
}

function stateRow(text) {
    return `<div class="empty">${escapeHtml(text)}</div>`;
}

function spanStepHtml(span) {
    const tone = SPAN_TONE[span.status] || SPAN_TONE.RUNNING;
    const failed = span.status === 'FAILED' || span.status === 'STUCK' || span.status === 'TIMEOUT';
    const detail = span.error
        ? `${escapeHtml(span.error.code)} · ${escapeHtml(span.error.message)}`
        : escapeHtml(outputPreview(span.output));
    return `
        <li>
            <details${failed ? ' open' : ''}>
                <summary class="px-4 py-3 hover:bg-hover flex items-center gap-3">
                    <span class="chev text-tertiary shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
                    <span class="dot ${tone.dot}"></span>
                    <span class="t-sm flex-1 t-truncate">${escapeHtml(span.nodeId)}</span>
                    <span class="t-xs text-tertiary t-mono">${escapeHtml(span.nodeType)}</span>
                    <span class="t-xs text-secondary t-mono t-num">${span.durationMs == null ? '—' : `${span.durationMs}ms`}</span>
                    <span class="t-xs t-medium ${tone.text} w-16 text-right">${escapeHtml(span.status)}</span>
                </summary>
                <div class="pl-12 pr-4 pb-3 t-xs text-secondary">${detail}</div>
            </details>
        </li>
    `;
}

function ioorItemHtml(record) {
    const tokens = record.tokenUsage?.total ?? 0;
    const tools = (record.toolCalls || []).length;
    return `
        <li class="tl">
            <span class="tl-dot dot-neutral"></span>
            <div class="t-sm">${escapeHtml(record.nodeId)} · turn ${record.turnIndex}</div>
            <div class="t-xs text-secondary mt-1">${escapeHtml(record.modelName || '—')} · ${tokens} tokens · ${tools} tool call(s) · ${record.latencyMs ?? '—'}ms</div>
            <div class="t-xs text-tertiary t-num mt-1">${escapeHtml(formatTime(record.createdAt))}</div>
        </li>
    `;
}

function outputPreview(output) {
    if (output === null || output === undefined) {
        return '—';
    }
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

async function maybeLoadTrace(executionId) {
    if (traceCache[executionId] !== undefined) {
        return;
    }
    traceCache[executionId] = 'loading';
    try {
        const payload = await api(`/workflows/executions/${encodeURIComponent(executionId)}/trace`);
        traceCache[executionId] = payload.data || { spans: [], ioor: [] };
    } catch (_err) {
        traceCache[executionId] = 'error';
    }
    // fetch 期间用户可能切走视图 / 换选中项——只在仍停留时重渲染 trace 区
    if (state.view === 'inbox' && state.selectedId === executionId) {
        const section = document.getElementById('ib-trace-section');
        if (section) {
            section.outerHTML = traceSectionHtml(executionId);
        }
    }
}
