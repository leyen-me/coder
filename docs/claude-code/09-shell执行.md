# Shell 执行对比：命令执行与进程管理

## Coder Shell 系统

### 实现位置
`src/features/agent/tools/shell.ts` + `src/features/terminal/`

### 架构设计
```
shell() → Tauri command spawn → 返回 shell_id
await(shell_id) → 等待完成 → 返回输出
list_shells() → 列出活跃进程
kill_shell(shell_id) → 终止进程
read_shell_logs(shell_id, offset, limit) → 分页读取日志
```

### Shell 工具参数
| 参数 | 默认值 | 说明 |
|------|--------|------|
| command | 必填 | 要执行的命令 |
| description | 可选 | UI 显示描述 |
| working_directory | workspace root | 执行目录 |
| block_until_ms | 30000 | 最大等待时间（0=后台模式） |

### 后台执行模型
- `block_until_ms=0` → 立即返回 `shell_id`
- `await(shell_id)` → 轮询等待完成
- `read_shell_logs()` → 分页读取 stdout/stderr（支持 offset + limit）
- `list_shells()` → 按状态过滤列出进程

### Terminal 面板
- xterm.js 终端模拟器
- 通过 Tauri 插件连接真实 Shell 进程
- 底部可折叠面板，支持多 Tab

## Claude Code Shell 系统

### 实现位置
`src/tools/BashTool/` + `src/tools/PowerShellTool/`

### 架构设计
```
BashTool.call() → spawn shell process → onProgress 实时推送输出
  ↓
权限检查: readOnlyValidation → sandbox 判定 → AST 解析
  ↓
输出处理: maxResultSizeChars(30,000) → 超出持久化到磁盘
```

### BashTool 特性
- **maxResultSizeChars**: 30,000（命令输出上限）
- **isSearchOrReadCommand()**: 识别 `ls`、`cat`、`grep` 等只读命令，触发 UI 折叠显示
- **interruptBehavior()**: `'block'`（用户中断时等待完成）
- **isConcurrencySafe()**: 不同命令可并行执行
- **getPath()**: 提取命令涉及的文件路径（用于权限匹配）

### PowerShellTool
- Windows 平台专用，使用 `pwsh -NoProfile -NonInteractive`
- 与 BashTool 相同的 Tool 接口实现

### TerminalCaptureTool
- 捕获外部终端输出
- 允许 AI "观察"用户正在使用的终端

## 对比分析

| 维度 | Coder | Claude Code |
|------|-------|-------------|
| **Shell 工具** | shell（通用） | Bash + PowerShell（平台区分） |
| **后台执行** | shell_id + await + read_logs | onProgress 实时推送 |
| **输出限制** | 无限制 | 30,000 字符上限 |
| **只读检测** | 无 | isSearchOrReadCommand() + AST 解析 |
| **并发安全** | 无声明 | isConcurrencySafe() 按命令判断 |
| **中断行为** | AbortSignal 统一取消 | interruptBehavior() 按工具定义 |
| **权限检查** | 无命令级检查 | readOnlyValidation + sandbox + AST |
| **UI 显示** | shell-display 组件 | onProgress 实时更新 + 折叠模式 |

## Coder 可学习的思想

### 1. 输出大小限制
Claude Code 的 BashTool 限制输出为 30,000 字符，超出部分持久化到磁盘。这防止大输出（如 `npm ls`）占满上下文空间。

**建议**：Coder 的 shell 工具应设置合理的输出上限（如 20,000-30,000 字符），超出时提示 AI 使用 `read_shell_logs` 分页读取或重定向到文件。

### 2. 只读命令检测
Claude Code 通过 AST 解析和命令白名单判断 `git status`、`ls`、`cat` 等是只读操作，自动放行无需确认。

**建议**：Coder 可引入常见只读命令白名单（ls、cat、head、tail、grep、find、git status/log/diff 等），用于权限判断和 UI 差异化显示。

### 3. onProgress 实时推送
Claude Code 通过 `onProgress` 回调在命令执行过程中实时推送输出到 UI，用户可以看到命令执行的实时进度。

**建议**：Coder 的 shell 工具可通过事件流实时推送输出，而非等待命令完成后再一次性返回。这对长时间运行的命令（如 `npm install`）特别有用。

### 4. 并发安全声明
Claude Code 的 `isConcurrencySafe(input)` 按输入判断是否可以并行执行。`ls` 可以并行，`git commit` 不行。

**建议**：Coder 可为 shell 工具引入并发安全判断——只读命令允许并行，写操作串行执行。

### 5. 中断行为差异化
Claude Code 的 `interruptBehavior()` 定义用户中断时的行为（cancel vs block）。Bash 默认 `'block'`（等待完成），某些工具是 `'cancel'`（立即取消）。

**建议**：Coder 的 shell 工具可声明中断行为——长时间编译命令允许取消，git push 等原子操作必须等待完成。

### 6. PowerShell 支持
Claude Code 有专门的 PowerShellTool 处理 Windows 平台。Coder 目前使用系统默认 Shell。

**建议**：Coder 在 Windows 平台上可检测并使用 PowerShell，提供更好的命令兼容性。

### 7. TerminalCapture 概念
Claude Code 的 TerminalCaptureTool 允许 AI "观察"用户终端的输出。这使得 AI 可以诊断用户在终端中遇到的错误。

**建议**：Coder 可将底部终端面板的输出暴露为一个可读的来源，让 Agent 能查看用户终端中的错误信息。
