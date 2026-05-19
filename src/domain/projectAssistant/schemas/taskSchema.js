// [planner] ID: PAM-1 | Date: 2026-05-19 | Description: Task 实体 Zod 契约（taskList / taskUpsert 入参与实体）
'use strict';

const { z } = require('zod');
const { ProjectIdSchema, TaskIdSchema, IsoDateTimeSchema, PaginationSchema } = require('./commonSchema');

const TaskStatusSchema = z.enum(['open', 'in_progress', 'blocked', 'done', 'skipped']);
const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

/**
 * 完整 Task 实体（(projectId, taskId) 为自然主键）
 */
const TaskSchema = z.object({
    projectId: ProjectIdSchema,
    taskId: TaskIdSchema,
    title: z.string().min(1).max(256),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    notes: z.string().max(4000).nullable().optional(),
    createdAt: IsoDateTimeSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
});

/**
 * taskUpsert 入参：projectId + taskId + title 必填，其余可选（首次 insert 使用默认值）
 */
const UpsertTaskSchema = z
    .object({
        projectId: ProjectIdSchema,
        taskId: TaskIdSchema,
        title: z.string().min(1).max(256),
        status: TaskStatusSchema.optional(),
        priority: TaskPrioritySchema.optional(),
        notes: z.string().max(4000).nullable().optional(),
    })
    .strict();

/**
 * taskList 过滤器：projectId 必填；status/priority 可选；带分页
 */
const ListTasksFilterSchema = z
    .object({
        projectId: ProjectIdSchema,
        status: TaskStatusSchema.optional(),
        priority: TaskPrioritySchema.optional(),
    })
    .merge(PaginationSchema)
    .strict();

module.exports = {
    TaskSchema,
    TaskStatusSchema,
    TaskPrioritySchema,
    UpsertTaskSchema,
    ListTasksFilterSchema,
};
