// [test] ID: T4.2 | Date: 2026-05-18 | Description: rateLimiter 中间件单元测试
'use strict';

const express = require('express');
const request = require('supertest');

const { createRateLimiter } = require('../../src/apiGateway/middlewares/rateLimiter');
const { errorHandler } = require('../../src/apiGateway/middlewares/errorHandler');

function buildApp(options) {
    const app = express();
    app.set('trust proxy', true);
    app.use(createRateLimiter(options));
    app.get('/x', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    return app;
}

describe('rateLimiter', () => {
    test('窗口内未超限 → 全部 200', async () => {
        const app = buildApp({ max: 3, windowMs: 60000 });
        for (let i = 0; i < 3; i += 1) {
            const r = await request(app).get('/x');
            expect(r.status).toBe(200);
        }
    });

    test('超过 max → 429 + Retry-After 头', async () => {
        const app = buildApp({ max: 2, windowMs: 60000 });
        await request(app).get('/x');
        await request(app).get('/x');
        const r = await request(app).get('/x');
        expect(r.status).toBe(429);
        expect(r.body.error.code).toBe('RATE_LIMIT');
        expect(r.headers['retry-after']).toBeDefined();
        expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    });

    test('窗口滚动：过期记录不计数', async () => {
        const app = buildApp({ max: 1, windowMs: 30 });
        const a = await request(app).get('/x');
        expect(a.status).toBe(200);
        await new Promise((r) => setTimeout(r, 50));
        const b = await request(app).get('/x');
        expect(b.status).toBe(200);
    });

    test('bypass=true 不计数', async () => {
        const app = buildApp({ max: 1, windowMs: 60000, bypass: true });
        for (let i = 0; i < 5; i += 1) {
            const r = await request(app).get('/x');
            expect(r.status).toBe(200);
        }
    });

    test('自定义 keyFn：按 query.user 分组', async () => {
        const app = buildApp({
            max: 1,
            windowMs: 60000,
            keyFn: (req) => req.query.user || 'anon',
        });
        await request(app).get('/x?user=a'); // a 用掉额度
        const a2 = await request(app).get('/x?user=a');
        expect(a2.status).toBe(429);
        const b = await request(app).get('/x?user=b');
        expect(b.status).toBe(200);
    });
});
