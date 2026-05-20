# UI Design Constraints: AI-native Workspace OS

> 将此文档作为 System Prompt 或设计约束前置上下文，指导 Claude 生成符合规范的 Web UI。

---

## 1. 产品气质定位

这是一个**桌面级 AI 原生协作操作系统**（AI-native Workspace OS），不是聊天机器人，不是营销产品，不是 AI 助手界面。

目标气质参考：Linear / GitHub / Vercel Dashboard / Kubernetes Dashboard / Raycast / Temporal 的结合体。

核心感受关键词：
- `Operational` — 系统在运行，不是在展示
- `Long-running` — 像一个已稳定运行多年的内部系统
- `Infrastructure-grade` — AI 是底层能力，不是主视觉
- `Silent` — 不喧嚣，不闪烁，不营销
- `Trustworthy` — 强调稳定、可追溯、可控

绝对禁止：
- ❌ Chat UI 风格（气泡、对话框）
- ❌ AI 助手拟人化（机器人图标、"Hi! I'm your AI"）
- ❌ 营销感（大标题、渐变 Hero、CTA 按钮）
- ❌ 玻璃拟态（backdrop-filter、透明卡片）
- ❌ 炫技动画（入场动画、粒子效果、大面积过渡）

---

## 2. 视觉风格

**极简主义 · 低饱和 · 冷白灰系统感**

- 极简（Minimal）：去掉所有装饰性元素
- 低饱和：颜色只作状态标识，不作装饰
- 冷色调：偏冷白、灰蓝，无暖色系背景
- 几乎无阴影：最多用 `box-shadow: 0 1px 2px rgba(0,0,0,0.04)` 做极轻层次
- 超轻边框：细线分割，不作强调
- 大量留白：信息不拥挤，呼吸感充足
- 微圆角：`8px`–`12px`，不超过 `16px`
- 无夸张渐变：可用 `#F5F5F3 → #FFFFFF` 极轻过渡，禁止彩色渐变

---

## 3. 色彩规范

### 基础色板

| 用途 | 色值 |
|------|------|
| 主背景 | `#F5F5F3` / `#F7F7F5` |
| 面板/卡片背景 | `#FFFFFF` |
| 边框/分割线 | `#E7E7E4` |
| 主文本 | `#111111` |
| 次要文本 | `#6B7280` |
| 占位符/禁用文本 | `#9CA3AF` |
| 悬停背景 | `#F0F0ED` |
| 选中背景 | `#EBEBEA` |

### 状态色（低饱和语义色）

| 状态 | 色值 | 说明 |
|------|------|------|
| 在线/成功 | `#4ADE80` → 点状用 `#22C55E` | 低饱和绿，仅用于小圆点或 badge |
| 错误/失败 | `#FCA5A5` → 文字用 `#DC2626` | 柔和红，不用纯红 |
| 警告/等待 | `#FCD34D` → 文字用 `#B45309` | 低饱和橙黄 |
| 运行中 | `#93C5FD` → 文字用 `#1D4ED8` | 冷蓝，表示 active/processing |
| 已停止 | `#D1D5DB` | 中性灰 |

### 原则
- **颜色只用于传递状态信息**，不用于装饰
- 背景大面积保持白灰，颜色仅出现在 badge、状态点、icon
- 禁止使用饱和度高于 60% 的颜色做背景

---

## 4. 字体规范

```css
/* 主字体 — UI 文本 */
font-family: 'Inter', 'SF Pro Display', 'IBM Plex Sans', -apple-system, sans-serif;

/* 代码/日志字体 */
font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
```

### 字号层级

| 层级 | 字号 | 字重 | 颜色 | 用途 |
|------|------|------|------|------|
| 页面标题 | `16px` | `500` | `#111111` | 页面/模块名 |
| 区块标题 | `13px` | `500` | `#111111` | 列表列头、卡片标题 |
| 正文 | `13px` | `400` | `#111111` | 主要内容 |
| 次要文本 | `12px` | `400` | `#6B7280` | 描述、时间戳、元信息 |
| 标签/badge | `11px` | `500` | 语义色 | 状态、类型标识 |
| 日志/代码 | `12px` | `400` | `#374151` | terminal 内容 |

---

## 5. 布局规范

### 三栏结构
```
┌──────────┬───────────────────┬──────────────────────┐
│  左侧    │   中间            │   右侧               │
│  导航栏  │   资源列表区      │   详情/工作区        │
│  56px    │   260px–320px    │   flex: 1            │
└──────────┴───────────────────┴──────────────────────┘
```

### 左侧导航栏（固定，56px 宽）
- 图标导航，无文字标签（或折叠态）
- 当前选中项用 `#EBEBEA` 背景 + `#111111` 图标
- 非选中项 `#9CA3AF` 图标，hover 变 `#6B7280`
- 顶部放 Logo/WorkspaceMark，底部放 Settings/User

### 中间列表区
- 列表项高度：`40px`–`48px`
- 列表项结构：`[状态点] [标题] [元信息]` 左右对齐
- 选中项：`#F0F0ED` 背景 + 左侧 `2px` accent 线（`#111111`）
- 分组用 `12px` `#9CA3AF` 大写标签 + 细分割线

### 右侧详情区
- 顶部固定 header bar（48px），含名称 + 操作按钮
- 内容区 `padding: 20px 24px`
- 分区用细线 `border-bottom: 1px solid #E7E7E4` 分隔，不用卡片套卡片

---

## 6. 组件规范

