// [planner] ID: PLAN-V1.5-IOOR-BATCH | Date: 2026-05-20 | Description: V1.5 IOOR 批量缓冲（每 turn 一插 → 内存缓冲 + 批量 flush），等待 CONFIRM

# V1.5 实施计划 — IOOR 批量缓冲

> 触发：backlog V1.5 收尾三项之首（用户裁决）
> 依据：RULES.md §阶段 1（PLAN-First）；`PERFORMANCE_REPORT.md:L89` 列入 V1.5（批量缓冲）
> 目标：把「每 turn 一次 DB insert + 一次 SELECT 回读」改为「内存缓冲 + 按条数/时间窗/事件触发 flush」，降低高并发下的写放大

---

## 1. 当前现状

### 1.1 IOOR 写入路径

| 文件 | 职责 |
|---|---|
| `src/observability/ioorRecorder.js:18-30` | 唯一对外入口 `record(input)`；脱敏 → 契约校验 → `await ioorRepository.insert()`；失败走 `audit_dead_letters` 死信 |
| `src/observability/ioorRepository.js:40-66` | `insert(record)`：1 次 INSERT + 1 次 `findById` 回读 = **每 turn 2 次 SQL** |
| `src/workflowEngine/nodeRunner.js:117-139` | 唯一调用点 `recordAgentTurns()`，每 agent 节点每轮 LLM 调用调一次 |
| `src/apiGateway/controllers/observabilityController.js:27` | 唯一读路径 `listByExecution(id)` |

### 1.2 关键约束

- **AA-SEAC §4.2** 原文：「每一次轮次必须作为**原子单位**进行**实时全量持久化存储**」
- **AA-SEAC §1.6**：「凡动必留痕」
- 既有测试 5+ 处假设「`await record()` 后立刻 `listByExecution()` 可读」（`ioorRecorder.test.js` / `agentNodeIntegration.test.js`）
- 进程优雅停机当前**未触达 IOOR**（`main.js:46-51` 只关 queue）

### 1.3 与 §4.2 「实时全量」措辞的张力

批量缓冲与「实时全量」字面冲突。需明确权衡（D-IOOR-7）：
- 引入缓冲必然引入「崩溃丢未 flush 数据」的窗口
- 缓解：(a) bounded window（条数 + 时间双上限）(b) crash 路径同步 flush 兜底 (c) flush 失败走 audit_dead_letters

---

## 2. 修改范围

### 2.1 新建文件

| 路径 | 用途 |
|---|---|
| `src/observability/ioorBuffer.js` | 缓冲核心：`push(record)` / `flush(filter?)` / `flushAll()` / `size()`；按 size + interval + 显式调用触发 |
| `src/observability/schemas/ioorBufferConfigSchema.js` | Zod：`IoorBufferConfigSchema`（batchSize / intervalMs / enabled） |
| `tests/unit/ioorBuffer.test.js` | 缓冲单测：触发条件 / flush 顺序 / 失败重试 / 并发安全 |
| `tests/integration/ioorBufferIntegration.test.js` | 与真 driver 联跑：批量 insert 形态 / read-side flush / shutdown flush |
| `docs/planning/PLAN_V1.5-IOOR-BATCH.md` | 本文件 |

### 2.2 改动现有文件

| 路径 | 改动点 |
|---|---|
| `src/observability/ioorRepository.js` | 新增 `insertMany(records)`：单 SQL 多行 VALUES；`insert` 保留（兼容现有直插路径） |
| `src/observability/ioorRecorder.js` | `record()` 改写：脱敏校验后**推入 buffer** 而非直接 DB；返回 sanitize 后的 in-memory 记录（含本地生成 `id`）；新增 `flush(executionId?)` / `close()` |
| `src/apiGateway/server.js` | `buildDefaultIoorRecorder` 改为带 buffer 实例；`app.locals.deps.ioorRecorder` 暴露（与 v1.5.0 的 queue 同模式） |
| `src/workflowEngine/workflowExecutor.js`（推测） | `markFinal` 后调 `recorder.flush(executionId)`（execution 完成→该 execution 的 buffer 立刻可读，落实 D-IOOR-2 "execution 完成即可见"） |
| `src/apiGateway/controllers/observabilityController.js` | 读路径 `listByExecution` 前先 `await deps.ioorRecorder.flush(req.params.id)`（lazy 读时 flush，落实 D-IOOR-2） |
| `src/main.js` | 优雅停机第三步：`await queue.close()` 之后追加 `await ioorRecorder.flush()` + `close()` |
| `tests/integration/ioorRecorder.test.js` | 用例改为 `await record(...); await recorder.flush(); await listByExecution(...)`；或验证 in-memory 形态后调 flush 再 DB 查 |
| `tests/integration/agentNodeIntegration.test.js` | 同上 |
| `.env.example` | 追加 `IOOR_BATCH_SIZE` / `IOOR_BATCH_INTERVAL_MS` 说明 |

**估算**：新建 5 文件，改动 ~8 文件，~400 行净改动；零业务逻辑改动（仅写入路径重塑）。

### 2.3 关键实现要点

