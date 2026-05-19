// [test] ID: V1.5-IOOR-BATCH | Date: 2026-05-20 | Description: ioorBuffer 单元测试（触发条件 / flush / 死信兜底；用内存 fake repository）
'use strict';

const { createIoorBuffer } = require('../../src/observability/ioorBuffer');

function fakeRecord(executionId, turnIndex) {
    return {
        id: `ioor_${executionId}_${turnIndex}`,
        executionId,
        nodeId: 'n1',
        turnIndex,
        input: null,
        output: null,
        toolCalls: [],
        observations: [],
        tokenUsage: null,
        latencyMs: null,
        createdAt: new Date().toISOString(),
    };
}

function fakeRepo() {
    const inserted = [];
    return {
        inserted,
        insertMany: async (records) => {
            inserted.push(...records);
            return { inserted: records.length };
        },
    };
}

function failingRepo() {
    return {
        insertMany: async () => {
            throw new Error('db down');
        },
    };
}

function fakeAudit() {
    const deadLetters = [];
    return {
        deadLetters,
        recordDeadLetter: async (entry) => {
            deadLetters.push(entry);
        },
    };
}

describe('ioorBuffer', () => {
    test('push 累计 size；flush(id) 落库并清该 execution', async () => {
        const repo = fakeRepo();
        const buffer = createIoorBuffer({ ioorRepository: repo, config: { batchSize: 100, intervalMs: 60000 } });
        buffer.push(fakeRecord('exec_a', 0));
        buffer.push(fakeRecord('exec_a', 1));
        buffer.push(fakeRecord('exec_b', 0));
        expect(buffer.size()).toBe(3);

        await buffer.flush('exec_a');
        expect(repo.inserted).toHaveLength(2);
        expect(buffer.size()).toBe(1);
        await buffer.close();
    });

    test('flush 不存在的 execution → inserted 0', async () => {
        const repo = fakeRepo();
        const buffer = createIoorBuffer({ ioorRepository: repo, config: { batchSize: 100, intervalMs: 60000 } });
        const r = await buffer.flush('nope');
        expect(r).toEqual({ inserted: 0 });
        await buffer.close();
    });

    test('flushAll 落库全部 execution', async () => {
        const repo = fakeRepo();
        const buffer = createIoorBuffer({ ioorRepository: repo, config: { batchSize: 100, intervalMs: 60000 } });
        buffer.push(fakeRecord('e1', 0));
        buffer.push(fakeRecord('e2', 0));
        const total = await buffer.flushAll();
        expect(total).toBe(2);
        expect(buffer.size()).toBe(0);
        await buffer.close();
    });

    test('size 达 batchSize 自动触发 flush', async () => {
        const repo = fakeRepo();
        const buffer = createIoorBuffer({ ioorRepository: repo, config: { batchSize: 3, intervalMs: 60000 } });
        buffer.push(fakeRecord('e', 0));
        buffer.push(fakeRecord('e', 1));
        buffer.push(fakeRecord('e', 2));
        await new Promise((r) => setImmediate(r));
        expect(repo.inserted).toHaveLength(3);
        expect(buffer.size()).toBe(0);
        await buffer.close();
    });

    test('flush 失败 → 整批进 audit_dead_letters（source=ioor.batch）', async () => {
        const audit = fakeAudit();
        const buffer = createIoorBuffer({
            ioorRepository: failingRepo(),
            auditRepository: audit,
            config: { batchSize: 100, intervalMs: 60000 },
        });
        buffer.push(fakeRecord('e', 0));
        buffer.push(fakeRecord('e', 1));
        const r = await buffer.flush('e');
        expect(r).toEqual({ inserted: 0, failed: 2 });
        expect(audit.deadLetters).toHaveLength(1);
        expect(audit.deadLetters[0].source).toBe('ioor.batch');
        expect(audit.deadLetters[0].payload).toHaveLength(2);
        await buffer.close();
    });

    test('flush 失败且无 audit → 不抛错（best-effort）', async () => {
        const buffer = createIoorBuffer({
            ioorRepository: failingRepo(),
            config: { batchSize: 100, intervalMs: 60000 },
        });
        buffer.push(fakeRecord('e', 0));
        await expect(buffer.flush('e')).resolves.toEqual({ inserted: 0, failed: 1 });
        await buffer.close();
    });

    test('close 触发 flushAll', async () => {
        const repo = fakeRepo();
        const buffer = createIoorBuffer({ ioorRepository: repo, config: { batchSize: 100, intervalMs: 60000 } });
        buffer.push(fakeRecord('e', 0));
        await buffer.close();
        expect(repo.inserted).toHaveLength(1);
    });

    test('缺 ioorRepository → 构造抛错', () => {
        expect(() => createIoorBuffer({})).toThrow(/ioorRepository/);
    });
});
