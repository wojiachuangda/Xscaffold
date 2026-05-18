// [architect] ID: ARCH-001 | Date: 2026-05-18 | Description: Agentic App Platform 架构设计文档（含分层、模块依赖、数据流、AA-SEAC 合规映射）

# Agentic App Platform - 架构设计文档

> 版本：v1.0 | 日期：2026-05-18
> 配套：`PRD.md`、`task_list.md`、`../开发文档.md`、`../../.claude/rules/AA-SEAC-Specification.md`

---

## 1. 架构总览

### 1.1 设计原则
| 原则 | 落地方式 |
|------|---------|
| 单一职责 | 模块按功能域切分，函数 ≤ 50 行，文件 ≤ 500 行 |
| 依赖倒置 | 业务层依赖 Repository 抽象，不感知存储介质 |
| 契约即代码 | 所有数据流以 Zod Schema 定义，校验前置 |
| 凡动必留痕 | IOOR 协议全量记录 AI 思考-行动-观察 |
| 失败显式化 | Fail-Fast + 有界自愈（≤2 次）+ 人工兜底 |

### 1.2 分层架构（三层解耦）

```
┌──────────────────────────────────────────────────────────────┐
│                  接入层 (Interface Layer)                     │
│   apiGateway · webhookHandler · authMiddleware · CLI         │
└──────────────────────────────────────────────────────────────┘
                              ↓ 调用
┌──────────────────────────────────────────────────────────────┐
│               领域服务层 (Domain Service Layer)               │
│  agentService · workflowExecutor · configLoader              │
│  toolRegistry · memoryManager · traceCollector               │
└──────────────────────────────────────────────────────────────┘
                              ↓ 调用
┌──────────────────────────────────────────────────────────────┐
│              基础设施层 (Infrastructure Layer)                │
│   Repository(SQLite/PG) · Redis · BullMQ · Logger · LLMClient│
└──────────────────────────────────────────────────────────────┘
```

**铁律**：上层依赖下层抽象接口，反向引用禁止。Service 层禁止出现 SQL 字符串。

---

## 2. 模块依赖图

```
                  ┌──────────────┐
                  │  apiGateway  │
                  └──────┬───────┘
                         │
        ┌────────────────┼────────────────────────┐
        ▼                ▼                        ▼
 ┌──────────────┐ ┌─────────────────┐    ┌──────────────────┐
 │ configManager│ │ workflowEngine  │───▶│ observability    │
 └──────┬───────┘ └────────┬────────┘    └──────────────────┘
        │                  │
        ▼                  ▼
 ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
 │   (校验)     │  │ agentManager │  │ toolRegistry │  │memoryManager │
 └──────────────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                          │                 │                 │
                          └─────────────────┼─────────────────┘
                                            ▼
                              ┌──────────────────────────┐
                              │ infrastructure (DB/Redis)│
                              └──────────────────────────┘
```

### 2.1 依赖矩阵
| 模块 | 依赖 | 被依赖 |
|------|------|--------|
| `agentManager` | infrastructure | workflowEngine, memoryManager |
| `workflowEngine` | agentManager, toolRegistry, memoryManager, observability | apiGateway |
| `configManager` | infrastructure (file/storage) | apiGateway |
| `toolRegistry` | infrastructure | workflowEngine |
| `memoryManager` | agentManager, infrastructure(redis/db) | workflowEngine |
| `apiGateway` | workflowEngine, configManager | - (顶层) |
| `observability` | infrastructure(logger) | 所有模块 |

---

## 3. 核心数据流

### 3.1 工作流执行时序
```
Client ──POST /workflows/:id/execute──▶ apiGateway
                                         │
                                         ▼
                                   [JWT 鉴权] → [Zod 入参校验] → [限流]
                                         │
                                         ▼
                              configManager.toWorkflowDef()
                                         │
                                         ▼
                          workflowExecutor.execute(def, ctx)
                              │           │
              ┌───────────────┘           └────────────────┐
              ▼                                            ▼
       拓扑排序 → 节点执行                        [traceCollector.startTrace]
              │
   ┌──────────┼─────────────┬──────────────┐
   ▼          ▼             ▼              ▼
agentNode  toolNode    conditionNode    codeNode
   │          │             │
   ▼          ▼             ▼
[memoryManager.getHistory] [toolRegistry.executeTool]
   │                       │
   ▼                       ▼
[LLMClient.invoke]    [实际工具]
   │                       │
   └────────[IOOR 落库]──────┘
                  │
                  ▼
        [traceCollector.endTrace]
                  │
                  ▼
        返回 executionId + result
```

