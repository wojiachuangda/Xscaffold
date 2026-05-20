// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Shell-level DOM registry — only shell elements collected; per-view DOM resolved inside view modules
'use strict';

export const els = {};

const ELEMENT_IDS = [
    'viewBody',
    'primaryNav',
    'modalBackdrop',
    'modalTitle',
    'modalMeta',
    'modalSearch',
    'modalLog',
    'closeModalButton',
    'copyModalButton',
    'toast',
];

export function collectElements() {
    for (const id of ELEMENT_IDS) {
        els[id] = document.getElementById(id);
    }
}
