# 工具结果 Diff 展示方案

## 目标

给 `write_file`、`replace_file`、`edit_file` 这三个文件修改工具加上可视化的 diff 展示，让用户一眼看到改了什么，而不是像现在这样只展示一堆 JSON 元数据。

## 背景

目前的交互：点击工具调用后，右侧滑出 Sheet 面板，里面展示 `ToolInput`（JSON 参数）和 `ToolOutput`（JSON 结果）。对于文件修改工具，结果是这样的：

```json
{
  "path": "src/file.ts",
  "action": "modified",
  "sha256": "abc...",
  "linesAdded": 5,
  "linesRemoved": 2
}
```

这告诉你"改动了"，但完全看不到"改了什么"。实际上 Rust 后端在手写文件时，手里同时握着旧内容（`loaded.text`）和新内容。我们只需要把这些内容传回前端，用 Monaco 的 `DiffEditor` 渲染出来就行了。

Monaco Editor 已经是项目依赖（`@monaco-editor/react`），它自带了 `<DiffEditor>` 组件，直接可用。

## 步骤

### 1. Rust 后端增加 `old_content` 字段

**涉及文件：**
- `src-tauri/src/tools/file_modify.rs` — `FileModifyResult` 结构体
- `src-tauri/src/tools/write_file.rs` — `WriteFileResult` 结构体

**改动：**

- 给 `FileModifyResult` 和 `WriteFileResult` 加上 `old_content: Option<String>`（序列化后为 `oldContent`）
- 在 `commit_text_modification()` 里把 `loaded.text` 作为 `old_content` 传出去——这样 `replace_file` 和 `edit_file` 都能拿到旧内容
- 在 `tool_write_file()` 里设置 `old_content: None`（新建文件没有旧内容）
- 只传 `old_content` 就够了，新内容可以从工具的 `input` 参数里拿到（`write_file` / `replace_file` 有 `content`，`edit_file` 有新旧的对比关系），这样省带宽

> **备选方案排除：** 让后端算好 unified diff 字符串再传。不选的原因有二：(1) 前端已经有 Monaco 了，渲染交给它更专业；(2) 传原始内容，前端可以灵活选择展示方式（内联 diff、左右对比等）。

### 2. 更新前端类型定义

**文件：** `src/features/agent/tools/types.ts`

- `WriteFileData` 加 `oldContent?: string`
- `FileModifyData` 加 `oldContent?: string`

### 3. 新建 `file-diff-display.ts` 工具函数

**文件：** `src/features/agent/tools/file-diff-display.ts`

参考 `browse-page-display.ts` / `shell-display.ts` 的模式：

- `getFileDiffChipLabel(toolName, input, output) → string | null` — 返回标签文本，例如 `"edit_file: src/app.tsx"` 或 `"write_file: src/new.ts"`
- `extractFileDiffData(output) → { path, action, oldContent, linesAdded, linesRemoved } | null` — 从结果信封中提取 diff 所需数据

### 4. 新建 `FileDiffToolOutput` 组件

**文件：** `src/features/chat/components/file-diff-tool-output.tsx`

使用 Monaco 的 `<DiffEditor>` 渲染 diff：

```tsx
import { DiffEditor } from "@monaco-editor/react";
```

- Props: `output: unknown`, `input: unknown`, `className?: string`
- **write_file**：`original = ""`，`modified = 从 input 拿 content` → 全绿，表示新增
- **edit_file**：`original = oldContent`，`modified = 对 oldContent 做 old_string → new_string 替换`（前端简单实现，处理单次替换和 replace_all）
- **replace_file**：`original = oldContent`，`modified = 从 input 拿 content`
- 降级处理：如果 `oldContent` 缺失（如旧记录），只展示修改后的内容
- Monaco DiffEditor 配置：简洁 UI、左右对比布局、无缩略图、语言自动识别（复用 `guessLanguageFromPath`）

### 5. 接入 `ToolInvocationChip`

**文件：** `src/features/chat/components/tool-invocation-chip.tsx`

- 从 definitions 导入 `WRITE_FILE_TOOL_NAME`、`REPLACE_FILE_TOOL_NAME`、`EDIT_FILE_TOOL_NAME`
- 导入 `FileDiffToolOutput`
- 增加 `isFileDiffTool` 判断
- 在 Sheet 的内容区，`ToolInput` 和 `ToolOutput` 之间，渲染 `<FileDiffToolOutput output={invocation.output} input={invocation.input} />`
- 芯片标签改用 `getFileDiffChipLabel`，让用户从标签上就能看到文件名（比如 `edit_file: src/foo.ts` 而不是光秃秃的 `edit_file`）

### 6. 打磨细节

- 边界情况处理：二进制文件、超限文件（后端已在写入前拦截，前端做容错展示即可）
- 错误状态：如果结果是错误，自动降级到现有错误展示
- 主题适配：确保暗色/亮色与 Monaco 当前主题一致（复用 `MonacoPreviewEditor` 里的 `defineMonacoTheme` 逻辑）
- 在 diff 上方加一个"摘要条"：显示路径、操作类型、行数统计（这些数据结果里已经有了）

## 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src-tauri/src/tools/file_modify.rs` | `FileModifyResult` 加 `old_content`, `commit_text_modification()` 传 `loaded.text` |
| `src-tauri/src/tools/write_file.rs` | `WriteFileResult` 加 `old_content`, 设为 `None` |
| `src/features/agent/tools/types.ts` | `WriteFileData` 和 `FileModifyData` 加 `oldContent?` |
| `src/features/agent/tools/file-diff-display.ts` | **新建** — 标签生成、数据提取工具函数 |
| `src/features/chat/components/file-diff-tool-output.tsx` | **新建** — Monaco DiffEditor 组件 |
| `src/features/chat/components/tool-invocation-chip.tsx` | 接入 `FileDiffToolOutput` 和自定义芯片标签 |

## 风险 & 验证

- **向后兼容：** 旧消息中的工具调用没有 `oldContent`，DiffEditor 会只展示修改后的内容，不影响使用。`oldContent` 是可选的（`Option<String>` / `?` 类型）。
- **Rust 测试：** `tool_replace_file` 和 `tool_edit_file` 的测试只断言已有字段，新增 `old_content` 不会破坏任何已有断言。
- **性能：** 大文件 (>1MB) 后端已经拒绝了。可写入的文件传 `old_content` 最多让 payload 翻倍，但上限是 `MAX_WRITE_BYTES`（当前 1MB），完全可接受。
- **验证方式：** 实现后在 `src-tauri/` 下运行 `cargo test` 确认 Rust 测试通过；运行 `npm test` 确认前端测试通过；手动通过 agent 写/编辑/替换文件，检查工具详情面板的展示效果。
