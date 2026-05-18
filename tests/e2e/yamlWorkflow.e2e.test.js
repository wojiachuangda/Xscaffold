// [test] ID: T3.5 | Date: 2026-05-18 | Description: YAML 工作流端到端：配置加载 → 插件注册 → executor 执行
'use strict';

const path = require('path');

const { loadFromFile, toWorkflowDef } = require('../../src/configManager/configLoader');
const { createRegistry } = require('../../src/toolRegistry/toolRegistry');
const { registerBuiltins } = require('../../src/toolRegistry/builtinTools');
const { loadPlugins } = require('../../src/toolRegistry/pluginLoader');
const { createNodeRunner } = require('../../src/workflowEngine/nodeRunner');
const { createWorkflowExecutor } = require('../../src/workflowEngine/workflowExecutor');

const FIXTURES = path.resolve(__dirname, '../fixtures/workflows');
const PLUGINS = path.resolve(__dirname, '../../plugins');

function bootEnv() {
    const toolRegistry = createRegistry();
    registerBuiltins(toolRegistry);
    loadPlugins({ pluginsDir: PLUGINS, toolRegistry });
    const llmClient = {
        chat: jest.fn().mockResolvedValue({
            content: 'mock',
            reasoning_content: null,
            tokenUsage: { prompt: 1, completion: 1, total: 2, cached_prompt_tokens: 0 },
            latencyMs: 1,
        }),
    };
    const agentService = { getAgentById: jest.fn().mockReturnValue({ id: 'a', model: 'mock' }) };
    const nodeRunner = createNodeRunner({ toolRegistry, agentService, llmClient });
    const executor = createWorkflowExecutor(nodeRunner);
    return { executor, llmClient, agentService };
}

describe('YAML → executor', () => {
    test('valid.json 执行：上游结果可被下游引用', async () => {
        const cfg = await loadFromFile(path.join(FIXTURES, 'valid.json'));
        const def = toWorkflowDef(cfg);
        const { executor } = bootEnv();
        const r = await executor.execute(def);
        expect(r.status).toBe('SUCCESS');
        expect(r.context.sum.result).toBe(30);
        expect(r.context.double.result).toBe(60);
    });

    test('YAML 含插件工具：reverseString 通过插件加载后可调用', async () => {
        const cfg = await loadFromFile(path.join(FIXTURES, 'plugin_demo.yaml'));
        const def = toWorkflowDef(cfg);
        const { executor } = bootEnv();
        const r = await executor.execute(def, { phrase: 'hello' });
        expect(r.status).toBe('SUCCESS');
        expect(r.context.rev.result).toBe('olleh');
        expect(r.context.add.result).toBe(3);
    });

    test('with_ref.yaml：未解引用的 workflow 节点走 false 分支，不破坏整体执行', async () => {
        const cfg = await loadFromFile(path.join(FIXTURES, 'with_ref.yaml'));
        const def = toWorkflowDef(cfg);
        const { executor } = bootEnv();
        const r = await executor.execute(def);
        // sub 是 condition false，没有下游，整体仍 SUCCESS
        expect(r.status).toBe('SUCCESS');
        expect(r.context.sub.value).toBe(false);
        expect(r.context.sub.branch).toBe('false');
    });

    test('非法 YAML 抛 ValidationError，定位错误', async () => {
        await expect(loadFromFile(path.join(FIXTURES, 'invalid_missing_name.yaml'))).rejects.toMatchObject({
            code: 'VALIDATION_ERROR',
        });
    });
});
