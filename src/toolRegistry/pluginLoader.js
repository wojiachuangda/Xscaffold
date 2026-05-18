// [scaffold] ID: T3.4 | Date: 2026-05-18 | Description: 插件目录扫描与加载（单插件失败隔离，AA-SEAC §6 工具插件机制）
'use strict';

const fs = require('fs');
const path = require('path');

const { logger } = require('../observability/logger');

/**
 * 扫描指定目录，加载每个子目录中的插件
 * 插件协议：
 *   plugins/foo/package.json: { "name": "foo", "main": "index.js" }
 *   plugins/foo/index.js: 必须导出 register(toolRegistry) 函数
 *
 * @param {object} options
 * @param {string} options.pluginsDir   插件根目录
 * @param {object} options.toolRegistry 目标注册中心
 * @returns {{loaded: string[], failed: Array<{name:string, error:string}>}}
 */
function loadPlugins({ pluginsDir, toolRegistry }) {
    if (!fs.existsSync(pluginsDir)) {
        return { loaded: [], failed: [] };
    }
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    const loaded = [];
    const failed = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const result = loadSinglePlugin(path.join(pluginsDir, entry.name), toolRegistry);
        if (result.ok) {
            loaded.push(result.name);
        } else {
            failed.push({ name: entry.name, error: result.error });
        }
    }
    return { loaded, failed };
}

function loadSinglePlugin(pluginDir, toolRegistry) {
    try {
        const meta = readPluginManifest(pluginDir);
        const entry = require(path.resolve(pluginDir, meta.main));
        if (typeof entry.register !== 'function') {
            throw new Error('插件入口缺少 register(toolRegistry) 导出');
        }
        entry.register(toolRegistry);
        logger.info({ plugin: meta.name }, 'plugin loaded');
        return { ok: true, name: meta.name };
    } catch (err) {
        logger.error({ pluginDir, err: err.message }, 'plugin load failed');
        return { ok: false, error: err.message };
    }
}

function readPluginManifest(pluginDir) {
    const manifestPath = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`缺少 package.json: ${pluginDir}`);
    }
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const meta = JSON.parse(raw);
    if (!meta.name) {
        throw new Error('package.json 缺少 name 字段');
    }
    if (!meta.main) {
        throw new Error('package.json 缺少 main 字段');
    }
    return meta;
}

module.exports = { loadPlugins };
