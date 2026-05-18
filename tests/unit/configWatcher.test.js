// [test] ID: T3.3 | Date: 2026-05-18 | Description: configWatcher 单元测试（chokidar 注入版，避免文件系统抖动）
'use strict';

const path = require('path');
const { EventEmitter } = require('events');

const { createWatcher } = require('../../src/configManager/configWatcher');

const FIXTURE_VALID = path.resolve(__dirname, '../fixtures/workflows/valid.yaml');
const FIXTURE_INVALID = path.resolve(__dirname, '../fixtures/workflows/invalid_missing_name.yaml');

function buildFakeChokidar() {
    const emitter = new EventEmitter();
    const closeFn = jest.fn().mockResolvedValue(undefined);
    return {
        watch: jest.fn(() => Object.assign(emitter, { close: closeFn })),
        emitter,
        closeFn,
    };
}

function waitFor(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

describe('createWatcher', () => {
    test('change 事件触发 onChange，传递解析后的 config', async () => {
        const fake = buildFakeChokidar();
        const onChange = jest.fn();
        const w = createWatcher({
            target: FIXTURE_VALID,
            onChange,
            debounceMs: 10,
            chokidar: fake,
        });
        fake.emitter.emit('change', FIXTURE_VALID);
        await waitFor(40);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].config.name).toBe('customer-support');
        expect(onChange.mock.calls[0][0].error).toBeNull();
        await w.close();
    });

    test('防抖：短时间内多次 change 仅触发一次 reload', async () => {
        const fake = buildFakeChokidar();
        const onChange = jest.fn();
        const w = createWatcher({
            target: FIXTURE_VALID,
            onChange,
            debounceMs: 30,
            chokidar: fake,
        });
        fake.emitter.emit('change', FIXTURE_VALID);
        fake.emitter.emit('change', FIXTURE_VALID);
        fake.emitter.emit('change', FIXTURE_VALID);
        await waitFor(80);
        expect(onChange).toHaveBeenCalledTimes(1);
        await w.close();
    });

    test('非法配置：onChange 收到 error 字段，不抛错', async () => {
        const fake = buildFakeChokidar();
        const onChange = jest.fn();
        const w = createWatcher({
            target: FIXTURE_INVALID,
            onChange,
            debounceMs: 10,
            chokidar: fake,
        });
        fake.emitter.emit('change', FIXTURE_INVALID);
        await waitFor(40);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].config).toBeNull();
        expect(onChange.mock.calls[0][0].error).toBeTruthy();
        await w.close();
    });

    test('close 调用底层 close', async () => {
        const fake = buildFakeChokidar();
        const w = createWatcher({
            target: FIXTURE_VALID,
            onChange: jest.fn(),
            chokidar: fake,
        });
        await w.close();
        expect(fake.closeFn).toHaveBeenCalledTimes(1);
    });

    test('缺参数抛错', () => {
        expect(() => createWatcher({})).toThrow();
        expect(() => createWatcher({ target: 'x' })).toThrow();
    });
});
