// [scaffold] ID: T2.7 | Date: 2026-05-18 | Description: 工作流执行器（拓扑遍历 + 条件分支裁剪 + 输出注入 context）
'use strict';

const crypto = require('crypto');

const { WorkflowSchema } = require('./workflowSchema');
const { STATES, ACTIONS, transition } = require('./taskStateMachine');
const { initQuota } = require('./tokenQuota');
const { ValidationError, AppError } = require('../infrastructure/errors/AppError');

const MAX_WORKFLOW_TIMEOUT_MS = Number(process.env.MAX_WORKFLOW_TIMEOUT_MS) || 30000;

/**
 * @param {{ runNode }} nodeRunner
 */
function createWorkflowExecutor(nodeRunner) {
    async function execute(workflowDef, initialContext = {}) {
        const def = parseDef(workflowDef);
        const executionId = `exec_${crypto.randomBytes(8).toString('hex')}`;
        const context = { ...initialContext };
        initQuota(context, resolveQuota(def, initialContext));
        const nodeStates = new Map(def.nodes.map((n) => [n.id, STATES.PENDING]));
        const order = topologicalOrder(def);
        const startedAt = Date.now();

        try {
            await withWorkflowTimeout(
                () => executeNodes({ order, def, context, nodeStates, runNode: nodeRunner.runNode }),
                MAX_WORKFLOW_TIMEOUT_MS,
            );
        } catch (err) {
            const status = STUCK_CODES.has(err?.code) ? 'STUCK' : 'FAILED';
            return buildResult({ executionId, def, context, nodeStates, startedAt, status, error: err });
        }

        return buildResult({ executionId, def, context, nodeStates, startedAt, status: 'SUCCESS' });
    }

    return { execute };
}

function resolveQuota(def, initialContext) {
    if (Number.isFinite(initialContext?.tokenQuota)) {
        return initialContext.tokenQuota;
    }
    if (Number.isFinite(def?.tokenQuota)) {
        return def.tokenQuota;
    }
    return undefined; // 由 initQuota 取 DEFAULT_QUOTA
}

function parseDef(workflowDef) {
    const r = WorkflowSchema.safeParse(workflowDef);
    if (!r.success) {
        throw new ValidationError('工作流定义不合法', formatIssues(r.error));
    }
    return r.data;
}

function topologicalOrder(def) {
    const inDeg = new Map(def.nodes.map((n) => [n.id, 0]));
    for (const e of def.edges) {
        inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
    }
    const queue = def.nodes.filter((n) => inDeg.get(n.id) === 0).map((n) => n.id);
    const order = [];
    const adj = new Map();
    for (const n of def.nodes) {
        adj.set(
            n.id,
            def.edges.filter((e) => e.from === n.id).map((e) => e.to),
        );
    }
    while (queue.length) {
        const u = queue.shift();
        order.push(u);
        for (const v of adj.get(u) || []) {
            inDeg.set(v, inDeg.get(v) - 1);
            if (inDeg.get(v) === 0) {
                queue.push(v);
            }
        }
    }
    if (order.length !== def.nodes.length) {
        throw new AppError('工作流拓扑排序失败：可能存在环或孤立节点');
    }
    return order;
}

async function executeNodes({ order, def, context, nodeStates, runNode }) {
    const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
    const visited = new Set();
    const ctx = { def, visited, context, nodeStates };

    for (const nodeId of order) {
        if (!isReachable(nodeId, ctx)) {
            continue;
        }
        visited.add(nodeId);
        await executeSingleNode(nodeMap.get(nodeId), context, nodeStates, runNode);
    }
}

function isReachable(nodeId, { def, visited, context, nodeStates }) {
    const incoming = def.edges.filter((e) => e.to === nodeId);
    if (incoming.length === 0) {
        return true;
    }
    return incoming.some((edge) => isEdgeActive(edge, { visited, context, nodeStates }));
}

function isEdgeActive(edge, { visited, context, nodeStates }) {
    if (!visited.has(edge.from)) {
        return false;
    }
    if (nodeStates.get(edge.from) !== STATES.SUCCESS) {
        return false;
    }
    if (edge.condition === undefined) {
        return true;
    }
    const upstream = context[edge.from];
    return upstream && upstream.branch === edge.condition;
}

async function executeSingleNode(node, context, nodeStates, runNode) {
    nodeStates.set(node.id, transition(nodeStates.get(node.id), ACTIONS.START));
    try {
        const output = await runNode(node, context);
        context[node.id] = output;
        nodeStates.set(node.id, transition(nodeStates.get(node.id), ACTIONS.SUCCEED));
    } catch (err) {
        const action = pickFailAction(err);
        nodeStates.set(node.id, transition(nodeStates.get(node.id), action));
        throw err;
    }
}

const STUCK_CODES = new Set(['STUCK', 'TOKEN_QUOTA_EXCEEDED']);

function pickFailAction(err) {
    if (STUCK_CODES.has(err?.code)) {
        return ACTIONS.STUCK;
    }
    if (err?.code === 'TIMEOUT') {
        return ACTIONS.TIMEOUT;
    }
    return ACTIONS.FAIL;
}

function withWorkflowTimeout(fn, ms) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new AppError(`工作流总时长超时 (${ms}ms)`, { code: 'TIMEOUT', status: 504 })),
            ms,
        );
        timer.unref?.();
    });
    return Promise.race([fn(), timeoutPromise]).finally(() => clearTimeout(timer));
}

function buildResult({ executionId, def, context, nodeStates, startedAt, status, error }) {
    return {
        executionId,
        workflowName: def.name,
        status,
        durationMs: Date.now() - startedAt,
        nodeStates: Object.fromEntries(nodeStates),
        context,
        error: error ? { message: error.message, code: error.code || 'INTERNAL_ERROR' } : null,
    };
}

function formatIssues(zodError) {
    return zodError.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        message: i.message,
    }));
}

module.exports = { createWorkflowExecutor };
