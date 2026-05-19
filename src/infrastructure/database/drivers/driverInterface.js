// [refactor] ID: V1.5-A.1-S7 | Date: 2026-05-19 | Description: Driver 接口规范（pure JSDoc typedef，S7 已清除 S2 过渡 facade typedef）
'use strict';

/**
 * Driver 抽象接口 — A.1 引入的同步→异步契约重构核心
 *
 * 目标：让 Repository 层依赖此抽象，不再耦合具体引擎（better-sqlite3 / node-postgres / ...）。
 *
 * 设计原则：
 * 1. **全异步**：所有读写返回 Promise；事务用回调式确保上下文一致
 * 2. **占位符兼容**：SQL 仍用 `?` 写（与 better-sqlite3 历史一致）；pgDriver 实现时内部转换 `$1, $2`
 * 3. **错误归一化**：driver 不暴露引擎特定错误码，统一通过 isUniqueViolation 等谓词判断
 * 4. **migrationsDir 分流**：每个 driver 自带方言的 migrations 目录
 *
 * @typedef {Object} Driver
 *
 * @property {(sql: string, params?: ReadonlyArray<unknown>) => Promise<{rows: object[]}>} query
 *   SELECT 类查询。返回行对象数组，符合 QueryResultSchema。
 *
 * @property {(sql: string, params?: ReadonlyArray<unknown>) => Promise<{changes: number, lastInsertRowid?: string|number|bigint}>} run
 *   INSERT/UPDATE/DELETE 类写入。返回 RunResultSchema。
 *
 * @property {(sql: string) => Promise<void>} exec
 *   执行任意 SQL 脚本（迁移用，无返回值）。可执行多语句。
 *
 * @property {<T>(fn: (trx: Driver) => Promise<T>) => Promise<T>} transaction
 *   事务回调：fn 接收事务级 driver handle（同接口），抛错则 rollback；返回 fn 的结果。
 *
 * @property {() => Promise<void>} close
 *   关闭连接（测试与优雅停机用）。
 *
 * @property {string} migrationsDir
 *   该 driver 对应的方言 migrations 目录绝对路径。
 *
 * @property {(err: unknown) => boolean} isUniqueViolation
 *   归一化错误识别：当 driver 抛出"唯一约束违反"时返回 true（SQLite SQLITE_CONSTRAINT_UNIQUE / PG 23505）。
 */

module.exports = {};
