// [planner] ID: PAM-1 | Date: 2026-05-19 | Description: Project 实体 Zod 契约（projectGetStatus / projectUpdateStatus 入参与实体）
'use strict';

const { z } = require('zod');
const { ProjectIdSchema, IsoDateTimeSchema, PaginationSchema } = require('./commonSchema');

const ProjectStatusSchema = z.enum(['active', 'paused', 'done', 'blocked']);
const ProjectHealthSchema = z.enum(['green', 'yellow', 'red']);

/**
 * 完整 Project 实体（从存储读取后的形态）
 */
const ProjectSchema = z.object({
    projectId: ProjectIdSchema,
    name: z.string().min(1).max(128),
    phase: z.string().min(1).max(32),
    status: ProjectStatusSchema,
    health: ProjectHealthSchema,
    completion: z.number().int().min(0).max(100),
    summary: z.string().max(2000),
    createdAt: IsoDateTimeSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
});

/**
 * projectGetStatus 入参
 */
const GetProjectStatusSchema = z
    .object({
        projectId: ProjectIdSchema,
    })
    .strict();

/**
 * projectUpdateStatus 入参（Q3：仅允许 phase/status/health/completion/summary）
 * 至少携带一个可更新字段；name/projectId/updatedAt 严禁更新。
 */
const UpdateProjectStatusSchema = z
    .object({
        projectId: ProjectIdSchema,
        phase: z.string().min(1).max(32).optional(),
        status: ProjectStatusSchema.optional(),
        health: ProjectHealthSchema.optional(),
        completion: z.number().int().min(0).max(100).optional(),
        summary: z.string().max(2000).optional(),
    })
    .strict()
    .refine(
        (obj) => ['phase', 'status', 'health', 'completion', 'summary'].some((k) => obj[k] !== undefined),
        '至少需要提供 phase/status/health/completion/summary 之一',
    );

/**
 * GET /projects 列表过滤：status/health 可选 + 分页
 */
const ListProjectsFilterSchema = z
    .object({
        status: ProjectStatusSchema.optional(),
        health: ProjectHealthSchema.optional(),
    })
    .merge(PaginationSchema)
    .strict();

const ProjectIdParamSchema = z.object({ id: ProjectIdSchema });

module.exports = {
    ProjectSchema,
    ProjectStatusSchema,
    ProjectHealthSchema,
    GetProjectStatusSchema,
    UpdateProjectStatusSchema,
    ListProjectsFilterSchema,
    ProjectIdParamSchema,
};
