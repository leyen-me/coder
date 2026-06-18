# 工作区文件监听 —— 右侧面板自动刷新

## 目标

在 Rust 端实现一个文件监听器，监视工作目录的文件变化，自动刷新右侧面板的文件资源管理器（文件树）和源代码管理（Git）面板，让用户无需手动点击刷新按钮。

## 架构

```
Rust (notify crate)
  ├── 监听工作目录（遵循 .gitignore 规则）
  ├── 500ms 防抖合并事件
  ├── 向前端发射 Tauri 事件：
  │   ├── "workspace:files-changed"  → 触发文件树刷新
  │   └── "workspace:git-changed"    → 触发 Git 面板刷新
  └── 生命周期绑定到 app setup/exit

前端 (React)
  ├── useFileWatcher hook：
  │   ├── 通过 @tauri-apps/api/event 监听 Tauri 事件
  │   ├── 收到"workspace:files-changed" → 调用 tree.refresh()
  │   └── 收到"workspace:git-changed"   → 触发 GitProvider.refresh()
  └── 挂载到 RightPanelSlot 或 AppShell
```

## 步骤

### 1. 在 Cargo.toml 中添加 `notify` 依赖

- 在 `src-tauri/Cargo.toml` 中添加 `notify = { version = "7", features = ["macos_fsevent"] }`
- `macos_fsevent` 特性提供 macOS 原生文件系统事件支持，性能最优

### 2. 新建 `src-tauri/src/file_watcher.rs`

新模块，管理文件监听器的完整生命周期：

- `struct WorkspaceWatcher { ... }` — 持有 `notify::RecommendedWatcher`、防抖定时器、以及 `Arc<AppHandle>`（用于发射事件）
- `fn start(app_handle: &AppHandle, workspace_dir: &Path)` — 开始监听工作目录
  - 使用 `notify::RecursiveMode::Recursive` 递归监听
  - 利用已有的 `ignore` crate 过滤 `.gitignore` 匹配的路径
  - 每批事件到达后：500ms 防抖，然后分类处理
- 事件分类逻辑：
  - 如果有路径在 `.git/` 目录下发生变化（如 checkout、commit、stash）→ 发射 `"workspace:git-changed"`
  - 如果有路径不在 `.git/` 下且未被 gitignore 排除 → 发射 `"workspace:files-changed"`
- `fn stop()` — 销毁 watcher，清理资源

### 3. 在 `src-tauri/src/lib.rs` 中集成文件监听器

- 添加 `mod file_watcher;`
- 添加托管状态：`FileWatcherState(Arc<Mutex<Option<WorkspaceWatcher>>>)`
- 在 `.setup()` 中：`configure_main_window(app)` 之后，从 shell 环境获取工作目录，调用 `file_watcher::start()`
- 在 `RunEvent::Exit` 时：调用 `file_watcher::stop()`
- 新增 Tauri 命令 `set_workspace_dir(new_dir: String)`，允许前端在工作目录切换时通知 Rust 端重启监听器

### 4. 前端：Tauri 事件监听 Hook

新建 `src/features/right-panel/hooks/use-file-watcher.ts`：

```typescript
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

type UseFileWatcherOptions = {
  workspaceDir: string | null;
  onFilesChanged: () => void;
  onGitChanged: () => void;
};

export function useFileWatcher({
  workspaceDir,
  onFilesChanged,
  onGitChanged,
}: UseFileWatcherOptions) {
  const cleanupRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!workspaceDir) return;

    const unlistenFiles = listen("workspace:files-changed", () => {
      onFilesChanged();
    });
    const unlistenGit = listen("workspace:git-changed", () => {
      onGitChanged();
    });

    cleanupRef.current = [unlistenFiles, unlistenGit];

    return () => {
      for (const cleanup of cleanupRef.current) {
        cleanup();
      }
    };
  }, [workspaceDir, onFilesChanged, onGitChanged]);
}
```

### 5. 在文件树面板中集成 Hook

修改 `src/features/right-panel/components/file-tree-panel.tsx`：

- 导入 `useFileWatcher`
- 在 return 之前接入 hook：
  ```typescript
  useFileWatcher({
    workspaceDir,
    onFilesChanged: useCallback(() => {
      fileTreeRef.current?.refreshAll();
    }, []),
    onGitChanged: useCallback(() => {
      // 通过 RightPanelContext 的 gitRefreshTick 机制触发 GitProvider 刷新
    }, [workspaceDir]),
  });
  ```

### 6. Git 刷新机制

`GitProvider` 内部的 `refresh` 方法无法直接从外部调用。推荐方案：

**方案 A（推荐）：通过 RightPanelContext 传递 tick**

在 `right-panel-context.tsx` 中：
```typescript
const [gitRefreshTick, setGitRefreshTick] = useState(0);
```
暴露 `gitRefreshTick`。在 `useFileWatcher` 的 `onGitChanged` 回调中调用 `setGitRefreshTick((c) => c + 1)`。

在 `GitProvider` 中添加：
```typescript
const { gitRefreshTick } = useRightPanel();
useEffect(() => {
  if (gitRefreshTick > 0 && workspaceDir) {
    void refresh();
  }
}, [gitRefreshTick]);
```

### 7. 工作目录切换时通知 Rust 端

在 `use-route-workspace-dir.ts` 或等效的路径中，当工作目录变化时调用：
```typescript
invoke("set_workspace_dir", { newDir: workspaceDir });
```
Rust 端的 `set_workspace_dir` 命令会丢弃旧的 watcher 并启动新的。

### 8. 多会话生命周期管理

- 当用户切换工作目录时，需要停止旧监听器，启动新监听器
- `set_workspace_dir` 命令负责处理这一逻辑
- 应用退出时，`RunEvent::Exit` 回调确保所有监听器被释放

## 涉及的文件

| 文件 | 变更 |
|------|------|
| `src-tauri/Cargo.toml` | 添加 `notify` 依赖 |
| `src-tauri/src/file_watcher.rs` | **新建** — 文件监听模块 |
| `src-tauri/src/lib.rs` | 添加 `mod file_watcher`、托管状态、setup/exit 钩子、`set_workspace_dir` 命令 |
| `src/features/right-panel/hooks/use-file-watcher.ts` | **新建** — Tauri 事件监听 hook |
| `src/features/right-panel/components/file-tree-panel.tsx` | 集成 `useFileWatcher`，连接刷新回调 |
| `src/features/right-panel/right-panel-context.tsx` | 添加 `gitRefreshTick` 状态并暴露 |
| `src/features/git/git-provider.tsx` | 添加 `useEffect` 响应 `gitRefreshTick` |
| `src/features/terminal/use-route-workspace-dir.ts` | 在目录切换时调用 `invoke("set_workspace_dir")` |

## 风险与验证

1. **性能**：`notify` + `macos_fsevent` 效率高，但对极大仓库（如 monorepo + 大量 node_modules）需注意。缓解措施：利用 `ignore` crate 的 `WalkBuilder::filter_entry` 排除 gitignore 路径。
2. **竞态条件**：如果文件树正在加载时又有新事件到来，短暂显示旧数据是可接受的——下次事件会修复。
3. **防抖正确性**：标准 `notify` 防抖模式——将事件收集到 `Vec<DebouncedEvent>`，500ms 无新事件后统一处理。
4. **目录切换**：确保旧 watcher 完全释放后再启动新的，避免重复事件。
5. **验证方式**：观察控制台日志确认事件被正确发射；验证文件树和 Git 面板无需手动刷新即可更新。
