# Changelog

> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [1.7.0] - 2026-05-20

### 🪣 V1.5 IOOR 批量缓冲

把 IOOR 写入从「每 turn 一次同步 INSERT + 一次 SELECT 回读」改为「内存有界缓冲 + 五重触发 flush」，降低高并发工作流下的写放大。**同步修订 AA-SEAC §4.2** 「全量流式记录」为允许有界缓冲窗口，并显式声明非受控崩溃下的 bounded loss window。

阶段开发记录见 `docs/planning/PLAN_V1.5-IOOR-BATCH.md`。

### ⚠️ Semantic Change（非 REST API 破坏，但需运维知悉）

- **IOOR 不再「写即落盘」**：`record()` 改为入队内存缓冲并立即返回 in-memory 记录。落盘由五个触发点之一决定：
  1. 累计达 `IOOR_BATCH_SIZE`（默认 50 条）
  2. 定时扫描 `IOOR_BATCH_INTERVAL_MS`（默认 1000 ms）
  3. **execution 完成**：`workflowController.runOne` 在 `markFinal` 后立即 flush 该 execution
  4. **读路径 lazy flush**：HTTP `/workflows/executions/:id/trace` 查询前 flush 该 execution
  5. **受控 shutdown**：`SIGTERM/SIGINT` 触发 `await ioorRecorder.close()`（先 HTTP 停 → 再 queue 关 → 再 IOOR flush）
- **bounded loss window（诚实声明）**：受控路径覆盖以上 5 个时机；但**非受控崩溃（`kill -9` / 宿主机掉电 / OOM Kill）下最多丢失一个缓冲窗口（默认 ≤50 条 / ≤1000 ms）的 IOOR 记录**。这是性能与「实时全量」之间的明确权衡，详见 AA-SEAC §4.2 修订与文末「规范修订日志」。

### Added
- `src/observability/ioorBuffer.js` — 内存批量缓冲核心，`Map<execId, records[]>` 分组；`push / flush(id) / flushAll / close / size`；定时器 `unref` 不阻塞退出
- `src/observability/schemas/ioorBufferConfigSchema.js` — `batchSize / intervalMs` Zod 契约（默认 50 / 1000 ms）
- `src/observability/ioorRepository.js` 新增 `insertMany(records)` —— 多行 VALUES，含 `created_at`；内部按 ≤200 行/SQL 分块兜底 SQLite/PG 占位符上限
- 环境变量：`IOOR_BATCH_SIZE` / `IOOR_BATCH_INTERVAL_MS`；`.env.example` 含风险提示
- `deps.ioorRecorder` 暴露：修复此前 `buildDependencies()` 创建了 recorder 但未在返回的 deps 中暴露的遗漏，使 `workflowController` / trace lazy flush / `main.js` shutdown 共用同一实例

### Changed
- `ioorRecorder.record()`：脱敏与契约校验通过后生成 `id + createdAt` 推入缓冲并**立即返回 in-memory 记录**，不再产生同步 SQL；契约校验失败仍即时走 audit 死信（per-record 失败 ≠ 批量 flush 失败）
- `ioorRecorder` 新增 `flush(executionId?) / close()` 委托 buffer
- `workflowController.runOne`：`markFinal` 后立即 `await deps.ioorRecorder.flush(executionId)`
- `observabilityController` trace 路由：`listByExecution` 前 lazy `flush(req.params.id)`
- `main.js` 优雅停机第三步：`await deps.ioorRecorder.close()`（含 `flushAll`）；同时把 `gracefulCloseQueue` 重命名为 `gracefulShutdown` 统一收尾

### Fixed
- `flush` 失败兜底（D-IOOR-5）：bulk insert 抛错时整批进 `audit_dead_letters`（`source: 'ioor.batch'`, `payload: records[]`），「凡动必留痕」的最低保障

