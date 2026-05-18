// [scaffold] ID: T0.4 | Date: 2026-05-18 | Description: Pino logger 封装，集成敏感字段双重脱敏（AA-SEAC §4.5）
'use strict';

const pino = require('pino');
const { redactSensitive, SENSITIVE_KEY_PATTERN } = require('./redact');

const REDACT_PATHS = [
    'password',
    '*.password',
    'token',
    '*.token',
    'accessToken',
    '*.accessToken',
    'refreshToken',
    '*.refreshToken',
    'secret',
    '*.secret',
    'apiKey',
    '*.apiKey',
    'authorization',
    '*.authorization',
    'cookie',
    '*.cookie',
    'idCard',
    '*.idCard',
    'bankCard',
    '*.bankCard',
    'req.headers.authorization',
    'req.headers.cookie',
];

function createLogger(overrides = {}) {
    const level = overrides.level || process.env.LOG_LEVEL || 'info';
    const env = overrides.env || process.env.NODE_ENV;
    const usePretty = env !== 'production' && env !== 'test';

    const options = {
        level,
        redact: {
            paths: REDACT_PATHS,
            censor: '[REDACTED]',
            remove: false,
        },
        formatters: {
            level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (usePretty) {
        options.transport = {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: false, translateTime: 'SYS:HH:MM:ss.l' },
        };
    }

    return pino(options);
}

const logger = createLogger();

module.exports = {
    logger,
    createLogger,
    redactSensitive,
    SENSITIVE_KEY_PATTERN,
};
