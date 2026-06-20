# Hook 系统对比：生命周期扩展机制

## Coder Hook 系统

### 现状
**Coder 目前没有 Hook 系统。**

Coder 的扩展点仅限于：
- Agent Loop 中的 `onEvent` 回调（内部使用，不暴露给用户）
- System Prompt 的自定义注入（通过设置）
- Skills（作为 Prompt 级别的扩展）

## Claude Code Hook 系统

### 22 种 Hook 事件

| 阶段 | 事件 | 触发时机 |
|------|------|---------|
| **会话** | SessionStart / SessionEnd / Setup | 会话生命周期 |
| **用户交互** | UserPromptSubmit / Stop / StopFailure | 用户操作 |
| **工具执行** | PreToolUse / PostToolUse / PostToolUseFailure | 工具调用前后 |
| **权限** | PermissionRequest / PermissionDenied | 权限决策 |
| **子 Agent** | SubagentStart / SubagentStop | 子 Agent 生命周期 |
| **压缩** | PreCompact / PostCompact | 上下文压缩前后 |
| **协作** | TeammateIdle / TaskCreated / TaskCompleted | Swarm 协作事件 |
| **MCP** | Elicitation / ElicitationResult | MCP 用户输入请求 |
| **环境** | ConfigChange / CwdChanged / FileChanged / InstructionsLoaded / WorktreeCreate/Remove | 环境变更 |

### 6 种 Hook 类型

| 类型 | 执行方式 | 适用场景 |
|------|---------|---------|
| **command** | Shell 命令（bash/PowerShell） | CI 检查、安全扫描 |
| **prompt** | 注入到 AI 上下文 | 代码规范提醒 |
| **agent** | 启动子 Agent 执行 | 复杂分析任务 |
| **http** | HTTP 请求 | Webhook、远程服务通知 |
| **callback** | 内部 JS 函数 | 系统内置 Hook |
| **function** | 运行时注册的函数 | Agent/Skill 内部使用 |

### Hook 输出 JSON Schema
```json
{
  "continue": false,                    // 是否继续执行
  "suppressOutput": true,               // 隐藏 stdout
  "stopReason": "安全检查失败",
  "decision": "approve" | "block",
  "reason": "原因说明",
  "systemMessage": "警告内容",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "updatedInput": { ... },
    "additionalContext": "额外上下文"
  }
}
```

### Hook 四大能力
1. **拦截操作**：PreToolUse 返回 `permissionDecision: "deny"` → 阻止工具执行
2. **修改行为**：`updatedInput` 替换原始输入；`updatedMCPToolOutput` 替换 MCP 输出
3. **注入上下文**：`additionalContext` 注入为用户消息；`systemMessage` 注入为系统警告
4. **控制流程**：`continue: false` → 阻止 Agent 继续执行

### 异步 Hook 协议
- stdout 首行 `{"async":true}` → 转为后台任务
- 完成后通过 `enqueuePendingNotification()` 通知主线程
- `asyncRewake` 模式（退出码 2）→ 唤醒空闲模型或注入 queued_command

### if 条件匹配
```json
{
  "hooks": [{
    "command": "check-git-branch.sh",
    "if": "Bash(git push*)"    // 只在 git push 时触发
  }]
}
```
支持精确匹配、管道分隔多值、正则表达式、通配符。

## Coder 可学习的思想

### 1. Hook 系统的核心价值
Hook 系统是 Claude Code 最强大的扩展机制之一。它允许：
- **安全策略执行**：PreToolUse Hook 检查每次工具调用是否符合公司安全规范
- **CI/CD 集成**：PostToolUse(Bash) Hook 在代码修改后自动运行 lint/test
- **上下文增强**：UserPromptSubmit Hook 注入项目特定信息到 AI 上下文
- **流程控制**：Stop Hook 检测 Agent 是否走偏并强制纠正

**建议**：Coder 应引入基础 Hook 系统，至少支持 PreToolUse / PostToolUse / SessionStart 三个核心事件。

### 2. 从简单开始的设计策略
不需要一次性实现全部 22 种事件和 6 种类型。建议分阶段：

**Phase 1**（MVP）：
- 支持 `command` 类型 Hook（Shell 命令执行）
- 覆盖 PreToolUse / PostToolUse / SessionStart 三个事件
- JSON 输出解析（continue、permissionDecision、additionalContext）

**Phase 2**（增强）：
- 支持 `prompt` 类型（注入上下文）
- 增加 FileChanged / UserPromptSubmit 事件
- if 条件匹配（工具名 + 参数模式）

**Phase 3**（高级）：
- 支持 `http` 类型（Webhook）
- 异步 Hook 检测协议
- PreCompact / PostCompact 事件

### 3. Hook 配置格式
建议 Coder 的 Hook 配置放在 `.coder/hooks.json`：
```json
{
  "hooks": [
    {
      "event": "PreToolUse",
      "matcher": "shell",
      "command": "bash .coder/hooks/safety-check.sh",
      "if": "shell(npm install*)",
      "timeout": 30
    },
    {
      "event": "PostToolUse",
      "matcher": "edit_file|replace_file",
      "command": "bash .coder/hooks/lint.sh",
      "timeout": 60
    }
  ]
}
```

### 4. Hook 执行集成到 Agent Loop
在 `appendToolResults()` 中，工具执行前后调用 Hook：
```typescript
// 工具执行前
const hookResult = await executeHooks('PreToolUse', { toolName, input });
if (hookResult.permissionDecision === 'deny') {
  // 阻止执行，返回拒绝结果
  continue;
}
if (hookResult.updatedInput) {
  input = hookResult.updatedInput;  // 修改输入
}

// 执行工具...

// 工具执行后
await executeHooks('PostToolUse', { toolName, output });
```

### 5. 工作区信任检查
Claude Code 要求所有 Hook 执行前检查工作区信任状态，防止恶意仓库的 `.claude/settings.json` 执行任意命令。

**建议**：Coder 在首次打开工作区时请求用户信任确认，未信任的工作区不执行任何 Hook。

### 6. Session Hook 生命周期
Agent/Skill 的前置 Hook 绑定到 session ID，Agent 结束时自动清理。防止 Hook 泄漏到其他会话。

**建议**：Coder 的 Hook 应支持会话级注册（如 Skill 声明的 Hook），在会话结束时自动注销。
