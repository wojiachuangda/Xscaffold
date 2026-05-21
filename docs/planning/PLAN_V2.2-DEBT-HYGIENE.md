# PLAN — Cheap Hygiene 技术债清理（🟢 批 1-4）

> 阶段：PLAN（等待 CONFIRM 后进 CODE）
> 范围：用户裁定只清 🟢 cheap hygiene 4 项；plugin 暂不动；🔴 战略 bet(OTel/WEBUI 框架化)不碰
> 性质：hygiene，零功能变更

---

## 1. 现状分析（每项已实测核根因）

### 项 1 — Jest `Force exiting Jest`
- `jest.config.js` 有 `forceExit: true` + `detectOpenHandles: false`。
- **实测结论（关键）**：`detectOpenHandles` 全套跑 **零泄漏报告**；关掉 forceExit 跑全套 **566 passed 且 exit 0 自然退出**（非超时挂住）。
- 测试 line 420 确认「env=test → 同步，不启 pino worker」。**没有真泄漏的 handle**——`forceExit: true` 是历史防御性遗留。记忆里「DB/queue handle 未净」假设**证伪**。
- → 删 `forceExit: true` 即可，`Force exiting` 消息消失，套件仍自然退出。

### 项 2 — `executions` 视图 state 冲突
- 真相不是「重复 fetch」而是 **state key 冲突**：`state.executions` 被 **inbox(派生 issues, `inbox.js:41`) + automation(近 8 条, `automation.js:188`) + actions(`actions.js:31`)** 共用，由 `loadProtectedData`(`app.js:61`, `?limit=80`) 每 poll 喂。
- 而 executions 视图 `fetchExecutions`(`executions.js:24`) 用**分页+过滤**数据**覆盖同一个 key**。导致：进过 executions 视图后，state.executions 变成分页子集，inbox/automation 读到错数据，直到下个 poll 的 loadProtectedData 复原。
- → 给分页视图独立 slice `state.executionsPage` / `executionsPageTotal`，与共享 feed 解耦。

### 项 3 — 2 个 ESLint complexity warning（已确认仍在）
- `ioorRepository.js:40 insertRecord` complexity 11：来自一串内联 `record.X ?? null` / `record.X ? JSON.stringify : null` 三元。**文件内已有 `jsonOrNull` helper(85 行)** 可复用 → 真重构降复杂度 + 去重。
- `server.js:62 buildDependencies` complexity 15：扁平 DI 装配，每个 `overrides.X || buildY()` 一个分支。记忆判定「拆 helper 反而难读」。

### 项 4 — `marked` 无 SRI 登记
- DOMPurify 已在 §9.4 记 sha256，marked 15.0.7 未记。sha256 = `7a7d9a521ac9384e0c3a075120a7c486cbd0c3c32cc5601bbb79a23e97403690`。

---

## 2. 修改范围

| 项 | 文件 | 改法 | 规模 |
|---|---|---|---|
| 1 | `jest.config.js` | 删 `forceExit: true`（`detectOpenHandles: false` 保留=默认值） | 1 行 |
| 2 | `WEBUI/lib/state.js` + `WEBUI/views/executions.js` | 新增 `executionsPage`/`executionsPageTotal` slice；executions 视图读写新 slice，不再碰 `state.executions` | ~2 文件 |
| 3a | `src/observability/ioorRepository.js` | `insertRecord` 复用 `jsonOrNull` + 抽 params 构建，降 complexity ≤10 | 1 文件 |
| 3b | `src/apiGateway/server.js` | `buildDependencies` 加 `// eslint-disable-next-line complexity` + 理由注释（扁平装配，拆分反损可读性） | 1 行 |
| 4 | `docs/security/SECURITY_AUDIT.md` §9.4 | 补 marked 15.0.7 sha256 | 文档 |

无 Zod 契约变更 → SPEC 阶段 N/A。

---

## 3. 风险评估

- **项 1**：已实测无泄漏，删 forceExit 后套件自然退出。风险≈0。若 CI 并发环境意外有尾巴 handle，回退加回一行即可。
- **项 2**（最高）：动共享 state。风险点：漏改某处仍读旧 key，或 inbox/automation 取数变化。缓解：grep 全部 `state.executions` 读点，确认只有 executions **视图自身**切到新 slice，inbox/automation/actions/loadProtectedData 仍用 `state.executions`。手验 executions 翻页 + inbox/automation 列表正确。
- **项 3a**：纯函数内重构，复用既有 helper。jest 有 ioorRepository 覆盖 → 跑测试兜底。
- **项 3b**：仅加注释，零行为。
- **项 4**：纯文档。
- **验证**：全量 jest 仍 566 passed **且自然退出**（项 1 的验收点）；eslint **0 warning 0 error**（项 3 的验收点）；手验 executions 翻页 + inbox/automation（项 2）。

---

## 4. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | 项 1 删 forceExit | **删**（已实测自然退出，零风险） |
| D2 | 项 2 是否做独立 slice | **做** `state.executionsPage`。这是 4 项里最可争议的——bug 多为潜在(视图自身翻页会复原)，但既然要清债，解耦 key 是正解。若你嫌churn可跳过此项 |
| D3 | 项 3 两个 complexity 分别怎么处理 | `insertRecord` **真重构**（复用 jsonOrNull，干净降复杂度）；`buildDependencies` **eslint-disable + 理由注释**（扁平 DI，拆分反难读，沿用既有判断）。我**不**主张为降数字硬拆 buildDependencies |
| D4 | marked 是否顺带升版本 | **不升**（15.0.7 输出被 DOMPurify 兜底，18.x 大跳跃徒增回归面），仅登记 sha256 |

**附加问**
1. commit：4 项**一个 commit**（`chore: 清 cheap hygiene 技术债（forceExit/executions slice/complexity/marked SRI）`），我建议一个。
2. 跑绿 + 手验后再 push？建议这次也**跑绿即 push**（沿用上次授权节奏），手验项 2 你方便时补。

---

## 5. 执行顺序（CONFIRM 后）

1. 项 1：删 jest forceExit → 跑全量 jest 确认 566 passed **且自然退出**
2. 项 3a：重构 insertRecord → 跑 ioorRepository 相关测试
3. 项 3b：buildDependencies 加 disable 注释 → `npm run lint` 确认 0 warning
4. 项 2：state.js 加 slice + executions.js 切新 slice → grep 核对 state.executions 读点
5. 项 4：SECURITY_AUDIT 补 marked sha256
6. 全量 jest + eslint 收尾 → 手验 executions/inbox/automation
7. commit + push
