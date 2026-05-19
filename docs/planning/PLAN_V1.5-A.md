// [planner] ID: PLAN-V1.5-A | Date: 2026-05-19 | Description: V1.5-A PostgreSQL 适配器计划，等待 CONFIRM

# V1.5-A 实施计划 — PostgreSQL 适配器

> 触发：PROJECT_CLOSURE §5 backlog 中优先级 #3（V1.5）
> 依据：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE
> 范围：在保持 SQLite 默认能跑的前提下，新增 PG 驱动；通过 `DATABASE_URL=postgres://...` 切换

---

## 1. 当前现状

### 1.1 数据库相关代码盘点

| 模块 | 位置 | API 模式 |
|---|---|---|
| 连接抽象 | `src/infrastructure/database/connection.js` | 硬编码 `require('better-sqlite3')`，仅识别 `sqlite:` 协议 |
| 迁移引擎 | `src/infrastructure/database/migrate.js` | 同步：`db.exec` / `db.prepare().run()` |
| 迁移 SQL | `src/infrastructure/database/migrations/001..005_*.sql` | **SQLite 方言**：`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` / `TEXT` 存 JSON |
| Repository 层 | `src/agentManager/agentRepository.js`<br>`src/memoryManager/memoryRepository.js`<br>`src/observability/ioorRepository.js`<br>`src/observability/traceRepository.js`<br>`src/domain/audit/auditRepository.js` | 全部使用 `conn.prepare(sql).get()/all()/run()`（**better-sqlite3 同步 API**） |
| Service 层 | 例 `agentService.js` | **同步消费**：`const agent = repository.findById(id)` 无 `await` |
| Controller 层 | 例 `agentController.js`（未细看） | 沿用 service 同步 → res.json |

### 1.2 ⚠️ 关键诚实声明 — PROJECT_CLOSURE §5 的承诺不准确

PROJECT_CLOSURE 写："PostgreSQL 适配器（**Repository 抽象已就位，零代码改动**）"。

**实际**：Repository 抽象只在 **DI 注入点** 就位（service 接收 `repository` 参数），但 **方法契约是同步的**。node-postgres (`pg`)、postgres.js、@neondatabase/serverless 等主流 PG 驱动都是 **Promise-based async**。要切 PG 不可能"零代码改动"。

可选路径只有三条，且都有代价：

| # | 路径 | 评价 |
|---|---|---|
| α | **全栈 async 重构** — 把 5 个 repository × 所有 service × 所有 controller 改成 `async/await` | 工作量中等（Express handler 本身支持 async）；架构清洁；**SQLite 继续可用**（async wrapper 包同步调用，零运行时差异） |
| β | **sync-over-async hack** — 用 `deasync` / worker_thread 把 pg 包成同步 façade | 阻塞 event loop、违反 Node 范式、生产不可用、**强烈反对** |
| γ | **双轨**：SQLite 走原同步路径，PG 走另一套 async 路径，service 层用 env 分派 | 业务代码必须同时维护两套 → 不可持续；**反对** |

**推荐 α**。本 PLAN 以 α 为基础设计。

### 1.3 SQL 方言差异

| SQLite 现状 | PG 等价 | 是否需 migration 适配 |
|---|---|---|
| `TEXT` 存 JSON（`tools` / `input` / `output` / ...） | `JSONB`（**AA-SEAC §4.3 显式要求**） | 是 |
| `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` 默认值 | `TIMESTAMPTZ DEFAULT now()` | 是 |
| `created_at TEXT` ISO 字符串 | `TIMESTAMPTZ` | 是；`rowToEntity` 需要把 Date 对象转 ISO |
| `INSERT ... VALUES (?, ?, ...)` 位置参数 | `$1, $2, ...` | 是（驱动层差异） |
| `SQLITE_CONSTRAINT_UNIQUE` 错误码识别 | PG `23505` `unique_violation` | 是 |
| `db.transaction(() => {...})()` 同步事务 | `BEGIN/COMMIT/ROLLBACK` async | 是 |
| `PRAGMA journal_mode=WAL` / `foreign_keys=ON` | 无需（PG 默认） | 是（驱动层跳过） |

