// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Automation view — live workflows from /workflows + execution history; cron/next-run/agent-binding/IOO toggle are mock
'use strict';

import { runWorkflow } from '../lib/actions.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatDuration, formatTime, showToast } from '../lib/utils.js';

const TRIGGER_MAP = {
    cron: { badge: 'badge-neutral', dot: 'dot-success', desc: 'every 5m' },
    webhook: { badge: 'badge-neutral', dot: 'dot-success', desc: 'awaiting POST' },
    event: { badge: 'badge-neutral', dot: 'dot-success', desc: 'on event' },
    manual: { badge: 'badge-neutral', dot: 'dot-neutral', desc: 'on-demand only' },
};

const SPARK = [8, 9, 8, 9, 3, 9, 8, 9, 9, 8, 9, 9, 8, 9, 8, 9];

export function renderAutomation() {
    const workflows = state.workflows || [];
    els.viewBody.innerHTML = shellHtml(workflows);
    if (workflows.length === 0) {
        return;
    }
    renderList(workflows);
    const selected = pickSelected(workflows);
    renderDetail(selected);
}

function pickSelected(workflows) {
    if (workflows.length === 0) {
        return null;
    }
    const found = workflows.find((w) => w.id === state.selectedId);
    return found || workflows[0];
}

function inferTrigger(workflow) {
    if (workflow.id?.includes('webhook')) {
        return 'webhook';
    }
    if (workflow.id?.includes('digest')) {
        return 'manual';
    }
    return 'manual';
}

function shellHtml(workflows) {
    return `
        <aside class="w-list-wide bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <div class="flex items-center gap-2">
                    <span class="t-base">Automations</span>
                    <span class="t-xs text-tertiary">${workflows.length}</span>
                </div>
                <button class="btn btn-primary focus-ring" disabled>+ New</button>
            </div>
            <ul id="au-list" class="flex-1 overflow-y-auto scroll-thin">${workflows.length === 0 ? '<li class="empty">No workflows loaded</li>' : ''}</ul>
            <div class="px-4 py-2 bd-t t-xs text-tertiary">${workflows.length} workflows · auto-loaded from <span class="t-mono">workflows/</span></div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="au-detail" class="flex-1 overflow-y-auto scroll-thin"></div>
        </main>
    `;
}

function renderList(workflows) {
    const ul = document.getElementById('au-list');
    ul.innerHTML = workflows.map((w) => workflowRowHtml(w, w.id === state.selectedId)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => {
            state.selectedId = li.dataset.id;
            ul.querySelectorAll('li[data-id]').forEach((n) => n.classList.toggle('row-sel', n.dataset.id === state.selectedId));
            renderDetail(workflows.find((w) => w.id === state.selectedId));
        });
    });
}