### 3.2 IOOR 数据流（凡动必留痕）
每轮 Agent 思考-行动-观察必须原子落库：
```
LLM 调用前 → 快照 Input（含 profile_hash, model_name, context）
LLM 调用后 → 抓取 Output（content + reasoning_content + token_usage）
工具调用前 → tool_calls 数组（支持并发）
工具调用后 → observations 数组（与 tool_calls 一一对应）
        ↓
   [脱敏管道] → [Zod 契约校验] → [SQL 主字段 + JSONB Payload] → 写入
        ↓
   失败 → audit 域降级通道（强写 raw JSONB）
```

---

## 4. 关键技术决策

### 4.1 选型决策表
| 决策点 | 选型 | 备选 | 决策依据 |
|-------|------|------|---------|
| HTTP 框架 | Express.js | Fastify | 生态成熟、中间件丰富；性能瓶颈在 LLM 而非框架 |
| 数据库（MVP）| SQLite | PG | 零运维起步，Repository 层抽象后可平滑切换 |
| 数据库（V1+）| PostgreSQL | MySQL | JSONB 原生支持 + GIN 索引契合 IOOR 存储 |
| 队列 | BullMQ + Redis | RabbitMQ | 轻量、Node 生态友好、延迟任务原生支持 |
| 校验 | Zod | Joi/Yup | TS 类型推导一体化、契约即代码 |
| 编排辅助 | 自研 | LangChain.js | 保持工作流引擎可控；LangChain 仅按需借鉴 |
| 模块格式 | CommonJS | ESM | package.json 已固定 `"type": "commonjs"` |
| 日志 | Pino | Winston | 高性能、结构化、生态完善 |
| OTel | @opentelemetry/api | 自研 | 标准协议，兼容性最佳 |

### 4.2 配置驱动而非代码驱动
**理由**：业务流程变化频繁，模型 Prompt 需快速 A/B；代码部署周期长。
**实现**：
- 所有 Agent、工作流、工具均可通过 YAML/JSON 定义
- 配置文件 watcher 实现热加载
- 版本化（profile_hash）保证可追溯与回滚

---

## 5. 目录结构（落地版）

```text
src/
├── apiGateway/              # 接入层
│   ├── server.js               # Express 引导
│   ├── routes/                 # 路由聚合
│   │   ├── agentRoutes.js
│   │   ├── workflowRoutes.js
│   │   └── webhookRoutes.js
│   ├── middlewares/
│   │   ├── authMiddleware.js   # JWT
│   │   ├── validateMiddleware.js # Zod 入参校验
│   │   ├── errorHandler.js     # 全局错误兜底（AppError）
│   │   └── rateLimiter.js
│   └── webhookHandler.js
├── agentManager/
│   ├── agentService.js
│   ├── agentController.js
│   ├── agentRepository.js      # ← Repository 抽象
│   └── agentSchema.js          # Zod
├── workflowEngine/
│   ├── workflowExecutor.js
│   ├── nodeRunner.js
│   ├── taskStateMachine.js     # ← 独立状态机
│   ├── expressionEvaluator.js  # {{ }} 解析
│   └── workflowSchema.js
├── configManager/
│   ├── configLoader.js
│   ├── configWatcher.js
│   └── configSchema.js
├── toolRegistry/
│   ├── toolRegistry.js
│   ├── builtinTools/
│   │   ├── httpRequest.js
│   │   ├── queryDatabase.js
│   │   ├── readFile.js
│   │   ├── addNumbers.js
│   │   └── sendEmail.js
│   ├── pluginLoader.js
│   └── toolSchema.js
├── memoryManager/
│   ├── memoryStore.js
│   ├── memoryRepository.js
│   ├── contextSummarizer.js
│   └── memorySchema.js
├── observability/
│   ├── traceCollector.js
│   ├── metricsExporter.js
│   ├── logger.js               # Pino 封装
│   └── ioorRecorder.js         # ← IOOR 持久化
├── domain/
│   └── audit/                  # 审计降级通道
│       └── auditRepository.js
├── infrastructure/
│   ├── database/
│   │   ├── connection.js       # SQLite/PG 双协议
│   │   └── migrations/
│   ├── redis/
│   │   └── client.js
│   ├── queue/
│   │   └── bullQueue.js
│   ├── llmClient/
│   │   └── openaiClient.js
│   └── errors/
│       └── AppError.js
└── main.js                     # 入口
plugins/                         # 第三方工具插件
tests/
├── unit/
├── integration/
└── e2e/
```

**约束**：
- 每个新建文件**必须**包含 AA-SEAC 规定的文件头注释（`// [{角色}] ID: {} | Date: {} | Description: {}`）
- 文件 ≤ 500 行，超出需拆分
- 单仓库**统一**使用 4 空格缩进与 camelCase 命名

---