### 1.4 测试现状

- 全部 jest 测试用 `sqlite::memory:`（`tests/setup.js` 默认 + repository 测试用 `bootSystem()` 工厂）
- 372 个用例全部依赖**同步**断言：`expect(repository.findById(id)).toEqual(...)`
- 若 α 重构，所有这些都要改 `await` —— 影响面是 **5 个 repository × ~80 个相关测试**

---

## 2. 修改范围评估

### 2.1 新建文件

| 路径 | 用途 | 阶段 |
|---|---|---|
| `src/infrastructure/database/drivers/sqliteDriver.js` | 抽离现 better-sqlite3 逻辑，包装为 async API | A.1 |
| `src/infrastructure/database/drivers/pgDriver.js` | 基于 `pg`（node-postgres）的 async 实现 | A.2 |
| `src/infrastructure/database/drivers/index.js` | 按 `DATABASE_URL` 协议分派 | A.1 |
| `src/infrastructure/database/queryBuilder.js`（可选） | 占位符差异 `?` ↔ `$1` 自动重写 | A.2 |
| `src/infrastructure/database/migrations/pg/001..005_*.sql` | PG 方言的迁移 SQL | A.2 |
| `tests/unit/drivers/sqliteDriver.test.js` | SQLite driver 单测 | A.1 |
| `tests/integration/postgresAdapter.integration.test.js` | PG 集成测试（**需 testcontainers** 或 docker compose） | A.2 |
| `docs/planning/PLAN_V1.5-A.md` | 本文件 | — |
| `.env.example` 追加 `DATABASE_URL=postgres://...` 示例 | 文档 | A.2 |

### 2.2 改动现有文件

| 路径 | 改动点 | 阶段 |
|---|---|---|
| `src/infrastructure/database/connection.js` | 替换为 driver dispatch；`getDb()` 返回 driver 实例（暴露 async `query/run/transaction`） | A.1 |
| `src/infrastructure/database/migrate.js` | 改 async；按 driver 选择 migrations 目录（sqlite/pg）；事务 async | A.1 + A.2 |
| `src/agentManager/agentRepository.js` | 全部方法改 async；用 driver API 替换 better-sqlite3 直调 | A.1 |
| `src/memoryManager/memoryRepository.js` | 同上 | A.1 |
| `src/observability/ioorRepository.js` | 同上 | A.1 |
| `src/observability/traceRepository.js` | 同上 | A.1 |
| `src/domain/audit/auditRepository.js` | 同上 | A.1 |
| `src/agentManager/agentService.js` | 5 个方法改 async + 内部 await | A.1 |
| `src/memoryManager/memoryService.js`（推测） | 同上 | A.1 |
| `src/workflowEngine/workflowExecutor.js` | trace/IOOR 写入处加 await（已 async 函数体内） | A.1 |
| `src/workflowEngine/nodeRunner.js` | 同上 | A.1 |
| `src/observability/ioorRecorder.js` | insert 调用加 await | A.1 |
| `src/observability/traceCollector.js` | insert 调用加 await | A.1 |
| `src/apiGateway/controllers/*.js`（4-5 个） | controller 改 async；res.json(await service.xx(...)) | A.1 |
| `src/apiGateway/server.js` | `buildDependencies` 改 async；启动序列 await migrate | A.1 |
| `tests/unit/*Repository.test.js`（5 个） | 全部 `await repository.xxx()` | A.1 |
| `tests/integration/*.test.js`（多个） | 同上 | A.1 |
| `tests/e2e/*.test.js`（多个） | 同上；用 supertest 本身就是 async OK | A.1 |
| `package.json` | 新增 `pg` 运行时依赖 + 可选 `testcontainers` devDep | A.2 |
| `.github/workflows/ci.yml` | 新增 `postgres:16` service container；矩阵 [sqlite, postgres] | A.2 |
| `CHANGELOG.md` | v1.2.0 条目（涉及破坏性接口契约 → 推荐 minor bump 而非 patch） | A.2 |

