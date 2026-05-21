// [refactor] ID: WEBUI-SESSIONS-SPLIT | Date: 2026-05-21 | Description: Sessions localStorage 会话层——会话列表/cells 的纯数据读写，无 DOM
'use strict';

const LIST_KEY = 'xscaffold.session.list';
const cellsKey = (id) => `xscaffold.session.${id}.cells`;

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (_err) {
        return false;
    }
}

export function loadSessionList() {
    return readJson(LIST_KEY, []);
}

export function loadCells(id) {
    return readJson(cellsKey(id), []);
}

export function createSession(agent, topic) {
    const id = `sess_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const meta = {
        id,
        agentId: agent.id,
        agentName: agent.name,
        topic: topic || 'Untitled session',
        createdAt: new Date().toISOString(),
        cellCount: 0,
    };
    writeJson(LIST_KEY, [meta, ...loadSessionList()]);
    writeJson(cellsKey(id), []);
    return meta;
}

export function deleteSession(id) {
    writeJson(LIST_KEY, loadSessionList().filter((s) => s.id !== id));
    try {
        localStorage.removeItem(cellsKey(id));
    } catch (_err) {
        /* localStorage 不可用，忽略 */
    }
}

export function renameSession(id, topic) {
    const next = loadSessionList().map((s) => (s.id === id ? { ...s, topic } : s));
    writeJson(LIST_KEY, next);
}

export function appendCell(id, cell) {
    const cells = [...loadCells(id), cell];
    if (!writeJson(cellsKey(id), cells)) {
        return false;
    }
    const next = loadSessionList().map((s) => (s.id === id ? { ...s, cellCount: cells.length } : s));
    writeJson(LIST_KEY, next);
    return true;
}
