# Git 模块（Source Control）设计方案

## 目标

在右侧面板中实现类似 VS Code 的 Source Control 功能，包含文件变更查看、暂存/取消暂存、提交、分支管理、提交历史、远程操作、Stash 管理等。

## 定位

- **位置**：右侧面板标签页（与文件树 Explorer、Plan Preview 并列）
- **第一期范围**：文件变更列表、暂存/取消暂存、提交、分支管理、提交历史、Push/Pull/Fetch、Stash

---

## 整体架构

```
用户操作 → React UI 组件
              ↓
           git-service.ts (invoke Tauri命令)
              ↓
       Tauri IPC Bridge
              ↓
       Rust git.rs (git CLI)
              ↓
          系统 git 命令
```

---

## 步骤

### Step 1: 扩展 Rust 后端 `git.rs`

添加以下 Tauri command：

| Command | 功能 |
|---|---|
| `git_status` | 获取工作区文件状态 (modified/staged/untracked/conflicted) |
| `git_stage_files` | 暂存指定文件 |
| `git_unstage_files` | 取消暂存指定文件 |
| `git_commit` | 创建提交 |
| `git_log` | 获取提交历史 |
| `git_diff` | 获取文件 diff 内容 |
| `git_diff_staged` | 获取已暂存文件的 diff |
| `git_create_branch` | 创建分支 |
| `git_delete_branch` | 删除分支 |
| `git_push` | Push |
| `git_pull` | Pull |
| `git_fetch` | Fetch |
| `git_stash_list` | 列出 stash |
| `git_stash_push` | 创建 stash |
| `git_stash_pop` | 恢复 stash |
| `git_stash_drop` | 删除 stash |
| `git_get_remote_url` | 获取远程仓库 URL |

**数据结构**（Rust）：

```rust
#[derive(Debug, Serialize)]
struct GitStatusEntry {
    path: String,
    staged: bool,
    status: GitFileStatus, // Modified, Added, Deleted, Renamed, Untracked, Conflicted
    original_path: Option<String>, // for renamed
}

#[derive(Debug, Serialize)]
struct GitCommitEntry {
    hash: String,
    author_name: String,
    author_email: String,
    message: String,
    timestamp: i64,
}

struct GitDiffResponse {
    diff: String,
}
```

### Step 2: 更新 Rust 工具注册

- `src-tauri/src/tools/mod.rs` — 导出新的 git 函数
- `src-tauri/src/lib.rs` — 在 `generate_handler!` 中注册新命令

### Step 3: 扩展前端服务层

**`src/features/workspace/git.ts`** → 扩展为完整 `git-service.ts`：

```typescript
// Git 数据类型
export type GitFileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";

export type GitStatusEntry = {
  path: string;
  staged: boolean;
  status: GitFileStatus;
  originalPath?: string;
};

export type GitCommitEntry = {
  hash: string;
  authorName: string;
  authorEmail: string;
  message: string;
  timestamp: number;
};

export type GitStashEntry = {
  index: number;
  message: string;
  hash: string;
};

// Git 服务函数
export async function fetchGitStatus(workspaceDir: string): Promise<GitStatusEntry[]>
export async function stageFiles(workspaceDir: string, paths: string[]): Promise<void>
export async function unstageFiles(workspaceDir: string, paths: string[]): Promise<void>
export async function commit(workspaceDir: string, message: string): Promise<void>
export async function fetchGitLog(workspaceDir: string, maxCount?: number): Promise<GitCommitEntry[]>
export async function getFileDiff(workspaceDir: string, filePath: string, staged?: boolean): Promise<string>
export async function createBranch(workspaceDir: string, name: string): Promise<void>
export async function deleteBranch(workspaceDir: string, name: string): Promise<void>
// ... 远程, stash 等
```

### Step 4: 创建 Git 功能模块 `src/features/git/`

```
src/features/git/
├── components/
│   ├── source-control-panel.tsx     # 主面板 — 标签页容器
│   ├── changes-view.tsx             # 文件变更列表
│   ├── change-file-item.tsx         # 单个变更文件行
│   ├── commit-box.tsx               # 提交消息输入 + Commit 按钮
│   ├── branch-selector.tsx          # 分支选择器
│   ├── history-view.tsx             # 提交历史列表
│   ├── history-entry.tsx            # 单条提交记录
│   ├── stash-view.tsx               # Stash 管理
│   ├── diff-viewer.tsx              # Diff 对比视图
│   ├── remote-actions.tsx           # Push/Pull/Fetch 按钮组
│   └── empty-state.tsx              # 无仓库时的提示
├── git-provider.tsx                  # Context provider 管理 git 状态
├── git-service.ts                    # Tauri invoke 封装 (或移到 workspace)
└── types.ts                          # 类型定义
```

**组件层级**：

