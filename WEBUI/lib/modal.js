// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Trace/log modal open/close/search/copy controls
'use strict';

import { els } from './dom.js';
import { escapeHtml, showToast } from './utils.js';

export function bindModalControls() {
    els.closeModalButton.addEventListener('click', closeModal);
    els.copyModalButton.addEventListener('click', copyModalContent);
    els.modalSearch.addEventListener('input', filterModalLines);
}

export function openModal(title, meta, text) {
    els.modalTitle.textContent = title;
    els.modalMeta.textContent = meta;
    renderModalLines(text);
    els.modalSearch.value = '';
    els.modalBackdrop.classList.remove('hidden');
}

export function closeModal() {
    els.modalBackdrop.classList.add('hidden');
}

function renderModalLines(text) {
    const lines = String(text || '').split('\n');
    els.modalLog.innerHTML = lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('\n');
}

function filterModalLines() {
    const needle = els.modalSearch.value.trim().toLowerCase();
    els.modalLog.querySelectorAll('span').forEach((line) => {
        line.hidden = needle && !line.textContent.toLowerCase().includes(needle);
    });
}

function copyModalContent() {
    navigator.clipboard.writeText(els.modalLog.textContent || '');
    showToast('Copied');
}
