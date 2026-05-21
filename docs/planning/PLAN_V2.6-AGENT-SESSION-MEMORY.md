# PLAN V2.6 — Agent 长会话能力（多轮记忆接线）

> 阶段：**PLAN（等待 CONFIRM）** ｜ 性质：**大改动**（改 LLM 上下文构造 + 跨用户隔离 + 新指标，10 项判定命中 ≥5 条）
> 需求来源：`后端需求-长会话能力.md`（F1–F7 / DoD D1–D6 / 开放问题 Q1–Q5）
> 范围边界：**只接多轮记忆**；滚动摘要 / `contextSummarizer.js` / 跨设备同步 / 新 SSE 事件 / 前端改动 = **明确不做（下期）**

---

## 1. 现状分析（已 grep 留底）

| 事实 | 位置 |
|---|---|
| invoke / invoke-stream 把 `sessionId` 塞进 `ctx`，**仅用于 `buildStartEvent`**，不传 LLM | `agentManager/agentController.js:35,56,94` |
| `runAgentLoop` 起手 `[systemMessage, {user, prompt}]`，**不读历史、不落库**；`ctx.sessionId` 只透传给 IOOR | `agentManager/agentRunner.js:24` |
| 记忆能力齐全但 invoke **绕过**：`getHistory`/`saveMessage` 仅 workflow 节点用 | `memoryManager/memoryStore.js`、`workflowEngine/nodeRunner.js:97-166`（**现成模板**） |
| `server.js` 已建 `memoryStore`，**只喂 nodeRunner**，未进 agents invokeDeps，返回 deps 对象里也没有 | `apiGateway/server.js:81,87,297-303` |
| `metricsExporter` 4 指标，histogram 桶是 ms（消息条数需独立桶） | `observability/metricsExporter.js` |
| messages 表有 `tenant_id`（建表注释「预留 V2 多租户」，当前全 null）+ `idx_messages_session`；sqlite/pg 等价；**无 sessions 表** | `migrations/{sqlite,pg}/003_create_messages.sql` |
| abort 可探测：`res.on('close')→closed`，`stream.isClosed()`；但当前 loop 跑到底不检查 | `apiGateway/sse.js:77,94` |
| `InvokeAgentSchema` 已含 optional `sessionId` 且 `.strict()`（多余字段如 `history[]`→400，天然满足 F7） | `agentController.js:18-23` |
| 回归基线 | `tests/e2e/agentInvoke.e2e.test.js`、`tests/integration/agentInvokeStream.integration.test.js`（注入 `mockLLM`，JWT `sub`→ownerId） |

**结论**：能力齐备，本期 = 接线 + 截断 + 跨用户隔离 + 2 指标，**无新表、无新依赖、无 API 契约变更**。

---

## 2. 开放问题决策（Q1–Q5，需你 CONFIRM）

| Q | 决策 | 理由 |
|---|---|---|
| **Q1 归属校验** | invoke 时断言 session 归属：跨 owner → **404 NotFoundError**（不泄漏存在性，对齐 agents 现有 404）；`getHistory` 同时按 owner 过滤做纵深防御 | D5「拒绝或 404」；与多租户既有范式一致 |
| **Q1 owner 存储** | **新增迁移 010 给 messages 加独立 `owner_id` 列**（与 agents 一致），存 `ownerIdOf(req)`；存量行 backfill `'user_dev_default'`（DEFAULT 兜底） | 用户 CONFIRM 选定：语义与 agents 统一，不重载 tenant_id |
| **Q2 截断单位** | **二者取严**：最近 N 条 **且** 估算 token ≤ 上限。默认 `AGENT_HISTORY_MAX_MESSAGES=20` / `AGENT_HISTORY_MAX_TOKENS=8000`（新 env）；token 用启发式（≈chars/4，无新依赖）。**workflow 路径 `MEMORY_WINDOW_SIZE=10` 不动** | 按需求建议默认；隔离 invoke 与 workflow 配置 |
| **Q3 返回形状** | `getHistory` 返实体 → map `{role,content}`（照搬 `nodeRunner.pullHistory`） | 与现有用法对齐 |
| **Q4 清空端点** | `DELETE /sessions/:id/history` **本期不做** | 需求明示可不做 |
| **Q5 system prompt** | 每次新拼 `systemMessage` 于顶部；记忆**只存 user + final assistant**（不存 system/tool/turns） | 延续现有 agentRunner；保证历史是干净 user/assistant 交替 |

> ✅ **已 CONFIRM（2026-05-22）**：走「新增迁移 010 owner_id」路线（用户选定，非复用 tenant_id）。

---

## 3. 修改范围（逐文件）

**SPEC 阶段（契约先发）**
1. `memoryManager/memorySchema.js`
   - `MessageSchema` / `SaveMessageInputSchema` 增 optional `ownerId`；`HistoryFilterSchema` 增 optional `ownerId`
   - 新增 `HistoryConfigSchema`（`maxMessages`/`maxTokens`，含默认 + env 覆盖，AA-SEAC §4.1）

**CODE 阶段**
2. `migrations/{sqlite,pg}/010_alter_messages_owner.sql`（**新迁移**，仿 009）
   - `ALTER TABLE messages ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'user_dev_default'`（pg 加 `IF NOT EXISTS`）
   - `CREATE INDEX IF NOT EXISTS idx_messages_session_owner ON messages(session_id, owner_id, created_at)`
