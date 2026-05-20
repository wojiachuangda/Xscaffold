// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Hash router parsing #/view or #/view/id with whitelist + default fallback
'use strict';

import { state } from './state.js';

const VIEW_WHITELIST = new Set([
    'runtime',
    'inbox',
    'executions',
    'workflows',
    'agents',
    'assistant',
    'settings',
]);

const DEFAULT_VIEW = 'runtime';
const ID_PATTERN = /^[\w.-]{1,128}$/u;

let onChangeHandler = null;

export function startRouter(onChange) {
    onChangeHandler = onChange;
    window.addEventListener('hashchange', applyHash);
    applyHash();
}

export function navigate(view, id) {
    const target = id ? `#/${view}/${encodeURIComponent(id)}` : `#/${view}`;
    if (window.location.hash === target) {
        applyHash();
        return;
    }
    window.location.hash = target;
}

function applyHash() {
    const parsed = parseHash(window.location.hash);
    state.view = parsed.view;
    state.selectedId = parsed.id;
    if (onChangeHandler) {
        onChangeHandler();
    }
}

function parseHash(hash) {
    const raw = (hash || '').replace(/^#\/?/u, '');
    if (!raw) {
        return { view: DEFAULT_VIEW, id: null };
    }
    const [view, rawId] = raw.split('/');
    if (!VIEW_WHITELIST.has(view)) {
        return { view: DEFAULT_VIEW, id: null };
    }
    const id = decodeId(rawId);
    return { view, id };
}

function decodeId(rawId) {
    if (!rawId) {
        return null;
    }
    try {
        const decoded = decodeURIComponent(rawId);
        return ID_PATTERN.test(decoded) ? decoded : null;
    } catch (_err) {
        return null;
    }
}
