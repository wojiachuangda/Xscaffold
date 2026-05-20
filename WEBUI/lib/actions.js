// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Cross-view action handlers wrapping API + modal + navigation
'use strict';

import { api } from './api.js';
import { openModal } from './modal.js';
import { navigate } from './router.js';
import { state } from './state.js';
import { showToast } from './utils.js';

export async function runWorkflow(workflowId, body) {
    const payload = await api(`/workflows/${workflowId}/execute`, { method: 'POST', body });
    showToast(`Execution queued: ${payload.data.id}`);
    navigate('executions', payload.data.id);
}

export async function createAgent(input) {
    await api('/agents', { method: 'POST', body: input });
    showToast('Agent created');
}

export async function openExecutionTrace(executionId) {
    const payload = await api(`/workflows/executions/${executionId}/trace`);
    const lines = buildTraceLines(payload.data);
    openModal(`Execution ${executionId}`, 'Trace and IOOR records', lines.join('\n'));
}

export function openRuntimeLog() {
    const snapshot = {
        health: state.runtime.health,
        ready: state.runtime.ready,
        executions: state.executions.slice(0, 10),
    };
    openModal('Local daemon logs', 'Runtime snapshot', JSON.stringify(snapshot, null, 2));
}

function buildTraceLines(data) {
    const spans = (data.spans || []).map((span) => `[span] ${span.nodeId || span.name} ${span.status}`);
    const ioor = (data.ioor || []).map((record) => `[ioor] ${record.nodeId} turn=${record.turnIndex}`);
    return [...spans, ...ioor, JSON.stringify(data, null, 2)];
}
