# PLAN — Sessions 视图拆分（Tier 1 #2）

> 阶段：PLAN（等待 CONFIRM 后进 CODE）
> 目标：`WEBUI/views/sessions.js` 当前 512 行，超 AA-SEAC 500 行硬上限 → 拆分到 ≤500
> 性质：**纯重构**，不改任何行为 / 契约 / 依赖

---

## 1. 现状分析

`sessions.js`（512 行）天然四段：

| 段 | 行 | 函数 | 特征 |
|---|---|---|---|
| localStorage 会话层 | 14-79 | readJson/writeJson/loadSessionList/loadCells/createSession/deleteSession/renameSession/appendCell | 纯数据，无 DOM，叶子 |
| 渲染（HTML builder） | 190-253 | cellHtml/resultBlock/turnHtml/liveCellHtml | 纯字符串拼接，无 DOM 变更、无 state，叶子 |
| 渲染（shell+列表+详情）+ 交互 | 83-188, 255-331 | renderSessions(导出)/shellHtml/renderList/sessionRowHtml/renderDetail/detailHtml + bindNewSession/bindDetail/bindCellsContainer/handleCellAction | DOM 装配 + 事件绑定 |
| 流式 + live DOM | 333-512 | sendPrompt/createPendingCell/handleTurn/handleDone/appendLiveCellDom/appendTurnRowDom/finalizeLiveCellDom/refreshDetailHeaderCount/refreshSessionRow/setBusy | SSE 消费 + 增量 DOM |

**两个必须先解决的硬约束：**

- **A. 浏览器 ESM 无目录解析**：`views/index.js:11` 是 `import { renderSessions } from './sessions.js'`。浏览器原生 ESM 下 `./sessions.js` 只匹配同名文件，**不会**回退到 `./sessions/index.js`（那是 Node CJS 行为）。→ 必须显式处理 import 路径。
- **B. 模块依赖环**：`finalizeLiveCellDom`（461 行）回调 `renderDetail`；`renderDetail`→`bindDetail`→`sendPrompt`。若把流式逻辑拆到 `streamRunner.js`、渲染留 `index.js`，则 index↔streamRunner 互相 import → 循环。

---

## 2. 修改范围（拟拆 4 文件，新目录 `WEBUI/views/sessions/`）

| 新文件 | 内容 | 依赖 | 估行 |
|---|---|---|---|
| `sessions/store.js` | localStorage 会话层（readJson/writeJson 内部；导出 loadSessionList/loadCells/createSession/deleteSession/renameSession/appendCell + LIST_KEY/cellsKey） | 无（叶子） | ~80 |
| `sessions/cellRender.js` | 纯 HTML builder（resultBlock 内部；导出 cellHtml/turnHtml/liveCellHtml） | lib/markdown, lib/utils | ~95 |
| `sessions/streamRunner.js` | sendPrompt + live DOM helpers + setBusy（导出 sendPrompt） | lib/sseClient, lib/state, lib/utils, ./store, ./cellRender, **+ 注入的 renderDetail 回调** | ~185 |
| `sessions/index.js` | shell + 列表 + 详情渲染 + 绑定 + handleCellAction（导出 renderSessions） | lib/dom, lib/modal, lib/state, lib/utils, ./store, ./cellRender, ./streamRunner | ~195 |

**解环（约束 B）**：`streamRunner` **不** import `index`。改为依赖注入——`bindDetail`（在 index）调用 `sendPrompt` 时传入重渲染回调 `() => renderDetail(session)`，由 `sendPrompt` 透传给 `finalizeLiveCellDom` 的 fallback 分支（455-463 行原逻辑）。依赖图变成无环 DAG：`index → {store, cellRender, streamRunner}`，`streamRunner → {store, cellRender, lib}`。
- 参数控制：`sendPrompt(session, ui, onFallbackRender)`（ui = `{sendBtn, promptEl}`，3 参）；`finalizeLiveCellDom(sessionId, cell, cellIndex, onFallbackRender)`（4 参，触顶但合规）。

**import 路径（约束 A）**：见决策 D1。

**头注释**：4 个新文件每个加 AA-SEAC 头注释（husky `check-file-header.js` 强制，不加 commit 直接 fail）。角色用 `[refactor]`，Date `2026-05-21`。

---

## 3. 风险评估（可能破坏的已有业务）

- **纯重构，零行为变更**：所有函数体原样搬迁，仅改 import/export 接线 + 注入回调替代直接调用 renderDetail。
- **最大风险 = 接线漏/错**：某个 import 漏了、export 名不对、回调没接上 → Sessions 视图白屏或某交互失效。无 jest 覆盖 WEBUI，靠静态核对 + 手验兜底。
- **fallback 分支（切走 view 后流式完成）**最易回归——这正是注入回调改动点，必须手验：发 prompt 期间切到别的 view 再切回。
- **不影响**：后端、其它 view、契约、依赖（无新增）、构建（无构建链）。
- **验证手段**：
  1. 静态：核对每个 import 的符号都有对应 export；确认 streamRunner 不 import index（无环）。
  2. 手验 6 条 Sessions 流：新建 session / 发 prompt 看流式 live cell / 切走再切回（fallback）/ View JSON modal / rename / delete。各自无 console error、行为与拆前一致。

---

## 4. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | import 路径怎么处理（约束 A） | **改 `views/index.js:11` 为 `from './sessions/index.js'`**（一行，最干净）。不留 `sessions.js` shim——那是 compat 转发层，违背「不留兼容指向」原则 |
| D2 | 拆 3 文件还是 4 文件 | **4 文件**（store 独立）。store 是纯叶子、零 DOM，独立后 cohesion 最好，4 文件各 ~80–195 行，全 ≤500 |
| D3 | 解依赖环方式（约束 B） | **依赖注入** `renderDetail` 回调进 sendPrompt → finalizeLiveCellDom。streamRunner 不反向 import index，依赖图无环。不靠 ESM 循环 import + 函数提升的「能跑但有味道」方案 |
| D4 | 目录还是扁平前缀 | **新建目录 `WEBUI/views/sessions/`**。比 `views/` 下堆 `sessionsStore.js` 等前缀文件更清晰 |

**附加问**
1. commit：拆分**一个 commit**（`refactor(webui): 拆分 sessions.js 至 sessions/ 模块（≤500 行）`），我建议一个。
2. 上一批（`b85260d`）的 **push 仍挂起**——是这次拆完一起 push，还是你现在就先点头 push 上一批？

---

## 5. 执行顺序（CONFIRM 后）

1. 建目录 + `sessions/store.js`（搬 14-79 + 常量，加头注释）
2. `sessions/cellRender.js`（搬 cellHtml/resultBlock/turnHtml/liveCellHtml）
3. `sessions/streamRunner.js`（搬流式 + live DOM，sendPrompt 加 onFallbackRender 参数）
4. `sessions/index.js`（搬 shell/列表/详情/绑定/handleCellAction；bindDetail 注入回调；接线 import）
5. 删原 `sessions.js`；改 `views/index.js:11` import 路径
6. 静态核对（import/export 对齐、无环）+ eslint（注:eslint 不覆盖 WEBUI，仅语法层）
7. 手验 6 条 Sessions 流
8. 回报 + 等你定 commit/push
