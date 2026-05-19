// [planner] ID: PLAN-V1.5-B | Date: 2026-05-20 | Description: V1.5-B BullMQ + Redis 队列适配器实施计划，等待 CONFIRM

# V1.5-B 实施计划 — BullMQ + Redis 持久化队列

> 触发：backlog 下一档（V1.5-A 已收口 v1.4.0）
> 依据：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE
> 目标：在保留内存队列默认可跑的前提下，新增 BullMQ 驱动；通过 `QUEUE_DRIVER=bullmq` + `REDIS_URL` 切换

---

## 1. 当前现状分析

### 1.1 队列实现盘点

| 模块 | 位置 | 形态 |
|---|---|---|
| 唯一队列实现 | `src/infrastructure/queue/inMemoryAdapter.js` | `createInMemoryAdapter()`，纯内存 `Map`，`setImmediate` 派发 |
| 装配点 | `src/apiGateway/server.js:68` `buildDependencies` | `queue: overrides.queue \|\| createInMemoryAdapter()` |
| 消费者 1 | `workflowController.js:51` `registerWorker` / `:83` `triggerExecute` | `process(WORKFLOW_QUEUE, runOne)` + `enqueue(...)` |
| 消费者 2 | `webhookController.js:51` `handleGithub` | `enqueue(WORKFLOW_QUEUE, {...})` |
| 健康探针 | `server.js:159` `/readyz` | `typeof deps.queue?.enqueue === 'function'` |

### 1.2 当前队列契约（`inMemoryAdapter.js:9-16`）

| 方法 | 当前签名 | 同/异步 |
|---|---|---|
| `enqueue(name, payload)` | → `{ jobId }` | **同步** |
| `getJob(jobId)` | → `{ id, name, status, result, error, ... }` \| `null` | **同步** |
| `process(name, worker)` | 注册 worker（每队列名一个） | 同步 |
| `onJobComplete(handler)` | 注册 `'complete'` 回调 | 同步 |
| `close()` | 释放资源 | 同步 |

### 1.3 ⚠️ 关键现状判断

- **缺口**：无持久化（进程重启丢全部 job）、无重试、无并发上限、无独立 worker、优雅停机未 `close()` 队列
- **`REDIS_URL` 占位已存在**（`.env.example:14`），但 `src/` 无任何代码消费 → 纯死占位
- **无 `bullmq`/`ioredis` 依赖**
- **异步影响面极小**：BullMQ 全 async（`queue.add()` 返回 Promise）。若 `enqueue` 改 async，受影响调用点**仅 2 处**（`workflowController.js:83` / `webhookController.js:51`，各加一个 `await`）。`getJob` **应用代码根本没调用**（执行状态通过 `executionStore` 查询）——改 async 只影响 `inMemoryAdapter.test.js`
- 与 V1.5-A 全栈 async 重构不同，本期 async 涟漪几乎可忽略

### 1.4 与 V1.5-A 的范式复用

V1.5-A 已确立的两个范式直接套用：
- **适配器 + dispatch**：如 DB 的 `sqliteDriver`/`pgDriver`，队列做 `inMemoryAdapter`/`bullmqAdapter` + 工厂 dispatch
- **CI 真验收 + 发布门禁**：如 PG 的 `test-postgres` job，加 `test-redis` job；skip-guarded 集成测试用独立 env；tag 等 CI 绿

---

## 2. 修改范围评估

### 2.1 新建文件

| 路径 | 用途 |
|---|---|
| `src/infrastructure/queue/bullmqAdapter.js` | 基于 `bullmq` 的队列适配器 |
| `src/infrastructure/queue/index.js` | 按 `QUEUE_DRIVER` dispatch（`createQueue(config)`） |
| `src/infrastructure/queue/schemas/queueConfigSchema.js` | `QueueConfigSchema` Zod 契约（discriminated union：memory / bullmq） |
| `tests/unit/bullmqAdapter.test.js` | 纯函数单测（状态映射、配置解析），不需真 Redis |
| `tests/integration/bullmqQueue.integration.test.js` | 真 Redis 集成测试；无 `REDIS_TEST_URL` 时 `describe.skip` |

### 2.2 改动现有文件

