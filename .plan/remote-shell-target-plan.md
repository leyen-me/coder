# 远程 Shell Target 支持

## Goal

让 Agent 能通过 SSH 在远程机器上执行 shell 命令。核心思路是**给现有的 `shell` 工具加一个可选的 `target` 参数**——不传就走本地，传了就走 SSH。远程和本地共享同一套 `shell_id` / `await` / `list_shells` / `read_shell_logs` 生命周期管理，对 Agent 完全透明。

## 设计要点

### 核心思路：复用现有 shell 生命周期

```
shell({ command: "ls -la", target: "dev-server" })
```
1. `shell.ts` handler 透传 `target` 到 Rust
2. `shell_registry.rs` 判断：有 `target` → 走 SSH channel，没有 → 走本地 `Command::spawn`
3. SSH 走**一个 session 一个 target，每个命令开独立 channel**（SSH 协议支持多路复用）
4. 返回的 `ShellOutput` 共享同一套数据结构，Agent 无感

### SSH 多路复用模型

```
RemoteConnectionPool
│
├── "dev-server" → SshSession (tcp:192.168.1.100:22)
│   ├── [closed] channel: cat package.json
│   ├── [active] channel: npm run build    ← 后台运行
│   └── [active] channel: ls -la src/      ← 刚打开
│
├── "staging" → SshSession (tcp:staging.example.com:22)
│   └── [active] channel: git pull
│
└── 空闲 > 5 分钟 → session drop，自动清理
```

- **TCP 握手 + 认证** = 昂贵（几百毫秒），只做一次
- **Channel 创建** = 极便宜（内存结构，无网络往返），每个命令开一个
- **Agent 单线程**：一次只处理一个 tool call，不需要同 target 多 session
- **Keepalive**：TCP keepalive（30s）+ SSH 协议层 keepalive（15s），检测死连接

### 空闲回收

后台每 60 秒扫描，5 分钟未使用的 session 自动关闭。

### 自动重连

`exec` 时检测 session 状态，断开则自动重建后重试（最多一次），对 agent 透明。

### 配置存储

存储在 IndexedDB 中，沿用 Coder 现有的数据库存储方案。

类型定义：

```ts
// src/lib/db/types.ts
export type RemoteTargetConfig = {
  alias: string;
  host: string;
  port: number;
  user: string;
  auth: RemoteTargetAuth;
};

export type RemoteTargetAuth =
  | { type: "key"; keyPath: string }       // 密钥文件路径
  | { type: "keyContent"; content: string } // 直接粘贴私钥内容
  | { type: "password"; password: string }  // 密码认证
  | { type: "agent" };                      // 走系统 ssh-agent
```

认证方式四种：ssh-agent / 密钥文件路径 / 直接粘贴私钥内容 / 密码。所有数据都存在 IndexedDB 中，个人电脑本地运行，安全模型等同其他本地凭据存储。

### 设置页 UI

在设置页新增 **"远程连接"** 面板，提供 CRUD：
- 添加远程机器（别名、主机、端口、用户、认证方式）
- 编辑已有配置
- 删除（带确认）
- 测试连接按钮——调用后端 `test_remote_connection` 验证 SSH 可达性

### Agent 如何知道远程机器？

在 `AgentEnvironment` 中加入 `remoteTargets` 列表，build-system-prompt 时自动注入：

```
你有以下远程机器可用：
  - "dev-server" (ubuntu@192.168.1.100)
  - "staging" (deploy@staging.example.com)

使用 shell(target: "dev-server") 在远程机器上执行命令。
```

## Steps

### Step 1: 前端 — DB Schema + Store

**文件：`src/lib/db/types.ts`**
- 新增 `RemoteTargetConfig` 和 `RemoteTargetAuth` 类型定义

**文件：`src/lib/db/remote-targets.ts`**（新建）
- CRUD 操作：`listRemoteTargets`, `getRemoteTarget`, `saveRemoteTarget`, `deleteRemoteTarget`
- 数据存在 IndexedDB 的 `remote_targets` store 中
- 遵循现有 db 层风格（参考 `src/lib/db/skills.ts` 或 `src/lib/db/automations.ts`）

