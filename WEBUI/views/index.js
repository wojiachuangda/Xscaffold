// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: View dispatcher mapping state.view → renderer; also syncs nav-icon is-active highlight
'use strict';

import { state } from '../lib/state.js';
import { renderAgents } from './agents.js';
import { renderAssistant } from './assistant.js';
import { renderAutomation } from './automation.js';
import { renderExecutions } from './executions.js';
import { renderInbox } from './inbox.js';
import { renderRuntime } from './runtime.js';
import { renderSessions } from './sessions/index.js';
import { renderSettings } from './settings.js';

const RENDERERS = {
    runtime: renderRuntime,
    agents: renderAgents,
    sessions: renderSessions,
    automation: renderAutomation,
    inbox: renderInbox,
    executions: renderExecutions,
    assistant: renderAssistant,
    settings: renderSettings,
};

export function render() {
    syncNavHighlight();
    const renderer = RENDERERS[state.view] || renderRuntime;
    renderer();
}

function syncNavHighlight() {
    document.querySelectorAll('#primaryNav [data-nav]').forEach((node) => {
        node.classList.toggle('is-active', node.dataset.nav === state.view);
    });
}