### Buttons（按钮）
```css
/* 主操作按钮 */
background: #111111; color: #FFFFFF;
border-radius: 8px; padding: 6px 12px; font-size: 13px;
border: none;
/* hover: */ background: #374151;

/* 次要按钮 */
background: transparent; color: #111111;
border: 1px solid #E7E7E4; border-radius: 8px;
/* hover: */ background: #F0F0ED;

/* 危险操作按钮（Restart/Stop） */
background: transparent; color: #DC2626;
border: 1px solid #FECACA; border-radius: 8px;
/* hover: */ background: #FEF2F2;
```

- 所有按钮 `transition: all 0.1s ease`
- 禁止使用夸张 hover 效果（颜色跳变、放大）
- 图标按钮无文字时，尺寸 `28px × 28px`，圆角 `6px`

### Badge（标签）
```css
padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;
/* 行内元素，不撑大父容器 */
```

| 类型 | 背景 | 文字色 |
|------|------|--------|
| running | `#DBEAFE` | `#1D4ED8` |
| idle | `#F3F4F6` | `#6B7280` |
| error | `#FEE2E2` | `#DC2626` |
| warning | `#FEF3C7` | `#B45309` |
| success | `#DCFCE7` | `#15803D` |
| stopped | `#F3F4F6` | `#9CA3AF` |

### 状态指示点（Online Dot）
```css
width: 6px; height: 6px; border-radius: 50%;
/* online: */ background: #22C55E;
/* offline: */ background: #D1D5DB;
/* error: */ background: #EF4444;
/* warning: */ background: #F59E0B;
```

### Log / Terminal 区域
```css
background: #0F0F0F; /* 或 #1A1A1A */
color: #D1D5DB;
font-family: 'JetBrains Mono', monospace;
font-size: 12px; line-height: 1.7;
padding: 12px 16px;
border-radius: 8px;
overflow-y: auto;
/* 日志行 */
.log-time { color: #6B7280; }
.log-info { color: #93C5FD; }
.log-warn { color: #FCD34D; }
.log-error { color: #FCA5A5; }
.log-success { color: #86EFAC; }
```

### 面板卡片（Panel Card）
```css
background: #FFFFFF;
border: 1px solid #E7E7E4;
border-radius: 10px;
padding: 16px 20px;
/* 无 box-shadow，或极轻: */
box-shadow: 0 1px 2px rgba(0,0,0,0.04);
```

- 面板是**系统模块**，不是营销卡片
- 禁止在面板内使用大图、插图、装饰性图标

### Divider（分割线）
```css
border: none;
border-bottom: 1px solid #E7E7E4;
margin: 12px 0;
```

---

## 7. 核心页面结构

### Runtime 管理页
```
Header: [Runtime 名称] [状态点 + 状态文字] [Restart] [Stop]
────────────────────────────────────────
Metrics Row: [Uptime] [Heartbeat] [Workload] [Memory] — 4列 metric card
────────────────────────────────────────
下半区左: Health Checks 列表（服务名 / 状态 / 延迟）
下半区右: Live Logs（terminal 样式，滚动）
```

### Agent 页面
```
左侧列表: Agent 列表（名称 / 状态点 / 绑定 Runtime）
右侧详情:
  - Agent Profile（名称 / 创建时间 / 技能标签）
  - Active Tasks（当前执行中的任务列表）
  - Execution History（时间线，成功/失败/跳过）
  - Runtime Binding（绑定的 Runtime 名称 + 状态）
  - Automation Ownership（拥有的自动化规则列表）
```

### Inbox / Issue 系统
```
左侧过滤: [All] [Failures] [Warnings] [Resolved]
中间列表: Issue 卡片（类型图标 / 标题 / 时间 / Agent 来源）
右侧详情:
  - Issue 标题 + 状态 badge
  - Execution Trace（折叠展开的步骤列表）
  - Runtime Events（相关事件时间线）
  - 操作按钮: [Acknowledge] [Assign] [Resolve]
```

### Automation 页面
```
列表: Automation 规则（名称 / 触发类型 / 下次执行时间 / 状态）
触发类型 badge: [cron] [webhook] [event] [manual]
右侧详情:
  - 规则名称 + 描述
  - 触发配置（cron 表达式或 webhook URL）
  - 关联 Agent
  - 执行历史（最近 N 次，成功率）
  - Issue Output Mode 开关
```

---

## 8. 交互规范

- **Hover**：背景色变化仅 `+5%` 灰度，`transition: 0.1s`，无缩放无位移
- **Focus**：`outline: 2px solid #111111; outline-offset: 2px`，无彩色
- **Active/Click**：`transform: scale(0.99)`，不超过 `0.02` 缩放量
- **Loading**：使用 `opacity: 0.5` + 灰色骨架屏，禁止旋转动画（或仅用极小 spinner）
- **Empty State**：纯文字提示（12px，`#9CA3AF`），无插图，无 emoji
- **Error State**：行内红色文字 `#DC2626`，或红色 border，不弹 modal

---

## 9. 禁止清单（Hard Rules）

| 禁止项 | 说明 |
|--------|------|
| ❌ `backdrop-filter` | 玻璃拟态效果 |
| ❌ 彩色渐变背景 | 任何 `linear-gradient` 包含彩色 |
| ❌ `box-shadow` 超过 `0 2px 4px` | 无大阴影 |
| ❌ `animation` 超过 `0.15s` | 无入场动画 |
| ❌ `border-radius` 超过 `16px` | 无过度圆角 |
| ❌ 聊天气泡结构 | 任何 `chat bubble` 布局 |
| ❌ AI 拟人化视觉 | 机器人图标、AI 头像、对话口吻 |
| ❌ 营销语言 | 标语、slogan、CTA 大按钮 |
| ❌ 高饱和强调色 | 背景不使用饱和色 |
| ❌ 超过 3 种颜色的图表 | 保持克制 |