| 路径 | 改动点 |
|---|---|
| `src/infrastructure/queue/inMemoryAdapter.js` | `enqueue` / `getJob` / `close` 改 async（内部逻辑不变，仅包 async 壳，对齐统一契约） |
| `src/apiGateway/server.js` | `buildDependencies` 用 `createQueue(...)` 替换裸 `createInMemoryAdapter()` |
| `src/apiGateway/controllers/workflowController.js` | `triggerExecute` 第 83 行 `await deps.queue.enqueue(...)` |
| `src/apiGateway/controllers/webhookController.js` | `handleGithub` 第 51 行 `await deps.queue.enqueue(...)` |
| `src/main.js` | 优雅停机补 `await deps.queue.close()`（顺带修现存遗漏） |
| `tests/unit/inMemoryAdapter.test.js` | 6 个用例改 `await enqueue/getJob` |
| `tests/e2e/gateway.e2e.test.js` | `queue.close()` 改 `await`（如有断言依赖） |
| `package.json` | 新增 `bullmq` 运行时依赖（含 `ioredis`） |
| `.github/workflows/ci.yml` | 新增 `test-redis` job：`services: redis:7` + `REDIS_TEST_URL` |
| `.env.example` | `REDIS_URL` 旁补 `QUEUE_DRIVER` / `QUEUE_CONCURRENCY` / `QUEUE_MAX_ATTEMPTS` 说明 |
| `CHANGELOG.md` | `[1.5.0]` 条目 |

**估算**：新建 5 文件，改动 ~10 文件，~400 行净改动。**零 repository / executor / workflow 业务逻辑改动**。

### 2.3 bullmqAdapter 关键实现要点

1. **统一异步契约**：`enqueue/getJob/close` 全 async；`process/onJobComplete` 同步注册。
2. **per-name Queue/Worker**：项目当前仅 1 个队列名 `workflow.execute`；adapter 内用 `Map<name, {queue, worker}>` 懒建。
3. **`enqueue`** → `queue.add(jobName, payload, { attempts, backoff })`，返回 `{ jobId: job.id }`。
4. **`process(name, worker)`** → `new Worker(name, async (job) => worker(job.data, job), { connection, concurrency })`。
5. **`getJob`** → `Queue.getJob(id)` + `job.getState()`，BullMQ 状态映射到契约状态：`waiting/delayed→PENDING`、`active→RUNNING`、`completed→SUCCESS`、`failed→FAILED`。
6. **`onJobComplete`** → `worker.on('completed', (job, result) => handler(sanitize(job, result)))`。
7. **`close`** → `await worker.close()` + `await queue.close()` + 关 ioredis 连接（杜绝 jest 句柄泄漏）。
8. **连接**：BullMQ 要求 worker 连接 `maxRetriesPerRequest: null`；从 `REDIS_URL` 建 ioredis 连接。

---

## 3. 关键设计决策（待 CONFIRM）

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D-B-1 | 驱动 dispatch 机制 | (a) 显式 `QUEUE_DRIVER=memory\|bullmq`，默认 `memory` (b) 自动：`REDIS_URL` 存在即用 bullmq | **(a)**：`REDIS_URL` 占位早就在 `.env.example`，自动判定会让现有部署意外切 bullmq；显式 env 最安全 |
| D-B-2 | worker 进程模型 | (a) in-process：BullMQ Worker 与 API 同进程，`buildDependencies` 内建 (b) 独立 `src/worker.js` 进程 | **(a)**：与当前单进程架构一致；独立 worker 进程是水平扩展需求，留 V2；本期先把持久化/重试/并发拿到手 |
| D-B-3 | 队列契约异步化 | (a) `enqueue/getJob/close` 在**两个 adapter**都改 async（inMemory 包 async 壳） (b) 只 bullmqAdapter async，inMemory 保持同步 | **(a)**：单一契约，consumer 无需按 driver 分支；涟漪仅 2 处 `await`，成本极低（仿 V1.5-A.1 driver 范式） |
| D-B-4 | 重试默认值 | (a) `QUEUE_MAX_ATTEMPTS` 默认 `1`（不重试，与内存队列行为一致），可调 (b) 默认 `3`（开箱重试） | **(a)**：工作流引擎已有「有界自愈 ≤2 次」（AA-SEAC §5）；队列层再默认重试会与之叠加放大副作用；默认关、显式开 |
| D-B-5 | 并发上限默认值 | (a) `QUEUE_CONCURRENCY` 默认 `5`，可调 (b) 默认 `1`（严格串行） | **(a)**：内存队列当前是**无上限**并发，默认 `5` 既收敛资源又不过度串行化；生产可调 |
| D-B-6 | 版本号 | (a) `v1.5.0`（minor） (b) `v1.4.1`（patch） | **(a)**：新增 BullMQ 能力是 feat，队列契约 async 化属 internal-only（REST API 不变）；minor 合 SemVer |

