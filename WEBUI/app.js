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
// runtime 移出轮询：它自管刷新（自有 interval + 持久 Live Logs SSE），整页重渲染会摧毁日志面板与流
const POLL_VIEWS = new Set(['inbox']);

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
    // 仅对纯实时展示 view 重渲染；带交互的 view 脱离轮询路径，避免清空输入 + 失焦
    if (POLL_VIEWS.has(state.view)) {
        render();
    }
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
    const [workflows, executions, agents] = await Promise.allSettled([
        api('/workflows'),
        api('/workflows/executions?limit=80'),
        api('/agents?limit=80'),
    ]);
    state.workflows = unwrapData(workflows, [], reportIfReal);
    state.executions = unwrapData(executions, [], reportIfReal);
    state.agents = unwrapData(agents, [], reportIfReal);
}

function reportIfReal(reason) {
    const message = reason?.message || '';
    if (message.includes('401') || message.toLowerCase().includes('unauthor')) {
        return;
    }
    showToast(message);
}

async function handleSettingsSaved() {
    await initialRefresh();
    window.location.hash = '#/runtime';
}
