// [planner] ID: PLAN-V2-DESIGN-TOKEN | Date: 2026-05-20 | Description: WEBUI 全切设计 token 体系（tokens.css + Tailwind CDN）+ 4 个主视图套用户设计稿；用户已 CONFIRM（四问四答）

# V2 WEBUI Design-Token 迁移 + 主视图套版

> 触发：用户在 `WEBUI/new/` 完成 4 个 HTML 设计稿（runtime/agent/automation/inbox），要求"套下模板"
> 路线决策（用户 CONFIRM）：A 全切 token / 接入 V2.1 SPA / 真 API 拉得到的拉拉不到 mock 占位 / 本期 4 个主视图
> 依据：`Uiconstraints.md` §1-9 + `AGENTS.md` UI 独立维护原则 + `RULES.md` 大改动必走 PLAN→CONFIRM

---

## 1. 范围

| 维度 | 改动 |
|---|---|
| CSS 体系 | 删 styles.css + theme.css，引 tokens.css + Tailwind CDN + tw-tokens.js + 新建 app.css |
| Shell 结构 | index.html 重写：SVG 图标 nav + viewBody swap + token modal/toast |
| Lib | dom.js 改为 shell-level id（去掉 V2.1 三栏 id 引用）；router 加 'automation' 白名单 + legacy 'workflows' → 'automation' 重定向；app.js bootstrap 去掉 nav text-button 绑定 |
| Views | 7 个 view 全部重写为 viewBody innerHTML 整段渲染 |
| 删除 | workflows.js（被 automation.js 替代）、components.js（不再共用） |

---

## 2. 视图清单（commit 6）

### 2.1 主接（套设计稿，完整 token 化）

| View | 数据源 | mock 部分 |
|---|---|---|
| `runtime.js` | `/healthz` `/readyz`（live probes） | runtime list × 4 / metrics(uptime/heartbeat/workload/memory) / sparkline / health checks 6 项 / live logs 12 行 |
| `agents.js` | `/agents` REST（name/model/tools/status/updatedAt） | active tasks 3 项 / execution history 6 项 / automation ownership 2 项 |
| `automation.js` | `/workflows` registry + `/workflows/executions` 最近 8 条（history table） | trigger 类型推断 / cron schedule / next run / retry policy / IOO toggle / success spark |
| `inbox.js` | `/workflows/executions` 过滤 FAILED/STUCK/TIMEOUT | trace step 展开 / runtime event 时间线 |

### 2.2 最小 token 化（沿用 V2.1 业务逻辑）

| View | 状态 |
|---|---|
| `executions.js` | 保留分页/过滤/trace modal；shell 重写为 token 三栏（list-wide + detail） |
| `assistant.js` | 保留 project-assistant-digest 触发表单；token 化简洁版（无 nav 入口） |
| `settings.js` | API base + JWT token 表单；token 化 + runtime info 副卡片 |

### 2.3 删除

- `WEBUI/views/workflows.js` — 被 automation.js 完全替代
- `WEBUI/views/components.js` — 不再共用（每个 view 自渲染整段 HTML）
- `WEBUI/styles.css` — tokens.css + app.css 全面接管
- `WEBUI/theme.css` — 颜色 token 已在 tokens.css :root

---

## 3. Shell 重设计

### 3.1 DOM 拓扑

```
<body>
  <div class="flex h-full">
    <nav id="primaryNav" class="w-nav bg-canvas bd-r">
      <a data-nav="runtime"     href="#/runtime"    >SVG</a>
      <a data-nav="agents"      href="#/agents"     >SVG</a>
      <a data-nav="automation"  href="#/automation" >SVG</a>
      <a data-nav="inbox"       href="#/inbox"      >SVG</a>
      <div class="flex-1"></div>
      <a data-nav="settings"    href="#/settings"   >SVG (gear)</a>
      <a data-nav="user"        href="#/settings"   >SVG (user)</a>
    </nav>
    <div id="viewBody" class="flex-1 flex overflow-hidden"></div>
  </div>
  <div id="modalBackdrop" class="modal-backdrop hidden">...</div>
  <div id="toast" class="toast"></div>
</body>
```

### 3.2 nav 高亮

`views/index.js` 的 `render()` 内调用 `syncNavHighlight()`，遍历 `#primaryNav [data-nav]` 切换 `.is-active` class。

### 3.3 路由

- 白名单：`runtime / agents / automation / inbox / executions / assistant / settings`
- legacy redirect：`#/workflows` → `automation`
- 默认 fallback：`runtime`
- 深链格式：`#/<view>` 或 `#/<view>/<id>`

