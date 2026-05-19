// [planner] ID: V1.5-PINO-ASYNC | Date: 2026-05-20 | Description: Logger 配置 Zod 契约（level / transport / pretty；AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

/**
 * pino 支持的常用 level。silent 用于测试期短路。
 */
const LogLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

/**
 * transport：
 *   - auto（默认）：production → worker，其它 → sync（与 LOG_PRETTY 同 by-env 模式）
 *   - sync：强制同步 SonicBoom 直写 stdout（回滚开关）
 *   - worker：强制 pino.transport({ target: 'pino/file', options: { destination: 1, sync: false }})
 */
const LogTransportSchema = z.enum(['auto', 'sync', 'worker']);

/**
 * pretty：
 *   - auto（默认）：非 production 且非 test → pino-pretty，否则关
 *   - on / off：显式覆盖
 *
 * 注：pretty 与 worker 互斥（pretty 自带 worker 子进程）；
 *     LOG_PRETTY=on 时即使 LOG_TRANSPORT=worker 也优先 pretty。
 */
const LogPrettySchema = z.enum(['auto', 'on', 'off']);

const LoggerConfigSchema = z
    .object({
        level: LogLevelSchema.default('info'),
        transport: LogTransportSchema.default('auto'),
        pretty: LogPrettySchema.default('auto'),
    })
    .strict();

module.exports = {
    LogLevelSchema,
    LogTransportSchema,
    LogPrettySchema,
    LoggerConfigSchema,
};
