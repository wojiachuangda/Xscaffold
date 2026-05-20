// [planner] ID: PLAN-WEBUI-V2 | Date: 2026-05-20 | Description: WEBUI V2 三阶段拆分（V2.1 vanilla 模块化 + 路由 + 轮询 / V2.2 SSE / V2.3 视图补齐），用户已 CONFIRM 走 C 路线

# WEBUI V2 实施计划 — vanilla 模块化推进

> 触发：v1.8.0 收口后，用户决议把前端推到 V2
> 路线决策（用户 CONFIRM）：**C 路线**（vanilla 模块化，不引入框架/构建链） + 分 3 阶段收口 + 轮询先上后续换 SSE
> 依据：`AGENTS.md`（UI 独立维护）、`.claude/rules/Uiconstraints.md`（极简冷白灰系统感）、`RULES.md`（大改动必走 PLAN→CONFIRM）

---

## 1. 当前现状

### 1.1 WEBUI MVP 雏形（已 commit `e833699`）

| 文件 | 行数 | 职责 |
|---|---|---|
| `WEBUI/server.js` | ~110 | 5173 端口本机服务 + `/api/*` 反代到 BACKEND_URL |
| `WEBUI/index.html` | ~80 | 三栏布局骨架 + 模态框 + toast 容器 |
| `WEBUI/app.js` | ~330 | state + api + 事件绑定 + 模态控制 + 共享工具（单文件已逼近 AA-SEAC 500 行红线） |
| `WEBUI/views.js` | ~450 | 7 视图渲染 + 列表组件 + 表单绑定（单文件**已超 AA-SEAC 500 行红线**） |
| `WEBUI/styles.css` + `theme.css` | - | Uiconstraints 配色 + 组件样式 |

### 1.2 关键现状缺口

| 维度 | 现状 | V2 要解决 |
|---|---|---|
| 数据刷新 | 仅手动 R 按钮 | 5s 轮询 + visibility 暂停 + 失败降级 |
| 列表分页 | 前端写死 `limit=80` | UI 分页 + status/workflow 过滤 |
| 路由 | `state.view` 字段无 URL 反映 | hash 路由 `#/executions/exec_xxx` |
| 实时日志 | 模态一次拉 trace | V2.2 SSE 流式追加（本期不做） |
| 视图细节 | Inbox/Automation 仅骨架 | V2.3 按 Uiconstraints §7 补齐（本期不做） |
| 文件粒度 | 单文件超线 | 拆 `lib/` + `views/` 多文件 |

### 1.3 路线约束

- **不引入 npm 依赖**（`package.json` dependencies 不动）
- **不引入构建链**（无 Vite/webpack/rollup）
- **不引入 TS**
- **不动样式色板**（Uiconstraints 已定）
- 守 AA-SEAC：单文件 ≤500 行，单函数 ≤50 行
- 后端零改动（接手 2 的 executions 列表 API 已就位）

---

## 2. 三阶段拆分

### V2.1（本期）：vanilla 模块化 + 路由 + 轮询 + 分页过滤

**目标**：把单文件 vanilla 重组为 ESM 多文件模块；上 hash 路由；上 5s 轮询；executions 视图加分页/过滤 UI。

详见 §3。

### V2.2（下期）：SSE 流式 + 后端双脱敏

**目标**：实现 `SECURITY_AUDIT §9` 历史欠账的 SSE 流式脱敏拦截层；前端把模态 trace 改为 SSE 实时追加。

预估改动：后端新增 `GET /workflows/executions/{id}/trace/stream` SSE 端点 + 流式脱敏中间件；前端 `lib/sse.js` + executions 视图替换轮询为 SSE。

### V2.3（下期）：视图补齐 + 操作流细节

**目标**：按 Uiconstraints §7 补齐：
- Inbox：Acknowledge / Assign / Resolve 操作流
- Automation：cron/webhook/event/manual 触发配置 + Issue Output Mode 开关
- Runtime：Health Checks 服务延迟表 + Live Logs 区
- Agent：Agent Profile + Execution History + Runtime Binding + Automation Ownership

预估后端：可能新增 `PATCH /executions/{id}/status`、`GET /agents/{id}/history` 等。

---

## 3. V2.1 修改范围

### 3.1 新增文件