### Docs / Spec
- **AA-SEAC §4.2「全量流式记录」修订**：「实时全量持久化」改为「原子单位 + 可配置的 ≤N 条 / ≤T ms 有界缓冲窗口 + 受控路径强制 flush + flush 失败必须进 `audit_dead_letters`」
- AA-SEAC 文末新增「规范修订日志」段，V1.5 修订记录含 bounded loss window 的诚实声明

### Quality
- 测试：8 个 `ioorBuffer` 单测（触发条件 / 死信兜底 / 构造校验）+ `ioorRecorder.test` 7 个用例改 `await flush` + 1 新用例覆盖「`batchSize` 自动 flush」+ `agentNodeIntegration` IOOR 2 用例补 `await flush`
- 本地门禁：524 passed / 15 skipped / 0 failed；`npm run lint` 0 error

### Release Gate
- 沿用纪律：**tag `v1.7.0` 推迟到 CI 通过后再打**

---

## [1.6.0] - 2026-05-20

### 🔒 V1.1.2 `/metrics` 强制鉴权

兑现 `PLAN_V1.1.md` / 历史 CHANGELOG / `SECURITY_AUDIT.md` 早已公开的承诺——`/metrics` 端点从「匿名 + 可选 token」收紧为「生产强制 token」，并把 token 比对改为恒定时间，消除时序侧信道。

阶段开发记录见 `docs/planning/PLAN_V1.1.2.md`。

### ⚠️ BREAKING CHANGES

- **`/metrics` 在生产环境强制 `METRICS_TOKEN`**：当 `NODE_ENV=production` 且 `METRICS_TOKEN` 未设置或为空值（空字符串 / 纯空白同样视为未配置）时，**进程启动即失败**（fail-fast）。
  - 升级后生产部署若未配置该变量将无法启动。
  - **迁移**：
    1. 生成 token：`openssl rand -hex 32`
    2. 配置环境变量 `METRICS_TOKEN=<生成的值>`
    3. 更新 Prometheus 抓取配置：
       ```yaml
       scrape_configs:
         - job_name: xscaffold
           authorization:
             credentials: <METRICS_TOKEN>   # 即 Authorization: Bearer <token>
       ```
       或使用兼容头 `x-metrics-token: <token>`
- **非生产环境行为不变**：`NODE_ENV !== production` 且未配置 token 时 `/metrics` 仍匿名可访问，仅多打一条 `warn` 日志——开发/测试零摩擦。

### Added
- `src/infrastructure/security/timingSafe.js` — `timingSafeStringEqual(a, b)` 恒定时间字符串比对 helper
- `/metrics` 鉴权支持标准 `Authorization: Bearer <token>` 头（scheme 大小写兼容）

### Changed
- `guardToken`（`observabilityController.js`）：
  - 移除「`METRICS_TOKEN` 未配置即匿名放行」分支
  - token 比对从 `!==` 改为 `timingSafeStringEqual`
  - 严格 Bearer 解析：仅接受 `Bearer <单段 token>`；`Authorization` 头一旦出现即走 Bearer 路径，格式非法**不**回退到 `x-metrics-token`（避免双头语义含糊）；单独 `x-metrics-token` 头继续兼容
- `webhookSignature.verifySignature`：内联 `crypto.timingSafeEqual` 改用共用 `timingSafeStringEqual` helper（消除重复）
- `.env.example` / `README.md`：`METRICS_TOKEN` 标注「生产必填」并附 Prometheus 抓取示例

### Security
- `SECURITY_AUDIT.md`：A01「无意暴露 `/metrics`」MEDIUM → ✅ RESOLVED；新增 §8 修复说明；评级 MEDIUM 项 3 → 2

### Quality
- 测试：7 个 `timingSafe` 单测 + `observability.e2e` 新增 8 个 `/metrics` 鉴权用例（错值 / Bearer / 大小写 / 非法格式不回退 / 生产 fail-fast）
- 本地门禁：514 passed / 15 skipped / 0 failed；`npm run lint` 0 error

---

## [1.5.0] - 2026-05-20

### 🧵 V1.5-B BullMQ + Redis 持久化队列

