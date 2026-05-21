// [test] ID: V2.5-MT | Date: 2026-05-21 | Description: apiKeyMiddleware 单元测试——无 key 放行 / 无效 key / 用户停用 / 合法注入 req.user
'use strict';

const { createApiKeyMiddleware } = require('../../src/apiGateway/middlewares/apiKeyMiddleware');
const { hashApiKey } = require('../../src/identity/keyUtil');
const { AuthError } = require('../../src/infrastructure/errors/AppError');

function mockDeps() {
    return {
        userRepository: { findById: jest.fn() },
        apiKeyRepository: { findActiveByHash: jest.fn() },
    };
}

function runMw(mw, req) {
    return new Promise((resolve) => {
        mw(req, {}, (err) => resolve(err));
    });
}

describe('apiKeyMiddleware', () => {
    test('无 X-API-Key → 放行（不查库，不注入 user）', async () => {
        const deps = mockDeps();
        const req = { headers: {} };
        const err = await runMw(createApiKeyMiddleware(deps), req);
        expect(err).toBeUndefined();
        expect(req.user).toBeUndefined();
        expect(deps.apiKeyRepository.findActiveByHash).not.toHaveBeenCalled();
    });

    test('无效 key → AuthError', async () => {
        const deps = mockDeps();
        deps.apiKeyRepository.findActiveByHash.mockResolvedValue(null);
        const req = { headers: { 'x-api-key': 'sk_bad' } };
        const err = await runMw(createApiKeyMiddleware(deps), req);
        expect(err).toBeInstanceOf(AuthError);
        expect(req.user).toBeUndefined();
    });

    test('key 合法但关联用户停用 → AuthError', async () => {
        const deps = mockDeps();
        deps.apiKeyRepository.findActiveByHash.mockResolvedValue({ id: 'k1', userId: 'u1' });
        deps.userRepository.findById.mockResolvedValue({ id: 'u1', name: 'A', status: 'disabled' });
        const req = { headers: { 'x-api-key': 'sk_ok' } };
        const err = await runMw(createApiKeyMiddleware(deps), req);
        expect(err).toBeInstanceOf(AuthError);
        expect(req.user).toBeUndefined();
    });

    test('合法 key → 注入 req.user（viaApiKey）', async () => {
        const deps = mockDeps();
        const raw = 'sk_good';
        deps.apiKeyRepository.findActiveByHash.mockResolvedValue({ id: 'k1', userId: 'u1' });
        deps.userRepository.findById.mockResolvedValue({ id: 'u1', name: 'Alice', status: 'active' });
        const req = { headers: { 'x-api-key': raw } };
        const err = await runMw(createApiKeyMiddleware(deps), req);
        expect(err).toBeUndefined();
        expect(req.user).toEqual({ id: 'u1', name: 'Alice', viaApiKey: true });
        expect(deps.apiKeyRepository.findActiveByHash).toHaveBeenCalledWith(hashApiKey(raw));
    });

    test('仓储抛错 → 透传给 next(err)', async () => {
        const deps = mockDeps();
        deps.apiKeyRepository.findActiveByHash.mockRejectedValue(new Error('db down'));
        const req = { headers: { 'x-api-key': 'sk_x' } };
        const err = await runMw(createApiKeyMiddleware(deps), req);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('db down');
    });
});
