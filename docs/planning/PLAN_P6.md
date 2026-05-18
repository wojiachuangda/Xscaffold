// [planner] ID: PLAN-P6 | Date: 2026-05-18 | Description: P6 加固与发布阶段实施前的现状/范围/风险评估，等待 CONFIRM

# P6 实施计划 — 加固与发布（MVP → V1 GA）

> 触发：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE。
> 这是 MVP 路线的最后一个阶段；目标是把工程交付质量从"功能跑通"提升到"可生产部署"。

---

## 1. 当前现状分析

### 1.1 已有能力（P0–P5 完成）
- 5 个 commit 已落库（c8bfbd4 / cc4631e / c18d697 / f1eb540 / ff556a5）
- **40 套件 / 321 个测试全通过**，覆盖率 lines 90%+ / functions 95%+
- 全链路打通：API → JWT → 工作流编排 → Agent/工具节点 → IOOR → trace → metrics
- AA-SEAC 五大部分全部落地（统一响应、Zod 校验、状态机隔离、Repository、IOOR、自愈、双脱敏）

### 1.2 P5 未提交（待先 commit）
- 14 个新文件（memory/observability/audit/selfHealing + 6 个测试）
- 3 张新表 migrations（messages / node_traces / ioor_records + audit_dead_letters）
- 改动：`nodeRunner.js`、`workflowExecutor.js`、`workflowController.js`、`server.js`

### 1.3 缺口（P6 待补）
| 缺口 | NFR / 验收对应 |
|------|---------|
| 无系统化安全审计记录 | PRD NFR §5.3 + AA-SEAC §1.6 |
| 无性能基线数据 | PRD NFR §5.1（200 QPS / P95 ≤ 5s） |
| 缺总览级集成测试串联 4 个 PRD US | PRD §6 MVP DoD |
| 无 README / API 文档 / 插件开发指南 | PRD §6 "新人 30min 跑通 demo" |
| 无 CHANGELOG | release 流程不完整 |
| `connection.js`/`migrate.js`/`openaiClient.js` 覆盖率偏低（80~90%） | 内部债务 |

---

## 2. 修改范围评估

### 2.1 新建文件
| 路径 | 用途 | 任务 |
|------|------|---------|
| `docs/security/SECURITY_AUDIT.md` | 安全审计报告（OWASP Top 10 清单 + 缓解证据） | T6.1 |
| `docs/security/threat-model.md` | 威胁建模（STRIDE 分类） | T6.1 |
| `docs/performance/PERFORMANCE_REPORT.md` | 压测报告（QPS / P95 / token 成本） | T6.2 |
| `scripts/perf/run-bench.js` | autocannon 压测脚本（healthz + /workflows execute） | T6.2 |
| `scripts/perf/perf-server.js` | 压测专用启动脚本（用 mock LLM） | T6.2 |
| `tests/e2e/prd-userstories.e2e.test.js` | 4 个 PRD 用户故事端到端串联 | T6.3 |
| `README.md` | 项目总览、快速开始、技术栈 | T6.4 |
| `docs/api.md` | 完整 REST API 参考（所有端点 + 请求/响应示例） | T6.4 |
| `docs/plugin-dev.md` | 插件开发指南（register 协议 + 示例） | T6.4 |
| `CHANGELOG.md` | 语义化版本日志（含 v1.0.0 首个发布） | T6.4 |

### 2.2 改动现有文件
| 路径 | 改动点 | 风险 |
|------|--------|------|
| `package.json` | 新增 devDep `autocannon`；新增 `bench` / `bench:server` scripts；version → `1.0.0` | 低 |
| `src/apiGateway/server.js` | 增加 `/healthz/ready` 区分 liveness / readiness | 低 |
| `tests/integration/connection.test.js`（新） | 提升 `connection.js` 与 `migrate.js` 覆盖率到 ≥ 90% | 低 |
| `tests/integration/llmClient.failure.test.js`（新） | 覆盖 openaiClient 剩余分支 | 低 |
| `.env.example` | 增加 `METRICS_TOKEN` 与 `LOG_PRETTY` 提示 | 低 |

### 2.3 关键设计决策（5 项）

#### D1 — 安全审计执行方式
- 选项：(a) 用户触发 `/security-review` 技能扫描；(b) Claude 手工 OWASP 检查并产出报告
- **建议**：**(b) 手工系统化检查** — 你拥有 `/security-review` 技能但需用户触发；本阶段我先按 OWASP Top 10 + AA-SEAC §1.6 + §4.5 逐项检查并出报告，由用户决定是否再叠加 `/security-review` 复核