---

## 4. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解 |
|---|---|---|
| `enqueue` 漏加 `await` → HTTP 202 先返回但 job 未真入队 | 中 | 仅 2 处调用点，CODE + review 重点核对；e2e `gateway.e2e.test.js` 覆盖 202 路径 |
| BullMQ 连接未关 → jest 句柄泄漏挂起 | 中 | `close()` 显式关 worker/queue/connection；集成测试 `afterAll` 调 `close()` |
| `redis:7` service 未就绪 npm test 即跑 | 中 | CI service 健康检查（`redis-cli ping`）+ 重试 |
| in-memory `close` 改 async 后 e2e `afterEach` 未 await → 跨用例串扰 | 低 | 同步改 `await queue.close()` |
| BullMQ Worker `completed` 事件语义与内存 `onJobComplete` 不完全一致 | 低 | 集成测试断言 `onJobComplete` 行为；当前无生产消费方强依赖该事件 |
| `bullmq`/`ioredis` 引入新 npm audit 面 | 低 | A.3 已有 `audit:ci` gate 兜底；引入后立即跑一次 |

---

## 5. 验收标准（DoD）

- [ ] `QUEUE_DRIVER=memory`（默认）下全套测试全绿，行为与现网一致
- [ ] 本地/CI `QUEUE_DRIVER=bullmq` + Redis 下：`enqueue` → worker 处理 → `getJob` 状态流转 `PENDING→RUNNING→SUCCESS`
- [ ] 进程重启后未完成的 job 仍在 Redis（持久化验证）
- [ ] CI 新增 `test-redis` job 跑绿（`services: redis:7`）
- [ ] `npm run lint` 0 error；覆盖率 ≥ 80%
- [ ] `npm audit` 引入 bullmq 后仍 0 high+
- [ ] 优雅停机 `await queue.close()` 生效，jest 无句柄泄漏
- [ ] CHANGELOG `[1.5.0]` 完整

---

## 6. 阶段产出与 commit

V1.5-B 体量小于 V1.5-A，建议 **不再拆 B.1/B.2 子阶段**，单实现 pass，2 个 commit：

1. `feat(queue): BullMQ adapter + Redis dispatch (V1.5-B)` —— adapter / dispatch / 异步契约 / 测试 / CI `test-redis` job
2. `chore(release): BullMQ queue v1.5.0` —— CHANGELOG + version bump

**发布门禁**（沿用 V1.5-A.3 纪律）：commit 先落 → push → 看 CI `test-redis` job → 绿 → 打 tag `v1.5.0` → 核对 → push tag。

---

## 7. 附加问题

1. **SPEC 阶段产物**：唯一新契约是 `QueueConfigSchema`（memory/bullmq discriminated union）。同意 SPEC 只交付这一处 Zod 契约后进 CODE？（建议：是）
2. **`bullmq` 版本**：锁 `bullmq@^5`（当前稳定大版本，要求 Redis ≥ 6.2 / Node ≥ 20，本项目满足）。同意？（建议：是）
3. **commit 节奏**：同意「feat + chore(release) 两 commit」，还是想要单 commit？（建议：两 commit，与 V1.5-A 阶段化节奏一致）
4. **进程内 worker 的优雅停机顺序**：停机时应先停 HTTP 接收新请求、再 `await queue.close()` 等在途 job。建议在 `main.js` 落实此顺序（建议：是）

---

## 8. 一句话总结

V1.5-B 是「内存队列 → BullMQ 持久化队列」的适配器替换，直接复用 V1.5-A 的适配器 + CI 真验收范式。异步涟漪仅 2 处，零业务逻辑改动；最大的新增价值是持久化、重试、并发上限与独立可观测的 job 状态。

**请回复 CONFIRM（可附 D-B-1~6 及附加问题 1~4 的调整）后进入 SPEC/CODE。**
