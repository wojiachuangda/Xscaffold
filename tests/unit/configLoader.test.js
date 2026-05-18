// [test] ID: T3.2 | Date: 2026-05-18 | Description: configLoader 单元测试（YAML/JSON/非法）
'use strict';

const path = require('path');

const { loadFromFile, validateSchema, toWorkflowDef } = require('../../src/configManager/configLoader');
const { ValidationError, AppError } = require('../../src/infrastructure/errors/AppError');

const FIXTURES = path.resolve(__dirname, '../fixtures/workflows');

describe('loadFromFile', () => {
    test('合法 YAML 解析成功', async () => {
        const cfg = await loadFromFile(path.join(FIXTURES, 'valid.yaml'));
        expect(cfg.name).toBe('customer-support');
        expect(cfg.nodes).toHaveLength(4);
        expect(cfg.edges).toHaveLength(3);
        expect(cfg.version).toBe(1);
    });

    test('合法 JSON 解析成功', async () => {
        const cfg = await loadFromFile(path.join(FIXTURES, 'valid.json'));
        expect(cfg.name).toBe('math-pipeline');
        expect(cfg.nodes[0].toolName).toBe('addNumbers');
    });

    test('缺字段抛 ValidationError', async () => {
        await expect(loadFromFile(path.join(FIXTURES, 'invalid_missing_name.yaml'))).rejects.toThrow(ValidationError);
    });

    test('YAML 语法错抛 ValidationError（含 YAML_PARSE_ERROR）', async () => {
        try {
            await loadFromFile(path.join(FIXTURES, 'malformed.yaml'));
            throw new Error('should not reach');
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            expect(JSON.stringify(err.details)).toContain('YAML_PARSE_ERROR');
        }
    });

    test('不存在的文件抛 AppError(CONFIG_READ_ERROR)', async () => {
        await expect(loadFromFile(path.join(FIXTURES, 'nope.yaml'))).rejects.toThrow(AppError);
    });

    test('不支持的后缀抛 ValidationError', async () => {
        await expect(loadFromFile(path.join(FIXTURES, 'valid.txt'))).rejects.toThrow(ValidationError);
    });
});

describe('validateSchema', () => {
    test('合法对象通过', () => {
        const r = validateSchema({
            name: 'x',
            nodes: [{ id: 'a', type: 'agent', agentId: 'p' }],
        });
        expect(r.name).toBe('x');
    });

    test('非法对象抛 ValidationError', () => {
        expect(() => validateSchema({ nodes: [] })).toThrow(ValidationError);
    });
});

describe('toWorkflowDef', () => {
    test('普通节点透传', () => {
        const def = toWorkflowDef({
            name: 'x',
            nodes: [
                { id: 'a', type: 'agent', agentId: 'p' },
                { id: 't', type: 'tool', toolName: 'addNumbers', params: { a: 1, b: 2 } },
            ],
        });
        expect(def.nodes).toHaveLength(2);
        expect(def.nodes[0].type).toBe('agent');
    });

    test('workflow ref 节点被转为 condition 占位（永远 false）', async () => {
        const cfg = await loadFromFile(path.join(FIXTURES, 'with_ref.yaml'));
        const def = toWorkflowDef(cfg);
        const subNode = def.nodes.find((n) => n.id === 'sub');
        expect(subNode.type).toBe('condition');
        expect(subNode.expression).toBe('false');
        expect(subNode.description).toContain('refund-process');
    });
});
