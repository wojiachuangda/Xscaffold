# Runtime 视图重设计方向（交美术）

> **背景**：现 runtime 视图按「多运行时」建模（左侧 runtime 列表 + 逐 runtime 详情），但本应用
> 是**单个 Node 进程**——没有多运行时。列表、逐 runtime 的 logs/sparkline/6 服务健康表全是假数据。
> **结论**：不是删某个区域，是整个视图按错误模型设计。**重做为「单进程 Runtime 健康页」**。
> 设计须遵循 `rules/Uiconstraints.md`（冷白灰、极简、状态色仅作标识、无装饰）。

---

## 一、删除清单

| 删 | 原因 |
|---|---|
| 左侧 runtime 列表（中栏） | 单进程，没有多运行时可列 |
| Heartbeat sparkline（假时序） | 后端无时序数据 |
| 6 服务 Health 表（假服务 + 假延迟） | `/readyz` 只有 db/queue 两项真数据 |

> **Live Logs 保留**（用户最看重）——但不是逐 runtime，而是**单进程的实时日志面板**，
> 由新建的「日志环形缓冲 + SSE」后端供数据。详见第五节 ④。

→ 视图从「三栏（nav + 列表 + 详情）」变为「nav + **单内容区**」。

---

## 二、新布局：单进程 Runtime 页

整体：左侧 56px nav 不变；右侧一整块内容区（`padding: 20px 24px`）。自上而下 4 段，细线分隔。

```
┌─────────────────────────────────────────────────────┐
│ Header bar (48px)                                     │
│  Runtime   ● Healthy          uptime 3d 04:12         │
├─────────────────────────────────────────────────────┤
│ ① Status Row —— 4 个 metric card                      │
│  [Uptime]   [Process]   [Database]   [Queue]          │
├─────────────────────────────────────────────────────┤
│ ② Engine Activity —— 4 个引擎指标 tile                 │
│  [Nodes executed] [Tool calls] [LLM tokens] [Workflow │
│   duration avg]                                       │
├─────────────────────────────────────────────────────┤
│ ③ Health Checks —— 2 行（db / queue），真 readiness    │
├─────────────────────────────────────────────────────┤
│ ④ Live Logs —— 进程实时日志（深色终端，SSE 实时追加）   │
└─────────────────────────────────────────────────────┘
```

### Header bar
- 高 48px，`border-bottom: 1px solid #E7E7E4`，背景 `#FFFFFF`。
- 左：`Runtime`（16px/500/#111）。
- 中：状态点（6px 圆）+ 状态文字（13px）。状态由 `/healthz`+`/readyz` 推导：
  - 两者皆 ok → `● #22C55E` `Healthy`
  - readyz `not_ready` → `● #F59E0B` `Degraded`
  - healthz 失败/不可达 → `● #EF4444` `Down`
- 右：`uptime 3d 04:12`（12px/#6B7280，JetBrains Mono）。

### ① Status Row（4 个 metric card）
一行 4 列，每张 panel card（`#FFFFFF` / `1px #E7E7E4` / `radius 10px` / `padding 16px 20px`）。
每张：上＝标签（11px 大写 #9CA3AF），中＝主值（20px/500/#111），下＝副文字（12px/#6B7280）。

| card | 主值 | 数据源 |
|---|---|---|
| Uptime | `3d 04:12` | `/healthz` → `uptime`（秒，前端格式化） |
| Process | `Healthy` / `Degraded` / `Down` | `/healthz` + `/readyz` 推导 |
| Database | `Ready` / `Not ready` | `/readyz` → `checks.db`（绿/红点） |
| Queue | `Ready` / `Not ready` | `/readyz` → `checks.queue`（绿/红点） |

### ② Engine Activity（4 个指标 tile）
区块标题 `Engine Activity`（13px/500）。一行 4 列 stat tile（同 card 样式，可略小）。
均为进程启动以来的累计值，来自 `/metrics`（见第四节数据说明）。

| tile | 含义 | metric |
|---|---|---|
| Nodes executed | 累计执行节点数 | `nodes_execution_total` |
| Tool calls | 累计工具调用 | `tool_call_total` |
| LLM tokens | 累计 token | `llm_tokens_total` |
| Workflow duration | 平均/计数 | `workflow_duration_ms`（histogram） |

