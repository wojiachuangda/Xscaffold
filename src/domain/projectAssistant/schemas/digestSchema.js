// [planner] ID: PAM-1 | Date: 2026-05-19 | Description: projectGenerateDigest 入参与摘要输出 Zod 契约（Q6：format markdown/json）
'use strict';

const { z } = require('zod');
const { ProjectIdSchema, IsoDateTimeSchema } = require('./commonSchema');
const { ProjectSchema } = require('./projectSchema');
const { TaskSchema } = require('./taskSchema');
const { EventSchema } = require('./eventSchema');
const { ReminderSchema } = require('./reminderSchema');

const DigestRangeSchema = z.enum(['daily', 'weekly', 'all']);
const DigestFormatSchema = z.enum(['markdown', 'json']);

/**
 * projectGenerateDigest 入参（PLAN §10.9 + Q6）
 */
const GenerateDigestInputSchema = z
    .object({
        projectId: ProjectIdSchema,
        range: DigestRangeSchema.default('daily'),
        format: DigestFormatSchema.default('markdown'),
    })
    .strict();

/**
 * format=json 时的结构化摘要负载（供程序消费；recentEvents 固定上限 10 条）
 */
const DigestJsonSchema = z.object({
    project: ProjectSchema,
    tasks: z.object({
        total: z.number().int().min(0),
        open: z.number().int().min(0),
        items: z.array(TaskSchema),
    }),
    recentEvents: z.array(EventSchema).max(10),
    dueReminders: z.array(ReminderSchema),
    range: DigestRangeSchema,
    generatedAt: IsoDateTimeSchema,
});

module.exports = {
    DigestRangeSchema,
    DigestFormatSchema,
    GenerateDigestInputSchema,
    DigestJsonSchema,
};
