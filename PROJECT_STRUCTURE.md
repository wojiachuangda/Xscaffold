# 🧭 AA-SEAC 实时项目文件拓扑树 (自动生成版)

> **注意**：本文件由底层巡检工具 `pureTreeGenerator.js` 自动生成并覆盖刷新。请勿手动修改本文件。
> **最新刷新时间**：`2026-05-18 11:25:09`

```text
src/
├── agentManager/
│   ├── agentController.js               # 职责: Agent REST 路由控制器（仅抛 AppError，由全局中间件兜底）
│   ├── agentRepository.js               # 职责: Agent 数据访问层（AA-SEAC §3 约束 4：SQL 仅出现在此文件）
│   ├── agentSchema.js                   # 职责: Agent 实体 Zod Schema（AA-SEAC §3 约束 2 入参强校验、§4.1 代码即契约）
│   └── agentService.js                  # 职责: Agent 业务编排层（严禁直接调 SQL；依赖 repository 抽象）
├── apiGateway/
│   ├── middlewares/
│   │   ├── asyncHandler.js                  # 职责: 异步路由处理器包装——自动 catch 异常转发给全局错误中间件
│   │   ├── errorHandler.js                  # 职责: Express 全局错误中间件——将异常归一化为统一响应契约
│   │   └── validateMiddleware.js            # 职责: 通用 Zod 入参校验中间件（AA-SEAC §3 约束 2）
│   ├── response/
│   │   └── envelope.js                      # 职责: 统一 API 响应契约 { success, data, error, meta } 的构造函数
│   └── server.js                        # 职责: Express 应用工厂——装配中间件、路由、错误处理与健康检查
├── infrastructure/
│   ├── database/
│   │   ├── connection.js                    # 职责: SQLite 连接抽象与单例管理（AA-SEAC §3 约束 4 依赖倒置）
│   │   ├── migrate.js                       # 职责: 简化迁移引擎——顺序执行 migrations/*.sql，落表 schema_migrations
│   │   └── migrations/
│   │       └── 001_create_agents.sql            # 职责: ⚠️ [不合规] 缺失标准文件头注释 (Description)，请开发或编排 AI 立即补齐
│   ├── errors/
│   │   └── AppError.js                      # 职责: 应用统一错误基类与典型子类（AA-SEAC §3 约束 1 统一响应契约）
│   └── llmClient/
│       └── openaiClient.js                  # 职责: OpenAI 兼容 Chat Completion 客户端（IOOR 元数据抓取 + 重试 + 超时）
├── main.js                          # 职责: 应用入口（启动 Express 服务，装配中间件与路由）
├── observability/
│   ├── logger.js                        # 职责: Pino logger 封装，集成敏感字段双重脱敏（AA-SEAC §4.5）
│   └── redact.js                        # 职责: 深度对象脱敏工具（用于 SSE 流式输出/IOOR 落库前的二次保险）
├── toolRegistry/
│   ├── builtinTools/
│   │   ├── addNumbers.js                    # 职责: 内置工具 addNumbers——示例数学工具
│   │   ├── httpRequest.js                   # 职责: 内置工具 httpRequest——基于 Node fetch 的 HTTP 客户端
│   │   ├── index.js                         # 职责: 内置工具索引——注册到默认 registry
│   │   ├── queryDatabase.js                 # 职责: 内置工具 queryDatabase——在主库执行只读 SQL（仅 SELECT）
│   │   ├── readFile.js                      # 职责: 内置工具 readFile——读取本地文件
│   │   └── sendEmail.js                     # 职责: 内置工具 sendEmail——MVP 阶段仅打日志（无外部依赖）
│   ├── toolRegistry.js                  # 职责: 工具注册中心——注册/查询/执行，含超时与参数校验
│   └── toolSchema.js                    # 职责: Tool 定义的 Zod Schema（AA-SEAC §4.1 代码即契约）
└── workflowEngine/
    ├── expressionEvaluator.js           # 职责: 工作流表达式求值器（{{path}} 模板 + 安全布尔表达式，禁用 JS eval）
    ├── nodeRunner.js                    # 职责: 节点执行器（agent/tool/condition/code）+ 超时与指数退避重试
    ├── taskStateMachine.js              # 职责: 任务状态机（AA-SEAC §3 约束 3：独立纯函数，对外仅暴露 transition）
    ├── workflowExecutor.js              # 职责: 工作流执行器（拓扑遍历 + 条件分支裁剪 + 输出注入 context）
    └── workflowSchema.js                # 职责: 工作流 Zod Schema（节点 union + DAG 环检测）
```

--- 
*本文件完美绑定研发最高编码规范，AI 在编写新文件时必须在此拓扑结构下按职责分层存放。*
