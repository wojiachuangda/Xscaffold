// [scaffold] ID: T2.5 | Date: 2026-05-18 | Description: 工作流 Zod Schema（节点 union + DAG 环检测）
'use strict';

const { z } = require('zod');

const NodeIdSchema = z
    .string()
    .min(1)
    .max(64)
    .regex(/^[\w-]+$/u);

const RetryPolicySchema = z
    .object({
        maxAttempts: z.number().int().min(1).max(10).default(1),
        backoffMs: z.number().int().min(0).max(60000).default(1000),
    })
    .strict()
    .default({ maxAttempts: 1, backoffMs: 1000 });

const BaseNodeSchema = z.object({
    id: NodeIdSchema,
    type: z.string(),
    description: z.string().max(500).optional(),
    timeoutMs: z.number().int().positive().max(600000).optional(),
    retry: RetryPolicySchema.optional(),
});

const AgentNodeSchema = BaseNodeSchema.extend({
    type: z.literal('agent'),
    agentId: z.string().min(1).max(64),
    input: z.union([z.string(), z.record(z.any())]).optional(),
}).strict();

const ToolNodeSchema = BaseNodeSchema.extend({
    type: z.literal('tool'),
    toolName: z.string().min(1).max(64),
    params: z.record(z.any()).optional(),
}).strict();

const ConditionNodeSchema = BaseNodeSchema.extend({
    type: z.literal('condition'),
    expression: z.string().min(1).max(2000),
}).strict();

const CodeNodeSchema = BaseNodeSchema.extend({
    type: z.literal('code'),
    code: z.string().min(1).max(10000),
}).strict();

const NodeSchema = z.discriminatedUnion('type', [AgentNodeSchema, ToolNodeSchema, ConditionNodeSchema, CodeNodeSchema]);

const EdgeSchema = z
    .object({
        from: NodeIdSchema,
        to: NodeIdSchema,
        condition: z.enum(['true', 'false']).optional(),
    })
    .strict();

const WorkflowSchema = z
    .object({
        name: z.string().min(1).max(128),
        version: z.union([z.string(), z.number()]).default('1.0'),
        description: z.string().max(2000).optional(),
        nodes: z.array(NodeSchema).min(1),
        edges: z.array(EdgeSchema).default([]),
        tokenQuota: z.number().int().positive().max(10_000_000).optional(),
    })
    .strict()
    .superRefine(validateGraph);

function validateGraph(wf, ctx) {
    const ids = wf.nodes.map((n) => n.id);
    assertUniqueIds(ids, ctx);
    assertEdgeEndpointsExist(wf, new Set(ids), ctx);
    assertNoCycle(wf, ctx);
}

function assertUniqueIds(ids, ctx) {
    const dup = ids.find((id, idx) => ids.indexOf(id) !== idx);
    if (dup) {
        ctx.addIssue({ code: 'custom', path: ['nodes'], message: `节点 id 重复: ${dup}` });
    }
}

function assertEdgeEndpointsExist(wf, nodeSet, ctx) {
    wf.edges.forEach((edge, idx) => {
        if (!nodeSet.has(edge.from)) {
            ctx.addIssue({ code: 'custom', path: ['edges', idx, 'from'], message: `节点不存在: ${edge.from}` });
        }
        if (!nodeSet.has(edge.to)) {
            ctx.addIssue({ code: 'custom', path: ['edges', idx, 'to'], message: `节点不存在: ${edge.to}` });
        }
    });
}

function assertNoCycle(wf, ctx) {
    const adj = buildAdjacency(wf);
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map(wf.nodes.map((n) => [n.id, WHITE]));

    function dfs(u) {
        color.set(u, GRAY);
        for (const v of adj.get(u) || []) {
            const c = color.get(v);
            if (c === GRAY) {
                return true;
            }
            if (c === WHITE && dfs(v)) {
                return true;
            }
        }
        color.set(u, BLACK);
        return false;
    }

    for (const n of wf.nodes) {
        if (color.get(n.id) === WHITE && dfs(n.id)) {
            ctx.addIssue({ code: 'custom', path: ['edges'], message: '检测到环' });
            return;
        }
    }
}

function buildAdjacency(wf) {
    const adj = new Map(wf.nodes.map((n) => [n.id, []]));
    for (const e of wf.edges) {
        if (adj.has(e.from)) {
            adj.get(e.from).push(e.to);
        }
    }
    return adj;
}

module.exports = {
    WorkflowSchema,
    NodeSchema,
    EdgeSchema,
    AgentNodeSchema,
    ToolNodeSchema,
    ConditionNodeSchema,
    CodeNodeSchema,
    RetryPolicySchema,
};
