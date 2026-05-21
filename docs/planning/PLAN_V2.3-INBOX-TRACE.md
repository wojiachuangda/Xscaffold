# PLAN — inbox 接真 trace + runtime/automation/agents 后端缺口清单

> 阶段：PLAN（等待 CONFIRM）
> 用户裁定：接已有的（inbox）；后端没有的列清单告知，是否补由用户决定。

---

## 1. 现状

`WEBUI/views/inbox.js`（254 行）：
- issue 列表 ← `state.executions` 过滤 FAILED/STUCK/TIMEOUT —— **已是真数据**（非 mock）。
- 详情 `summarySectionHtml` —— 用 `execution.error/durationMs/...` —— **已是真数据**。
- 详情 `traceSectionHtml()` 两张卡 —— **mock**：
  - 「Execution Trace」← `MOCK_TRACE`（5 步假数据）
  - 「Runtime Events」← `MOCK_EVENTS`（3 行假数据）

真端点：`GET /workflows/executions/:id/trace`（`observabilityController.js:29-43`，已挂 `/workflows/executions` 下）
→ `{success,data:{executionId, spans[], ioor[]}}`：
- `spans` = `node_traces` 行：`{id,executionId,nodeId,nodeType,status,startedAt,finishedAt,durationMs,attempt,output,error}`
- `ioor` = IOOR 记录：`{id,nodeId,turnIndex,agentId,modelName,modelProvider,toolCalls,observations,tokenUsage,latencyMs,createdAt}`

---

## 2. 修改范围（只动 `inbox.js`，单文件，预计 ~290 行 ≤500）

- 删 `MOCK_TRACE` / `MOCK_EVENTS` / `EV_DOT`。
- 加 `import { api }`；加按 executionId 缓存的 `traceCache`（inbox 在 POLL_VIEWS，5s 重渲染——缓存避免每 tick 重复 fetch）。
- 选中 issue → 异步 `GET /…/:id/trace`：先渲染 trace 区为「loading」，拿到后只重渲染该区。
- 「Execution Trace」卡 ← 真 `spans`（节点步骤：nodeId/nodeType/status/durationMs，error 可展开）。
- 第二张卡 ← 真 `ioor`，**卡名改为「IOOR Turns」**（诚实：后端没有"runtime events"流，`/trace` 给的就是 spans+ioor，用 ioor 是"接已有的"）。
- trace fetch 失败 → 该区显示错误行，不影响 issue 列表。

**重要 caveat**：`seed-executions.js` 只灌 executions 行，**不灌 node_traces/ioor**。所以 dev DB 里 seed 出来的
issue，`/trace` 会返回**空 spans + 空 ioor** → inbox 详情 trace 区会诚实显示「无 trace 记录」。
真实跑过 workflow 引擎的 execution 才有 trace。这是真数据的诚实结果，不是 bug。

无 Zod 契约变更 → SPEC 阶段 N/A。

---

## 3. 后端缺口清单（runtime / automation / agents —— 是否补由用户决定）

逐 mock 区块核对，**这些后端契约里数据根本不存在**，要"接真数据"必须先新建后端：

### runtime（几乎全 mock）
| mock 区块 | 缺口 |
|---|---|
| runtime 列表 | 无"运行时注册表"概念——后端是单 Express 进程。需新建 runtime/instance 注册 + 列表端点 |
| Health Checks（6 服务 + 延迟） | `/readyz` 只有 db/queue 两个布尔；要 6 服务 + latency 需扩 readiness 探针 |
| Live Logs | 无日志流端点。需新建日志查询/流式端点 |
| Uptime/Heartbeat/Workload/Memory | `/metrics` 是 Prometheus 文本，仅 4 个业务指标（无进程指标）。需加进程指标端点（JSON） |

### automation（触发器/绑定全 mock）
| mock 区块 | 缺口 |
|---|---|
| cron / 触发器类型 | `WorkflowSchema` 是 `.strict()`，**根本没有 trigger/cron/schedule 字段**。需改 workflow 契约 + 加载器 + 一个调度概念 |
| next-run | 同上，依赖触发器契约 |
| Linked Agent 绑定 | agent 绑定只在 node 定义里（`AgentNodeSchema.agentId`），但 `GET /workflows` list 把 nodes 剥掉了。需加"返回完整 workflow 定义（含 nodes）"的端点 |
| Spark 时序 | 无时序数据源 |

### agents（两区块全 mock）
| mock 区块 | 缺口 |
|---|---|
| Active Tasks | 无"agent 任务"概念；执行记录 `ExecutionListQuerySchema` 不支持 `agentId` 过滤；IOOR 无按 agent 的路由。需加 agent 维度的执行/任务查询端点 |
| Automation Ownership | 需"哪些 workflow 引用了此 agentId"的反查端点（依赖上面 workflow 完整定义端点） |

**这些都不是"UI 接线"，是后端功能开发（新端点 + 新 Zod 契约 + 可能新表/字段）。是否做、做哪些，你定。**

---

## 4. 风险评估

- 只动 inbox.js 一个文件，纯前端，不碰后端、不碰其它视图。
- inbox 在 POLL_VIEWS：trace 按 id 缓存，poll 重渲染不重复 fetch；只首次选中某 issue 才 fetch。
- seed issue 无 trace 数据 → 诚实空态（见 §2 caveat）。
- 验证：headless `curl /trace` 确认形态；浏览器眼验需选一个真有 trace 的 execution（可能需先跑一个真 workflow）。

---

## 5. 执行顺序（CONFIRM 后）

1. 改 `inbox.js`：删 mock、加 api/缓存、spans+ioor 渲染、异步加载
2. headless：`curl /workflows/executions/<id>/trace` 验形态 + ESM 语法 + WEBUI serve
3. 回报 + 你眼验（含 §2 空态说明）+ 定 commit/push
4. runtime/automation/agents 后端缺口（§3）等你决定
