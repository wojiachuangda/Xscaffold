// [refactor] ID: V1.5-PINO-ASYNC | Date: 2026-05-20 | Description: Pino logger（双脱敏管道：redact.paths 主线程序列化阶段 + V1.5 worker thread async transport 让日志 I/O 离开热路径）
'use strict';

const pino = require('pino');
const { redactSensitive, SENSITIVE_KEY_PATTERN } = require('./redact');
const { LoggerConfigSchema } = require('./schemas/loggerConfigSchema');

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

/**
 * 解析 transport 模式：auto 按环境推断（production → worker，其它 → sync）。
 */
function resolveTransportMode(mode, env) {
    if (mode === 'sync' || mode === 'worker') {
        return mode;
    }
    return env === 'production' ? 'worker' : 'sync';
}

/**
 * 解析 pretty 模式：auto 按环境推断（非 production 且非 test → on，其它 → off）。
 */
function resolvePrettyMode(mode, env) {
    if (mode === 'on' || mode === 'off') {
        return mode;
    }
    return env !== 'production' && env !== 'test' ? 'on' : 'off';
}

function buildBaseOptions(level) {
    return {
        level,
        redact: { paths: REDACT_PATHS, censor: '[REDACTED]', remove: false },
        formatters: { level: (label) => ({ level: label }) },
        timestamp: pino.stdTimeFunctions.isoTime,
    };
}

/**
 * 创建 logger 实例。
 *
 * 优先级：pretty=on > transport=worker > sync 直写 stdout。
 * - pretty：开发态可读输出（pino-pretty 自带 worker，与 transport 互斥）
 * - worker：pino v9 worker thread transport，日志 I/O 离开热路径；
 *   非受控崩溃存在 bounded log loss window（详见 CHANGELOG v1.8.0 与 .env.example）
 * - sync：传统 SonicBoom 直写 stdout（测试默认 + 回滚开关）
 *
 * @param {object} [overrides]
 * @param {string} [overrides.level]
 * @param {string} [overrides.env]
 * @param {'auto'|'sync'|'worker'} [overrides.transport]
 * @param {'auto'|'on'|'off'} [overrides.pretty]
 */
function createLogger(overrides = {}) {
    const env = overrides.env || process.env.NODE_ENV;
    const config = LoggerConfigSchema.parse({
        level: overrides.level || process.env.LOG_LEVEL || 'info',
        transport: overrides.transport || process.env.LOG_TRANSPORT || 'auto',
        pretty: overrides.pretty || process.env.LOG_PRETTY || 'auto',
    });
    const prettyMode = resolvePrettyMode(config.pretty, env);
    const transportMode = resolveTransportMode(config.transport, env);
    const options = buildBaseOptions(config.level);

    if (prettyMode === 'on') {
        options.transport = {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: false, translateTime: 'SYS:HH:MM:ss.l' },
        };
        return pino(options);
    }
    if (transportMode === 'worker') {
        // pino/file destination:1 = stdout fd；sync:false 启用 worker thread 异步写入
        const transport = pino.transport({ target: 'pino/file', options: { destination: 1, sync: false } });
        return pino(options, transport);
    }
    return pino(options);
}

const logger = createLogger();

module.exports = {
    logger,
    createLogger,
    redactSensitive,
    SENSITIVE_KEY_PATTERN,
    REDACT_PATHS,
};
