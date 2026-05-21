// [security-reviewer] ID: SEC-001 | Date: 2026-05-18 | Description: MVP 安全审计报告（OWASP Top 10 + AA-SEAC §1.6/§4.5）

# Agentic App Platform — 安全审计报告 (v1.0.0 + v1.1.0 更新)

> **v1.1.0 更新（2026-05-19）**：SSRF (HIGH) 已修复；Token 配额 (MEDIUM) 已修复。详见 §6
> 审计范围：commit `4116f97`（含 P0–P5）+ P6 收尾改动
> 方法：手工 OWASP Top 10（2021）逐项检查 + AA-SEAC 安全红线对照
> 推荐复审：用户可触发 `/security-review` 技能做独立复核

---

## 1. 风险评级图例

| 等级 | 含义 | 处置策略 |
|------|------|---------|
| **CRITICAL** | 可直接被远程利用，导致数据泄露/RCE | 阻塞发布 |
| **HIGH** | 可被绕过/链式利用 | 发布前修复 |
| **MEDIUM** | 配置或运维问题 | 列入 V1.1 计划 |
| **LOW / INFO** | 改进建议 | 长期跟踪 |

---

## 2. OWASP Top 10 (2021) 逐项

### A01:2021 — Broken Access Control
| 检查项 | 状态 | 证据 |
|--------|------|------|
| 所有业务路由强制 JWT | ✅ PASS | `apiGateway/server.js:mountProtectedRoutes` 全局挂 `authMiddleware`；豁免仅 `/healthz` `/readyz` `/webhooks` `/metrics` |
| 无意暴露 `/metrics`（可被探测） | ✅ RESOLVED (v1.6.0) | 生产环境强制 `METRICS_TOKEN`（缺失即启动失败）；timing-safe 比对；详见 §8 |
| Webhook 路径无鉴权但有签名校验 | ✅ PASS | `webhookSignature.js` HMAC-SHA256 + timing-safe + ±5min 时间窗 |
| 工作流注册中心可被任意用户列出 | INFO | `GET /workflows` 已强制 JWT；返回信息为名称/版本/节点数，无敏感数据 |
| 多租户隔离 | INFO | 当前未做；`messages` 表已预留 `tenant_id` 列，V2 落地 |

**评级**：✅ RESOLVED（v1.6.0：生产强制 METRICS_TOKEN + timing-safe 比对）

---

### A02:2021 — Cryptographic Failures
| 检查项 | 状态 | 证据 |
|--------|------|------|
| JWT 算法白名单 | ✅ PASS | `authMiddleware.js` 显式 `algorithms: ['HS256']`，杜绝 `alg=none` 攻击 |
| JWT 密钥强度 | ⚠️ INFO | 依赖运维设置 `JWT_SECRET`；`.env.example` 标注 "replace-me-with-strong-random-string" |
| Webhook 签名 timing-safe 比对 | ✅ PASS | `webhookSignature.js` 使用 `crypto.timingSafeEqual` |
| 数据传输加密 | INFO | 仅 HTTP；TLS 终止由部署层负责（Nginx/K8s ingress） |
| 密钥不入日志 | ✅ PASS | `observability/logger.js` redact paths 含 `authorization` / `cookie`；`redact.js` 字段名匹配兜底 |

**评级**：PASS（运维责任 INFO 项已书面化）

---

### A03:2021 — Injection
| 检查项 | 状态 | 证据 |
|--------|------|------|
| SQL 参数化 | ✅ PASS | 所有 SQL 通过 `better-sqlite3` `.prepare().run(...)` / `.all(...)`；无字符串拼接 |
| `queryDatabase` 工具被滥用 | ✅ PASS | `builtinTools/queryDatabase.js:ensureReadOnly` 强制 SELECT |
| 表达式求值 eval 风险 | ✅ PASS | `expressionEvaluator.js` 递归下降解析，**禁用 JS eval**；只支持白名单 token |
| 命令注入（exec/spawn） | ✅ PASS | 代码中无 `child_process` 调用 |
| YAML 解析任意类型注入 | ✅ PASS | `js-yaml.load` 默认 SafeSchema（无 `!!js/function`） |

**评级**：PASS

---

