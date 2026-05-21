# Xscaffold 后端 API 与能力总览

> 整理日期：2026-05-21 ｜ 依据：`server.js` 路由装配 + 各 controller 实际定义逐一核对。
> 本文是后端「提供了什么」的参考清单，非教程。

---

## 0. 通用约定

- **响应契约（envelope）**：所有路由统一返回
  - 列表：`{ success: true, data: [...], meta: { total, limit, offset } }`
  - 单体：`{ success: true, data: {...} }`
  - 错误：`{ success: false, error: { code, message } }`（由全局错误中间件兜底，Controller 不手拼错误）
- **入参校验**：进入 Controller 前经 Zod 中间件强校验（`validate({ params, query, body })`），非法直接拒。
- **认证**：业务路由挂在全局 `authMiddleware`（JWT `Authorization: Bearer`）后；开发期可
  `AUTH_DISABLED=true` 全放行。`/healthz`、`/readyz` 公开；`/metrics` 走独立 token 守卫。
- **限流**：滑动窗口内存限流（IP/sub 双粒度，可 bypass）。
- **数据库**：sqlite / postgres 双驱动（`DATABASE_URL` 切换）；状态/时间走标准列、高变 payload 走 JSONB。

---

## 1. Agents `/agents` —— 智能体管理 + 调用

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/agents` | 创建 agent |
| GET | `/agents` | 列出 agent（分页/过滤） |
| GET | `/agents/:id` | 取单个 agent |
| PUT | `/agents/:id` | 更新 agent |
| DELETE | `/agents/:id` | 删除 agent |
| POST | `/agents/:id/invoke` | **调用 agent**：agentic 工具调用循环，同步返回 `{ content, turns[], tokenUsage, stopReason }` |
| POST | `/agents/:id/invoke/stream` | 同上，**SSE turn 级流式**（start → turn×N → done；传输前脱敏） |

Agent 实体：`{ id, name, description, model, tools[], status(enabled/disabled), createdAt, updatedAt }`。

invoke body：`{ prompt, sessionId? }`（`.strict()`，多余字段 400）。

**长会话记忆（V2.6）**：携 `sessionId` 时，invoke 前置该 session 的历史对话喂回 LLM，并把本轮 user + assistant final content 落库（trace 走 IOOR，不入对话记忆）；不携 `sessionId` 行为等价旧版（无状态）。
- 历史窗口二者取严：`AGENT_HISTORY_MAX_MESSAGES`（默认 20）+ `AGENT_HISTORY_MAX_TOKENS`（默认 8000，估算）。
- **归属隔离**：session 首次写入认领 `owner_id`；跨用户访问他人 session → **404**（不泄漏存在性）。
- 流式 abort：assistant 落库带 `metadata.stopReason='aborted'`。
- 服务端 memoryStore 为唯一权威源——不接受客户端伪造 `history[]`。

---

## 2. Workflows `/workflows` —— 工作流编排

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/workflows` | 列出工作流 `{ id, name, version, description, trigger, nodeCount }` |
| GET | `/workflows/schedules` | 列出受 cron 调度的工作流 `{ workflowId, cron, nextRun }` |
| POST | `/workflows/:id/execute` | 手动触发执行（202 异步入队） |
| GET | `/workflows/executions/:id` | 取执行状态 |
| GET | `/workflows/executions` | 执行列表（分页 + 按 `workflowId` / `status` 过滤） |
| GET | `/workflows/executions/:id/trace` | 执行轨迹：`{ executionId, spans[](节点 trace), ioor[](IOOR 记录) }` |

执行记录：`{ id, workflowId, status(PENDING/RUNNING/SUCCESS/FAILED/STUCK/TIMEOUT), startedAt, finishedAt, durationMs, error, result }`。

---

## 3. Project Assistant `/projects` —— 项目助理域（9 端点）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/projects` | 列项目（status/health 过滤） |
| GET | `/projects/:id` | 项目详情 |
| PUT | `/projects/:id` | 更新项目状态（phase/status/health/completion/summary） |
| GET / POST | `/projects/:id/tasks` | 任务 列表 / upsert |
| GET / POST | `/projects/:id/events` | 事件 列表 / 记录（不可变流水） |
| GET / POST | `/projects/:id/reminders` | 提醒 列表（按到期）/ 创建 |

实体：Project `{projectId,name,phase,status,health,completion,summary}`、Task `{taskId,title,status,priority,notes}`、
Reminder `{reminderId,title,content,dueAt,severity,status}`、Event `{eventId,type,title,content,severity}`。
（URL `:id` 与 body.projectId 一致性校验。）

---

## 4. Webhooks `/webhooks`

| POST | `/webhooks/github` | GitHub Webhook：HMAC-SHA256 签名校验 + 时间窗防重放 → 入队 → 触发工作流 |

---