**估算总改动**：约 **30+ 文件**，~600 行净改动（大量是加 `async`/`await` 关键字 + 测试调整）。

### 2.3 关键设计决策

#### D1 — 异步策略
**唯一推荐 α（全栈 async 重构）**。其余两条已在 §1.2 反对。但需要你 ACK 这个范围（这是本 PLAN 最大的"惊喜"）。

#### D2 — PG 驱动选择

| 选项 | 评价 |
|---|---|
| **(a) `pg` (node-postgres)** ⭐ | 业界标准，下载量最大，社区最活跃，Pool 内建；**推荐** |
| (b) `postgres` (porsager/postgres) | API 更现代但下载量小；与 pg 性能差异不大 |
| (c) `@neondatabase/serverless` | 边缘 / serverless 场景；本项目不需要 |

#### D3 — 迁移文件组织

| 选项 | 评价 |
|---|---|
| (a) 单一目录 + 占位符在 SQL 里区分 | 难维护 |
| **(b) 双目录 `migrations/sqlite/` + `migrations/pg/`** ⭐ | 清晰；driver 自带 `migrationsDir`；**推荐** |
| (c) 引入 `node-pg-migrate` / `umzug` 重写迁移引擎 | 引入大依赖；当前简化引擎够用 |

#### D4 — Driver 抽象 API 表面

最小集：

```js
interface Driver {
  query(sql, params): Promise<{ rows: object[] }>
  run(sql, params):   Promise<{ changes: number, lastInsertRowid?: string }>
  transaction(fn):    Promise<T>   // fn 接收同 driver 的 trx handle
  close():            Promise<void>
  migrationsDir:      string
  isUniqueViolation(err): boolean   // 统一错误识别
}
```

Repository 不再调 `prepare(...)` —— 直接 `await driver.query(sql, params)`。SQL 用占位符 `?`（sqliteDriver 直传，pgDriver 自动转 `$1, $2, ...`）。

#### D5 — JSONB vs TEXT 适配

| 选项 | 评价 |
|---|---|
| (a) PG 也用 TEXT 存 JSON 字符串 | 放弃 AA-SEAC §4.3 JSONB 优势；不推荐 |
| **(b) PG 用 JSONB + GIN 索引（AA-SEAC §4.3 原意）** ⭐ | **推荐**；rowToEntity 加分支：sqlite 走 JSON.parse / pg 直接拿对象 |

#### D6 — CI PostgreSQL 测试

| 选项 | 评价 |
|---|---|
| (a) GitHub Actions `services: postgres:16` | 标准做法；快；**推荐** |
| (b) `testcontainers-node` | 本地与 CI 一致；启动慢 |
| (c) `pg-mem`（内存版 PG 模拟） | 不完整；遇到 JSONB / 真实事务行为可能差异；不推荐 |

CI 矩阵：`[sqlite::memory:, postgres://localhost:5432/test]`，两套都跑全套测试。

#### D7 — 阶段拆分 vs 一次性

| 选项 | 评价 |
|---|---|
| (a) 单 PR 一次性 = A.1 (async) + A.2 (pg) + A.3 (CI) | 改动 30+ 文件，review 痛苦；commit 不可拆段验证 |
| **(b) 拆 3 个 PR**（A.1 → A.2 → A.3） ⭐ | **推荐**；A.1 完成后 SQLite 行为不变可单独 release；A.2 加 PG 驱动；A.3 CI 矩阵 |

**A.1 单 PR 范围**（无功能新增，纯架构重塑）：
- driver 抽象 + sqliteDriver 实现
- 5 个 repository + 所有 service/controller 改 async
- 所有相关测试改 await
- 验证：SQLite 模式所有测试仍 372/372 全过