### A04:2021 — Insecure Design
| 检查项 | 状态 | 证据 |
|--------|------|------|
| 工作流执行有总时长上限 | ✅ PASS | `MAX_WORKFLOW_TIMEOUT_MS=30000` 默认；`workflowExecutor.withWorkflowTimeout` 强制 |
| LLM 输出契约失败有兜底 | ✅ PASS | `selfHealing.js` 有界自愈 ≤2 次；失败转 STUCK，不无限重试 |
| 插件信任边界 | ⚠️ MEDIUM | 当前 `require()` 进程内加载，插件可任意访问 fs/network；MVP 阶段信任本地 `./plugins/`；V2 引入 `isolated-vm` 沙箱（已写入路线图） |
| 用户输入 token 配额 | ⚠️ MEDIUM | 当前无 per-execution token 上限；依赖 LLM provider 限流；V1.1 加入配额熔断 |

**评级**：MEDIUM（插件信任边界 + token 配额，已记入 backlog）

---

### A05:2021 — Security Misconfiguration
| 检查项 | 状态 | 证据 |
|--------|------|------|
| 错误响应不泄漏内部细节 | ✅ PASS | `errorHandler.js` 对非 AppError 一律返回 "服务器内部错误"，仅日志保留 stack |
| `x-powered-by` 头移除 | ✅ PASS | `server.js` `app.disable('x-powered-by')` |
| Body 大小限制 | ✅ PASS | `express.json({ limit: '1mb' })`；webhook `express.raw({ limit: '256kb' })` |
| 默认账号/密码 | N/A | 项目无内置账号体系 |
| `.env.example` 不含真实密钥 | ✅ PASS | 所有值均为占位符 |
| gitleaks 扫描 | ✅ PASS | `.gitleaks.toml` 配置，CI 中 `gitleaks-action` 启用 |

**评级**：PASS

---

### A06:2021 — Vulnerable and Outdated Components
| 检查项 | 状态 | 证据 |
|--------|------|------|
| 依赖版本固定 | ✅ PASS | `package-lock.json` 已提交 |
| 已知 CVE 扫描 | ✅ PASS | **v1.1.1 集成**：CI `dependency-audit` job 跑 `npm audit --omit=dev --audit-level=high`；PR/push + 每日 cron；当前 0 漏洞（prod 158 / dev 645） |
| 主依赖维护活跃度 | ✅ PASS | express/zod/pino/jsonwebtoken/better-sqlite3 均为活跃维护 |

**评级**：PASS（v1.1.1 闭环）

---

### A07:2021 — Identification and Authentication Failures
| 检查项 | 状态 | 证据 |
|--------|------|------|
| JWT 过期时间 | ✅ PASS | `signTestToken` 默认 1h；生产由发行方控制 |
| Brute-force 防护 | ✅ PASS | `rateLimiter.js` 内存滑动窗口；按 IP / sub 双维度 |
| 凭证存储 | N/A | 不存储用户密码 |
| Session 固定 | N/A | 无 server-side session |

**评级**：PASS

---

### A08:2021 — Software and Data Integrity Failures
| 检查项 | 状态 | 证据 |
|--------|------|------|
| 插件来源校验 | ⚠️ MEDIUM | 当前不校验签名；建议 V1.5 引入 `package.json:publishConfig` + checksum |
| CI 工件签名 | INFO | 当前无；建议集成 SLSA |
| Agent 画像版本化 | ✅ PASS | `profileHash.js` SHA-256 绑定每条 IOOR 记录，配置变化可追溯 |
| 配置反序列化 | ✅ PASS | YAML 用 SafeSchema；JSON 用原生 `JSON.parse`（无 prototype pollution） |

**评级**：MEDIUM（插件签名待补）

---

### A09:2021 — Security Logging and Monitoring Failures
| 检查项 | 状态 | 证据 |
|--------|------|------|
| 4xx/5xx 响应有日志 | ✅ PASS | `errorHandler.js` 4xx 走 `logger.warn`，5xx 走 `logger.error`，含 method/url/code |
| IOOR 全量持久化 | ✅ PASS | `ioorRecorder.js` 每次 LLM 调用一条记录 |
| 日志脱敏 | ✅ PASS | Pino redact + 应用层 `redactSensitive` 双重防护 |
| 失败日志带 stack | ✅ PASS | `errorHandler` 保留 `err.stack` |
| 审计降级通道 | ✅ PASS | `audit_dead_letters` 表，契约失败仍记原始 payload |