## 6. AA-SEAC 合规映射

| AA-SEAC 条款 | 架构落地 |
|------------|---------|
| §1.2 缩进/命名统一 | 项目根 `.editorconfig` + ESLint `airbnb-base` |
| §1.3 单一职责/行数限制 | ESLint `max-lines-per-function: 50` / `max-lines: 500` |
| §1.4 异常处理 | `infrastructure/errors/AppError.js` 基类，禁止空 catch（ESLint 规则） |
| §1.5 文件头注释 | Husky pre-commit 钩子校验注释格式 |
| §1.6 严禁硬编码 | git-secrets / gitleaks 加入 CI；配置统一走 `process.env` |
| §1.6 循环内避险 | Code Review 检查清单 |
| §2 三层目录结构 | 见上方目录树（接入/领域/基础设施严格分层） |
| §3 约束 1：统一响应契约 | `middlewares/errorHandler.js` 全局兜底；Controller 仅抛 `AppError` |
| §3 约束 2：Zod 校验 | `middlewares/validateMiddleware.js` 路由级强制 |
| §3 约束 3：状态机隔离 | `workflowEngine/taskStateMachine.js` 纯函数 + 断言 |
| §3 约束 4：Repository 模式 | 每模块独立 `*Repository.js`，Service 仅调用语义接口 |
| §4.1 代码即契约 | 所有 Schema 以 Zod 定义并导出 |
| §4.2 IOOR 协议 | `observability/ioorRecorder.js` 原子写入 |
| §4.3 混合存储 | DB 主字段 + JSONB Payload；GIN 索引在迁移脚本中创建 |
| §4.3 审计豁免 | `domain/audit/auditRepository.js` 降级通道 |
| §4.4 角色画像版本化 | 启动时计算 SHA-256；trace 强制绑定 `profile_hash` |
| §4.5 双重脱敏 | `observability/logger.js` + `apiGateway` SSE 拦截器 |
| §5 Fail-Fast + 有界自愈 | `workflowExecutor.js` 内置重试计数器，超 2 次锁 `STUCK` |

---

## 7. 关键非功能架构决策

### 7.1 性能
- **LLM 调用并发**：节点级别支持 `parallel: true`，使用 `Promise.allSettled`
- **缓存**：Redis 缓存 Agent 元数据（TTL 5min）、工具定义、Prompt 模板
- **流式响应**：长任务通过 SSE 推送中间状态（脱敏后）

### 7.2 可靠性
- **重试策略**：节点级配置（默认 3 次，指数退避 1s/2s/4s）
- **超时**：节点级 `timeoutMs`，默认 `TOOL_EXECUTION_TIMEOUT_MS=10000`
- **熔断**：工作流级 token 配额，触发后任务转 `STUCK`
- **健康检查**：`/healthz`（liveness）、`/readyz`（依赖检查）

### 7.3 安全
- **JWT**：HS256，密钥从 `JWT_SECRET` 环境变量加载
- **Webhook 签名**：HMAC-SHA256，时间窗口 ±5min
- **插件沙箱**：V1 阶段进程内白名单（API 受限）；V2 探索 isolated-vm
- **审计日志**：所有 4xx/5xx 响应记录调用者 + payload 摘要

### 7.4 可观测性
- **trace**：OpenTelemetry SDK，每个 HTTP 请求 → workflow → node → LLM/tool 形成完整 span 树
- **metrics**：Prometheus pull，关键指标 `workflow_duration_ms`、`tool_call_total`、`llm_tokens_total{model,cached}`
- **logs**：Pino JSON 格式，落 stdout，由 PM2/K8s 统一收集

---

## 8. 演进路线

```
MVP (Sprint 1-2)        V1 (Sprint 3-4)        V2 (Sprint 5+)
─────────────────       ─────────────────      ─────────────────
✓ agentManager          + apiGateway 全功能     + 前端管理后台
✓ workflowEngine 核心   + memoryManager 短期    + 向量数据库长期记忆
✓ configManager         + 插件加载机制          + 多租户隔离
✓ toolRegistry 内置     + Webhook 全协议        + 流式 SSE
✓ 单元测试 ≥ 80%        + IOOR 全量持久化       + OTel 完整接入
                        + Pino 结构化日志       + 工作流可视化编辑
                        + JWT + 限流           + 多模型 Provider 适配
```

---

## 9. 待澄清问题（TBD）
- [ ] 多 LLM Provider 适配抽象层时机（V1 仅 OpenAI 兼容协议是否足够？）
- [ ] 工作流定义的版本管理策略（git-like？数据库版本号？）
- [ ] 插件市场是否纳入路线图
- [ ] 前端技术选型细化（Vue 3 + Pinia + Naive UI？）
