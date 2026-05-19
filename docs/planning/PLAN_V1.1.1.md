// [planner] ID: PLAN-V1.1.1 | Date: 2026-05-19 | Description: V1.1.1 backlog #1 — npm audit CI 集成计划，等待 CONFIRM

# V1.1.1 实施计划 — npm audit CI 集成

> 触发：PROJECT_CLOSURE §5 backlog 高优先级 #1（V1.1.x）
> 依据：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE
> 范围：补齐 v1.1 选做项 #3 —— `npm audit` 加入 CI；不引入新运行时代码

---

## 1. 当前现状

### 1.1 CI 现状（`.github/workflows/ci.yml`）

两个 job：
- `lint-and-test`：checkout → setup-node → npm ci → lint → format:check → test:coverage → upload coverage
- `secret-scan`：checkout → gitleaks

**未集成**：`npm audit`（OWASP A06 「Vulnerable and Outdated Components」追踪缺位）。

### 1.2 当前依赖审计基线（2026-05-19）

```
$ npm audit --json
vulnerabilities: { info:0, low:0, moderate:0, high:0, critical:0, total:0 }
dependencies:    { prod:158, dev:645, optional:2, peer:1, total:802 }
```

**结论**：当前 0 漏洞，是引入 CI 阻塞最干净的窗口。

### 1.3 已有规范背书

- AA-SEAC §1.6：严禁硬编码 / 依赖来源审计是补集
- PROJECT_CLOSURE §5 V1.1.x 第一项就是本项
- 原 PLAN_V1.1 §1.1 已将"npm audit CI"标 INFO 级

---

## 2. 修改范围评估

### 2.1 新建文件

| 路径 | 用途 |
|------|------|
| `docs/planning/PLAN_V1.1.1.md` | 本文件 |

### 2.2 改动现有文件

| 路径 | 改动点 | 风险 |
|------|--------|------|
| `.github/workflows/ci.yml` | 新增 `dependency-audit` job（或在 `lint-and-test` 中加 step） | 低 |
| `package.json` | 新增 `"audit:ci": "npm audit --omit=dev --audit-level=high"` 脚本 + version → 1.1.1 | 低 |
| `CHANGELOG.md` | 新增 v1.1.1 条目（chore/ci 类别） | 0 |
| `docs/security/SECURITY_AUDIT.md` | 将 INFO 级 「npm audit 未集成」改为已修复并附 commit 引用 | 0 |

### 2.3 不改动