1. **buffer 数据结构**：`Map<executionId, IoorRecord[]>` —— 按 execution 分组，便于「按 executionId flush」
2. **触发条件**（OR 关系）：
   - `total size ≥ IOOR_BATCH_SIZE`（默认 50）
   - `interval` 定时器每 `IOOR_BATCH_INTERVAL_MS`（默认 1000）扫一次有数据即 flush
   - `flush(executionId)` 显式调用（execution 完成 / 读路径前）
   - `flushAll()` shutdown / 测试用
3. **bulk insert SQL**：`INSERT INTO ioor_records (...) VALUES (?,?,...), (?,?,...), ...`，参数数 = 14 × N；pgDriver `?→$N` 自动适配
4. **id 生成**：保持 `crypto.randomBytes`（不依赖 DB 自增），buffer 入队即决定 id，返回给调用方
5. **read-side flush**：`listByExecution` 前 `await flush(executionId)` —— 单 execution 缓冲量有界（一个工作流通常 < 50 turn），开销可控
6. **失败处理**：bulk insert 抛错 → 走死信 `auditRepository.recordDeadLetter({ source: 'ioor.batch', payload: [records] })`，单条/批整体失败粒度二选一（D-IOOR-5 关联）

---

## 3. 关键设计决策（待 CONFIRM）

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D-IOOR-1 | flush 触发组合 | (a) 仅 size (b) 仅 time (c) size + time + execution-complete + shutdown + read-path | **(c)**：四重触发覆盖所有可见性场景；任一命中即 flush；实现复杂度可控 |
| D-IOOR-2 | 读取路径如何看到未 flush 数据 | (a) 读前先 flush(id)（lazy） (b) 读时合并 memory + DB (c) 不可见，调用方自行 await flush | **(a)**：保持「读即可见」语义，兼容既有 e2e；单 execution 缓冲量有界开销小；最小破坏 |
| D-IOOR-3 | execution 完成信号源 | (a) workflowExecutor `markFinal` 后显式调 `flush(executionId)` (b) IOOR 监听某事件 | **(a)**：显式调用，无新事件总线；与 v1.5.0 main.js 显式调 queue.close 同风格 |
| D-IOOR-4 | `record()` 返回值语义 | (a) 立即返回 sanitized in-memory 记录（id 本地生成） (b) 仍 await DB 回读才返回（失批量意义） | **(a)**：才能真正消除热路径同步 SQL；返回对象字段与原 DB 回读一致 |
| D-IOOR-5 | 崩溃 / 错误兜底 | (a) bulk flush 失败 → 整批走 audit_dead_letters（payload 数组） (b) 拆单条重试 (c) 仅日志 | **(a)**：「凡动必留痕」最低保障；整批死信易追溯；不在热路径做条级重试 |
| D-IOOR-6 | 默认缓冲参数 | (a) `BATCH_SIZE=50` / `INTERVAL_MS=1000` (b) `100/2000`（更激进） (c) `25/500`（更保守） | **(a)**：MVP 工作流通常 < 50 turn 一个 execution；间隔 1s 兼顾延迟与节流；可调 |
| D-IOOR-7 | AA-SEAC §4.2 「实时全量」措辞 | (a) 修订一行：「实时全量持久化（允许 ≤N 条 / ≤T ms 的有界缓冲窗口，crash/shutdown 路径同步 flush 兜底）」 (b) 不动 spec，仅在 CHANGELOG + design 注释说明权衡 | **(a)**：spec 是项目铁律，做了破坏性事就要更新 spec；明确写出 bounded window 才有审计依据；同步留下「凡动必留痕」spirit 不变的注解 |
| D-IOOR-8 | 是否同时给 traceCollector 也批量化 | (a) 是，复用 buffer 基础设施 (b) 否，本期仅 IOOR；traceCollector 留下一轮 | **(b)**：保持 scope 紧；本期把 IOOR 这条路径做透；traceCollector 同构问题下期照搬范式（沿用 V1.5-A/B 一次只啃一块的节奏） |
| D-IOOR-9 | 版本号 | (a) `v1.7.0` minor (b) `v1.6.1` patch | **(a)**：内部行为变化显著（write path 重塑、in-progress trace 可见性语义微妙变化），按 SemVer 不该 patch；REST API 不变所以非 major |

---

## 3b. CONFIRM 修订（2026-05-20，用户裁决）

已 CONFIRM，4 条调整锁定：

- **D-IOOR-1 修正**：触发是 **5 个**，SPEC/CODE 不得漏 read-path：
  `size` + `time` + `execution-complete` + `read-path lazy flush` + `controlled shutdown`
- **D-IOOR-3 修正**：flush 调用位置是 **`workflowController.runOne()`** 在 `executionStore.markFinal()` 之后调 `deps.ioorRecorder.flush(executionId)`（`markFinal` 在 workflowController，不在 workflowExecutor）
- **D-IOOR-5 改名**：不叫「崩溃兜底」。准确表述为 **「flush 失败兜底（→ audit_dead_letters）+ shutdown best-effort」**。不承诺硬崩溃 / `kill -9` / 掉电可死信
- **D-IOOR-7 定稿措辞**（AA-SEAC §4.2 原行替换为）：
  > 每一次轮次必须作为原子单位进行全量记录；持久化允许在可配置的 ≤N 条 / ≤T ms 有界缓冲窗口内完成。受控 shutdown、执行完成、读前查询路径必须触发 flush；flush 失败必须进入 `audit_dead_letters`。非受控进程崩溃存在最多一个缓冲窗口的数据丢失风险，须在配置与修订日志中显式声明。