**A.2 单 PR 范围**：
- pgDriver 实现 + pg 依赖
- migrations/pg/ 目录 + 5 个 SQL 适配
- 一个手工集成测试（暂用 docker run 本地）

**A.3 单 PR 范围**：
- ci.yml 矩阵 + postgres service
- CHANGELOG v1.2.0
- README 更新（DATABASE_URL=postgres 示例）

#### D8 — 版本号

| 选项 | 评价 |
|---|---|
| (a) v1.1.2（patch） | 改动是 contract-breaking（repo 同步→异步）；不合 SemVer |
| **(b) v1.2.0（minor） + 在 A.3 发布** ⭐ | **推荐**；新增 PG 能力是 feat，repo 契约变化属 internal-only（外部 REST API 不变） |
| (c) v2.0.0（major） | 外部 REST API 兼容；不必 major |

---

## 3. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解 |
|---|---|---|
| `await` 漏加导致 silently 拿到 Promise → 业务挂 | **高** | A.1 阶段在 CI 加 `eslint-plugin-promise` 的 `no-misused-promises` / `require-await`；review 重点 |
| jest 测试同步断言改 async 一处遗漏 | **高** | A.1 全部测试在本地+CI 跑一遍；mocha-style 的同步 expect 立刻报错 |
| Express middleware 链路上的同步 throw 在 async 函数内被吞 | 中 | 已有全局 errorHandler 兜底；Express 5 原生支持 async；Express 4 需要确认 `express-async-errors` 是否引入 |
| pg 默认时区返回 Date 对象 vs SQLite 返回 ISO 字符串 → API 响应差异 | 中 | rowToEntity 统一序列化为 ISO；加 unit 测试覆盖 |
| pg 字段名大小写敏感（默认小写）→ 现有 SQL `created_at` 已是 snake_case 所以 OK | 低 | 全量 SQL grep 检查 |
| 并发请求下 pg Pool 耗尽 → 504 | 中 | Pool size 配置项 `PG_POOL_MAX=10`；CI 加压测 |
| 现有 perf benchmark（autocannon）只压 SQLite，无 PG 基线 | 中 | A.3 把 PG 基线纳入 `npm run bench` |
| 既有 `npm run migrate` 同步 CLI 改 async；CI/Husky 调用方需要 await | 低 | CLI 入口 `await migrate().then(...)` |

---

## 4. 实施顺序与里程碑

```
A.1 (async refactor) ─────► commit + tag v1.2.0-rc.1  (SQLite 全绿，PG 未引入)
                            ▼
A.2 (pgDriver + migrations) ► commit （本地 docker pg 跑通；CI 暂不集成）
                            ▼
A.3 (CI service container + docs) ► commit + tag v1.2.0
```

**里程碑**：
- **M1.5-A.1.A**：5 个 repo + 所有 service 改 async；372 测试在 SQLite 模式全绿
- **M1.5-A.2.A**：pgDriver 实现完整；本地 `docker run postgres:16` 启动后 `DATABASE_URL=postgres://...` 跑全套 jest 通过
- **M1.5-A.3.A**：CI 矩阵跑通；CHANGELOG v1.2.0；tag

---

## 5. 验收标准（DoD，全 3 阶段完成后）

- [ ] `DATABASE_URL=sqlite::memory:` 跑全套测试 372/372 全过
- [ ] `DATABASE_URL=postgres://localhost:5432/test` 跑全套测试同样全过
- [ ] CI 矩阵两套 driver 都绿
- [ ] `npm run migrate` 在两种 driver 下都能跑到 head
- [ ] `agentRepository.create()` 在 PG 中触发 UNIQUE 冲突时仍抛 `ConflictError`
- [ ] IOOR 在 PG 中 `input` / `output` / `tool_calls` 字段类型为 `JSONB`（用 `\d ioor_records` 验证）
- [ ] PG IOOR `idx_ioor_execution` 等索引就位
- [ ] `READ:` 现有 REST API 响应格式无变化（DATE 字段统一 ISO）
- [ ] 覆盖率仍 ≥ 80%
- [ ] `npm run lint` 仍 0 error
- [ ] CHANGELOG v1.2.0 完整
- [ ] README + docs/api.md 注明 `DATABASE_URL` 支持两种协议