**文件：`src/lib/db/index.ts`**
- 导出新的 db 方法

### Step 2: 前端 — 设置页面 UI

**文件：`src/features/settings/components/remote-targets-settings-panel.tsx`**（新建）
- 远程连接管理面板组件
- 表格/列表展示所有已配置的远程机器
- 添加/编辑对话框：别名、主机、端口、用户名、认证方式（ssh-agent / 密钥文件路径 / 粘贴私钥 / 密码）
  - 选密码或粘贴私钥时显示对应输入框
  - 密码和私钥内容以明文存 IndexedDB（本地桌面应用，安全模型等同系统凭据管理）
- 删除操作（带确认）
- "测试连接"按钮——调用 Tauri command `test_remote_connection` 验证 SSH 可达性
- 遵循现有 settings 面板风格（参考 `src/features/settings/components/web-tools-settings-panel.tsx`）

**文件：`src/features/settings/pages/settings-page.tsx`**
- 注册新的 `remote-targets` 设置面板到侧边栏路由

**文件：`src/features/settings/constants.ts`**
- 新增面板的 t 函数/常量定义

### Step 3: Rust — `remote_connection.rs`（新建）

**文件：`src-tauri/src/tools/remote_connection.rs`**

内容：
- `RemoteTargetConfig` — 从前端通过 Tauri command 传入的配置（alias, host, port, user, auth），与前端类型对应
- `SshSession` — 封装 `ssh2::Session` + channel mutex + last_used 时间戳
- `RemoteConnectionPool` — `Mutex<HashMap<String, Arc<SshSession>>>` 作为 Tauri State
  - `get_or_connect(alias, config)` — 复用或新建 SSH session，config 为当前最新配置
  - `exec(alias, config, command, cwd)` — 开 channel → exec → 读 stdout/stderr → 返回 (stdout, stderr, exit_code)
  - `exec_background(...)` — 异步 spawn 读取线程，返回 shell_id
  - `configure_keepalive(session)`
  - 后台空闲回收任务
- 自动重连逻辑（检测 session 存活 + 一次重试）
- host key 处理策略（`StrictHostKeyChecking=accept-new`）
- `test_remote_connection(config)` — Tauri command，供前端"测试连接"按钮调用

涉及 crate：在 `Cargo.toml` 新增 `ssh2 = "0.9"`

### Step 4: Rust — 修改 `shell_registry.rs`

**文件：`src-tauri/src/tools/shell_registry.rs`**

修改点：
- `run_shell()` 新增可选参数 `target: Option<String>`
  - `target = None` → 走现有逻辑（本地 `Command::spawn`）
  - `target = Some(alias)` → 从 `RemoteConnectionPool` 获取 session，执行远程命令
- `RunningShell` 增加 `target: Option<String>` 字段，用于日志/diagnostics
- 远程后台命令的生命周期管理（和本地一致）：
  - SSH 命令是同步 channel exec，在 tokio::spawn 中异步等待
  - stdout/stderr 通过 Tauri event 推送到前端（与本地一致）
  - kill 逻辑：drop channel / drop session（视情况）

### Step 5: Rust — 注册 Tauri command 和 State

**文件：`src-tauri/src/tools/mod.rs`**
- 新增 `pub use remote_connection::...` 导出
- 新增 `mod remote_connection;`

**文件：`src-tauri/src/lib.rs`**
- `.manage(RemoteConnectionPool::new())`
- `.invoke_handler` 注册 `test_remote_connection` 新 command
- `tool_shell` command 函数签名扩充：读取 `state: tauri::State<'_, RemoteConnectionPool>`，并透传 target

### Step 6: 前端 — `shell` tool 定义增加 `target` 参数

