// [test] ID: T3.4 | Date: 2026-05-18 | Description: pluginLoader 单元测试（成功/失败隔离/缺 manifest/不存在目录）
'use strict';

const path = require('path');

const { loadPlugins } = require('../../src/toolRegistry/pluginLoader');
const { createRegistry } = require('../../src/toolRegistry/toolRegistry');

const PLUGINS_DIR = path.resolve(__dirname, '../fixtures/plugins');

describe('loadPlugins', () => {
    test('扫描并加载合法插件，失败的隔离记录', () => {
        const registry = createRegistry();
        const r = loadPlugins({ pluginsDir: PLUGINS_DIR, toolRegistry: registry });
        expect(r.loaded).toContain('good-plugin');
        expect(r.failed.length).toBeGreaterThanOrEqual(2);
        const failedNames = r.failed.map((f) => f.name);
        expect(failedNames).toContain('broken-plugin');
        expect(failedNames).toContain('no-manifest');
        // 注册中心可以查询到 good-plugin 暴露的工具
        expect(registry.listTools().map((t) => t.name)).toContain('goodPluginTool');
    });

    test('不存在的目录返回空，不抛错', () => {
        const r = loadPlugins({
            pluginsDir: path.resolve(__dirname, '../fixtures/__nope__'),
            toolRegistry: createRegistry(),
        });
        expect(r).toEqual({ loaded: [], failed: [] });
    });

    test('真实示例插件 plugins/exampleTool 可被加载', () => {
        const registry = createRegistry();
        const real = path.resolve(__dirname, '../../plugins');
        const r = loadPlugins({ pluginsDir: real, toolRegistry: registry });
        expect(r.loaded).toContain('reverse-string-plugin');
        const tools = registry.listTools().map((t) => t.name);
        expect(tools).toContain('reverseString');
    });
});
