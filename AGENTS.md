# AGENTS.md
本项目工作前必须读取并遵守以下规则：

1. `.claude/rules/RULES.md`
2. `.claude/rules/AA-SEAC-Specification.md`
3. `.claude/rules/Uiconstraints.md`

**WEB前端目录路径**：`WEBUI`： 
UI 必须作为独立前端项目维护，不允许混入 `src/apiGateway` 或后端源码目录。
后端只提供 API；UI 通过 HTTP API 调用后端。

任何涉及代码修改的任务，必须先读取本文件列出的规则与 `.claude/rules/RULES.md`和`.claude/rules/AA-SEAC-Specification.md`。
涉及较大改动时，必须先给出修改计划，等待用户确认后再编码。

如果任务涉及 UI，必须额外重点遵守 `.claude/rules/Uiconstraints.md`。
如果规则冲突，优先级为：
用户当前指令 > AGENTS.md > `.claude/rules/RULES.md` > `.claude/rules/AA-SEAC-Specification.md` > `.claude/rules/Uiconstraints.md` > 其他项目文档。

## 索引
**实时项目文件拓扑树**:`PROJECT_STRUCTURE.md`：由 hook 自动生成，严禁手动修改。
需要更新拓扑时，应运行对应生成脚本或等待 hook 刷新。

 