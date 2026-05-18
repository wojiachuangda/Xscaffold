// [test] ID: T4.3 | Date: 2026-05-18 | Description: workflowRegistry 单元测试
'use strict';

const path = require('path');

const { createWorkflowRegistry, loadFromDirectory } = require('../../src/workflowEngine/workflowRegistry');
const { loadFromFile } = require('../../src/configManager/configLoader');
const { ConflictError, NotFoundError } = require('../../src/infrastructure/errors/AppError');

const FIXTURES = path.resolve(__dirname, '../fixtures/workflows');

describe('createWorkflowRegistry', () => {
    test('register + get', () => {
        const reg = createWorkflowRegistry();
        reg.register('wf1', { name: 'a', version: '1.0', nodes: [{ id: 'n' }] });
        expect(reg.get('wf1').name).toBe('a');
    });

    test('重复注册 → ConflictError；upsert 覆盖', () => {
        const reg = createWorkflowRegistry();
        const def = { name: 'a', version: '1.0', nodes: [{ id: 'n' }] };
        reg.register('w', def);
        expect(() => reg.register('w', def)).toThrow(ConflictError);
        reg.upsert('w', { name: 'b', version: '2', nodes: [{ id: 'n' }] });
        expect(reg.get('w').name).toBe('b');
    });

    test('get 不存在 → NotFoundError', () => {
        const reg = createWorkflowRegistry();
        expect(() => reg.get('nope')).toThrow(NotFoundError);
    });

    test('list 返回摘要', () => {
        const reg = createWorkflowRegistry();
        reg.register('w1', { name: 'a', version: '1', nodes: [{ id: 'n' }, { id: 'm' }] });
        const items = reg.list();
        expect(items[0]).toMatchObject({ id: 'w1', name: 'a', nodeCount: 2 });
    });

    test('remove', () => {
        const reg = createWorkflowRegistry();
        reg.register('w', { name: 'a', version: '1', nodes: [{ id: 'n' }] });
        expect(reg.remove('w')).toBe(true);
        expect(() => reg.get('w')).toThrow(NotFoundError);
    });
});

describe('loadFromDirectory', () => {
    test('扫描 fixtures：合法文件加载，非法记 failed', async () => {
        const reg = createWorkflowRegistry();
        const r = await loadFromDirectory({ dir: FIXTURES, registry: reg, loadFn: loadFromFile });
        expect(r.loaded.length).toBeGreaterThan(0);
        expect(r.loaded).toContain('valid');
        expect(r.failed.length).toBeGreaterThan(0); // invalid_missing_name + malformed
    });

    test('不存在的目录返回空', async () => {
        const reg = createWorkflowRegistry();
        const r = await loadFromDirectory({
            dir: path.resolve(__dirname, '../fixtures/__nope__'),
            registry: reg,
            loadFn: loadFromFile,
        });
        expect(r).toEqual({ loaded: [], failed: [] });
    });
});
