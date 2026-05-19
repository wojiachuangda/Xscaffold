// [planner] ID: PLAN-V1.5-A.3 | Date: 2026-05-20 | Description: V1.5-A.3 CI 矩阵 + 收口 v1.4.0 实施计划，等待 CONFIRM

# V1.5-A.3 实施计划 — CI Postgres 矩阵 + Release v1.4.0

> 触发：backlog 下一档（A.2 已 commit `18413c4`）
> 依据：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 CODE
> 关系：PLAN_V1.5-A.md §6 D6（GitHub Actions services:postgres）/ D8（v1.2.0→因 v1.3.0 已发，顺延 v1.4.0）

---

## 1. 当前现状

### 1.1 CI 现状（`.github/workflows/ci.yml`）

| job | 内容 |
|---|---|
| `lint-and-test` | `npm ci` → 强制源码编译 better-sqlite3 → lint → format:check → test:coverage |
| `secret-scan` | gitleaks 工作目录扫描 |
| `dependency-audit` | `npm run audit:ci`（high+，prod-only） |

只跑 SQLite 路径。**A.2 的 8 个 PG 集成用例在 CI 全部被 skip**（无 `PG_TEST_URL`）。

### 1.2 测试设计回顾

- `tests/setup.js` 强制 `NODE_ENV=test`、`LOG_LEVEL=silent`、`HTTP_REQUEST_BLOCK_PRIVATE_IPS=false`；**不触碰 `DATABASE_URL` / `PG_TEST_URL`**
- A.2 引入的 `tests/integration/postgresAdapter.integration.test.js` 用独立 env `PG_TEST_URL`，set 则真跑、未 set 则 `describe.skip`
- 482 个 SQLite 用例通过 `bootSystem()` 工厂自带 in-memory SQLite，与 PG 路径互不干扰

→ **CI 只要在某个 job 里 set `PG_TEST_URL=postgres://...` 后跑 `npm test`，482+8 全跑**。SQLite 路径不会因 PG 暴露而退化。

### 1.3 版本与文档现状

| 项 | 现状 | A.3 目标 |
|---|---|---|
| `package.json.version` | `1.3.0` | `1.4.0` |
| `README.md` badge | `version-1.0.0`（v1.1/v1.3 都没更新；用户从未要求） | A.3 顺手刷至 `1.4.0`？见决策 D-A3-5 |
| `CHANGELOG.md` | `[1.3.0]` 为最新条目 | 新增 `[1.4.0]` 条目，囊括 A.1+A.2+A.3 |
| git tag | `v1.3.0`、`v1.0.0` 等存在 | A.3 commit 后打 `v1.4.0` |

### 1.4 A.1+A.2 待入 CHANGELOG 的内容

- **A.1**（commit `52f4fe4`）：driver 抽象 / 全栈 async repository 契约 / Driver-only migrate 引擎 / sqliteDriver
- **A.2**（commit `18413c4`）：pgDriver / PG 方言 7 迁移 + helper / JSONB+GIN / `?→$N` 重写 / `xs_iso_now()` / 17 单测 + 8 集成测 / `pg@^8` 依赖 / `migrations/sqlite/` 双目录化 / `migrate.js` DDL 中立
- **A.3**（本期）：CI PG service container + 矩阵 / README PG 段落

---

## 2. 修改范围

### 2.1 新建文件

| 路径 | 用途 |
|---|---|
| —（无新代码文件） | A.3 是 CI/docs/release，零生产代码 |

### 2.2 改动现有文件

| 路径 | 改动点 |
|---|---|
| `.github/workflows/ci.yml` | 新增 `test-postgres` job：services postgres:16 + `PG_TEST_URL=...` env + 与现 job 完全相同的 lint/test 流（见 D-A3-1） |
| `package.json` | `version`: `1.3.0` → `1.4.0` |
| `CHANGELOG.md` | 顶部追加 `[1.4.0] - 2026-05-20` 段，覆盖 A.1+A.2+A.3 全部交付 |
| `README.md` | ① 「配置」段加 PG 支持示例；② badge 版本刷至 `1.4.0`（D-A3-5 决定） |
| `docs/api.md` | 注明 `DATABASE_URL` 支持 sqlite/postgres 双协议（D-A3-6） |
| `PROJECT_STRUCTURE.md` | 重新生成（CI/.env/README 不进树，但 pg 迁移已在 A.2 进树，A.3 实质无变化） |

### 2.3 git tag

- A.3 commit 后打 `v1.4.0`（不 push，沿用既定节奏）

---

