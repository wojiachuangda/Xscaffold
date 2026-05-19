// [planner] ID: PLAN-V1.1.2 | Date: 2026-05-20 | Description: V1.1.x #2 强制 METRICS_TOKEN + timing-safe 比对（破坏性），等待 CONFIRM

# V1.1.2 实施计划 — `/metrics` 强制鉴权与 timing-safe 比对

> 触发：backlog 下一档（V1.5-A/B 已收口 v1.4.0 / v1.5.0）
> 依据：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE
> 历史承诺：`PLAN_V1.1.md:31`、`CHANGELOG.md:346`、`SECURITY_AUDIT.md` MEDIUM 表均已公开「攒到 V1.1.x 做破坏性鉴权改造」

---

## 1. 当前现状分析

### 1.1 `/metrics` 当前认证（`observabilityController.js:46-55`）

```js
function guardToken(req, token, next) {
    if (!token) { return next(); }                      // ← 问题 1：未配置 token 即匿名放行
    const header = req.headers['x-metrics-token'];      // ← 自定义头
    if (header !== token) {                              // ← 问题 2：非 timing-safe 字符串比较
        return next(new AuthError('metrics 令牌不匹配'));
    }
    return next();
}
```

- env：`METRICS_TOKEN`（`server.js:167`），可被 `overrides.metricsToken` 覆盖
- 不走 JWT，不走 rate limit（`mountMetricsEndpoint` 在 `mountProtectedRoutes` 之前挂）
- 失败 → `AuthError` → 全局错误中间件转 401

### 1.2 测试覆盖（`tests/e2e/observability.e2e.test.js`）

| 行 | 场景 | 结果 |
|---|---|---|
| :63 | 无 token 配置 + 无头 | 200（匿名放行） |
| :104-105 | 有 token 配置 + 无头 | 401 |
| :106-107 | 有 token + 正确头 | 200 |

**缺口**：未测「token 配置但错值」/「Bearer 头」/「timing-safe 等长 buffer」

### 1.3 timing-safe 现状

- 仅 `webhookSignature.js:43-51` 用了 `crypto.timingSafeEqual`（先比 length 再比 buffer）
- **未抽公共 helper** → V1.1.2 顺手抽 `infrastructure/security/timingSafe.js` 给两处共用

### 1.4 文档承诺

| 位置 | 内容 |
|---|---|
| `.env.example:41` | `METRICS_TOKEN=`（空字符串，**可选**，无警告） |
| `README.md:186` | 「建议生产启用」（**建议**而非强制） |
| `SECURITY_AUDIT.md:29` | A01 表：「无意暴露 `/metrics` ⚠️ MEDIUM；默认匿名可访问」 |
| `CHANGELOG.md:346` | 「Planned for V1.1.x：默认强制 METRICS_TOKEN（向后破坏，攒到 v1.2）」 |

V1.1.2 是把这条公开承诺**兑现**。

---

## 2. 修改范围评估

### 2.1 新建文件

| 路径 | 用途 |
|---|---|
| `src/infrastructure/security/timingSafe.js` | `timingSafeStringEqual(a, b)` helper（等长 → `crypto.timingSafeEqual`；不等长直接 false） |
| `tests/unit/timingSafe.test.js` | helper 单测：等长/不等长/空串/非字符串 |
| `docs/planning/PLAN_V1.1.2.md` | 本文件 |

### 2.2 改动现有文件