在保留内存队列默认可跑的前提下，新增 BullMQ + Redis 持久化队列。通过 `QUEUE_DRIVER=bullmq` + `REDIS_URL` 切换；内存队列仍是默认路径。补齐此前缺失的持久化、重试、并发上限与独立 job 状态查询。

复用 V1.5-A 确立的「适配器 + dispatch」与「CI 真验收 + 发布门禁」两个范式。零 repository / executor / workflow 业务逻辑改动。

阶段开发记录见 `docs/planning/PLAN_V1.5-B.md`。

#### Added
- **`src/infrastructure/queue/bullmqAdapter.js`** — 基于 `bullmq` + `ioredis` 的队列适配器：
  - per-name 懒建 `Queue` / `Worker`
  - BullMQ 内部状态（waiting/active/completed/failed/...）经单一映射表归一为契约状态（PENDING/RUNNING/SUCCESS/FAILED）
  - Worker `completed` / `failed` 事件桥接到契约的 `onJobComplete` 回调
  - `close()` 按 `worker → queue → connection` 顺序释放，杜绝 ioredis 句柄泄漏
  - `attempts`（重试）/ `concurrency`（并发）从配置注入
- **`src/infrastructure/queue/index.js`** — `parseQueueConfig` + `createQueue` 工厂：按 `QUEUE_DRIVER` 显式 dispatch；`bullmq` 缺 `REDIS_URL`/`REDIS_TEST_URL` 即拒
- **`src/infrastructure/queue/schemas/queueConfigSchema.js`** — `QueueConfigSchema`（memory/bullmq discriminated union）
- 环境变量：`QUEUE_DRIVER`（默认 `memory`）/ `QUEUE_CONCURRENCY`（默认 5）/ `QUEUE_MAX_ATTEMPTS`（默认 1，不重试）；`.env.example` 补说明
- 依赖：`bullmq@^5`（含 `ioredis`）
- CI 新增 `test-redis` job：`services: redis:7` + `REDIS_TEST_URL`，与 `test-postgres` 平行
- 测试：18 个 `bullmqAdapter` 单测（状态映射 / dispatch 配置解析）+ 6 个 BullMQ 集成测（enqueue→worker→getJob 流转 / 失败映射 / onJobComplete / 持久化跨连接），用独立 env `REDIS_TEST_URL` 触发，未设置 → 整 suite skip

#### Changed
- **队列契约统一异步化**：`enqueue` / `getJob` / `close` 改 async。`inMemoryAdapter` 内部逻辑不变，仅包 async 壳；BullMQ 原生异步
- 涟漪极小：仅 `workflowController.triggerExecute` / `webhookController.handleGithub` 两处 `enqueue` 加 `await`
- `server.js` `buildDependencies` 用 `createQueue(parseQueueConfig())` 替换裸 `createInMemoryAdapter()`；`app.locals.deps` 暴露依赖供停机使用

#### Fixed
- `src/main.js` 优雅停机补全：此前 `SIGTERM`/`SIGINT` 只 `server.close()`，内存 job 直接丢弃且队列资源未释放。现改为「先停 HTTP 收新请求 → 再 `await queue.close()` 等在途 job」，并保留 10s 硬超时兜底

#### Quality
- 本地门禁：500 passed / 15 skipped（PG 9 + Redis 6，本地无对应服务）/ 0 failed
- `npm run lint` 0 error；`npm audit` 引入 bullmq 后仍 0 high+

#### Release Gate
- 沿用 V1.5-A.3 纪律：**tag `v1.5.0` 推迟到 CI `test-redis` job 实际通过后再打**

---

## [1.4.0] - 2026-05-20

### 🐘 V1.5-A PostgreSQL 适配器

打通存储层 driver 抽象 → PG 驱动 → CI 真实 PG 验收。`DATABASE_URL` 现支持 `sqlite:` / `postgres://` 双协议；REST API 响应格式与现网行为零差异；SQLite 仍是默认路径。

