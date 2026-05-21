// [refactor] ID: V2.3-RT-LOGS | Date: 2026-05-21 | Description: Runtime 视图后端——/runtime/metrics 指标摘要 + /runtime/logs 快照 + /runtime/logs/stream SSE 实时日志
'use strict';

const express = require('express');

const { success } = require('../response/envelope');
const { SSE_HEADERS } = require('../sse');
const logRingBuffer = require('../../observability/logRingBuffer');

const HEARTBEAT_MS = 15000;

/**
 * @param {{ metricsExporter }} deps
 */
function buildRuntimeRouter(deps) {
    const router = express.Router();

    router.get('/metrics', (req, res) => {
        res.json(success({ ...deps.metricsExporter.summary(), uptime: process.uptime() }));
    });

    router.get('/logs', (req, res) => {
        res.json(success(logRingBuffer.snapshot()));
    });

    router.get('/logs/stream', (req, res) => streamLogs(res));

    return router;
}

/**
 * SSE 实时日志：先回放当前快照，再订阅后续新行。日志已由 Pino redact 脱敏（AA-SEAC §4.5）。
 */
function streamLogs(res) {
    res.writeHead(200, SSE_HEADERS);
    for (const entry of logRingBuffer.snapshot()) {
        writeLogFrame(res, entry);
    }
    const unsubscribe = logRingBuffer.subscribe((entry) => writeLogFrame(res, entry));
    const heartbeat = setInterval(() => writeRaw(res, ': ping\n\n'), HEARTBEAT_MS);
    heartbeat.unref?.();
    res.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
}

function writeLogFrame(res, entry) {
    // data 内带 type 字段——前端 sseClient 按 event.type 派发到 onLog
    writeRaw(res, `event: log\ndata: ${JSON.stringify({ type: 'log', ...entry })}\n\n`);
}

function writeRaw(res, chunk) {
    try {
        res.write(chunk);
    } catch (_err) {
        /* 客户端已断开，忽略 */
    }
}

module.exports = { buildRuntimeRouter };