## 3. 关键设计决策

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D-A3-1 | CI job 组织 | (a) 新增独立 `test-postgres` job，与 `lint-and-test` 并行 (b) 改 `lint-and-test` 为 matrix `[sqlite, postgres]` (c) 在 `lint-and-test` 内启 services + 总是 set PG_TEST_URL | **(a)**：现 `lint-and-test` 零改动 → 无 SQLite 回归风险；PG job 独立 timing/失败信号；两 job 并行总耗时 ≈ max(sqlite, pg) 与 matrix 等价；最低风险 |
| D-A3-2 | PG 镜像版本 | (a) `postgres:16`（A.2 plan 已选） (b) `postgres:15`（更稳但旧） | **(a)**：PG 16 是当前主流稳定大版本，pg 客户端 8.x 完全兼容 |
| D-A3-3 | PG 凭据 | (a) `postgres:postgres@localhost:5432/postgres`（默认超用户、零额外设置） (b) 创建专属 user/db | **(a)**：CI 隔离环境，零安全顾虑；脚本最简 |
| D-A3-4 | A.3 是否一并发 v1.4.0 | (a) A.3 commit + 同次打 tag v1.4.0 (b) A.3 commit 后单独再做发布 commit | **(a)**：A.3 内容（CI + CHANGELOG + version bump）天然就是 release commit；分两步无收益 |
| D-A3-5 | README badge 刷新 | (a) badge 跟版本同步刷至 `1.4.0` + `tests 482 passing` + 加 PG 段 (b) 只加 PG 段、badge 不动（与 v1.1/v1.3 历史一致） | **(b)**：用户从 v1.1.0 起就接受 badge 滞留；保持历史一致；只补「PG 协议示例」实质信息 |
| D-A3-6 | docs/api.md 是否动 | (a) 加一段「DATABASE_URL 双协议」 (b) 不动，A.3 只动 CI/CHANGELOG/README/version | **(b)**：DATABASE_URL 不是 REST API；docs/api.md 是 REST 参考；该信息进 `.env.example`（A.2 已写）+ README 即可 |

---

## 4. CI test-postgres job 设计草图（仅说明，CODE 阶段实际写入 yml）

```yaml
test-postgres:
  name: PG Integration (postgres:16)
  runs-on: ubuntu-latest
  timeout-minutes: 15
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: postgres
      ports: ['5432:5432']
      options: >-
        --health-cmd "pg_isready -U postgres"
        --health-interval 5s --health-timeout 5s --health-retries 10
  env:
    PG_TEST_URL: postgres://postgres:postgres@localhost:5432/postgres
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 20.x, cache: 'npm' }
    - run: npm ci
    - run: npm rebuild better-sqlite3 --build-from-source
    - run: npm test
```

**关键**：`npm test` 既跑 SQLite 默认 482 用例，又因 `PG_TEST_URL` 被 set 而 unskip 8 个 PG 集成用例 → CI 看到 **490/490**。

---

## 5. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解 |
|---|---|---|
| postgres service 启动慢导致 npm test 跑时未就绪 | 中 | services 健康检查（`pg_isready` + 10 次重试）；首次 query 失败时 jest 会抛清晰错误 |
| `npm rebuild better-sqlite3` 在 PG job 不必要（PG job 不需要 sqlite native binary） | 低 | 仍保留，因为 SQLite 默认 482 用例必须经过 sqliteDriver；移除会引入 prebuilt 怪行为 |
| CHANGELOG 漏写 A.1（独立 commit `52f4fe4`，没单独发版） | 中 | 本 PLAN §1.4 列出 A.1+A.2 的完整交付清单，逐条入 v1.4.0 entry |
| README badge 不刷却写 "v1.4.0 已发布"造成视觉错配 | 低 | D-A3-5 (b) 与历史一致；如选 (a) 一并刷新即可 |

---

## 6. 验收标准（A.3 DoD）

- [ ] `.github/workflows/ci.yml` 含 `test-postgres` job；本地 yaml lint 通过（`actionlint` 可选）
- [ ] `package.json.version === "1.4.0"`
- [ ] `CHANGELOG.md` 顶部 `[1.4.0] - 2026-05-20` 完整覆盖 A.1+A.2+A.3
- [ ] `README.md` 配置段含 PG 协议示例
- [ ] git tag `v1.4.0` 指向 A.3 commit
- [ ] 本地 `npm test` / `npm run lint` 仍全绿（A.3 本身不动代码，仅文档/CI/版本）
- [ ] CI 推到远端后 SQLite job + PG job 双绿（**注**：当前 backlog 显示用户尚未 push v1.3.0+；本次也不强制 push，由用户决定何时 push）

---

## 7. 阶段产出与 commit

A.3 仍单 commit + 立即打 tag：

```
git commit -m "chore(release): V1.5-A PostgreSQL adapter v1.4.0"
git tag v1.4.0
```

commit 内含：ci.yml / package.json / CHANGELOG.md / README.md / PROJECT_STRUCTURE.md（regen）

---

## 8. 附加问题

1. **CHANGELOG 中是否把 A.1 / A.2 拆成独立子段** —— 建议**是**（A.1 = async refactor / A.2 = pg driver / A.3 = CI + release），按交付顺序写，读者能看到完整脉络
2. **README badge** —— 见 D-A3-5，建议保持历史风格不动 badge，只加 PG 配置示例
3. **tag 之后是否立即 push** —— 建议**否**（保持你既定节奏：本地 tag、何时 push 由你决定）
4. **本次 commit 是否顺便清掉 `src/toolRegistry/builtinTools/back/` 三个废弃原型文件**（memory 记录的「推迟但未放弃」项）—— 建议**否**：那是独立的清理工作，与 A.3 主题无关；保留到用户主动开口

---

## 9. 一句话总结

A.3 是文档 + CI + 版本三件套，零生产代码改动。唯一的 CI 设计取舍是「新增 sibling job」而非 matrix（避免回归 SQLite job）；其余全是按既定节奏的收口动作。

**请回复 CONFIRM（可附 D-A3-1..6 + 附加问题 1..4 的调整）后进入 CODE。**
