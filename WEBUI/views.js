// [ui] ID: WEBUI-MVP | Date: 2026-05-20 | Description: Xscaffold console view renderers
'use strict';

function render() {
    const renderers = {
        runtime: renderRuntime,
        inbox: renderInbox,
        executions: renderExecutions,
        workflows: renderWorkflows,
        agents: renderAgents,
        assistant: renderAssistant,
        settings: renderSettings,
    };
    renderers[state.view]();
}

function setPane(title, meta, filtersHtml) {
    els.resourceTitle.textContent = title;
    els.resourceMeta.textContent = meta;
    els.filterBar.innerHTML = filtersHtml || '';
}

function renderRuntime() {
    setPane('Runtimes', 'Backend runtime state', runtimeFilters());
    els.resourceList.innerHTML = runtimeListHtml();
    els.detailCrumb.textContent = 'Configuration / Runtimes';
    els.detailTitle.textContent = 'Local backend';
    els.detailActions.innerHTML = '<button class="secondary-button" data-action="viewLogs">View logs</button>';
    els.detailContent.innerHTML = runtimeDetailHtml();
    bindActionButtons();
}

function runtimeFilters() {
    const ready = state.runtime.ready?.status === 'ready';
    return `<span class="badge ${ready ? 'success' : 'warn'}">${ready ? 'ready' : 'not ready'}</span>`;
}

function runtimeListHtml() {
    const ready = state.runtime.ready?.status === 'ready';
    return resourceItemHtml({
        id: 'local',
        title: 'Local backend',
        subtitle: ready ? 'API, queue and database checks passed' : 'Waiting for ready checks',
        status: ready ? 'success' : 'warn',
        meta: 'runtime',
        selected: true,
    });
}

function runtimeDetailHtml() {
    const checks = state.runtime.ready?.checks || {};
    return `
        <section class="section">${metricGridHtml([
            ['Health', state.runtime.health?.status || 'unknown', 'liveness'],
            ['Ready', state.runtime.ready?.status || 'unknown', 'dependency checks'],
            ['DB', checks.db ? 'online' : 'unknown', 'execution store'],
            ['Queue', checks.queue ? 'online' : 'unknown', 'workflow jobs'],
        ])}</section>
        <section class="section">
            <h2 class="section-title">Recent executions</h2>
            ${executionTableHtml(state.executions.slice(0, 8))}
        </section>
    `;
}

function renderInbox() {
    const issues = state.executions.filter((item) => issueStatuses.has(item.status));
    ensureSelected(issues);
    setPane('Inbox', `${issues.length} execution issues`, inboxFilters());
    els.resourceList.innerHTML = issues.map(executionItemHtml).join('') || emptyHtml('No execution issues');
    renderExecutionDetail(findById(issues, state.selectedId), 'Inbox');
}

function renderExecutions() {
    ensureSelected(state.executions);
    setPane('Executions', `${state.executions.length} recent executions`, executionFilters());
    els.resourceList.innerHTML = state.executions.map(executionItemHtml).join('') || emptyHtml('No executions loaded');
    renderExecutionDetail(findById(state.executions, state.selectedId), 'Workspace / Executions');
}

function inboxFilters() {
    return ['FAILED', 'STUCK', 'TIMEOUT'].map((status) => `<span class="badge error">${status}</span>`).join('');
}

function executionFilters() {
    return ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED'].map((status) => statusBadge(status)).join('');
}

function renderWorkflows() {
    ensureSelected(state.workflows);
    setPane('Automations', `${state.workflows.length} loaded workflows`, '');
    els.resourceList.innerHTML = state.workflows.map(workflowItemHtml).join('') || emptyHtml('No workflows loaded');
    renderWorkflowDetail(findById(state.workflows, state.selectedId));
}

function renderAgents() {
    ensureSelected(state.agents);
    setPane('Agents', `${state.agents.length} configured agents`, '');
    els.resourceList.innerHTML = state.agents.map(agentItemHtml).join('') || emptyHtml('No agents configured');
    renderAgentDetail(findById(state.agents, state.selectedId));
}

function renderAssistant() {
    const workflow = state.workflows.find((item) => item.id === 'project-assistant-digest') || null;
    setPane('Project assistant', workflow ? 'Digest workflow available' : 'Workflow not loaded', '');
    els.resourceList.innerHTML = workflow
        ? workflowItemHtml(workflow)
        : emptyHtml('project-assistant-digest not found');
    renderAssistantDetail(workflow);
}