落地节奏分三阶段：A.1 全栈 async 重构 → A.2 pgDriver 与 PG 迁移 → A.3 CI 矩阵与发布收口。

阶段开发记录见 `docs/planning/PLAN_V1.5-A.md` / `PLAN_V1.5-A.2.md` / `PLAN_V1.5-A.3.md`。

---

### A.1 — async repository contract（commit `52f4fe4`）

**目标**：把所有 repository / service / controller 改为 async/await 契约，为引入 PG（async-only 驱动）扫清架构障碍。

#### Changed
- `src/infrastructure/database/drivers/` 引入 driver 抽象层：`driverInterface.js`（JSDoc 契约）+ `sqliteDriver.js`（better-sqlite3 的 async 包装）+ `index.js`（按 `DATABASE_URL` 协议 dispatch）
- `connection.js` `getDb()` 返回 Driver 实例（暴露 `query / run / exec / transaction / close / migrationsDir / isUniqueViolation`），不再裸暴露 better-sqlite3
- `migrate.js` 改真异步：`driver.exec` 应用迁移；事务式 INSERT `schema_migrations`
- 5 个既有 repository（agent / memory / ioor / trace / audit）方法签名改 async；service / controller 链路全部加 `await`
- `schemas/driverConfigSchema.js` 用 Zod discriminated union 定义 `DriverConfigSchema`

#### Tests
- 全部 repository 单测与集成测改 `await ...` 形式，与 async 契约对齐
- A.1 完成时 SQLite 模式 372 → 拓展期间稳定增长，保留全部既有覆盖

---

### A.2 — PostgreSQL driver + 方言迁移（commit `18413c4`）

**目标**：在 A.1 契约之上落 pgDriver，使 PG 与 SQLite 行为对 repository 层完全透明。

#### Added
- **`src/infrastructure/database/drivers/pgDriver.js`** — 基于 `pg` (node-postgres) 8.x 的 async Driver 实现：
  - `?` → `$N` 占位符朴素重写（本仓库 SQL 全部参数化）
  - `pg.types.setTypeParser(JSON / JSONB, identity)` 覆盖 → JSONB 列读出仍为字符串，repo 层 `JSON.parse(row.x)` 对两库通用，**零 repository 改动**
  - `transaction(fn)`：从 Pool checkout 单 client，`BEGIN / COMMIT / ROLLBACK` 在同 client 上执行；ROLLBACK 失败仅 warn，原错误优先
  - `isUniqueViolation`：识别 PG `23505` `unique_violation`
- **`src/infrastructure/database/migrations/pg/` — 8 个 PG 方言迁移**：
  - `000_init_helpers.sql` — `xs_iso_now()` 函数，输出与 SQLite `strftime('%Y-%m-%dT%H:%M:%fZ','now')` 二进制等价
  - `001..007` — agents / executions / messages / node_traces / ioor_records & audit_dead_letters / pa_* / external_agent_calls
  - JSON 列改 `JSONB`；时间戳列保持 `TEXT + xs_iso_now()` 默认（避免触碰每个 rowToEntity）
  - **AA-SEAC §4.3**：`ioor_records` 的 `input / output / tool_calls / observations` 4 列建 GIN 倒排索引
- `DriverKindSchema` 扩 `['sqlite', 'postgres']`；新增 `PgConfigSchema`（`connectionString` + 可选 `poolMax`）并入 discriminated union
- `drivers/index.js` 按 `postgres://` / `postgresql://` 识别协议；可选 `PG_POOL_MAX` 环境变量
- `.env.example` 双协议示例 + `PG_POOL_MAX` 说明
- 依赖：`pg@^8`

#### Changed
- 现 7 个 SQLite 迁移 `git mv` 进 `migrations/sqlite/`；`sqliteDriver.MIGRATIONS_DIR` 指向新位置
- `migrate.js` `SCHEMA_MIGRATIONS_DDL` 改方言中立（`CURRENT_TIMESTAMP` 替换 SQLite 专属 `datetime('now')`）

