# New Window (新建窗口) 功能

## Goal

为 Coder 添加类似 VS Code `File → New Window` 的能力——从当前应用打开一个全新的独立桌面窗口，新建聊天界面，用户自行选择工作区。

## Architecture

基于 Tauri v2 的 `WebviewWindow` API，在运行时创建一个新的 OS 窗口，加载同一前端应用。

- 数据库 (IndexedDB) 跨窗口共享 → 所有窗口看到同一份聊天历史
- localStorage 每个 webview 独立 → 各窗口可以有不同工作区
- Rust 后端状态 (AgentRegistry, ShellRegistry) 全局共享但按 ID 隔离 → 无需额外改造

## Steps

### Step 1: 添加 Tauri 窗口创建权限

**文件**: `src-tauri/capabilities/default.json`

在 `permissions` 数组中添加：
- `core:window:allow-create`
- `core:window:allow-set-focus`
- `core:window:allow-center`

### Step 2: 添加 Rust 命令 `create_new_window`

**文件**: `src-tauri/src/lib.rs`

添加一个 Tauri command，接收可选的 `label` 参数，创建一个新的 WebviewWindow：

```rust
#[tauri::command]
fn create_new_window(app: tauri::AppHandle) -> Result<(), String> {
    let label = format!("window-{}", uuid::Uuid::new_v4());
    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("".into()),
    )
    .title("coder")
    .inner_size(1600.0, 900.0)
    .min_inner_size(1200.0, 750.0)
    .decorations(false)
    .transparent(true)
    .shadow(true);

    builder.build().map_err(|e| e.to_string())?;
    let _ = window_chrome::apply_on_created(&app, &label);
    Ok(())
}
```

注册到 `invoke_handler`。

> **注意**: `window_chrome.rs` 中的 `apply` 当前只在 `setup` 时对 main window 调用。需要重构为可复用的函数，或让新窗口在创建后也调用它。

### Step 3: 调整 `window_chrome.rs` 支持新窗口

**文件**: `src-tauri/src/window_chrome.rs`

将 `apply` 改为可对任意 `WebviewWindow` 调用的公共函数，并暴露一个 `apply_new_window` 辅助函数给 `lib.rs`。

### Step 4: 前端入口按钮

**文件**:
- `src/components/layout/floating-shell-nav.tsx` — 添加"新建窗口"按钮
- 或者 `src/features/chat/components/session-toolbar.tsx` — 在标题栏的 trailing 区域添加

添加一个调用 Tauri command 的按钮：

```tsx
import { invoke } from "@tauri-apps/api/core";

const handleNewWindow = () => {
  invoke("create_new_window");
};
```

图标建议使用 `ExternalLink` 或 `SquareArrowOutUpRight` (lucide-react)。

### Step 5: 国际化消息

**文件**:
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/zh.ts`

添加:
```ts
titleBar: {
  // ... existing
  newWindow: "New Window",
}
```

### Step 6: 键盘快捷键 (可选)

**文件**: 适当的热键配置位置

添加可选快捷键，如 `Ctrl+Shift+N` (Windows) / `Cmd+Shift+N` (macOS) 打开新窗口。

## Files to touch

| File | Change |
|---|---|
| `src-tauri/capabilities/default.json` | 添加 window create/focus/center 权限 |
| `src-tauri/src/lib.rs` | 添加 `create_new_window` command |
| `src-tauri/src/window_chrome.rs` | 重构为可复用，支持新窗口 |
| `src-tauri/tauri.conf.json` | 可能需要调整（确认新窗口默认配置） |
| `src/components/layout/floating-shell-nav.tsx` | 添加"新建窗口"按钮 |
| `src/lib/i18n/messages/en.ts` | 添加 i18n key |
| `src/lib/i18n/messages/zh.ts` | 添加 i18n key |

## Risks & Verification

### Risks
1. **窗口标签唯一性**: 每个新窗口需要唯一 label。使用 UUID 解决。
2. **窗口装饰**: 新窗口需要与主窗口一致的 frameless + rounded corners 外观。通过复用 `window_chrome::apply` 解决。
3. **Linux/macOS**: 当前 `window_chrome.rs` 只在 Windows 上有实际操作。需要确认其他平台的兼容性。
4. **Tauri 事件多窗口路由**: Agent 事件通过 Tauri Channel 发送，Channel 是与具体窗口绑定的，所以自动隔离 ✅。
5. **Shell/PTY**: 共享进程列表，但通过 task_id/窗口标签过滤即可。

### Verification
1. 点击"新建窗口"按钮 → 新 OS 窗口弹出 ✅
2. 新窗口显示空白聊天界面，与主窗口布局一致 ✅
3. 新窗口选择不同工作区，不影响主窗口 ✅
4. 两个窗口可同时各自运行 Agent，互不干扰 ✅
5. 关闭新窗口不影响主窗口 ✅
