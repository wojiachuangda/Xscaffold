// [scaffold] ID: V2.2-SSE | Date: 2026-05-21 | Description: SSE 流式通道——传输前强制脱敏不可信子载荷的唯一出口 + 心跳 + 连接生命周期（AA-SEAC §4.5 传输流式脱敏）
'use strict';

const { redactSensitive } = require('../observability/redact');
const { SseEventSchema } = require('./response/sseEventSchema');

const HEARTBEAT_MS = 15000;

const SSE_HEADERS = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
};

/**
 * 仅对承载外部数据的子载荷脱敏：toolCalls[].arguments（LLM 生成入参）、
 * observations[].data（工具返回）。envelope 元数据是本系统自有数据、非密钥
 * 载体，不脱敏——避免敏感词 `token` 误伤 `tokenUsage`/`cached_prompt_tokens`。
 */
function redactEvent(event) {
    if (event.type !== 'turn') {
        return event;
    }
    return {
        ...event,
        toolCalls: (event.toolCalls || []).map((tc) => ({
            ...tc,
            arguments: redactSensitive(tc.arguments),
        })),
        observations: (event.observations || []).map((obs) =>
            Object.prototype.hasOwnProperty.call(obs, 'data') ? { ...obs, data: redactSensitive(obs.data) } : obs,
        ),
    };
}

/**
 * 唯一格式化出口：脱敏 → 契约校验（fail-fast 我方 bug）→ SSE 帧。
 */
function formatFrame(event) {
    const validated = SseEventSchema.parse(redactEvent(event));
    return `event: ${validated.type}\ndata: ${JSON.stringify(validated)}\n\n`;
}

function safeWrite(res, chunk) {
    try {
        res.write(chunk);
    } catch (_err) {
        /* 客户端已断开，写失败忽略——agent loop 仍跑完以保 IOOR 留痕 */
    }
}

/**
 * 打开一条 SSE 流。返回 { send, close, isClosed }。
 * `send` 是唯一事件出口——每个事件必经 redactEvent 脱敏 + 契约校验后才落 socket。
 * @param {import('http').ServerResponse} res
 * @param {{ heartbeatMs?: number }} [options]
 */
function openSseStream(res, options = {}) {
    const heartbeatMs = options.heartbeatMs || HEARTBEAT_MS;
    res.writeHead(200, SSE_HEADERS);

    let closed = false;
    const timer = setInterval(() => {
        if (!closed) {
            safeWrite(res, ': ping\n\n');
        }
    }, heartbeatMs);
    timer.unref?.();

    function stop() {
        if (!closed) {
            closed = true;
            clearInterval(timer);
        }
    }
    res.on('close', stop);

    return {
        send(event) {
            if (closed) {
                return;
            }
            safeWrite(res, formatFrame(event));
        },
        close() {
            stop();
            try {
                res.end();
            } catch (_err) {
                /* socket 已断，忽略 */
            }
        },
        isClosed: () => closed,
    };
}

module.exports = { openSseStream, redactEvent, formatFrame, SSE_HEADERS };