**额外实现约束**：`buildDependencies()` 当前创建了 `ioorRecorder` 但**未放进返回的 `deps`**。本期必须把它暴露为 `deps.ioorRecorder`，使 `workflowController.runOne`、trace 读路径 lazy flush、`main.js` shutdown 三处接到**同一个** recorder 实例。

其余按 PLAN 建议：D-IOOR-2 读前 lazy flush / D-IOOR-4 立即返回 in-memory record 不加 flushed / D-IOOR-6 默认 50/1000ms / D-IOOR-8 traceCollector 留下期 / D-IOOR-9 v1.7.0 minor；附加问题 1-5 全同意。

---

## 4. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解 |
|---|---|---|
| 既有 5+ 测试假设「`record()` 后立刻可读 DB」 | **高** | 测试改为 `await flush()` 收口（最低改动）；或读路径 lazy flush 后既有 e2e 不改 |
| 进程崩溃 → 缓冲丢失 | 中 | bounded window（默认 50 条 / 1s）+ shutdown flush；`uncaughtException` 钩子可选（D-IOOR-5 (a) 死信收尾） |
| in-progress trace 查询时序变化 | 低 | read-path lazy flush 兜底，外部不可观察差异 |
| bulk INSERT 参数数过大触发驱动限制 | 低 | SQLite 默认 ~999 占位符；14 × 50 = 700 OK；pg 上限 32k 远超；防御性：单批超 N=50 时分多 SQL（实现侧守卫） |
| Promise.all flush 失败一支挂导致 await 永等 | 低 | 内部 try/catch + 死信收尾；flush 返回 settled 结果 |
| `recorder.flush(id)` 与并发 push 竞争 | 中 | flush 时先 atomically swap `Map<id, []>` 出当前批，再走 bulk INSERT；新 push 写入新批 |

---

## 5. 验收标准（DoD）

- [ ] `record()` 不再产生即时 SQL；turn 入 buffer 即返回
- [ ] 触发条件四重生效（size / interval / per-execution flush / shutdown）单测覆盖
- [ ] `listByExecution(id)` 前的 lazy flush 让既有 e2e **无需改动**仍通过（或改最小补丁）
- [ ] `main.js` 优雅停机第三步 `await ioorRecorder.flush() + close()` 生效；jest 无句柄泄漏
- [ ] bulk insert 失败 → 整批进 `audit_dead_letters`（验证落库）
- [ ] SQLite + PG 双 driver 下 batch insert 生效（PG `?→$N` 自动适配）
- [ ] AA-SEAC §4.2 一行修订 + 注解
- [ ] CHANGELOG `[1.7.0]` 段说明语义变化与 env tunable
- [ ] `npm run lint` 0 error；覆盖率 ≥ 80%

---

## 6. 阶段产出与 commit

V1.5-IOOR-BATCH 单实现 pass，2 commit：

1. `feat(observability): IOOR 批量缓冲 + 读路径 lazy flush (V1.5)`
2. `chore(release): IOOR batch buffering v1.7.0`

**发布门禁**：不引入新外部服务，CI 用现有 `lint-and-test` + `test-postgres` + `test-redis` 三 job 验收（PG/Redis 路径不受 IOOR 改动影响，但跑一遍兜底）。tag 等 CI 绿。

---

## 7. 附加问题

1. **SPEC 阶段产物**：本期新契约 `IoorBufferConfigSchema`。SPEC 是否就只交付这一处 Zod 契约后进 CODE？（建议：是）
2. **`record()` 返回值是否需要包含 `flushed: false` 标记**让上层区分？（建议：否——sanitize 后字段保持现有形态，避免破坏 typedef；区分语义由 `flush()` 显式调用承担）
3. **是否给 IOOR 加 `recorder.metrics()`** 暴露缓冲深度/上次 flush 耗时供 Prometheus？（建议：本期否；纳入下一轮 metrics 增强；保持 scope）
4. **修订 AA-SEAC §4.2 的具体措辞**——是直接覆盖原行（推荐），还是加一个 footnote `^1` 引用 V1.5 修订？（建议：直接修原行 + 在文末加 V1.5 修订日志段）
5. **traceCollector 批量化**留下期是否同意？（建议：是，避免一次性吞两块）

---

## 8. 一句话总结

V1.5-IOOR-BATCH 把 IOOR 写入路径从「每 turn 同步直插」改为「内存有界缓冲 + 四重触发 flush + lazy 读时收口」，性能换来「实时全量」字面强度的轻微让步，并通过 spec 修订把这种让步显式化、可审计。

**请回复 CONFIRM（可附 D-IOOR-1 ~ 9 + 附加问题 1 ~ 5 的调整）后进入 SPEC/CODE。**
