// [test] ID: PAM-8 | Date: 2026-05-19 | Description: project-assistant-digest workflow 集成测试（mock fetch 跑通 7 节点闭环 + 校验副作用）
'use strict';

const path = require('path');

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { loadFromFile } = require('../../src/configManager/configLoader');
const { createRegistry } = require('../../src/toolRegistry/toolRegistry');
const { registerBuiltins } = require('../../src/toolRegistry/builtinTools');
const { createNodeRunner } = require('../../src/workflowEngine/nodeRunner');
const { createWorkflowExecutor } = require('../../src/workflowEngine/workflowExecutor');

const projectUpdateStatus = require('../../src/toolRegistry/builtinTools/projectAssistant/projectUpdateStatus');
const taskUpsert = require('../../src/toolRegistry/builtinTools/projectAssistant/taskUpsert');
const reminderCreate = require('../../src/toolRegistry/builtinTools/projectAssistant/reminderCreate');

const WORKFLOW_PATH = path.resolve(__dirname, '../../workflows/project-assistant-digest.yaml');

function buildExecutor() {
    const toolRegistry = createRegistry();
    registerBuiltins(toolRegistry);
    const nodeRunner = createNodeRunner({ toolRegistry });
    return createWorkflowExecutor(nodeRunner);
}

async function seed(driver) {
    await projectUpdateStatus.handler(
        { projectId: 'xscaffold', phase: 'A.1', status: 'active', health: 'green', completion: 70, summary: '初始' },
        { db: driver },
    );
    await taskUpsert.handler(
        { projectId: 'xscaffold', taskId: 't1', title: '收口 MVP', status: 'open', priority: 'high' },
        { db: driver },
    );
    const dueSoon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await reminderCreate.handler({ projectId: 'xscaffold', title: '跑 smoke', dueAt: dueSoon }, { db: driver });
}

describe('project-assistant-digest workflow (PAM-8)', () => {
    let driver;
    let executor;
    const originalFetch = global.fetch;

    beforeEach(async () => {
        driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
        await seed(driver);
        executor = buildExecutor();
    });
    afterEach(() => {
        global.fetch = originalFetch;
        return driver.close();
    });

    test('YAML 通过 configLoader 解析为合法 workflowDef', async () => {
        const def = await loadFromFile(WORKFLOW_PATH);
        expect(def.name).toBe('project-assistant-digest');
        expect(def.nodes).toHaveLength(7);
        expect(def.edges).toHaveLength(6);
        expect(def.nodes.map((n) => n.toolName)).toEqual([
            'projectGetStatus',
            'taskList',
            'reminderListDue',
            'externalAgentSend',
            'eventRecord',
            'projectUpdateStatus',
            'projectGenerateDigest',
        ]);
    });

    test('全链路成功执行：7 节点串联 + 副作用落库 + 最终 digest 返回 markdown', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ reply: 'A.1 已完成，建议进入闭环', summary: 'A.1 收口；建议进入 demo' }),
        });
        const def = await loadFromFile(WORKFLOW_PATH);

        const result = await executor.execute(def, {
            db: driver,
            projectId: 'xscaffold',
            reminderBefore: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            profile: 'claudeHttp',
            sessionId: 'pam8-test',
            instruction: '检查项目状态，给出阻塞点和下一步',
        });

        expect(result.status).toBe('SUCCESS');
        // digest 节点是末尾，输出含 markdown 字符串
        expect(typeof result.context.digest.data.digest).toBe('string');
        expect(result.context.digest.data.digest).toContain('# 项目摘要');
        expect(result.context.digest.data.digest).toContain('A.1 收口');

        // 副作用 1：event 表多了 digest_generated 一条
        const { rows: events } = await driver.query(
            `SELECT title, type, severity FROM pa_events WHERE project_id = 'xscaffold'`,
            [],
        );
        expect(events).toContainEqual({ title: '项目摘要已生成', type: 'digest_generated', severity: 'normal' });

        // 副作用 2：project.summary 已被 externalAgent 的 summary 覆盖
        const { rows: projects } = await driver.query(
            `SELECT summary FROM projects WHERE project_id = 'xscaffold'`,
            [],
        );
        expect(projects[0].summary).toBe('A.1 收口；建议进入 demo');

        // 副作用 3：external_agent_calls 审计落 completed
        const { rows: calls } = await driver.query(`SELECT status, reply FROM external_agent_calls`, []);
        expect(calls).toHaveLength(1);
        expect(calls[0].status).toBe('completed');
        expect(calls[0].reply).toBe('A.1 已完成，建议进入闭环');
    });

    test('外部 Agent 失败 → workflow 进入 FAILED，前置节点已成功落库', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
        const def = await loadFromFile(WORKFLOW_PATH);

        const result = await executor.execute(def, {
            db: driver,
            projectId: 'xscaffold',
            reminderBefore: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            profile: 'claudeHttp',
            sessionId: 'pam8-test',
            instruction: 'i',
        });

        expect(result.status).toBe('FAILED');
        // external 失败后 recordEvent / updateStatus / digest 不应执行
        const { rows: events } = await driver.query(
            `SELECT COUNT(*) AS c FROM pa_events WHERE type = 'digest_generated'`,
            [],
        );
        expect(events[0].c).toBe(0);

        // 但 external_agent_calls 必须留痕 failed
        const { rows: calls } = await driver.query(`SELECT status FROM external_agent_calls`, []);
        expect(calls[0].status).toBe('failed');
    });
});
