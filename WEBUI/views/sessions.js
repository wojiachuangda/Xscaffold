// [ui] ID: WEBUI-V2-SESSIONS | Date: 2026-05-21 | Description: Sessions view — per-agent invocation log; localStorage-backed structured cells (prompt/turns/answer)
'use strict';

import { api } from '../lib/api.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatTime, showToast } from '../lib/utils.js';

const LIST_KEY = 'xscaffold.session.list';
const cellsKey = (id) => `xscaffold.session.${id}.cells`;

// ---- localStorage 会话层 ------------------------------------------------

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (_err) {
        return false;
    }
}

function loadSessionList() {
    return readJson(LIST_KEY, []);
}

function loadCells(id) {
    return readJson(cellsKey(id), []);
}

function createSession(agent, topic) {
    const id = `sess_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const meta = {
        id,
        agentId: agent.id,
        agentName: agent.name,
        topic: topic || 'Untitled session',
        createdAt: new Date().toISOString(),
        cellCount: 0,
    };
    writeJson(LIST_KEY, [meta, ...loadSessionList()]);
    writeJson(cellsKey(id), []);
    return meta;
}

function deleteSession(id) {
    writeJson(LIST_KEY, loadSessionList().filter((s) => s.id !== id));
    try {
        localStorage.removeItem(cellsKey(id));
    } catch (_err) {
        /* localStorage 不可用，忽略 */
    }
}

function renameSession(id, topic) {
    const next = loadSessionList().map((s) => (s.id === id ? { ...s, topic } : s));
    writeJson(LIST_KEY, next);
}

function appendCell(id, cell) {
    const cells = [...loadCells(id), cell];
    if (!writeJson(cellsKey(id), cells)) {
        return false;
    }
    const next = loadSessionList().map((s) => (s.id === id ? { ...s, cellCount: cells.length } : s));
    writeJson(LIST_KEY, next);
    return true;
}

// ---- 渲染 ---------------------------------------------------------------

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
            <div id="se-detail" class="flex-1 flex flex-col overflow-hidden"></div>
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
        <div id="se-cells" class="flex-1 overflow-y-auto scroll-thin px-6 py-6 flex flex-col gap-4">${body}</div>
        <div class="bd-t p-4 bg-panel shrink-0">
            <textarea id="se-prompt" class="input-area" rows="3" placeholder="给 ${escapeHtml(session.agentName)} 一条指令…"></textarea>
            <div class="flex items-center gap-2 mt-2">
                <button id="se-send" class="btn btn-primary focus-ring">Send</button>
                <span id="se-hint" class="t-xs text-tertiary">每条 prompt 独立 invoke（无自动续话）</span>
            </div>
        </div>
    `;
}

function cellHtml(cell, index) {
    return `
        <div class="card">
            <div class="h-8 px-4 flex items-center justify-between bd-b">
                <span class="t-sm t-medium">Cell ${index + 1}</span>
                <span class="t-xs text-tertiary t-num">${escapeHtml(formatTime(cell.invokedAt))}</span>
            </div>
            <div class="p-4">
                <div class="t-xs t-upper t-medium text-tertiary mb-1">Prompt</div>
                <div class="t-sm mb-3">${escapeHtml(cell.prompt)}</div>
                ${cell.error ? `<div class="t-sm text-error">${escapeHtml(cell.error)}</div>` : resultBlock(cell)}
            </div>
        </div>
    `;
}

function resultBlock(cell) {
    const turns = (cell.turns || []).map(turnHtml).join('');
    return `
        <ol class="flex flex-col gap-2">${turns}</ol>
        <div class="bg-soft bd rounded p-3 mt-3 t-sm">${escapeHtml(cell.content || '(empty)')}</div>
        <div class="t-xs text-tertiary mt-2">stop: ${escapeHtml(cell.stopReason || '—')} · turns: ${(cell.turns || []).length} · tokens: ${cell.tokenUsage?.total ?? 0}</div>
    `;
}

function turnHtml(turn) {
    if (!turn.toolCalls || turn.toolCalls.length === 0) {
        return `
            <li class="tl">
                <span class="tl-dot dot-success"></span>
                <div class="t-sm">turn ${turn.turnIndex} · final answer</div>
            </li>
        `;
    }
    const calls = turn.toolCalls
        .map((tc, i) => {
            const obs = turn.observations?.[i];
            const ok = obs?.ok;
            const detail = ok ? 'ok' : escapeHtml(obs?.error || 'failed');
            return `<div class="t-xs ${ok ? 'text-success' : 'text-error'} t-mono">→ ${escapeHtml(tc.name)} · ${detail}</div>`;
        })
        .join('');
    return `
        <li class="tl">
            <span class="tl-dot dot-neutral"></span>
            <div class="t-sm">turn ${turn.turnIndex} · ${turn.toolCalls.length} tool call(s)</div>
            <div class="mt-1 flex flex-col gap-1">${calls}</div>
        </li>
    `;
}

// ---- 交互 ---------------------------------------------------------------

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
    sendBtn?.addEventListener('click', () => sendPrompt(session, sendBtn, promptEl));
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
}

async function sendPrompt(session, sendBtn, promptEl) {
    const prompt = (promptEl?.value || '').trim();
    if (!prompt) {
        showToast('请输入指令');
        return;
    }
    setBusy(sendBtn, true);
    const cell = { prompt, invokedAt: new Date().toISOString(), turns: [], content: '', stopReason: null, tokenUsage: null, error: null };
    try {
        const payload = await api(`/agents/${session.agentId}/invoke`, { method: 'POST', body: { prompt, sessionId: session.id } });
        const data = payload.data || {};
        cell.turns = data.turns || [];
        cell.content = data.content || '';
        cell.stopReason = data.stopReason || null;
        cell.tokenUsage = data.tokenUsage || null;
    } catch (err) {
        cell.error = err.message || 'invoke failed';
    }
    if (!appendCell(session.id, cell)) {
        showToast('localStorage 写入失败（可能已满），本次结果未保存');
    }
    renderSessions();
}

function setBusy(sendBtn, busy) {
    if (sendBtn) {
        sendBtn.disabled = busy;
        sendBtn.textContent = busy ? 'Running…' : 'Send';
    }
    const hint = document.getElementById('se-hint');
    if (hint && busy) {
        hint.textContent = 'agent thinking…（可能数秒到数十秒）';
    }
}
