// [test] ID: T2.5 | Date: 2026-05-18 | Description: WorkflowSchema 校验测试（节点 union + 环检测 + 端点存在）
'use strict';

const { WorkflowSchema } = require('../../src/workflowEngine/workflowSchema');

function wf(overrides = {}) {
    return {
        name: 'demo',
        nodes: [
            { id: 'a', type: 'agent', agentId: 'planner' },
            { id: 'b', type: 'tool', toolName: 'addNumbers', params: { a: 1, b: 2 } },
        ],
        edges: [{ from: 'a', to: 'b' }],
        ...overrides,
    };
}

describe('合法工作流', () => {
    test('简单两节点串行', () => {
        expect(WorkflowSchema.safeParse(wf()).success).toBe(true);
    });

    test('支持 condition 节点', () => {
        const r = WorkflowSchema.safeParse(
            wf({
                nodes: [
                    { id: 'a', type: 'agent', agentId: 'p' },
                    { id: 'c', type: 'condition', expression: '{{a.score}} > 0.5' },
                ],
                edges: [{ from: 'a', to: 'c' }],
            }),
        );
        expect(r.success).toBe(true);
    });

    test('支持 code 节点', () => {
        const r = WorkflowSchema.safeParse(wf({ nodes: [{ id: 'c', type: 'code', code: 'return 1' }], edges: [] }));
        expect(r.success).toBe(true);
    });

    test('edges 默认空', () => {
        const r = WorkflowSchema.safeParse({
            name: 'x',
            nodes: [{ id: 'a', type: 'agent', agentId: 'p' }],
        });
        expect(r.success).toBe(true);
        expect(r.data.edges).toEqual([]);
    });
});

describe('节点合法性', () => {
    test('未知节点类型被拒', () => {
        const r = WorkflowSchema.safeParse({
            name: 'x',
            nodes: [{ id: 'a', type: 'unknown' }],
        });
        expect(r.success).toBe(false);
    });

    test('agent 节点缺 agentId', () => {
        const r = WorkflowSchema.safeParse({
            name: 'x',
            nodes: [{ id: 'a', type: 'agent' }],
        });
        expect(r.success).toBe(false);
    });

    test('tool 节点缺 toolName', () => {
        const r = WorkflowSchema.safeParse({
            name: 'x',
            nodes: [{ id: 'a', type: 'tool', params: {} }],
        });
        expect(r.success).toBe(false);
    });
});

describe('图约束', () => {
    test('节点 id 重复', () => {
        const r = WorkflowSchema.safeParse(
            wf({
                nodes: [
                    { id: 'dup', type: 'agent', agentId: 'p' },
                    { id: 'dup', type: 'agent', agentId: 'q' },
                ],
                edges: [],
            }),
        );
        expect(r.success).toBe(false);
        expect(JSON.stringify(r.error.issues)).toContain('节点 id 重复');
    });

    test('边引用不存在的节点', () => {
        const r = WorkflowSchema.safeParse(wf({ edges: [{ from: 'a', to: 'ghost' }] }));
        expect(r.success).toBe(false);
    });

    test('检测到环：a→b→a', () => {
        const r = WorkflowSchema.safeParse(
            wf({
                edges: [
                    { from: 'a', to: 'b' },
                    { from: 'b', to: 'a' },
                ],
            }),
        );
        expect(r.success).toBe(false);
        expect(JSON.stringify(r.error.issues)).toContain('检测到环');
    });

    test('检测到三节点环', () => {
        const r = WorkflowSchema.safeParse({
            name: 'x',
            nodes: [
                { id: 'a', type: 'agent', agentId: 'p' },
                { id: 'b', type: 'agent', agentId: 'p' },
                { id: 'c', type: 'agent', agentId: 'p' },
            ],
            edges: [
                { from: 'a', to: 'b' },
                { from: 'b', to: 'c' },
                { from: 'c', to: 'a' },
            ],
        });
        expect(r.success).toBe(false);
    });
});
