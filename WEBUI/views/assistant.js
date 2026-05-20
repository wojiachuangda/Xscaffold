// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Project assistant digest view with manual trigger form
'use strict';

import { runWorkflow } from '../lib/actions.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { showToast } from '../lib/utils.js';
import {
    bindActionButtons,
    bindResourceItems,
    emptyHtml,
    setPane,
} from './components.js';

const ASSISTANT_WORKFLOW_ID = 'project-assistant-digest';

export function renderAssistant() {
    const workflow = state.workflows.find((item) => item.id === ASSISTANT_WORKFLOW_ID) || null;
    setPane(
        'Project assistant',
        workflow ? 'Digest workflow available' : 'Workflow not loaded',
        '',
    );
    els.resourceList.innerHTML = workflow
        ? assistantListHtml(workflow)
        : emptyHtml(`${ASSISTANT_WORKFLOW_ID} not found`);
    renderAssistantDetail(workflow);
    bindResourceItems();
    bindAssistantForm(workflow);
    bindActionButtons();
}

function assistantListHtml(workflow) {
    return `
        <button class="resource-item selected" type="button" data-select="${workflow.id}">
            <span class="dot success"></span>
            <span>
                <span class="item-title">${workflow.id}</span>
                <span class="item-subtitle">digest runbook</span>
            </span>
            <span class="meta">assistant</span>
        </button>
    `;
}

function renderAssistantDetail(workflow) {
    els.detailCrumb.textContent = 'Workspace / Project assistant';
    els.detailTitle.textContent = 'Digest runbook';
    els.detailActions.innerHTML = workflow
        ? '<button class="primary-button" data-action="runAssistant">Run digest</button>'
        : '';
    els.detailContent.innerHTML = assistantHtml(workflow);
}

function assistantHtml(workflow) {
    const disabled = workflow ? '' : 'disabled';
    return `
        <section class="section">
            <h2 class="section-title">Runbook</h2>
            <ol class="stack">
                <li>Read project status, tasks and due reminders.</li>
                <li>Ask the configured external agent for analysis.</li>
                <li>Record the digest event and update project summary.</li>
                <li>Generate the final digest for human review.</li>
            </ol>
        </section>
        <section class="section">
            <h2 class="section-title">Manual trigger</h2>
            <form id="assistantForm" class="form-grid">
                <label>Project ID<input class="input" name="projectId" required value="demo-project" ${disabled}></label>
                <label>Profile<input class="input" name="profile" required value="claudeHttp" ${disabled}></label>
                <label>Session<input class="input" name="sessionId" value="manual-session" ${disabled}></label>
                <label>Reminder before
                    <input class="input" name="reminderBefore" value="${tomorrowIso()}" ${disabled}>
                </label>
                <label class="wide">Instruction
                    <textarea class="textarea" name="instruction" ${disabled}>请检查当前项目状态，指出阻塞点，并给出下一步建议。</textarea>
                </label>
                <button class="primary-button wide" type="submit" ${disabled}>Run project assistant</button>
            </form>
        </section>
    `;
}

function bindAssistantForm(workflow) {
    if (!workflow) {
        return;
    }
    document.getElementById('assistantForm')?.addEventListener('submit', runAssistantEvent);
}

async function runAssistantEvent(event) {
    event.preventDefault();
    const form = event.target;
    try {
        await runWorkflow(ASSISTANT_WORKFLOW_ID, { input: readAssistantInput(form) });
    } catch (err) {
        showToast(err.message || 'Failed to run assistant');
    }
}

function readAssistantInput(form) {
    return {
        projectId: form.projectId.value.trim(),
        profile: form.profile.value.trim(),
        sessionId: form.sessionId.value.trim(),
        reminderBefore: form.reminderBefore.value.trim(),
        instruction: form.instruction.value.trim(),
    };
}

function tomorrowIso() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
