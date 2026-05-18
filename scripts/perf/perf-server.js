#!/usr/bin/env node
// [scaffold] ID: T6.2 | Date: 2026-05-18 | Description: 压测专用启动脚本（mock LLM，禁用限流，开放端口）
'use strict';

const Database = require('better-sqlite3');

const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');
const { createWorkflowRegistry } = require('../../src/workflowEngine/workflowRegistry');

const JWT_SECRET = 'perf-secret';
const PORT = Number(process.env.PERF_PORT) || 4100;

function mockLLM() {
    return {
        chat: async () => ({
            content: 'mock',
            reasoning_content: null,
            tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
            latencyMs: 1,
        }),
    };
}

function bootServer() {
    const db = new Database(':memory:');
    migrate({ db });
    const registry = createWorkflowRegistry();
    registry.register('perf-add', {
        name: 'perf-add',
        version: '1.0',
        nodes: [{ id: 'sum', type: 'tool', toolName: 'addNumbers', params: { a: 1, b: 2 } }],
        edges: [],
    });
    const app = createApp({
        db,
        jwtSecret: JWT_SECRET,
        rateLimitBypass: true,
        workflowRegistry: registry,
        llmClient: mockLLM(),
    });
    return { app, db };
}

function main() {
    const { app } = bootServer();
    const token = signTestToken({ sub: 'perf' }, JWT_SECRET);
    /* eslint-disable no-console */
    console.log(`PERF_TOKEN=${token}`);
    console.log(`Listening on http://127.0.0.1:${PORT}`);
    /* eslint-enable no-console */
    app.listen(PORT);
}

if (require.main === module) {
    main();
}

module.exports = { bootServer };
