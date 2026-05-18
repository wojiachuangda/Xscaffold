// [test] ID: T0.3 | Date: 2026-05-18 | Description: AppError 基类与子类单元测试
'use strict';

const {
    AppError,
    ValidationError,
    NotFoundError,
    AuthError,
    ForbiddenError,
    ConflictError,
    TimeoutError,
    RateLimitError,
} = require('../../src/infrastructure/errors/AppError');

describe('AppError', () => {
    test('默认 code 与 status', () => {
        const err = new AppError('boom');
        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe('INTERNAL_ERROR');
        expect(err.status).toBe(500);
        expect(err.message).toBe('boom');
        expect(err.name).toBe('AppError');
    });

    test('自定义 code/status/details', () => {
        const err = new AppError('bad', { code: 'X', status: 418, details: { foo: 1 } });
        expect(err.code).toBe('X');
        expect(err.status).toBe(418);
        expect(err.details).toEqual({ foo: 1 });
    });

    test('toResponse 含 details', () => {
        const err = new AppError('m', { code: 'C', status: 400, details: ['a'] });
        expect(err.toResponse()).toEqual({ code: 'C', message: 'm', details: ['a'] });
    });

    test('toResponse 不含 details 时不输出该字段', () => {
        const err = new AppError('m', { code: 'C', status: 400 });
        expect(err.toResponse()).toEqual({ code: 'C', message: 'm' });
    });

    test('cause 字段保留', () => {
        const root = new Error('root');
        const err = new AppError('wrap', { cause: root });
        expect(err.cause).toBe(root);
    });
});

describe('AppError 子类', () => {
    const cases = [
        [ValidationError, 400, 'VALIDATION_ERROR'],
        [NotFoundError, 404, 'NOT_FOUND'],
        [AuthError, 401, 'UNAUTHORIZED'],
        [ForbiddenError, 403, 'FORBIDDEN'],
        [ConflictError, 409, 'CONFLICT'],
        [TimeoutError, 504, 'TIMEOUT'],
        [RateLimitError, 429, 'RATE_LIMIT'],
    ];
    test.each(cases)('%p → status %p / code %p', (Cls, status, code) => {
        const err = new Cls();
        expect(err).toBeInstanceOf(AppError);
        expect(err.status).toBe(status);
        expect(err.code).toBe(code);
        expect(err.name).toBe(Cls.name);
    });

    test('子类支持自定义消息与 details', () => {
        const err = new ValidationError('字段缺失', [{ path: 'name' }]);
        expect(err.message).toBe('字段缺失');
        expect(err.details).toEqual([{ path: 'name' }]);
        expect(err.toResponse()).toEqual({
            code: 'VALIDATION_ERROR',
            message: '字段缺失',
            details: [{ path: 'name' }],
        });
    });
});
