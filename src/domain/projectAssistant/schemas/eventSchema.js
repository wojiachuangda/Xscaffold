// [planner] ID: PAM-1 | Date: 2026-05-19 | Description: Event 实体 Zod 契约（eventRecord 入参与实体；不可变事件流水）
'use strict';

const { z } = require('zod');
const { ProjectIdSchema, IsoDateTimeSchema, EVENT_TYPE_REGEX, PaginationSchema } = require('./commonSchema');

const EventSeveritySchema = z.enum(['low', 'normal', 'high', 'critical']);

const EventTypeSchema = z
    .string()
    .min(1)
    .max(64)
    .regex(EVENT_TYPE_REGEX, 'event.type 仅允许小写字母开头 + 小写字母/数字/下划线');

/**
 * 完整 Event 实体
 */
const EventSchema = z.object({
    eventId: z.string().min(1).max(64),
    projectId: ProjectIdSchema,
    type: EventTypeSchema,
    title: z.string().min(1).max(256),
    content: z.string().max(4000).nullable().optional(),
    severity: EventSeveritySchema,
    createdAt: IsoDateTimeSchema.optional(),
});

/**
 * eventRecord 入参：服务端生成 eventId / createdAt
 */
const RecordEventSchema = z
    .object({
        projectId: ProjectIdSchema,
        type: EventTypeSchema,
        title: z.string().min(1).max(256),
        content: z.string().max(4000).optional(),
        severity: EventSeveritySchema.default('normal'),
    })
    .strict();

/**
 * GET /projects/:id/events 查询：仅分页（projectId 来自 URL）
 */
const EventPageQuerySchema = z.object({}).merge(PaginationSchema).strict();

module.exports = {
    EventSchema,
    EventSeveritySchema,
    EventTypeSchema,
    RecordEventSchema,
    EventPageQuerySchema,
};
