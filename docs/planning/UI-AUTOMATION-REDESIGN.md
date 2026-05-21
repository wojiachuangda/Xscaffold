# Automation 视图重设计方向（交美术）

> **背景**：现 automation 视图把每个 workflow 标上触发器类型（cron/webhook/event/manual）、显示
> cron 表达式 / next-run / 绑定 agent / sparkline / Issue-Output 开关——**这些后端全无数据**。
> `WorkflowSchema` 根本没有 trigger/schedule 字段，也没有调度子系统。
> **结论**：在补「触发器/调度」后端之前，automation 视图实质上只能是
> **「工作流目录 + 手动运行 + 执行历史」**。按这个真实能力重设计。
> 设计遵循 `rules/Uiconstraints.md`。

---

## 一、删除清单

| 删 | 原因 |
|---|---|
| 触发器类型 badge（cron/webhook/event） | workflow 契约无 trigger 字段，靠 id 字符串猜 |
| Schedule 区块（cron 表达式 / next-run） | 无调度子系统、无 cron 数据 |
| Linked Agent 卡 | `GET /workflows` 列表剥掉 nodes，取不到 agent 绑定 |
| Sparkline | 无时序数据 |
| Issue Output Mode 开关 | 无对应配置契约 |

---

## 二、新布局：三栏（保留——有多个 workflow）

`nav 56px ┃ workflow 列表 260–320px ┃ 详情 flex:1`

```
┌────────┬──────────────────┬────────────────────────────────┐
│ nav    │ Workflows         │ 详情                            │
│        │ ──────────────    │ Header: [名称] v1.0  [Run]      │
│        │ ● digest      3n  │ ───────────────────────────────│
│        │ ● nightly     5n  │ ① Definition                    │
│        │ ● ingest      2n  │   description / version / 节点数 │
│        │                   │ ───────────────────────────────│
│        │                   │ ② Execution History             │
│        │                   │   近 N 次执行（状态/时间/耗时）   │
└────────┴──────────────────┴────────────────────────────────┘
```

### workflow 列表项（高 40–48px）
`[状态点] [workflow 名] [节点数]`
- 状态点：取该 workflow 最近一次执行的状态（成功绿 / 失败红 / 无执行灰）。
- 名称 13px/500；右侧 `3n`（节点数，12px/#9CA3AF）。
- 选中项：`#F0F0ED` 背景 + 左侧 2px `#111` accent 线。

### 详情 Header（48px）
`[workflow 名 16px] [version 徽标] ……右侧 [Run] 主按钮`
- `Run` = 主操作按钮（黑底白字）→ `POST /workflows/:id/execute`，触发后 toast「已触发，异步执行」。

### ① Definition 区块
细线区块，纯文字：
- `description`（13px 正文）
- `version` / `节点数 nodeCount`（12px 次要文字，两列）
- ⚠️ 节点图 / 节点列表 **需后端**（见第五节），本期只显示 `nodeCount` 数字。

### ② Execution History 区块
该 workflow 的历史执行列表，数据真实：`GET /workflows/executions?workflowId=<id>&limit=N`。
每行：`[状态点] [executionId 截断] [status badge] [开始时间] [耗时]`。
点一行可跳到 executions 视图看详情（复用现有 trace）。空态：纯文字「No executions yet」。

---

## 三、数据来源

| 区块 | endpoint | 真实度 |
|---|---|---|
| workflow 列表 | `GET /workflows` → `{id,name,version,description,nodeCount}` | ✅ 真 |
| Run 按钮 | `POST /workflows/:id/execute`（202 异步） | ✅ 真 |
| Definition | 同 `GET /workflows` 的列表项字段 | ✅ 真（除节点图） |
| Execution History | `GET /workflows/executions?workflowId=<id>` | ✅ 真 |

---

## 四、配色 / 交互

- 同 Uiconstraints：冷白灰、card `#FFFFFF`/`1px #E7E7E4`、状态色仅点/badge。
- automation **不在 5s 轮询** 视图内（沿用 poll-scope 决策；手动操作类视图不参与轮询重渲染）。
- Run 后不自动刷历史，给 toast；用户切换/重进时再拉最新。

---

## 五、给后端的配套建议（决定是否补）

- **`GET /workflows/:id`（返回完整定义，含 nodes/edges）** —— 小工程量。补了之后 Definition 区
  可展示节点列表 / 简单 DAG，agents 视图的「ownership 反查」也依赖它。**建议优先补这一个。**
- 触发器/cron 调度子系统 —— 大工程，是独立新功能。补了再在 Header 加「Trigger」区块（cron 表达式 +
  next-run）。**本期不做。**

---

## 六、一句话给美术

「automation 改成**工作流目录页**：左侧 workflow 列表，右侧详情＝顶部名称+Run 按钮、Definition
（描述/版本/节点数）、Execution History（真实执行记录列表）。删掉所有触发器/cron/绑定/开关/图表。」
