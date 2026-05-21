// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Single global state singleton with localStorage persistence
'use strict';

const STORAGE_KEYS = {
    token: 'xscaffold.token',
    apiBase: 'xscaffold.apiBase',
};

export const terminalStatuses = new Set(['SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT']);
export const issueStatuses = new Set(['FAILED', 'STUCK', 'TIMEOUT']);

export const state = {
    view: 'runtime',
    token: '',
    apiBase: '/api',
    selectedId: null,
    runtime: { health: null, ready: null },
    workflows: [],
    // 共享 feed：loadProtectedData 喂（limit=80），inbox 派生 issues / automation 近况 / actions 快照读取
    executions: [],
    // executions 视图的分页结果——独立 slice，避免覆盖上面的共享 feed
    executionsPage: [],
    executionsPageTotal: 0,
    executionsFilter: { status: 'ALL', workflowId: '' },
    executionsOffset: 0,
    executionsLimit: 50,
    agents: [],
};

export function loadPersisted() {
    state.token = readStorage(STORAGE_KEYS.token) || '';
    state.apiBase = readStorage(STORAGE_KEYS.apiBase) || '/api';
}

export function saveToken(token) {
    state.token = token;
    writeStorage(STORAGE_KEYS.token, token);
}

export function saveApiBase(apiBase) {
    state.apiBase = apiBase;
    writeStorage(STORAGE_KEYS.apiBase, apiBase);
}

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (_err) {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (_err) {
        /* localStorage may be unavailable in restricted contexts */
    }
}
