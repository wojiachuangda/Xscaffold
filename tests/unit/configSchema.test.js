// [test] ID: T3.1 | Date: 2026-05-18 | Description: 工作流配置 Schema 单元测试
'use strict';

const { WorkflowConfigSchema } = require('../../src/configManager/configSchema');

function base(overrides = {}) {
    return {
        name: 'demo',
        nodes: [{ id: 'a', type: 'agent', agentId: 'planner' }],
        ...overrides,
    };
}

describe('WorkflowConfigSchema', () => {
    test('最小合法配置', () => {
        const r = WorkflowConfigSchema.safeParse(base());
        expect(r.success).toBe(true);
        expect(r.data.version).toBe('1.0');
        expect(r.data.edges).toEqual([]);
    });

    test('支持四类节点 + workflow ref', () => {
        const r = WorkflowConfigSchema.safeParse(
            base({
                nodes: [
                    { id: 'a', type: 'agent', agentId: 'p' },
                    { id: 't', type: 'tool', toolName: 'addNumbers', params: { a: 1, b: 2 } },
                    { id: 'c', type: 'condition', expression: 'true' },
                    { id: 'k', type: 'code', code: 'return 1' },
                    { id: 'w', type: 'workflow', ref: 'sub-flow' },
                ],
            }),
        );
        expect(r.success).toBe(true);
    });

    test('未知节点类型被拒', () => {
        const r = WorkflowConfigSchema.safeParse({
            name: 'x',
            nodes: [{ id: 'a', type: 'fancy' }],
        });
        expect(r.success).toBe(false);
    });

    test('缺 name', () => {
        const r = WorkflowConfigSchema.safeParse({ nodes: [{ id: 'a', type: 'agent', agentId: 'p' }] });
        expect(r.success).toBe(false);
    });

    test('strict 拒绝未声明字段', () => {
        const r = WorkflowConfigSchema.safeParse(base({ random: 'field' }));
        expect(r.success).toBe(false);
    });

    test('workflow 节点缺 ref', () => {
        const r = WorkflowConfigSchema.safeParse(
            base({
                nodes: [{ id: 'w', type: 'workflow' }],
            }),
        );
        expect(r.success).toBe(false);
    });

    test('边支持 condition 分支标签', () => {
        const r = WorkflowConfigSchema.safeParse(
            base({
                nodes: [
                    { id: 'c', type: 'condition', expression: 'true' },
                    { id: 't', type: 'agent', agentId: 'p' },
                ],
                edges: [{ from: 'c', to: 't', condition: 'true' }],
            }),
        );
        expect(r.success).toBe(true);
    });
});