3. `memoryManager/memoryRepository.js`
   - `insertMessage` 写 owner_id（缺省兜底 `'user_dev_default'`，同 agentRepository 范式 → workflow 免传）
   - `rowToEntity` 增 ownerId；`listRecent` 支持 optional owner 过滤（不传则 `WHERE session_id=?` → workflow 不破）
   - 新增 `findSessionOwner(sessionId)`（`SELECT owner_id ... LIMIT 1`，走 session 索引，非全表）
4. `memoryManager/memoryStore.js`
   - `getHistory` 透传 `ownerId`；新增 `getSessionOwner(sessionId)`
4. `memoryManager/conversationContext.js`（**新文件**，≤200 行）
   - `assertSessionOwnership({memoryStore, sessionId, ownerId})` → 跨 owner throw NotFoundError
   - `loadHistory({...})` → getHistory + 二者取严截断 + 指标 + **降级**（getHistory 异常 → 返 `[]` + 结构化 warn，不阻断 invoke，4.2）
   - `estimateTokens()` 启发式
5. `agentManager/agentRunner.js`
   - 起手注入历史：`[systemMessage, ...history, {user,prompt}]`
   - **进 loop 前**落库 user（F4）；finalize 落库 assistant final content（F2/F4）
   - 新增 `shouldAbort` 入参：每轮 chat 后探测 → 命中则 finalize `stopReason='aborted'` + assistant 落库带 `metadata.stopReason='aborted'`（F5）
   - 全部 memory 操作 guard `deps.memoryStore && ctx.sessionId`（无 session → 行为逐字节等价，F3/D2）
6. `agentManager/agentController.js`
   - invokeDeps 注入 `memoryStore` + `metricsExporter`；`ctx.ownerId = ownerIdOf(req)`
   - stream 路径传 `shouldAbort: () => stream.isClosed()`
7. `apiGateway/server.js`
   - 返回 deps 增 `memoryStore`；agents router invokeDeps 增 `memoryStore` + `metricsExporter`
8. `observability/metricsExporter.js`
   - `observeHistoryLoaded(count)`（histogram，条数桶 `[1,2,5,10,20,50,100]`）+ `incrHistoryTruncated()`（counter）；render 出 `llm_history_messages_loaded` / `llm_history_truncated_total`

**文档**
9. `BACKEND-API.md` §1/§6.6 同步；`.env.example` 加 2 新 env（默认注释）；`PROJECT_STRUCTURE.md` 自动刷新

---

## 4. 测试计划（映射 DoD，TDD）

| DoD | 测试 |
|---|---|
| D1 基本记忆 | e2e：注入「读 messages 的 stub」（历史含「张三」则回「张三」）；两轮同 session → 第二轮命中 |
| D2 后向兼容 | 现有 invoke e2e/integration 全绿 + 新增「无 sessionId → 不触 memoryStore + messages 与今日等价」 |
| D3 截断 | 灌 40+ 轮 → 调用成功；spy stub 断言 LLM 实收 messages ≤ 阈值；日志见丢弃 N 条 |
| D4 abort | integration：stream 中途断连 → user 已落库 + assistant 落库 `stopReason='aborted'` |
| D5 跨用户 | e2e：两 JWT(sub=u1/u2)，u2 取 u1 session → 404，不返 u1 历史（仿 `agentMultiTenancy.e2e.test.js`） |
| D6 指标 | 带 sessionId invoke 后 `/metrics` 见 2 新指标且数值合理 |
| 单元 | `conversationContext`（二者取严 / 降级 []）、`memoryRepository`（tenant 过滤 / findSessionOwner）、`agentRunner`（落库时序 / abort） |

---

## 5. 预估破坏的已有业务 + 缓解

| 风险 | 缓解 |
|---|---|
| 现有 invoke 测试（不传 sessionId）回归 | memory 分支仅 sessionId 存在时激活；`memoryStore` 在 runner 内 optional guard |
| workflow 记忆路径（nodeRunner）受 getHistory 签名变更影响 | tenant 过滤仅在传参时生效；workflow 不传 → SQL 不变；`MEMORY_WINDOW_SIZE` 默认不动 |
| `/metrics` 输出新增行，精确匹配的指标快照测试 | 检索并更新相关断言（render 输出会增 2 段） |
| abort 半截 chat 仍在服务端跑完 | MVP 容忍：每轮 chat 后探测，不强行中断在途 fetch（与 sse.js 现注释一致） |
| owner_id 跨路径混用（workflow=`user_dev_default` vs invoke=真 owner） | 二者 sessionId 命名空间不同（workflow 执行派生 vs 客户端 `xscaffold.session.*`）；存量行 backfill `user_dev_default`；workflow insert 兜底同值；PLAN 显式登记 |
| 新迁移 010 在 CI/pg 真路径 | sqlite `ALTER ADD COLUMN` 无 `IF NOT EXISTS`（仿 009 不加）；pg 加 `IF NOT EXISTS`；`bootApp` 的 `migrate({driver})` 自动捡 010 |

**不做**：摘要器 / 跨设备同步 / 新 SSE 事件 / 前端 / 改 API 路径·方法·SSE 序列·envelope·InvokeAgentSchema / 历史导出 / DELETE history。

---

## 6. 工程量

~7 源文件（1 新）+ ~6 测试文件 + 3 文档。无迁移、无新依赖。预估半天～1 天。

---

**请回复 `CONFIRM` 进入 SPEC 阶段（先写 Zod 契约），或对 §2 决策（尤其 Q1 owner 存储）提出调整。**
