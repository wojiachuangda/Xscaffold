// [refactor] ID: WEBUI-SESSIONS-SPLIT | Date: 2026-05-21 | Description: Sessions 视图入口——shell/列表/详情渲染 + 事件绑定；流式逻辑下沉 streamRunner（经回调注入 renderDetail）
'use strict';

import { els } from '../../lib/dom.js';
import { openModal } from '../../lib/modal.js';
import { state } from '../../lib/state.js';
import { escapeHtml, formatTime, showToast } from '../../lib/utils.js';
import { createSession, deleteSession, loadCells, loadSessionList, renameSession } from './store.js';
import { cellHtml } from './cellRender.js';
import { sendPrompt } from './streamRunner.js';

export function renderSessions() {
    const sessions = loadSessionList();
    els.viewBody.innerHTML = shellHtml(sessions, state.agents || []);
    bindNewSession();
    if (sessions.length === 0) {
        renderDetail(null);
        return;
    }
    renderList(sessions);
    const selected = sessions.find((s) => s.id === state.selectedId) || sessions[0];
    state.selectedId = selected.id;
    renderDetail(selected);
}

function shellHtml(sessions, agents) {
    const options = agents.length > 0
        ? agents.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')
        : '<option value="">（无可用 agent）</option>';
    return `
        <aside class="w-list bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <span class="t-base">Sessions</span>
                <button id="se-new" class="btn btn-ghost btn-icon focus-ring" title="New session"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
            <div id="se-newform" class="hidden px-4 py-3 bd-b flex flex-col gap-2">
                <select id="se-agent" class="input compact">${options}</select>
                <input id="se-topic" class="input compact" placeholder="主题（可选）">
                <button id="se-create" class="btn btn-primary focus-ring">Create</button>
            </div>
            <ul id="se-list" class="flex-1 overflow-y-auto scroll-thin">${sessions.length === 0 ? '<li class="empty">No sessions</li>' : ''}</ul>
            <div class="px-4 py-2 bd-t t-xs text-tertiary">${sessions.length} sessions · local</div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <div id="se-detail" class="flex-1 min-h-0 flex flex-col overflow-hidden"></div>
        </main>
    `;
}

function renderList(sessions) {
    const ul = document.getElementById('se-list');
    ul.innerHTML = sessions.map((s) => sessionRowHtml(s, s.id === state.selectedId)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => {
            state.selectedId = li.dataset.id;
            ul.querySelectorAll('li[data-id]').forEach((n) => n.classList.toggle('row-sel', n.dataset.id === state.selectedId));
            renderDetail(sessions.find((s) => s.id === state.selectedId));
        });
    });
}

function sessionRowHtml(session, selected) {
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${escapeHtml(session.id)}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot dot-neutral shrink-0"></span>
                <span class="t-sm t-medium t-truncate">${escapeHtml(session.topic)}</span>
            </div>
            <div class="flex items-center justify-between mt-1 pl-4 gap-2">
                <span class="t-xs text-secondary t-truncate">${escapeHtml(session.agentName)}</span>
                <span class="t-xs text-tertiary shrink-0">${session.cellCount} cells</span>
            </div>
            <div class="t-xs text-tertiary pl-4 mt-1">${escapeHtml(formatTime(session.createdAt))}</div>
        </li>
    `;
}

function renderDetail(session) {
    const target = document.getElementById('se-detail');
    if (!session) {
        target.innerHTML = '<div class="empty">选择一个 session，或在左侧新建</div>';
        return;
    }
    const cells = loadCells(session.id);
    target.innerHTML = detailHtml(session, cells);
    bindDetail(session);
    const cellsEl = document.getElementById('se-cells');
    if (cellsEl) {
        cellsEl.scrollTop = cellsEl.scrollHeight;
    }
}

function detailHtml(session, cells) {
    const body = cells.length === 0
        ? '<div class="empty">还没有 prompt —— 用下方输入框发起第一条</div>'
        : cells.map(cellHtml).join('');
    return `
        <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <input id="se-topic-edit" class="input" value="${escapeHtml(session.topic)}" style="max-width:260px">
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary t-mono t-truncate">${escapeHtml(session.agentName)}</span>
                <span class="t-xs text-tertiary">·</span>
                <span class="t-xs text-secondary">${cells.length} cells</span>
            </div>
            <button id="se-delete" class="btn btn-danger focus-ring">Delete</button>
        </header>
        <div id="se-cells" class="flex-1 min-h-0 overflow-y-auto scroll-thin px-6 py-6 flex flex-col gap-4">${body}</div>
        <div class="bd-t p-4 bg-panel shrink-0">
            <textarea id="se-prompt" class="input-area" rows="3" placeholder="给 ${escapeHtml(session.agentName)} 一条指令…"></textarea>
            <div class="flex items-center gap-2 mt-2">
                <button id="se-send" class="btn btn-primary focus-ring">Send</button>
                <span id="se-hint" class="t-xs text-tertiary">Enter 发送 · Shift+Enter 换行 · 无自动续话</span>
            </div>
        </div>
    `;
}

function bindNewSession() {
    document.getElementById('se-new')?.addEventListener('click', () => {
        document.getElementById('se-newform')?.classList.toggle('hidden');
    });
    document.getElementById('se-create')?.addEventListener('click', () => {
        const agentId = document.getElementById('se-agent')?.value;
        const agent = (state.agents || []).find((a) => a.id === agentId);
        if (!agent) {
            showToast('没有可用 agent，请先在 Agents 创建');
            return;
        }
        const topic = document.getElementById('se-topic')?.value.trim();
        const meta = createSession(agent, topic);
        state.selectedId = meta.id;
        renderSessions();
    });
}

function bindDetail(session) {
    const sendBtn = document.getElementById('se-send');
    const promptEl = document.getElementById('se-prompt');
    const ui = { sendBtn, promptEl };
    const onFallbackRender = () => renderDetail(session);
    sendBtn?.addEventListener('click', () => sendPrompt(session, ui, onFallbackRender));
    promptEl?.addEventListener('keydown', (event) => {
        // Enter 发送；Shift+Enter 走 textarea 默认换行；IME 候选词确认时
        // event.isComposing=true，跳过避免把候选词当成发送指令。
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
            return;
        }
        event.preventDefault();
        if (sendBtn?.disabled) {
            return;
        }
        sendPrompt(session, ui, onFallbackRender);
    });
    document.getElementById('se-delete')?.addEventListener('click', () => {
        if (!confirm(`删除 session「${session.topic}」?`)) {
            return;
        }
        deleteSession(session.id);
        state.selectedId = null;
        renderSessions();
    });
    const topicEl = document.getElementById('se-topic-edit');
    topicEl?.addEventListener('change', () => {
        renameSession(session.id, topicEl.value.trim() || 'Untitled session');
        renderSessions();
    });
    bindCellsContainer();
}

function bindCellsContainer() {
    const container = document.getElementById('se-cells');
    if (!container) {
        return;
    }
    container.addEventListener('click', handleCellAction);
}

function handleCellAction(event) {
    const btn = event.target.closest('button[data-action="view-json"]');
    if (!btn) {
        return;
    }
    const cellIndex = Number(btn.dataset.cellIndex);
    const cells = loadCells(state.selectedId);
    const cell = cells[cellIndex];
    if (!cell) {
        return;
    }
    openModal(
        `Cell ${cellIndex + 1} · ${state.selectedId}`,
        `${(cell.turns || []).length} turns · ${cell.tokenUsage?.total ?? 0} tokens · ${cell.stopReason ?? '—'}`,
        JSON.stringify(cell, null, 2),
    );
}