**文件：`src/features/agent/tools/definitions.ts`**
- `SHELL_TOOL` 定义中增加可选参数：
  ```ts
  target: {
    type: "string",
    description: "Target remote machine alias. Omit to run locally on the user's machine.",
  }
  ```

**文件：`src/features/agent/tools/shell.ts`**
- `ShellArgs` 类型增加 `target?: string`
- `parseShellArgs` 增加 target 解析
- `invoke("tool_shell", ...)` 调用时多传 `target`

### Step 7: 环境注入 — AgentEnvironment

**文件：`src/features/agent/environment/resolve-environment.ts`**
- 新增读取远程配置的逻辑，将 remote targets 注入 `AgentEnvironment`

**文件：`src/features/agent/environment/types.ts`**
- `AgentEnvironment` 增加 `remoteTargets` 字段

**文件：`src/features/agent/environment/build-system-prompt.ts`**
- 在 system prompt 中注入可用远程机器列表

## Files to touch

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | 新增依赖 `ssh2 = "0.9"` |
| `src-tauri/src/tools/remote_connection.rs` | **新建** — SSH 连接池, exec, test_connection |
| `src-tauri/src/tools/shell_registry.rs` | 修改 — `run_shell` 增加 `target` 分支 |
| `src-tauri/src/tools/shell.rs` | 修改 — `ShellOutput`/`ShellInfo` 增加 `target` 字段 |
| `src-tauri/src/tools/mod.rs` | 修改 — 注册新模块 |
| `src-tauri/src/lib.rs` | 修改 — 注册 RemoteConnectionPool State |
| `src/lib/db/types.ts` | 修改 — 新增远程配置类型 |
| `src/lib/db/remote-targets.ts` | **新建** — IndexedDB CRUD |
| `src/lib/db/index.ts` | 修改 — 导出新方法 |
| `src/features/settings/components/remote-targets-settings-panel.tsx` | **新建** — 设置页面板 |
| `src/features/settings/pages/settings-page.tsx` | 修改 — 注册面板路由 |
| `src/features/settings/constants.ts` | 修改 — 面板常量 |
| `src/features/agent/tools/definitions.ts` | 修改 — `SHELL_TOOL` 增加 `target` 参数 |
| `src/features/agent/tools/shell.ts` | 修改 — `ShellArgs` 和 `parseShellArgs` 支持 target |
| `src/features/agent/environment/types.ts` | 修改 — `AgentEnvironment` 增加 `remoteTargets` |
| `src/features/agent/environment/resolve-environment.ts` | 修改 — 加载远程配置 |
| `src/features/agent/environment/build-system-prompt.ts` | 修改 — 注入远程机器列表 |

## Risks / Verification

### 安全风险
- **凭据存储**：私钥内容和密码以明文存 IndexedDB。Coder 是本地桌面应用，安全模型等同 macOS Keychain / 系统凭据管理。后续可按需加加密存储。
- **Host key 验证**：采用 `StrictHostKeyChecking=accept-new` 策略，首次连接自动信任。

### 边界情况
- **网络断开**：session 检测到断开后自动重连（最多一次重试），重连失败返回 tool failure。Agent 可自行重试。
- **后台命令 + 网络断**：若 session 断开，后台 channel 会丢失。这是 SSH 协议限制，记录到日志。
- **多 target 并发**：当前 agent 单线程，天然无竞态。同一 target 的多 channel 通过 `channel_mutex` 保护（`ssh2` 的 channel 操作要求互斥）。
- **超时**：复用现有 `block_until_ms` 和 `POST_KILL_WAIT_MS` 机制。

### 验证
1. 单元测试：`RemoteConnectionPool::exec` 的 mock 测试（mock ssh2 session）
2. 集成测试：本地起一个 Docker 容器作为 SSH server，通过 `ssh localhost -p 2222` 执行命令
3. Agent 端到端：创建会话 → 注入 remote target → agent 自动使用 `shell(target: "test-container")` 执行命令
4. 回归测试：现有本地 shell 功能不因改动受影响
