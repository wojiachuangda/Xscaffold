// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Agents view renderer with create form + profile pane
'use strict';

import { createAgent } from '../lib/actions.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { formatTime, showToast } from '../lib/utils.js';
import {
    bindActionButtons,
    bindResourceItems,
    emptyHtml,
    metricGridHtml,
    resourceItemHtml,
    setPane,
} from './components.js';

export function renderAgents() {
    ensureSelected(state.agents);
    setPane('Agents', `${state.agents.length} configured agents`, '');
    els.resourceList.innerHTML =
        state.agents.map(agentItemHtml).join('') || emptyHtml('No agents configured');
    const agent = state.agents.find((item) => item.id === state.selectedId) || null;
    renderAgentDetail(agent);
    bindResourceItems();
    bindCreateAgentForm();
    bindActionButtons();
}

function agentItemHtml(agent) {
    return resourceItemHtml({
        id: agent.id,
        title: agent.name,
        subtitle: agent.model,
        status: agent.status === 'enabled' ? 'success' : 'idle',
        meta: agent.status,
        selected: agent.id === state.selectedId,
    });
}

function renderAgentDetail(agent) {
    els.detailCrumb.textContent = 'Workspace / Agents';
    els.detailTitle.textContent = agent ? agent.name : 'Create agent';
    els.detailActions.innerHTML = '';
    els.detailContent.innerHTML = agentDetailHtml(agent);
}

function agentDetailHtml(agent) {
    const profile = agent ? selectedAgentHtml(agent) : emptyHtml('Select an agent or create a new one');
    return `
        <section class="section">${profile}</section>
        <section class="section">
            <h2 class="section-title">Create agent</h2>
            <form id="createAgentForm" class="form-grid">
                <label>Name<input class="input" name="name" required></label>
                <label>Model<input class="input" name="model" required value="gpt-4"></label>
                <label class="wide">Tools<input class="input" name="tools" placeholder="addNumbers, readFile"></label>
                <label class="wide">Description<textarea class="textarea" name="description"></textarea></label>
                <button class="primary-button wide" type="submit">Create agent</button>
            </form>
        </section>
    `;
}

function selectedAgentHtml(agent) {
    const tools = agent.tools || [];
    return `
        <h2 class="section-title">Agent profile</h2>
        ${metricGridHtml([
            ['Status', agent.status, 'availability'],
            ['Model', agent.model, 'provider model'],
            ['Tools', String(tools.length), tools.join(', ') || 'none'],
            ['Updated', formatTime(agent.updatedAt), 'profile version'],
        ])}
    `;
}

function bindCreateAgentForm() {
    document.getElementById('createAgentForm')?.addEventListener('submit', createAgentEvent);
}

async function createAgentEvent(event) {
    event.preventDefault();
    const form = event.target;
    try {
        await createAgent({
            name: form.name.value.trim(),
            model: form.model.value.trim(),
            description: form.description.value.trim() || null,
            tools: form.tools.value.split(',').map((tool) => tool.trim()).filter(Boolean),
        });
    } catch (err) {
        showToast(err.message || 'Failed to create agent');
    }
}

function ensureSelected(items) {
    if (state.selectedId && items.some((item) => item.id === state.selectedId)) {
        return;
    }
    state.selectedId = items[0]?.id || null;
}
