// [smoke] ID: PAM-9 | Date: 2026-05-19 | Description: 项目助理闭环 smoke——严格验证 digest workflow 可见且可执行；任一步失败 exit 1
'use strict';

const http = require('http');

// 业务模块加载前先固定环境：内存库 + 关闭鉴权（仅 smoke）
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.AUTH_DISABLED = 'true';
process.env.DATABASE_URL = 'sqlite::memory:';

const request = require('supertest');

const { getDb, closeDb } = require('../../src/infrastructure/database/connection');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { createApp } = require('../../src/apiGateway/server');

const projectUpdateStatus = require('../../src/toolRegistry/builtinTools/projectAssistant/projectUpdateStatus');
const taskUpsert = require('../../src/toolRegistry/builtinTools/projectAssistant/taskUpsert');
const reminderCreate = require('../../src/toolRegistry/builtinTools/projectAssistant/reminderCreate');

const WORKFLOW_ID = 'project-assistant-digest';
const PROJECT_ID = 'xscaffold';
const TERMINAL = new Set(['SUCCESS', 'FAILED', 'STUCK']);

function assert(label, cond) {
    if (!cond) {
        throw new Error(`smoke 步骤失败: ${label}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  PASS  ${label}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// 启动一个临时 stub，扮演外部常驻 HTTP Agent
function startStubAgent() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            req.on('data', () => {});
            req.on('end', () => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ reply: 'smoke: A.1 已完成，CI 全绿', summary: 'smoke summary: A.1 收口' }));
            });
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

async function seed() {
    await projectUpdateStatus.handler(
        { projectId: PROJECT_ID, phase: 'A.1', status: 'active', health: 'green', completion: 70, summary: '初始' },
        {},
    );
    await taskUpsert.handler({ projectId: PROJECT_ID, taskId: 'mvp', title: '收口 MVP', priority: 'high' }, {});
    const dueSoon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await reminderCreate.handler({ projectId: PROJECT_ID, title: '跑 smoke', dueAt: dueSoon }, {});
}

async function pollExecution(app, executionId) {
    for (let i = 0; i < 50; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(app).get(`/workflows/executions/${executionId}`);
        if (res.status === 200 && TERMINAL.has(res.body.data.status)) {
            return res.body.data;
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(100);
    }
    throw new Error('轮询工作流执行状态超时');
}

async function runWorkflow(app) {
    const execRes = await request(app)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({
            input: {
                projectId: PROJECT_ID,
                reminderBefore: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                profile: 'claudeHttp',
                sessionId: 'smoke-session',
                instruction: '检查项目状态，给出阻塞点和下一步',
            },
        });
    assert('POST /workflows/.../execute 返回 202', execRes.status === 202);
    return pollExecution(app, execRes.body.data.id);
}

async function verifySideEffects(driver) {
    const events = await driver.query(`SELECT type FROM pa_events WHERE project_id = ? AND type = 'digest_generated'`, [
        PROJECT_ID,
    ]);
    assert('event digest_generated 已记录', events.rows.length === 1);

    const calls = await driver.query('SELECT status FROM external_agent_calls', []);
    assert('externalAgentSend 留痕 completed', calls.rows.length === 1 && calls.rows[0].status === 'completed');

    const projects = await driver.query('SELECT summary FROM projects WHERE project_id = ?', [PROJECT_ID]);
    assert('project.summary 已被外部 Agent 回包覆盖', projects.rows[0].summary === 'smoke summary: A.1 收口');
}

async function main() {
    const stub = await startStubAgent();
    process.env.EXTERNAL_AGENT_PROFILE_OVERRIDE = JSON.stringify({
        claudeHttp: {
            baseUrl: `http://127.0.0.1:${stub.address().port}`,
            endpoint: '/messages',
            method: 'POST',
            timeoutMs: 10000,
        },
    });
    try {
        const driver = getDb();
        await migrate();
        await seed();
        const app = createApp();

        const listRes = await request(app).get('/workflows');
        assert('GET /workflows 返回 200', listRes.status === 200);
        const ids = listRes.body.data.map((w) => w.id);
        assert(`${WORKFLOW_ID} 在工作流列表中可见`, ids.includes(WORKFLOW_ID));

        const execution = await runWorkflow(app);
        assert('工作流执行状态为 SUCCESS', execution.status === 'SUCCESS');
        assert('digest 节点产出 markdown 字符串', typeof execution.result?.digest?.data?.digest === 'string');

        await verifySideEffects(driver);
        // eslint-disable-next-line no-console
        console.log('\nSMOKE PASS');
    } finally {
        stub.close();
        await closeDb();
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`\nSMOKE FAIL: ${err.message}`);
    process.exit(1);
});
