// [test] ID: T2.1 | Date: 2026-05-18 | Description: toolRegistry 单元测试（注册冲突/未注册/参数校验/超时）
'use strict';

const { z } = require('zod');
const { createRegistry } = require('../../src/toolRegistry/toolRegistry');
const {
    ValidationError,
    NotFoundError,
    ConflictError,
    TimeoutError,
} = require('../../src/infrastructure/errors/AppError');

function buildTool(name, handler, opts = {}) {
    return {
        name,
        description: opts.description || `tool ${name}`,
        paramsSchema: opts.paramsSchema || z.object({ x: z.number() }),
        handler,
        timeoutMs: opts.timeoutMs,
    };
}

describe('toolRegistry.register', () => {
    test('注册并查询成功', () => {
        const reg = createRegistry();
        const t = buildTool('add', async (p) => p.x + 1);
        reg.register(t);
        expect(reg.getTool('add').name).toBe('add');
    });

    test('重复注册 → ConflictError', () => {
        const reg = createRegistry();
        const t = buildTool('dup', async () => 1);
        reg.register(t);
        expect(() => reg.register(t)).toThrow(ConflictError);
    });

    test('非法工具定义 → ValidationError', () => {
        const reg = createRegistry();
        expect(() => reg.register({ name: '', handler: () => 1 })).toThrow(ValidationError);
    });

    test('listTools 返回 name+description 摘要', () => {
        const reg = createRegistry();
        reg.register(buildTool('a', async () => 1));
        reg.register(buildTool('b', async () => 2, { description: 'B 描述' }));
        expect(reg.listTools()).toEqual([
            { name: 'a', description: 'tool a' },
            { name: 'b', description: 'B 描述' },
        ]);
    });
});

describe('toolRegistry.getTool', () => {
    test('不存在 → NotFoundError', () => {
        const reg = createRegistry();
        expect(() => reg.getTool('nope')).toThrow(NotFoundError);
    });
});

describe('toolRegistry.executeTool', () => {
    test('参数合法 → 返回 handler 结果', async () => {
        const reg = createRegistry();
        reg.register(buildTool('add', async (p) => p.x + 1));
        await expect(reg.executeTool('add', { x: 2 })).resolves.toBe(3);
    });

    test('参数不合法 → ValidationError', async () => {
        const reg = createRegistry();
        reg.register(buildTool('add', async (p) => p.x));
        await expect(reg.executeTool('add', { x: 'no' })).rejects.toThrow(ValidationError);
    });

    test('工具超时 → TimeoutError', async () => {
        const reg = createRegistry();
        reg.register(buildTool('slow', () => new Promise((r) => setTimeout(r, 100)), { timeoutMs: 20 }));
        await expect(reg.executeTool('slow', { x: 1 })).rejects.toThrow(TimeoutError);
    });

    test('未注册的工具 → NotFoundError', async () => {
        const reg = createRegistry();
        await expect(reg.executeTool('nope', {})).rejects.toThrow(NotFoundError);
    });
});

describe('toolRegistry.unregister', () => {
    test('成功移除', () => {
        const reg = createRegistry();
        reg.register(buildTool('a', async () => 1));
        expect(reg.unregister('a')).toBe(true);
        expect(() => reg.getTool('a')).toThrow(NotFoundError);
    });
});