function renderSettings() {
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
    bindSettingsForm();
}

function ensureSelected(items) {
    if (!state.selectedId && items.length > 0) {
        state.selectedId = items[0].id;
    }
}

function findById(items, id) {
    return items.find((item) => item.id === id) || null;
}

function renderExecutionDetail(execution, crumb) {
    els.detailCrumb.textContent = crumb;
    els.detailTitle.textContent = execution ? execution.id : 'No issue selected';
    els.detailActions.innerHTML = execution ? executionActionsHtml(execution) : '';
    els.detailContent.innerHTML = execution ? executionDetailHtml(execution) : emptyHtml('No execution selected');
    bindActionButtons();
}

function renderWorkflowDetail(workflow) {
    els.detailCrumb.textContent = 'Workspace / Automations';
    els.detailTitle.textContent = workflow ? workflow.id : 'No workflow selected';
    els.detailActions.innerHTML = workflow
        ? '<button class="primary-button" data-action="runWorkflow">Run</button>'
        : '';
    els.detailContent.innerHTML = workflow ? workflowDetailHtml(workflow) : emptyHtml('No workflow selected');
    bindWorkflowForm(workflow);
}

function renderAgentDetail(agent) {
    els.detailCrumb.textContent = 'Workspace / Agents';
    els.detailTitle.textContent = agent ? agent.name : 'Create agent';
    els.detailActions.innerHTML = '';
    els.detailContent.innerHTML = agentDetailHtml(agent);
    bindCreateAgentForm();
}

