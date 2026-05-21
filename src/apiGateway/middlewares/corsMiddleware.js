// [scaffold] ID: CORS-9527 | Date: 2026-05-21 | Description: CORS 中间件——origin 白名单回显 + Allow-Credentials + 预检 204；默认放行 127.0.0.1/localhost:9527 与 5173
'use strict';

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
    'http://127.0.0.1:9527',
    'http://localhost:9527',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
]);

const DEFAULT_ALLOWED_METHODS = 'GET,POST,PUT,DELETE,PATCH,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type,Authorization,X-API-Key';
const DEFAULT_MAX_AGE = '600';

/**
 * 极简 CORS 中间件——origin 命中白名单则回显具体 origin（不返 *）+ Allow-Credentials: true。
 * 不命中：不返 Allow-Origin 头，浏览器自然拒绝跨源（同源/非浏览器调用不受影响）。
 *
 * @param {{ allowedOrigins?: string[] }} [options]
 */
function createCorsMiddleware(options = {}) {
    const origins = resolveAllowedOrigins(options.allowedOrigins);
    return function corsMiddleware(req, res, next) {
        const origin = req.headers.origin;
        const allowed = typeof origin === 'string' && origins.has(origin);
        if (allowed) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS' && allowed) {
            res.setHeader('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS);
            res.setHeader(
                'Access-Control-Allow-Headers',
                req.headers['access-control-request-headers'] || DEFAULT_ALLOWED_HEADERS,
            );
            res.setHeader('Access-Control-Max-Age', DEFAULT_MAX_AGE);
            res.statusCode = 204;
            return res.end();
        }
        return next();
    };
}

function resolveAllowedOrigins(override) {
    if (Array.isArray(override) && override.length > 0) {
        return new Set(override);
    }
    const env = process.env.CORS_ALLOWED_ORIGINS;
    if (typeof env === 'string' && env.trim() !== '') {
        return new Set(
            env
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        );
    }
    return new Set(DEFAULT_ALLOWED_ORIGINS);
}

module.exports = { createCorsMiddleware, DEFAULT_ALLOWED_ORIGINS };
