#!/usr/bin/env node
// [scaffold] ID: T6.2 | Date: 2026-05-18 | Description: autocannon 性能压测脚本（healthz / agents / workflows execute）
'use strict';

const autocannon = require('autocannon');

const { bootServer } = require('./perf-server');
const { signTestToken } = require('../../src/apiGateway/middlewares/authMiddleware');

const PORT = Number(process.env.PERF_PORT) || 4100;
const DURATION_S = Number(process.env.PERF_DURATION) || 5;
const CONNECTIONS = Number(process.env.PERF_CONNECTIONS) || 50;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const JWT_SECRET = 'perf-secret';

// runScenario 包装 callback-style autocannon 为 Promise；async 修饰仅为接口一致
// eslint-disable-next-line require-await
async function runScenario(title, opts) {
    return new Promise((resolve, reject) => {
        /* eslint-disable no-console */
        console.log(`\n=== ${title} ===`);
        autocannon(
            { url: `${BASE_URL}${opts.path}`, duration: DURATION_S, connections: CONNECTIONS, ...opts },
            (err, result) => {
                if (err) {
                    return reject(err);
                }
                console.log(`  reqs:    ${result.requests.average.toFixed(0)} req/s (P95: ${result.latency.p97_5}ms)`);
                const lat = result.latency;
                console.log(`  latency: avg=${lat.average}ms p50=${lat.p50}ms p99=${lat.p99}ms`);
                console.log(`  errors:  ${result.errors} timeouts: ${result.timeouts} 2xx: ${result['2xx']}`);
                /* eslint-enable no-console */
                return resolve({ title, result });
            },
        );
    });
}

async function main() {
    const { app } = bootServer();
    const server = app.listen(PORT);
    const token = signTestToken({ sub: 'perf' }, JWT_SECRET);
    const authHeader = { Authorization: `Bearer ${token}` };

    const scenarios = [
        { title: 'GET /healthz (无鉴权)', path: '/healthz' },
        { title: 'GET /readyz (依赖检查)', path: '/readyz' },
        { title: 'GET /metrics (Prometheus)', path: '/metrics' },
        { title: 'GET /agents (空列表)', path: '/agents', headers: authHeader },
        {
            title: 'POST /workflows/perf-add/execute',
            path: '/workflows/perf-add/execute',
            method: 'POST',
            headers: { ...authHeader, 'content-type': 'application/json' },
            body: JSON.stringify({}),
        },
    ];

    const results = [];
    for (const s of scenarios) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await runScenario(s.title, s));
    }

    /* eslint-disable no-console */
    console.log('\n=== SUMMARY ===');
    results.forEach((r) => {
        const avg = r.result.requests.average.toFixed(0);
        const p95 = r.result.latency.p97_5;
        console.log(`${r.title.padEnd(45)} | avg ${avg} req/s | p95 ${p95}ms`);
    });
    /* eslint-enable no-console */
    server.close(() => process.exit(0));
}

main().catch((err) => {
    /* eslint-disable no-console */
    console.error(err);
    /* eslint-enable no-console */
    process.exit(1);
});
