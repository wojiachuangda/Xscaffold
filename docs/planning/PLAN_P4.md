// [planner] ID: PLAN-P4 | Date: 2026-05-18 | Description: P4 阶段（接入层）实施前的现状/范围/风险评估，等待 CONFIRM

# P4 实施计划 — apiGateway 完整接入层

> 触发：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE。

---

## 1. 当前现状分析

### 1.1 已有能力（P0–P3 完成）
- Express app 工厂 `createApp()` 已就位，含 `/healthz` 与 `/agents` CRUD（见 `src/apiGateway/server.js`）。
- 全局错误中间件 + 统一响应契约 + Zod 入参校验中间件已落地。
- workflowEngine、configLoader、toolRegistry/pluginLoader 已具备完整执行链。
- 218 个测试通过，覆盖率 95.6%。

### 1.2 缺口（P4 待补）
| 缺口 | PRD 用户故事 | 任务 |
|------|---------|------|
| 无 JWT 认证，所有 `/agents` 端点裸奔 | NFR §5.3 全站 JWT | T4.1 |
| 无限流，60req/min 配置未生效 | NFR §5.1 + RATE_LIMIT_PER_MINUTE | T4.2 |
| 无 `POST /workflows/:id/execute` 触发工作流 | US-01 / US-02 | T4.3 |
| 无 Webhook 端点 / 签名校验 | US-03 (GitHub Push 触发) | T4.4 |
| 长任务无队列，HTTP 同步阻塞 | NFR §5.2 异步执行 | T4.5 |
| 缺接入层 E2E 串联认证→限流→触发→Webhook | M3 RC 标准 | T4.6 |

---

## 2. 修改范围评估

### 2.1 新建文件
| 路径 | 用途 | 任务 |
|------|------|---------|
| `src/apiGateway/middlewares/authMiddleware.js` | JWT 解析、`req.user` 注入 | T4.1 |
| `src/apiGateway/middlewares/rateLimiter.js` | 令牌桶/滑动窗口限流 | T4.2 |
| `src/apiGateway/middlewares/webhookSignature.js` | HMAC-SHA256 + 时间窗口校验 | T4.4 |
| `src/apiGateway/routes/workflowRoutes.js` | 路由聚合（POST execute / GET status） | T4.3 |
| `src/apiGateway/routes/webhookRoutes.js` | `POST /webhooks/:provider` | T4.4 |
| `src/workflowEngine/workflowRegistry.js` | 工作流定义注册中心（内存 + 通过 configLoader 喂入） | T4.3 |
| `src/workflowEngine/executionStore.js` | execution 状态/结果存储（SQLite） | T4.3 / T4.5 |
| `src/workflowEngine/workflowSchema.js` 之外 ↑ | 新建 executionSchema.js | T4.3 |
| `src/apiGateway/controllers/workflowController.js` | controller 层 | T4.3 |
| `src/apiGateway/controllers/webhookController.js` | controller 层 | T4.4 |
| `src/infrastructure/queue/jobQueue.js` | 队列抽象接口（in-memory 默认，Redis 可选适配） | T4.5 |
| `src/infrastructure/queue/inMemoryAdapter.js` | 内存适配器（开发/测试默认） | T4.5 |
| `src/infrastructure/queue/bullAdapter.js` | BullMQ + Redis 适配器（生产可选） | T4.5（可延后） |
| `src/infrastructure/database/migrations/002_create_executions.sql` | executions 表 | T4.3 |
| 6 个对应 `tests/unit/*.test.js` + 1 个 `tests/e2e/webhook.e2e.test.js` | 测试 | 各任务 |

### 2.2 改动现有文件
| 路径 | 改动点 | 风险 |
|------|--------|------|
| `src/apiGateway/server.js` | 装配 authMiddleware（可白名单豁免）、限流、工作流路由、webhook 路由；注入 workflowRegistry + queue | 中（影响 P1 e2e 测试 → 必须更新或加白名单） |
| `package.json` | 新增 `jsonwebtoken`, `bullmq`(可选) 依赖 | 低 |
| `tests/e2e/agent.e2e.test.js` | 配合 auth 调整（注入合法 token） | 低 |

### 2.3 设计决策点（5 项）

#### D1 — 鉴权豁免范围
- `/healthz` 必须豁免
- 是否豁免 `/webhooks/*`？**建议是**（webhook 用签名而非 JWT）
- 是否豁免开发期所有路由？**建议否**，统一开关由 `process.env.AUTH_DISABLED=true` 控制（仅 NODE_ENV=development 生效）

#### D2 — 限流粒度
- 按 IP / 按用户 id / 按路由组？**建议**：默认按 IP；登录后按 `req.user.sub`（JWT subject）
- 存储：**MVP 用内存计数器**（V1 切 Redis）

