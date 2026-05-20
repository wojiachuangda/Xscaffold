// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Agents view — live list from /agents (real names/models/tools); detail tasks/history/automation are mock placeholders
'use strict';

import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatTime } from '../lib/utils.js';

const STATE_TONE = {
    enabled: { label: 'running', text: 'text-secondary', dot: 'dot-success' },
    disabled: { label: 'stopped', text: 'text-tertiary', dot: 'dot-neutral' },
};

const MOCK_TASKS = [
    { id: 't_91ad', title: 'normalize batch · 2026-05-20 / 14:00', priority: 'normal', state: 'running', eta: '~12s left' },
    { id: 't_91ae', title: 'reconcile partition p-4 (lag 8ms)', priority: 'high', state: 'queued', eta: 'queued · 3 ahead' },
    { id: 't_91af', title: 're-emit dropped records · src=s3://feed-eu/', priority: 'normal', state: 'running', eta: '~38s left' },
];

const TASK_TONE = {
    running: { dot: 'dot-success', text: 'text-secondary' },
    queued: { dot: 'dot-neutral', text: 'text-tertiary' },
    blocked: { dot: 'dot-error', text: 'text-error' },
};
const PRI_TONE = { low: 'text-tertiary', normal: 'text-secondary', high: 'text-warning', urgent: 'text-error' };

const MOCK_HISTORY = [
    { t: '14:02 · just now', state: 'ok', title: 't_91ac · normalize batch', d: '0.92s' },
    { t: '13:58', state: 'ok', title: 't_91ab · normalize batch', d: '1.84s' },
    { t: '13:55', state: 'fail', title: 't_91aa · reconcile partition p-2', d: '4.20s · timeout, retried' },
    { t: '13:50', state: 'ok', title: 't_91a9 · normalize batch', d: '1.12s' },
    { t: '13:45', state: 'ok', title: 't_91a8 · re-emit dropped (s3)', d: '2.31s' },
    { t: '13:34', state: 'skip', title: 't_91a6 · skipped (empty payload)', d: '—' },
];

const HIST_TONE = {
    ok: { dot: 'dot-success', text: 'text-success', label: 'ok' },
    fail: { dot: 'dot-error', text: 'text-error', label: 'failed' },
    skip: { dot: 'dot-neutral', text: 'text-tertiary', label: 'skipped' },
};

const MOCK_AUTOMATIONS = [
    { name: 'eu-feed-ingest', trig: 'cron', next: 'every 5m' },
    { name: 'on-outlier-alert', trig: 'event', next: 'on outlier.score>3.5' },
];

export function renderAgents() {
    const agents = state.agents || [];
    els.viewBody.innerHTML = shellHtml(agents);
    if (agents.length === 0) {
        return;
    }
    const selectedIdx = pickSelectedIndex(agents);
    renderList(agents, selectedIdx);
    renderDetail(agents[selectedIdx]);
}

function pickSelectedIndex(agents) {
    const found = agents.findIndex((a) => a.id === state.selectedId);
    return found >= 0 ? found : 0;
}

function shellHtml(agents) {
    return `
        <aside class="w-list bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <span class="t-base">Agents</span>
                <button class="btn btn-ghost btn-icon focus-ring" title="New agent"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
            <div class="px-4 pt-3 pb-1 t-xs t-upper t-medium text-tertiary">Active · ${agents.filter((a) => a.status === 'enabled').length}</div>
            <ul id="ag-list" class="flex-1 overflow-y-auto scroll-thin">${agents.length === 0 ? '<li class="empty">No agents configured</li>' : ''}</ul>
            <div class="px-4 py-2 bd-t t-xs text-tertiary">${agents.length} agents · live</div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="ag-detail" class="flex-1 overflow-y-auto scroll-thin"></div>
        </main>
    `;
}

function renderList(agents, selectedIdx) {
    const ul = document.getElementById('ag-list');
    ul.innerHTML = agents.map((a, i) => agentRowHtml(a, i === selectedIdx)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => {
            const next = agents.findIndex((a) => a.id === li.dataset.id);
            state.selectedId = li.dataset.id;
            ul.querySelectorAll('li[data-id]').forEach((n, k) => n.classList.toggle('row-sel', k === next));
            renderDetail(agents[next]);
        });
    });
}

