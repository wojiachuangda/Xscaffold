# 🧭 AA-SEAC 实时项目文件拓扑树 (自动生成版)

> **注意**：本文件由底层巡检工具 `pureTreeGenerator.js` 自动生成并覆盖刷新。请勿手动修改本文件。
> **最新刷新时间**：`2026-05-19 01:31:36`

```text
src/
├── agentManager/
│   ├── agentController.js               # 职责: Agent REST 路由控制器（仅抛 AppError，由全局中间件兜底）
│   ├── agentRepository.js               # 职责: Agent 数据访问层（AA-SEAC §3 约束 4：SQL 仅出现在此文件）
│   ├── agentSchema.js                   # 职责: Agent 实体 Zod Schema（AA-SEAC §3 约束 2 入参强校验、§4.1 代码即契约）
│   └── agentService.js                  # 职责: Agent 业务编排层（严禁直接调 SQL；依赖 repository 抽象）
├── apiGateway/
│   ├── controllers/
│   │   ├── observabilityController.js       # 职责: 可观测性路由（trace 查询 + /metrics Prometheus 端点）
│   │   ├── webhookController.js             # 职责: Webhook 路由——签名校验后入队触发工作流
│   │   └── workflowController.js            # 职责: 工作流路由控制器（POST execute 202 异步 + GET status）
│   ├── middlewares/
│   │   ├── asyncHandler.js                  # 职责: 异步路由处理器包装——自动 catch 异常转发给全局错误中间件
│   │   ├── authMiddleware.js                # 职责: JWT 认证中间件（含豁免白名单与开发期总开关）
│   │   ├── errorHandler.js                  # 职责: Express 全局错误中间件——将异常归一化为统一响应契约
│   │   ├── rateLimiter.js                   # 职责: 滑动窗口内存限流中间件（IP/sub 双粒度，超限返回 429+Retry-After）
│   │   ├── validateMiddleware.js            # 职责: 通用 Zod 入参校验中间件（AA-SEAC §3 约束 2）
│   │   └── webhookSignature.js              # 职责: Webhook 签名验证（GitHub HMAC-SHA256，时间窗口防重放）
│   ├── response/
│   │   └── envelope.js                      # 职责: 统一 API 响应契约 { success, data, error, meta } 的构造函数
│   └── server.js                        # 职责: Express 应用工厂——装配中间件、路由、错误处理、可观测性
├── configManager/
│   ├── configLoader.js                  # 职责: 配置加载器——YAML/JSON 解析 + Zod 校验 + 转换为 workflowDef
│   ├── configSchema.js                  # 职责: YAML/JSON 工作流配置 Schema 与到 workflowDef 的转换契约
│   └── configWatcher.js                 # 职责: 配置文件变更监听器（chokidar 封装 + 防抖 + 显式 close）
├── domain/
│   └── audit/
│       └── auditRepository.js               # 职责: 审计降级通道——契约校验失败仍强写原始 payload（AA-SEAC §4.3）
├── infrastructure/
│   ├── database/
│   │   ├── connection.js                    # 职责: SQLite 连接抽象与单例管理（AA-SEAC §3 约束 4 依赖倒置）
│   │   ├── migrate.js                       # 职责: 简化迁移引擎——顺序执行 migrations/*.sql，落表 schema_migrations
│   │   └── migrations/
│   │       ├── 001_create_agents.sql            # 职责: ⚠️ [不合规] 缺失标准文件头注释 (Description)，请开发或编排 AI 立即补齐
│   │       ├── 002_create_executions.sql        # 职责: ⚠️ [不合规] 缺失标准文件头注释 (Description)，请开发或编排 AI 立即补齐
│   │       ├── 003_create_messages.sql          # 职责: ⚠️ [不合规] 缺失标准文件头注释 (Description)，请开发或编排 AI 立即补齐
│   │       ├── 004_create_traces.sql            # 职责: ⚠️ [不合规] 缺失标准文件头注释 (Description)，请开发或编排 AI 立即补齐
│   │       └── 005_create_ioor.sql              # 职责: ⚠️ [不合规] 缺失标准文件头注释 (Description)，请开发或编排 AI 立即补齐
│   ├── errors/
│   │   └── AppError.js                      # 职责: 应用统一错误基类与典型子类（AA-SEAC §3 约束 1 统一响应契约）
│   ├── llmClient/
│   │   └── openaiClient.js                  # 职责: OpenAI 兼容 Chat Completion 客户端（IOOR 元数据抓取 + 重试 + 超时）
│   └── queue/
│       └── inMemoryAdapter.js               # 职责: 内存队列适配器（MVP 默认）——单进程异步任务派发
├── main.js                          # 职责: 应用入口（启动 Express 服务，装配中间件与路由）
├── memoryManager/
│   ├── memoryRepository.js              # 职责: messages 表 Repository（SQL 仅在此文件）
│   ├── memorySchema.js                  # 职责: 会话消息契约（AA-SEAC §4.1 代码即契约）
│   └── memoryStore.js                   # 职责: 记忆业务层（封装窗口截断与 Zod 校验）
├── observability/
│   ├── ioorRecorder.js                  # 职责: IOOR 记录器——脱敏 + 契约校验 + 审计降级
│   ├── ioorRepository.js                # 职责: IOOR 记录存储（SQL 仅在此文件）
│   ├── ioorSchema.js                    # 职责: IOOR 协议契约（AA-SEAC §4.2 全量流式追踪）
│   ├── logger.js                        # 职责: Pino logger 封装，集成敏感字段双重脱敏（AA-SEAC §4.5）
│   ├── metricsExporter.js               # 职责: Prometheus 文本格式指标导出（4 个核心指标）
│   ├── profileHash.js                   # 职责: Agent 画像 SHA-256 计算（AA-SEAC §4.4 角色画像版本化）
│   ├── redact.js                        # 职责: 深度对象脱敏工具（用于 SSE 流式输出/IOOR 落库前的二次保险）
│   ├── traceCollector.js                # 职责: 节点级 trace 采集器（startSpan/endSpan 封装持久化）
│   ├── traceRepository.js               # 职责: node_traces 表 Repository
│   └── traceSchema.js                   # 职责: 节点级 trace 契约
├── toolRegistry/
│   ├── builtinTools/
│   │   ├── addNumbers.js                    # 职责: 内置工具 addNumbers——示例数学工具
│   │   ├── httpGuard.js                     # 职责: SSRF 防护——URL 协议白名单 + 私有 IP 拒绝 + DNS 重绑定校验
│   │   ├── httpRequest.js                   # 职责: HTTP 客户端工具，集成 SSRF 守卫
│   │   ├── index.js                         # 职责: 内置工具索引——注册到默认 registry
│   │   ├── queryDatabase.js                 # 职责: 内置工具 queryDatabase——在主库执行只读 SQL（仅 SELECT）
│   │   ├── readFile.js                      # 职责: 内置工具 readFile——读取本地文件
│   │   └── sendEmail.js                     # 职责: 内置工具 sendEmail——MVP 阶段仅打日志（无外部依赖）
│   ├── pluginLoader.js                  # 职责: 插件目录扫描与加载（单插件失败隔离，AA-SEAC §6 工具插件机制）
│   ├── toolRegistry.js                  # 职责: 工具注册中心——注册/查询/执行，含超时与参数校验
│   └── toolSchema.js                    # 职责: Tool 定义的 Zod Schema（AA-SEAC §4.1 代码即契约）
└── workflowEngine/
    ├── executionSchema.js               # 职责: 工作流执行记录契约（AA-SEAC §4.1 代码即契约）
    ├── executionStore.js                # 职责: 工作流执行记录持久化（Repository 模式，SQL 仅出现此文件）
    ├── expressionEvaluator.js           # 职责: 工作流表达式求值器（{{path}} 模板 + 安全布尔表达式，禁用 JS eval）
    ├── nodeRunner.js                    # 职责: 节点执行器：四类节点 + 超时/重试 + 记忆/IOOR/自愈/trace 集成
    ├── selfHealing.js                   # 职责: 有界自愈控制器（AA-SEAC §5：契约失败重投喂 ≤2 次，超限转 STUCK）
    ├── taskStateMachine.js              # 职责: 任务状态机（AA-SEAC §3 约束 3：独立纯函数，对外仅暴露 transition）
    ├── tokenQuota.js                    # 职责: 工作流 Token 配额熔断（不计 cached；超额抛 TokenQuotaError）
    ├── workflowExecutor.js              # 职责: 工作流执行器（拓扑遍历 + 条件分支裁剪 + 输出注入 context）
    ├── workflowRegistry.js              # 职责: 工作流定义注册中心（内存版，可由 YAML 扫描或代码预定义喂入）
    └── workflowSchema.js                # 职责: 工作流 Zod Schema（节点 union + DAG 环检测）
```

--- 
*本文件完美绑定研发最高编码规范，AI 在编写新文件时必须在此拓扑结构下按职责分层存放。*
