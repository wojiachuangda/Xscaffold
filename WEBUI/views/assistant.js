// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Project assistant view (token-styled) — manual digest workflow trigger; hidden from nav, accessible via hash #/assistant
'use strict';

import { runWorkflow } from '../lib/actions.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, showToast } from '../lib/utils.js';

const ASSISTANT_WORKFLOW_ID = 'project-assistant-digest';

export function renderAssistant() {
    const workflow = (state.workflows || []).find((w) => w.id === ASSISTANT_WORKFLOW_ID);
    els.viewBody.innerHTML = `
        <main class="flex-1 overflow-y-auto scroll-thin">
            <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel">
                <div class="flex items-center gap-3">
                    <h1 class="t-base">Project Assistant</h1>
                    <span class="t-xs text-secondary">digest runbook</span>
                </div>
            </header>
            ${workflow ? formSectionHtml() : missingHtml()}
        </main>
    `;
    if (workflow) {
        document.getElementById('assistantForm').addEventListener('submit', runAssistantEvent);
    }
}

function formSectionHtml() {
    return `
        <section class="p-6">
            <div class="card max-w-prose">
                <div class="h-8 px-4 flex items-center bd-b"><span class="t-sm t-medium">Runbook</span></div>
                <ol class="p-4 t-sm text-secondary flex flex-col gap-2">
                    <li>1. Read project status, tasks and due reminders</li>
                    <li>2. Ask the configured external agent for analysis</li>
                    <li>3. Record the digest event and update project summary</li>
                    <li>4. Generate the final digest for human review</li>
                </ol>
            </div>
            <div class="card max-w-prose mt-6">
                <div class="h-8 px-4 flex items-center bd-b"><span class="t-sm t-medium">Manual trigger</span></div>
                <form id="assistantForm" class="p-4 flex flex-col gap-3">
                    <div class="form-field">
                        <label>Project ID</label>
                        <input class="input" name="projectId" value="demo-project" required>
                    </div>
                    <div class="form-field">
                        <label>Profile</label>
                        <input class="input" name="profile" value="claudeHttp" required>
                    </div>
                    <div class="form-field">
                        <label>Session ID</label>
                        <input class="input" name="sessionId" value="manual-session">
                    </div>
                    <div class="form-field">
                        <label>Reminder before</label>
                        <input class="input" name="reminderBefore" value="${escapeHtml(tomorrowIso())}">
                    </div>
                    <div class="form-field">
                        <label>Instruction</label>
                        <textarea class="input-area" name="instruction" rows="4">检查项目状态并给出下一步建议。</textarea>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-primary focus-ring" type="submit">Run digest</button>
                        <span class="t-xs text-tertiary">Queues an execution and jumps to Executions view</span>
                    </div>
                </form>
            </div>
        </section>
    `;
}

function missingHtml() {
    return `
        <section class="p-6">
            <div class="card max-w-prose">
                <div class="empty">Workflow <span class="t-mono">${ASSISTANT_WORKFLOW_ID}</span> not loaded. Check workflows/ directory.</div>
            </div>
        </section>
    `;
}

async function runAssistantEvent(event) {
    event.preventDefault();
    const form = event.target;
    try {
        await runWorkflow(ASSISTANT_WORKFLOW_ID, {
            input: {
                projectId: form.projectId.value.trim(),
                profile: form.profile.value.trim(),
                sessionId: form.sessionId.value.trim(),
                reminderBefore: form.reminderBefore.value.trim(),
                instruction: form.instruction.value.trim(),
            },
        });
    } catch (err) {
        showToast(err.message || 'Failed to run assistant');
    }
}

function tomorrowIso() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
