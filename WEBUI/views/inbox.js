// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Inbox view — filter column + issue list (live from /workflows/executions failed/stuck/timeout) + detail (real error/trace + mock event timeline)
'use strict';

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

const MOCK_TRACE = [
    { n: 1, name: 'fetch input payload', state: 'ok', d: '42ms', detail: 'GET upstream · 200' },
    { n: 2, name: 'acquire execution lock', state: 'ok', d: '18ms', detail: 'memory queue lock acquired' },
    { n: 3, name: 'tool call · primary', state: 'ok', d: '1.84s', detail: 'tool returned 12 items' },
    { n: 4, name: 'tool call · followup', state: 'fail', d: '—', detail: 'see real trace via the View trace button' },
    { n: 5, name: 'commit final state', state: 'skip', d: '—', detail: 'skipped due to upstream failure' },
];

const TRACE_TONE = {
    ok: { dot: 'dot-success', text: 'text-success', label: 'ok' },
    fail: { dot: 'dot-error', text: 'text-error', label: 'failed' },
    skip: { dot: 'dot-neutral', text: 'text-tertiary', label: 'skipped' },
};

const MOCK_EVENTS = [
    { t: '—', sev: 'err', msg: 'Execution flagged as terminal failure' },
    { t: '—', sev: 'warn', msg: 'Retry attempted (see real trace)' },
    { t: '—', sev: 'info', msg: 'Execution received by workflowController' },
];

const EV_DOT = { info: 'dot-neutral', warn: 'dot-warning', err: 'dot-error' };

let filterMode = 'all';

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

function bindFilterButtons(issues) {
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
        ${traceSectionHtml()}
    `;
    target.querySelector('[data-action="trace"]').addEventListener('click', (e) => {
        openExecutionTrace(e.currentTarget.dataset.id);
    });
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

function traceSectionHtml() {
    return `
        <section class="grid grid-cols-5 gap-6 p-6">
            <div class="card col-span-3">
                <div class="h-8 px-4 flex items-center justify-between bd-b">
                    <div class="flex items-center gap-2"><span class="t-sm t-medium">Execution Trace</span><span class="t-xs text-tertiary">mock skeleton</span></div>
                </div>
                <ol class="divide-bd">${MOCK_TRACE.map(traceStepHtml).join('')}</ol>
            </div>
            <div class="card col-span-2">
                <div class="h-8 px-4 flex items-center justify-between bd-b">
                    <span class="t-sm t-medium">Runtime Events</span>
                    <span class="t-xs text-secondary">mock</span>
                </div>
                <ol class="p-4 flex flex-col gap-3">${MOCK_EVENTS.map(eventItemHtml).join('')}</ol>
            </div>
        </section>
    `;
}

function traceStepHtml(s) {
    const tone = TRACE_TONE[s.state];
    const openAttr = s.state === 'fail' ? ' open' : '';
    return `
        <li>
            <details${openAttr}>
                <summary class="px-4 py-3 hover:bg-hover flex items-center gap-3">
                    <span class="chev text-tertiary shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
                    <span class="dot ${tone.dot}"></span>
                    <span class="t-xs text-tertiary t-num w-4 text-right">${s.n}</span>
                    <span class="t-sm flex-1 t-truncate">${escapeHtml(s.name)}</span>
                    <span class="t-xs text-secondary t-mono t-num">${s.d}</span>
                    <span class="t-xs t-medium ${tone.text} w-16 text-right">${tone.label}</span>
                </summary>
                <div class="pl-12 pr-4 pb-3 t-xs text-secondary">${escapeHtml(s.detail)}</div>
            </details>
        </li>
    `;
}

function eventItemHtml(e) {
    return `
        <li class="tl">
            <span class="tl-dot ${EV_DOT[e.sev]}"></span>
            <div class="t-sm">${escapeHtml(e.msg)}</div>
            <div class="t-xs text-tertiary t-num mt-1">${escapeHtml(e.t)}</div>
        </li>
    `;
}
