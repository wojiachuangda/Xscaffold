// [planner] ID: PLAN-V1.1 | Date: 2026-05-19 | Description: V1.1 安全与成本加固计划，等待 CONFIRM

# V1.1 实施计划 — 安全与成本加固

> 触发：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE。
> 范围：MVP v1.0.0 已知限制中 **HIGH/MEDIUM** 级别的关键修复，目标产出 **v1.1.0**。

---

## 1. 当前现状

### 1.1 v1.0.0 已知问题（来自 SECURITY_AUDIT.md & CHANGELOG）

| 严重性 | 问题 | 出处 |
|------|------|------|
| **HIGH** | `httpRequest` 工具无 SSRF 白名单，可访问 169.254/127.0.0.1 等内网 | OWASP A10 + SECURITY_AUDIT §2 |
| **MEDIUM** | 无 per-execution token 配额，LLM 成本失控 | OWASP A04 + PRD §7 |
| **MEDIUM** | 插件以主进程权限运行 | OWASP A04 + plugin-dev.md §7 |
| **MEDIUM** | `/metrics` 默认匿名暴露 | OWASP A01 |
| **INFO** | `npm audit` 未集成 CI | OWASP A06 |
| **INFO** | 插件签名 / 完整性校验 | OWASP A08 |

### 1.2 V1.1 锁定范围（4 项）

**必做**：
1. **SSRF 修复**：`httpRequest` 引入 hostname/IP 白名单 + 内网 IP 自动拒绝
2. **Token 配额**：单 execution token 上限 + 超限熔断转 STUCK

**选做**（视时间）：
3. **npm audit CI 集成**：`npm audit --audit-level=high` 加入 GitHub Actions
4. **/metrics 默认鉴权改造**：从"匿名 + 可选 token"改为"开发期匿名 / 生产期强制 token"

**延后**：
- 插件 sandbox（V2 `isolated-vm`）
- 插件签名（V2）
- PostgreSQL 适配（V1.5 拆分 PR，避免本次 PR 过大）

---

## 2. 修改范围评估

### 2.1 新建文件
| 路径 | 用途 | 任务 |
|------|------|---------|
| `src/toolRegistry/builtinTools/httpGuard.js` | URL 白名单 + 私有 IP 拦截 | V1.1-1 |
| `src/workflowEngine/tokenQuota.js` | per-execution token 计数器 + 熔断 | V1.1-2 |
| `tests/unit/httpGuard.test.js` | SSRF 防护单测 | V1.1-1 |
| `tests/unit/tokenQuota.test.js` | 配额熔断单测 | V1.1-2 |
| `tests/integration/httpRequest.ssrf.test.js` | httpRequest 集成测试（含 SSRF 拒绝） | V1.1-1 |
| `tests/integration/tokenQuota.integration.test.js` | 工作流级配额触发 STUCK | V1.1-2 |
| `docs/planning/PLAN_V1.1.md` | 本文件 | — |

### 2.2 改动现有文件
| 路径 | 改动点 | 风险 |
|------|--------|------|
| `src/toolRegistry/builtinTools/httpRequest.js` | 调用前过 httpGuard.assertSafe(url) | 中（影响 httpRequest 现有测试） |
| `src/workflowEngine/nodeRunner.js` | runAgentNode 后累计 token；超额抛 TokenQuotaError → STUCK | 中（影响 agent node 集成测试） |
| `src/workflowEngine/workflowExecutor.js` | 工作流级 quota 上下文 + 终态识别 | 低 |
| `src/apiGateway/controllers/workflowController.js` | trigger 时初始化 quota（从 env 或 request） | 低 |
| `.env.example` | 新增 `HTTP_REQUEST_ALLOWED_HOSTS`、`HTTP_REQUEST_BLOCK_PRIVATE_IPS`、`WORKFLOW_TOKEN_QUOTA` | 0 |
| `.github/workflows/ci.yml` | 新增 `npm audit --audit-level=high` step | 低 |
| `docs/security/SECURITY_AUDIT.md` | 标记 HIGH/MEDIUM 已修复 | 0 |
| `CHANGELOG.md` | v1.1.0 条目 | 0 |
| `package.json` | version → 1.1.0 | 0 |

### 2.3 关键设计决策（4 项）

#### D1 — SSRF 防御策略
**默认策略**：
- 拒绝私有 IP（127.0.0.0/8、10/8、172.16/12、192.168/16、169.254/16、::1、fc00::/7）
- 拒绝 `file://` `ftp://` `gopher://` 等非 http/https 协议
- 拒绝主机名为 IP 字面量（强制 DNS 解析后再检查目标 IP）
- 拒绝 URL 包含 `userinfo`（如 `http://user@evil.com/`）

**可选放宽**：
- `HTTP_REQUEST_ALLOWED_HOSTS` 白名单（逗号分隔）覆盖私有 IP 拒绝
- 测试环境 `HTTP_REQUEST_BLOCK_PRIVATE_IPS=false` 完全禁用守卫

**DNS 重绑定攻击**：通过 `node:dns/promises.lookup` 解析后再校验解析后的 IP；attacker 控制的 DNS 短 TTL 切换无法绕过