#### Tests
- 新增 `tests/unit/pgDriver.test.js` — 17 个纯函数单测覆盖占位符重写、`isUniqueViolation`、`parseDatabaseUrl` 协议识别、`PG_POOL_MAX` 解析
- 新增 `tests/integration/postgresAdapter.integration.test.js` — 真 PG 集成用例（migrate 跑全 8 迁移 / `xs_iso_now()` 格式 / UNIQUE→ConflictError / IOOR JSONB 往返 / JSONB 类型核查 / GIN 索引就位 / ROLLBACK 隔离 / COMMIT 持久化 / 事务内 UNIQUE 归一），用独立 env `PG_TEST_URL` 触发；未设置 → 整 suite skip
- A.2 落地后本地基线：**482 passed / 9 skipped / 0 failed**（PG 集成 suite 本地无 PG 故 skip）

---

### A.3 — CI PG validation + release docs（本期）

**目标**：让 PG 真路径在 CI 自动跑，闭环 A.1+A.2 的验收。

#### CI / Chore
- **`.github/workflows/ci.yml` 新增 `test-postgres` job**：
  - `services: postgres:16`，`pg_isready` 健康检查，10 次重试
  - 注入 `PG_TEST_URL=postgres://postgres:postgres@localhost:5432/postgres`
  - 跑 `npm test` —— SQLite 默认 482 + 真 PG unskip 9 = **491/491** 期望
  - 独立 job，与 `lint-and-test` 并行，**不污染既有 SQLite job 的失败信号**
- `package.json.version` → `1.4.0`

#### Fixed（CI 首跑 PG 路径暴露）
- `postgresAdapter.integration.test.js` 误把 `agentRepository` / `ioorRepository` 当直接导出方法调用；二者实为工厂模块（`buildRepository(driver)` / `buildIoorRepository(driver)`）。改用工厂 API。
- `pgDriver` / `sqliteDriver` 的事务回调句柄缺 `isUniqueViolation` —— repo 方法在事务内撞唯一约束会 `TypeError`。两 driver 的事务句柄补齐该谓词。
- 新增「事务内 UNIQUE 冲突仍归一为 `ConflictError`」集成用例覆盖上述修复，PG 集成用例 8 → 9。

#### Docs
- `README.md` 配置段补 PG 协议示例（badge 风格保持历史不动）
- 本 CHANGELOG 条目按 A.1 / A.2 / A.3 子段记录完整脉络

#### Release Gate
- **tag `v1.4.0` 推迟到 CI `test-postgres` job 实际通过后再打**，commit 先落，避免 tag 指向未经 PG 验收的 HEAD

---

## [1.3.0] - 2026-05-19

### 🤖 Project Assistant MVP

新增**项目助理**总控 Agent 闭环：跟踪项目进度、记录事件、生成提醒、调用外部常驻 HTTP Agent、输出项目摘要。
项目助理不直接写代码、不审代码、不自动 push，是协调与摘要型 Agent。

阶段开发记录见 `docs/planning/PLAN_PROJECT_ASSISTANT_MVP.md` 与 10 个 PAM 阶段 commit。

### Added — 9 个固定 Tool

| Tool | 职责 |
|------|------|
| `projectGetStatus` / `projectUpdateStatus` | 读取 / upsert 项目状态（首次落库 `name` 兜底取 `projectId`） |
| `taskList` / `taskUpsert` | 列出 / 创建更新任务（复合主键 `projectId + taskId`） |
| `eventRecord` | 记录不可变事件流水（落库前必经 `redactSensitive` 通道） |
| `reminderCreate` / `reminderListDue` | 创建 / 查询到期提醒（`status=open AND due_at<=before`） |
| `externalAgentSend` | 调用白名单外部 HTTP Agent，URL 固定在服务端、全程审计留痕 |
| `projectGenerateDigest` | 生成项目摘要（markdown / json；含最近 10 事件、未来 24h 提醒） |