| 路径 | 用途 |
|---|---|
| `WEBUI/lib/utils.js` | `escapeHtml` / `escapeAttr` / `formatTime` / `formatDuration` / `showToast` / `HTML_ENTITIES` |
| `WEBUI/lib/api.js` | `api(path, options)` / `buildRequestOptions` / `readErrorMessage` / `unwrapData` / `unwrapSettled` |
| `WEBUI/lib/state.js` | `state` 单例 + `loadPersisted()` / `saveToken()` / `saveApiBase()` |
| `WEBUI/lib/router.js` | hash 解析 `#/{view}` 或 `#/{view}/{id}`；监听 `hashchange`；视图白名单；`navigate(view, id?)` |
| `WEBUI/lib/poller.js` | `start({interval, onTick})` / `stop()`；`document.visibilityState` 暂停；连续失败 3 次降级 + toast |
| `WEBUI/lib/modal.js` | `openModal(title, meta, text)` / `closeModal` / `filterModalLines` / `copyModalContent` / `renderModalLines` |
| `WEBUI/views/index.js` | 视图派发（按 `state.view` 选择 renderer） |
| `WEBUI/views/components.js` | `resourceItemHtml` / `statusBadge` / `statusTone` / `metricGridHtml` / `executionTableHtml` / `emptyHtml` 等共用片段 |
| `WEBUI/views/runtime.js` | runtime 视图 |
| `WEBUI/views/executions.js` | executions 视图（**含分页 + status/workflow 过滤 UI**） |
| `WEBUI/views/inbox.js` | inbox 视图（V2.3 再补操作流） |
| `WEBUI/views/workflows.js` | workflows 视图 + 手动触发表单 |
| `WEBUI/views/agents.js` | agents 视图 + 创建表单 |
| `WEBUI/views/assistant.js` | project-assistant-digest 视图 |
| `WEBUI/views/settings.js` | settings 视图 + 表单绑定 |
| `docs/planning/PLAN_WEBUI_V2.md` | 本文件 |

### 3.2 改动现有文件

| 路径 | 改动点 |
|---|---|
| `WEBUI/index.html` | `<script>` → `<script type="module" src="./app.js">`；去掉单独引入 `views.js` |
| `WEBUI/app.js` | 缩成 ~50 行 bootstrap：`import` 各模块 + `DOMContentLoaded` 绑定 + 启动 router/poller |
| `WEBUI/README.md` | 增补 V2.1 目录结构 + ESM 加载说明 + 路由用法（hash 深链） |
| `WEBUI/views.js` | **删除**（内容拆到 `views/*.js`） |

### 3.3 路由白名单（router.js）

合法视图：`runtime / inbox / executions / workflows / agents / assistant / settings`
合法路径形态：
- `#/{view}` → 选中默认列表项
- `#/{view}/{id}` → 选中指定 id（仅 executions / workflows / agents / inbox 支持）

非法 hash → 回退到 `#/runtime`。

### 3.4 轮询策略（poller.js）

- 默认 `interval = 5000ms`
- `document.visibilityState === 'hidden'` → 暂停（节能 + 避免后端无效负载）
- 连续 3 次失败 → 停止轮询 + toast「Auto refresh paused (3 failures), reload to retry」
- 每次 tick 拉：`/healthz` + `/readyz` + `/workflows/executions?limit=50` + `/workflows` + `/agents?limit=80`
- tick 内仅在请求成功时更新 state（失败不破坏现有 state）

### 3.5 executions 视图分页/过滤

- status 下拉：`ALL` / `PENDING` / `RUNNING` / `SUCCESS` / `FAILED` / `STUCK` / `TIMEOUT`
- limit 固定 50
- 上一页 / 下一页按钮 + 「offset+1 - min(offset+limit, total) of total」总数显示
- 过滤变化时 `offset` 重置为 0
- 注意：轮询会复用当前 filter/offset，不能在用户翻页时被打回首页 → state 里持久化 `executions.filter` / `executions.offset`

---

## 4. 决策表（D-WEBUI-V2.1-*）

