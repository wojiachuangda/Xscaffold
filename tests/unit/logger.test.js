// [test] ID: T0.4 | Date: 2026-05-18 | Description: Pino logger 脱敏行为测试（验证敏感字段在输出中被替换）
'use strict';

const { Writable } = require('stream');
const pino = require('pino');

// 直接构造一个带 redact 配置的 logger，写入内存流以便断言（避免 transport 子进程）
function buildCaptureLogger() {
    const chunks = [];
    const stream = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(chunk.toString());
            cb();
        },
    });
    const logger = pino(
        {
            level: 'debug',
            redact: {
                paths: ['password', '*.password', 'token', '*.token', 'authorization', 'req.headers.authorization'],
                censor: '[REDACTED]',
            },
        },
        stream,
    );
    return { logger, getOutput: () => chunks.join('') };
}

describe('logger redact 行为', () => {
    test('顶层 password 被脱敏', () => {
        const { logger, getOutput } = buildCaptureLogger();
        logger.info({ user: 'a', password: 'p' }, 'login');
        const out = getOutput();
        expect(out).toContain('[REDACTED]');
        expect(out).not.toContain('"password":"p"');
        expect(out).toContain('"user":"a"');
    });

    test('嵌套 *.password 被脱敏', () => {
        const { logger, getOutput } = buildCaptureLogger();
        logger.info({ user: { name: 'a', password: 'p' } }, 'nested');
        const out = getOutput();
        expect(out).toContain('[REDACTED]');
        expect(out).not.toContain('"password":"p"');
    });

    test('req.headers.authorization 被脱敏', () => {
        const { logger, getOutput } = buildCaptureLogger();
        logger.info({ req: { headers: { authorization: 'Bearer x' } } }, 'http');
        const out = getOutput();
        expect(out).toContain('[REDACTED]');
        expect(out).not.toContain('Bearer x');
    });

    test('createLogger 默认 level 受 LOG_LEVEL 影响', () => {
        const { createLogger } = require('../../src/observability/logger');
        const original = process.env.LOG_LEVEL;
        process.env.LOG_LEVEL = 'warn';
        const lg = createLogger({ env: 'production', transport: 'sync' }); // 关闭 pretty + worker
        expect(lg.level).toBe('warn');
        process.env.LOG_LEVEL = original;
    });
});

describe('LoggerConfigSchema（V1.5 transport / pretty）', () => {
    const { LoggerConfigSchema } = require('../../src/observability/schemas/loggerConfigSchema');

    test('空入参 → 默认值 info / auto / auto', () => {
        expect(LoggerConfigSchema.parse({})).toEqual({ level: 'info', transport: 'auto', pretty: 'auto' });
    });

    test('合法枚举值通过', () => {
        const cfg = LoggerConfigSchema.parse({ level: 'silent', transport: 'worker', pretty: 'off' });
        expect(cfg).toEqual({ level: 'silent', transport: 'worker', pretty: 'off' });
    });

    test('非法 level / transport / pretty 拒绝', () => {
        expect(() => LoggerConfigSchema.parse({ level: 'verbose' })).toThrow();
        expect(() => LoggerConfigSchema.parse({ transport: 'http' })).toThrow();
        expect(() => LoggerConfigSchema.parse({ pretty: 'yes' })).toThrow();
    });
});

describe('createLogger transport 分支（V1.5）', () => {
    const { Writable } = require('stream');
    const pinoLib = require('pino');
    const { createLogger } = require('../../src/observability/logger');

    function makeNullStream() {
        return new Writable({ write: (_c, _e, cb) => cb() });
    }

    test('transport=sync + env=production 不启 worker（pino.transport 不调）', () => {
        const spy = jest.spyOn(pinoLib, 'transport');
        try {
            const lg = createLogger({ env: 'production', transport: 'sync', pretty: 'off' });
            expect(spy).not.toHaveBeenCalled();
            expect(lg.level).toBeDefined();
        } finally {
            spy.mockRestore();
        }
    });

    test('transport=worker 调 pino.transport(pino/file, destination:1, sync:false)', () => {
        const spy = jest.spyOn(pinoLib, 'transport').mockReturnValue(makeNullStream());
        try {
            const lg = createLogger({ env: 'production', transport: 'worker', pretty: 'off' });
            expect(spy).toHaveBeenCalledTimes(1);
            const opts = spy.mock.calls[0][0];
            expect(opts.target).toBe('pino/file');
            expect(opts.options).toMatchObject({ destination: 1, sync: false });
            expect(typeof lg.flush).toBe('function');
        } finally {
            spy.mockRestore();
        }
    });

    test('transport=auto + env=production → 自动 worker', () => {
        const spy = jest.spyOn(pinoLib, 'transport').mockReturnValue(makeNullStream());
        try {
            createLogger({ env: 'production', transport: 'auto', pretty: 'off' });
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][0].target).toBe('pino/file');
        } finally {
            spy.mockRestore();
        }
    });

    test('transport=auto + env=test → 同步，不启 worker', () => {
        const spy = jest.spyOn(pinoLib, 'transport');
        try {
            createLogger({ env: 'test', transport: 'auto', pretty: 'off' });
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    test('pretty=on 优先于 transport=worker（不进入 pino/file worker 分支）', () => {
        const spy = jest.spyOn(pinoLib, 'transport').mockReturnValue(makeNullStream());
        try {
            const lg = createLogger({ env: 'production', transport: 'worker', pretty: 'on' });
            // pretty 路径走 pino(options) 内部处理 options.transport={target:pino-pretty,...}，
            // 不应触发我们的 pino.transport({ target: 'pino/file' }) 显式调用
            const workerFileCalls = spy.mock.calls.filter((c) => c[0] && c[0].target === 'pino/file');
            expect(workerFileCalls).toHaveLength(0);
            expect(lg.level).toBeDefined();
        } finally {
            spy.mockRestore();
        }
    });

    test('LOG_TRANSPORT env 被 createLogger 读取', () => {
        const prev = process.env.LOG_TRANSPORT;
        process.env.LOG_TRANSPORT = 'worker';
        const spy = jest.spyOn(pinoLib, 'transport').mockReturnValue(makeNullStream());
        try {
            createLogger({ env: 'production', pretty: 'off' });
            expect(spy).toHaveBeenCalled();
            expect(spy.mock.calls[0][0].target).toBe('pino/file');
        } finally {
            spy.mockRestore();
            if (prev === undefined) {
                delete process.env.LOG_TRANSPORT;
            } else {
                process.env.LOG_TRANSPORT = prev;
            }
        }
    });
});