---

## 6. 待 CONFIRM 的决策点

| # | 决策 | 推荐 |
|---|---|---|
| D1 | 异步策略 | **α 全栈 async 重构**（唯一靠谱路径，承认 PROJECT_CLOSURE 承诺不准确） |
| D2 | PG 驱动 | **`pg` (node-postgres)** |
| D3 | 迁移文件组织 | **双目录 `migrations/sqlite/` + `migrations/pg/`** |
| D4 | Driver API 表面 | `query / run / transaction / close / migrationsDir / isUniqueViolation` 最小集 |
| D5 | JSON 字段存储 | **PG 用 JSONB + GIN（AA-SEAC §4.3 原意）** |
| D6 | CI PG 测试方式 | **GitHub Actions `services: postgres:16`** |
| D7 | 阶段拆分 | **拆 3 个 PR：A.1 (async 重构) → A.2 (pgDriver) → A.3 (CI 矩阵 + release)** |
| D8 | 版本号 | **v1.2.0 minor（在 A.3 发布）；A.1 完成后可打 rc.1 内部 tag** |

**附加问题**：

1. **范围 ACK** — α 涉及 30+ 文件改动 + ~600 行净增/改。这与你"渐进可测试"偏好一致，但比之前任何 P 阶段都大。是接受拆 3 PR、还是缩范围（例如**只做 A.1 async 重构**先发 v1.2.0，A.2/A.3 推到 V1.5-B）？

2. **现状文档修正** — 是否在 A.1 commit 内顺便修正 PROJECT_CLOSURE §5 的"零代码改动"措辞？（推荐**否**：PROJECT_CLOSURE 是 v1.1.0 收口时的快照，应保持历史；改在 CHANGELOG v1.2.0 里写清楚"原 backlog 描述与实际工作量评估差异"。）

3. **express-async-errors** 是否引入？v1.1.0 时 Express 是 4.19，async error 需要 `express-async-errors` 或手动 try/catch + next(err) 兜底。建议**引入 `express-async-errors`**，一行 import 就解决，零侵入。

4. **本期顺手做的小修**：A.1 改 controller 时如发现非 async 相关的小 bug 是否就地修？建议**否**：保持本 PR 仅 async 重构；其他 bug 单开 issue。

5. **是否在 A.1 引入 eslint 规则强制**：`require-await` / `no-floating-promises` / `no-misused-promises`（来自 `eslint-plugin-promise`）。建议**是**：异步重构最大的 silent 风险就是漏 await，lint 兜底成本极低。

---

## 7. 一句话总结

V1.5-A 不是 PROJECT_CLOSURE 想象中的 "零代码改动 driver 切换"，而是 **一次有计划的全栈 async 重构 + PG 适配**。推荐拆 3 PR 渐进推进；A.1（async 重构，SQLite 保持工作）是真正的硬骨头，啃下来后 A.2/A.3 是相对机械的工作。

**请回复 CONFIRM（可附 D1–D8 + 附加问题 1–5 的调整）后进入 SPEC/CODE。**

如范围超预期，可选：

- **范围缩减选项 R1**：仅 A.1（async 重构），发 v1.2.0；A.2/A.3 拆 V1.5-B 后续做
- **范围缩减选项 R2**：仅 A.2（pg driver 但不重构 service/controller）—— 实际上做不到，因为 repo 必须改 async
- **范围扩张选项 X1**：A.1 + A.2 + A.3 + 顺手做 BullMQ #4（V1.5-B），统一打 v1.2.0 —— 不推荐，PR 过大