## 5. 可观测 / 运行时

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/healthz` | 存活：`{ status:'ok', uptime }`（公开） |
| GET | `/readyz` | 就绪：`{ status, checks:{ db, queue } }`（公开） |
| GET | `/metrics` | Prometheus 文本格式 4 指标（token 守卫） |
| GET | `/runtime/metrics` | 指标摘要 JSON：`{ nodesExecuted, toolCalls, llmTokens, workflowRuns, workflowDurationAvgMs, uptime }` |
| GET | `/runtime/logs` | 日志快照（内存环形缓冲最近 ≤500 行，已脱敏） |
| GET | `/runtime/logs/stream` | 实时日志 SSE（回放快照 + 流式追加） |

---

## 6. 底层能力（API 背后的引擎）

### 6.1 Agentic 循环
LLM 决策 → 解析 `tool_calls` → 白名单校验 + 执行工具 → `observation` 回灌 → 循环（默认 ≤8 轮，无 tool_call 或
达上限即停）。OpenAI 兼容端点（实测 DeepSeek）。每轮全量记 IOOR。

### 6.2 工具注册中心（builtin tools）
- **通用**：`httpRequest`（集成 SSRF 守卫：协议白名单 + 私有 IP 拒绝 + DNS 重绑定校验）、
  `queryDatabase`（只读 SELECT）、`readFile`、`sendEmail`（MVP 仅打日志）、`addNumbers`。
- **项目助理（9）**：`projectGetStatus` / `projectUpdateStatus` / `taskList` / `taskUpsert` /
  `eventRecord` / `reminderCreate` / `reminderListDue` / `projectGenerateDigest` / `externalAgentSend`（白名单 profile + 全程审计）。
- 插件加载器（单插件失败隔离）。

### 6.3 工作流引擎
声明式 YAML/JSON；DAG 拓扑遍历 + 环检测；4 类节点（agent / tool / condition / code）；条件分支裁剪；
逐节点超时 + 重试；**有界自愈**（契约失败重投喂 LLM ≤2 次，超限转 STUCK + 告警）；Token 配额熔断；
独立任务状态机（`transition(state, action)` 纯函数）。

### 6.3b 调度子系统（cron 自动化）
workflow 可声明 `trigger.cron`（YAML/JSON 契约）；`scheduler.js`（croner）在 `main.js` 启动期按 cron
注册定时任务，到点走 `enqueueWorkflowExecution` 自动执行（queue-agnostic，dev/prod 一致）。
`createApp` 只建不启（保测试干净），shutdown 时 stop。本地时区。
`GET /workflows/schedules` 暴露 next-run。
（注：cron 在启动期从 `workflows/` 加载；新增/改 cron 需重启，无 live hot-reload。）

### 6.4 执行与全链路追踪
- 执行记录（executionStore）；节点级 trace（spans）；
- **IOOR 协议**（Input/Output/Action/Response 四元，并发 tool_calls/observations 数组）；批量缓冲落库（有界窗口）；
- Agent 画像 SHA-256 版本化，trace 强绑 `profile_hash`；
- 安全审计死信通道（契约失败仍强写原始 payload）。

### 6.5 可观测
6 个 Prometheus 指标（workflow_duration / tool_call / llm_tokens / nodes_execution /
**llm_history_messages_loaded**(直方图,长会话历史加载条数) / **llm_history_truncated_total**(计数器,截断次数)）；
Pino 结构化日志 + **双脱敏管道**（落库前 + 传输 SSE 前）；内存日志环形缓冲 + SSE。

### 6.6 基础设施
记忆（会话消息 + 窗口截断 + **owner 隔离 + 长会话上下文装载** conversationContext）；
队列（内存 / BullMQ+Redis 双驱动）；数据库（sqlite/postgres 驱动抽象 + 迁移）；
安全（JWT + 限流 + SSRF 守卫 + metrics token timing-safe 比对 + 双脱敏 + 审计死信）；配置热加载（chokidar 监听 `workflows/`）。

---

## 7. UI 接入现状（截至 2026-05-21）

| 后端能力 | UI |
|---|---|
| `/agents`、`/agents/:id/invoke/stream` | ✅ Sessions（调用流式）+ Agents（只读档案） |
| `/projects`（9 端点） | ✅ Projects 视图（读+写） |
| `/workflows`、`/workflows/executions` | ✅ Automation（目录 + 历史 + Run）+ Executions |
| `/workflows/executions/:id/trace` | ✅ Inbox 详情 trace |
| `/runtime/*`、`/healthz`、`/readyz` | ✅ Runtime（状态 + 引擎 + 健康 + Live Logs） |
| `/workflows/schedules`、workflow `trigger.cron` 调度 | 🟡 后端已实现（调度器自动跑）；automation 前端显示 trigger/next-run 待第 2 轮 |
| agent 任务维度查询、inbox ack/resolve | ❌ 后端契约暂无，见 `docs/planning/UI-BACKEND-GAP-INVENTORY.md` |
