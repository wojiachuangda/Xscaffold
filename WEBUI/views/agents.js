// [ui] ID: WEBUI-V2.3-AGENTS | Date: 2026-05-21 | Description: Agents 只读档案页——三栏 list(Active/Disabled 分组) + 详情 Profile + Skills；全部来自 GET /agents
'use strict';

import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatTime } from '../lib/utils.js';

const STATUS_DOT = { enabled: 'dot-success', disabled: 'dot-neutral' };

export function renderAgents() {
    const agents = state.agents || [];
    els.viewBody.innerHTML = shellHtml(agents);
    if (agents.length === 0) {
        renderDetailEmpty();
        return;
    }
    renderList(agents);
    const selected = agents.find((a) => a.id === state.selectedId) || agents[0];
    state.selectedId = selected.id;
    renderDetail(selected);
}

function shellHtml(agents) {
    const active = agents.filter((a) => a.status === 'enabled').length;
    const disabled = agents.length - active;
    return `
        <aside class="w-list bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center bd-b"><span class="t-base">Agents</span></div>
            <div class="px-4 pt-3 pb-1 t-xs t-upper t-medium text-tertiary">Active · ${active}</div>
            <ul id="ag-list" class="overflow-y-auto scroll-thin">${agents.length === 0 ? '<li class="empty">No agents</li>' : ''}</ul>
            <div class="px-4 pt-3 pb-1 t-xs t-upper t-medium text-tertiary">Disabled · ${disabled}</div>
            <ul id="ag-list-disabled" class="flex-1 overflow-y-auto scroll-thin"></ul>
            <div class="px-4 py-2 bd-t t-xs text-tertiary">read-only · /agents</div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="ag-detail" class="flex-1 overflow-y-auto scroll-thin"></div>
        </main>
    `;
}

function renderList(agents) {
    const active = document.getElementById('ag-list');
    const disabled = document.getElementById('ag-list-disabled');
    if (!active || !disabled) {
        return;
    }
    active.innerHTML = '';
    disabled.innerHTML = '';
    agents.forEach((agent) => {
        const target = agent.status === 'enabled' ? active : disabled;
        target.insertAdjacentHTML('beforeend', agentRowHtml(agent, agent.id === state.selectedId));
    });
    document.querySelectorAll('#ag-list li[data-id], #ag-list-disabled li[data-id]').forEach((li) => {
        li.addEventListener('click', () => selectAgent(agents, li.dataset.id));
    });
}

function selectAgent(agents, id) {
    state.selectedId = id;
    document.querySelectorAll('#ag-list li[data-id], #ag-list-disabled li[data-id]').forEach((li) => {
        li.classList.toggle('row-sel', li.dataset.id === id);
    });
    const agent = agents.find((a) => a.id === id);
    if (agent) {
        renderDetail(agent);
    }
}

function agentRowHtml(agent, selected) {
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(agent.id)}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${STATUS_DOT[agent.status] || 'dot-neutral'} shrink-0"></span>
                <span class="t-sm t-medium t-truncate">${escapeHtml(agent.name)}</span>
            </div>
            <div class="t-xs text-secondary t-mono pl-4 mt-1 t-truncate">${escapeHtml(agent.model)}</div>
        </li>
    `;
}

function renderDetail(agent) {
    const target = document.getElementById('ag-detail');
    if (!target) {
        return;
    }
    target.innerHTML = `
        ${detailHeaderHtml(agent)}
        <div class="flex-1 min-h-0 overflow-y-auto scroll-thin">
            ${profileSectionHtml(agent)}
            ${skillsSectionHtml(agent)}
        </div>
    `;
    document.getElementById('ag-open-sessions')?.addEventListener('click', () => {
        window.location.hash = '#/sessions';
    });
}

function renderDetailEmpty() {
    const target = document.getElementById('ag-detail');
    if (target) {
        target.innerHTML = '<div class="empty">没有 agent</div>';
    }
}

function detailHeaderHtml(agent) {
    return `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <h1 class="t-base t-truncate">${escapeHtml(agent.name)}</h1>
                <span class="flex items-center gap-2">
                    <span class="dot ${STATUS_DOT[agent.status] || 'dot-neutral'}"></span>
                    <span class="t-sm text-secondary">${escapeHtml(agent.status)}</span>
                </span>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary t-mono">${escapeHtml(agent.id)}</span>
            </div>
            <button id="ag-open-sessions" class="btn btn-secondary focus-ring">Open in Sessions</button>
        </header>
    `;
}

function profileSectionHtml(agent) {
    return `
        <section class="px-6 py-6 bd-b">
            <div class="t-xs t-upper t-medium text-tertiary mb-3">Profile</div>
            <dl class="grid grid-cols-3 gap-x-6 gap-y-4 mb-6">
                <div><dt class="t-xs t-upper t-medium text-tertiary mb-1">Model</dt><dd class="t-sm t-mono">${escapeHtml(agent.model)}</dd></div>
                <div><dt class="t-xs t-upper t-medium text-tertiary mb-1">Status</dt><dd class="t-sm">${escapeHtml(agent.status)}</dd></div>
                <div><dt class="t-xs t-upper t-medium text-tertiary mb-1">Updated</dt><dd class="t-sm t-num">${escapeHtml(formatTime(agent.updatedAt))}</dd></div>
            </dl>
            <div class="t-xs t-upper t-medium text-tertiary mb-2">Description</div>
            <p class="t-sm">${escapeHtml(agent.description || 'No description provided.')}</p>
            <div class="t-xs text-tertiary mt-4 t-num">created ${escapeHtml(formatTime(agent.createdAt))}</div>
        </section>
    `;
}

function skillsSectionHtml(agent) {
    const tools = agent.tools || [];
    const body = tools.length === 0
        ? '<span class="t-xs text-tertiary">No tools bound</span>'
        : tools.map((t) => `<span class="badge badge-neutral t-mono">${escapeHtml(t)}</span>`).join('');
    return `
        <section class="px-6 py-6">
            <div class="flex items-baseline justify-between mb-3">
                <div class="t-xs t-upper t-medium text-tertiary">Skills</div>
                <span class="t-xs text-tertiary">${tools.length === 0 ? 'No tools bound' : `${tools.length} tools bound`}</span>
            </div>
            <div class="flex flex-wrap gap-2">${body}</div>
        </section>
    `;
}
