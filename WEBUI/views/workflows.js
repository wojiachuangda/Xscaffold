// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Workflows view renderer with manual trigger form
'use strict';

import { runWorkflow } from '../lib/actions.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml, showToast } from '../lib/utils.js';
import {
    bindActionButtons,
    bindResourceItems,
    emptyHtml,
    metricGridHtml,
    resourceItemHtml,
    setPane,
} from './components.js';

export function renderWorkflows() {
    ensureSelected(state.workflows);
    setPane('Automations', `${state.workflows.length} loaded workflows`, '');
    els.resourceList.innerHTML =
        state.workflows.map(workflowItemHtml).join('') || emptyHtml('No workflows loaded');
    const workflow = state.workflows.find((item) => item.id === state.selectedId) || null;
    renderWorkflowDetail(workflow);
    bindResourceItems();
    bindWorkflowForm(workflow);
    bindActionButtons();
}

function workflowItemHtml(workflow) {
    return resourceItemHtml({
        id: workflow.id,
        title: workflow.id,
        subtitle: workflow.description || `version ${workflow.version || '1.0'}`,
        status: 'success',
        meta: 'workflow',
        selected: workflow.id === state.selectedId,
    });
}

function renderWorkflowDetail(workflow) {
    els.detailCrumb.textContent = 'Workspace / Automations';
    els.detailTitle.textContent = workflow ? workflow.id : 'No workflow selected';
    els.detailActions.innerHTML = workflow
        ? '<button class="primary-button" data-action="runWorkflow">Run</button>'
        : '';
    els.detailContent.innerHTML = workflow ? workflowDetailHtml(workflow) : emptyHtml('Pick a workflow');
}

function workflowDetailHtml(workflow) {
    return `
        <section class="section">
            <h2 class="section-title">Workflow profile</h2>
            ${metricGridHtml([
                ['Version', workflow.version || '1.0', 'config'],
                ['Nodes', String(workflow.nodes || workflow.nodeCount || 0), 'declared steps'],
                ['Status', 'loaded', 'registry'],
                ['Mode', 'manual', 'trigger'],
            ])}
        </section>
        <section class="section">
            <h2 class="section-title">Manual input</h2>
            <form id="workflowForm" class="stack">
                <textarea class="textarea" name="input">${escapeHtml(defaultWorkflowInput(workflow.id))}</textarea>
                <button class="primary-button" type="submit">Run workflow</button>
            </form>
        </section>
    `;
}

function bindWorkflowForm(workflow) {
    if (!workflow) {
        return;
    }
    document.getElementById('workflowForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        runWorkflowEvent(event, workflow.id);
    });
}

async function runWorkflowEvent(event, workflowId) {
    try {
        const input = JSON.parse(event.target.input.value || '{}');
        await runWorkflow(workflowId, { input });
    } catch (err) {
        showToast(err.message || 'Workflow input must be valid JSON');
    }
}

function defaultWorkflowInput(workflowId) {
    if (workflowId === 'project-assistant-digest') {
        return JSON.stringify(
            {
                projectId: 'demo-project',
                profile: 'claudeHttp',
                sessionId: 'manual-session',
                instruction: '检查项目状态并给出下一步建议。',
            },
            null,
            2,
        );
    }
    return JSON.stringify({}, null, 2);
}

function ensureSelected(items) {
    if (state.selectedId && items.some((item) => item.id === state.selectedId)) {
        return;
    }
    state.selectedId = items[0]?.id || null;
}
