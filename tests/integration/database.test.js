// [test] ID: T1.1 | Date: 2026-05-18 | Description: 数据库连接与迁移集成测试
'use strict';

const Database = require('better-sqlite3');
const { parseDatabaseUrl, getDb, closeDb } = require('../../src/infrastructure/database/connection');
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

    test('启用 WAL 与 外键', () => {
        const db = getDb({ url: 'sqlite::memory:' });
        expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    });
});

describe('migrate', () => {
    test('首次执行：应用 migrations 目录下所有 sql', () => {
        const db = new Database(':memory:');
        const r = migrate({ db });
        expect(r.applied.length).toBeGreaterThan(0);
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all()
            .map((t) => t.name);
        expect(tables).toContain('agents');
        expect(tables).toContain('schema_migrations');
        db.close();
    });

    test('再次执行：幂等，applied 为空', () => {
        const db = new Database(':memory:');
        migrate({ db });
        const second = migrate({ db });
        expect(second.applied).toEqual([]);
        db.close();
    });

    test('agents 表 status 字段拒绝非法值', () => {
        const db = new Database(':memory:');
        migrate({ db });
        const insert = db.prepare("INSERT INTO agents (id, name, model, status) VALUES ('a', 'a', 'm', 'INVALID')");
        expect(() => insert.run()).toThrow(/CHECK constraint/);
        db.close();
    });
});
