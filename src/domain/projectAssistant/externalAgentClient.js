// [planner] ID: PAM-6 | Date: 2026-05-19 | Description: 外部常驻 Agent HTTP adapter（SSRF 校验 + 固定请求体 + 超时 + 输出截断）
'use strict';

const { resolveProfile } = require('./externalAgentProfiles');
const { assertSafeUrl } = require('../../toolRegistry/builtinTools/httpGuard');
const { REPLY_MAX_BYTES, RAW_MAX_BYTES, SUMMARY_MAX_BYTES } = require('./schemas/externalAgentCallSchema');
const { AppError, TimeoutError } = require('../../infrastructure/errors/AppError');

const EXTERNAL_ERROR_CODE = 'EXTERNAL_AGENT_ERROR';

function truncate(str, maxLen) {
    if (typeof str !== 'string') {
        return '';
    }
    return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function pickString(...candidates) {
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            return candidate;
        }
    }
    return '';
}

// PLAN §6.3：发送给外部服务的固定请求体，外部协议差异在此 adapter 内消化。
function buildRequestBody(input) {
    return {
        sessionId: input.sessionId,
        message: input.instruction,
        metadata: {
            projectId: input.projectId,
            source: 'xscaffold',
            expectation: input.expectation ?? '',
        },
    };
}

function truncateRaw(payload) {
    const json = JSON.stringify(payload ?? {});
    return json.length > RAW_MAX_BYTES ? { truncated: true } : payload;
}

// 把外部服务的多形态响应归一为 { reply, summary, raw }，并按阈值截断。
function adaptResponse(payload) {
    return {
        reply: truncate(pickString(payload?.reply, payload?.message), REPLY_MAX_BYTES),
        summary: truncate(pickString(payload?.summary), SUMMARY_MAX_BYTES),
        raw: truncateRaw(payload),
    };
}

function toCallError(err, timeoutMs, durationMs) {
    if (err instanceof AppError) {
        return err;
    }
    const wrapped =
        err.name === 'AbortError'
            ? new TimeoutError(`外部 Agent 调用超时 (${timeoutMs}ms)`)
            : new AppError(`外部 Agent 调用失败: ${err.message}`, { code: EXTERNAL_ERROR_CODE, status: 502 });
    wrapped.durationMs = durationMs;
    return wrapped;
}

async function handleResponse(res, startedAt) {
    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
        const err = new AppError(`外部 Agent 返回 HTTP ${res.status}`, { code: EXTERNAL_ERROR_CODE, status: 502 });
        err.durationMs = durationMs;
        throw err;
    }
    const payload = await res.json().catch(() => ({}));
    return { ...adaptResponse(payload), durationMs };
}

async function fetchWithTimeout(url, profile, input, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
        const res = await fetch(url.toString(), {
            method: profile.method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(buildRequestBody(input)),
            signal: controller.signal,
        });
        return await handleResponse(res, startedAt);
    } catch (err) {
        throw toCallError(err, timeoutMs, Date.now() - startedAt);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 调用外部常驻 Agent。timeoutMs 以 profile 配置为硬上限。
 */
async function callExternalAgent(input) {
    const profile = resolveProfile(input.profile);
    const targetUrl = `${profile.baseUrl}${profile.endpoint}`;
    // D3：profile 自身 host 进白名单，豁免私网拒绝；Agent/用户无法传入任何 URL。
    const { url } = await assertSafeUrl(targetUrl, { allowedHosts: [new URL(profile.baseUrl).hostname] });
    const timeoutMs = Math.min(input.timeoutMs ?? profile.timeoutMs, profile.timeoutMs);
    return fetchWithTimeout(url, profile, input, timeoutMs);
}

module.exports = { callExternalAgent, buildRequestBody, adaptResponse };