function renderAssistantDetail(workflow) {
    els.detailCrumb.textContent = 'Workspace / Project assistant';
    els.detailTitle.textContent = 'Digest runbook';
    els.detailActions.innerHTML = workflow
        ? '<button class="primary-button" data-action="runAssistant">Run digest</button>'
        : '';
    els.detailContent.innerHTML = assistantHtml(workflow);
    bindAssistantForm(workflow);
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

function executionDetailHtml(execution) {
    return `
        <section class="section">${metricGridHtml([
            ['Status', execution.status, 'execution state'],
            ['Workflow', execution.workflowId, 'source'],
            ['Duration', formatDuration(execution.durationMs), 'runtime'],
            ['Finished', formatTime(execution.finishedAt), 'timestamp'],
        ])}</section>
        <section class="section">
            <h2 class="section-title">Error</h2>
            <pre class="code-block">${escapeHtml(JSON.stringify(execution.error || {}, null, 2))}</pre>
        </section>
        <section class="section">
            <h2 class="section-title">Result</h2>
            <pre class="code-block">${escapeHtml(JSON.stringify(execution.result || {}, null, 2))}</pre>
        </section>
    `;
}

function agentDetailHtml(agent) {
    const agentBlock = agent ? selectedAgentHtml(agent) : emptyHtml('Select an agent or create a new one');
    return `
        <section class="section">${agentBlock}</section>
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
    return `
        <h2 class="section-title">Agent profile</h2>
        ${metricGridHtml([
            ['Status', agent.status, 'availability'],
            ['Model', agent.model, 'provider model'],
            ['Tools', String((agent.tools || []).length), (agent.tools || []).join(', ') || 'none'],
            ['Updated', formatTime(agent.updatedAt), 'profile version'],
        ])}
    `;
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
                <label>
                    Project ID
                    <input class="input" name="projectId" required value="demo-project" ${disabled}>
                </label>
                <label>Profile<input class="input" name="profile" required value="claudeHttp" ${disabled}></label>
                <label>Session<input class="input" name="sessionId" value="manual-session" ${disabled}></label>
                <label>
                    Reminder before
                    <input class="input" name="reminderBefore" value="${tomorrowIso()}" ${disabled}>
                </label>
                <label class="wide">
                    Instruction
                    <textarea class="textarea" name="instruction" ${disabled}>请检查当前项目状态，指出阻塞点，并给出下一步建议。</textarea>
                </label>
                <button class="primary-button wide" type="submit" ${disabled}>Run project assistant</button>
            </form>
        </section>
    `;
}

function settingsHtml() {
    return `
        <section class="section">
            <h2 class="section-title">API connection</h2>
            <form id="settingsForm" class="form-grid">
                <label class="wide">
                    API base
                    <input class="input" name="apiBase" value="${escapeHtml(state.apiBase)}">
                </label>
                <label class="wide">
                    JWT token
                    <input class="input" name="token" type="password" value="${escapeHtml(state.token)}">
                </label>
                <button class="primary-button wide" type="submit">Save and refresh</button>
            </form>
        </section>
    `;
}

function metricGridHtml(metrics) {
    return `<div class="metric-grid">${metrics.map(metricHtml).join('')}</div>`;
}

function metricHtml(metric) {
    return `
        <div class="metric">
            <div class="meta">${escapeHtml(metric[0])}</div>
            <div class="metric-value">${escapeHtml(metric[1])}</div>
            <div class="meta">${escapeHtml(metric[2])}</div>
        </div>
    `;
}

function executionTableHtml(items) {
    if (!items.length) {
        return emptyHtml('No executions loaded');
    }
    const rows = items.map(executionRowHtml);
    return `
        <table class="table">
            <thead><tr><th>ID</th><th>Status</th><th>Workflow</th><th>Started</th></tr></thead>
            <tbody>${rows.join('')}</tbody>
        </table>
    `;
}

function executionRowHtml(item) {
    return `
        <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${escapeHtml(item.workflowId)}</td>
            <td>${escapeHtml(formatTime(item.startedAt))}</td>
        </tr>
    `;
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

function executionItemHtml(execution) {
    return resourceItemHtml({
        id: execution.id,
        title: execution.workflowId,
        subtitle: execution.error?.message || formatTime(execution.startedAt),
        status: statusTone(execution.status),
        meta: execution.status,
        selected: execution.id === state.selectedId,
    });
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

function resourceItemHtml(item) {
    return `
        <button
            class="resource-item ${item.selected ? 'selected' : ''}"
            type="button"
            data-select="${escapeAttr(item.id)}"
        >
            <span class="dot ${item.status}"></span>
            <span>
                <span class="item-title">${escapeHtml(item.title)}</span>
                <span class="item-subtitle">${escapeHtml(item.subtitle)}</span>
            </span>
            <span class="meta">${escapeHtml(item.meta)}</span>
        </button>
    `;
}

function bindResourceItems() {
    els.resourceList.querySelectorAll('[data-select]').forEach((item) => {
        item.addEventListener('click', () => {
            state.selectedId = item.dataset.select;
            render();
        });
    });
}

function bindWorkflowForm(workflow) {
    bindResourceItems();
    const form = document.getElementById('workflowForm');
    if (!form || !workflow) {
        return;
    }
    form.addEventListener('submit', (event) => runWorkflowEvent(event, workflow.id));
    bindActionButtons();
}

function bindAssistantForm(workflow) {
    bindResourceItems();
    const form = document.getElementById('assistantForm');
    if (!form || !workflow) {
        return;
    }
    form.addEventListener('submit', runAssistantEvent);
    bindActionButtons();
}

function bindCreateAgentForm() {
    bindResourceItems();
    const form = document.getElementById('createAgentForm');
    if (!form) {
        return;
    }
    form.addEventListener('submit', createAgentEvent);
}

function bindSettingsForm() {
    bindResourceItems();
    document.getElementById('settingsForm').addEventListener('submit', (event) => {
        event.preventDefault();
        state.apiBase = event.target.apiBase.value.trim() || '/api';
        state.token = event.target.token.value.trim();
        localStorage.setItem('xscaffold.apiBase', state.apiBase);
        localStorage.setItem('xscaffold.token', state.token);
        refreshData();
    });
}

function bindActionButtons() {
    document.querySelectorAll('[data-action="viewLogs"]').forEach((button) => {
        button.addEventListener('click', () => openRuntimeLog());
    });
    document.querySelectorAll('[data-action="trace"]').forEach((button) => {
        button.addEventListener('click', () => openExecutionTrace(button.dataset.id));
    });
    document.querySelectorAll('[data-action="runWorkflow"]').forEach((button) => {
        button.addEventListener('click', () => document.getElementById('workflowForm')?.requestSubmit());
    });
    document.querySelectorAll('[data-action="runAssistant"]').forEach((button) => {
        button.addEventListener('click', () => document.getElementById('assistantForm')?.requestSubmit());
    });
}