### Added — 数据与编排

- `src/domain/projectAssistant/` 新增领域模块：8 个 Zod schema + 4 个 Repository + digestBuilder + externalAgentClient + profile 白名单。
- 迁移 `006_create_project_assistant_core.sql`（`projects` / `pa_tasks` / `pa_events` / `pa_reminders`）+ `007_create_external_agent_calls.sql`（审计日志，不暴露独立列表 Tool）。
- 工作流 `workflows/project-assistant-digest.yaml` 把 7 个 Tool 串成顺序闭环。
- `createApp` 启动期容错装载 `workflows/` 目录（默认非严格——坏 YAML 仅告警；`strictWorkflowLoad: true` 才上抛）。
- `npm run smoke:project-assistant` 一键 smoke：起临时 HTTP stub 扮演外部 Agent，走完整 `createApp + supertest` HTTP 路径，严格语义任一步失败 exit 1。

### Security

- `externalAgentSend` 复用 `httpGuard.assertSafeUrl` 做 SSRF 校验；profile 自身 host 进 `allowedHosts` 豁免私网拒绝（protocol/userinfo 校验保留）；入参 schema 无 URL 字段，Agent/用户无法传入任何地址。
- `EXTERNAL_AGENT_PROFILE_OVERRIDE` 仅作为测试/smoke 钩子。
- 外部调用 reply / raw / summary 按 schema 上限截断（32KB / 8KB / 4KB）。
- 调用前先 `insertPending` 拿 callId；失败/超时同样留痕 `failed`/`timeout`——凡动必留痕。
- 事件落库前走项目脱敏（按字段名脱敏；项目策略不做内容启发式扫描）。

### Docs

- `README.md` 新增「项目助理 MVP」段落与 smoke 验证说明，并订正内置工具数 / 目录树。
- 新增 `docs/tool-dev.md`——Tool 开发参数结构与契约规范。
- `docs/planning/PLAN_PROJECT_ASSISTANT_MVP.md` 收录 Q1–Q13 全部架构决策（含 Q13 upsert 兜底）。
- `PROJECT_STRUCTURE.md` 重新生成，反映 `domain/projectAssistant/` 与 `builtinTools/projectAssistant/` 新增节点。

### Quality

- 测试：60 suites / 464 用例全过；覆盖率 statements 95.27% / branches 86.27% / functions 96.69% / lines 95.42%（远超 80% 门槛）。
- `npm run lint` / `npm run format:check` / `npm run audit:ci` 全绿（0 漏洞）。

---

## [1.1.1] - 2026-05-19

### 🛡️ CI 依赖审计集成（OWASP A06）

聚焦闭环 PROJECT_CLOSURE §5 backlog 高优先级 #1，无运行时代码改动。

### CI / Chore
- **新增 `dependency-audit` job** — `.github/workflows/ci.yml`：
  - 独立 job，与 `lint-and-test` / `secret-scan` 并列；失败可见性独立
  - 触发：`push` / `pull_request`（main, develop）+ 每日 `cron '17 3 * * *'`（UTC）
  - 失败时上传 `audit.json` artifact（retention 7 天）
- **新增 `npm run audit:ci`** — `package.json`：
  - `npm audit --omit=dev --audit-level=high`
  - 仅审计 production 依赖（158 个），避免 dev 噪音
  - 阈值 `high`：high + critical 阻塞 CI

### Docs
- `SECURITY_AUDIT.md` 中 INFO 级「npm audit 未集成」标记为已解决

### Security Posture
**CRITICAL: 0 | HIGH: 0 | MEDIUM: 3 | INFO: 2 (was 3)**

当前依赖审计基线：0 漏洞（prod 158 / dev 645 / total 802）

---

## [1.1.0] - 2026-05-19

### 🔒 安全与成本加固

聚焦修复 v1.0.0 安全审计中的 HIGH/MEDIUM 项。

