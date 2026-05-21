# Agents 视图重设计方向（交美术）

> **背景**：现 agents 视图——agent 列表 / Profile / Tools 已是真数据（`GET /agents`）；但详情下半部
> 「Active Tasks」「Automation Ownership」是硬编码 mock。后端**无 agent 任务概念**、执行记录
> **不能按 agentId 过滤**、也无「哪些 workflow 引用此 agent」反查。
> **结论**：保留真实的 list/profile/tools，**删掉两个 mock 区块**，把详情收敛成一张干净的 agent 档案页。
> 设计遵循 `rules/Uiconstraints.md`。

---

## 一、删除清单

| 删 | 原因 |
|---|---|
| Active Tasks 卡（`MOCK_TASKS`） | 无「agent 任务」概念；执行记录无 agentId 过滤 |
| Automation Ownership 卡（`MOCK_AUTOMATIONS`） | 无 workflow→agent 反查端点 |

---

## 二、新布局：三栏（保留——有多个 agent）

`nav 56px ┃ agent 列表 260–320px ┃ 详情 flex:1`

```
┌────────┬──────────────────┬────────────────────────────────┐
│ nav    │ Agents            │ 详情                            │
│        │ ──────────────    │ Header: [agent 名] ● 状态        │
│        │ ● data-curator    │            ……右侧 [Open in       │
│        │ ● vision-tagger   │              Sessions]          │
│        │ ● project-asst    │ ───────────────────────────────│
│        │                   │ ① Profile                       │
│        │                   │   model / status / 创建·更新时间 │
│        │                   │   description                   │
│        │                   │ ───────────────────────────────│
│        │                   │ ② Skills / Tools                │
│        │                   │   绑定的 tool 列表（白名单）      │
└────────┴──────────────────┴────────────────────────────────┘
```

### agent 列表项（高 40–48px）
`[状态点] [agent 名] [model]`
- 状态点：`status=enabled` 绿 / `disabled` 灰。
- 名称 13px/500；下方一行 model 名（12px/#6B7280，JetBrains Mono）。
- 选中项：`#F0F0ED` + 左 2px accent。
- 列表可按 status 分组（`Active N` / `Disabled N` 大写小标题），沿用现有做法。

### 详情 Header（48px）
`[agent 名 16px] [状态点+状态文字]  ……右侧 [Open in Sessions] 次要按钮`
- **Open in Sessions**：跳到 Sessions 视图、用该 agent 新建会话——这是「调用 agent」的真实入口
  （Sessions 已实现 agent invoke + SSE）。agents 视图本身是**只读监控**，不在此调用。

### ① Profile 区块
细线区块：
- 一行 metric 三列：`Model` / `Status` / `Updated`（标签 11px 大写 + 值 13px）。
- 下方 `description`（13px 正文；空则 `—`）。
- 创建时间 12px 次要文字。

### ② Skills / Tools 区块
区块标题 `Skills`。把 `agent.tools`（字符串数组，工具白名单）渲染成一组 badge / 行列表：
- 每个 tool 一个 `badge-neutral` 标签，或一行 `[· tool 名]`。
- 空态：纯文字「No tools bound」。

---

## 三、数据来源

| 区块 | endpoint | 真实度 |
|---|---|---|
| agent 列表 | `GET /agents` → `{id,name,description,model,tools,status,...}` | ✅ 真 |
| Profile | `GET /agents/:id`（同实体） | ✅ 真 |
| Skills/Tools | agent 实体的 `tools` 数组 | ✅ 真 |
| Open in Sessions | 前端路由跳 `#/sessions`（带 agent 预选） | ✅ 真（纯前端） |

---

## 四、配色 / 交互

- 同 Uiconstraints：冷白灰、状态色仅点/badge。
- agents **不在 5s 轮询** 视图内。
- 详情纯只读——除 Header 的「Open in Sessions」跳转外无操作按钮。

---

## 五、给后端的配套建议（决定是否补）

补了之后可在详情加 **③ Recent Invocations** 区块（该 agent 最近的执行/调用历史）：
- 需后端给执行记录加 `agentId` 维度查询（`ExecutionListQuerySchema` 加 `agentId` 过滤，或 IOOR
  按 agent 查询）。中等工程量。
- **本期不做**——详情就 Profile + Skills 两段，干净诚实。

---

## 六、一句话给美术

「agents 改成**只读 agent 档案页**：左侧 agent 列表，右侧详情＝Header（名称+状态+「Open in
Sessions」跳转按钮）、Profile（model/status/描述）、Skills（tool 白名单标签）。删掉 Active Tasks
和 Automation Ownership 两个假卡。」
