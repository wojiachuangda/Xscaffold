// [test] ID: T2.2 | Date: 2026-05-18 | Description: 5 个内置工具的单元测试
'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const addNumbers = require('../../src/toolRegistry/builtinTools/addNumbers');
const readFile = require('../../src/toolRegistry/builtinTools/readFile');
const queryDatabase = require('../../src/toolRegistry/builtinTools/queryDatabase');
const sendEmail = require('../../src/toolRegistry/builtinTools/sendEmail');
const httpRequest = require('../../src/toolRegistry/builtinTools/httpRequest');
const { ValidationError } = require('../../src/infrastructure/errors/AppError');

describe('addNumbers', () => {
    test('正常求和', async () => {
        await expect(addNumbers.handler({ a: 1, b: 2 })).resolves.toEqual({ result: 3 });
    });

    test('参数校验失败', () => {
        const r = addNumbers.paramsSchema.safeParse({ a: 'no' });
        expect(r.success).toBe(false);
    });
});

describe('readFile', () => {
    test('读取临时文件成功', async () => {
        const file = path.join(os.tmpdir(), `xt-${Date.now()}.txt`);
        await fs.writeFile(file, 'hello', 'utf8');
        const r = await readFile.handler({ path: file, encoding: 'utf8' });
        expect(r.content).toBe('hello');
        await fs.unlink(file);
    });

    test('路径不存在 → 抛错', async () => {
        await expect(readFile.handler({ path: '/no/such/file.xx', encoding: 'utf8' })).rejects.toThrow();
    });
});

describe('queryDatabase', () => {
    let db;
    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
        db.prepare('INSERT INTO t(name) VALUES (?), (?)').run('a', 'b');
    });
    afterEach(() => db.close());

    test('SELECT 成功', async () => {
        const r = await queryDatabase.handler({ sql: 'SELECT name FROM t ORDER BY id', params: [] }, { db });
        expect(r.rowCount).toBe(2);
        expect(r.rows.map((x) => x.name)).toEqual(['a', 'b']);
    });

    test('非 SELECT 语句被拒绝', async () => {
        await expect(queryDatabase.handler({ sql: 'DELETE FROM t', params: [] }, { db })).rejects.toThrow(
            ValidationError,
        );
    });

    test('参数化查询', async () => {
        const r = await queryDatabase.handler({ sql: 'SELECT name FROM t WHERE name = ?', params: ['a'] }, { db });
        expect(r.rowCount).toBe(1);
    });
});

describe('sendEmail', () => {
    test('返回 stub messageId', async () => {
        const r = await sendEmail.handler({ to: 'a@b.com', subject: 's', body: 'b' });
        expect(r.delivered).toBe(true);
        expect(r.recipients).toEqual(['a@b.com']);
    });

    test('收件人数组同样支持', async () => {
        const r = await sendEmail.handler({ to: ['a@b.com', 'c@d.com'], subject: 's', body: 'b' });
        expect(r.recipients).toHaveLength(2);
    });

    test('非法邮箱', () => {
        const r = sendEmail.paramsSchema.safeParse({ to: 'not-email', subject: 's', body: 'b' });
        expect(r.success).toBe(false);
    });
});

describe('httpRequest', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('GET 成功（mock fetch）', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            status: 200,
            ok: true,
            headers: new Map([['content-type', 'text/plain']]),
            text: async () => 'pong',
        });
        const r = await httpRequest.handler({ url: 'https://example.com', method: 'GET' });
        expect(r.status).toBe(200);
        expect(r.body).toBe('pong');
    });

    test('POST 自动 JSON 序列化', async () => {
        const captured = {};
        global.fetch = jest.fn().mockImplementation((url, init) => {
            captured.url = url;
            captured.init = init;
            return Promise.resolve({
                status: 201,
                ok: true,
                headers: new Map(),
                text: async () => '',
            });
        });
        await httpRequest.handler({
            url: 'https://x',
            method: 'POST',
            body: { hello: 'world' },
        });
        expect(captured.init.body).toBe(JSON.stringify({ hello: 'world' }));
        expect(captured.init.headers['content-type']).toBe('application/json');
    });

    test('非法 URL', () => {
        const r = httpRequest.paramsSchema.safeParse({ url: 'not-a-url', method: 'GET' });
        expect(r.success).toBe(false);
    });
});
