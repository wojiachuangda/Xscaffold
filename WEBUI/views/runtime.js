// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Runtime view renderer (health/ready + recent executions)
'use strict';

import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import {
    bindActionButtons,
    bindResourceItems,
    executionTableHtml,
    metricGridHtml,
    resourceItemHtml,
    setPane,
} from './components.js';

export function renderRuntime() {
    setPane('Runtimes', 'Backend runtime state', runtimeFilters());
    els.resourceList.innerHTML = runtimeListHtml();
    els.detailCrumb.textContent = 'Configuration / Runtimes';
    els.detailTitle.textContent = 'Local backend';
    els.detailActions.innerHTML = '<button class="secondary-button" data-action="viewLogs">View logs</button>';
    els.detailContent.innerHTML = runtimeDetailHtml();
    bindResourceItems();
    bindActionButtons();
}

function runtimeFilters() {
    const ready = state.runtime.ready?.status === 'ready';
    return `<span class="badge ${ready ? 'success' : 'warn'}">${ready ? 'ready' : 'not ready'}</span>`;
}

function runtimeListHtml() {
    const ready = state.runtime.ready?.status === 'ready';
    return resourceItemHtml({
        id: 'local',
        title: 'Local backend',
        subtitle: ready ? 'API, queue and database checks passed' : 'Waiting for ready checks',
        status: ready ? 'success' : 'warn',
        meta: 'runtime',
        selected: true,
    });
}

function runtimeDetailHtml() {
    const checks = state.runtime.ready?.checks || {};
    return `
        <section class="section">${metricGridHtml([
            ['Health', state.runtime.health?.status || 'unknown', 'liveness'],
            ['Ready', state.runtime.ready?.status || 'unknown', 'dependency checks'],
            ['DB', checks.db ? 'online' : 'unknown', 'execution store'],
            ['Queue', checks.queue ? 'online' : 'unknown', 'workflow jobs'],
        ])}</section>
        <section class="section">
            <h2 class="section-title">Recent executions</h2>
            ${executionTableHtml(state.executions.slice(0, 8))}
        </section>
    `;
}
