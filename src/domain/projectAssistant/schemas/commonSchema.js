// [planner] ID: PAM-1 | Date: 2026-05-19 | Description: 项目助理域共享 Zod 原语（id 正则、ISO 时间、分页过滤）
'use strict';

const { z } = require('zod');

/** 项目/任务/会话 id 通用字符集：字母/数字/下划线/中划线/点 */
const SLUG_ID_REGEX = /^[a-zA-Z0-9_.-]+$/u;

/** event.type 业务标签：小写字母开头，后接小写字母/数字/下划线 */
const EVENT_TYPE_REGEX = /^[a-z][a-z0-9_]{0,63}$/u;

const ProjectIdSchema = z.string().min(1).max(128).regex(SLUG_ID_REGEX, 'projectId 仅允许字母/数字/下划线/中划线/点');

const TaskIdSchema = z.string().min(1).max(128).regex(SLUG_ID_REGEX, 'taskId 仅允许字母/数字/下划线/中划线/点');

const SessionIdSchema = z.string().min(1).max(128).regex(SLUG_ID_REGEX, 'sessionId 仅允许字母/数字/下划线/中划线/点');

/** ISO 8601 时间字符串，允许带时区偏移（dueAt 需要 +08:00 之类） */
const IsoDateTimeSchema = z.string().datetime({ offset: true });

/** 通用分页过滤片段（offset/limit） */
const PaginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

module.exports = {
    SLUG_ID_REGEX,
    EVENT_TYPE_REGEX,
    ProjectIdSchema,
    TaskIdSchema,
    SessionIdSchema,
    IsoDateTimeSchema,
    PaginationSchema,
};
