// [scaffold] ID: V2.3-RT-LOGS | Date: 2026-05-21 | Description: 内存日志环形缓冲——留最近 N 行（已脱敏 JSON 解析后的结构）+ 订阅通知，供 Live Logs /logs 与 SSE 流读取
'use strict';

const MAX_LINES = 500;

const buffer = [];
const subscribers = new Set();

/**
 * 追加一条日志（已由 Pino redact 脱敏）。超过上限丢最旧的；通知所有订阅者。
 * @param {{ ts: string, level: string, msg: string }} entry
 */
function push(entry) {
    buffer.push(entry);
    if (buffer.length > MAX_LINES) {
        buffer.shift();
    }
    for (const fn of subscribers) {
        try {
            fn(entry);
        } catch (_err) {
            /* 单个订阅者出错不影响其它订阅者与日志写入 */
        }
    }
}

/**
 * 当前缓冲快照（最近 ≤MAX_LINES 行，旧→新）。
 * @returns {Array<{ ts: string, level: string, msg: string }>}
 */
function snapshot() {
    return buffer.slice();
}

/**
 * 订阅新日志。返回取消订阅函数。
 * @param {(entry: { ts: string, level: string, msg: string }) => void} fn
 * @returns {() => void}
 */
function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

module.exports = { push, snapshot, subscribe, MAX_LINES };
