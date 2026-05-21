# PLAN — runtime 视图重做 + Live Logs 后端

> 阶段：PLAN（等待 CONFIRM）
> 输入：美术稿 `UI/runtime.html`（单页系统健康面板）。
> 与 automation/agents 不同：runtime 部分面板的后端**不存在**，需新建。

---

## 1. 现状

美术稿 `UI/runtime.html` 已就绪：单内容区 4 段 = ① Status Row（4 卡）② Engine Activity（4 数字）
③ Health Checks（2 行）④ Live Logs（深色终端 SSE）。

后端盘点：
- ① Status Row：`GET /healthz` → `{status,uptime}`；`GET /readyz` → `{status,checks:{db,queue}}`。**已是 JSON，现成**。
- ③ Health Checks：同 `/readyz` 的 db/queue（无 latency，显 `—`）。**现成**。
- ② Engine Activity：`/metrics` 是 Prometheus 文本；但 `metricsExporter.snapshot()` 能返 JSON 计数。
  → 加个 `GET /metrics/summary` JSON 端点即可，前端不解析文本。**小后端**。
- ④ Live Logs：**后端完全不存在**。Pino 只写 stdout、无日志文件、无日志端点。**需新建**。

---

## 2. 修改范围

### 后端（新建）
| 文件 | 改动 |
|---|---|
| `src/observability/logRingBuffer.js` | **新建**：内存环形缓冲（最近 ~500 行）+ 订阅/通知机制（push 时通知 SSE 订阅者） |
| `src/observability/logger.js` | 改造：日志输出经 `pino.multistream` 同时写 stdout + ring buffer（见决策 D1） |
| `src/apiGateway/controllers/logsController.js` | **新建**：`GET /logs`（快照）+ `GET /logs/stream`（SSE 实时 tail，复用 `apiGateway/sse.js`） |
| `src/apiGateway/server.js` | 挂 `/logs` 路由（protected）；`/metrics/summary` 见下 |
| `src/observability/metricsExporter.js` | 扩 `snapshot()` 或加 `summary()`：暴露聚合 `{nodesExecuted,toolCalls,llmTokens,workflowRuns,workflowDurationAvgMs}`（需 duration sum，当前 snapshot 只有 count） |
| `src/apiGateway/controllers/observabilityController.js` | 加 `GET /metrics/summary` JSON（exporter.summary() + `process.uptime()`） |

### 前端（重写）
| 文件 | 改动 |
|---|---|
| `WEBUI/views/runtime.js` | **重写**：单页面板（搬 `UI/runtime.html` 结构）。删多运行时列表/假 logs/假 spark/假 6 服务表 |

前端数据流：
- 进入视图：并行 `GET /healthz` + `/readyz` + `/metrics/summary` → 渲染 ①②③。
- Live Logs：先 `GET /logs` 快照填充，再 `GET /logs/stream` SSE 持续追加（复用 `lib/sseClient.js`）。
- runtime 在 POLL_VIEWS 内 → ①②③ 每 5s 刷新；Live Logs 走 SSE 持续流（不靠 poll）。Pause 按钮停自动滚。

### 安全
- 日志经 Pino redact（password/token/cookie 等）已脱敏 → 流浏览器安全（契合 AA-SEAC §4.5）。
- `/logs`、`/logs/stream` 挂在 protected 路由（authMiddleware）；dev `AUTH_DISABLED` 开放，prod 需 token。

---

## 3. 风险评估

- **最大风险 = 改 logger**：logger 是全局基础设施，改坏影响一切。决策 D1 选最小风险方案；改完跑全量 jest
  确认 562+ 不破、且日志仍正常输出。
- Live Logs 是**内存环形缓冲**（重启即空、最近 ~500 行）——符合"实时尾部"用途，非全量历史。
- runtime 在 POLL_VIEWS：①②③ 5s 刷新；SSE 长连接需在视图切走时关闭（避免泄漏，复用 sseClient 的取消）。
- Engine Activity 在 dev 可能数字很小/为 0（没怎么跑 workflow）——诚实显示真实计数。
- 验证：jest 全量 + headless curl `/healthz`/`/readyz`/`/metrics/summary`/`/logs` + ESM + serve；
  Live Logs 实时性需浏览器眼验。

无新 Zod 业务契约（SSE 事件可复用/扩 sseEventSchema 或日志走简单帧）→ SPEC 视实现，轻量。

---

## 4. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | Live Logs 怎么挂到 Pino | **`pino.multistream([stdout/pretty, ringStream])`**，ring 在主线程（HTTP 端点可读）。**代价**：放弃 V1.8 worker-thread 异步日志 transport。理由：worker 异步只在高吞吐有意义，个人单用户应用可接受；换来 Live Logs。CHANGELOG/配置注明此取舍 |
| D2 | Engine Activity 数据 | **加 `GET /metrics/summary` JSON**（exporter.summary() + uptime），前端不解析 Prometheus 文本。需给 exporter 补 duration sum |
| D3 | Health Checks 的 latency 列 | 显 `—`（`/readyz` 无 latency）。本期**不**扩 readyz 测延迟，避免范围蔓延 |
| D4 | Live Logs 帧格式 | ring 存**已格式化的结构**（`{ts,level,msg}`），`/logs` 返数组、`/logs/stream` 每行一个 SSE event。前端按 level 配色（term-info/warn/err/ok） |

提交：验证通过后自动 commit + push（按现行偏好）。建议**后端一个 commit、前端一个 commit**（逻辑分离，便于回滚 logger 改动）。

---

## 5. 执行顺序（CONFIRM 后）

1. 后端 `logRingBuffer.js` + 改 `logger.js`（multistream + 喂 ring）→ **跑全量 jest 确认 logger 没改坏**
2. `logsController.js`（`/logs` + `/logs/stream` SSE）+ 挂路由 → headless curl `/logs`
3. `metricsExporter.summary()` + `/metrics/summary` 端点 → headless curl
4. 后端自动 commit + push
5. 前端重写 `runtime.js`（搬稿 + 接 4 段）→ ESM + serve + headless curl 各端点
6. 前端自动 commit + push
7. 回报 + 用户浏览器眼验（尤其 Live Logs 实时流）
