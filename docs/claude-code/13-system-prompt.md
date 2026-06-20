# System Prompt 构建对比：动态上下文注入

## Coder System Prompt

### 实现位置
`src/features/agent/environment/build-system-prompt.ts`

### 构建方式
```
resolve-environment.ts → 解析工作区环境信息
build-system-prompt.ts → 组装 System Prompt
```

### 组成部分
1. **核心指令**：Agent 操作原则、代码规范（AGENTS.md）
2. **工具定义**：根据 AgentMode 过滤后的工具列表
3. **技能注入**：启用的用户技能描述
4. **会话策略**：sessionKind / autonomyMode / decisionPolicyVersion

### AGENTS.md 集成
- 从工作区根目录读取 `AGENTS.md`
- 内容直接注入到 System Prompt
- 支持项目特定的代码规范和规则

## Claude Code System Prompt

### 实现位置
`src/utils/systemPrompt.ts` + `fetchSystemPromptParts()`

### 动态组装
System Prompt 由多个部分动态组装：
1. **核心行为指令**：AI 的基本行为规范
2. **CLAUDE.md**：项目级指令文件（类似 AGENTS.md）
3. **Git 状态**：当前分支、未提交更改
4. **日期时间**：当前系统时间
5. **MCP 服务器列表**：已连接的 MCP Server 及其工具
6. **Skill 列表**：`formatCommandsWithinBudget()` 截断后的技能描述
7. **Hook 声明**：激活的 Hook 事件通知
8. **Worktree 信息**：当前 git worktree 状态

### Prompt 预算控制
```
Skill 描述预算 = contextWindowTokens × 4 chars/token × 1%
单条上限 = 250 字符
三级降级: 完整描述 → 均分预算 → 仅名称
Bundled Skills 不可截断
```

### 压缩后重新注入
压缩后通过 50K token 预算重新注入关键上下文：
- 最近 5 个文件内容（每文件 5K tokens）
- 已激活技能指令（总计 25K tokens）
- CLAUDE.md 内容
- MCP 工具发现结果

## 对比分析

| 维度 | Coder | Claude Code |
|------|-------|-------------|
| **项目指令** | AGENTS.md | CLAUDE.md |
| **动态信息** | 基本（工作区路径） | 丰富（Git状态、日期、MCP列表、Skills） |
| **Skill 预算** | 无限制注入 | 1% 上下文窗口 + 三级降级 |
| **压缩后恢复** | Handoff 文档 | 50K token 重新注入预算 |
| **工具描述** | 完整 JSON Schema | 动态 description() + ToolSearch 延迟加载 |

## Coder 可学习的思想

### 1. 动态上下文注入
Claude Code 在 System Prompt 中注入 Git 状态、日期时间、MCP 列表等动态信息，让 AI 拥有更完整的环境感知。

**建议**：Coder 可在 System Prompt 中注入更多动态信息：
- 当前 Git 分支和变更摘要
- 当前日期时间
- 工作区基本信息（文件数量、主要语言）

### 2. Skill 描述预算控制
Claude Code 的 `formatCommandsWithinBudget()` 确保 Skill 列表不会占满上下文空间。Coder 目前无限制注入所有启用技能的描述。

**建议**：Coder 应计算 System Prompt 总 token 开销，对 Skill 描述进行截断或优先级排序。

### 3. 工具动态描述
Claude Code 的 `description(input)` 根据输入参数返回不同描述（如 `"Execute skill: ${skill}"`）。这比静态描述更精确。

**建议**：Coder 的工具描述可考虑支持动态生成，根据上下文提供更有指导性的描述。

### 4. 压缩后重新注入
Claude Code 在压缩后通过 50K token 预算重新注入关键上下文。Coder 的 Handoff 依赖 AI 自行总结，可能遗漏关键信息。

**建议**：Coder 的交接过程可结构化恢复关键上下文——自动注入 AGENTS.md、最近编辑的文件摘要等。
