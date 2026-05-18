// [test] ID: T5.1 | Date: 2026-05-18 | Description: memoryStore 单元测试（mock repository）
'use strict';

const { buildMemoryStore } = require('../../src/memoryManager/memoryStore');
const { ValidationError } = require('../../src/infrastructure/errors/AppError');

function mockRepo() {
    return {
        insert: jest.fn().mockReturnValue({ id: 'msg_1' }),
        findById: jest.fn(),
        listRecent: jest.fn().mockReturnValue([]),
        deleteSession: jest.fn().mockReturnValue(3),
    };
}

describe('buildMemoryStore', () => {
    test('未注入 repository 抛错', () => {
        expect(() => buildMemoryStore()).toThrow();
    });

    test('saveMessage 合法 → 调用 repo.insert', () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo);
        store.saveMessage({ sessionId: 's', role: 'user', content: 'hi' });
        expect(repo.insert).toHaveBeenCalledTimes(1);
    });

    test('saveMessage 非法 role → ValidationError', () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo);
        expect(() => store.saveMessage({ sessionId: 's', role: 'fake', content: 'x' })).toThrow(ValidationError);
    });

    test('getHistory 默认窗口 = 10', () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo, { defaultWindow: 10 });
        store.getHistory({ sessionId: 's' });
        expect(repo.listRecent).toHaveBeenCalledWith('s', 10);
    });

    test('getHistory 显式 limit 覆盖', () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo, { defaultWindow: 10 });
        store.getHistory({ sessionId: 's', limit: 5 });
        expect(repo.listRecent).toHaveBeenCalledWith('s', 5);
    });

    test('clearSession 透传', () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo);
        expect(store.clearSession('s')).toBe(3);
        expect(repo.deleteSession).toHaveBeenCalledWith('s');
    });
});