```
SourceControlPanel (主面板)
├── 顶部工具栏
│   ├── BranchSelector (分支切换 / 创建)
│   ├── RemoteActions (Push / Pull / Fetch)
│   └── 标签切换: "变更" | "历史" | "Stash"
├── 内容区 (根据标签切换)
│   ├── ChangesView (变更列表)
│   │   ├── "暂存的变更" 分组
│   │   │   └── ChangeFileItem[] (带复选框, 点击查看 diff)
│   │   ├── "变更" 分组
│   │   │   └── ChangeFileItem[]
│   │   └── CommitBox (底部固定)
│   │       ├── 消息输入框 (多行)
│   │       └── Commit 按钮
│   ├── HistoryView (提交历史)
│   │   └── HistoryEntry[]
│   └── StashView (Stash 列表)
│       └── stash 条目 + Pop/Drop 操作
└── DiffViewer (侧边滑动或内联展开)
```

### Step 5: 修改右侧面板支持 Source Control 标签

**`src/features/right-panel/right-panel-context.tsx`**：

扩展 `RightPanelContextValue`，新增：
```typescript
isSourceControlTabActive: boolean;
openSourceControlTab: () => void;
deactivateSourceControlTab: () => void;
```

**`src/features/right-panel/components/file-tree-panel.tsx`**（或重构成右面板容器）：

在顶部标签栏增加 Source Control 按钮（Git 图标），切换逻辑类似现有的 Plan 标签。
当 Source Control 标签激活时，渲染 `SourceControlPanel` 组件。

### Step 6: 国际化

在 `message-schema.ts` 新增 `git` 命名空间字段：

```typescript
git: {
  sourceControl: string;
  changes: string;
  stagedChanges: string;
  commitMessagePlaceholder: string;
  commit: string;
  brances: string;
  noChanges: string;
  history: string;
  stash: string;
  push: string;
  pull: string;
  fetch: string;
  // ...
}
```

同步更新 `en.ts` 和 `zh.ts`。

### Step 7: Git Provider 状态管理

`GitProvider` Context 管理：
- `status: GitStatusEntry[]` — 当前文件变更状态
- `currentBranch: string | null` — 当前分支
- `branches: string[]` — 所有分支列表
- `recentCommits: GitCommitEntry[]` — 最近提交
- `stashList: GitStashEntry[]` — Stash 列表
- `isLoading: boolean` — 加载状态
- `refresh()` — 刷新所有数据

监听 `workspaceDir` 变化自动刷新。

---

## 涉及的文件

### Rust 后端
1. `src-tauri/src/tools/git.rs` — 扩展（主要改动）
2. `src-tauri/src/tools/mod.rs` — 注册新导出
3. `src-tauri/src/lib.rs` — 注册新 Tauri commands

### 前端新文件
4. `src/features/git/types.ts` — 类型定义
5. `src/features/git/git-service.ts` — Git 服务封装
6. `src/features/git/git-provider.tsx` — Git 状态管理 Context
7. `src/features/git/components/source-control-panel.tsx` — 主面板
8. `src/features/git/components/changes-view.tsx` — 变更列表
9. `src/features/git/components/change-file-item.tsx` — 变更文件行
10. `src/features/git/components/commit-box.tsx` — 提交框
11. `src/features/git/components/branch-selector.tsx` — 分支选择器
12. `src/features/git/components/history-view.tsx` — 历史视图
13. `src/features/git/components/stash-view.tsx` — Stash 视图
14. `src/features/git/components/diff-viewer.tsx` — Diff 查看器
15. `src/features/git/components/remote-actions.tsx` — 远程操作按钮
16. `src/features/git/components/empty-state.tsx` — 空状态

### 前端修改
17. `src/features/right-panel/right-panel-context.tsx` — 增加 source control tab 状态
18. `src/features/right-panel/components/file-tree-panel.tsx` — 增加 source control 标签切换
19. `src/lib/i18n/message-schema.ts` — 增加 git 国际化类型
20. `src/lib/i18n/messages/en.ts` — 英文翻译
21. `src/lib/i18n/messages/zh.ts` — 中文翻译

---

## 风险 / 验证

1. **git CLI 依赖**：使用 git CLI 而非 libgit2，确保用户系统已安装 git。在空仓库或非 git 目录友好提示。
2. **大仓库性能**：git status 在大仓库可能较慢，考虑使用 `--porcelain` 格式解析并在 worker 中处理，或缓存结果。
3. **竞态条件**：用户可能同时通过外部终端和本模块操作 git，每次操作后刷新状态。
4. **diff 大文件**：大文件 diff 可能阻塞 UI，考虑分段加载或限制 diff 行数。
5. **多仓库场景**：当前只支持一个 workspace，workspace 切换时 git 状态自动刷新。
6. **验证方式**：在真实 git 仓库中测试所有操作，包括：文件修改/新增/删除、暂存/取消暂存、提交、分支切换/创建/删除、push/pull/fetch、stash 等完整工作流。
