// [test] ID: V1.1-2 | Date: 2026-05-19 | Description: Token 配额工作流级集成测试
'use strict';

const Database = require('better-sqlite3');

const { migrate } = require('../../src/infrastructure/database/migrate');
const { createNodeRunner } = require('../../src/workflowEngine/nodeRunner');
const { createWorkflowExecutor } = require('../../src/workflowEngine/workflowExecutor');

function buildEnv(llmTokensPerCall = 50) {
    const db = new Database(':memory:');
    migrate({ db });
    const llmClient = {
        chat: jest.fn().mockResolvedValue({
            content: 'reply',
            reasoning_content: null,
            tokenUsage: {
                prompt: Math.floor(llmTokensPerCall / 2),
                completion: Math.ceil(llmTokensPerCall / 2),
                total: llmTokensPerCall,
                cached_prompt_tokens: 0,
            },
            latencyMs: 1,
        }),
    };
    const agentService = {
        getAgentById: jest.fn().mockReturnValue({ id: 'a', model: 'gpt-4', tools: [] }),
    };
    const nodeRunner = createNodeRunner({ agentService, llmClient, toolRegistry: null });
    const executor = createWorkflowExecutor(nodeRunner);
    return { db, executor, llmClient };
}

const twoAgentFlow = {
    name: 'two-agents',
    nodes: [
        { id: 'n1', type: 'agent', agentId: 'a', input: '问' },
        { id: 'n2', type: 'agent', agentId: 'a', input: '继续' },
    ],
    edges: [{ from: 'n1', to: 'n2' }],
};

describe('Token 配额集成', () => {
    test('quota 充足 → 全部 SUCCESS', async () => {
        const { db, executor } = buildEnv(50);
        const r = await executor.execute(twoAgentFlow, { tokenQuota: 1000 });
        expect(r.status).toBe('SUCCESS');
        db.close();
    });

    test('quota 50 + 每次 50 token → 第二个节点 STUCK', async () => {
        const { db, executor, llmClient } = buildEnv(50);
        const r = await executor.execute(twoAgentFlow, { tokenQuota: 50 });
        expect(r.status).toBe('STUCK');
        expect(r.nodeStates.n1).toBe('SUCCESS');
        expect(r.nodeStates.n2).toBe('STUCK');
        expect(r.error.code).toBe('TOKEN_QUOTA_EXCEEDED');
        expect(llmClient.chat).toHaveBeenCalledTimes(1); // 第二次被 assertBeforeCall 拦截
        db.close();
    });

    test('workflow def 的 tokenQuota 字段生效', async () => {
        // hard-limit 语义：quota=30、每次 40 → 1 次后 used=40>=30 → 第二次 assertBeforeCall 拦截
        const { db, executor } = buildEnv(40);
        const flow = { ...twoAgentFlow, tokenQuota: 30 };
        const r = await executor.execute(flow);
        expect(r.status).toBe('STUCK');
        db.close();
    });

    test('initialContext.tokenQuota 优先级高于 def', async () => {
        const { db, executor } = buildEnv(40);
        const flow = { ...twoAgentFlow, tokenQuota: 1000 };
        const r = await executor.execute(flow, { tokenQuota: 30 });
        expect(r.status).toBe('STUCK');
        db.close();
    });
});
