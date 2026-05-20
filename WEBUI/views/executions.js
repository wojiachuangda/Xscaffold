// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Executions view with status filter, pagination, and on-demand fetch
'use strict';

import { api } from '../lib/api.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, formatDuration, formatTime, showToast } from '../lib/utils.js';
import {
    bindActionButtons,
    bindResourceItems,
    emptyHtml,
    executionActionsHtml,
    metricGridHtml,
    resourceItemHtml,
    setPane,
    statusBadge,
    statusTone,
} from './components.js';

const STATUS_OPTIONS = ['ALL', 'PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT'];

export async function fetchExecutions() {
    const params = buildQuery();
    const payload = await api(`/workflows/executions?${params.toString()}`);
    state.executions = payload.data || [];
    state.executionsTotal = payload.meta?.total ?? state.executions.length;
}

export function renderExecutions() {
    ensureSelected();
    const range = describeRange();
    setPane('Executions', range, filterBarHtml());
    els.resourceList.innerHTML =
        state.executions.map(executionItemHtml).join('') || emptyHtml('No executions loaded');
    renderExecutionDetail(findSelected(), 'Workspace / Executions');
    bindFilterControls();
    bindResourceItems();
    bindActionButtons();
}

function buildQuery() {
    const params = new URLSearchParams();
    const { status, workflowId } = state.executionsFilter;
    if (status && status !== 'ALL') {
        params.set('status', status);
    }
    if (workflowId) {
        params.set('workflowId', workflowId);
    }
    params.set('limit', String(state.executionsLimit));
    params.set('offset', String(state.executionsOffset));
    return params;
}

function describeRange() {
    const total = state.executionsTotal;
    if (!total) {
        return '0 executions';
    }
    const from = state.executionsOffset + 1;
    const to = Math.min(state.executionsOffset + state.executionsLimit, total);
    return `${from}–${to} of ${total}`;
}

function filterBarHtml() {
    const statusOptions = STATUS_OPTIONS.map(
        (value) =>
            `<option value="${value}" ${value === state.executionsFilter.status ? 'selected' : ''}>${value}</option>`,
    ).join('');
    const prevDisabled = state.executionsOffset <= 0 ? 'disabled' : '';
    const nextDisabled =
        state.executionsOffset + state.executionsLimit >= state.executionsTotal ? 'disabled' : '';
    return `
        <label class="filter-label">Status
            <select id="executionStatusFilter" class="input compact">${statusOptions}</select>
        </label>
        <label class="filter-label">Workflow
            <input id="executionWorkflowFilter" class="input compact" value="${escapeHtml(state.executionsFilter.workflowId)}" placeholder="workflow id">
        </label>
        <button id="executionPrevBtn" class="secondary-button" type="button" ${prevDisabled}>Prev</button>
        <button id="executionNextBtn" class="secondary-button" type="button" ${nextDisabled}>Next</button>
    `;
}

function executionItemHtml(execution) {
    return resourceItemHtml({
        id: execution.id,
        title: execution.workflowId,
        subtitle: execution.error?.message || formatTime(execution.startedAt),
        status: statusTone(execution.status),
        meta: execution.status,
        selected: execution.id === state.selectedId,
    });
}

function renderExecutionDetail(execution, crumb) {
    els.detailCrumb.textContent = crumb;
    els.detailTitle.textContent = execution ? execution.id : 'No execution selected';
    els.detailActions.innerHTML = execution ? executionActionsHtml(execution) : '';
    els.detailContent.innerHTML = execution
        ? executionDetailHtml(execution)
        : emptyHtml('No execution selected');
}

function executionDetailHtml(execution) {
    return `
        <section class="section">${metricGridHtml([
            ['Status', execution.status, 'execution state'],
            ['Workflow', execution.workflowId, 'source'],
            ['Duration', formatDuration(execution.durationMs), 'runtime'],
            ['Finished', formatTime(execution.finishedAt), 'timestamp'],
        ])}</section>
        <section class="section">
            <h2 class="section-title">Error</h2>
            <pre class="code-block">${escapeHtml(JSON.stringify(execution.error || {}, null, 2))}</pre>
        </section>
        <section class="section">
            <h2 class="section-title">Result</h2>
            <pre class="code-block">${escapeHtml(JSON.stringify(execution.result || {}, null, 2))}</pre>
        </section>
    `;
}

function ensureSelected() {
    if (state.selectedId && state.executions.some((item) => item.id === state.selectedId)) {
        return;
    }
    state.selectedId = state.executions[0]?.id || null;
}

function findSelected() {
    return state.executions.find((item) => item.id === state.selectedId) || null;
}

function bindFilterControls() {
    document.getElementById('executionStatusFilter')?.addEventListener('change', (event) => {
        state.executionsFilter.status = event.target.value;
        state.executionsOffset = 0;
        reloadAndRender();
    });
    document.getElementById('executionWorkflowFilter')?.addEventListener('change', (event) => {
        state.executionsFilter.workflowId = event.target.value.trim();
        state.executionsOffset = 0;
        reloadAndRender();
    });
    document.getElementById('executionPrevBtn')?.addEventListener('click', () => shiftPage(-1));
    document.getElementById('executionNextBtn')?.addEventListener('click', () => shiftPage(1));
}

function shiftPage(direction) {
    const next = state.executionsOffset + direction * state.executionsLimit;
    state.executionsOffset = Math.max(0, next);
    reloadAndRender();
}

async function reloadAndRender() {
    try {
        await fetchExecutions();
    } catch (err) {
        showToast(err.message || 'Failed to load executions');
    }
    renderExecutions();
}
