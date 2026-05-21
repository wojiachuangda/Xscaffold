// [test] ID: V2.5-MT | Date: 2026-05-21 | Description: 多租户隔离 E2E——X-API-Key 解析 owner，/agents 跨用户不可见/不可改（404 不泄漏存在性）
'use strict';

const request = require('supertest');

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { createApp } = require('../../src/apiGateway/server');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildUserRepository } = require('../../src/identity/userRepository');
const { buildApiKeyRepository } = require('../../src/identity/apiKeyRepository');
const { generateApiKey, hashApiKey } = require('../../src/identity/keyUtil');

async function seedUserWithKey(driver, { name, email }) {
    const user = await buildUserRepository(driver).create({ name, email });
    const rawKey = generateApiKey();
    await buildApiKeyRepository(driver).create({ userId: user.id, name: `${name}-key`, keyHash: hashApiKey(rawKey) });
    return { user, rawKey };
}

async function bootApp() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    // authDisabled:true → 无 key 时放行；带 X-API-Key 时 apiKeyMiddleware 解析出 owner
    const app = createApp({ db: driver, authDisabled: true, rateLimitBypass: true });
    const alice = await seedUserWithKey(driver, { name: 'alice', email: 'alice@x.dev' });
    const bob = await seedUserWithKey(driver, { name: 'bob', email: 'bob@x.dev' });
    return { app, driver, alice, bob };
}

describe('多租户隔离 E2E', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await bootApp();
    });
    afterEach(() => ctx.driver.close());

    async function createAgentAs(rawKey, name) {
        const res = await request(ctx.app).post('/agents').set('X-API-Key', rawKey).send({ name, model: 'gpt-4' });
        expect(res.status).toBe(201);
        return res.body.data.id;
    }

    test('无效 API key → 401', async () => {
        const res = await request(ctx.app).get('/agents').set('X-API-Key', 'sk_nonexistent');
        expect(res.status).toBe(401);
    });

    test('agent 归属创建者；list 只见自己', async () => {
        await createAgentAs(ctx.alice.rawKey, 'alice-agent');
        await createAgentAs(ctx.bob.rawKey, 'bob-agent');

        const aliceList = await request(ctx.app).get('/agents').set('X-API-Key', ctx.alice.rawKey);
        expect(aliceList.status).toBe(200);
        expect(aliceList.body.data.map((a) => a.name)).toEqual(['alice-agent']);

        const bobList = await request(ctx.app).get('/agents').set('X-API-Key', ctx.bob.rawKey);
        expect(bobList.body.data.map((a) => a.name)).toEqual(['bob-agent']);
    });

    test('跨用户 GET/PUT/DELETE → 404（不泄漏存在性）', async () => {
        const aliceAgentId = await createAgentAs(ctx.alice.rawKey, 'secret-agent');

        const get = await request(ctx.app).get(`/agents/${aliceAgentId}`).set('X-API-Key', ctx.bob.rawKey);
        expect(get.status).toBe(404);

        const put = await request(ctx.app)
            .put(`/agents/${aliceAgentId}`)
            .set('X-API-Key', ctx.bob.rawKey)
            .send({ status: 'disabled' });
        expect(put.status).toBe(404);

        const del = await request(ctx.app).delete(`/agents/${aliceAgentId}`).set('X-API-Key', ctx.bob.rawKey);
        expect(del.status).toBe(404);

        // owner 自己仍可读，确认资源未被误删
        const ownerGet = await request(ctx.app).get(`/agents/${aliceAgentId}`).set('X-API-Key', ctx.alice.rawKey);
        expect(ownerGet.status).toBe(200);
        expect(ownerGet.body.data.name).toBe('secret-agent');
    });

    test('owner 可改自己的 agent', async () => {
        const id = await createAgentAs(ctx.alice.rawKey, 'mine');
        const put = await request(ctx.app)
            .put(`/agents/${id}`)
            .set('X-API-Key', ctx.alice.rawKey)
            .send({ status: 'disabled' });
        expect(put.status).toBe(200);
        expect(put.body.data.status).toBe('disabled');
    });
});
