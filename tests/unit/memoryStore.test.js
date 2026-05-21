// [test] ID: T5.1 | Date: 2026-05-19 | Description: memoryStore 单元测试（A.1 async；mock repository）
'use strict';

const { buildMemoryStore } = require('../../src/memoryManager/memoryStore');
const { ValidationError } = require('../../src/infrastructure/errors/AppError');

function mockRepo() {
    return {
        insert: jest.fn().mockResolvedValue({ id: 'msg_1' }),
        findById: jest.fn(),
        listRecent: jest.fn().mockResolvedValue([]),
        findSessionOwner: jest.fn().mockResolvedValue(null),
        countBySession: jest.fn().mockResolvedValue(0),
        deleteSession: jest.fn().mockResolvedValue(3),
    };
}

describe('buildMemoryStore', () => {
    test('未注入 repository 抛错', () => {
        expect(() => buildMemoryStore()).toThrow();
    });

    test('saveMessage 合法 → 调用 repo.insert', async () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo);
        await store.saveMessage({ sessionId: 's', role: 'user', content: 'hi' });
        expect(repo.insert).toHaveBeenCalledTimes(1);
    });

    test('saveMessage 非法 role → ValidationError', async () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo);
        await expect(store.saveMessage({ sessionId: 's', role: 'fake', content: 'x' })).rejects.toThrow(
            ValidationError,
        );
    });

    test('getHistory 默认窗口 = 10（无 ownerId）', async () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo, { defaultWindow: 10 });
        await store.getHistory({ sessionId: 's' });
        expect(repo.listRecent).toHaveBeenCalledWith('s', 10, undefined);
    });

    test('getHistory 显式 limit 覆盖', async () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo, { defaultWindow: 10 });
        await store.getHistory({ sessionId: 's', limit: 5 });
        expect(repo.listRecent).toHaveBeenCalledWith('s', 5, undefined);
    });

    test('getHistory 透传 ownerId 给 repo（owner 过滤）', async () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo, { defaultWindow: 10 });
        await store.getHistory({ sessionId: 's', limit: 20, ownerId: 'u1' });
        expect(repo.listRecent).toHaveBeenCalledWith('s', 20, 'u1');
    });

    test('getSessionOwner 透传 repo.findSessionOwner', async () => {
        const repo = mockRepo();
        repo.findSessionOwner.mockResolvedValue('u9');
        const store = buildMemoryStore(repo);
        expect(await store.getSessionOwner('s')).toBe('u9');
        expect(repo.findSessionOwner).toHaveBeenCalledWith('s');
    });

    test('countSession 透传 repo.countBySession（含 owner）', async () => {
        const repo = mockRepo();
        repo.countBySession.mockResolvedValue(42);
        const store = buildMemoryStore(repo);
        expect(await store.countSession('s', 'u1')).toBe(42);
        expect(repo.countBySession).toHaveBeenCalledWith('s', 'u1');
    });

    test('clearSession 透传', async () => {
        const repo = mockRepo();
        const store = buildMemoryStore(repo);
        expect(await store.clearSession('s')).toBe(3);
        expect(repo.deleteSession).toHaveBeenCalledWith('s');
    });
});