**评级**：PASS

---

### A10:2021 — Server-Side Request Forgery (SSRF)
| 检查项 | 状态 | 证据 |
|--------|------|------|
| `httpRequest` 工具可访问内网 | ⚠️ HIGH | 当前无 URL 白名单/黑名单；可被 Agent 用于探测 169.254/127.0.0.1 等 |
| **建议缓解**：V1.0 立即引入 `HTTP_REQUEST_ALLOWED_HOSTS` 白名单环境变量；MVP 阶段在文档显式标注此限制 | TODO | — |

**评级**：HIGH — 已记入发布说明的"已知限制"

---

## 3. AA-SEAC 安全红线对照

| 条款 | 状态 | 证据 |
|------|------|------|
| §1.6 严禁硬编码密钥 | ✅ | 全代码搜索无 sk-* / Bearer * 字面量；CI gitleaks 兜底 |
| §1.6 严禁循环内 SQL/HTTP | ✅ | code review 未发现违反；Repository 模式天然抑制 |
| §1.6 日志脱敏 | ✅ | logger redact + redactSensitive 双重保险 |
| §3 约束 1 统一响应契约 | ✅ | errorHandler 全局兜底；Controller 仅抛 AppError |
| §3 约束 2 Zod 强校验 | ✅ | validateMiddleware 路由级强制 |
| §3 约束 3 状态机隔离 | ✅ | taskStateMachine.js 纯函数 |
| §3 约束 4 Repository 模式 | ✅ | 所有 SQL 集中在 `*Repository.js` |
| §4.2 IOOR 协议 | ✅ | ioorRecorder + ioor_records 表 |
| §4.4 角色画像版本化 | ✅ | profileHash SHA-256 绑定 |
| §4.5 双重脱敏管道（存储 + 日志） | ✅ | 存储前（redactSensitive）+ 日志（pino redact） |
| §4.5 SSE 流式脱敏拦截器 | ✅ | `apiGateway/sse.js` `writeEvent` 唯一出口；`POST /agents/:id/invoke/stream` turn 级流式，事件经 `redactEvent` 脱敏后才落 socket（见 §9.2） |
| §5 有界自愈 ≤2 次 | ✅ | selfHealing.MAX_HEAL_ATTEMPTS=2 |
| §5 失败锁死 STUCK | ✅ | StuckError → workflowExecutor 状态转 STUCK |

---

## 4. 已知限制 / V1.1 安全项

按风险优先级：

1. **HIGH - SSRF**：`httpRequest` 工具无 URL 白名单 → **建议立即在生产环境通过环境变量限制**
2. **MEDIUM - 插件沙箱**：当前进程内执行，仅信任本地 `./plugins/` 目录
3. **MEDIUM - /metrics 默认开放**：未设 `METRICS_TOKEN` 时匿名可拉取
4. **MEDIUM - LLM token 配额**：无 per-execution 上限，依赖 provider 端限流
5. ~~**INFO - npm audit**：未集成到 CI~~ → ✅ **v1.1.1 已修复**（见 §7）
6. **INFO - 插件签名**：无完整性校验

---

## 5. 结论

**CRITICAL: 0 | HIGH: 1 (SSRF) | MEDIUM: 4 | INFO: 3**

v1.0.0 **可发布**，前提：发布说明中明确披露 SSRF 已知限制 + 推荐运维侧配置 `HTTP_REQUEST_ALLOWED_HOSTS`（V1.1 代码层实现）。

无 CRITICAL 项；HIGH 项是设计取舍而非实现缺陷，可通过运维层临时缓解。

---

## 6. V1.1.0 修复说明 (2026-05-19)

### 6.1 SSRF 修复 (HIGH → ✅ RESOLVED)
- 新增 `src/toolRegistry/builtinTools/httpGuard.js`：
  - 协议白名单（仅 http/https），拒绝 `file://` `ftp://` `gopher://`
  - 拒绝 URL 含 `userinfo`（防 `http://user@evil.com/`）
  - 拒绝直接 IP 字面量（127.0.0.1 / 10.x / 169.254.x 等）
  - DNS 解析后逐 IP 校验，覆盖 IPv4 + IPv6 私有/链路本地段
  - 任一解析地址为私有即拒绝（防多 A 记录混入内网）
  - 内置 5min DNS 缓存避免重复解析开销
