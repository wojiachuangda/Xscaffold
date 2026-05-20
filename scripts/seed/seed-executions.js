// [tooling] ID: DEV-SEED-EXEC | Date: 2026-05-21 | Description: 开发用 executions 表种子脚本——清表后灌入跨状态/可分页的执行记录供 WEBUI 验收
'use strict';

const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'data.db');
const NOW = Date.now();
const SPAN_MS = 3 * 24 * 60 * 60 * 1000;
const TERMINAL = new Set(['SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT']);

// SUCCESS 40 / FAILED 8 / STUCK 5 / TIMEOUT 4 / RUNNING 4 / PENDING 4 = 65
// 65 > 50（executions 视图分页）且 < 80（inbox poll limit）——两个 view 都能验全。
const STATUS_PLAN = [
    ['SUCCESS', 40],
    ['FAILED', 8],
    ['STUCK', 5],
    ['TIMEOUT', 4],
    ['RUNNING', 4],
    ['PENDING', 4],
];
const TOTAL = STATUS_PLAN.reduce((sum, [, count]) => sum + count, 0);
const STEP_MS = Math.floor(SPAN_MS / TOTAL);

const WORKFLOW_IDS = ['project-assistant-digest', 'nightly-report', 'webhook-ingest'];
const PROJECT_IDS = ['xscaffold', 'inventory-sync', 'billing-rewrite'];
const TRIGGERS = ['cron', 'webhook', 'manual'];

const ERRORS = {
    FAILED: [
        { code: 'TOOL_CALL_FAILED', message: 'Tool projectGetStatus returned a non-2xx response' },
        { code: 'CONTRACT_VIOLATION', message: 'LLM output failed schema validation after 2 self-heal retries' },
        { code: 'UPSTREAM_502', message: 'External agent endpoint returned 502 Bad Gateway' },
        { code: 'NODE_THROW', message: 'Unhandled error in node "summarize": cannot read properties of undefined' },
    ],
    STUCK: [
        { code: 'STUCK', message: 'Execution halted: self-heal retry budget exhausted' },
        { code: 'STUCK', message: 'Execution stuck waiting on external agent acknowledgement' },
    ],
    TIMEOUT: [
        { code: 'TIMEOUT', message: 'Workflow exceeded the 30s execution deadline' },
        { code: 'TIMEOUT', message: 'Tool call timed out before returning observations' },
    ],
};

function genId() {
    return `exec_${crypto.randomBytes(8).toString('hex')}`;
}

function durationFor(status) {
    if (status === 'SUCCESS') {
        return 200 + Math.floor(Math.random() * 7800);
    }
    if (status === 'FAILED') {
        return 100 + Math.floor(Math.random() * 4900);
    }
    if (status === 'STUCK') {
        return 30000 + Math.floor(Math.random() * 60000);
    }
    return 30000 + Math.floor(Math.random() * 2000);
}

function buildRow(status, index) {
    const startedMs = NOW - index * STEP_MS - Math.floor(Math.random() * (STEP_MS / 2));
    const row = {
        id: genId(),
        workflowId: WORKFLOW_IDS[index % WORKFLOW_IDS.length],
        status,
        input: JSON.stringify({
            projectId: PROJECT_IDS[index % PROJECT_IDS.length],
            trigger: TRIGGERS[index % TRIGGERS.length],
        }),
        result: null,
        error: null,
        startedAt: new Date(startedMs).toISOString(),
        finishedAt: null,
        durationMs: null,
    };
    if (!TERMINAL.has(status)) {
        return row;
    }
    const durationMs = durationFor(status);
    row.durationMs = durationMs;
    row.finishedAt = new Date(startedMs + durationMs).toISOString();
    if (status === 'SUCCESS') {
        row.result = JSON.stringify({
            summary: 'Project digest generated',
            tasksReviewed: 3 + (index % 6),
            remindersDue: index % 3,
        });
    } else {
        const pool = ERRORS[status];
        row.error = JSON.stringify(pool[index % pool.length]);
    }
    return row;
}

function buildRows() {
    const rows = [];
    let index = 0;
    for (const [status, count] of STATUS_PLAN) {
        for (let k = 0; k < count; k += 1) {
            rows.push(buildRow(status, index));
            index += 1;
        }
    }
    return rows;
}

function main() {
    const db = new Database(DB_PATH);
    try {
        const rows = buildRows();
        const insert = db.prepare(
            `INSERT INTO executions
                (id, workflow_id, status, input, result, error, started_at, finished_at, duration_ms)
             VALUES
                (@id, @workflowId, @status, @input, @result, @error, @startedAt, @finishedAt, @durationMs)`,
        );
        const reseed = db.transaction((items) => {
            db.prepare('DELETE FROM executions').run();
            for (const row of items) {
                insert.run(row);
            }
        });
        reseed(rows);
        const total = db.prepare('SELECT COUNT(*) AS c FROM executions').get().c;
        const byStatus = db
            .prepare('SELECT status, COUNT(*) AS c FROM executions GROUP BY status ORDER BY status')
            .all();
        process.stdout.write(`seeded ${total} executions into ${DB_PATH}\n`);
        for (const row of byStatus) {
            process.stdout.write(`  ${row.status}: ${row.c}\n`);
        }
    } finally {
        db.close();
    }
}

main();