- 无运行时代码改动（src/** / tests/** 0 文件触碰）
- 不引入新 npm 依赖
- 不改 .env.example
- 不改 Husky pre-commit（保持 commit 时不跑 audit，避免本地阻塞开发）

---

## 3. 关键设计决策

### D1 — 审计阈值

| 选项 | 行为 | 评价 |
|------|------|------|
| (a) `--audit-level=critical` | 仅 critical 阻塞 | 太宽松，HIGH 漏洞放行违背 OWASP A06 |
| **(b) `--audit-level=high`** ⭐ | high + critical 阻塞 | **推荐**：与原 V1.1 PLAN D4 一致；对 HIGH 严肃对待 |
| (c) `--audit-level=moderate` | moderate+ 阻塞 | 太严格，moderate 误报多易扰动开发 |

### D2 — 依赖范围（prod vs prod+dev）

| 选项 | 行为 | 评价 |
|------|------|------|
| (a) 默认（含 dev 依赖） | 全量审计 | dev 依赖（645 个）多为 lint/test 工具链，high 漏洞通常不构成运行时风险；易频繁阻塞 |
| **(b) `--omit=dev`** ⭐ | 仅审计 production deps（158 个） | **推荐**：聚焦真实运行时风险面；CI 信号噪音比更优 |
| (c) 分两步：prod 阻塞 + 全量 warning | 严格 + 监控 | 实现稍复杂，本期不引；如后续 dev 漏洞频发可升级到此方案 |

### D3 — CI 集成位置

| 选项 | 评价 |
|------|------|
| (a) 在 `lint-and-test` 中追加 step | 失败时与 lint/test 混淆，定位慢 |
| **(b) 独立 `dependency-audit` job** ⭐ | **推荐**：与 `secret-scan` 并列；失败可见性高；可独立 retry |

### D4 — 触发时机

| 选项 | 评价 |
|------|------|
| (a) 仅 PR / push（与现有 CI 一致） | 漏掉"代码未变但新 advisory 发布"场景 |
| **(b) PR / push + 每日 schedule（cron）** ⭐ | **推荐**：catch 新披露漏洞；schedule 失败发邮件通知 maintainer |

### D5 — 失败时的输出物

| 选项 | 评价 |
|------|------|
| (a) 仅 stdout | 排查需重跑 |
| **(b) `npm audit --json > audit.json` 上传 artifact** ⭐ | **推荐**：复用 `actions/upload-artifact@v4`，与 coverage 一致；retention 7 天 |

### D6 — version bump 策略

| 选项 | 评价 |
|------|------|
| (a) 不升版本（CI 配置不算 SemVer 触发） | 与 npm 习惯一致；但失去标签锚点 |
| **(b) 升到 1.1.1 + 打 tag** ⭐ | **推荐**：与既有"阶段=commit+tag"节奏一致；CHANGELOG 锚点清晰 |

---

## 4. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解措施 |
|--------|------|---------|
| 当前依赖出现未发现的 high 漏洞 → CI 红 | 低 | 已跑过 audit 确认 0 漏洞 |
| 未来 dev 依赖突发 high → 阻塞 PR | 低 | D2 选 `--omit=dev` 避开 |
| 每日 schedule 在依赖管理松懈期持续报警 | 中 | schedule 失败不阻塞 PR，只发通知；维护者按 backlog 处理即可 |
| 国内网络访问 npm registry advisory 接口超时 | 低 | CI 在 GitHub-hosted runner，无此问题 |
| `npm audit` 在 GitHub Actions 速率限制 | 极低 | npm registry 公开 advisory 不计速率 |

---

## 5. 实施顺序与里程碑

```
SPEC（无运行时契约，仅 CI 契约）
  └─ ci.yml dependency-audit job 草案

CODE
  ├─ 新增 package.json scripts.audit:ci
  ├─ 新增 ci.yml dependency-audit job
  ├─ 升级 version → 1.1.1
  ├─ 更新 CHANGELOG.md v1.1.1
  ├─ 更新 SECURITY_AUDIT.md（INFO 项 → resolved）
  └─ commit: chore(ci): V1.1.1 集成 npm audit (--omit=dev --audit-level=high)
  └─ tag v1.1.1
```

**里程碑**：M1.1.1.A — CI 上 dependency-audit job 首次绿灯

---

## 6. 验收标准（DoD）

- [ ] `npm run audit:ci` 本地执行成功（exit 0）
- [ ] `.github/workflows/ci.yml` 含独立 `dependency-audit` job
- [ ] CI 在 PR / push / 每日 cron 三种触发下均会跑
- [ ] 失败时 audit.json 作为 artifact 可下载
- [ ] `package.json` version = 1.1.1
- [ ] CHANGELOG.md 含 v1.1.1 条目（含 PR/commit 引用占位）
- [ ] SECURITY_AUDIT.md 中 npm audit INFO 项标记为已解决
- [ ] `npm run lint` 仍 0 error
- [ ] `npm test` 仍 372 全绿（无运行时改动，理应不受影响）
- [ ] 标签 `v1.1.1` 已打
- [ ] 不引入新 npm 依赖

---

## 7. 待 CONFIRM 的决策点

| # | 决策 | 推荐 |
|---|------|------|
| D1 | 审计阈值 | **`--audit-level=high`**（high + critical 阻塞） |
| D2 | 依赖范围 | **`--omit=dev`**（仅 prod 158 个依赖，避免 dev 噪音） |
| D3 | CI 集成位置 | **独立 `dependency-audit` job**（与 secret-scan 并列） |
| D4 | 触发时机 | **PR / push + 每日 cron schedule**（catch 新 advisory） |
| D5 | 失败输出物 | **上传 audit.json artifact**（retention 7 天） |
| D6 | 版本号策略 | **bump 到 1.1.1 + 打 tag**（与既有节奏一致） |

**附加问题**：

1. **是否同时引入 Dependabot / Renovate 配置？**
   - 建议**否**：本项聚焦"被动审计"；自动升级 PR 是另一项工作，避免本期范围蔓延。可作为新的 backlog 项（V1.1.x 第三项追加）。

2. **每日 cron 时间窗口？**
   - 建议 **`'17 3 * * *'` UTC**（北京时间 11:17）—— 错峰主流 cron 整点；失败时维护者上班时段可见。

3. **是否给 maintainer 配 schedule 失败的通知方式？**
   - 建议**继承默认**：GitHub Actions 失败默认邮件通知 commit author / repo owner，无需额外配置。

4. **commit 信息前缀用 `chore(ci):` 还是 `feat(ci):`？**
   - 建议 **`chore(ci):`** —— 纯 CI 配置无功能新增。

---

**请回复 CONFIRM（可附 D1–D6 + 附加问题的调整）后进入 SPEC/CODE。**
