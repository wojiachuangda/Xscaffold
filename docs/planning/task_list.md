// [planner] ID: TASK-001 | Date: 2026-05-18 | Description: Agentic App Platform 任务拆解（按阶段/依赖排序，含 TDD 与验收点）

# Agentic App Platform - 任务拆解清单

> 版本：v1.0 | 日期：2026-05-18
> 配套：`PRD.md`、`architecture.md`
> 执行原则：TDD（先写测试 → 实现 → 重构 → 覆盖率 ≥ 80%）

---

## 阶段总览

| 阶段 | 主题 | 任务数 | 关键交付 |
|------|------|--------|---------|
| **P0 - 基建** | 项目骨架、规范、工具链 | 6 | 可运行的最小服务 + CI |
| **P1 - 核心域** | agentManager + 基础设施 | 7 | Agent CRUD 全链路 |
| **P2 - 编排引擎** | workflowEngine + toolRegistry | 9 | YAML 工作流端到端执行 |
| **P3 - 配置与扩展** | configManager + 插件机制 | 5 | 配置热加载 + 插件示例 |
| **P4 - 接入层** | apiGateway 完整功能 | 6 | JWT + 限流 + Webhook |
| **P5 - 记忆与观测** | memoryManager + observability | 6 | IOOR 落库 + trace 查询 |
| **P6 - 加固与发布** | 集成测试、安全审计、文档 | 4 | MVP/V1 release-ready |

**总计：43 个原子任务**

---

## 阶段 P0：项目骨架与基建

### T0.1 初始化项目结构与依赖
- **依赖**：无
- **交付物**：
  - `src/` 完整目录树（按 `architecture.md` §5）
  - `.editorconfig`、`.eslintrc.cjs`（含 `max-lines:500`、`max-lines-per-function:50`、`no-empty-catch`）
  - `.prettierrc`
  - `package.json` 补全依赖（express, zod, pino, sqlite3/better-sqlite3, dotenv, jest, supertest）
  - `.env.example`（所有全局配置项）
- **验收**：`npm install` 无错；`npx eslint src/` 通过；目录结构与文档一致
- **测试**：N/A（脚手架）

### T0.2 配置 Husky + lint-staged + commit-msg 校验
- **依赖**：T0.1
- **交付物**：
  - pre-commit 触发 eslint --fix + prettier
  - commit-msg 校验文件头注释格式与 conventional commits
- **验收**：手动提交一次 fixture 验证拦截

### T0.3 实现统一错误基类与全局错误中间件
- **依赖**：T0.1
- **交付物**：
  - `infrastructure/errors/AppError.js`（子类：`ValidationError`、`NotFoundError`、`AuthError`、`TimeoutError`）
  - `apiGateway/middlewares/errorHandler.js` 全局兜底
  - 统一响应契约：`{ success, data, error, meta }`
- **验收**：抛 `NotFoundError` → 自动返回 404 + 契约格式
- **测试**：单元测试覆盖所有错误类型映射

### T0.4 实现 Pino logger 封装与脱敏中间件
- **依赖**：T0.1
- **交付物**：
  - `observability/logger.js`：支持 level 动态调整
  - 脱敏规则：`password`、`token`、`secret`、`apiKey`、`authorization`、`身份证`、`银行卡` 字段自动 mask
- **验收**：单元测试中含敏感字段的日志被替换为 `[REDACTED]`

### T0.5 配置 Jest + Supertest 测试框架
- **依赖**：T0.1
- **交付物**：
  - `jest.config.js`（coverage threshold 80%）
  - `tests/setup.js`（清理 DB、Redis）
  - 示例测试通过
- **验收**：`npm test -- --coverage` 输出覆盖率报告

### T0.6 配置 CI（GitHub Actions）
- **依赖**：T0.1 ~ T0.5
- **交付物**：
  - `.github/workflows/ci.yml`：lint + test + coverage gate
  - gitleaks 扫描
- **验收**：PR 触发 CI 全绿

---

## 阶段 P1：基础设施 + agentManager

### T1.1 实现数据库 Connection 抽象（SQLite 起步）
- **依赖**：T0.1
- **交付物**：
  - `infrastructure/database/connection.js`：导出 `getDb()`
  - 迁移机制（`migrations/` + `npm run migrate`）