### Security
- **修复 SSRF (HIGH)** — `httpRequest` 工具引入 `httpGuard.js`：
  - 协议白名单（http/https），拒绝 `file://` / `ftp://` / `gopher://`
  - 拒绝 URL 含 `userinfo`
  - 拒绝 IP 字面量目标（127.0.0.1 / 10.x / 169.254.x 等）
  - DNS 解析后逐 IP 校验私有/链路本地段（防 DNS 重绑定攻击）
  - 任一解析地址为私有即拒绝（防多 A 记录混入）
  - 5min 内存 DNS 缓存
  - 环境变量 `HTTP_REQUEST_BLOCK_PRIVATE_IPS` / `HTTP_REQUEST_ALLOWED_HOSTS`

### Added
- **Token 配额熔断 (MEDIUM)** — 新增 `workflowEngine/tokenQuota.js`：
  - 单工作流执行累计 token 上限，超额抛 `TokenQuotaError`
  - 节点状态自动转 STUCK，工作流终态 STUCK
  - 三级优先级：execute body > workflowDef > env > 默认 100k
  - `cached_prompt_tokens` 不计入配额（已折扣）
  - `WorkflowSchema` 扩展可选 `tokenQuota` 字段
- `.env.example` 新增 SSRF/quota 配置项说明

### Changed
- `workflowExecutor.pickFailAction` 把 `TOKEN_QUOTA_EXCEEDED` 也归类为 STUCK 状态
- `SECURITY_AUDIT.md` 标记 HIGH/MEDIUM 修复并更新评级
- 测试默认 `HTTP_REQUEST_BLOCK_PRIVATE_IPS=false`，保留对生产策略的严格守卫

### Tests
- 44 套件 / 372 个用例全通过（V1.1 新增 44 个）
- `httpGuard.test.js` 28 case（含 IPv6 / DNS 重绑定 / 白名单）
- `tokenQuota.test.js` + `tokenQuotaIntegration.test.js` 16 case

### Security Posture (Updated)
**CRITICAL: 0 | HIGH: 0 (was 1) | MEDIUM: 3 (was 4) | INFO: 3**

剩余项均为 V1.5/V2 计划（插件 sandbox / 签名 / npm audit CI）。

---

## [1.0.0] - 2026-05-19

### 🎉 首个 MVP GA 发布

完整声明式 Agent 编排平台，从零搭建到生产可用。

### Added

#### 核心引擎
- **agentManager**：Agent CRUD REST API，Zod 强校验，Repository 模式
- **workflowEngine**：DAG 拓扑执行，条件分支裁剪，输出注入 context
- **状态机**：纯函数 `transition`，6 状态 × 6 动作矩阵（PENDING/RUNNING/SUCCESS/FAILED/STUCK/TIMEOUT）
- **expressionEvaluator**：递归下降解析器，**禁用 JS eval**；支持 `==/!=/>/</>=/<=/&&/||/!`
- **节点级超时与指数退避重试**

#### 配置与扩展
- **configManager**：YAML/JSON 加载，按扩展名分派；解析错误归一化为 ValidationError
- **chokidar 文件热加载**，按文件路径维度防抖
- **pluginLoader**：`./plugins/` 目录自动扫描；单插件失败隔离
- 示例插件 `reverseString`

#### 工具库
- 5 个内置工具：`addNumbers` / `httpRequest` / `readFile` / `queryDatabase`（仅 SELECT）/ `sendEmail`(stub)
- 工具级超时熔断

#### 记忆与可观测性
- **memoryManager**：messages 表多轮对话，tenant_id 预留
- 自动注入历史到 LLM messages
- **IOOR 协议**：每次 LLM 调用一条记录，含 profileHash (SHA-256) / token usage / 脱敏后 I/O
- **审计降级通道**：契约校验失败强写 `audit_dead_letters`
- **traceCollector**：node_traces 表，按 executionId 串联 spans
- **metricsExporter**：Prometheus 文本格式，4 个核心指标（含 histogram）

