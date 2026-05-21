// [refactor] ID: WEBUI-SESSIONS-SPLIT | Date: 2026-05-21 | Description: Sessions cell 纯 HTML builder——cell/turn/live cell 字符串拼接，无 DOM 变更、无 state
'use strict';

import { renderMarkdown } from '../../lib/markdown.js';
import { escapeHtml, formatTime } from '../../lib/utils.js';

export function cellHtml(cell, index) {
    return `
        <div class="card shrink-0">
            <div class="h-8 px-4 flex items-center justify-between bd-b">
                <span class="t-sm t-medium">Cell ${index + 1}</span>
                <div class="flex items-center gap-2">
                    <button data-action="view-json" data-cell-index="${index}" class="btn btn-ghost btn-icon focus-ring" title="View JSON 原文">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                    </button>
                    <span class="t-xs text-tertiary t-num">${escapeHtml(formatTime(cell.invokedAt))}</span>
                </div>
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
    const contentHtml = cell.content
        ? `<div class="md-body">${renderMarkdown(cell.content)}</div>`
        : '<span class="text-tertiary">(empty)</span>';
    return `
        <ol class="flex flex-col gap-2">${turns}</ol>
        <div class="bg-soft bd rounded p-3 mt-3 t-sm">${contentHtml}</div>
        <div class="t-xs text-tertiary mt-2">stop: ${escapeHtml(cell.stopReason || '—')} · turns: ${(cell.turns || []).length} · tokens: ${cell.tokenUsage?.total ?? 0}</div>
    `;
}

export function turnHtml(turn) {
    if (!turn.toolCalls || turn.toolCalls.length === 0) {
        return `
            <li class="tl">
                <span class="tl-dot dot-success"></span>
                <div class="t-sm">turn ${turn.turnIndex} · final</div>
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
    // 带 tool calls 的 turn 同时也可能有 LLM 解释文字（调工具前 / 后的 reasoning）。
    // 不显示就直接吞了——这正是 demo-001 cell 里「好的，我先来全面了解一下…」消失的原因。
    const planning = turn.content
        ? `<div class="md-body t-sm mt-1 text-secondary">${renderMarkdown(turn.content)}</div>`
        : '';
    return `
        <li class="tl">
            <span class="tl-dot dot-neutral"></span>
            <div class="t-sm">turn ${turn.turnIndex} · ${turn.toolCalls.length} tool call(s)</div>
            ${planning}
            <div class="mt-1 flex flex-col gap-1">${calls}</div>
        </li>
    `;
}

export function liveCellHtml(cell, cellIndex) {
    return `
        <div id="se-live-cell" class="card is-live shrink-0">
            <div class="h-8 px-4 flex items-center justify-between bd-b">
                <span class="t-sm t-medium">Cell ${cellIndex}</span>
                <span class="t-xs text-tertiary t-num">${escapeHtml(formatTime(cell.invokedAt))}</span>
            </div>
            <div class="p-4">
                <div class="t-xs t-upper t-medium text-tertiary mb-1">Prompt</div>
                <div class="t-sm mb-3">${escapeHtml(cell.prompt)}</div>
                <ol id="se-live-turns" class="flex flex-col gap-2"></ol>
                <div id="se-live-status" class="t-xs text-tertiary mt-2">agent thinking…</div>
            </div>
        </div>
    `;
}
