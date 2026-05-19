# Changelog

> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [1.3.0] - 2026-05-19

### 🤖 Project Assistant MVP

新增**项目助理**总控 Agent 闭环：跟踪项目进度、记录事件、生成提醒、调用外部常驻 HTTP Agent、输出项目摘要。
项目助理不直接写代码、不审代码、不自动 push，是协调与摘要型 Agent。

阶段开发记录见 `docs/planning/PLAN_PROJECT_ASSISTANT_MVP.md` 与 10 个 PAM 阶段 commit。

### Added — 9 个固定 Tool

| Tool | 职责 |
|------|------|
| `projectGetStatus` / `projectUpdateStatus` | 读取 / upsert 项目状态（首次落库 `name` 兜底取 `projectId`） |
| `taskList` / `taskUpsert` | 列出 / 创建更新任务（复合主键 `projectId + taskId`） |
| `eventRecord` | 记录不可变事件流水（落库前必经 `redactSensitive` 通道） |
| `reminderCreate` / `reminderListDue` | 创建 / 查询到期提醒（`status=open AND due_at<=before`） |
| `externalAgentSend` | 调用白名单外部 HTTP Agent，URL 固定在服务端、全程审计留痕 |
| `projectGenerateDigest` | 生成项目摘要（markdown / json；含最近 10 事件、未来 24h 提醒） |

### Added — 数据与编排

- `src/domain/projectAssistant/` 新增领域模块：8 个 Zod schema + 4 个 Repository + digestBuilder + externalAgentClient + profile 白名单。
- 迁移 `006_create_project_assistant_core.sql`（`projects` / `pa_tasks` / `pa_events` / `pa_reminders`）+ `007_create_external_agent_calls.sql`（审计日志，不暴露独立列表 Tool）。
- 工作流 `workflows/project-assistant-digest.yaml` 把 7 个 Tool 串成顺序闭环。
- `createApp` 启动期容错装载 `workflows/` 目录（默认非严格——坏 YAML 仅告警；`strictWorkflowLoad: true` 才上抛）。
- `npm run smoke:project-assistant` 一键 smoke：起临时 HTTP stub 扮演外部 Agent，走完整 `createApp + supertest` HTTP 路径，严格语义任一步失败 exit 1。

### Security

- `externalAgentSend` 复用 `httpGuard.assertSafeUrl` 做 SSRF 校验；profile 自身 host 进 `allowedHosts` 豁免私网拒绝（protocol/userinfo 校验保留）；入参 schema 无 URL 字段，Agent/用户无法传入任何地址。
- `EXTERNAL_AGENT_PROFILE_OVERRIDE` 仅作为测试/smoke 钩子。
- 外部调用 reply / raw / summary 按 schema 上限截断（32KB / 8KB / 4KB）。
- 调用前先 `insertPending` 拿 callId；失败/超时同样留痕 `failed`/`timeout`——凡动必留痕。
- 事件落库前走项目脱敏（按字段名脱敏；项目策略不做内容启发式扫描）。

### Docs

- `README.md` 新增「项目助理 MVP」段落与 smoke 验证说明，并订正内置工具数 / 目录树。
- 新增 `docs/tool-dev.md`——Tool 开发参数结构与契约规范。
- `docs/planning/PLAN_PROJECT_ASSISTANT_MVP.md` 收录 Q1–Q13 全部架构决策（含 Q13 upsert 兜底）。
- `PROJECT_STRUCTURE.md` 重新生成，反映 `domain/projectAssistant/` 与 `builtinTools/projectAssistant/` 新增节点。

### Quality

- 测试：60 suites / 464 用例全过；覆盖率 statements 95.27% / branches 86.27% / functions 96.69% / lines 95.42%（远超 80% 门槛）。
- `npm run lint` / `npm run format:check` / `npm run audit:ci` 全绿（0 漏洞）。

---

## [1.1.1] - 2026-05-19

### 🛡️ CI 依赖审计集成（OWASP A06）

聚焦闭环 PROJECT_CLOSURE §5 backlog 高优先级 #1，无运行时代码改动。