| 编号 | 决策 | 选项 | 决议 | 理由 |
|---|---|---|---|---|
| D-1 | 模块系统 | ESM / CJS / 不动 | **ESM** | 浏览器原生支持；与 server.js 反代独立；package.json 已 `"type": "commonjs"` 留给 server，前端 ESM 不冲突 |
| D-2 | 路由方案 | hash / pushState | **hash** | 静态服务无后端配合；刷新页面零额外配置；不需 history API |
| D-3 | 状态管理 | 单全局对象 / 简易 store | **保留单全局 `state`** | 现状已用，V2.1 不改思路；7 视图规模不需 reducer |
| D-4 | 轮询 vs SSE | 轮询 / SSE | **轮询**（用户裁决） | SSE 走 V2.2；V2.1 优先模块化 |
| D-5 | 轮询间隔 | 3s / 5s / 10s | **5s** | 兼顾响应 + 后端负载；executions 列表查询便宜（带 LIMIT） |
| D-6 | 失败降级阈值 | 3 / 5 / 10 | **3** | 三次错就停；避免雪崩；用户可手动 reload |
| D-7 | 视图派发 | switch / 对象表 | **对象表** | 现状已用 `renderers[state.view]()`；保持 |
| D-8 | 文件头注释格式 | `// [ui] ID: WEBUI-V2.1 \| ...` | 同 MVP | 保持已建立的格式 |

---

## 5. 提交计划

```
commit 4: feat(webui): V2.1 vanilla 模块化 + hash 路由 + 5s 轮询 + 分页过滤
```

单 commit 收口 V2.1。**不打 release tag**（V2 在 V2.3 收口时统一升 `v1.9.0`）。

---

## 6. 潜在破坏 + 兜底

| 破坏点 | 检测 | 兜底 |
|---|---|---|
| ESM 模块路径加载失败 | 浏览器 console `Failed to fetch dynamically imported module` | server.js 已设 `.js → text/javascript`；index.html 用相对路径 `./lib/*.js` |
| 拆分遗漏函数 | 视图报 `ReferenceError` | 拆完逐视图手测；后端 e2e 测试不变兜底 |
| hash 路由解析错误 ID | 进入空视图 | router.js 白名单校验，非法 → 回退 `#/runtime` |
| 轮询雪崩 | 后端 QPS 突增 | visibility 暂停 + 失败连续 3 次降级 |
| `executions.js` 文件超 500 行 | AA-SEAC §1.3 违反 | 分页/过滤 helper 抽到 `views/executionsHelpers.js` 或回流 `components.js` |
| 现有用户已存 `xscaffold.token` localStorage | 兼容 | `state.js` 读取键名不变 |

---

## 7. 验收清单（手测）

进 commit 前必须本地手测过一次：

1. `cd WEBUI && node server.js` 起 5173；后端 `npm run dev` 起 3000
2. 浏览器开 `http://127.0.0.1:5173`
3. **路由测试**：
   - [ ] 默认进 `#/runtime`，sidebar Runtimes 选中
   - [ ] 点 Executions → `#/executions`，列表显示
   - [ ] 点列表某条 → `#/executions/exec_xxx`，详情区显示
   - [ ] 浏览器后退 → 回到列表
   - [ ] 刷新页面 → 保持当前视图
4. **轮询测试**：
   - [ ] 后台触发一次 `POST /workflows/demo-add/execute`
   - [ ] ≤ 5s 内 executions 列表自动出现新条目（无需手动 R）
   - [ ] 切换到其他 tab 10s 后切回，看 console 不应有失败请求堆积（visibility 暂停验证）
5. **分页过滤测试**：
   - [ ] 触发 60 条 execution，列表显示「1 - 50 of 60」+ 下一页按钮可点
   - [ ] 选 status=FAILED → 只显示失败的
   - [ ] 切到 status=ALL → 恢复全部
   - [ ] 翻到第 2 页期间下次轮询不应把 offset 打回 0
6. **模态测试**：
   - [ ] trace 模态正常打开 / 搜索 / 复制
7. **降级测试**（可选，临时改 BACKEND_URL 为不可达）：
   - [ ] 3 次失败后停轮询 + toast 提示
8. **lint**：`npm run lint` 通过（项目根，按现有规则）

---

## 8. 不在 V2.1 范围（显式声明）

- ❌ SSE 接入（V2.2）
- ❌ 后端 SSE 端点 + 流式脱敏（V2.2，对接 SECURITY_AUDIT §9）
- ❌ Inbox/Automation/Health Checks 视图细节（V2.3）
- ❌ UI 自动化测试（vanilla DOM 测试成本高，V2.3 评估）
- ❌ 引入构建链 / TS / 任何 npm 依赖
- ❌ 样式色板调整
- ❌ 后端 CORS 配置（server.js 反代已规避）
- ❌ release tag 升版（V2.3 统一升 v1.9.0）
