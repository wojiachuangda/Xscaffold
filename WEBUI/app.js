// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Bootstrap composing dom/state/router/poller, syncing nav highlight, dispatching to view renderers
'use strict';

import { api, unwrapData, unwrapSettled } from './lib/api.js';
import { collectElements } from './lib/dom.js';
import { bindModalControls } from './lib/modal.js';
import { startPoller } from './lib/poller.js';
import { startRouter } from './lib/router.js';
import { loadPersisted, state } from './lib/state.js';
import { showToast } from './lib/utils.js';
import { render } from './views/index.js';
import { setSettingsOnSaved } from './views/settings.js';

const POLL_INTERVAL_MS = 5000;

document.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap() {
    collectElements();
    loadPersisted();
    bindModalControls();
    bindGlobalErrors();
    setSettingsOnSaved(handleSettingsSaved);
    startRouter(render);
    await initialRefresh();
    render();
    startPoller({ intervalMs: POLL_INTERVAL_MS, onTick: pollTick });
}

function bindGlobalErrors() {
    window.addEventListener('unhandledrejection', (event) => {
        showToast(event.reason?.message || String(event.reason || 'Action failed'));
    });
}

async function initialRefresh() {
    await Promise.all([loadRuntimeProbes(), loadProtectedData()]);
}

async function pollTick() {
    await Promise.all([loadRuntimeProbes(), loadProtectedData()]);
    render();
}

async function loadRuntimeProbes() {
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
        api('/workflows/executions?limit=80'),
        api('/agents?limit=80'),
    ]);
    state.workflows = unwrapData(workflows, [], (reason) => showToast(reason.message));
    state.executions = unwrapData(executions, [], (reason) => showToast(reason.message));
    state.agents = unwrapData(agents, [], (reason) => showToast(reason.message));
}

async function handleSettingsSaved() {
    await initialRefresh();
    window.location.hash = '#/runtime';
}
