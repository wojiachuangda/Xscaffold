# PLAN — 工作流调度子系统（真自动化 / cron）

> 阶段：PLAN（等待 CONFIRM → SPEC → CODE）
> 目标：让 workflow 能声明 cron 计划并被自动触发执行——补上 automation「名实不符」（现仅手动 Run）的缺口。

---

## 1. 现状

- 触发执行路径（`workflowController.triggerExecute`）：`workflowRegistry.get(id)` →
  `executionStore.create({workflowId,input})` → `queue.enqueue(WORKFLOW_QUEUE, {...})` → worker `runOne` 执行。
- `WorkflowSchema`（`.strict()`）**无 trigger/cron 字段**；workflow 只能手动 `POST /:id/execute` 或 webhook。
- 无 cron 库依赖；BullMQ 有 repeatable 但 dev 用内存队列 → 不能用（要 queue-agnostic）。
- `configWatcher`（chokidar）已监听 `workflows/` 变更 → 可驱动调度重载。
- `main.js start()` 建 app + listen + 优雅停机；`gracefulShutdown` 已 await queue/ioor 关闭。

---

## 2. 设计

### 2.1 契约（SPEC 阶段先写）
`WorkflowSchema` + `configSchema` 加可选 `trigger`：
```
trigger: z.object({ cron: z.string().min(1).max(120) }).strict().optional()
```
有 `trigger.cron` = 受调度；无 = 手动。webhook 仍走 `/webhooks`（独立机制），event 触发留未来。

### 2.2 复用执行路径
从 `triggerExecute` 抽出 `enqueueWorkflowExecution(deps, workflowId, input, source)` —— HTTP 路由与调度器共用
（create execution + enqueue）。`source` 标记 'manual'|'schedule'（记到 execution，便于区分）。

### 2.3 调度器 `src/workflowEngine/scheduler.js`
- `createScheduler({ workflowRegistry, enqueue, logger })` → `{ start, stop, reload, listJobs }`。
- `start()`：遍历 registry 全部 workflow，凡 `def.trigger?.cron` → 注册一个 cron job（fire → enqueue 该 workflow，input={}, source='schedule'）。
- `reload()`：config 变更时 stop 旧 jobs + 重新 start（configWatcher 回调里调）。
- `stop()`：停所有 cron job（graceful shutdown）。
- `listJobs()`：`[{ workflowId, cron, nextRun }]`（给 UI 显示 next-run）。
- cron 引擎见决策 D1。

### 2.4 接线
- 调度器**不在 `createApp` 内启动**（测试不希望 cron 真跑）；在 `main.js start()` 里 `scheduler.start()`，
  `gracefulShutdown` 里 `scheduler.stop()`。createApp 只构建（deps 暴露 scheduler 实例，start 由 main 触发）。
- configWatcher 变更 → `scheduler.reload()`。

### 2.5 API（给 automation UI）
- `GET /workflows` list 项加 `trigger`（cron 或 null）。
- `GET /workflows/schedules` → `scheduler.listJobs()`（workflowId/cron/nextRun）。
- （前端 automation 显示 trigger badge + next-run 放**第 2 轮**，本轮先后端。）

---

## 3. 修改范围

| 文件 | 改动 | 阶段 |
|---|---|---|
| `workflowEngine/workflowSchema.js` | 加 `trigger` 字段 | SPEC |
| `configManager/configSchema.js` | YAML→def 透传 `trigger` | SPEC |
| `workflowEngine/scheduler.js` | **新建** 调度器 | CODE |
| `apiGateway/controllers/workflowController.js` | 抽 `enqueueWorkflowExecution`；list 加 trigger；加 `/schedules` | CODE |
| `workflowEngine/workflowRegistry.js` | list 项带 `trigger`（已存 def，透出即可） | CODE |
| `main.js` | start/stop scheduler + configWatcher 接 reload | CODE |
| `package.json` | + cron 库（见 D1） | CODE |
| `tests/unit/scheduler.test.js` | **新建** 调度器单测（假定时器） | CODE |
| 1 个示例 workflow YAML | 加个带 `trigger.cron` 的样例验收 | CODE |

---

## 4. 风险评估

- **新依赖**（cron 库）+ 新子系统 + 改全局启动流程（main.js）——大改动。
- **测试隔离**：scheduler 只在 `main.js` start，`createApp` 不启 → 现有 562 测试不受 cron 影响。新单测用假定时器。
- **契约变更**：`WorkflowSchema` 加可选字段，`.strict()` 下旧 workflow（无 trigger）仍合法（optional）。
- **重叠执行**：同一 workflow 上次还没跑完下次 cron 又到 → 本轮**允许重叠**（各自 enqueue），属已知简化，
  后续可加「skip if running」。
- 验证：全量 jest（562+ 不破）+ 新 scheduler 单测 + headless 起后端跑一个 `*/1 * * * *` 样例确认真触发 +
  `GET /workflows/schedules` 返 nextRun。

---

## 5. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | cron 引擎 | **`node-cron`**（轻、成熟、自带定时器，`cron.schedule(expr, fn)`）。备选 `cron-parser`+自管 setTimeout（更多控制但更多代码）。先 GitHub/npm 核可用性再定 |
| D2 | trigger 契约形态 | **最小 `trigger:{cron}`**（有 cron=调度，无=手动）。不做富 trigger 对象，event/webhook 留未来 |
| D3 | 调度器启动位置 | **`main.js` start()**，createApp 不启（保测试干净）；configWatcher 驱动 reload |
| D4 | 本轮范围 | **只做后端**（契约+调度器+API+测试+样例）。automation 前端显示 trigger/next-run 放第 2 轮 |
| D5 | 时区 | cron 按**服务器本地时区**（node-cron 默认）；文档/.env 注明。需要再加 tz 配置 |

提交：SPEC 与 CODE 各阶段验证过自动 commit + push（按现行偏好）。

---

## 6. 执行顺序（CONFIRM 后）

1. **SPEC**：`workflowSchema` + `configSchema` 加 `trigger` 契约 → 跑 jest 确认不破
2. 抽 `enqueueWorkflowExecution`（重构 triggerExecute，行为不变）→ jest
3. 装 cron 库 + `scheduler.js` + 单测（假定时器）
4. workflowController：list 加 trigger + `/schedules` 端点；main.js start/stop + reload 接线
5. 加带 cron 的样例 workflow → headless 起后端实测自动触发 + `/schedules` 返 nextRun
6. 全量 jest + eslint → 自动 commit + push
7. （第 2 轮）automation 前端显示 trigger badge + next-run
