// [planner] ID: PAM-1 | Date: 2026-05-19 | Description: ExternalAgentCall 契约（externalAgentSend 入参/出参 + 审计实体）
'use strict';

const { z } = require('zod');
const { ProjectIdSchema, SessionIdSchema, IsoDateTimeSchema } = require('./commonSchema');

/** profile 白名单：第一版仅允许 claudeHttp（PLAN §6.3） */
const ExternalAgentProfileSchema = z.enum(['claudeHttp']);

const ExternalAgentCallStatusSchema = z.enum(['pending', 'completed', 'failed', 'timeout']);

/** 输出截断阈值（PLAN §6.3） */
const REPLY_MAX_BYTES = 32 * 1024; // 32KB
const RAW_MAX_BYTES = 8 * 1024; // 8KB
const SUMMARY_MAX_BYTES = 4 * 1024; // 4KB

/**
 * externalAgentSend Tool 入参（PLAN §6.1）
 */
const ExternalAgentSendInputSchema = z
    .object({
        projectId: ProjectIdSchema,
        profile: ExternalAgentProfileSchema,
        sessionId: SessionIdSchema,
        instruction: z.string().min(1).max(12000),
        expectation: z.string().max(2000).optional(),
        timeoutMs: z.number().int().min(1000).max(180000).default(120000),
    })
    .strict();

/**
 * externalAgentSend Tool 出参 data 部分（PLAN §6.2）
 */
const ExternalAgentSendDataSchema = z.object({
    projectId: ProjectIdSchema,
    profile: ExternalAgentProfileSchema,
    sessionId: SessionIdSchema,
    status: ExternalAgentCallStatusSchema,
    reply: z.string().max(REPLY_MAX_BYTES).nullable().optional(),
    summary: z.string().max(SUMMARY_MAX_BYTES).nullable().optional(),
    durationMs: z.number().int().min(0),
    raw: z.unknown().optional(),
});

/**
 * 完整 ExternalAgentCall 审计实体（落库形态；不暴露 Tool 列表）
 */
const ExternalAgentCallSchema = z.object({
    callId: z.string().min(1).max(64),
    projectId: ProjectIdSchema,
    profile: ExternalAgentProfileSchema,
    sessionId: SessionIdSchema,
    instruction: z.string().min(1).max(12000),
    expectation: z.string().max(2000).nullable().optional(),
    status: ExternalAgentCallStatusSchema,
    reply: z.string().max(REPLY_MAX_BYTES).nullable().optional(),
    summary: z.string().max(SUMMARY_MAX_BYTES).nullable().optional(),
    durationMs: z.number().int().min(0),
    errorMessage: z.string().max(2000).nullable().optional(),
    createdAt: IsoDateTimeSchema.optional(),
});

module.exports = {
    ExternalAgentProfileSchema,
    ExternalAgentCallStatusSchema,
    ExternalAgentSendInputSchema,
    ExternalAgentSendDataSchema,
    ExternalAgentCallSchema,
    REPLY_MAX_BYTES,
    RAW_MAX_BYTES,
    SUMMARY_MAX_BYTES,
};
