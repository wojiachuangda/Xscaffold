// [scaffold] ID: V2.5-MT | Date: 2026-05-21 | Description: API Key 认证中间件——X-API-Key → SHA-256 哈希 → 查 active key → 查 active user → 注入 req.user；无 key 放行给 JWT/AUTH_DISABLED
'use strict';

const { AuthError } = require('../../infrastructure/errors/AppError');
const { hashApiKey } = require('../../identity/keyUtil');

/**
 * @param {{ userRepository, apiKeyRepository }} deps
 */
function createApiKeyMiddleware({ userRepository, apiKeyRepository }) {
    return async (req, res, next) => {
        const key = req.headers['x-api-key'];
        if (!key) {
            return next(); // 无 key → 交给后续 JWT / AUTH_DISABLED
        }
        try {
            const apiKey = await apiKeyRepository.findActiveByHash(hashApiKey(key));
            if (!apiKey) {
                return next(new AuthError('API key 无效'));
            }
            const user = await userRepository.findById(apiKey.userId);
            if (!user || user.status !== 'active') {
                return next(new AuthError('API key 关联用户不可用'));
            }
            req.user = { id: user.id, name: user.name, viaApiKey: true };
            return next();
        } catch (err) {
            return next(err);
        }
    };
}

module.exports = { createApiKeyMiddleware };
