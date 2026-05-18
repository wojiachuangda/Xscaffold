// [test] ID: T4.4 | Date: 2026-05-18 | Description: Webhook 签名中间件单元测试（GitHub HMAC-SHA256）
'use strict';

const express = require('express');
const request = require('supertest');

const {
    createGithubSignatureMiddleware,
    signGithubPayload,
} = require('../../src/apiGateway/middlewares/webhookSignature');
const { errorHandler } = require('../../src/apiGateway/middlewares/errorHandler');

const SECRET = 'webhook-secret';

function buildApp(options = {}) {
    const app = express();
    app.use(express.raw({ type: '*/*' }));
    app.use('/wh', createGithubSignatureMiddleware({ secret: SECRET, ...options }));
    app.post('/wh', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    return app;
}

describe('createGithubSignatureMiddleware', () => {
    test('合法签名 → 通过', async () => {
        const payload = Buffer.from(JSON.stringify({ event: 'push' }));
        const sig = signGithubPayload(payload, SECRET);
        const r = await request(buildApp())
            .post('/wh')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', sig)
            .send(payload);
        expect(r.status).toBe(200);
    });

    test('错误签名 → 401', async () => {
        const payload = Buffer.from('{}');
        const r = await request(buildApp())
            .post('/wh')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', 'sha256=deadbeef')
            .send(payload);
        expect(r.status).toBe(401);
        expect(r.body.error.message).toContain('签名');
    });

    test('缺签名头 → 401', async () => {
        const r = await request(buildApp()).post('/wh').send(Buffer.from('{}'));
        expect(r.status).toBe(401);
    });

    test('错误密钥签的签名 → 401', async () => {
        const payload = Buffer.from('{}');
        const sig = signGithubPayload(payload, 'wrong-secret');
        const r = await request(buildApp())
            .post('/wh')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', sig)
            .send(payload);
        expect(r.status).toBe(401);
    });

    test('超出时间窗口 → 401', async () => {
        const payload = Buffer.from('{}');
        const sig = signGithubPayload(payload, SECRET);
        const oldTs = Date.now() - 10 * 60 * 1000;
        const r = await request(buildApp())
            .post('/wh')
            .set('content-type', 'application/octet-stream')
            .set('x-hub-signature-256', sig)
            .set('x-webhook-timestamp', String(oldTs))
            .send(payload);
        expect(r.status).toBe(401);
        expect(r.body.error.message).toContain('时间');
    });

    test('未提供 secret → 工厂抛错', () => {
        expect(() => createGithubSignatureMiddleware({})).toThrow();
    });
});