#### D3 — 工作流注册中心
- 工作流定义从哪来？三种来源：(a) 启动时从 `./workflows/*.yaml` 扫描；(b) 通过 API 注册；(c) 内存预定义
- **建议**：本阶段实现 (a) + (c)，POST 注册端点延后到 V1.5
- 是否提供 `GET /workflows` 列表 API？**建议是**

#### D4 — 队列后端
- BullMQ 需 Redis。当前项目无 Redis 依赖。
- **建议**：本阶段实现 `inMemoryAdapter`（适合测试 + 单机），把 BullMQ 适配器声明为 V1.5 工作项；保留接口 `enqueue/getJob` 不变，未来切换零侵入。
- 替代选项：**强制集成 BullMQ + ioredis-mock**（测试用），但增加 ~30MB 依赖与启动复杂度。

#### D5 — Webhook 提供商
- 文档点名 GitHub；是否支持多家？
- **建议**：本阶段只接 `provider=github`（HMAC-SHA256 + `x-hub-signature-256` 头 + body 原文校验），通用扩展点保留。

---

## 3. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解措施 |
|--------|------|---------|
| `/agents` 加 JWT 后，已有 P1 E2E 全部 401 | **必然** | 更新 `tests/e2e/agent.e2e.test.js` 注入合法 token；提供 `signTestToken` 测试工具 |
| 限流误伤 supertest（同 IP 重复请求） | 高 | 限流中间件支持 `bypass: true` 注入选项；测试期默认 bypass |
| 队列内存适配器进程退出丢任务 | 中 | 启动时打 warning；MVP 不持久化 execution 队列（已有 SQLite executions 表记录终态） |
| Webhook 端点接收任意 payload 大小 → 拒绝服务 | 中 | `express.raw({ limit: '256kb' })` 限制 body 大小 |
| Webhook 签名校验需要 raw body，与 `express.json()` 冲突 | 中 | 仅对 `/webhooks/*` 使用 `express.raw`；其他路由用 json parser |
| `executions` 表写入失败阻塞响应 | 低 | 写入异步，失败仅记日志，executionId 即响应 |
| BullMQ 适配器后续接入时需迁移历史执行 | 低 | 通过抽象接口已隔离；executions 表是 SoR，不依赖队列存储 |

---

## 4. 实施顺序与里程碑

```
T4.1 authMiddleware ─┐
                     ├─> T4.3 workflowController ──┐
T4.2 rateLimiter   ──┘    (含 workflowRegistry +  │
                           executionStore + 路由)  │
                                                   ├─> T4.6 接入层 E2E
T4.5 queue 抽象 ────────────────────────────┐      │
                                            │      │
T4.4 webhookSignature ──> webhookController ┴──────┘
```

里程碑：
- **M4.A**：T4.1 + T4.2 完成 → 所有路由强制 JWT + 限流
- **M4.B**：T4.3 + T4.5 完成 → 工作流可通过 REST 异步触发
- **M4.C**：T4.4 + T4.6 完成 → GitHub Webhook 全链路签名→队列→执行

---

## 5. 验收标准（DoD）

- [ ] `POST /workflows/:id/execute` 返回 202 + executionId（即触发后异步执行）
- [ ] `GET /workflows/executions/:id` 返回 PENDING/RUNNING/SUCCESS/FAILED 状态机正确
- [ ] 无 token → 401；过期 token → 401；篡改 token → 401；合法 token → 200
- [ ] 同 IP 超过 `RATE_LIMIT_PER_MINUTE` → 429（Retry-After 头）
- [ ] GitHub Webhook 签名错 → 401；签名对 + 5min 内 → 202
- [ ] 队列适配器接口 `enqueue/getJob/onComplete` 单元测试覆盖
- [ ] 整体覆盖率维持 ≥ 80%；E2E 覆盖 PRD US-01/02/03
- [ ] `npm run lint` 0 error

---

## 6. 待 CONFIRM 的决策点回顾

| # | 决策 | 推荐 |
|---|------|------|
| D1 | 鉴权豁免范围 | `/healthz` + `/webhooks/*` 豁免；dev 期可设 `AUTH_DISABLED=true` |
| D2 | 限流粒度与存储 | IP 优先 + 登录后切 sub；MVP 内存计数 |
| D3 | 工作流来源 | YAML 扫描 + 内存预定义；列表 API 提供；注册 API 延后 |
| D4 | 队列后端 | `inMemoryAdapter`（默认）；BullMQ 适配器单列 V1.5 |
| D5 | Webhook 提供商 | 仅 GitHub（HMAC-SHA256）；扩展点预留 |

**附加问题**：
- P3 当前未提交（13 项变更挂在工作树）。**是否在进入 P4 前先把 P3 单独 commit？** 建议：**是**，保持 commit 粒度与 P0/P1/P2 一致。
- 是否在 P4 启动同时把 jest config 加入 `forceExit` 防止 watcher 留挂？**建议是**。

---

**请回复 CONFIRM（可附上对 D1–D5 + 附加问题的取舍）后我进入 SPEC 阶段。**
