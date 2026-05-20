// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Bootstrap composing dom/state/router/poller + initial refresh + nav binding
'use strict';

import { api, unwrapData, unwrapSettled } from './lib/api.js';
import { collectElements, els } from './lib/dom.js';
import { bindModalControls } from './lib/modal.js';
import { startPoller } from './lib/poller.js';
import { navigate, startRouter } from './lib/router.js';
import { loadPersisted, state } from './lib/state.js';
import { showToast } from './lib/utils.js';
import { fetchExecutions } from './views/executions.js';
import { render } from './views/index.js';
import { setSettingsOnSaved } from './views/settings.js';

const POLL_INTERVAL_MS = 5000;

document.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap() {
    collectElements();
    loadPersisted();
    bindModalControls();
    bindShellNav();
    bindRefreshButton();
    bindGlobalErrors();
    setSettingsOnSaved(handleSettingsSaved);
    startRouter(render);
    await initialRefresh();
    render();
    startPoller({ intervalMs: POLL_INTERVAL_MS, onTick: pollTick });
}

function bindShellNav() {
    document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => navigate(button.dataset.view));
    });
}

function bindRefreshButton() {
    els.refreshButton.addEventListener('click', async () => {
        await initialRefresh();
        render();
    });
}

function bindGlobalErrors() {
    window.addEventListener('unhandledrejection', (event) => {
        showToast(event.reason?.message || String(event.reason || 'Action failed'));
    });
}

async function initialRefresh() {
    await Promise.all([loadRuntime(), loadProtectedData()]);
}

async function pollTick() {
    await Promise.all([loadRuntime(), loadProtectedData()]);
    render();
}

async function loadRuntime() {
    const [health, ready] = await Promise.allSettled([
        api('/healthz', { auth: false }),
        api('/readyz', { auth: false }),
    ]);
    state.runtime.health = unwrapSettled(health);
    state.runtime.ready = unwrapSettled(ready);
}

async function loadProtectedData() {
    if (!state.token) {
        return;
    }
    const [workflows, executions, agents] = await Promise.allSettled([
        api('/workflows'),
        fetchExecutionsSafe(),
        api('/agents?limit=80'),
    ]);
    state.workflows = unwrapData(workflows, [], (reason) => showToast(reason.message));
    state.agents = unwrapData(agents, [], (reason) => showToast(reason.message));
    if (executions.status === 'rejected') {
        showToast(executions.reason.message);
    }
}

async function fetchExecutionsSafe() {
    await fetchExecutions();
    return { data: state.executions };
}

async function handleSettingsSaved() {
    await initialRefresh();
    navigate('runtime');
}
