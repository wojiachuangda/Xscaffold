// [test] ID: T1.4 | Date: 2026-05-19 | Description: agentService 单元测试（A.1 async；mock repository）
'use strict';

const { buildService } = require('../../src/agentManager/agentService');
const { ValidationError, NotFoundError } = require('../../src/infrastructure/errors/AppError');

function mockRepo() {
    return {
        findById: jest.fn(),
        findByName: jest.fn(),
        findAll: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
    };
}

describe('buildService', () => {
    test('未注入 repository 抛错', () => {
        expect(() => buildService()).toThrow(/repository/);
    });
});

describe('createAgent', () => {
    test('合法入参 → 调用 repo.create', async () => {
        const repo = mockRepo();
        const created = { id: 'a1', name: 'a', model: 'm', tools: [], status: 'enabled' };
        repo.create.mockResolvedValue(created);
        const svc = buildService(repo);
        const r = await svc.createAgent({ name: 'a', model: 'm' });
        expect(r).toBe(created);
        expect(repo.create).toHaveBeenCalledTimes(1);
    });

    test('非法入参 → ValidationError，不调用 repo', async () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        await expect(svc.createAgent({ model: 'm' })).rejects.toThrow(ValidationError);
        expect(repo.create).not.toHaveBeenCalled();
    });

    test('ValidationError 携带 details 数组', async () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        try {
            await svc.createAgent({ model: 'm' });
        } catch (e) {
            expect(e.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'name' })]));
        }
    });
});

describe('updateAgent', () => {
    test('空 patch → ValidationError', async () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        await expect(svc.updateAgent('id', {})).rejects.toThrow(ValidationError);
    });

    test('合法 patch → 调用 repo.update', async () => {
        const repo = mockRepo();
        repo.update.mockResolvedValue({ id: 'a', status: 'disabled' });
        const svc = buildService(repo);
        await svc.updateAgent('a', { status: 'disabled' });
        expect(repo.update).toHaveBeenCalledWith('a', { status: 'disabled' });
    });
});

describe('deleteAgent', () => {
    test('调用 repo.remove 并返回 id', async () => {
        const repo = mockRepo();
        repo.remove.mockResolvedValue(true);
        const svc = buildService(repo);
        expect(await svc.deleteAgent('x')).toEqual({ id: 'x' });
        expect(repo.remove).toHaveBeenCalledWith('x');
    });
});

describe('getAgentById', () => {
    test('找到 → 返回实体', async () => {
        const repo = mockRepo();
        const e = { id: 'a', name: 'n' };
        repo.findById.mockResolvedValue(e);
        const svc = buildService(repo);
        expect(await svc.getAgentById('a')).toBe(e);
    });

    test('未找到 → NotFoundError', async () => {
        const repo = mockRepo();
        repo.findById.mockResolvedValue(null);
        const svc = buildService(repo);
        await expect(svc.getAgentById('x')).rejects.toThrow(NotFoundError);
    });
});

describe('listAgents', () => {
    test('过滤参数被 Zod 校验后透传', async () => {
        const repo = mockRepo();
        repo.findAll.mockResolvedValue({ items: [], total: 0 });
        const svc = buildService(repo);
        await svc.listAgents({ status: 'enabled', limit: '20' });
        expect(repo.findAll).toHaveBeenCalledWith({
            status: 'enabled',
            limit: 20,
            offset: 0,
        });
    });

    test('非法 limit → ValidationError', async () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        await expect(svc.listAgents({ limit: -1 })).rejects.toThrow(ValidationError);
    });
});
