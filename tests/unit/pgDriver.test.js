// [test] ID: V1.5-A.2 | Date: 2026-05-19 | Description: pgDriver 纯函数单测（占位符重写、isUniqueViolation、parseDatabaseUrl 协议识别）
'use strict';

const {
    rewritePlaceholders,
    isUniqueViolation,
    PG_UNIQUE_VIOLATION,
} = require('../../src/infrastructure/database/drivers/pgDriver');
const { parseDatabaseUrl } = require('../../src/infrastructure/database/drivers');

describe('rewritePlaceholders', () => {
    test('空 SQL 不变', () => {
        expect(rewritePlaceholders('SELECT 1')).toBe('SELECT 1');
    });

    test('单个 ? → $1', () => {
        expect(rewritePlaceholders('SELECT * FROM agents WHERE id = ?')).toBe('SELECT * FROM agents WHERE id = $1');
    });

    test('多个 ? 按出现顺序递增', () => {
        const sql = 'INSERT INTO agents (id, name, model, tools) VALUES (?, ?, ?, ?)';
        expect(rewritePlaceholders(sql)).toBe('INSERT INTO agents (id, name, model, tools) VALUES ($1, $2, $3, $4)');
    });

    test('14 个 ? 全部正确递增（ioor INSERT 实际形态）', () => {
        const sql = 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const expected = 'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)';
        expect(rewritePlaceholders(sql)).toBe(expected);
    });

    test('UPDATE 多 ? 与 WHERE 子句混合', () => {
        const sql = 'UPDATE agents SET name = ?, status = ?, updated_at = ? WHERE id = ?';
        expect(rewritePlaceholders(sql)).toBe(
            'UPDATE agents SET name = $1, status = $2, updated_at = $3 WHERE id = $4',
        );
    });
});

describe('isUniqueViolation', () => {
    test('PG 23505 → true', () => {
        expect(isUniqueViolation({ code: '23505' })).toBe(true);
    });

    test('其他错误码 → false', () => {
        expect(isUniqueViolation({ code: '23503' })).toBe(false);
        expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(false);
    });

    test('null/undefined 安全返回 false', () => {
        expect(isUniqueViolation(null)).toBe(false);
        expect(isUniqueViolation(undefined)).toBe(false);
    });

    test('对外导出常量稳定', () => {
        expect(PG_UNIQUE_VIOLATION).toBe('23505');
    });
});

describe('parseDatabaseUrl', () => {
    test('postgres:// → driver=postgres + 完整 connectionString', () => {
        const cfg = parseDatabaseUrl('postgres://u:p@localhost:5432/db');
        expect(cfg).toEqual({
            driver: 'postgres',
            connectionString: 'postgres://u:p@localhost:5432/db',
        });
    });

    test('postgresql:// 协议同样识别', () => {
        const cfg = parseDatabaseUrl('postgresql://u:p@host/db');
        expect(cfg.driver).toBe('postgres');
        expect(cfg.connectionString).toBe('postgresql://u:p@host/db');
    });

    test('sqlite:./file 仍识别为 sqlite 分支', () => {
        expect(parseDatabaseUrl('sqlite:./data/x.db')).toEqual({ driver: 'sqlite', filename: './data/x.db' });
    });

    test('sqlite::memory: 显式协议识别', () => {
        expect(parseDatabaseUrl('sqlite::memory:')).toEqual({ driver: 'sqlite', filename: ':memory:' });
    });

    test('空值 fallback 至 sqlite::memory:', () => {
        expect(parseDatabaseUrl(undefined)).toEqual({ driver: 'sqlite', filename: ':memory:' });
        expect(parseDatabaseUrl('')).toEqual({ driver: 'sqlite', filename: ':memory:' });
    });

    test('未知协议抛错', () => {
        expect(() => parseDatabaseUrl('mysql://x')).toThrow(/不支持的 DATABASE_URL 协议/);
    });

    test('PG_POOL_MAX 环境变量被吸收为 poolMax', () => {
        const prev = process.env.PG_POOL_MAX;
        process.env.PG_POOL_MAX = '25';
        try {
            const cfg = parseDatabaseUrl('postgres://u:p@h/db');
            expect(cfg.poolMax).toBe(25);
        } finally {
            if (prev === undefined) {
                delete process.env.PG_POOL_MAX;
            } else {
                process.env.PG_POOL_MAX = prev;
            }
        }
    });

    test('PG_POOL_MAX 非法值被忽略', () => {
        const prev = process.env.PG_POOL_MAX;
        process.env.PG_POOL_MAX = 'abc';
        try {
            const cfg = parseDatabaseUrl('postgres://u:p@h/db');
            expect(cfg.poolMax).toBeUndefined();
        } finally {
            if (prev === undefined) {
                delete process.env.PG_POOL_MAX;
            } else {
                process.env.PG_POOL_MAX = prev;
            }
        }
    });
});
