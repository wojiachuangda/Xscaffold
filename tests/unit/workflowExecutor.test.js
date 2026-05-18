// [test] ID: T2.7 | Date: 2026-05-18 | Description: workflowExecutor 单元测试（拓扑/条件分支/失败传播）
'use strict';

const { createWorkflowExecutor } = require('../../src/workflowEngine/workflowExecutor');

function fakeRunner(handlers) {
    return {
        runNode: async (node, ctx) => {
            const h = handlers[node.id];
            if (!h) {
                throw new Error(`no handler for ${node.id}`);
            }
            return h(node, ctx);
        },
    };
}

describe('线性顺序执行', () => {
    test('两个节点顺序执行，下游能读到上游输出', async () => {
        const runner = fakeRunner({
            a: async () => ({ value: 10 }),
            b: async (_, ctx) => ({ doubled: ctx.a.value * 2 }),
        });
        const exec = createWorkflowExecutor(runner);
        const r = await exec.execute({
            name: 'demo',
            nodes: [
                { id: 'a', type: 'tool', toolName: 'x', params: {} },
                { id: 'b', type: 'tool', toolName: 'y', params: {} },
            ],
            edges: [{ from: 'a', to: 'b' }],
        });
        expect(r.status).toBe('SUCCESS');
        expect(r.context.a.value).toBe(10);
        expect(r.context.b.doubled).toBe(20);
        expect(r.nodeStates).toEqual({ a: 'SUCCESS', b: 'SUCCESS' });
    });
});

describe('条件分支', () => {
    function buildDef() {
        return {
            name: 'route',
            nodes: [
                { id: 'cls', type: 'condition', expression: 'true' },
                { id: 't', type: 'tool', toolName: 't', params: {} },
                { id: 'f', type: 'tool', toolName: 'f', params: {} },
            ],
            edges: [
                { from: 'cls', to: 't', condition: 'true' },
                { from: 'cls', to: 'f', condition: 'false' },
            ],
        };
    }

    test('true 分支走 t，f 节点被裁剪', async () => {
        const runner = fakeRunner({
            cls: async () => ({ branch: 'true', value: true }),
            t: async () => ({ ran: 't' }),
            f: async () => ({ ran: 'f' }),
        });
        const r = await createWorkflowExecutor(runner).execute(buildDef());
        expect(r.context.t).toEqual({ ran: 't' });
        expect(r.context.f).toBeUndefined();
        expect(r.nodeStates.t).toBe('SUCCESS');
        expect(r.nodeStates.f).toBe('PENDING');
    });

    test('false 分支走 f', async () => {
        const runner = fakeRunner({
            cls: async () => ({ branch: 'false', value: false }),
            t: async () => ({ ran: 't' }),
            f: async () => ({ ran: 'f' }),
        });
        const r = await createWorkflowExecutor(runner).execute(buildDef());
        expect(r.context.f).toEqual({ ran: 'f' });
        expect(r.context.t).toBeUndefined();
    });
});

describe('失败传播', () => {
    test('任一节点失败，工作流状态 FAILED 且错误信息透出', async () => {
        const runner = fakeRunner({
            a: async () => ({}),
            b: async () => {
                throw new Error('boom');
            },
        });
        const r = await createWorkflowExecutor(runner).execute({
            name: 'x',
            nodes: [
                { id: 'a', type: 'tool', toolName: 't', params: {} },
                { id: 'b', type: 'tool', toolName: 't', params: {} },
            ],
            edges: [{ from: 'a', to: 'b' }],
        });
        expect(r.status).toBe('FAILED');
        expect(r.error.message).toBe('boom');
        expect(r.nodeStates.b).toBe('FAILED');
    });
});

describe('非法定义', () => {
    test('Zod 校验失败 → 抛 ValidationError', async () => {
        const exec = createWorkflowExecutor(fakeRunner({}));
        await expect(exec.execute({ name: '', nodes: [] })).rejects.toThrow();
    });
});
