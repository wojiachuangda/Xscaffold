// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: View dispatcher mapping state.view to the active renderer
'use strict';

import { state } from '../lib/state.js';
import { renderAgents } from './agents.js';
import { renderAssistant } from './assistant.js';
import { renderExecutions } from './executions.js';
import { renderInbox } from './inbox.js';
import { renderRuntime } from './runtime.js';
import { renderSettings } from './settings.js';
import { renderWorkflows } from './workflows.js';

const RENDERERS = {
    runtime: renderRuntime,
    inbox: renderInbox,
    executions: renderExecutions,
    workflows: renderWorkflows,
    agents: renderAgents,
    assistant: renderAssistant,
    settings: renderSettings,
};

export function render() {
    syncNavHighlight();
    const renderer = RENDERERS[state.view] || renderRuntime;
    renderer();
}

function syncNavHighlight() {
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.view === state.view);
    });
}