function workflowRowHtml(workflow, selected) {
    const trig = inferTrigger(workflow);
    const tmap = TRIGGER_MAP[trig];
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(workflow.id)}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tmap.dot} shrink-0"></span>
                <span class="t-sm t-medium t-truncate flex-1">${escapeHtml(workflow.id)}</span>
                <span class="badge ${tmap.badge} shrink-0">${trig}</span>
            </div>
            <div class="flex items-center justify-between mt-1 pl-4">
                <span class="t-xs text-secondary t-truncate">${escapeHtml(workflow.description || `version ${workflow.version || '1.0'}`)}</span>
                <span class="t-xs text-tertiary t-num shrink-0">${tmap.desc}</span>
            </div>
        </li>
    `;
}

function renderDetail(workflow) {
    const target = document.getElementById('au-detail');
    if (!workflow) {
        target.innerHTML = '<div class="empty">Select an automation</div>';
        return;
    }
    const trig = inferTrigger(workflow);
    const tmap = TRIGGER_MAP[trig];
    target.innerHTML = `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0 sticky top-0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${tmap.dot}"></span>
                <h1 class="t-base t-truncate">${escapeHtml(workflow.id)}</h1>
                <span class="badge ${tmap.badge}">${trig}</span>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary t-mono">${escapeHtml(workflow.version || '1.0')}</span>
            </div>
            <div class="flex items-center gap-2">
                <button class="btn btn-secondary focus-ring" disabled>Disable</button>
                <button id="au-run" class="btn btn-primary focus-ring">Run now</button>
            </div>
        </header>
        <section class="px-6 py-6 bd-b">
            <div class="t-xs t-upper t-medium text-tertiary mb-1">Description</div>
            <p class="t-sm max-w-list-wide">${escapeHtml(workflow.description || 'No description provided.')}</p>
        </section>
        ${triggerSectionHtml(workflow, trig)}
        ${historySectionHtml()}
    `;
    document.getElementById('au-run').addEventListener('click', () => triggerRun(workflow.id));
    renderSpark();
}

function renderSpark() {
    const w = document.getElementById('au-spark');
    if (!w) {
        return;
    }
    const max = Math.max(...SPARK);
    w.innerHTML = SPARK.map(
        (v) =>
            `<div class="w-1 rounded-sm ${v < 5 ? 'bg-error' : 'bg-n400'}" style="height:${Math.max((v / max) * 100, 15)}%"></div>`,
    ).join('');
}

async function triggerRun(workflowId) {
    try {
        await runWorkflow(workflowId, { input: {} });
    } catch (err) {
        showToast(err.message || 'Failed to trigger workflow');
    }
}

function triggerSectionHtml(workflow, trig) {
    return `
        <section class="grid grid-cols-2 gap-6 p-6 bd-b">
            <div class="card">
                <div class="h-8 px-4 flex items-center justify-between bd-b">
                    <span class="t-sm t-medium">Trigger</span>
                    <span class="badge badge-neutral">${trig}</span>
                </div>
                <div class="p-4 flex flex-col gap-3">
                    <div>
                        <div class="t-xs t-upper t-medium text-tertiary mb-2">Schedule</div>
                        <div class="bg-soft bd rounded p-3 t-mono t-sm">${escapeHtml(trig === 'cron' ? '*/5 * * * *  — every 5 minutes' : 'manual trigger only')}</div>
                    </div>
                    <dl class="grid grid-cols-2 gap-y-2 t-xs">
                        <dt class="text-tertiary">Workflow id</dt><dd class="t-mono">${escapeHtml(workflow.id)}</dd>
                        <dt class="text-tertiary">Nodes</dt><dd class="t-num">${workflow.nodes || workflow.nodeCount || '—'}</dd>
                        <dt class="text-tertiary">Version</dt><dd class="t-mono">${escapeHtml(workflow.version || '1.0')}</dd>
                        <dt class="text-tertiary">Source</dt><dd>workflows/</dd>
                    </dl>
                </div>
            </div>
            <div class="card">
                <div class="h-8 px-4 flex items-center bd-b"><span class="t-sm t-medium">Linked Agent</span></div>
                <div class="p-4">
                    <p class="t-sm text-secondary">Agent binding is inferred per node; see Agents view for full registry.</p>
                    <div class="mt-4 pt-3 bd-t flex items-center justify-between">
                        <div>
                            <div class="t-sm">Issue Output Mode</div>
                            <div class="t-xs text-secondary mt-1">Failures land in Inbox</div>
                        </div>
                        <button id="ioo-switch" class="switch is-on focus-ring" role="switch" aria-checked="true" aria-label="Issue Output Mode"></button>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function historySectionHtml() {
    const executions = (state.executions || []).slice(0, 8);
    return `
        <section class="px-6 py-6">
            <div class="card">
                <div class="h-8 px-4 flex items-center justify-between bd-b">
                    <div class="flex items-center gap-2"><span class="t-sm t-medium">Execution History</span><span class="t-xs text-tertiary">·</span><span class="t-xs text-secondary">last ${executions.length} runs · live</span></div>
                    <div class="flex items-center gap-3">
                        <span class="t-xs text-secondary">mock spark</span>
                        <div class="flex items-end gap-1 h-6" id="au-spark"></div>
                    </div>
                </div>
                <table class="w-full t-xs">
                    <thead class="bg-soft text-tertiary t-upper t-medium">
                        <tr>
                            <th class="text-left px-4 py-2">Run ID</th>
                            <th class="text-left px-4 py-2">Started</th>
                            <th class="text-left px-4 py-2">Workflow</th>
                            <th class="text-right px-4 py-2">Duration</th>
                            <th class="text-right px-4 py-2 pr-6">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-bd">${executions.map(historyRowHtml).join('') || '<tr><td colspan="5" class="empty">No recent executions</td></tr>'}</tbody>
                </table>
            </div>
        </section>
    `;
}

function historyRowHtml(e) {
    const ok = e.status === 'SUCCESS';
    const cls = ok ? 'text-success' : 'text-error';
    const label = ok ? 'ok' : (e.status || '').toLowerCase();
    return `
        <tr class="hover:bg-hover">
            <td class="px-4 py-3 t-mono text-secondary">${escapeHtml(e.id)}</td>
            <td class="px-4 py-3 t-num">${escapeHtml(formatTime(e.startedAt))}</td>
            <td class="px-4 py-3 text-secondary">${escapeHtml(e.workflowId)}</td>
            <td class="px-4 py-3 text-right t-num t-mono">${escapeHtml(formatDuration(e.durationMs))}</td>
            <td class="px-4 py-3 text-right pr-6"><span class="t-xs t-medium ${cls}">${escapeHtml(label)}</span></td>
        </tr>
    `;
}

