// [scaffold] ID: T5.1 | Date: 2026-05-18 | Description: 记忆业务层（封装窗口截断与 Zod 校验）
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

    function saveMessage(input) {
        const parsed = parseOrThrow(SaveMessageInputSchema, input);
        return repository.insert(parsed);
    }

    function getHistory({ sessionId, limit } = {}) {
        const parsed = parseOrThrow(HistoryFilterSchema, {
            sessionId,
            limit: limit ?? defaultWindow,
        });
        return repository.listRecent(parsed.sessionId, parsed.limit);
    }

    function clearSession(sessionId) {
        return repository.deleteSession(sessionId);
    }

    return { saveMessage, getHistory, clearSession };
}

function formatIssues(zodError) {
    return zodError.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        message: i.message,
    }));
}

module.exports = { buildMemoryStore };