---

## 4. 决策表（D-V2-TOK-*）

| 编号 | 决策 | 决议 | 理由 |
|---|---|---|---|
| D-1 | CSS 体系 | 全切 tokens（用户选） | 你的 tokens.css 工程化程度高（4px 网格 + 4-tier neutral + tint pair）；V2.1 styles.css 是手写早期产物，全替换更干净 |
| D-2 | Tailwind 引入方式 | CDN + JIT | 无构建链原则不变；CDN with tw-tokens.js JIT 配置桥接 tokens 变量 |
| D-3 | 入口结构 | 接入 V2.1 SPA（用户选） | 复用 hash router + poller + state；4 个 HTML 拆为 view 模块 |
| D-4 | DOM 收集策略 | shell-level only | dom.js 不再 collect V2.1 三栏 8 个 id；每个 view 自己 querySelector view-internal 元素 |
| D-5 | view 间共用 helper | 不抽 components.js | 每个 view 自渲染 HTML（mock 数据形态差异大，抽不出干净抽象） |
| D-6 | mock 数据位置 | view 模块顶部 const | 替代 V2.1 全局 mock-data.json；view 自治；后端真数据通过 state.* 取 |
| D-7 | runtime view 数据 | 全 mock（list/metrics/logs） | 后端没有 runtime registry / metrics 端点；用 health/ready 兜底显示 live 探针 |
| D-8 | nav 视图入口 | 4 个主 + Settings | 用户设计 nav 是 4 图标，executions / assistant 暂无入口（hash 直达） |
| D-9 | legacy class | 一次性清理 | 保留 V2.1 的 .resource-* / .metric-grid / .filter-bar 会冗余；删 styles.css 强制重写 view |
| D-10 | Tailwind JIT 风险 | 接受 | CDN with config 应 watch DOM；动态 innerHTML 注入的 class 会被 JIT pick up；如有缺失 case-by-case 补 token class |

---

## 5. 后端字段 reality check

**0 后端改动**。所有数据从既有 REST endpoint 拉：

| 视图 | live 字段 | mock 字段（设计稿要求但后端没有） |
|---|---|---|
| runtime | health.status / ready.status | runtime list / uptime / heartbeat / workload / memory / spark / live logs / health checks |
| agents | name / model / tools / status / updatedAt / description | success% / avg latency / runtime binding / active tasks / execution history / automation ownership |
| automation | workflow.id / version / description / nodes（list） + executions.startedAt/durationMs/status（history table） | cron schedule / next run / retry policy / linked agent stats / IOO toggle / success spark |
| inbox | execution.id / workflowId / status / error / startedAt / finishedAt / durationMs | trace step 展开 / runtime event 时间线 |
| executions | 全字段 live | — |

所有 mock 占位在 UI 上明确标注 `mock`，不混淆。

---

## 6. 已知 caveat（technical debt）

| 项 | 影响 | 后续 |
|---|---|---|
| Tailwind CDN 需要外网 | 离线时 UI 完全裸 | V2.3 可考虑本地化 Tailwind（npm 安装 + 构建） |
| state.executions 被 pollTick 覆盖 filter 结果 | executions 视图切到 FAILED 后 5s 被全量 80 条覆盖 | V2.3 让 executions view 自管 pollTick |
| runtime view list 全 mock | 看起来是真的，但点击不触发后端 | 后端无 runtime registry；V2.3 可选接 metrics |
| 4 个设计稿用 grid-cols-5 等 Tailwind JIT 类 | 依赖 CDN JIT 扫描动态注入的 class | 已验证可工作；如遇缺失 fallback 写 inline style |
| 旧 mock-data.json | V2.1 留下的 ProjectAssistant mock，本期未用 | 等 projects 视图（V2.3）时复用 |

---

## 7. 提交计划

```
commit 6: feat(webui): V2 design-token 迁移 + 4 主视图套设计稿 + 视图重组
```

不打 release tag。本地累计 6 commit 落后 origin/main，等 V2.3 收口统一升 `v1.9.0`。

---

## 8. 不在范围（commit 6）

- ❌ Projects 视图（设计稿没做，后续）
- ❌ executions 自管 polling（同上 V2.3）
- ❌ SSE 实时（V2.2 独立 PLAN）
- ❌ tokens.css 本地化 Tailwind（CDN 够用）
- ❌ 后端任何改动
- ❌ release tag
