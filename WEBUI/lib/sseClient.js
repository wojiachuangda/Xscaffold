// [ui] ID: WEBUI-V2.2-SSE | Date: 2026-05-21 | Description: SSE 客户端——fetch + ReadableStream + UTF-8 + 帧切分；沿用 lib/api.js 的 apiBase + token
'use strict';

import { buildRequestOptions } from './api.js';
import { state } from './state.js';

const SSE_CONTENT_TYPE = 'text/event-stream';

/**
 * POST 一个 SSE 流式端点，把每个事件按 type 派发到对应 handler。
 * 复用 buildRequestOptions 的 apiBase + JWT + JSON body 序列化路径。
 *
 * @param {string} path           后端路径（不含 apiBase 前缀）
 * @param {object} [options]
 * @param {object} [options.body] POST body（自动 JSON.stringify）
 * @param {object} [options.handlers] { onStart, onTurn, onDone, onError }；按 event.type 派发
 * @returns {Promise<void>}       流自然结束 resolve；网络或契约错误 reject
 */
export async function streamSse(path, options = {}) {
    const reqOptions = buildRequestOptions({ method: 'POST', body: options.body }, true);
    reqOptions.headers.accept = SSE_CONTENT_TYPE;
    const response = await fetch(`${state.apiBase}${path}`, reqOptions);
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes(SSE_CONTENT_TYPE)) {
        throw new Error(`Expected ${SSE_CONTENT_TYPE}, got: ${contentType}`);
    }
    await consume(response.body, options.handlers || {});
}

async function consume(stream, handlers) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            buffer += decoder.decode(chunk.value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop();
            for (const block of blocks) {
                dispatchBlock(block, handlers);
            }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
            dispatchBlock(buffer, handlers);
        }
    } finally {
        try {
            reader.releaseLock();
        } catch (_err) {
            /* 已释放 */
        }
    }
}

function dispatchBlock(block, handlers) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith(':')) {
        return; // 心跳注释帧或空块
    }
    const dataLine = trimmed.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) {
        return;
    }
    const json = dataLine.slice(dataLine.indexOf(':') + 1).trim();
    let event;
    try {
        event = JSON.parse(json);
    } catch (_err) {
        return; // 非法 JSON 静默丢；项目禁 console.log
    }
    const key = handlerKey(event.type);
    if (key && typeof handlers[key] === 'function') {
        handlers[key](event);
    }
}

function handlerKey(type) {
    if (typeof type !== 'string' || type.length === 0) {
        return null;
    }
    return `on${type[0].toUpperCase()}${type.slice(1)}`;
}
