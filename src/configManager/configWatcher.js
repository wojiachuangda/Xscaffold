// [scaffold] ID: T3.3 | Date: 2026-05-18 | Description: 配置文件变更监听器（chokidar 封装 + 防抖 + 显式 close）
'use strict';

const chokidar = require('chokidar');

const { loadFromFile } = require('./configLoader');
const { logger } = require('../observability/logger');

const DEFAULT_DEBOUNCE_MS = 200;

/**
 * 创建一个文件 watcher
 * @param {object} options
 * @param {string|string[]} options.target  目标文件或 glob
 * @param {(payload: {path: string, config: object|null, error: Error|null}) => void} options.onChange
 * @param {number} [options.debounceMs]
 * @param {object} [options.chokidar]  注入 chokidar 实现（测试用）
 */
function createWatcher(options) {
    const { target, onChange } = options;
    if (!target || typeof onChange !== 'function') {
        throw new Error('createWatcher 需要 target 与 onChange');
    }
    const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const watcher = (options.chokidar || chokidar).watch(target, { ignoreInitial: true });

    const timers = new Map();
    const handler = (filePath) => scheduleReload({ filePath, onChange, debounceMs, timers });

    watcher.on('add', handler);
    watcher.on('change', handler);

    return {
        async close() {
            for (const t of timers.values()) {
                clearTimeout(t);
            }
            timers.clear();
            await watcher.close();
        },
    };
}

function scheduleReload({ filePath, onChange, debounceMs, timers }) {
    if (timers.has(filePath)) {
        clearTimeout(timers.get(filePath));
    }
    const timer = setTimeout(() => {
        timers.delete(filePath);
        reload(filePath, onChange);
    }, debounceMs);
    timer.unref?.();
    timers.set(filePath, timer);
}

async function reload(filePath, onChange) {
    try {
        const config = await loadFromFile(filePath);
        onChange({ path: filePath, config, error: null });
    } catch (err) {
        logger.warn({ path: filePath, err: err.message }, 'config reload failed');
        onChange({ path: filePath, config: null, error: err });
    }
}

module.exports = { createWatcher };
