// [planner] ID: PLAN-V1.5-A.2 | Date: 2026-05-19 | Description: V1.5-A.2 PostgreSQL Driver 实施计划，等待 CONFIRM

# V1.5-A.2 实施计划 — PostgreSQL Driver

> 触发：backlog 下一档（PLAN_V1.5-A.md 三阶段拆分中的 A.2）
> 前置：A.1（async 重构）已落地 commit `52f4fe4`，SQLite 模式全绿
> 依据：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE
> 关系：本文是 `PLAN_V1.5-A.md` §6 决策表（D1–D8）在 A.2 阶段的细化与现状修正，D1–D8 仍然有效

---

## 1. 当前现状分析

### 1.1 A.1 已交付的 driver 抽象

| 文件 | 状态 |
|---|---|
| `drivers/driverInterface.js` | Driver 契约 JSDoc：`query / run / exec / transaction / close / migrationsDir / isUniqueViolation` |
| `drivers/index.js` | `parseDatabaseUrl` 仅认 `sqlite:`；显式注释「A.2 引入 PG」 |
| `drivers/sqliteDriver.js` | better-sqlite3 的 async 包装 |
| `schemas/driverConfigSchema.js` | discriminated union 当前只有 `sqlite` 分支；注释「A.2 时追加 PG 分支」 |
| `connection.js` | `getDb()` 懒加载单例，按 `DATABASE_URL` dispatch |
| `migrate.js` | 真异步迁移引擎，按 `driver.migrationsDir` 取目录 |

### 1.2 与 PLAN_V1.5-A.md 的现状偏差（需修正）

| PLAN_V1.5-A.md 旧描述 | A.2 实际现状 |
|---|---|
| 「5 个 repository 要改 async」 | A.1 已全部完成；且 v1.3.0 新增的 5 个 Project Assistant repo 一出生就是 async。**A.2 不需要改任何 repository / service / controller** |
| 「migrations/001..005」 | 现有 **7** 个迁移（001–007，006/007 是 v1.3.0 Project Assistant 表） |
| D8「v1.2.0」 | v1.3.0 已发布；A.2/A.3 收口目标顺延为 **v1.4.0** |
| D5「rowToEntity 加 sqlite/pg 分支」 | 见 §3 D-A2-1：有零侵入的更优解 |

### 1.3 JSON 列与时间戳列盘点（A.2 唯一真正的方言难点）

- **JSON 列**（迁移里以 `TEXT` 存、repo 用 `JSON.stringify/parse`）：`agents.tools`、`messages.*`、`traces.*`、`ioor_records`（input/output/tool_calls/observations/token_usage）、`audit_dead_letters.payload`。
- **Project Assistant 5 张表（006/007）无任何 JSON 列**，全是标量 `TEXT/INTEGER` —— A.2 对这部分零风险。
- **时间戳列**：全部为 `created_at/updated_at TEXT`，默认值 `strftime('%Y-%m-%dT%H:%M:%fZ','now')`（SQLite 方言）。
- `migrate.js` 的 `SCHEMA_MIGRATIONS_DDL` 内含 `DEFAULT (datetime('now'))` —— 同样是 SQLite 方言，PG 下会报错，**A.2 必须顺带改成方言中立**。

---

## 2. 修改范围评估

### 2.1 新建文件

| 路径 | 用途 |
|---|---|
| `src/infrastructure/database/drivers/pgDriver.js` | 基于 `pg`（node-postgres）的 Driver 实现 |
| `src/infrastructure/database/migrations/pg/001..007_*.sql` | 7 个 PG 方言迁移 |
| `tests/unit/drivers/pgDriver.test.js` | 占位符重写 / 错误归一化等纯单测（不需真 PG） |
| `tests/integration/postgresAdapter.integration.test.js` | 真 PG 集成测试，无 PG 时 skip |

### 2.2 改动现有文件（全部为「加分支」，不破坏 SQLite 路径）

