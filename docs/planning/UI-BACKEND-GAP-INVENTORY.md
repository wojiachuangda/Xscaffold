# UI ↔ 后端缺口清单

> **用途**：盘点「UI 已有占位/控件、但后端没有对应 API/契约」的部分，供决定补哪些后端。
> **核对依据**：全量扫 `WEBUI/views/*.js` + 亲验 `server.js` / `workflowSchema.js` /
> `observabilityController.js` / `executionSchema.js` / `agentSchema.js` 等。
> **日期**：2026-05-21。

---

## 总览

- **已接线完成（不在本清单）**：Projects 视图（`8738ab8`）、inbox 详情 trace（`a88e81f`）。
- **本清单** = UI 上有控件/区块，但**后端契约里数据根本不存在**，要呈现真数据必须先做后端开发
  （新端点 + 新 Zod 契约 + 可能新表/字段/子系统），不是前端接线能解决的。
- 共 4 块：runtime 视图、automation 视图、agents 视图、inbox 操作按钮。

---

## 1. runtime 视图（`WEBUI/views/runtime.js`）

> ⚠️ 根本性问题：本应用是**单 Express 进程**。runtime 视图却按「多运行时」建模（列表 + 逐 runtime
> 详情）。这不只是缺后端，是 **UI 模型与系统实际形态不符**——补后端前先决定 runtime 视图要不要重新设计。

| UI 区块 | 现状 | 缺的后端 | 工程量 |
|---|---|---|---|
| runtime 列表（`RUNTIMES`） | 硬编码假列表 | 无「运行时注册表」概念。需新建 runtime/instance 注册子系统 + 列表端点。**或**承认单进程、改视图为单运行时 | 大（或改为不需要） |
| Health Checks（6 服务 + 延迟） | 硬编码 `HEALTH` | `/readyz` 仅 db/queue 两个布尔。需扩 readiness：每依赖一条 check + latency | 中 |
| Live Logs（`LOGS`） | 硬编码日志行 | 无任何日志查询/流式端点。需新建日志端点（查询或 SSE 流） | 中-大 |
| Uptime / Heartbeat / Workload / Memory | 硬编码 + `SPARK` 假时序 | `/metrics` 是 Prometheus 文本、仅 4 个业务指标（无进程指标）。需加进程指标端点（JSON：uptime/mem/负载），时序还需采样存储 | 中-大 |

**唯一已是真的**：`/healthz` 的 `uptime`、`/readyz` 的 db/queue 布尔。

---

## 2. automation 视图（`WEBUI/views/automation.js`）

> workflow **列表**和**执行历史**已是真数据。缺口集中在触发器/调度/绑定。

| UI 区块 | 现状 | 缺的后端 | 工程量 |
|---|---|---|---|
| 触发器类型 badge（cron/webhook/event/manual） | `inferTrigger()` 靠 workflow id 字符串猜 | `WorkflowSchema`（`workflowSchema.js:60-70`，`.strict()`）**无 trigger/cron/schedule/webhook 字段**。需改 workflow 契约 + YAML 加载器 + configSchema | 中 |
| Schedule（cron 表达式 / next-run） | 硬编码 `*/5 * * * *` | 同上 + 需一个**调度子系统**（cron 解析 + next-run 计算 + 实际触发）。webhook 已有 `webhookController`，但与 workflow 的绑定无契约 | 大 |
| Linked Agent（绑定的 agent） | 文案占位 | agent 绑定只存在于 node 定义里（`AgentNodeSchema.agentId`），但 `GET /workflows` list 返回 `{id,name,version,description,nodeCount}`——**剥掉了 nodes**。需加「返回单个 workflow 完整定义（含 nodes）」端点 | 小 |
| Issue Output Mode 开关 | 假开关 | 无对应配置项/契约 | 小（需定义语义） |
| Spark 时序 | 硬编码 `SPARK` | 无时序数据源 | 中 |

---

## 3. agents 视图（`WEBUI/views/agents.js`）

> agent **列表 / profile / tools** 已是真数据（`GET /agents`）。缺口是详情下半部两个区块。

| UI 区块 | 现状 | 缺的后端 | 工程量 |
|---|---|---|---|
| Active Tasks（`MOCK_TASKS`） | 硬编码假任务 | 无「agent 任务」概念。`GET /agents/:id` 只返 agent 实体。执行记录 `ExecutionListQuerySchema`（`executionSchema.js`）**不支持 `agentId` 过滤**；IOOR 也只有 `listByExecution`。需加 agent 维度的执行/调用历史端点（先给执行记录加 `agentId` 列与过滤，或建 agent-task 概念） | 中 |
| Execution History（时间线） | （同属上面，agents 详情若要展示历史） | 同上——需 agent 维度查询 | 中 |
| Automation Ownership（`MOCK_AUTOMATIONS`） | 硬编码 | 需「哪些 workflow 引用了此 agentId」反查端点（依赖 §2 的「完整 workflow 定义」端点 + 一个 node 扫描） | 小-中 |

---

## 4. inbox 操作按钮（`WEBUI/views/inbox.js`）

| UI 控件 | 现状 | 缺的后端 | 工程量 |
|---|---|---|---|
| `Acknowledge` 按钮 | `disabled` 占位 | 无「issue」实体、无 acknowledge 概念。需给 execution 加可注解状态（acknowledged）或建独立 issue 实体 + 端点 | 中 |
| `Resolve` 按钮 | `disabled` 占位 | 同上——需 resolve 状态流转 + 端点（注意：execution 状态机已有 SUCCESS/FAILED/STUCK/TIMEOUT，"resolved" 是运维注解层，不应混进执行状态机） | 中 |

---

## 工程量与建议（仅供参考，最终由用户决定）

| 优先级 | 项 | 理由 |
|---|---|---|
| 低成本先摘 | automation「完整 workflow 定义端点」 | 一个端点，立刻让 automation 的 agent 绑定 + agents 的 ownership 反查变可行 |
| 中等、价值清楚 | execution 加 `agentId` 过滤 | 解锁 agents 详情的执行历史；改动局限在 executionSchema + repository |
| 中等、需先定语义 | inbox Acknowledge/Resolve | 需先定「运维注解层 vs 执行状态机」边界，再加端点 |
| 大、且需先决策 | automation 触发器/调度子系统 | 是一个完整新功能（cron 调度），不是补丁 |
| 大、且模型存疑 | runtime 多运行时 / 日志流 / 进程指标 | 先决定 runtime 视图要不要按单进程重新设计，再谈后端 |

**说明**：runtime 视图整块都建议先停下来确认产品意图——单进程应用是否真的需要「多运行时」UI。
其余 3 块的后端是清晰的功能开发，可逐项决定。
