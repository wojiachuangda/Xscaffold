// [planner] ID: PLAN-P5 | Date: 2026-05-18 | Description: P5 阶段（记忆与可观测性）实施前的现状/范围/风险评估，等待 CONFIRM

# P5 实施计划 — memoryManager + observability + 有界自愈

> 触发：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE。

---

## 1. 当前现状分析

### 1.1 已有能力（P0–P4 完成）
- workflowEngine 已能编排 Agent/工具/条件节点，输出注入 context 但**不持久化中间过程**。
- `runAgentNode` 调用 `llmClient.chat` 时**未注入历史对话**，每次都是无状态调用。
- `openaiClient` 已抓取 `reasoning_content` + `tokenUsage.cached_prompt_tokens`，但只在内存返回，**未落库**。
- `executions` 表只记录工作流终态（status / result / error）；**节点级 trace 无存储**。
- Pino logger 已具备字段级脱敏，但**未在 IOOR 落库前应用**。
- 重试逻辑只覆盖节点级失败（指数退避），**没有针对 LLM 输出契约失败的自愈机制**。

### 1.2 缺口（P5 待补）
| 缺口 | 影响 / PRD 对应 |
|------|---------|
| 多轮对话历史无存储 | US-01 客服多轮、§4.5 记忆窗口 |
| IOOR 数据不沉淀 | AA-SEAC §4.2 全量追踪、§4.4 角色画像版本化 |
| 节点级 trace 不可查询 | NFR §5.4 "可获取最近 10 次工作流执行的详细 trace" |
| 无 metrics 接口 | NFR §5.4 Prometheus 导出 |
| LLM 输出格式错就直接失败 | AA-SEAC §5 有界自愈（≤2 次）、STUCK 锁死 |
| 敏感字段可能落库 | AA-SEAC §4.5 存储前脱敏 |

---

## 2. 修改范围评估

### 2.1 新建文件
| 路径 | 用途 | 任务 |
|------|------|---------|
| `src/memoryManager/memorySchema.js` | message/session Zod 契约 | T5.1 SPEC |
| `src/memoryManager/memoryRepository.js` | messages 表 CRUD（Repository 模式） | T5.1 |
| `src/memoryManager/memoryStore.js` | 业务编排（saveMessage/getHistory/clearSession） | T5.1 |
| `src/observability/ioorSchema.js` | IOOR 记录 Zod 契约 | T5.3 SPEC |
| `src/observability/ioorRecorder.js` | I/O/A/R 原子落库 + 脱敏前置 + 审计降级 | T5.3 |
| `src/observability/ioorRepository.js` | ioor_records 表 CRUD | T5.3 |
| `src/observability/traceCollector.js` | startTrace/endTrace/addSpan 接口 | T5.4 |
| `src/observability/traceRepository.js` | node_traces 表 CRUD | T5.4 |
| `src/observability/metricsExporter.js` | Prometheus 文本格式生成器 | T5.4 |
| `src/observability/profileHash.js` | Agent 画像 SHA-256 计算工具 | T5.3 (画像版本化) |
| `src/domain/audit/auditRepository.js` | IOOR 落库失败时的降级通道 | T5.3 |
| `src/workflowEngine/selfHealing.js` | 有界自愈控制器（计数 + 重投喂 + STUCK） | T5.6 |
| `src/apiGateway/controllers/observabilityController.js` | GET /executions/:id/trace + /metrics | T5.5 |
| `src/infrastructure/database/migrations/003_create_messages.sql` | messages 表 | T5.1 |
| `src/infrastructure/database/migrations/004_create_traces.sql` | node_traces 表 | T5.4 |
| `src/infrastructure/database/migrations/005_create_ioor.sql` | ioor_records 表 + audit_dead_letters 表 | T5.3 |
| 10+ 对应 `tests/*` 测试 | 各任务 |

### 2.2 改动现有文件
| 路径 | 改动点 | 风险 |
|------|--------|------|
| `src/workflowEngine/nodeRunner.js` | runAgentNode 注入历史 + 触发自愈 + 调用 ioorRecorder | 中（影响现有 11 测试） |
| `src/workflowEngine/workflowExecutor.js` | executor 收 `executionId` + 转交 traceCollector | 中 |
| `src/apiGateway/server.js` | 注入新依赖（memory/trace/ioor），挂载新路由 | 低 |
| `src/observability/logger.js` | 暴露 `redactSensitive` 供 IOOR 复用（已存在） | 0 |
| `src/infrastructure/llmClient/openaiClient.js` | 抓取更细元数据（model_provider / 自愈次数） | 低 |

### 2.3 关键设计决策（7 项）

#### D1 — 记忆存储介质
- **方案 A**：messages 表落 SQLite（同库），简单；MVP 默认
- **方案 B**：Redis 存近期窗口 + SQLite 存长期归档
- **建议**：**A**；保持 Repository 抽象，V1 接 Redis 零侵入

#### D2 — 记忆注入策略
- 选项：(a) 全量近 N 条；(b) 按 token 上限截断；(c) 摘要+近 K 条
- **建议**：本阶段仅做 **(a)**，受 `MEMORY_WINDOW_SIZE` 控制；摘要器 `contextSummarizer` 接口预留，实现延后 V1.5

#### D3 — trace 持久化
- 选项：(a) 内存 MVP + DB V1.5；(b) SQLite 从 day1
- **建议**：**(b)**，避免后期数据补录；表结构同时支持后续 OTel SDK 接入