#### D2 — 性能压测目标
- 选项：(a) 真实 LLM 调用（成本高、外部依赖）；(b) 全 mock LLM；(c) 仅压测同步端点（healthz、/agents CRUD）
- **建议**：**(b) + (c)** — 重点压测 `/workflows/:id/execute` 入队链路（mock LLM 返回 1ms）、`/healthz`、`/agents` CRUD；记录 QPS / P50 / P95 / P99 / 错误率

#### D3 — 集成测试套件取舍
- 现有 8 个 E2E 已覆盖关键链路。
- **建议**：新建 1 个 `prd-userstories.e2e.test.js` 把 PRD §4 的 4 个 US 显式串联（US-01 Agent CRUD、US-02 YAML→执行、US-03 Webhook、US-04 IOOR 查询），不重复测细节，只确认主路径打通

#### D4 — 版本号策略
- **建议**：本次发布作为 `v1.0.0` 首个 GA；CHANGELOG 按 [Keep a Changelog](https://keepachangelog.com) 格式

#### D5 — `/healthz` 拆分 liveness/readiness
- 当前只有 `/healthz`
- **建议**：保留 `/healthz`（liveness，永远返回 200 if process alive）；新增 `/readyz`（readiness，检查 DB 连通性）。K8s/Docker 实践对齐

---

## 3. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解措施 |
|--------|------|---------|
| `autocannon` 安装失败（Windows 编译依赖） | 中 | `autocannon` 是纯 JS；若失败回退 `--prefer-offline` |
| 压测脚本启动 server 导致端口冲突 | 中 | 使用随机端口 + 进程内启动（不开 HTTP listen） |
| 安全审计发现 CRITICAL 问题需修复才能发布 | 中 | 先扫描出报告；修复作为单独 PR 不阻塞 P6 收尾，但 release 推迟 |
| 压测发现性能不达标（< 200 QPS） | 中 | 报告中如实给出基线，记录优化项；不达标不阻塞 v1.0.0 发布，标注为已知问题 |
| README / api.md 篇幅过长容易腐烂 | 低 | 仅写 30min 上手 + 完整端点表；细节链回源代码 |
| `/readyz` 在测试环境失败影响 E2E | 低 | readyz 仅在主入口装配，测试 createApp 注入 mockReady |

---

## 4. 实施顺序与里程碑

```
[先 commit P5]
   │
   ▼
T6.3 PRD US 集成 E2E ──┐
   │                    │
T6.1 安全审计 ──────────┤── 全部完成后 ──> v1.0.0 release commit
   │                    │
T6.2 压测 ──────────────┤
   │                    │
T6.4 README/api/CHANGELOG ┘
```

里程碑：
- **M6.A**：P5 commit + T6.3 集成 E2E 完成 → 4 US 全部冒烟通过
- **M6.B**：T6.1 + T6.2 完成 → 安全/性能基线报告就位
- **M6.C**：T6.4 完成 + version 1.0.0 → 可发布

---

## 5. 验收标准（DoD）

- [ ] **安全**：OWASP Top 10 全项有结论；CRITICAL 数为 0（HIGH 可列入已知问题）
- [ ] **性能**：`/healthz` ≥ 1000 QPS；`/agents` CRUD ≥ 500 QPS；`/workflows execute`（mock LLM）≥ 200 QPS / P95 ≤ 500ms
- [ ] **集成**：`prd-userstories.e2e.test.js` 4 个 describe 全绿
- [ ] **覆盖率**：维持 ≥ 80%（不退化）；`infrastructure/database` 提升到 ≥ 90%
- [ ] **文档**：从 README 起步 30 分钟内可：装依赖 → migrate → start → curl /agents
- [ ] `CHANGELOG.md` 含 v1.0.0 条目（含所有 P0-P6 关键 feature）
- [ ] `npm run lint` 0 error；新增文档不含死链

---

## 6. 待 CONFIRM 的决策点

| # | 决策 | 推荐 |
|---|------|------|
| D1 | 安全审计方式 | 手工 OWASP + 报告；`/security-review` 留用户触发 |
| D2 | 压测策略 | mock LLM 压 `/workflows/execute`；同步端点直接压 |
| D3 | 集成测试取舍 | 新增 1 个 US 串联 E2E；不重复细节 |
| D4 | 版本号 | v1.0.0 GA + Keep a Changelog 格式 |
| D5 | healthz 拆分 | 保留 /healthz + 新增 /readyz |

**附加问题**：
1. **P5 是否先单独 commit？** 建议**是**，保持 commit 粒度一致（P0–P5 各一）
2. **是否需要把 README 也用中文？** 项目现有文档以中文为主，建议**全中文**保持一致
3. **CHANGELOG 是否回溯写每个 phase 的小条目？** 建议**否**：直接写 `v1.0.0 - 2026-05-18` 总览条目，详细见 git log

---

**请回复 CONFIRM（可附上对 D1–D5 + 附加问题的调整）后进入 SPEC/CODE 阶段。**
