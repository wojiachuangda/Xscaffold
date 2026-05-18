// [scaffold] ID: T4.1 | Date: 2026-05-18 | Description: JWT 认证中间件（含豁免白名单与开发期总开关）
'use strict';

const jwt = require('jsonwebtoken');

const { AuthError, AppError } = require('../../infrastructure/errors/AppError');

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * @param {object} options
 * @param {string} options.secret              JWT 签名密钥
 * @param {string[]} [options.exemptPaths]     豁免路径前缀
 * @param {boolean} [options.disabled]         显式禁用（仅 dev/test）
 * @param {string} [options.algorithm]         默认 HS256
 */
function createAuthMiddleware(options) {
    const config = resolveConfig(options);
    return (req, res, next) => {
        if (config.disabled || isExempt(req.path, config.exemptPaths)) {
            return next();
        }
        const token = extractToken(req);
        if (!token) {
            return next(new AuthError('缺少认证令牌'));
        }
        try {
            req.user = jwt.verify(token, config.secret, { algorithms: [config.algorithm] });
            return next();
        } catch (err) {
            return next(mapJwtError(err));
        }
    };
}

function resolveConfig(options = {}) {
    const secret = options.secret ?? process.env.JWT_SECRET;
    const disabled =
        options.disabled ?? (process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV !== 'production');
    if (!disabled && !secret) {
        throw new AppError('JWT_SECRET 未配置且未启用 AUTH_DISABLED', {
            code: 'CONFIG_ERROR',
            status: 500,
        });
    }
    return {
        secret,
        disabled,
        algorithm: options.algorithm || 'HS256',
        exemptPaths: options.exemptPaths || ['/healthz', '/webhooks'],
    };
}

function isExempt(reqPath, exemptPaths) {
    return exemptPaths.some((prefix) => reqPath === prefix || reqPath.startsWith(`${prefix}/`));
}

function extractToken(req) {
    const header = req.headers.authorization;
    if (!header) {
        return null;
    }
    const m = header.match(BEARER_PATTERN);
    return m ? m[1] : null;
}

function mapJwtError(err) {
    if (err.name === 'TokenExpiredError') {
        return new AuthError('令牌已过期');
    }
    if (err.name === 'JsonWebTokenError') {
        return new AuthError('令牌无效');
    }
    return new AuthError('认证失败');
}

/**
 * 测试辅助：生成一个签名 token
 */
function signTestToken(payload, secret, options = {}) {
    return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h', ...options });
}

module.exports = { createAuthMiddleware, signTestToken };
