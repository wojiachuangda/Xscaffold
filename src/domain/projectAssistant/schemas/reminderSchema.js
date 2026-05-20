// [planner] ID: PAM-1 | Date: 2026-05-19 | Description: Reminder 实体 Zod 契约（reminderCreate / reminderListDue 入参与实体）
'use strict';

const { z } = require('zod');
const { ProjectIdSchema, IsoDateTimeSchema, PaginationSchema } = require('./commonSchema');

const ReminderSeveritySchema = z.enum(['low', 'normal', 'high']);
const ReminderStatusSchema = z.enum(['open', 'done', 'dismissed']);

/**
 * 完整 Reminder 实体
 */
const ReminderSchema = z.object({
    reminderId: z.string().min(1).max(64),
    projectId: ProjectIdSchema,
    title: z.string().min(1).max(256),
    content: z.string().max(2000).nullable().optional(),
    dueAt: IsoDateTimeSchema,
    severity: ReminderSeveritySchema,
    status: ReminderStatusSchema,
    createdAt: IsoDateTimeSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
});

/**
 * reminderCreate 入参
 */
const CreateReminderSchema = z
    .object({
        projectId: ProjectIdSchema,
        title: z.string().min(1).max(256),
        content: z.string().max(2000).optional(),
        dueAt: IsoDateTimeSchema,
        severity: ReminderSeveritySchema.default('normal'),
    })
    .strict();

/**
 * reminderListDue 过滤器：before 必填；projectId 可选（跨项目查询）；带分页
 */
const ListDueRemindersSchema = z
    .object({
        before: IsoDateTimeSchema,
        projectId: ProjectIdSchema.optional(),
    })
    .merge(PaginationSchema)
    .strict();

/**
 * GET /projects/:id/reminders 查询：projectId 来自 URL；before 可选（默认服务端填 now + 7d）
 */
const ListProjectRemindersQuerySchema = z
    .object({
        before: IsoDateTimeSchema.optional(),
    })
    .merge(PaginationSchema)
    .strict();

module.exports = {
    ReminderSchema,
    ReminderSeveritySchema,
    ReminderStatusSchema,
    CreateReminderSchema,
    ListDueRemindersSchema,
    ListProjectRemindersQuerySchema,
};