- **验收**：可创建表、插入、查询、迁移可回滚

### T1.2 实现 Agent Zod Schema
- **依赖**：T0.1
- **交付物**：`agentManager/agentSchema.js`（Create/Update/Filter 三套 Schema）
- **测试**：合法/非法输入校验各 ≥ 3 case

### T1.3 实现 agentRepository（Repository 模式）
- **依赖**：T1.1, T1.2
- **交付物**：`agentManager/agentRepository.js`：`findById/findAll/create/update/delete`
- **验收**：所有 SQL 仅出现在此文件
- **测试**：集成测试覆盖 CRUD + 边界（不存在的 id、唯一约束冲突）

### T1.4 实现 agentService（业务编排）
- **依赖**：T1.3
- **交付物**：
  - 严禁直接调 SQL
  - 状态校验（enabled/disabled 流转）
- **测试**：mock repository 单元测试

### T1.5 实现 agentController + 路由
- **依赖**：T1.4, T0.3
- **交付物**：
  - `POST/GET/PUT/DELETE /agents[/:id]`
  - 入参走 `validateMiddleware`
  - 错误抛 `AppError` 由 errorHandler 接管
- **测试**：Supertest 覆盖 200/400/404/409 全路径

### T1.6 实现 Express 启动入口
- **依赖**：T1.5
- **交付物**：
  - `src/main.js`：装配中间件 + 路由 + 错误处理
  - `/healthz` 端点
- **验收**：`npm run dev` 启动 → curl 健康检查 OK

### T1.7 端到端冒烟测试：Agent CRUD
- **依赖**：T1.6
- **交付物**：`tests/e2e/agent.e2e.test.js`
- **验收**：创建 → 查询 → 更新 → 删除全流程通过

---

## 阶段 P2：toolRegistry + workflowEngine

### T2.1 实现 Tool Zod Schema 与 toolRegistry
- **依赖**：T0.1
- **交付物**：
  - `toolRegistry/toolSchema.js`
  - `toolRegistry/toolRegistry.js`：`register/getTool/listTools/executeTool`
- **测试**：注册冲突、未注册工具调用、参数校验失败

### T2.2 实现 5 个内置工具
- **依赖**：T2.1
- **交付物**：`builtinTools/{httpRequest,queryDatabase,readFile,addNumbers,sendEmail}.js`
- **约束**：超时由 `TOOL_EXECUTION_TIMEOUT_MS` 控制
- **测试**：每个工具至少 2 个单元测试 + 1 个失败用例

### T2.3 实现 expressionEvaluator
- **依赖**：T0.1
- **交付物**：`workflowEngine/expressionEvaluator.js`
  - 支持 `{{nodeId.output.field}}`、`==`、`>`、`<`、`&&`、`||`
- **测试**：表达式 ≥ 10 case，禁用任意 JS 求值（不能用 eval）

### T2.4 实现 taskStateMachine（独立纯函数）
- **依赖**：T0.1
- **交付物**：`workflowEngine/taskStateMachine.js`
  - 状态：`PENDING / RUNNING / SUCCESS / FAILED / STUCK / TIMEOUT`
  - 暴露 `transition(currentState, action)`
- **测试**：所有合法转换 + 非法转换抛错

### T2.5 实现 Workflow Zod Schema
- **依赖**：T0.1
- **交付物**：`workflowEngine/workflowSchema.js`（节点类型 union: agent/tool/condition/code）
- **测试**：DAG 环检测、节点 id 唯一性

### T2.6 实现 nodeRunner
- **依赖**：T1.4 (agentService), T2.2, T2.3
- **交付物**：
  - `runAgentNode/runToolNode/runConditionNode/runCodeNode`
  - 节点级超时与重试（指数退避，最多 3 次）
- **测试**：每种节点类型 ≥ 3 case（成功/超时/重试耗尽）

### T2.7 实现 workflowExecutor（拓扑执行）
- **依赖**：T2.4, T2.5, T2.6
- **交付物**：
  - 拓扑排序 → 顺序执行
  - 节点输出注入下游 context
  - 任一节点 STUCK → 整体终止
