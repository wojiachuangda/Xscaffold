// [test] ID: PAM-6 | Date: 2026-05-19 | Description: externalAgentCallRepository 集成测试（pending → terminal 审计留痕）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const {
    buildExternalAgentCallRepository,
} = require('../../src/domain/projectAssistant/repositories/externalAgentCallRepository');
const { migrate } = require('../../src/infrastructure/database/migrate');

const SAMPLE = {
    projectId: 'xscaffold',
    profile: 'claudeHttp',
    sessionId: 'xscaffold-main',
    instruction: '检查项目状态',
    expectation: '返回摘要',
};

async function createRepo() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, repo: buildExternalAgentCallRepository(driver) };
}

describe('externalAgentCallRepository', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await createRepo();
    });
    afterEach(() => ctx.driver.close());

    test('insertPending 生成 extcall_ 前缀 id 且状态为 pending', async () => {
        const callId = await ctx.repo.insertPending(SAMPLE);
        expect(callId).toMatch(/^extcall_/);
        const row = await ctx.repo.findById(callId);
        expect(row.status).toBe('pending');
        expect(row.instruction).toBe('检查项目状态');
        expect(row.durationMs).toBe(0);
    });

    test('markCompleted 写入 reply/summary/duration 并转 completed', async () => {
        const callId = await ctx.repo.insertPending(SAMPLE);
        const row = await ctx.repo.markCompleted(callId, { reply: 'R', summary: 'S', durationMs: 1234 });
        expect(row.status).toBe('completed');
        expect(row.reply).toBe('R');
        expect(row.summary).toBe('S');
        expect(row.durationMs).toBe(1234);
    });

    test('markFailed 记录 timeout 状态与错误信息', async () => {
        const callId = await ctx.repo.insertPending(SAMPLE);
        const row = await ctx.repo.markFailed(callId, {
            status: 'timeout',
            errorMessage: '调用超时',
            durationMs: 120000,
        });
        expect(row.status).toBe('timeout');
        expect(row.errorMessage).toBe('调用超时');
        expect(row.durationMs).toBe(120000);
    });

    test('markFailed 记录 failed 状态', async () => {
        const callId = await ctx.repo.insertPending(SAMPLE);
        const row = await ctx.repo.markFailed(callId, { status: 'failed', errorMessage: 'HTTP 503', durationMs: 30 });
        expect(row.status).toBe('failed');
        expect(row.errorMessage).toBe('HTTP 503');
    });

    test('findById 不存在返回 null', async () => {
        expect(await ctx.repo.findById('nope')).toBeNull();
    });
});
