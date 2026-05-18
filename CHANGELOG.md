# Changelog

> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [1.0.0] - 2026-05-19

### 🎉 首个 MVP GA 发布

完整声明式 Agent 编排平台，从零搭建到生产可用。

### Added

#### 核心引擎
- **agentManager**：Agent CRUD REST API，Zod 强校验，Repository 模式
- **workflowEngine**：DAG 拓扑执行，条件分支裁剪，输出注入 context
- **状态机**：纯函数 `transition`，6 状态 × 6 动作矩阵（PENDING/RUNNING/SUCCESS/FAILED/STUCK/TIMEOUT）
- **expressionEvaluator**：递归下降解析器，**禁用 JS eval**；支持 `==/!=/>/</>=/<=/&&/||/!`
- **节点级超时与指数退避重试**

#### 配置与扩展
- **configManager**：YAML/JSON 加载，按扩展名分派；解析错误归一化为 ValidationError
- **chokidar 文件热加载**，按文件路径维度防抖
- **pluginLoader**：`./plugins/` 目录自动扫描；单插件失败隔离
- 示例插件 `reverseString`

#### 工具库
- 5 个内置工具：`addNumbers` / `httpRequest` / `readFile` / `queryDatabase`（仅 SELECT）/ `sendEmail`(stub)
- 工具级超时熔断

#### 记忆与可观测性
- **memoryManager**：messages 表多轮对话，tenant_id 预留
- 自动注入历史到 LLM messages
- **IOOR 协议**：每次 LLM 调用一条记录，含 profileHash (SHA-256) / token usage / 脱敏后 I/O
- **审计降级通道**：契约校验失败强写 `audit_dead_letters`
- **traceCollector**：node_traces 表，按 executionId 串联 spans
- **metricsExporter**：Prometheus 文本格式，4 个核心指标（含 histogram）

#### 接入层
- **JWT 认证**（HS256，算法白名单防 `alg=none`）
- **滑动窗口限流**（IP/sub 双粒度，Retry-After 头）
- **Webhook 签名**（GitHub HMAC-SHA256，timing-safe 比对，±5min 防重放）
- **异步队列**：inMemoryAdapter（接口兼容 BullMQ，V1.5 切换零侵入）
- REST 路由：`POST /workflows/:id/execute` 202 异步 + `GET /workflows/executions/:id`
- trace 查询：`GET /workflows/executions/:id/trace`
- 健康检查：`/healthz` (liveness) + `/readyz` (含 DB 探测)
- Prometheus 端点：`/metrics`（默认匿名；`METRICS_TOKEN` 启用鉴权）

#### 有界自愈
- LLM 输出契约失败（空返回/JSON 错误/Schema 不匹配）→ 重投喂修正指令
- 最多 2 次自愈；超限抛 StuckError → 节点 STUCK 状态

#### 安全
- **双重脱敏**：字段名匹配 + Pino redact + IOOR 写入前 + 应用层
- 中英文敏感字段覆盖（password / 密码 / 身份证 / 银行卡 / api[_-]?key / authorization）
- HTTP body 大小限制（`/agents` 1MB，`/webhooks` 256KB）
- 错误响应不泄漏内部细节（非 AppError 一律 500）
- `x-powered-by` 头移除

#### 工程化
- ESLint 强约束（`max-lines:500` / `max-lines-per-function:50` / `max-depth:3` / `max-params:4`）
- Husky pre-commit：lint-staged + 文件头注释格式校验
- Commitlint conventional commits 强制
- GitHub Actions CI：lint + test + coverage + gitleaks 密钥扫描
- AA-SEAC 规范全量落地（§1.2 / §1.3 / §1.4 / §1.6 / §3 / §4 / §5）

#### 文档
- PRD / 架构设计 / 任务拆解
- API 参考（`docs/api.md`）
- 插件开发指南（`docs/plugin-dev.md`）
- 安全审计报告（`docs/security/SECURITY_AUDIT.md`）
- 性能压测报告（`docs/performance/PERFORMANCE_REPORT.md`）

### Performance
- `GET /healthz`：10,951 req/s（P95 2ms）
- `GET /metrics`：12,201 req/s（P95 1ms）
- `GET /agents`：3,988 req/s（P95 6ms）
- `POST /workflows/:id/execute`：2,141 req/s（P95 11ms）— **10× NFR 目标**

### Security
- OWASP Top 10 全项有结论
- **CRITICAL: 0 | HIGH: 1 (SSRF 已知) | MEDIUM: 4 | INFO: 3**
- 详见 [SECURITY_AUDIT.md](docs/security/SECURITY_AUDIT.md)

### Tests
- 41 套件 / 328 个用例 / 95%+ lines 覆盖率

### Known Limitations
- `httpRequest` 工具无内置 SSRF 白名单（HIGH） — 运维侧通过网络隔离临时缓解；V1.1 代码层实现
- `inMemoryAdapter` 不持久化（进程重启丢未执行 jobs） — V1.5 BullMQ 适配器
- 插件以主进程权限运行 — V2 引入 sandbox
- LLM 无 per-execution token 配额 — V1.1
- `/metrics` 默认匿名 — 已提供 `METRICS_TOKEN` 配置

---

## [Unreleased]

### Planned for V1.1
- `httpRequest` URL 白名单（修复 SSRF）
- LLM token 配额与熔断
- PostgreSQL 适配（Repository 抽象已就位，零代码改动）
- `npm audit` 集成到 CI

### Planned for V1.5
- BullMQ + Redis 队列适配器
- IOOR 批量缓冲写入
- Pino transport worker 异步日志

### Planned for V2
- 插件 sandbox (`isolated-vm`)
- 前端管理界面（Vue 3）
- 向量数据库长期记忆
- OpenTelemetry SDK 接入
- 多租户 `tenant_id` 下钻