- **测试**：5 节点 DAG / 条件分支 / 并行节点

### T2.8 实现 LLMClient（OpenAI 兼容）
- **依赖**：T0.1
- **交付物**：`infrastructure/llmClient/openaiClient.js`
  - 抓取 `reasoning_content`、`token_usage.cached_prompt_tokens`
  - 错误重试与超时
- **测试**：mock fetch，覆盖正常/限流/超时

### T2.9 端到端冒烟测试：工作流执行
- **依赖**：T2.7, T2.8
- **交付物**：`tests/e2e/workflow.e2e.test.js`
  - 场景：定义 2 个 Agent → 顺序执行 → 输出传递正确
- **验收**：对应 PRD US-01

---

## 阶段 P3：configManager + 插件机制

### T3.1 实现 configSchema
- **依赖**：T2.5
- **交付物**：`configManager/configSchema.js`（YAML → workflowDef 的 Schema）
- **测试**：缺字段、类型错误

### T3.2 实现 configLoader（YAML/JSON）
- **依赖**：T3.1
- **交付物**：`configManager/configLoader.js`：`loadFromFile/validateSchema/toWorkflowDef`
- **依赖库**：`js-yaml`
- **测试**：合法 yaml、非法 yaml、ref 引用（workflow 嵌套）

### T3.3 实现 configWatcher（文件变更热加载）
- **依赖**：T3.2
- **交付物**：`configManager/configWatcher.js`
- **依赖库**：`chokidar`
- **测试**：修改文件 → 触发回调

### T3.4 实现 pluginLoader
- **依赖**：T2.1
- **交付物**：
  - 启动时扫描 `./plugins/`
  - 每个插件需导出 `register(toolRegistry)`
  - 加载失败记录日志但不阻塞主流程
- **测试**：示例插件 `plugins/exampleTool/`

### T3.5 端到端：YAML 配置触发工作流
- **依赖**：T3.2, T2.9
- **交付物**：`tests/e2e/yamlWorkflow.e2e.test.js`
- **验收**：对应 PRD US-02

---

## 阶段 P4：apiGateway 完整功能

### T4.1 实现 JWT authMiddleware
- **依赖**：T0.3
- **交付物**：`apiGateway/middlewares/authMiddleware.js`
- **依赖库**：`jsonwebtoken`
- **测试**：合法/过期/伪造 token

### T4.2 实现 rateLimiter
- **依赖**：T0.1
- **交付物**：基于内存（MVP）/ Redis（V1）的限流，遵循 `RATE_LIMIT_PER_MINUTE`
- **测试**：超限返回 429

### T4.3 实现 workflowController + 路由
- **依赖**：T2.7, T4.1, T4.2
- **交付物**：
  - `POST /workflows/:id/execute`（异步返回 executionId）
  - `GET /workflows/executions/:id`（轮询状态）
- **测试**：完整鉴权 + 限流链路

### T4.4 实现 webhookHandler
- **依赖**：T4.3
- **交付物**：
  - `POST /webhooks/:provider`
  - `verifySignature` 支持 GitHub HMAC-SHA256 + 时间窗口
- **测试**：合法签名通过、错误签名 401、过期 timestamp 401

### T4.5 实现 BullMQ 异步执行队列
- **依赖**：T2.7
- **交付物**：
  - `infrastructure/queue/bullQueue.js`
  - 长任务入队，executionId 立即返回
- **测试**：模拟长任务，状态正确流转

### T4.6 端到端：Webhook 触发 + 状态查询
- **依赖**：T4.4, T4.5
- **交付物**：`tests/e2e/webhook.e2e.test.js`
- **验收**：对应 PRD US-03

---

## 阶段 P5：memoryManager + observability

### T5.1 实现 memoryRepository + memoryStore
- **依赖**：T1.1
- **交付物**：
  - `saveMessage / getHistory / clearSession`
  - 按 `MEMORY_WINDOW_SIZE` 截断
- **测试**：多 session 隔离、窗口截断

### T5.2 集成 memoryManager 到 agent 节点
- **依赖**：T5.1, T2.6
- **交付物**：Agent 调用前自动注入历史
- **测试**：多轮对话上下文连续