| 路径 | 改动点 |
|---|---|
| `src/apiGateway/controllers/observabilityController.js` | `guardToken`：① 移除 `if (!token) return next()` ② 支持 `Authorization: Bearer <token>` + `x-metrics-token`（D-M-2） ③ `!==` → `timingSafeStringEqual` |
| `src/apiGateway/server.js` | 启动期断言：`NODE_ENV=production` 且 `METRICS_TOKEN` 缺失 → 启动 throw（fail-fast，D-M-1） |
| `src/apiGateway/middlewares/webhookSignature.js` | 用新 `timingSafeStringEqual` helper 替换内联 `crypto.timingSafeEqual`（去重） |
| `tests/e2e/observability.e2e.test.js` | 新增：① token 错值→401 ② Bearer 头→200 ③ production 无 token 启动失败 |
| `tests/unit/webhookSignature.test.js` | 复跑（helper 抽离后行为不变即可） |
| `.env.example` | `METRICS_TOKEN` 改强标注「**生产必填**」 |
| `README.md` | §安全须知 改「生产必须设置」+ Prometheus scrape 示例配置 |
| `docs/security/SECURITY_AUDIT.md` | A01 `/metrics` MEDIUM → 已修；§6 V1.1 章节追加 V1.1.2 修复记录 |
| `CHANGELOG.md` | `[1.6.0]` 段 + `BREAKING CHANGES` 子段 + 迁移指引 |

### 2.3 不需要做的事

- **不**给 `/metrics` 加 rate limit：Prometheus scraper 默认每 15-60s 拉一次，rate limit 反而误伤；已被 token 保护足够（D-M-4）
- **不**把 `/metrics` 移到 JWT 路径：Prometheus 服务发现不持 JWT；独立 token 是行业惯例（D-M-2 关联）

---

## 3. 关键设计决策（待 CONFIRM）

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D-M-1 | token 缺失行为 | (a) 仅 `NODE_ENV=production` 缺失 → 启动 throw；其它环境 warn + 放行（向后兼容） (b) 所有环境强制：缺失即启动 throw (c) 总是要求请求带 token（匿名永远 401）即使未配置 | **(a)**：开发/测试零摩擦（既有 372+ 测试免改）；生产 fail-fast 兜底真正高危场景；与项目「生产严格、开发宽容」既有风格一致（`HTTP_REQUEST_BLOCK_PRIVATE_IPS` 同模式） |
| D-M-2 | 头格式 | (a) 仅 `Authorization: Bearer <token>`（破坏既有 `x-metrics-token` 用户） (b) 仅 `x-metrics-token`（不动） (c) 双兼容：两者任一命中即放行 | **(c)**：`Authorization: Bearer` 是行业标准（Prometheus `bearer_token` 配置项直接对得上）；保留 `x-metrics-token` 给现存 e2e 测试与潜在用户做平滑迁移；下个大版本再考虑收 |
| D-M-3 | timing-safe helper 是否抽出 | (a) 抽 `infrastructure/security/timingSafe.js`，webhook + metrics 共用 (b) 复制粘贴一份到 metrics | **(a)**：去重 + 单测能集中覆盖；webhook 那处 12 行内联代码顺手干净 |
| D-M-4 | `/metrics` 是否加 rate limit | (a) 不加（Prometheus 高频拉取） (b) 加，但放宽阈值（如 600 req/min） | **(a)**：token 已是身份验证；rate limit 误伤 scraper 得不偿失 |
| D-M-5 | 版本号 | (a) `v1.5.1` patch (b) `v1.6.0` minor + 显式 BREAKING 段 (c) `v2.0.0` major | **(b)**：行为破坏（生产启动行为 + 默认放行→拒绝）按 SemVer 不该 patch；REST API 形态未破坏（仍是 200/401，路径/头新增可选 Bearer），不到 major；与 v1.1.0 安全修复同档（minor + BREAKING 子段） |
| D-M-6 | 启动期断言失败信号 | (a) `throw` 直接挂掉进程 (b) 写 error 日志 + 拒绝所有 `/metrics` 请求但服务可启动 | **(a)**：fail-fast 是惯用安全实践——若错过这个错误，prod 监控可能误以为 `/metrics` 在跑实则匿名暴露；启动失败让运维立刻看到 |

---

## 4. 实现示例（决策落定后的形态预览）

`src/infrastructure/security/timingSafe.js`：
```js
const crypto = require('crypto');
function timingSafeStringEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}
```

`guardToken` 改造后：
```js
function guardToken(req, token, next) {
    const presented = extractToken(req);   // Bearer header 优先；fallback x-metrics-token
    if (!presented || !timingSafeStringEqual(presented, token)) {
        return next(new AuthError('metrics 令牌未提供或不匹配'));
    }
    return next();
}
```