#### 接入层
- **JWT 认证**（HS256，算法白名单防 `alg=none`）
- **滑动窗口限流**（IP/sub 双粒度，Retry-After 头）
- **Webhook 签名**（GitHub HMAC-SHA256，timing-safe 比对，±5min 防重放）
- **异步队列**：inMemoryAdapter（接口兼容 BullMQ，V1.5 切换零侵入）
- REST 路由：`POST /workflows/:id/execute` 202 异步 + `GET /workflows/executions/:id`
- trace 查询：`GET /workflows/executions/:id/trace`
- 健康检查：`/healthz` (liveness) + `/readyz` (含 DB 探测)
- Prometheus 端点：`/metrics`（默认匿名；`METRICS_TOKEN` 启用鉴权）

#### 有界自愈
- LLM 输出契约失败（空返回/JSON 错误/Schema 不匹配）→ 重投喂修正指令
- 最多 2 次自愈；超限抛 StuckError → 节点 STUCK 状态

#### 安全
- **双重脱敏**：字段名匹配 + Pino redact + IOOR 写入前 + 应用层
- 中英文敏感字段覆盖（password / 密码 / 身份证 / 银行卡 / api[_-]?key / authorization）
- HTTP body 大小限制（`/agents` 1MB，`/webhooks` 256KB）
- 错误响应不泄漏内部细节（非 AppError 一律 500）
- `x-powered-by` 头移除

#### 工程化
- ESLint 强约束（`max-lines:500` / `max-lines-per-function:50` / `max-depth:3` / `max-params:4`）
- Husky pre-commit：lint-staged + 文件头注释格式校验
- Commitlint conventional commits 强制
- GitHub Actions CI：lint + test + coverage + gitleaks 密钥扫描
- AA-SEAC 规范全量落地（§1.2 / §1.3 / §1.4 / §1.6 / §3 / §4 / §5）

#### 文档
- PRD / 架构设计 / 任务拆解
- API 参考（`docs/api.md`）
- 插件开发指南（`docs/plugin-dev.md`）
- 安全审计报告（`docs/security/SECURITY_AUDIT.md`）
- 性能压测报告（`docs/performance/PERFORMANCE_REPORT.md`）

### Performance
- `GET /healthz`：10,951 req/s（P95 2ms）
- `GET /metrics`：12,201 req/s（P95 1ms）
- `GET /agents`：3,988 req/s（P95 6ms）
- `POST /workflows/:id/execute`：2,141 req/s（P95 11ms）— **10× NFR 目标**

### Security
- OWASP Top 10 全项有结论
- **CRITICAL: 0 | HIGH: 1 (SSRF 已知) | MEDIUM: 4 | INFO: 3**
- 详见 [SECURITY_AUDIT.md](docs/security/SECURITY_AUDIT.md)

### Tests
- 41 套件 / 328 个用例 / 95%+ lines 覆盖率

### Known Limitations
- `httpRequest` 工具无内置 SSRF 白名单（HIGH） — 运维侧通过网络隔离临时缓解；V1.1 代码层实现
- `inMemoryAdapter` 不持久化（进程重启丢未执行 jobs） — V1.5 BullMQ 适配器
- 插件以主进程权限运行 — V2 引入 sandbox
- LLM 无 per-execution token 配额 — V1.1
- `/metrics` 默认匿名 — 已提供 `METRICS_TOKEN` 配置

---

## [Unreleased]

### Planned for V1.1.x
- `/metrics` 默认强制 `METRICS_TOKEN`（向后破坏，攒到 v1.2）

### Planned for V1.5
- PostgreSQL 适配器（Repository 抽象已就位）
- BullMQ + Redis 队列适配器
- IOOR 批量缓冲写入
- Pino transport worker 异步日志
- 插件来源校验（package.json signature）

### Planned for V2
- 插件 sandbox (`isolated-vm`)
- 前端管理界面（Vue 3）
- 向量数据库长期记忆
- OpenTelemetry SDK 接入
- 多租户 `tenant_id` 下钻
- LangChain.js 编排辅助评估
