// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Inbox view filtering executions with terminal failure states (V2.3 to add resolve flow)
'use strict';

import { els } from '../lib/dom.js';
import { issueStatuses, state } from '../lib/state.js';
import { escapeHtml, formatDuration, formatTime } from '../lib/utils.js';
import {
    bindActionButtons,
    bindResourceItems,
    emptyHtml,
    executionActionsHtml,
    metricGridHtml,
    resourceItemHtml,
    setPane,
    statusTone,
} from './components.js';

export function renderInbox() {
    const issues = state.executions.filter((item) => issueStatuses.has(item.status));
    ensureSelected(issues);
    setPane('Inbox', `${issues.length} execution issues`, inboxFilters());
    els.resourceList.innerHTML = issues.map(issueItemHtml).join('') || emptyHtml('No execution issues');
    const selected = issues.find((item) => item.id === state.selectedId) || null;
    renderInboxDetail(selected);
    bindResourceItems();
    bindActionButtons();
}

function inboxFilters() {
    return ['FAILED', 'STUCK', 'TIMEOUT']
        .map((status) => `<span class="badge error">${status}</span>`)
        .join('');
}

function issueItemHtml(execution) {
    return resourceItemHtml({
        id: execution.id,
        title: execution.workflowId,
        subtitle: execution.error?.message || formatTime(execution.startedAt),
        status: statusTone(execution.status),
        meta: execution.status,
        selected: execution.id === state.selectedId,
    });
}

function renderInboxDetail(execution) {
    els.detailCrumb.textContent = 'Inbox';
    els.detailTitle.textContent = execution ? execution.id : 'No issue selected';
    els.detailActions.innerHTML = execution ? executionActionsHtml(execution) : '';
    els.detailContent.innerHTML = execution
        ? issueDetailHtml(execution)
        : emptyHtml('Select an issue from the list');
}

function issueDetailHtml(execution) {
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
    `;
}

function ensureSelected(items) {
    if (state.selectedId && items.some((item) => item.id === state.selectedId)) {
        return;
    }
    state.selectedId = items[0]?.id || null;
}
