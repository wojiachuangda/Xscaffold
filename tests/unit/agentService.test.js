// [test] ID: T1.4 | Date: 2026-05-18 | Description: agentService 单元测试（mock repository）
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
    test('合法入参 → 调用 repo.create', () => {
        const repo = mockRepo();
        const created = { id: 'a1', name: 'a', model: 'm', tools: [], status: 'enabled' };
        repo.create.mockReturnValue(created);
        const svc = buildService(repo);
        const r = svc.createAgent({ name: 'a', model: 'm' });
        expect(r).toBe(created);
        expect(repo.create).toHaveBeenCalledTimes(1);
    });

    test('非法入参 → ValidationError，不调用 repo', () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        expect(() => svc.createAgent({ model: 'm' })).toThrow(ValidationError);
        expect(repo.create).not.toHaveBeenCalled();
    });

    test('ValidationError 携带 details 数组', () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        try {
            svc.createAgent({ model: 'm' });
        } catch (e) {
            expect(e.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'name' })]));
        }
    });
});

describe('updateAgent', () => {
    test('空 patch → ValidationError', () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        expect(() => svc.updateAgent('id', {})).toThrow(ValidationError);
    });

    test('合法 patch → 调用 repo.update', () => {
        const repo = mockRepo();
        repo.update.mockReturnValue({ id: 'a', status: 'disabled' });
        const svc = buildService(repo);
        svc.updateAgent('a', { status: 'disabled' });
        expect(repo.update).toHaveBeenCalledWith('a', { status: 'disabled' });
    });
});

describe('deleteAgent', () => {
    test('调用 repo.remove 并返回 id', () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        expect(svc.deleteAgent('x')).toEqual({ id: 'x' });
        expect(repo.remove).toHaveBeenCalledWith('x');
    });
});

describe('getAgentById', () => {
    test('找到 → 返回实体', () => {
        const repo = mockRepo();
        const e = { id: 'a', name: 'n' };
        repo.findById.mockReturnValue(e);
        const svc = buildService(repo);
        expect(svc.getAgentById('a')).toBe(e);
    });

    test('未找到 → NotFoundError', () => {
        const repo = mockRepo();
        repo.findById.mockReturnValue(null);
        const svc = buildService(repo);
        expect(() => svc.getAgentById('x')).toThrow(NotFoundError);
    });
});

describe('listAgents', () => {
    test('过滤参数被 Zod 校验后透传', () => {
        const repo = mockRepo();
        repo.findAll.mockReturnValue({ items: [], total: 0 });
        const svc = buildService(repo);
        svc.listAgents({ status: 'enabled', limit: '20' });
        expect(repo.findAll).toHaveBeenCalledWith({
            status: 'enabled',
            limit: 20,
            offset: 0,
        });
    });

    test('非法 limit → ValidationError', () => {
        const repo = mockRepo();
        const svc = buildService(repo);
        expect(() => svc.listAgents({ limit: -1 })).toThrow(ValidationError);
    });
});
