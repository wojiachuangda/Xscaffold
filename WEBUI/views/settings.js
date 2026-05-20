// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Settings view — API base + JWT token persisted to localStorage; token-styled inline form
'use strict';

import { els } from '../lib/dom.js';
import { saveApiBase, saveToken, state } from '../lib/state.js';
import { escapeHtml } from '../lib/utils.js';

let onSavedHandler = null;

export function setSettingsOnSaved(handler) {
    onSavedHandler = handler;
}

export function renderSettings() {
    els.viewBody.innerHTML = `
        <main class="flex-1 overflow-y-auto scroll-thin">
            <header class="h-12 px-6 flex items-center bd-b bg-panel">
                <h1 class="t-base">Settings</h1>
            </header>
            <section class="p-6">
                <div class="card max-w-prose">
                    <div class="h-8 px-4 flex items-center bd-b">
                        <span class="t-sm t-medium">Connection</span>
                    </div>
                    <form id="settingsForm" class="p-4 flex flex-col gap-4">
                        <div class="form-field">
                            <label>API base</label>
                            <input class="input" name="apiBase" value="${escapeHtml(state.apiBase)}">
                        </div>
                        <div class="form-field">
                            <label>JWT token</label>
                            <input class="input" name="token" type="password" value="${escapeHtml(state.token)}">
                        </div>
                        <div class="flex items-center gap-2">
                            <button class="btn btn-primary focus-ring" type="submit">Save and refresh</button>
                            <span class="t-xs text-tertiary">Stored in browser localStorage</span>
                        </div>
                    </form>
                </div>
                <div class="card max-w-prose mt-6">
                    <div class="h-8 px-4 flex items-center bd-b">
                        <span class="t-sm t-medium">Runtime info</span>
                    </div>
                    <dl class="p-4 grid grid-cols-2 gap-y-2 t-xs">
                        <dt class="text-tertiary">Health</dt><dd>${escapeHtml(state.runtime.health?.status || 'unknown')}</dd>
                        <dt class="text-tertiary">Ready</dt><dd>${escapeHtml(state.runtime.ready?.status || 'unknown')}</dd>
                        <dt class="text-tertiary">Workflows loaded</dt><dd class="t-num">${(state.workflows || []).length}</dd>
                        <dt class="text-tertiary">Agents loaded</dt><dd class="t-num">${(state.agents || []).length}</dd>
                    </dl>
                </div>
            </section>
        </main>
    `;
    document.getElementById('settingsForm').addEventListener('submit', handleSubmit);
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
