// [test] ID: T1.1 | Date: 2026-05-19 | Description: 数据库连接与迁移集成测试（A.1 S7：Driver-only）
'use strict';

const { parseDatabaseUrl, getDb, closeDb } = require('../../src/infrastructure/database/connection');
const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');

describe('parseDatabaseUrl', () => {
    test('解析 sqlite::memory:', () => {
        expect(parseDatabaseUrl('sqlite::memory:')).toEqual({ driver: 'sqlite', filename: ':memory:' });
    });

    test('解析 sqlite:./data/x.db', () => {
        expect(parseDatabaseUrl('sqlite:./data/x.db')).toEqual({ driver: 'sqlite', filename: './data/x.db' });
    });

    test('默认值为 in-memory', () => {
        expect(parseDatabaseUrl()).toEqual({ driver: 'sqlite', filename: ':memory:' });
    });

    test('未知协议抛错', () => {
        expect(() => parseDatabaseUrl('postgres://...')).toThrow(/仅支持 sqlite/);
    });
});

describe('getDb / closeDb (内存库)', () => {
    afterEach(() => closeDb());

    test('单例：同一进程内多次 getDb 返回同一实例', () => {
        const a = getDb({ url: 'sqlite::memory:' });
        const b = getDb({ url: 'sqlite::memory:' });
        expect(a).toBe(b);
    });

    test('启用 WAL 与 外键（通过 PRAGMA 查询验证）', async () => {
        const driver = getDb({ url: 'sqlite::memory:' });
        const { rows } = await driver.query('PRAGMA foreign_keys');
        expect(rows[0].foreign_keys).toBe(1);
    });
});

describe('migrate', () => {
    test('首次执行：应用 migrations 目录下所有 sql', async () => {
        const driver = createSqliteDriver({ filename: ':memory:' });
        const r = await migrate({ driver });
        expect(r.applied.length).toBeGreaterThan(0);
        const { rows: tableRows } = await driver.query("SELECT name FROM sqlite_master WHERE type='table'");
        const tables = tableRows.map((t) => t.name);
        expect(tables).toContain('agents');
        expect(tables).toContain('schema_migrations');
        await driver.close();
    });

    test('再次执行：幂等，applied 为空', async () => {
        const driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
        const second = await migrate({ driver });
        expect(second.applied).toEqual([]);
        await driver.close();
    });

    test('agents 表 status 字段拒绝非法值', async () => {
        const driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
        await expect(
            driver.run("INSERT INTO agents (id, name, model, status) VALUES ('a', 'a', 'm', 'INVALID')"),
        ).rejects.toThrow(/CHECK constraint/);
        await driver.close();
    });

    test('入参不是 Driver → 抛错', async () => {
        await expect(migrate({ driver: { prepare: () => null } })).rejects.toThrow(/Driver/);
    });
});
