// [test] ID: T1.2 | Date: 2026-05-18 | Description: Agent Zod Schema 单元测试（合法/非法 case ≥3）
'use strict';

const {
    AgentSchema,
    CreateAgentSchema,
    UpdateAgentSchema,
    ListAgentsFilterSchema,
} = require('../../src/agentManager/agentSchema');

describe('CreateAgentSchema', () => {
    test('合法：最小字段集（name + model）', () => {
        const r = CreateAgentSchema.parse({ name: 'planner', model: 'gpt-4' });
        expect(r.status).toBe('enabled');
        expect(r.tools).toEqual([]);
    });

    test('合法：完整字段', () => {
        const input = {
            name: 'researcher',
            description: '研究员 Agent',
            model: 'gpt-4',
            tools: ['httpRequest', 'queryDatabase'],
            status: 'disabled',
        };
        expect(CreateAgentSchema.parse(input)).toMatchObject(input);
    });

    test('非法：缺 name', () => {
        expect(() => CreateAgentSchema.parse({ model: 'gpt-4' })).toThrow();
    });

    test('非法：name 含特殊字符', () => {
        expect(() => CreateAgentSchema.parse({ name: '<script>', model: 'gpt-4' })).toThrow(/名称仅允许/);
    });

    test('非法：未声明字段（strict）', () => {
        expect(() => CreateAgentSchema.parse({ name: 'a', model: 'm', foo: 'bar' })).toThrow();
    });

    test('非法：tools 含空字符串', () => {
        expect(() => CreateAgentSchema.parse({ name: 'a', model: 'm', tools: [''] })).toThrow();
    });
});

describe('UpdateAgentSchema', () => {
    test('合法：单字段更新', () => {
        expect(UpdateAgentSchema.parse({ status: 'disabled' })).toEqual({ status: 'disabled' });
    });

    test('非法：空对象', () => {
        expect(() => UpdateAgentSchema.parse({})).toThrow(/不能为空/);
    });

    test('非法：包含 id 字段', () => {
        expect(() => UpdateAgentSchema.parse({ id: 'x', name: 'a' })).toThrow();
    });
});

describe('ListAgentsFilterSchema', () => {
    test('默认值 limit=50 offset=0', () => {
        expect(ListAgentsFilterSchema.parse({})).toEqual({ limit: 50, offset: 0 });
    });

    test('coerce 字符串数字', () => {
        expect(ListAgentsFilterSchema.parse({ limit: '20', offset: '10' })).toEqual({
            limit: 20,
            offset: 10,
        });
    });

    test('非法 status', () => {
        expect(() => ListAgentsFilterSchema.parse({ status: 'foo' })).toThrow();
    });

    test('非法 limit 超上限', () => {
        expect(() => ListAgentsFilterSchema.parse({ limit: 999 })).toThrow();
    });
});

describe('AgentSchema (完整实体)', () => {
    test('合法 ISO 时间戳', () => {
        const now = new Date().toISOString();
        const r = AgentSchema.parse({
            id: 'a1',
            name: 'a',
            model: 'm',
            tools: [],
            status: 'enabled',
            createdAt: now,
            updatedAt: now,
        });
        expect(r.id).toBe('a1');
    });

    test('description 可空', () => {
        const r = AgentSchema.parse({ id: 'a1', name: 'a', model: 'm', description: null });
        expect(r.description).toBeNull();
    });
});
