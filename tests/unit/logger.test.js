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
        const lg = createLogger({ env: 'production' }); // 关闭 pretty transport
        expect(lg.level).toBe('warn');
        process.env.LOG_LEVEL = original;
    });
});
