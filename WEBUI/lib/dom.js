// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: DOM element singleton registry collected once on bootstrap
'use strict';

export const els = {};

const ELEMENT_IDS = [
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
];

export function collectElements() {
    for (const id of ELEMENT_IDS) {
        els[id] = document.getElementById(id);
    }
}