### T5.3 实现 ioorRecorder
- **依赖**：T1.1, T0.4（脱敏 logger）
- **交付物**：
  - `observability/ioorRecorder.js`：原子记录 I/O/A/R
  - 主字段 + JSONB Payload；GIN 索引迁移
  - 落库失败走 `domain/audit/` 降级
- **测试**：脱敏字段验证、降级路径触发

### T5.4 实现 traceCollector + metricsExporter
- **依赖**：T0.4
- **交付物**：
  - `traceCollector.js`：内存版（V1）→ OTel SDK（V2）
  - `metricsExporter.js`：暴露 `/metrics`（Prometheus 格式）
- **测试**：trace 查询接口返回完整 span 树

### T5.5 实现 trace 查询 API
- **依赖**：T5.3, T5.4
- **交付物**：`GET /executions/:id/trace`（IOOR 时序展示）
- **测试**：对应 PRD US-04

### T5.6 实现有界自愈与 STUCK 锁死
- **依赖**：T2.7, T5.3
- **交付物**：
  - LLM 输出契约失败 → 重投喂修正 ≤ 2 次
  - 超限 → 状态机转 STUCK + 告警 hook
- **测试**：模拟连续校验失败

---

## 阶段 P6：加固与发布

### T6.1 安全审计与渗透测试
- **依赖**：所有 P4+ 任务
- **交付物**：
  - 调用 **security-reviewer** agent 完整扫描
  - OWASP Top 10 检查清单
  - 修复所有 CRITICAL / HIGH
- **验收**：通过 AA-SEAC §1.6 + 第五部分全部要求

### T6.2 性能压测
- **依赖**：所有 P4+ 任务
- **交付物**：
  - 使用 `autocannon` 压测 `/workflows/:id/execute`
  - 报告：单实例 ≥ 200 QPS、P95 ≤ 5s
- **验收**：满足 PRD §5.1

### T6.3 完整集成测试套件
- **依赖**：T5.5
- **交付物**：
  - 4 个 PRD US 端到端通过
  - 覆盖率 ≥ 80%
- **验收**：CI 全绿

### T6.4 文档完善与发布
- **依赖**：T6.1 ~ T6.3
- **交付物**：
  - `README.md`：快速开始
  - `docs/api.md`：完整 REST API 参考
  - `docs/plugin-dev.md`：插件开发指南
  - `CHANGELOG.md`：V1.0 发布说明
- **验收**：新人按文档可 30 分钟跑通 demo

---

## 依赖关系图

```
P0 (基建)
 └─> P1 (agentManager)
      └─> P2 (toolRegistry + workflowEngine)
           ├─> P3 (configManager + 插件)
           │    └─> P4 (apiGateway)
           │         └─> P5 (memory + observability)
           │              └─> P6 (加固发布)
           └─> P5 部分任务可与 P3/P4 并行（T5.1/T5.4 不依赖 apiGateway）
```

## 关键里程碑

| 里程碑 | 完成标志 |
|--------|---------|
| **M1 - 骨架就绪** | P0 完成，CI 跑通 |
| **M2 - MVP 可演示** | P1 + P2 完成，端到端冒烟通过 |
| **M3 - V1 RC** | P3 + P4 完成，YAML/Webhook 全链路 |
| **M4 - V1 GA** | P5 + P6 完成，IOOR 全量 + 安全审计通过 |

---

## 并行化建议

可并行执行（不阻塞）：
- T0.4 + T0.5 + T0.6（基建并行）
- T2.2（内置工具）内部 5 个工具可分配给不同开发
- T1.3 + T2.1 可并行（不同模块）
- T5.1 + T5.4 可与 P4 并行

每次启动并行任务时，**调用 multi-agent 模式**（参考 `agents.md` §并行 Task 执行）。

---

## 完成定义（Per Task）

- [ ] 代码通过 ESLint + Prettier
- [ ] 单元测试覆盖率 ≥ 80%（关键路径 100%）
- [ ] 文件头注释格式正确
- [ ] 通过 **code-reviewer** agent 检查（无 CRITICAL/HIGH）
- [ ] 通过 **security-reviewer** agent 检查（涉及外部输入/输出时）
- [ ] PR 描述清晰，关联 PRD 用户故事
