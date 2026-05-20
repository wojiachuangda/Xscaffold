// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Settings view for API base + JWT token (persists to localStorage)
'use strict';

import { els } from '../lib/dom.js';
import { saveApiBase, saveToken, state } from '../lib/state.js';
import { escapeHtml } from '../lib/utils.js';
import { bindResourceItems, resourceItemHtml, setPane } from './components.js';

let onSavedHandler = null;

export function setSettingsOnSaved(handler) {
    onSavedHandler = handler;
}

export function renderSettings() {
    setPane('Settings', 'Connection and authentication', '');
    els.resourceList.innerHTML = resourceItemHtml({
        id: 'connection',
        title: 'Connection',
        subtitle: state.apiBase,
        status: state.token ? 'success' : 'warn',
        meta: 'settings',
        selected: true,
    });
    els.detailCrumb.textContent = 'Configuration';
    els.detailTitle.textContent = 'Connection';
    els.detailActions.innerHTML = '';
    els.detailContent.innerHTML = settingsHtml();
    bindResourceItems();
    bindSettingsForm();
}

function settingsHtml() {
    return `
        <section class="section">
            <h2 class="section-title">API connection</h2>
            <form id="settingsForm" class="form-grid">
                <label class="wide">API base
                    <input class="input" name="apiBase" value="${escapeHtml(state.apiBase)}">
                </label>
                <label class="wide">JWT token
                    <input class="input" name="token" type="password" value="${escapeHtml(state.token)}">
                </label>
                <button class="primary-button wide" type="submit">Save and refresh</button>
            </form>
        </section>
    `;
}

function bindSettingsForm() {
    document.getElementById('settingsForm')?.addEventListener('submit', handleSubmit);
}

function handleSubmit(event) {
    event.preventDefault();
    const apiBase = event.target.apiBase.value.trim() || '/api';
    const token = event.target.token.value.trim();
    saveApiBase(apiBase);
    saveToken(token);
    if (onSavedHandler) {
        onSavedHandler();
    }
}
