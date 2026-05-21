// [refactor] ID: V1.5-A.1-S5 | Date: 2026-05-19 | Description: 记忆业务层（async；窗口截断 + Zod 校验）
'use strict';

const { SaveMessageInputSchema, HistoryFilterSchema } = require('./memorySchema');
const { ValidationError } = require('../infrastructure/errors/AppError');

const DEFAULT_WINDOW = Number(process.env.MEMORY_WINDOW_SIZE) || 10;

function parseOrThrow(schema, input) {
    const r = schema.safeParse(input);
    if (!r.success) {
        throw new ValidationError('记忆参数不合法', formatIssues(r.error));
    }
    return r.data;
}

function buildMemoryStore(repository, options = {}) {
    if (!repository) {
        throw new Error('memoryStore 需要注入 repository');
    }
    const defaultWindow = options.defaultWindow ?? DEFAULT_WINDOW;

    async function saveMessage(input) {
        const parsed = parseOrThrow(SaveMessageInputSchema, input);
        return await repository.insert(parsed);
    }

    async function getHistory({ sessionId, limit, ownerId } = {}) {
        const parsed = parseOrThrow(HistoryFilterSchema, {
            sessionId,
            ownerId,
            limit: limit ?? defaultWindow,
        });
        return await repository.listRecent(parsed.sessionId, parsed.limit, parsed.ownerId);
    }

    // 取该 session 当前归属 owner（null=无消息，可认领）；invoke 归属校验用
    async function getSessionOwner(sessionId) {
        return await repository.findSessionOwner(sessionId);
    }

    // session 消息总数（owner 可选）；截断「丢弃 N 条」精确计数用
    async function countSession(sessionId, ownerId) {
        return await repository.countBySession(sessionId, ownerId);
    }

    async function clearSession(sessionId) {
        return await repository.deleteSession(sessionId);
    }

    return { saveMessage, getHistory, getSessionOwner, countSession, clearSession };
}

function formatIssues(zodError) {
    return zodError.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        message: i.message,
    }));
}

module.exports = { buildMemoryStore };