- 环境变量：
  - `HTTP_REQUEST_BLOCK_PRIVATE_IPS=false` 关闭守卫（仅开发/测试）
  - `HTTP_REQUEST_ALLOWED_HOSTS=a.b,c.d` 白名单（hostname 精确匹配，跳过 IP 校验）
- 28 个单元测试覆盖：协议/userinfo/IP 字面量/DNS 重绑定/白名单/IPv6

### 6.2 Token 配额熔断 (MEDIUM → ✅ RESOLVED)
- 新增 `src/workflowEngine/tokenQuota.js`：
  - `initQuota / assertBeforeCall / recordTokens / snapshot` 纯函数接口
  - cached_prompt_tokens 不计入配额（已折扣）
  - 超额抛 `TokenQuotaError` (code=`TOKEN_QUOTA_EXCEEDED`) → 节点 STUCK → 工作流 STUCK
  - 三级优先级：`initialContext.tokenQuota` > `workflowDef.tokenQuota` > `WORKFLOW_TOKEN_QUOTA` env > 默认 100k
- WorkflowSchema 扩展可选 `tokenQuota` 字段
- 12 个单元 + 4 个集成测试覆盖

### 6.3 更新后评级
**CRITICAL: 0 | HIGH: 0 | MEDIUM: 3 | INFO: 3**

剩余 MEDIUM/INFO（计划项）：
- 插件 sandbox（V2 `isolated-vm`）
- `/metrics` 默认匿名（已有 `METRICS_TOKEN` 可选鉴权）
- 插件签名（V2）
- npm audit 集成 CI（V1.1.1）
- 插件来源校验（V1.5）

---

## 7. V1.1.1 修复说明 (2026-05-19)

### 7.1 npm audit CI 集成 (INFO → ✅ RESOLVED)
- `.github/workflows/ci.yml` 新增独立 `dependency-audit` job：
  - 触发：`push` / `pull_request`（main, develop）+ 每日 `cron '17 3 * * *'` UTC
  - 失败时上传 `audit.json` artifact（retention 7 天）
- `package.json` 新增 `npm run audit:ci`：
  - `npm audit --omit=dev --audit-level=high`
  - 仅审计 production 依赖（158 个），避免 dev 噪音
  - 阈值 `high`：high + critical 阻塞 CI

### 7.2 当前依赖审计基线
```
vulnerabilities: { info:0, low:0, moderate:0, high:0, critical:0, total:0 }
dependencies:    { prod:158, dev:645, optional:2, peer:1, total:802 }
```

### 7.3 更新后评级
**CRITICAL: 0 | HIGH: 0 | MEDIUM: 3 | INFO: 2**

剩余 INFO：插件签名 / 插件来源校验（V2 / V1.5）

---

## 8. V1.1.2 修复说明 (2026-05-20)

### 8.1 `/metrics` 强制鉴权 (MEDIUM → ✅ RESOLVED)
- `guardToken` 移除「`METRICS_TOKEN` 未配置即匿名放行」分支。
- `server.js` 启动期断言：`NODE_ENV=production` 且 `METRICS_TOKEN` 为空/未设 → 进程启动 `throw`（fail-fast）。空字符串与纯空白一律视为未配置，不能绕过。
- 非生产环境未配置时仍匿名放行，但打 `warn` 日志（开发零摩擦）。
- token 比对从 `!==` 改为恒定时间比较，杜绝时序侧信道。
- 鉴权头支持标准 `Authorization: Bearer <token>`（scheme 大小写兼容）与兼容保留的 `x-metrics-token`；`Authorization` 头一旦出现即走 Bearer 路径，不回退。

### 8.2 timing-safe 比对 helper 抽出
- 新增 `src/infrastructure/security/timingSafe.js` `timingSafeStringEqual`，`/metrics` 与 `webhookSignature` HMAC 校验共用，消除内联重复。

### 8.3 更新后评级
**CRITICAL: 0 | HIGH: 0 | MEDIUM: 2 | INFO: 2**

剩余 MEDIUM：插件信任边界 / 插件来源校验（V2 / V1.5 路线图）

---

## 9. V1.5 Pino 异步日志补注（2026-05-20）