function agentRowHtml(agent, selected) {
    const tone = STATE_TONE[agent.status] || STATE_TONE.disabled;
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(agent.id)}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tone.dot} shrink-0"></span>
                <span class="t-sm t-medium t-truncate">${escapeHtml(agent.name)}</span>
            </div>
            <div class="flex items-center justify-between mt-1 pl-4 gap-2">
                <span class="t-xs text-secondary t-truncate">${escapeHtml(agent.model)}</span>
                <span class="t-xs t-medium shrink-0 ${tone.text}">${tone.label}</span>
            </div>
            <div class="t-xs text-tertiary pl-4 mt-1">${(agent.tools || []).length} tools</div>
        </li>
    `;
}

function renderDetail(agent) {
    const tone = STATE_TONE[agent.status] || STATE_TONE.disabled;
    document.getElementById('ag-detail').innerHTML = `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0 sticky top-0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tone.dot}"></span>
                <h1 class="t-base t-truncate">${escapeHtml(agent.name)}</h1>
                <span class="t-xs t-medium ${tone.text}">${tone.label}</span>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary t-mono">${escapeHtml(agent.id)}</span>
            </div>
            <div class="flex items-center gap-2">
                <button class="btn btn-secondary focus-ring">Pause</button>
                <button class="btn btn-primary focus-ring">Trigger run</button>
            </div>
        </header>
        <section class="px-6 py-6 bd-b">
            ${profileHtml(agent)}
        </section>
        <section class="grid grid-cols-3 gap-6 p-6 bd-b">
            <div class="card col-span-2">
                <div class="h-8 px-4 flex items-center justify-between bd-b">
                    <div class="flex items-center gap-2"><span class="t-sm t-medium">Active Tasks</span><span class="t-xs text-tertiary">·</span><span class="t-xs text-secondary">mock · ${MOCK_TASKS.length}</span></div>
                </div>
                <ul class="divide-bd">${MOCK_TASKS.map(taskItemHtml).join('')}</ul>
            </div>
            <div class="card">
                <div class="h-8 px-4 flex items-center bd-b"><span class="t-sm t-medium">Tools</span></div>
                <div class="p-4">
                    <div class="flex flex-wrap gap-2">
                        ${(agent.tools || []).map((t) => `<span class="badge badge-neutral">${escapeHtml(t)}</span>`).join('') || '<span class="t-xs text-tertiary">no tools bound</span>'}
                    </div>
                </div>
            </div>
        </section>
        <section class="grid grid-cols-3 gap-6 p-6">
            <div class="card col-span-2">
                <div class="h-8 px-4 flex items-center justify-between bd-b">
                    <div class="flex items-center gap-2"><span class="t-sm t-medium">Execution History</span><span class="t-xs text-tertiary">·</span><span class="t-xs text-secondary">mock · last 24h</span></div>
                </div>
                <ol class="p-4 flex flex-col gap-3">${MOCK_HISTORY.map(historyItemHtml).join('')}</ol>
            </div>
            <div class="card">
                <div class="h-8 px-4 flex items-center justify-between bd-b"><span class="t-sm t-medium">Automation Ownership</span><span class="t-xs text-tertiary">mock</span></div>
                <ul class="divide-bd">${MOCK_AUTOMATIONS.map(automationItemHtml).join('')}</ul>
            </div>
        </section>
    `;
}

function profileHtml(agent) {
    return `
        <div class="flex items-start gap-6">
            <div class="w-16 h-16 bg-soft bd rounded-md flex items-center justify-center text-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="9" cy="16" r="1.4"/><circle cx="15" cy="16" r="1.4"/><path d="M12 7v4M9 4h6"/></svg>
            </div>
            <div class="flex-1 min-w-0">
                <div class="t-xs t-upper t-medium text-tertiary mb-1">Profile</div>
                <h2 class="t-base mb-2">${escapeHtml(agent.name)}</h2>
                <p class="t-sm text-secondary max-w-2xl">${escapeHtml(agent.description || 'No description provided.')}</p>
            </div>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-2 t-xs shrink-0">
                <dt class="text-tertiary">Updated</dt><dd class="t-num">${escapeHtml(formatTime(agent.updatedAt))}</dd>
                <dt class="text-tertiary">Model</dt><dd class="t-mono">${escapeHtml(agent.model)}</dd>
                <dt class="text-tertiary">Tools</dt><dd class="t-num">${(agent.tools || []).length}</dd>
                <dt class="text-tertiary">Status</dt><dd>${escapeHtml(agent.status)}</dd>
            </dl>
        </div>
    `;
}

function taskItemHtml(t) {
    const tone = TASK_TONE[t.state];
    return `
        <li class="px-4 py-3 hover:bg-hover">
            <div class="flex items-center gap-3">
                <span class="dot ${tone.dot}"></span>
                <span class="t-xs t-mono text-secondary">${t.id}</span>
                <span class="t-sm t-truncate flex-1">${escapeHtml(t.title)}</span>
                <span class="t-xs t-medium ${tone.text}">${t.state}</span>
            </div>
            <div class="flex items-center justify-between mt-1 pl-4">
                <span class="t-xs text-tertiary">priority · <span class="${PRI_TONE[t.priority]}">${t.priority}</span></span>
                <span class="t-xs text-secondary t-num">${t.eta}</span>
            </div>
        </li>
    `;
}

function historyItemHtml(h) {
    const tone = HIST_TONE[h.state];
    return `
        <li class="tl">
            <span class="tl-dot ${tone.dot}"></span>
            <div class="flex items-baseline justify-between gap-4">
                <div class="min-w-0">
                    <div class="t-sm t-truncate">${escapeHtml(h.title)}</div>
                    <div class="t-xs text-tertiary t-num mt-1">${h.t}</div>
                </div>
                <div class="flex items-center gap-4 shrink-0">
                    <span class="t-xs t-mono text-secondary">${h.d}</span>
                    <span class="t-xs t-medium ${tone.text}">${tone.label}</span>
                </div>
            </div>
        </li>
    `;
}

function automationItemHtml(a) {
    return `
        <li class="px-4 py-3 hover:bg-hover">
            <div class="flex items-center justify-between gap-2">
                <a href="#/automation" class="t-sm hover:underline t-truncate">${escapeHtml(a.name)}</a>
                <span class="badge badge-neutral shrink-0">${a.trig}</span>
            </div>
            <div class="t-xs text-secondary mt-1">${escapeHtml(a.next)}</div>
        </li>
    `;
}