| 路径 | 改动点 |
|---|---|
| `drivers/index.js` | `parseDatabaseUrl` 增加 `postgres://`/`postgresql://` 解析；`createDriver` 增加 pg 分支 |
| `schemas/driverConfigSchema.js` | `DriverKindSchema` 加 `'postgres'`；新增 `PgConfigSchema`；并入 discriminated union |
| `drivers/sqliteDriver.js` | `MIGRATIONS_DIR` 指向 `migrations/sqlite/`（配合 D-A2-3） |
| `migrate.js` | `SCHEMA_MIGRATIONS_DDL` 改方言中立（去掉 `datetime('now')` 默认，改由代码显式写入或用中立表达式） |
| `migrations/001..007_*.sql` | 物理 `git mv` 进 `migrations/sqlite/`（D-A2-3 选 b 时）；内容不动 |
| `package.json` | 新增运行时依赖 `pg` |
| `.env.example` | 追加 `DATABASE_URL=postgres://user:pass@localhost:5432/xscaffold` 注释示例 |

**估算**：新建 ~11 文件（含 7 个迁移），改动 ~6 文件；**零 repository / service / controller / 既有测试改动**。

### 2.3 pgDriver 关键实现要点

1. **占位符重写**：repo 层 SQL 统一用 `?`；pgDriver 在 `query/run` 内把第 N 个 `?` 重写为 `$N`。
2. **JSONB 读取归一**：见 D-A2-1。
3. **`run` 返回**：`{ changes: result.rowCount, lastInsertRowid: undefined }`（项目所有主键均为代码生成的 `crypto` ID，不依赖自增 → 安全）。
4. **`transaction`**：从 Pool checkout 单个 client，`BEGIN/COMMIT/ROLLBACK` 在同一 client 上执行；`trx` handle 复用该 client。
5. **`exec`**：迁移多语句脚本走 simple query（pg 支持单次多语句、无参数）。
6. **`isUniqueViolation`**：识别 PG 错误码 `23505`。
7. **`close`**：`pool.end()`。

---

## 3. 关键设计决策（待 CONFIRM）

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D-A2-1 | JSONB 读取归一策略 | (a) pgDriver 内用 `pg.types.setTypeParser` 把 JSONB(OID 3802)/JSON(114) 的解析器覆盖为「返回原始文本」→ repo 的 `JSON.parse(row.x)` 对两种 driver 完全一致 (b) 在 ~5 个 repo 的 `rowToEntity` 里加 sqlite/pg 分支 | **(a)**：归一逻辑收敛进 pgDriver 一处，**零 repo 改动、零既有测试改动**；写入侧 `JSON.stringify` 的字符串入 JSONB 列由 PG 自动 text→jsonb 转换，无碍 |
| D-A2-2 | PG 时间戳列类型 | (a) 保持 `created_at TEXT`，默认值用 PG 表达式产出同格式 ISO 串 (b) 改 `TIMESTAMPTZ`，rowToEntity 把 Date 转 ISO | **(a)**：与 SQLite 行为逐字节一致，REST API 响应零差异，避免触碰每个 rowToEntity；AA-SEAC §4.3 只要求「时间戳作独立 SQL 字段」，未强制 TIMESTAMPTZ |
| D-A2-3 | 迁移目录组织 | (a) sqlite 仍扁平 `migrations/` + 新增 `migrations/pg/` 子目录（不对称） (b) 双目录 `migrations/sqlite/` + `migrations/pg/`（落实 PLAN_V1.5-A.md D3） | **(b)**：对称清晰；代价仅一次 `git mv` + sqliteDriver 一行常量改动 |
| D-A2-4 | JSONB GIN 索引范围（AA-SEAC §4.3 要求） | (a) 仅 `ioor_records` 的检索热点列（input/output/tool_calls/observations） (b) 全部 JSONB 列 | **(a)**：IOOR 是 §4.3 点名的审计检索域；其余 JSON 列（agents.tools 等）无按内容检索需求，建 GIN 是浪费 |
| D-A2-5 | PG 集成测试运行方式 | (a) 测试检测到无 `DATABASE_URL=postgres` 时 `describe.skip`，A.2 阶段本地 `docker run postgres:16` 手动验证 (b) A.2 就接 testcontainers | **(a)**：CI 矩阵是 A.3 的范围；A.2 保持「本地 docker 跑通」即可，符合 PLAN_V1.5-A.md §4 里程碑 M1.5-A.2.A |
| D-A2-6 | 占位符重写实现 | (a) 朴素计数式 `?`→`$N`（本仓库 SQL 全部受控、无字符串字面量含 `?`） (b) 带引号扫描的安全重写 | **(a)** + 加一个单测断言；本仓库 SQL 均为参数化语句，朴素实现足够，过度工程化无收益 |