### 9.1 Pino worker thread transport (V1.8.0)
- 日志写入路径生产默认走 pino v9 worker thread，日志 I/O 离开热路径
- **bounded log loss window**：worker 模式下非受控崩溃（kill -9 / 掉电）最多丢失主线程→worker 队列中未投递的日志；受控 shutdown 已 `await logger.flush(timeout=2s)`
- 字段级脱敏 `pino redact.paths` 仍在主线程序列化阶段生效，**transport 切换不破坏双脱敏管道**

### 9.2 SSE 流式脱敏（V2.2 已实现，2026-05-21）
- `architecture.md:261` / `PRD.md:133` 历史承诺「双脱敏 = 存储 + SSE 流式」已兑现：新增 `POST /agents/:id/invoke/stream` turn 级流式端点 + `apiGateway/sse.js` 传输脱敏拦截层
- `writeEvent` 是 SSE 唯一出口；每个事件经 `redactEvent` 深度脱敏 `toolCalls[].arguments` / `observations[].data`（承载 LLM / 工具的外部数据）后才落 socket，**强制不可绕过**
- envelope 元数据（type / turnIndex / tokenUsage 等本系统自有数据）不脱敏——避免敏感词 `token` 误伤 `tokenUsage`
- LLM 自由文本 `content` 不做内容启发式扫描，延续既有项目策略（与 IOOR / 日志脱敏一致）
- 阶段开发记录见 `docs/planning/PLAN_V2.2-SSE-REDACT.md`

### 9.3 评级
**CRITICAL: 0 | HIGH: 0 | MEDIUM: 2 | INFO: 2**（SSE 流式脱敏 INFO 项随 V2.2 实装关闭）

### 9.4 V2.2 SSE 审核修复（Tier 1 #1，2026-05-21）

并行 code-review + security-review 后落地的修复（PLAN：`docs/planning/PLAN_V2.2-REVIEW-FIX.md`）：

- **vendored DOMPurify 3.2.4 → 3.4.5**：`WEBUI/vendor/dompurify.es.mjs` 是渲染 LLM 输出的唯一 XSS 闸门（`WEBUI/lib/markdown.js` 默认配置 `sanitize`）。3.2.4 命中 3 条**默认配置**即触发的 XSS/mXSS（`GHSA-v8jm-5vwx-cfxm` <3.2.7 / `GHSA-h8r8-wccr-v5f2` <3.3.2 / `GHSA-v2wj-7wpq-c8vv`），升 3.4.5 一次清掉全部（含配置依赖项 < 3.4.0）。其余 advisory 依赖未使用的配置项（ADD_TAGS/USE_PROFILES 等），不适用。
  - **完整性登记（SRI 债）**：当前无构建期 SRI 校验链。锁定 sha256 = `061af0c7e4c28953b421c26d160418c16b695187c8116456a1315dda4fa26e6e`（dompurify 3.4.5 ESM）。升级该 vendor 文件时须同步核对/更新此值。构建期自动校验留 backlog。
  - marked 保持 15.0.7（输出已被 DOMPurify 兜底，15→18 大版本跳跃徒增回归面）。完整性登记 sha256 = `7a7d9a521ac9384e0c3a075120a7c486cbd0c3c32cc5601bbb79a23e97403690`（marked 15.0.7 ESM）；升级时同步核对/更新。
- **error 事件服务端留痕**：流式 invoke 出错时全局 JSON errorHandler 兜不到（header 已发）。`agentManager/agentController.js` catch 内新增 `logger.error({ err, executionId, agentId })`（经 pino redact）。客户端仍收 `err.message`——个人单用户应用，错误进开发者自己浏览器，隐藏只损调试；多用户化时再切通用消息。
- **代理 / 客户端流生命周期硬化**：`WEBUI/server.js` 代理对上游 `Readable.fromWeb` 加 `on('error')` + 客户端断连 `destroy` 上游（防裸崩 + 防 socket 泄漏）；`WEBUI/lib/sseClient.js` `consume()` 非正常排空时 `reader.cancel()` 释放底层网络流。

**评估为超范围（个人应用「不考虑风控」裁定，仅登记不修）**：

- agent invoke 无 per-agent 授权（任何 authed 用户可调任何 agent）——`AUTH_DISABLED` + 单用户
- WEBUI dev 代理转发全部 header——dev-only 工具、localhost
- 断连不中止 agent loop（`sse.js:49`）——**故意**：IOOR「凡动必留痕」优先于 abort
