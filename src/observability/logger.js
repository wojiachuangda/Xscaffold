// [refactor] ID: V1.5-PINO-ASYNC | Date: 2026-05-20 | Description: Pino logger（双脱敏管道：redact.paths 主线程序列化阶段 + V1.5 worker thread async transport 让日志 I/O 离开热路径）
'use strict';

const { Writable } = require('stream');
const pino = require('pino');
const { redactSensitive, SENSITIVE_KEY_PATTERN } = require('./redact');
const { LoggerConfigSchema } = require('./schemas/loggerConfigSchema');
const logRingBuffer = require('./logRingBuffer');

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
    // primary（stdout/pretty/worker）与 ring buffer 同挂 multistream：
    // V1.8 worker transport 保留（仍走 pino.transport），额外多一路喂 Live Logs 环形缓冲（主线程，供 /logs 读）。
    const streams = [{ stream: createPrimaryStream(prettyMode, transportMode) }, { stream: createRingStream() }];
    return pino(options, pino.multistream(streams));
}

function createPrimaryStream(prettyMode, transportMode) {
    if (prettyMode === 'on') {
        // eslint-disable-next-line global-require
        return require('pino-pretty')({ colorize: true, singleLine: false, translateTime: 'SYS:HH:MM:ss.l' });
    }
    if (transportMode === 'worker') {
        // pino/file destination:1 = stdout fd；sync:false 启用 worker thread 异步写入
        return pino.transport({ target: 'pino/file', options: { destination: 1, sync: false } });
    }
    return pino.destination(1);
}

// ring 流：multistream 把序列化后的 JSON 同样写一份过来 → 解析后入环形缓冲（已 redact 脱敏）。
function createRingStream() {
    return new Writable({
        write(chunk, _enc, cb) {
            ingestLogChunk(chunk.toString());
            cb();
        },
    });
}

function ingestLogChunk(text) {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) {
            ingestLogLine(trimmed);
        }
    }
}

function ingestLogLine(line) {
    try {
        const record = JSON.parse(line);
        logRingBuffer.push({
            ts: record.time || new Date().toISOString(),
            level: record.level || 'info',
            msg: record.msg || '',
        });
    } catch (_err) {
        /* 非 JSON 行（multistream 收到的本应是序列化 JSON）忽略 */
    }
}

const logger = createLogger();

module.exports = {
    logger,
    createLogger,
    redactSensitive,
    SENSITIVE_KEY_PATTERN,
    REDACT_PATHS,
};
