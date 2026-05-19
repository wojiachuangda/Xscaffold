// [planner] ID: PAM-6 | Date: 2026-05-19 | Description: 内置工具 externalAgentSend——调用外部常驻 HTTP Agent（白名单 profile + 全程审计）
'use strict';

const { ExternalAgentSendInputSchema } = require('../../../domain/projectAssistant/schemas/externalAgentCallSchema');
const {
    buildExternalAgentCallRepository,
} = require('../../../domain/projectAssistant/repositories/externalAgentCallRepository');
const { callExternalAgent } = require('../../../domain/projectAssistant/externalAgentClient');
const { TimeoutError } = require('../../../infrastructure/errors/AppError');

function buildData(params, result) {
    return {
        projectId: params.projectId,
        profile: params.profile,
        sessionId: params.sessionId,
        status: 'completed',
        reply: result.reply,
        summary: result.summary,
        durationMs: result.durationMs,
        raw: result.raw,
    };
}

async function handler(params, context = {}) {
    const repo = buildExternalAgentCallRepository(context.db);
    const callId = await repo.insertPending(params);
    try {
        const result = await callExternalAgent(params);
        await repo.markCompleted(callId, result);
        return { ok: true, data: buildData(params, result) };
    } catch (err) {
        // 失败/超时同样留痕；按 tool-dev.md §4 直接抛错，不返回 { ok: false }。
        const status = err instanceof TimeoutError ? 'timeout' : 'failed';
        await repo.markFailed(callId, { status, errorMessage: err.message, durationMs: err.durationMs ?? 0 });
        throw err;
    }
}

module.exports = {
    name: 'externalAgentSend',
    description: '向外部常驻 HTTP Agent 发送指令（白名单 profile，URL 固定在服务端，全程审计）',
    paramsSchema: ExternalAgentSendInputSchema,
    handler,
    timeoutMs: 180000,
};