---

## 4. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解 |
|---|---|---|
| SQLite 路径被回归破坏 | 低 | A.2 全部改动是「加 PG 分支」；A.2 完成后必须先验 SQLite 全套测试仍 464/464 |
| `migrate.js` DDL 去 SQLite 默认值后影响 SQLite | 低 | 改为代码显式写 `applied_at` 或用 `CURRENT_TIMESTAMP`（两库都支持）；单测覆盖 |
| 朴素 `?`→`$N` 误伤 | 低 | D-A2-6 加守卫单测；本仓库 SQL 受控 |
| 写入 JSONB 列的字符串被 PG 拒（非法 JSON） | 低 | repo 写入侧统一 `JSON.stringify`，产物恒为合法 JSON |
| pg Pool 在测试 `closeDb()` 未释放 → jest 挂起 | 中 | pgDriver.close = `pool.end()`；集成测试 afterAll 显式 close |

---

## 5. 验收标准（A.2 DoD）

- [ ] `DATABASE_URL=sqlite::memory:` 跑全套测试仍 **464/464** 全绿
- [ ] 本地 `docker run postgres:16` + `DATABASE_URL=postgres://...` 下 `npm run migrate` 跑到 head（7 迁移全过）
- [ ] PG 集成测试覆盖：agent UNIQUE 冲突仍抛 `ConflictError`、IOOR JSONB 往返一致、事务 rollback 生效
- [ ] `\d ioor_records` 显示 input/output/tool_calls/observations 为 `jsonb` 且 GIN 索引就位
- [ ] `npm run lint` 仍 0 error；覆盖率仍 ≥ 80%
- [ ] 无 PG 环境时集成测试 skip 而非 fail（CI 当前不受影响）

---

## 6. 阶段产出与 commit

A.2 为单一 commit（沿用阶段化 commit 节奏）：`feat(db): PostgreSQL driver + pg migrations (V1.5-A.2)`。
CHANGELOG / README / CI 矩阵 / tag 留给 A.3 一并收口为 **v1.4.0**。

**附加问题**

1. **SPEC 阶段产物**：A.2 唯一的新契约是 `PgConfigSchema`（扩 `driverConfigSchema.js`）。是否同意 SPEC 阶段就只交付这一处 Zod 契约改动后直接进 CODE？（建议：是）
2. **`pg` 版本**：锁 `pg@^8`（当前稳定大版本）。是否同意？（建议：是）
3. **A.2 完直接连推 A.3**，还是 A.2 commit 后停下等你 review？（建议：A.2 后停一下，因为需要你本地有 docker/PG 才能真正验收 PG 路径）

---

## 7. 一句话总结

A.1 已把全栈 async 啃完，A.2 是相对机械的「纯增量」工作：新增 `pgDriver` + 7 个 PG 迁移 + dispatch 分支，**不触碰任何业务代码与既有测试**。最大的设计巧思是 D-A2-1——用 pg 类型解析器覆盖把 JSONB 归一成文本，让 repo 层对两种数据库完全无感。

**请回复 CONFIRM（可附 D-A2-1 ~ D-A2-6 及附加问题的调整）后进入 SPEC/CODE。**
