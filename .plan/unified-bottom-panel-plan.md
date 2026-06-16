# 统一 PTY 终端面板

## 目标

当前存在两个完全独立的子系统：

| | Human 终端 | AI 进程 |
|---|---|---|
| 后端 | `PtyRegistry`（`portable_pty` 库） | `ShellRegistry`（`tokio::process::Command` 管道） |
| 事件 | `pty-output` / `pty-closed` | `shell-output` / `shell-finished` |
| 命令 | `pty_create` / `pty_write` / `pty_resize` / `pty_close` | `tool_shell` / `tool_await` / `shell_list` / `shell_kill` |
| 前端 | `InteractiveTerminal`（xterm.js，交互式） | `ProcessLogViewer`（只读 `<pre>`） |

目标：**统一到 PTY 体系**。AI agent 调用 shell 时不再 `spawn` 子进程 + 管道，而是创建 PTY 运行命令。前端统一用 xterm.js 展示，只区分「谁开的」以及「能否键盘输入」。

## 后端改动（Rust）

### 1. 合并 PtyRegistry 和 ShellRegistry

两个 Registry 都管理 `HashMap<String, Session>`，核心区别是：
- `PtyRegistry` 持有 `master`（PTY master fd），支持 `write` / `resize`
- `ShellRegistry` 持有 `child`（tokio::process::Child），支持 `await` / `kill`

合并为 `UnifiedPtyRegistry`（或重构 `PtyRegistry` 使其支持 AI 场景）：

```rust
struct PtySession {
    master: Box<dyn MasterPty + Send>,     // PTY master
    writer: Box<dyn Write + Send>,         // 写 PTY
    reader_task: JoinHandle<()>,            // 读 PTY 并 emit 事件
    child_killer: Box<dyn ChildKiller + Send + Sync>,
    command: String,
    description: Option<String>,
    working_directory: String,
    source: SessionSource,                  // Human | Agent
    status: SessionStatus,
    exit_code: Option<i32>,
    started_at: Instant,
    task_id: Option<String>,
    pid: Option<u32>,
}
```

### 2. 后端架构变更

**当前**：
- AI agent 调 `tool_shell` → `ShellRegistry::run_shell` → `tokio::process::Command::spawn` → 管道读 stdout/stderr
- Human 调 `pty_create` → `PtyRegistry::create` → `portable_pty::openpty` → spawn shell

**改为**：
- AI agent 的 `tool_shell` 改为创建 PTY，然后执行命令
  - 用 `portable_pty` 打开 PTY pair
  - 在 slave 端用 `CommandBuilder` 运行 `sh -c "命令"`
  - master 端读输出，写入 `stdout` 字段
  - `block_until_ms` 的逻辑仍在 Rust 侧 await，不阻塞 UI
- AI 不再需要单独的 `shell-output` / `shell-finished` 事件体系，改为统一走 `pty-output` / `pty-closed`
- 但为了向后兼容，可在事件中增加 `source` 字段，或前端通过其他方式区分

### 3. 核心挑战

1. **命令执行模式差异**：Human 终端是 `sh -i`（交互 shell），AI shell 是 `sh -c "command"`（单条命令）。PTY 两者都支持，只需在创建时决定命令
2. **AI 的 `block_until_ms` 等待机制**：需要保留，在 Rust 端 await PTY reader 直到命令完成/超时
3. **输出收集**：当前 `ShellRegistry` 主动收集 stdout/stderr 到内存中，PTY 模式下需要等价实现（从 PTY reader 线程收集）
4. **事件流**：当前前端 `shell-processes-context.tsx` 监听 `shell-output` / `shell-finished`，需要改为监听 `pty-output` / `pty-closed`（或新的事件）

### 4. 用过渡方案降低风险

**更安全的做法**——不在后端大重构，而是让 AI 的 `tool_shell` 内部也走 PTY，但仍然通过 `shell-output` / `shell-finished` 事件推送：

```
tool_shell → 内部创建 PTY → spawn 命令 → 读 PTY 输出 → 
  并存到内存 stdout/stderr + emit shell-output 事件
```

这样前端的 `ShellProcessesProvider` / `useShellProcesses` 不用改。但要改的是：
- `shell_registry.rs` 的 `spawn_background`：用 `portable_pty` 替代 `tokio::process::Command`
- 输出收集从管道读改为从 PTY master 读

这已经统一了底层（全部 PTY），前端后续可逐步统一 UI。

## 前端改动

### 5. 保留 ShellProcessesProvider 数据层

