// [ui] ID: WEBUI-MVP | Date: 2026-05-20 | Description: Xscaffold console state and API interactions
'use strict';

const state = {
    view: 'runtime',
    token: localStorage.getItem('xscaffold.token') || '',
    apiBase: localStorage.getItem('xscaffold.apiBase') || '/api',
    selectedId: null,
    runtime: { health: null, ready: null },
    workflows: [],
    executions: [],
    agents: [],
};

const terminalStatuses = new Set(['SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT']);
const issueStatuses = new Set(['FAILED', 'STUCK', 'TIMEOUT']);
const els = {};

document.addEventListener('DOMContentLoaded', () => {
    collectElements();
    bindShell();
    refreshData();
});

function collectElements() {
    for (const id of [
        'resourceTitle',
        'resourceMeta',
        'filterBar',
        'resourceList',
        'detailCrumb',
        'detailTitle',
        'detailActions',
        'detailContent',
        'refreshButton',
        'modalBackdrop',
        'modalTitle',
        'modalMeta',
        'modalSearch',
        'modalLog',
        'copyModalButton',
        'closeModalButton',
        'toast',
    ]) {
        els[id] = document.getElementById(id);
    }
}

function bindShell() {
    document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => switchView(button.dataset.view));
    });
    els.refreshButton.addEventListener('click', refreshData);
    els.closeModalButton.addEventListener('click', closeModal);
    els.copyModalButton.addEventListener('click', copyModalContent);
    els.modalSearch.addEventListener('input', filterModalLines);
    window.addEventListener('unhandledrejection', (event) => {
        showToast(event.reason?.message || String(event.reason || 'Action failed'));
    });
}

function switchView(view) {
    state.view = view;
    state.selectedId = null;
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.view === view);
    });
    render();
}

async function refreshData() {
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
        api('/workflows/executions?limit=80'),
        api('/agents?limit=80'),
    ]);
    state.workflows = unwrapData(workflows, []);
    state.executions = unwrapData(executions, []);
    state.agents = unwrapData(agents, []);
}

function unwrapSettled(result) {
    return result.status === 'fulfilled' ? result.value.data : null;
}

function unwrapData(result, fallback) {
    if (result.status === 'fulfilled') {
        return result.value.data || fallback;
    }
    showToast(result.reason.message);
    return fallback;
}

async function api(path, options = {}) {
    const auth = options.auth !== false;
    const response = await fetch(`${state.apiBase}${path}`, buildRequestOptions(options, auth));
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok || payload.success === false) {
        throw new Error(readErrorMessage(payload, response.status));
    }
    return payload;
}

function buildRequestOptions(options, auth) {
    const headers = { ...(options.headers || {}) };
    if (auth && state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }
    if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
    }
    return {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    };
}

function readErrorMessage(payload, status) {
    if (payload && payload.error && payload.error.message) {
        return payload.error.message;
    }
    if (typeof payload === 'string' && payload) {
        return payload;
    }
    return `Request failed (${status})`;
}

async function runWorkflowEvent(event, workflowId) {
    event.preventDefault();
    const input = JSON.parse(event.target.input.value || '{}');
    const payload = await api(`/workflows/${workflowId}/execute`, { method: 'POST', body: { input } });
    showToast(`Execution queued: ${payload.data.id}`);
    await refreshData();
    state.view = 'executions';
    state.selectedId = payload.data.id;
    render();
}

async function runAssistantEvent(event) {
    event.preventDefault();
    const form = event.target;
    await runWorkflow('project-assistant-digest', { input: readAssistantInput(form) });
}

async function runWorkflow(workflowId, body) {
    const payload = await api(`/workflows/${workflowId}/execute`, { method: 'POST', body });
    showToast(`Execution queued: ${payload.data.id}`);
    await refreshData();
    state.view = 'executions';
    state.selectedId = payload.data.id;
    render();
}

async function createAgentEvent(event) {
    event.preventDefault();
    const form = event.target;
    await api('/agents', { method: 'POST', body: readAgentInput(form) });
    showToast('Agent created');
    await refreshData();
}

function readAssistantInput(form) {
    return {
        projectId: form.projectId.value.trim(),
        profile: form.profile.value.trim(),
        sessionId: form.sessionId.value.trim(),
        reminderBefore: form.reminderBefore.value.trim(),
        instruction: form.instruction.value.trim(),
    };
}

function readAgentInput(form) {
    return {
        name: form.name.value.trim(),
        model: form.model.value.trim(),
        description: form.description.value.trim() || null,
        tools: form.tools.value.split(',').map((tool) => tool.trim()).filter(Boolean),
    };
}

async function openExecutionTrace(executionId) {
    const payload = await api(`/workflows/executions/${executionId}/trace`);
    const lines = buildTraceLines(payload.data);
    openModal(`Execution ${executionId}`, 'Trace and IOOR records', lines.join('\n'));
}

function openRuntimeLog() {
    const data = {
        health: state.runtime.health,
        ready: state.runtime.ready,
        executions: state.executions.slice(0, 10),
    };
    openModal('Local daemon logs', 'Runtime snapshot', JSON.stringify(data, null, 2));
}

function openModal(title, meta, text) {
    els.modalTitle.textContent = title;
    els.modalMeta.textContent = meta;
    renderModalLines(text);
    els.modalSearch.value = '';
    els.modalBackdrop.classList.remove('hidden');
}

function renderModalLines(text) {
    const lines = String(text || '').split('\n');
    els.modalLog.innerHTML = lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('\n');
}

function closeModal() {
    els.modalBackdrop.classList.add('hidden');
}

function copyModalContent() {
    navigator.clipboard.writeText(els.modalLog.textContent || '');
    showToast('Copied');
}

function filterModalLines() {
    const needle = els.modalSearch.value.trim().toLowerCase();
    els.modalLog.querySelectorAll('span').forEach((line) => {
        line.hidden = needle && !line.textContent.toLowerCase().includes(needle);
    });
}

function buildTraceLines(data) {
    const spans = (data.spans || []).map((span) => `[span] ${span.nodeId || span.name} ${span.status}`);
    const ioor = (data.ioor || []).map((record) => `[ioor] ${record.nodeId} turn=${record.turnIndex}`);
    return [...spans, ...ioor, JSON.stringify(data, null, 2)];
}

function executionActionsHtml(execution) {
    return `
        <button class="secondary-button" data-action="trace" data-id="${escapeAttr(execution.id)}">
            View logs
        </button>
    `;
}

function statusBadge(status) {
    return `<span class="badge ${statusTone(status)}">${escapeHtml(status)}</span>`;
}

function statusTone(status) {
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

function emptyHtml(message) {
    return `<div class="empty">${escapeHtml(message)}</div>`;
}

function defaultWorkflowInput(workflowId) {
    if (workflowId === 'project-assistant-digest') {
        return JSON.stringify(readAssistantDefaults(), null, 2);
    }
    return JSON.stringify({}, null, 2);
}

function readAssistantDefaults() {
    return {
        projectId: 'demo-project',
        profile: 'claudeHttp',
        sessionId: 'manual-session',
        reminderBefore: tomorrowIso(),
        instruction: '请检查当前项目状态，指出阻塞点，并给出下一步建议。',
    };
}

function tomorrowIso() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function formatTime(value) {
    return value ? new Date(value).toLocaleString() : '-';
}

function formatDuration(value) {
    return Number.isFinite(value) ? `${value}ms` : '-';
}

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    setTimeout(() => els.toast.classList.remove('visible'), 2400);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/gu, (char) => HTML_ENTITIES[char]);
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/gu, '&#96;');
}

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};
