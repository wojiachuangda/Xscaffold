// [scaffold] ID: V2.6-LONG-SESSION | Date: 2026-05-22 | Description: invoke 长会话上下文装配——会话历史加载 + 归属校验 + 二者取严截断 + 指标 + 降级
'use strict';

const { HistoryConfigSchema } = require('./memorySchema');
const { NotFoundError } = require('../infrastructure/errors/AppError');
const { logger } = require('../observability/logger');

// token 启发式：无 tokenizer 依赖，按 ≈4 chars/token + 每条固定开销估算（仅作截断保护，非计费）
const CHARS_PER_TOKEN = 4;
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

// 从 env 读长会话窗口配置，空串归一为未设交由 Schema 默认兜底（AA-SEAC §4.1）
function loadHistoryConfig(env = process.env) {
    const raw = {};
    if (env.AGENT_HISTORY_MAX_MESSAGES) {
        raw.maxMessages = env.AGENT_HISTORY_MAX_MESSAGES;
    }
    if (env.AGENT_HISTORY_MAX_TOKENS) {
        raw.maxTokens = env.AGENT_HISTORY_MAX_TOKENS;
    }
    return HistoryConfigSchema.parse(raw);
}

function estimateTokens(text) {
    if (!text) {
        return PER_MESSAGE_OVERHEAD_TOKENS;
    }
    return PER_MESSAGE_OVERHEAD_TOKENS + Math.ceil(String(text).length / CHARS_PER_TOKEN);
}

// 从最旧端丢弃直到估算 token ≤ 预算（与条数窗口取严的第二道闸）
function trimToTokenBudget(messages, maxTokens) {
    let total = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    let start = 0;
    while (start < messages.length && total > maxTokens) {
        total -= estimateTokens(messages[start].content);
        start += 1;
    }
    return messages.slice(start);
}

// 跨 owner 访问他人 session → 404（不泄漏存在性，对齐 agents 现有 404）。归属校验失败应硬阻断（fail-closed）
async function assertSessionOwnership({ memoryStore, sessionId, ownerId }) {
    if (!memoryStore || !sessionId) {
        return;
    }
    const owner = await memoryStore.getSessionOwner(sessionId);
    if (owner !== null && owner !== ownerId) {
        throw new NotFoundError('会话不存在');
    }
}

function recordHistoryMetrics({ metrics, kept, dropped, sessionId }) {
    metrics?.observeHistoryLoaded?.(kept);
    if (dropped > 0) {
        metrics?.incrHistoryTruncated?.();
        logger.info({ sessionId, dropped, kept }, 'history truncated');
    }
}

/**
 * 加载会话历史为 LLM 可用的 {role,content}[]：条数窗口 + token 预算二者取严。
 * getHistory 异常时降级为 [] + 结构化告警，绝不阻断 invoke（需求 §4.2 可用性优先）。
 * @param {{ memoryStore, sessionId, ownerId, config?, metrics? }} params
 * @returns {Promise<Array<{role,content}>>}
 */
async function loadHistory({ memoryStore, sessionId, ownerId, config, metrics }) {
    if (!memoryStore || !sessionId) {
        return [];
    }
    try {
        const cfg = config || loadHistoryConfig();
        const [entities, total] = await Promise.all([
            memoryStore.getHistory({ sessionId, ownerId, limit: cfg.maxMessages }),
            memoryStore.countSession(sessionId, ownerId),
        ]);
        const windowed = entities.map((m) => ({ role: m.role, content: m.content }));
        const kept = trimToTokenBudget(windowed, cfg.maxTokens);
        recordHistoryMetrics({ metrics, kept: kept.length, dropped: Math.max(0, total - kept.length), sessionId });
        return kept;
    } catch (err) {
        logger.warn({ err: err.message, sessionId }, 'history load failed; degrade to no-history');
        return [];
    }
}

module.exports = { loadHistory, assertSessionOwnership, loadHistoryConfig, estimateTokens, trimToTokenBudget };
