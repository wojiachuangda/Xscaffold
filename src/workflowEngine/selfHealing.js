// [scaffold] ID: T5.6 | Date: 2026-05-18 | Description: 有界自愈控制器（AA-SEAC §5：契约失败重投喂 ≤2 次，超限转 STUCK）
'use strict';

const MAX_HEAL_ATTEMPTS = 2;

/**
 * 根据 LLM 输出与可选 schema 评估是否需要触发自愈
 * @param {{ content: string|null }} llmResult
 * @param {object} [options]
 * @param {object} [options.expectedJsonSchema] Zod schema，若提供则尝试解析 content
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function evaluateLLMOutput(llmResult, options = {}) {
    if (!llmResult) {
        return { ok: false, reason: 'LLM 返回为空对象' };
    }
    const content = typeof llmResult.content === 'string' ? llmResult.content.trim() : '';
    if (!content) {
        return { ok: false, reason: 'LLM 返回 content 为空' };
    }
    if (options.expectedJsonSchema) {
        return tryParseJson(content, options.expectedJsonSchema);
    }
    return { ok: true };
}

function tryParseJson(content, schema) {
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (err) {
        return { ok: false, reason: `JSON 解析失败: ${err.message}` };
    }
    const r = schema.safeParse(parsed);
    if (!r.success) {
        return { ok: false, reason: `Schema 校验失败: ${formatIssues(r.error)}` };
    }
    return { ok: true, parsed };
}

function formatIssues(zodError) {
    return zodError.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

/**
 * 执行带自愈的 LLM 调用循环
 * @param {object} params
 * @param {Function} params.callLLM       (extraInstruction?) => Promise<LLMResult>
 * @param {object} [params.expectedJsonSchema]
 * @param {number} [params.maxAttempts]   默认 MAX_HEAL_ATTEMPTS
 * @returns {Promise<{ ok: boolean, attempts: number, result: any, reason?: string }>}
 */
async function runWithSelfHealing(params) {
    const maxAttempts = (params.maxAttempts ?? MAX_HEAL_ATTEMPTS) + 1; // 首次调用 + 自愈次数
    let lastReason = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const extra = attempt === 1 ? null : buildHealInstruction(lastReason);
        const result = await params.callLLM(extra);
        const evaluation = evaluateLLMOutput(result, { expectedJsonSchema: params.expectedJsonSchema });
        if (evaluation.ok) {
            return { ok: true, attempts: attempt, result };
        }
        lastReason = evaluation.reason;
    }
    return { ok: false, attempts: maxAttempts, reason: lastReason, result: null };
}

function buildHealInstruction(reason) {
    return `上一次输出不符合契约（原因：${reason}）。请严格按照预期格式重新输出，不要包含解释性文字。`;
}

module.exports = { evaluateLLMOutput, runWithSelfHealing, MAX_HEAL_ATTEMPTS };