数字用 JetBrains Mono、`t-num`。无图表（Uiconstraints：图表颜色 ≤3，这里直接省，保持克制）。

### ③ Health Checks
区块标题 `Health Checks`。**只有 2 行**（不是原来的假 6 行）：
```
● Database     ready        —
● Job Queue    ready        —
```
每行：状态点 + 服务名（13px）+ 状态文字（12px，ready 绿 / not_ready 红）。延迟列暂留 `—`
（除非后端补 latency，见缺口清单）。

### ④ Live Logs（保留——用户最看重）
进程实时日志尾部。后端新建「日志环形缓冲 + SSE」供数据（见第四节）。
- 样式按 Uiconstraints §6 Log/Terminal：`#0F0F0F` 底、JetBrains Mono 12px、`line-height 1.7`、
  `padding 12px 16px`、`radius 8px`、`overflow-y:auto`。
- 行内配色：`.log-time #6B7280` / `.log-info #93C5FD` / `.log-warn #FCD34D` /
  `.log-error #FCA5A5`（按日志 level）。
- 行为：进入视图先拉 `GET /logs` 快照填充，再开 `GET /logs/stream` SSE 持续追加新行；
  自动滚到底部；面板高度固定、内部滚动。
- 面板 header 可放一个 `Pause`/`Resume` 小按钮（暂停自动滚动，便于翻看），非必需。
- 空态：纯文字「No logs yet」。
- ⚠️ 日志是**内存环形缓冲**（最近约 500 行），非全量历史——这正符合「实时尾部」的用途。

---

## 三、配色 / 交互（遵循 Uiconstraints）

- 背景 `#F5F5F3`，card `#FFFFFF`，边框 `#E7E7E4`，主文本 `#111`，次要 `#6B7280`。
- 状态色只用于点/文字：绿 `#22C55E` / 橙 `#F59E0B` / 红 `#EF4444`。
- 无阴影（或极轻 `0 1px 2px rgba(0,0,0,.04)`）；圆角 8–12px；无动画 >0.15s。
- 数据每 5s 轮询刷新（runtime 已在轮询视图内）；刷新无闪烁，值原地更新。
- 空/不可用：纯文字（12px #9CA3AF），无插图无 emoji。

---

## 四、配套后端

### 4.1 Live Logs —— 日志环形缓冲 + SSE（**新建，用户已要求做**）
- `logger.js` 是 Pino，日志**已过 redact 脱敏**（password/token/cookie...），流给浏览器安全。
- 但 Pino 只写 stdout、无日志文件 → 新建**内存环形缓冲**（`logRingBuffer.js`，留最近 ~500 行 +
  订阅机制），挂到 logger 输出。
- 新建端点：`GET /logs`（快照，返最近 N 行）+ `GET /logs/stream`（SSE 实时 tail）。
- **复用现成基建**：`src/apiGateway/sse.js`（V2.2 的 SSE 通道，含脱敏 + 心跳 + 生命周期）+
  前端 `WEBUI/lib/sseClient.js`。两端都现成。
- 工程量：中等（环形缓冲模块 + 小 controller + 前端接线），非大子系统。

### 4.2 Engine Activity —— 建议加 `/metrics/summary` JSON
`/metrics` 现在是 **Prometheus 纯文本**。前端要么解析文本（约 30 行、易碎），要么后端加一个
**`GET /metrics/summary` JSON 端点** `{uptime,nodesExecuted,toolCalls,llmTokens,workflowDurationAvgMs}`
——建议走 JSON 端点，工程量小、前端干净。不补的话 ② 区需前端解析 Prometheus 文本。

> ① Status Row 用 `/healthz`+`/readyz`（已是 JSON，直接可接），无需后端改动。

---

## 五、一句话总结给美术

「runtime 视图改成**单页系统健康面板**：顶部一条状态栏，下面 4 段——4 张状态卡（uptime/进程/
db/队列）、4 个引擎活动数字、2 行健康检查、Live Logs 实时日志面板（深色终端样式）。删掉左侧
多运行时列表、假 sparkline、假 6 服务表——但 **Live Logs 保留**（由新建的日志环形缓冲+SSE 供数据）。
冷白灰、极简、状态色只点缀。」