#### D4 — metrics 格式
- **建议**：Prometheus 文本格式（`/metrics`），先实现 4 个核心指标：
  - `workflow_duration_ms{workflow,status}` Histogram
  - `tool_call_total{tool}` Counter
  - `llm_tokens_total{model,kind}` Counter（kind=prompt/completion/cached）
  - `nodes_execution_total{type,status}` Counter

#### D5 — IOOR 脱敏策略
- **建议**：默认字段名匹配（复用 `redactSensitive`）；额外允许 agent 定义 `redactPaths` 白名单覆盖；脱敏发生在**写入前**

#### D6 — 自愈触发点
- 选项：(a) LLM 调用层（openaiClient）；(b) 节点层（nodeRunner.runAgentNode）；(c) workflow 层
- **建议**：**(b)** — 节点层最合适，因为契约校验失败需要拿到 agent 的 expected schema（若未来 Agent 定义 outputSchema），且自愈次数应归属于"节点执行"语义。MVP 阶段触发条件：LLM 返回内容为空 / JSON 期望但解析失败

#### D7 — Profile hash 计算输入
- SHA-256 输入字段：`model` + `tools.sort().join(',')` + (待预留) `systemPrompt`
- **建议**：实现 `profileHash.js` 工具，IOOR 记录强制绑定该 hash；当 Agent 字段变化时 hash 自动变

---

## 3. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解措施 |
|--------|------|---------|
| nodeRunner 改造引起 11 个相关单测全红 | **必然** | 改造前先把现有 mock 升级为支持 ioorRecorder 注入（默认 no-op） |
| IOOR 同步落库阻塞 LLM 响应延迟 | 中 | `recordAsync()` 投递后立即返回；失败走 audit 降级 |
| messages 表无限增长占满磁盘 | 中 | 提供 `clearSession(sessionId)`；预留 `TTL` 字段；本阶段不做后台清理 |
| 自愈重投喂可能死循环 | **必然** | 计数器在 selfHealing 模块内强制 ≤ 2；通过纯函数实现，单元测试覆盖 |
| metrics 端点暴露内部指标 → 安全风险 | 低 | `/metrics` 加豁免后单独鉴权（可配置 metricsToken），默认开放给本机 |
| 现有 P4 gateway E2E 中的 stub LLMClient 返回结构变化 | 低 | 保持向后兼容；新增字段为可选 |
| trace 写入与执行并发竞争 | 低 | trace 表用 execution_id+node_id 复合主键；写入幂等 |
| SQLite WAL 模式下大量小事务影响吞吐 | 低 | 批量缓冲 100ms 或 50 条写一次（V1.5 优化），MVP 单条 |

---

## 4. 实施顺序与里程碑

```
T5.1 memoryStore ──┐
                   ├─> T5.2 集成到 nodeRunner ──┐
                   │                            │
T5.3 ioorRecorder ─┤                            ├─> T5.5 trace 查询 API
                   │   (含 profileHash)         │
                   ├──> T5.6 自愈控制器 ─────────┘   + Prometheus /metrics
                   │
T5.4 traceCollector ┘
   + metricsExporter
```

里程碑：
- **M5.A**：T5.1 + T5.2 完成 → Agent 节点支持多轮对话
- **M5.B**：T5.3 + T5.4 完成 → 所有 LLM/工具调用 IOOR 落库 + trace 表填充
- **M5.C**：T5.5 + T5.6 完成 → trace 可查询、metrics 可拉取、自愈兜底 STUCK

---

## 5. 验收标准（DoD）

- [ ] **US-01 多轮**：连续两次 execute 同一 agent + sessionId，第二次 LLM 收到的 messages 包含第一次的历史
- [ ] **US-04 IOOR**：`GET /workflows/executions/:id/trace` 返回完整 IOOR 时序链
- [ ] **脱敏**：插入 `{ apiKey: 'sk-xxx' }` 到 LLM input，落库后查询为 `[REDACTED]`
- [ ] **profile_hash**：修改 agent.model 后 hash 改变，trace 绑定的 hash 不一致
- [ ] **自愈**：模拟 LLM 连续返回空字符串 → 重试 2 次后节点状态 STUCK
- [ ] **metrics**：`GET /metrics` 返回 Prometheus 文本，含 4 个核心指标
- [ ] **覆盖率**：整体 ≥ 80%；新增模块单测全绿
- [ ] `npm run lint` 0 error；所有新文件含 AA-SEAC 头注释

---

## 6. 待 CONFIRM 的决策点

| # | 决策 | 推荐 |
|---|------|------|
| D1 | 记忆存储 | SQLite 同库，Repository 抽象 |
| D2 | 记忆注入策略 | 全量近 N 条；摘要器接口预留 |
| D3 | trace 持久化 | SQLite 从 day1 |
| D4 | metrics 格式 | Prometheus 文本，4 个核心指标 |
| D5 | IOOR 脱敏 | 字段名匹配 + Agent 自定义 redactPaths 覆盖 |
| D6 | 自愈触发点 | 节点层（runAgentNode）；MVP 触发条件：空返回 / JSON 期望解析失败 |
| D7 | profile_hash 输入 | model + tools 列表 + 预留 systemPrompt |

**附加问题**：
1. IOOR 落库失败时 `audit_dead_letters` 表的保留期限？建议**永久**直到人工干预
2. `messages` 表是否包含 tenant_id 列预留？建议**是**（V2 多租户铺路）
3. metrics 端点是否豁免 JWT？建议**是**（监控系统通常用单独 token / mTLS），引入 `METRICS_TOKEN` 环境变量

---

**请回复 CONFIRM（可附上对 D1–D7 + 附加问题的调整）后进入 SPEC。**
