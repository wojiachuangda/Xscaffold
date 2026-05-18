// [test] ID: T0.5 | Date: 2026-05-18 | Description: 响应契约工具函数单元测试
'use strict';

const { success, failure } = require('../../src/apiGateway/response/envelope');

describe('envelope.success', () => {
    test('包含 success/data/error 三个字段', () => {
        expect(success({ id: 1 })).toEqual({ success: true, data: { id: 1 }, error: null });
    });

    test('data 默认为 null', () => {
        expect(success()).toEqual({ success: true, data: null, error: null });
    });

    test('可选 meta 字段', () => {
        const out = success([1, 2], { total: 100, page: 1 });
        expect(out.meta).toEqual({ total: 100, page: 1 });
    });
});

describe('envelope.failure', () => {
    test('data 强制为 null，error 透传', () => {
        const out = failure({ code: 'X', message: 'm' });
        expect(out).toEqual({ success: false, data: null, error: { code: 'X', message: 'm' } });
    });
});
