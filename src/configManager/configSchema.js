// [scaffold] ID: T3.1 | Date: 2026-05-18 | Description: YAML/JSON 工作流配置 Schema 与到 workflowDef 的转换契约
'use strict';

const { z } = require('zod');

/**
 * 节点 id 规则与 workflowSchema 保持一致
 */
const NodeIdSchema = z
    .string()
    .min(1)
    .max(64)
    .regex(/^[\w-]+$/u);

/**
 * 配置文件中的节点写法（更友好：边可以省略，由 type=workflow 的 ref 触发子流程）
 * MVP 阶段仅校验 ref 语法，不解引用（延后 V1）。
 */
const ConfigBaseNodeSchema = z.object({
    id: NodeIdSchema,
    type: z.enum(['agent', 'tool', 'condition', 'code', 'workflow']),
    description: z.string().max(500).optional(),
    timeoutMs: z.number().int().positive().max(600000).optional(),
    retry: z
        .object({
            maxAttempts: z.number().int().min(1).max(10).default(1),
            backoffMs: z.number().int().min(0).max(60000).default(1000),
        })
        .strict()
        .optional(),
});

const ConfigAgentNodeSchema = ConfigBaseNodeSchema.extend({
    type: z.literal('agent'),
    agentId: z.string().min(1).max(64),
    input: z.union([z.string(), z.record(z.any())]).optional(),
}).strict();

const ConfigToolNodeSchema = ConfigBaseNodeSchema.extend({
    type: z.literal('tool'),
    toolName: z.string().min(1).max(64),
    params: z.record(z.any()).optional(),
}).strict();

const ConfigConditionNodeSchema = ConfigBaseNodeSchema.extend({
    type: z.literal('condition'),
    expression: z.string().min(1).max(2000),
}).strict();

const ConfigCodeNodeSchema = ConfigBaseNodeSchema.extend({
    type: z.literal('code'),
    code: z.string().min(1).max(10000),
}).strict();

/**
 * workflow 节点：MVP 仅记录 ref，由上层解析（本阶段不解引用）
 */
const ConfigWorkflowNodeSchema = ConfigBaseNodeSchema.extend({
    type: z.literal('workflow'),
    ref: z.string().min(1).max(128),
}).strict();

const ConfigNodeSchema = z.discriminatedUnion('type', [
    ConfigAgentNodeSchema,
    ConfigToolNodeSchema,
    ConfigConditionNodeSchema,
    ConfigCodeNodeSchema,
    ConfigWorkflowNodeSchema,
]);

const ConfigEdgeSchema = z
    .object({
        from: NodeIdSchema,
        to: NodeIdSchema,
        condition: z.enum(['true', 'false']).optional(),
    })
    .strict();

const WorkflowConfigSchema = z
    .object({
        name: z.string().min(1).max(128),
        version: z.union([z.string(), z.number()]).default('1.0'),
        description: z.string().max(2000).optional(),
        nodes: z.array(ConfigNodeSchema).min(1),
        edges: z.array(ConfigEdgeSchema).default([]),
    })
    .strict();

module.exports = {
    WorkflowConfigSchema,
    ConfigNodeSchema,
    ConfigEdgeSchema,
    ConfigWorkflowNodeSchema,
};
