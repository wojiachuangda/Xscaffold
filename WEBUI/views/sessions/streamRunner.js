// [refactor] ID: WEBUI-SESSIONS-SPLIT | Date: 2026-05-21 | Description: Sessions 流式运行器——SSE 消费 + live cell 增量 DOM；renderDetail 经回调注入以避免与 index 循环依赖
'use strict';

import { streamSse } from '../../lib/sseClient.js';
import { state } from '../../lib/state.js';
import { showToast } from '../../lib/utils.js';
import { appendCell, loadCells, loadSessionList } from './store.js';
import { cellHtml, liveCellHtml, turnHtml } from './cellRender.js';

export async function sendPrompt(session, ui, onFallbackRender) {
    const { sendBtn, promptEl } = ui;
    const prompt = (promptEl?.value || '').trim();
    if (!prompt) {
        showToast('请输入指令');
        return;
    }
    const streamingSessionId = session.id;
    const cellIndex = loadCells(streamingSessionId).length + 1;
    const cell = createPendingCell(prompt);

    setBusy(sendBtn, true);
    if (promptEl) {
        promptEl.value = '';
    }
    appendLiveCellDom(streamingSessionId, cell, cellIndex);

    try {
        await streamSse(`/agents/${session.agentId}/invoke/stream`, {
            body: { prompt, sessionId: streamingSessionId },
            handlers: {
                onTurn: (event) => handleTurn(cell, streamingSessionId, event),
                onDone: (event) => handleDone(cell, event),
                onError: (event) => {
                    cell.error = event.message;
                },
            },
        });
    } catch (err) {
        cell.error = err.message || 'stream failed';
    }

    if (!appendCell(streamingSessionId, cell)) {
        showToast('localStorage 写入失败（可能已满），本次结果未保存');
    }
    finalizeLiveCellDom(streamingSessionId, cell, cellIndex, onFallbackRender);
    setBusy(sendBtn, false);
}

function createPendingCell(prompt) {
    return {
        prompt,
        invokedAt: new Date().toISOString(),
        turns: [],
        content: '',
        stopReason: null,
        tokenUsage: null,
        error: null,
    };
}

function handleTurn(cell, sessionId, event) {
    const turn = {
        turnIndex: event.turnIndex,
        content: event.content,
        toolCalls: event.toolCalls,
        observations: event.observations,
    };
    cell.turns.push(turn);
    appendTurnRowDom(sessionId, turn);
}

function handleDone(cell, event) {
    cell.content = event.content;
    cell.stopReason = event.stopReason;
    cell.tokenUsage = event.tokenUsage;
}

function appendLiveCellDom(sessionId, cell, cellIndex) {
    if (state.selectedId !== sessionId) {
        return;
    }
    const container = document.getElementById('se-cells');
    if (!container) {
        return;
    }
    const empty = container.querySelector('.empty');
    if (empty) {
        empty.remove();
    }
    container.insertAdjacentHTML('beforeend', liveCellHtml(cell, cellIndex));
    container.scrollTop = container.scrollHeight;
}

function appendTurnRowDom(sessionId, turn) {
    if (state.selectedId !== sessionId) {
        return;
    }
    const list = document.getElementById('se-live-turns');
    if (!list) {
        return;
    }
    list.insertAdjacentHTML('beforeend', turnHtml(turn));
    const container = document.getElementById('se-cells');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function finalizeLiveCellDom(sessionId, cell, cellIndex, onFallbackRender) {
    if (state.selectedId !== sessionId) {
        return;
    }
    const liveCell = document.getElementById('se-live-cell');
    if (liveCell) {
        liveCell.outerHTML = cellHtml(cell, cellIndex - 1);
    } else {
        // 流式期间用户切走过 view —— live cell DOM 已被 viewBody.innerHTML 销毁。
        // 注入的回调走 renderDetail 完整重渲染右侧（header 计数 + cell 列表从最新
        // localStorage 重建）。prompt 输入区被刷为空（sendPrompt 已清空，损失为零）。
        onFallbackRender?.();
    }
    refreshSessionRow(sessionId);
    refreshDetailHeaderCount(sessionId);
    // Markdown finalize 后高度可能比 live cell 大，重新滚一次确保新 cell 可见
    const container = document.getElementById('se-cells');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function refreshDetailHeaderCount(sessionId) {
    const count = loadCells(sessionId).length;
    const header = document.querySelector('#se-detail header');
    if (!header) {
        return;
    }
    const spans = header.querySelectorAll('span.t-xs.text-secondary');
    const cellsSpan = Array.from(spans).find((span) => /cells/u.test(span.textContent || ''));
    if (cellsSpan) {
        cellsSpan.textContent = `${count} cells`;
    }
}

function refreshSessionRow(sessionId) {
    const session = loadSessionList().find((s) => s.id === sessionId);
    if (!session) {
        return;
    }
    const row = document.querySelector(`#se-list li[data-id="${sessionId}"]`);
    if (!row) {
        return;
    }
    const span = row.querySelector('.t-xs.text-tertiary.shrink-0');
    if (span) {
        span.textContent = `${session.cellCount} cells`;
    }
}

function setBusy(sendBtn, busy) {
    if (sendBtn) {
        sendBtn.disabled = busy;
        sendBtn.textContent = busy ? 'Running…' : 'Send';
    }
    const hint = document.getElementById('se-hint');
    if (hint) {
        hint.textContent = busy
            ? 'agent thinking…（可能数秒到数十秒）'
            : 'Enter 发送 · Shift+Enter 换行 · 无自动续话';
    }
}
