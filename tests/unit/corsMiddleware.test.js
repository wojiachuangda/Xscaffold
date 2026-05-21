// [test] ID: CORS-9527 | Date: 2026-05-21 | Description: corsMiddleware 单元测试——白名单回显 / 预检 204 / Credentials / 非白名单不回 header / ENV 解析
'use strict';

const { createCorsMiddleware, DEFAULT_ALLOWED_ORIGINS } = require('../../src/apiGateway/middlewares/corsMiddleware');

function mockRes() {
    const headers = {};
    return {
        headers,
        statusCode: 200,
        ended: false,
        setHeader(name, value) {
            headers[name] = value;
        },
        getHeader(name) {
            return headers[name];
        },
        end() {
            this.ended = true;
        },
    };
}

function runMw(mw, req) {
    const res = mockRes();
    let nextCalled = false;
    mw(req, res, () => {
        nextCalled = true;
    });
    return { res, nextCalled };
}

describe('corsMiddleware', () => {
    const cors = createCorsMiddleware();

    test('白名单 origin (127.0.0.1:9527) GET → 回显 origin + Allow-Credentials + Vary', () => {
        const { res, nextCalled } = runMw(cors, {
            method: 'GET',
            headers: { origin: 'http://127.0.0.1:9527' },
        });
        expect(nextCalled).toBe(true);
        expect(res.getHeader('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:9527');
        expect(res.getHeader('Access-Control-Allow-Credentials')).toBe('true');
        expect(res.getHeader('Vary')).toBe('Origin');
    });

    test('白名单 OPTIONS 预检 → 204 短路 + Allow-Methods / Allow-Headers', () => {
        const { res, nextCalled } = runMw(cors, {
            method: 'OPTIONS',
            headers: {
                origin: 'http://localhost:9527',
                'access-control-request-headers': 'X-API-Key,Content-Type',
            },
        });
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(204);
        expect(res.ended).toBe(true);
        expect(res.getHeader('Access-Control-Allow-Origin')).toBe('http://localhost:9527');
        expect(res.getHeader('Access-Control-Allow-Methods')).toContain('POST');
        expect(res.getHeader('Access-Control-Allow-Headers')).toBe('X-API-Key,Content-Type');
    });

    test('非白名单 origin → 不回 CORS 头，但 next() 不阻断（浏览器侧拒绝即可）', () => {
        const { res, nextCalled } = runMw(cors, {
            method: 'GET',
            headers: { origin: 'http://evil.com' },
        });
        expect(nextCalled).toBe(true);
        expect(res.getHeader('Access-Control-Allow-Origin')).toBeUndefined();
        expect(res.getHeader('Access-Control-Allow-Credentials')).toBeUndefined();
    });

    test('无 origin（非浏览器/同源调用）→ next()，不写任何 CORS 头', () => {
        const { res, nextCalled } = runMw(cors, { method: 'GET', headers: {} });
        expect(nextCalled).toBe(true);
        expect(res.getHeader('Access-Control-Allow-Origin')).toBeUndefined();
    });

    test('非白名单 OPTIONS → next()（不 204 短路），交给后续 404/路由系统', () => {
        const { res, nextCalled } = runMw(cors, {
            method: 'OPTIONS',
            headers: { origin: 'http://evil.com' },
        });
        expect(nextCalled).toBe(true);
        expect(res.ended).toBe(false);
        expect(res.statusCode).toBe(200);
    });

    test('overrides.allowedOrigins 覆盖默认 → 默认 9527 不再放行', () => {
        const custom = createCorsMiddleware({ allowedOrigins: ['http://only.me'] });
        const { res } = runMw(custom, { method: 'GET', headers: { origin: 'http://127.0.0.1:9527' } });
        expect(res.getHeader('Access-Control-Allow-Origin')).toBeUndefined();
        const { res: ok } = runMw(custom, { method: 'GET', headers: { origin: 'http://only.me' } });
        expect(ok.getHeader('Access-Control-Allow-Origin')).toBe('http://only.me');
    });

    test('CORS_ALLOWED_ORIGINS ENV 解析（逗号分隔、去空白）', () => {
        const old = process.env.CORS_ALLOWED_ORIGINS;
        process.env.CORS_ALLOWED_ORIGINS = ' http://a.test , http://b.test ';
        try {
            const mw = createCorsMiddleware();
            const { res } = runMw(mw, { method: 'GET', headers: { origin: 'http://b.test' } });
            expect(res.getHeader('Access-Control-Allow-Origin')).toBe('http://b.test');
            const { res: blocked } = runMw(mw, { method: 'GET', headers: { origin: 'http://127.0.0.1:9527' } });
            expect(blocked.getHeader('Access-Control-Allow-Origin')).toBeUndefined();
        } finally {
            if (old === undefined) {
                delete process.env.CORS_ALLOWED_ORIGINS;
            } else {
                process.env.CORS_ALLOWED_ORIGINS = old;
            }
        }
    });

    test('默认白名单含 9527 与 5173 的 127.0.0.1/localhost 双形式', () => {
        expect(DEFAULT_ALLOWED_ORIGINS).toEqual(
            expect.arrayContaining([
                'http://127.0.0.1:9527',
                'http://localhost:9527',
                'http://127.0.0.1:5173',
                'http://localhost:5173',
            ]),
        );
    });
});