`server.js` 启动期：
```js
const metricsToken = overrides.metricsToken ?? process.env.METRICS_TOKEN;
if (process.env.NODE_ENV === 'production' && !metricsToken) {
    throw new Error('METRICS_TOKEN 必须在生产环境配置（V1.1.2 破坏性变更）');
}
```

---

## 5. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解 |
|---|---|---|
| 既有生产部署 prod 无 `METRICS_TOKEN` 启动失败 | **中** | CHANGELOG `BREAKING CHANGES` 段显式标注 + 迁移指引（一行 `openssl rand -hex 32`） |
| Prometheus scraper 配置未更新仍裸拉 → 401 | 中 | README + CHANGELOG 给出 `bearer_token` / `authorization: credentials` 两种 scrape_config 示例 |
| 既有 e2e 测试 `:63` 默认 200 行为变化 | 低 | 该测试是 `NODE_ENV=test`，不触发 production 启动断言；继续匿名放行（D-M-1 (a) 的兜底） |
| 抽 `timingSafeStringEqual` 后 webhook 签名比对回归 | 低 | webhook 既有 50+ 单测全跑兜底 |
| 健康探针（外部 LB）对 `/metrics` 做匿名探测 → 401 | 低 | 健康探针应走 `/healthz`（已存在）；`/metrics` 不是健康端点 |

---

## 6. 验收标准（DoD）

- [ ] `NODE_ENV=production` 不设 `METRICS_TOKEN` → `createApp()` throw
- [ ] `NODE_ENV !== production` 不设 token → warn + 匿名放行（既有测试不挂）
- [ ] 配置 token + 正确 Bearer 头 → 200
- [ ] 配置 token + 正确 `x-metrics-token` 头 → 200（兼容保留）
- [ ] 配置 token + 错值（任一头） → 401
- [ ] `timingSafeStringEqual` 单测覆盖等长/不等长/空串/非字符串
- [ ] `webhookSignature` 改用新 helper 后既有签名测试全过
- [ ] `npm run lint` 0 error；覆盖率 ≥ 80%
- [ ] CHANGELOG `[1.6.0]` 含 `BREAKING CHANGES` 段与迁移指引
- [ ] SECURITY_AUDIT MEDIUM 项标已修

---

## 7. 阶段产出与 commit

V1.1.2 是单实现 pass，沿用 V1.5-A/B 节奏分 2 commit：

1. `feat(security): metrics token 强制 + timing-safe 比对 (V1.1.2)`
2. `chore(release): metrics auth hardening v1.6.0`

**发布门禁**（沿用纪律）：不引入新外部服务，CI 验收靠现有 `lint-and-test` job（含 e2e）。push → CI 绿 → tag `v1.6.0` → push tag。

---

## 8. 附加问题

1. **SPEC 阶段产物**：本期无新 Zod 契约（不动 schema）。SPEC 是否就只交付 `timingSafeStringEqual` 函数签名后直接进 CODE？（建议：是）
2. **测试期 token**：测试期是否也需要默认设一个 `METRICS_TOKEN` 让既有 `:63` 用例转为「有 token + 无头 → 401」？（建议：**否**——保持「测试期匿名放行」与 D-M-1 (a) 一致，避免改动 9 个既有 metrics 相关用例）
3. **迁移指引文档位置**：放 CHANGELOG（建议） vs 新建 `docs/migrations/v1.6.0.md`？（建议：CHANGELOG 内含示例已足够；现项目无 migrations/ 目录）
4. **是否同时给 `/healthz` 加任何鉴权**？（建议：**否**，本期严格限定 `/metrics`；`/healthz` 默认匿名是健康检查约定）

---

## 9. 一句话总结

V1.1.2 把 README/CHANGELOG 早已公开承诺的「生产强制 METRICS_TOKEN」兑现，并顺手抽出 timing-safe helper 给 webhook + metrics 共用。零外部服务依赖，CI 用现有 job 验收。

**请回复 CONFIRM（可附 D-M-1~6 + 附加问题 1~4 的调整）后进入 SPEC/CODE。**