#### D2 — Token 配额触发点与单位
- **配额单位**：`total_tokens`（prompt + completion，含 cached 折算）
- **配额边界**：单 execution 累计上限；不做账户级（账户级是 LLM provider 责任）
- **触发点**：每次 LLM 调用返回后累加；下次调用前检查（不打断已发起请求）
- **超限行为**：抛 `TokenQuotaError`（继承 AppError，code=`TOKEN_QUOTA_EXCEEDED`）→ 节点 STUCK
- **默认值**：`WORKFLOW_TOKEN_QUOTA=100000`（10万 token，足够大部分场景）
- **配额传递**：env 默认 + workflowDef 字段覆盖 + execute body `quota` 参数覆盖（优先级 body > def > env）

#### D3 — Token 配额上下文存储
- 选项 (a)：在 `ctx` 对象上挂载 `_tokenUsed` 累加器（与 `_turnCounter` 同模式）
- 选项 (b)：独立 `tokenQuota` 单例 by executionId
- **建议 (a)** — 与现有 `_turnCounter` 一致，零侵入执行器

#### D4 — npm audit 失败策略
- 选项 (a)：`high` 阈值阻塞 CI（推荐）
- 选项 (b)：仅 warning（不阻塞）
- **建议 (a)** — 生产服务的高危依赖必须严肃对待；如有误报通过 `npm audit fix` 或 `--audit-level=critical` 临时调整

---

## 3. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解措施 |
|--------|------|---------|
| 现有 `tests/unit/builtinTools.test.js` `httpRequest GET 成功（mock fetch）` 用 `example.com` → 不在白名单 | 中 | 测试默认 `HTTP_REQUEST_BLOCK_PRIVATE_IPS=false` 允许公网 mock；白名单仅在生产强制 |
| Token 累加可能使 `tests/integration/agentNodeIntegration.test.js` STUCK | 中 | 默认配额 100k，单测 mock LLM 每次 2 token，连续上千次不会触发 |
| DNS 解析增加 httpRequest 延迟（~10ms） | 低 | 仅在守卫开启时；本地缓存 5min |
| 现有 perf-bench 不调用 httpRequest，无影响 | 0 | — |
| `npm audit` 在 CI 失败导致历史 PR 不能合并 | 中 | 先在本地跑一次确认结果；如有 high 漏洞先修复或临时 `--audit-level=critical` |

---

## 4. 实施顺序与里程碑

```
V1.1-1 SSRF (httpGuard) ──┐
                          ├─> 集成测试 ──> v1.1.0 release commit
V1.1-2 Token 配额 ─────────┤
                          │
V1.1-3 npm audit CI ──────┤
                          │
V1.1-4 /metrics 加固 ──────┘
```

里程碑：
- **M1.1.A**：SSRF + Token 配额完成（必做项交付）
- **M1.1.B**：CI/metrics 收尾，CHANGELOG 更新，version 1.1.0

---

## 5. 验收标准（DoD）

- [ ] 调用 `httpRequest({ url: 'http://127.0.0.1/' })` → ValidationError("forbidden host")
- [ ] 调用 `httpRequest({ url: 'http://10.0.0.1/' })` → 拒绝
- [ ] 调用 `httpRequest({ url: 'http://169.254.169.254/' })`（云元数据接口）→ 拒绝
- [ ] 白名单中的主机名通过；解析后是私有 IP 也允许（如白名单含 `internal.svc`）
- [ ] 工作流执行累计 token 超 quota → 节点 STUCK，error 含 `TOKEN_QUOTA_EXCEEDED`
- [ ] execute body 携带 `quota: 50` 覆盖默认配额
- [ ] CI 新增 `npm audit --audit-level=high` 步骤；当前依赖通过
- [ ] 覆盖率维持 ≥ 80%
- [ ] `npm run lint` 0 error
- [ ] CHANGELOG v1.1.0 含 fix 详情 + 已知问题（如有）

---

## 6. 待 CONFIRM 的决策点

| # | 决策 | 推荐 |
|---|------|------|
| D1 | SSRF 策略 | 默认拒绝私有 IP + 协议白名单 + 拒绝 IP 字面量；DNS 解析后再校验防重绑定 |
| D2 | Token 配额单位/触发 | total_tokens；下次调用前检查；env+def+body 三级覆盖；默认 100k |
| D3 | 配额上下文 | 挂载 `ctx._tokenUsed` 与 `_turnCounter` 同模式 |
| D4 | npm audit 策略 | `--audit-level=high` 阻塞 CI |

**附加问题**：
1. **/metrics 默认鉴权改造是否纳入 V1.1**？建议**否**：当前已有 `METRICS_TOKEN` 配置选项，运维侧可启用；改默认会破坏向后兼容
2. **DNS 解析增加的延迟是否需要缓存**？建议**是**：5min TTL 内存缓存（避免每次 httpRequest 调用都 DNS 查询）
3. **Token 配额是否包含 cached_prompt_tokens**？建议**否**：cached 是优化指标不计入计费总量，但**记录到 IOOR 中供分析**

---

**请回复 CONFIRM（可附上对 D1–D4 + 附加问题的调整）后进入 SPEC/CODE。**
