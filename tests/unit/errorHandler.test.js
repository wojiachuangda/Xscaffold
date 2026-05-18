// [test] ID: T0.3 | Date: 2026-05-18 | Description: 全局错误中间件单元测试（通过 supertest 验证状态码与响应契约）
'use strict';

const express = require('express');
const request = require('supertest');

const { errorHandler, notFoundHandler } = require('../../src/apiGateway/middlewares/errorHandler');
const { AppError, ValidationError, NotFoundError } = require('../../src/infrastructure/errors/AppError');

function buildApp(routeHandler) {
    const app = express();
    app.get('/test', routeHandler);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}

describe('errorHandler', () => {
    test('AppError 映射为对应状态码与响应契约', async () => {
        const app = buildApp((req, res, next) => next(new ValidationError('字段缺失', [{ path: 'a' }])));
        const res = await request(app).get('/test');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            success: false,
            data: null,
            error: { code: 'VALIDATION_ERROR', message: '字段缺失', details: [{ path: 'a' }] },
        });
    });

    test('NotFoundError 返回 404', async () => {
        const app = buildApp((req, res, next) => next(new NotFoundError()));
        const res = await request(app).get('/test');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('AppError 默认 500', async () => {
        const app = buildApp((req, res, next) => next(new AppError('boom')));
        const res = await request(app).get('/test');
        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe('INTERNAL_ERROR');
        expect(res.body.error.message).toBe('boom');
    });

    test('非 AppError 一律 500 且不泄漏 message', async () => {
        const app = buildApp((req, res, next) => next(new Error('内部细节不应外泄')));
        const res = await request(app).get('/test');
        expect(res.status).toBe(500);
        expect(res.body.error.message).toBe('服务器内部错误');
        expect(res.body.error.message).not.toContain('内部细节');
    });
});

describe('notFoundHandler', () => {
    test('未匹配路由返回 404', async () => {
        const app = express();
        app.use(notFoundHandler);
        app.use(errorHandler);
        const res = await request(app).get('/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.body.error.message).toContain('/does-not-exist');
    });
});