不改 `shell-processes-context.tsx`，AI 进程数据仍通过 `useShellProcesses()` 获取。但后续可以逐步将 AI 进程渲染从 `ProcessLogViewer` 改为 `InteractiveTerminal`（只读模式）。

### 6. Shell 数据模型增加 source 标记

`ShellInfo` / `ShellProcess` 增加 `source: "human" | "agent"` 字段，来源于后端。

### 7. 统一 BottomPanel UI

**`bottom-panel.tsx`**：去掉 `BottomPanelTab`，改为单个视图：
- 顶部工具栏：统一标题"终端" + 关闭按钮 + 运行中进程数 badge
- 会话标签栏：混合展示 human 终端和 AI 进程
  - Human 标签：`TerminalIcon` + 路径 + `[Human]` badge
  - Agent 标签：`CpuIcon` + 命令/描述 + 状态 badge + `[AI]` badge
- 内容区：
  - Human 选中 → `InteractiveTerminal`（完整交互，xterm.js）
  - Agent 选中 → `InteractiveTerminal`（**只读模式**，或保留 `ProcessLogViewer` 作为过渡）

### 8. 创建只读模式的 InteractiveTerminal

给 `InteractiveTerminal` 增加 `readOnly` prop：
- `readOnly=true` 时：不监听键盘输入，不调用 `pty_write`，不连接 PTY
- 内容从 `ShellProcess.stdout/stderr` 加载
- 甚至可以用 `ProcessLogViewer` 替代（比较简单）

### 9. 统一工具栏

- 删除 `AgentProcessesToolbarButton`
- `session-toolbar.tsx` 保留一个终端按钮，显示运行中进程的 badge

## 文件清单

### 后端（Rust）

| 文件 | 操作 | 说明 |
|---|---|---|
| `src-tauri/src/tools/pty_terminal.rs` | 重构 | 扩展到支持 AI 场景，添加 `source` 字段 |
| `src-tauri/src/tools/shell.rs` | 调整 | 减少直接 spawn 的逻辑，共享 PTY 类型 |
| `src-tauri/src/tools/shell_registry.rs` | 重写 | `spawn_background` 改用 PTY 而非 `Command::spawn` |
| `src-tauri/src/tools/mod.rs` | 调整 | 导出变更 |
| `src-tauri/src/lib.rs` | 调整 | 命令注册变更 |

### 前端

| 文件 | 操作 |
|---|---|
| `src/features/terminal/bottom-panel-context.tsx` | 简化：去掉 activeTab |
| `src/features/terminal/components/bottom-panel.tsx` | 重写：统一视图 |
| `src/features/terminal/components/terminal-tab.tsx` | 重写：混合 session 列表 |
| `src/features/terminal/components/processes-panel.tsx` | 移除（功能合并） |
| `src/features/terminal/components/interactive-terminal.tsx` | 可选：加 readOnly prop |
| `src/features/terminal/components/process-log-viewer.tsx` | 保留不变（过渡期可用） |
| `src/features/terminal/components/agent-processes-toolbar-button.tsx` | 移除 |
| `src/features/terminal/shell-processes-context.tsx` | 不动（数据层仍在） |
| `src/features/chat/components/session-toolbar.tsx` | 合并按钮 |
| `src/features/keyboard-shortcuts/keyboard-shortcuts.tsx` | `panel.bottomProcesses` 映射到统一面板 |
| `src/features/agent/tools/types.ts` | `ShellInfo` 加 `source` 字段 |

## 实施策略（分阶段）

### Phase 1：后端统一 PTY（ShellRegistry 改用 PTY）

AI 的 `tool_shell` 内部走 `portable_pty`，**事件和数据接口不变**（向前端屏蔽改动）。

### Phase 2：前端统一 UI

去掉 Tabs，混合展示 human + agent sessions，标记来源。

### Phase 3：清理旧代码

删除 `ProcessesPanel`、`AgentProcessesToolbarButton`，合并快捷键。

## 风险和验证

- **PTY 对非交互命令的影响**：`sh -c "echo hello"` 在 PTY 中运行行为基本一致，但输出可能包含额外的转义序列
- **AI 的 block/wait 机制**：PTY 下需要等命令退出后才能拿到最终输出，和当前管道模式一致
- **Windows 兼容**：`portable_pty` 跨平台，但需要注意 Windows 下的差异
- **性能**：PTY 比管道开销略大，但对 AI agent 的 shell 调用频率来说可以忽略
- **增量部署**：Phase 1 可独立上线验证，不影响现有 UI
