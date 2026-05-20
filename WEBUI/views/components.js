// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Shared HTML fragment helpers + resource-list/action button binders
'use strict';

import { openExecutionTrace, openRuntimeLog } from '../lib/actions.js';
import { els } from '../lib/dom.js';
import { navigate } from '../lib/router.js';
import { state, terminalStatuses } from '../lib/state.js';
import { escapeAttr, escapeHtml, formatTime } from '../lib/utils.js';

export function setPane(title, meta, filtersHtml) {
    els.resourceTitle.textContent = title;
    els.resourceMeta.textContent = meta;
    els.filterBar.innerHTML = filtersHtml || '';
}

export function emptyHtml(message) {
    return `<div class="empty">${escapeHtml(message)}</div>`;
}

export function statusBadge(status) {
    return `<span class="badge ${statusTone(status)}">${escapeHtml(status)}</span>`;
}

export function statusTone(status) {
    if (status === 'SUCCESS') {
        return 'success';
    }
    if (status === 'RUNNING' || status === 'PENDING') {
        return 'running';
    }
    if (terminalStatuses.has(status)) {
        return 'error';
    }
    return 'idle';
}

export function resourceItemHtml(item) {
    return `
        <button
            class="resource-item ${item.selected ? 'selected' : ''}"
            type="button"
            data-select="${escapeAttr(item.id)}"
        >
            <span class="dot ${item.status}"></span>
            <span>
                <span class="item-title">${escapeHtml(item.title)}</span>
                <span class="item-subtitle">${escapeHtml(item.subtitle)}</span>
            </span>
            <span class="meta">${escapeHtml(item.meta)}</span>
        </button>
    `;
}

export function metricGridHtml(metrics) {
    return `<div class="metric-grid">${metrics.map(metricHtml).join('')}</div>`;
}

function metricHtml(metric) {
    return `
        <div class="metric">
            <div class="meta">${escapeHtml(metric[0])}</div>
            <div class="metric-value">${escapeHtml(metric[1])}</div>
            <div class="meta">${escapeHtml(metric[2])}</div>
        </div>
    `;
}

export function executionTableHtml(items) {
    if (!items.length) {
        return emptyHtml('No executions loaded');
    }
    const rows = items.map(executionRowHtml).join('');
    return `
        <table class="table">
            <thead><tr><th>ID</th><th>Status</th><th>Workflow</th><th>Started</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function executionRowHtml(item) {
    return `
        <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${escapeHtml(item.workflowId)}</td>
            <td>${escapeHtml(formatTime(item.startedAt))}</td>
        </tr>
    `;
}

export function executionActionsHtml(execution) {
    return `
        <button class="secondary-button" data-action="trace" data-id="${escapeAttr(execution.id)}">
            View logs
        </button>
    `;
}

export function bindResourceItems() {
    els.resourceList.querySelectorAll('[data-select]').forEach((item) => {
        item.addEventListener('click', () => navigate(state.view, item.dataset.select));
    });
}

export function bindActionButtons() {
    bindAction('viewLogs', () => openRuntimeLog());
    bindAction('trace', (button) => openExecutionTrace(button.dataset.id));
    bindAction('runWorkflow', () => document.getElementById('workflowForm')?.requestSubmit());
    bindAction('runAssistant', () => document.getElementById('assistantForm')?.requestSubmit());
}

function bindAction(name, handler) {
    document.querySelectorAll(`[data-action="${name}"]`).forEach((button) => {
        button.addEventListener('click', () => handler(button));
    });
}
