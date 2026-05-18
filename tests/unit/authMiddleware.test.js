// [test] ID: T4.1 | Date: 2026-05-18 | Description: JWT authMiddleware 单元测试
'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { createAuthMiddleware, signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');
const { errorHandler } = require('../../src/apiGateway/middlewares/errorHandler');

const SECRET = 'test-secret-key';

function buildApp(authOptions = {}) {
    const app = express();
    app.use(createAuthMiddleware({ secret: SECRET, ...authOptions }));
    app.get('/healthz', (req, res) => res.json({ ok: true }));
    app.get('/protected', (req, res) => res.json({ user: req.user }));
    app.use(errorHandler);
    return app;
}

describe('authMiddleware', () => {
    test('合法 token → 200，req.user 注入', async () => {
        const token = signTestToken({ sub: 'u1', role: 'admin' }, SECRET);
        const r = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(200);
        expect(r.body.user.sub).toBe('u1');
    });

    test('无 token → 401', async () => {
        const r = await request(buildApp()).get('/protected');
        expect(r.status).toBe(401);
        expect(r.body.error.code).toBe('UNAUTHORIZED');
        expect(r.body.error.message).toContain('缺少');
    });

    test('Bearer 前缀缺失 → 401', async () => {
        const token = signTestToken({ sub: 'u1' }, SECRET);
        const r = await request(buildApp()).get('/protected').set('Authorization', token);
        expect(r.status).toBe(401);
    });

    test('过期 token → 401（令牌已过期）', async () => {
        const token = jwt.sign({ sub: 'u' }, SECRET, { expiresIn: '-1s' });
        const r = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(401);
        expect(r.body.error.message).toContain('过期');
    });

    test('错误签名 → 401（令牌无效）', async () => {
        const token = jwt.sign({ sub: 'u' }, 'wrong-secret');
        const r = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(401);
        expect(r.body.error.message).toContain('无效');
    });

    test('豁免路径 /healthz 无 token 也可访问', async () => {
        const r = await request(buildApp()).get('/healthz');
        expect(r.status).toBe(200);
    });

    test('disabled=true 时全部放行', async () => {
        const r = await request(buildApp({ disabled: true })).get('/protected');
        expect(r.status).toBe(200);
        expect(r.body.user).toBeUndefined();
    });

    test('自定义豁免路径', async () => {
        const r = await request(buildApp({ exemptPaths: ['/protected'] })).get('/protected');
        expect(r.status).toBe(200);
    });

    test('未配置 secret 且未 disabled → 抛 CONFIG_ERROR', () => {
        const prev = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        expect(() => createAuthMiddleware({})).toThrow(/JWT_SECRET/);
        if (prev) {
            process.env.JWT_SECRET = prev;
        }
    });
});
