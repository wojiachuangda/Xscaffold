// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Pure formatting helpers + toast surface
'use strict';

import { els } from './dom.js';

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/gu, (char) => HTML_ENTITIES[char]);
}

export function escapeAttr(value) {
    return escapeHtml(value).replace(/`/gu, '&#96;');
}

export function formatTime(value) {
    return value ? new Date(value).toLocaleString() : '-';
}

export function formatDuration(value) {
    return Number.isFinite(value) ? `${value}ms` : '-';
}

let toastTimer = null;

export function showToast(message) {
    if (!els.toast) {
        return;
    }
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 2400);
}