### CI / Chore
- **新增 `dependency-audit` job** — `.github/workflows/ci.yml`：
  - 独立 job，与 `lint-and-test` / `secret-scan` 并列；失败可见性独立
  - 触发：`push` / `pull_request`（main, develop）+ 每日 `cron '17 3 * * *'`（UTC）
  - 失败时上传 `audit.json` artifact（retention 7 天）
- **新增 `npm run audit:ci`** — `package.json`：
  - `npm audit --omit=dev --audit-level=high`
  - 仅审计 production 依赖（158 个），避免 dev 噪音
  - 阈值 `high`：high + critical 阻塞 CI

### Docs
- `SECURITY_AUDIT.md` 中 INFO 级「npm audit 未集成」标记为已解决

### Security Posture
**CRITICAL: 0 | HIGH: 0 | MEDIUM: 3 | INFO: 2 (was 3)**

当前依赖审计基线：0 漏洞（prod 158 / dev 645 / total 802）

---

## [1.1.0] - 2026-05-19

### 🔒 安全与成本加固

聚焦修复 v1.0.0 安全审计中的 HIGH/MEDIUM 项。

### Security
- **修复 SSRF (HIGH)** — `httpRequest` 工具引入 `httpGuard.js`：
  - 协议白名单（http/https），拒绝 `file://` / `ftp://` / `gopher://`
  - 拒绝 URL 含 `userinfo`
  - 拒绝 IP 字面量目标（127.0.0.1 / 10.x / 169.254.x 等）
  - DNS 解析后逐 IP 校验私有/链路本地段（防 DNS 重绑定攻击）
  - 任一解析地址为私有即拒绝（防多 A 记录混入）
  - 5min 内存 DNS 缓存
  - 环境变量 `HTTP_REQUEST_BLOCK_PRIVATE_IPS` / `HTTP_REQUEST_ALLOWED_HOSTS`

### Added
- **Token 配额熔断 (MEDIUM)** — 新增 `workflowEngine/tokenQuota.js`：
  - 单工作流执行累计 token 上限，超额抛 `TokenQuotaError`
  - 节点状态自动转 STUCK，工作流终态 STUCK
  - 三级优先级：execute body > workflowDef > env > 默认 100k
  - `cached_prompt_tokens` 不计入配额（已折扣）
  - `WorkflowSchema` 扩展可选 `tokenQuota` 字段
- `.env.example` 新增 SSRF/quota 配置项说明

### Changed
- `workflowExecutor.pickFailAction` 把 `TOKEN_QUOTA_EXCEEDED` 也归类为 STUCK 状态
- `SECURITY_AUDIT.md` 标记 HIGH/MEDIUM 修复并更新评级
- 测试默认 `HTTP_REQUEST_BLOCK_PRIVATE_IPS=false`，保留对生产策略的严格守卫

### Tests
- 44 套件 / 372 个用例全通过（V1.1 新增 44 个）
- `httpGuard.test.js` 28 case（含 IPv6 / DNS 重绑定 / 白名单）
- `tokenQuota.test.js` + `tokenQuotaIntegration.test.js` 16 case

### Security Posture (Updated)
**CRITICAL: 0 | HIGH: 0 (was 1) | MEDIUM: 3 (was 4) | INFO: 3**

剩余项均为 V1.5/V2 计划（插件 sandbox / 签名 / npm audit CI）。

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

### Planned for V1.1.x
- `/metrics` 默认强制 `METRICS_TOKEN`（向后破坏，攒到 v1.2）

### Planned for V1.5
- PostgreSQL 适配器（Repository 抽象已就位）
- BullMQ + Redis 队列适配器
- IOOR 批量缓冲写入
- Pino transport worker 异步日志
- 插件来源校验（package.json signature）

### Planned for V2
- 插件 sandbox (`isolated-vm`)
- 前端管理界面（Vue 3）
- 向量数据库长期记忆
- OpenTelemetry SDK 接入
- 多租户 `tenant_id` 下钻
- LangChain.js 编排辅助评估
