# PLAN — V2.2 SSE Review Fix（Tier 1 #1 审核修复）

> 阶段：PLAN（等待 CONFIRM 后进 CODE）
> 来源：Tier 1 #1 并行 code-review + security-review 结论
> 范围基线：`git diff 9a50e13..9ad3b48`（V2.2 SSE + Sessions）

---

## 1. 现状分析

两个 review agent 报了多条 CRITICAL，逐条对照实代码 + 项目威胁模型（个人单用户应用、`AUTH_DISABLED`、用户已裁定「不考虑风控」）后，结论是：多数 CRITICAL 要么**已被现有防御覆盖**，要么是**故意的设计取舍**，要么**超出风控范围**。真正在范围内、已核实、值得动的只有 5 项（D1–D5）。

核实结论：
- **XSS 不是裸面**：`WEBUI/lib/markdown.js:20` 走 `DOMPurify.sanitize`，LLM 输出渲染前必经净化。
- **但 DOMPurify 版本有真实 advisory**：vendored `dompurify@3.2.4`，GitHub advisory API 确认 3 条**默认配置**即可触发的 XSS/mXSS 命中 3.2.4（`GHSA-v8jm-5vwx-cfxm` <3.2.7 / `GHSA-h8r8-wccr-v5f2` <3.3.2 / `GHSA-v2wj-7wpq-c8vv`）。其余 advisory 均依赖我们未使用的配置项（ADD_TAGS/USE_PROFILES 等），不影响。
- **`content` 不脱敏是故意的**：`redactEvent`（`src/apiGateway/sse.js:21`）只脱敏 `toolCalls[].arguments` / `observations[].data`；`content` 透传。且 `redactSensitive` 按 key 名脱敏，对纯字符串本就是空操作。SECURITY_AUDIT §9.2 第 281 行**已声明**此策略 → 非缺陷。
- **断连不中止 agent loop 是故意的**：`sse.js:49` 注释「agent loop 仍跑完以保 IOOR 留痕」，符合 AA-SEAC「凡动必留痕」。代价是断连后仍烧 token → 保持现状。

---

## 2. 修改范围（D1–D5）

| # | 项 | 文件 | 改法 | 规模 |
|---|---|---|---|---|
| D1 | DOMPurify 3.2.4 → 3.4.5 | `WEBUI/vendor/dompurify.es.mjs` | 拉 jsdelivr `dompurify@3.4.5/dist/purify.es.mjs` 覆盖；确认 default export 兼容 `markdown.js` 现 import | 1 文件替换 |
| D2 | `error` 事件 `err.message` 处理 | `src/agentManager/agentController.js` | **加** `logger.error({err, executionId}, ...)` 服务端留全量详情；客户端消息见决策 D2 | +1 import +2 行 |
| D3 | 代理流无 error/abort 传播 | `WEBUI/server.js` | `Readable.fromWeb(body)` 存量引用上 `.on('error', ...)`；`res.on('close', () => readable.destroy())`；可选 `AbortController` 透传断连 | ~5 行 |
| D4 | `consume()` 异常退出不 cancel 流 | `WEBUI/lib/sseClient.js` | `finally` 里在 releaseLock 前对异常路径 `await reader.cancel().catch(()=>{})`，防泄漏底层网络流 | ~3 行 |
| D5 | 审计文档收口 | `docs/security/SECURITY_AUDIT.md` §9.2 | 补两行：error 事件已加服务端日志（D2）、vendored DOMPurify 锁 3.4.5 + 记 sha256（含 C 项 SRI 债登记）。content-not-scanned 第 281 行已有，不重复 | 文档 |

**SPEC 阶段（Zod 契约）**：本批无新增/变更契约。D2 沿用既有 `SseErrorEventSchema`（`type/message/ts` strict），不改 schema。→ SPEC 阶段 **N/A**。

---

## 3. 风险评估（可能破坏的已有业务）

- **D1（最高风险）**：DOMPurify 大跨版本（3.2→3.4）。风险点：默认净化行为若收紧，可能影响现有 markdown 渲染（表格/代码块/链接）。缓解：升级后**必须**手验 Sessions 视图渲染一条含表格+代码块+链接+列表的 LLM 回复，确认排版未退化 + XSS payload（`<img onerror>` / `<script>`）仍被拦。default export 形态不变（`import DOMPurify from ...`），import 不受影响。
- **D2**：仅加日志 + （按决策）消息措辞，不改控制流。低风险。
- **D3**：给 pipe 加 error/close 处理。风险：`destroy()` 时机不当可能截断正常响应尾部。缓解：只在 `res` 关闭（客户端断连）时 destroy 上游，正常完成走 pipe 自然 end。需手验一次正常流式 + 一次中途关页签。
- **D4**：`reader.cancel()` 幂等且包 catch，低风险。
- **D5**：纯文档。无风险。
- **测试影响**：现有 `tests/unit/sse.test.js` / `tests/integration/agentInvokeStream.integration.test.js` 不应受 D1/D3/D4 影响（D1 是前端 vendor、D3/D4 是 WEBUI 层，均不在 jest 覆盖）。D2 改 agentController error 路径——需跑该 integration test 确认 error 事件仍发出（schema 不变应绿）。**收尾跑全量 jest 确认 562 passed 不破。**

---

## 4. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | DOMPurify 升到哪个版本 | **3.4.5（最新，一次清掉全部 advisory 含配置依赖项）**。不顺带升 marked（15→18 大跳跃且输出已被 DOMPurify 兜底，徒增回归面） |
| D2 | error 消息给客户端多少 | **保留 `err.message` 到客户端 + 新增服务端 `logger.error` 全量详情**。理由：个人单用户应用，错误进的是你自己浏览器，全改通用消息只会毁你的自调试 DX 而不防任何人；真正的缺口是**服务端当前没留这条错误日志**。将来多用户化时再切通用消息。⚠️ 此项比我上一条消息里「改通用消息」的说法更克制——按你「根因优先 + 不考虑风控」的偏好调整 |
| D3 | 是否引 `AbortController` 透传断连到上游后端 | **先只做 `.on('error')` + close 时 `destroy()`**（防 dev 代理崩 + 不泄漏上游流）；`AbortController` 透传断连属增强，本批不做（断连不中止 loop 本就是 §4.5 故意设计，前端代理层透传无意义） |
| D4 | cancel 放 finally 还是 catch | **finally 内对未正常结束的流 cancel**，releaseLock 前执行，统一收口 | 
| D5 | C 项（vendor SRI）这次做到哪一步 | **只记 sha256 到审计文档 + 留 backlog**，不引入构建期 SRI 校验链（无构建步骤，强上 SRI 校验是另一个工程）。升级 DOMPurify 时顺手算 sha256 登记 |

**附加问题**
1. commit 粒度：D1–D5 **一个 commit**（`fix(security): V2.2 SSE 审核修复 + DOMPurify 3.4.5`），还是拆「vendor 升级」/「后端 D2-D4」/「文档 D5」三个？我建议**一个**（同属一次 review 收口，体量小）。
2. 跑完是否 push origin/main？建议**跑绿 + 手验后再问你**，不自动 push。

---

## 5. 执行顺序（CONFIRM 后）

1. D1 拉 vendor 文件 + 算 sha256 → 手验 Sessions markdown 渲染 + XSS 拦截
2. D2/D3/D4 三处代码改动
3. 跑全量 jest（确认 562 不破）
4. D5 写审计文档
5. 手验：正常流式一轮 + 中途关页签一轮
6. 回报结果，等你定 commit/push
