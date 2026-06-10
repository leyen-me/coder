# 输入框 Inline 文件引用（TipTap 方案）

本文档总结当前 composer 文件引用的实现、Cursor 式 inline tag 的目标形态，以及用 **TipTap** 替换 `textarea` 的改造方案。供后续会话直接接手实现。

---

## 1. 目标体验（Cursor 式）

用户从资源管理器 **拖拽** 或 **右键「添加到对话」** 后：

- 引用显示为 **inline pill / tag**，与正文在 **同一编辑区、同一行** 内混排
- 每个 tag 有 **×**，可单独移除
- 光标可在 tag **前/后** 移动；Backspace/Delete **一次删掉整个 tag**（原子节点）
- **同一文件可多次引用**（允许多个相同 path 的 tag）
- **不需要** success toast（输入框里看得见即可）

**不是** Cursor 的做法：在 textarea 上方单独放一行 tag（那是分层 UI，体验不同）。

---

## 2. 为什么原生 textarea 做不到

`<textarea>` 只能渲染 **纯字符串**。`@src/App.tsx` 只是文本，无法在其中嵌入：

- 圆角 pill 样式
- 内嵌 × 按钮
- 「整颗删除」的编辑语义

常见实现路径对比：

| 方案 | 能否 inline tag | 说明 |
|------|-----------------|------|
| textarea + 上方 tag 行 | ❌ 非 inline | 实现简单，但不是 Cursor |
| textarea + 镜像 overlay | ⚠️ 理论上可以 | 光标同步极难，维护成本高 |
| `contenteditable` + inline chip | ✅ | 很多产品走这条路 |
| **TipTap / Lexical / ProseMirror** | ✅ | 生产级，推荐 |

Cursor 类产品本质是 **富文本/混合 DOM 编辑器**，不是 textarea。

---

## 3. 当前代码现状（2025-06 已实现部分）

### 3.1 引用如何写入 composer

拖拽与右键最终都调用 `insertFileMentionIntoComposer(path)`，经 `useComposerInsert` 写入 **prompt 字符串**：

```
src/features/chat/lib/composer-insert-store.ts   — insert / appendFileMention
src/features/chat/hooks/use-composer-insert.ts   — 监听 version，setPrompt
src/features/chat/components/prompt-composer.tsx — PromptInputTextarea value={prompt}
```

`appendFileMention` 在字符串末尾追加 `@${path} `（**允许重复**）。

### 3.2 拖拽基础设施（可保留）

| 模块 | 作用 |
|------|------|
| `src/lib/dnd/workspace-path-pointer.ts` | Pointer 拖拽（Tauri/WKWebView 下比 HTML5 DnD 可靠） |
| `src/lib/dnd/workspace-path.ts` | 拖拽 MIME / session（HTML5 fallback） |
| `src/components/dnd/workspace-path-drag-preview.tsx` | 光标跟随预览卡片 |
| `src/features/chat/hooks/use-workspace-path-drop-target.ts` | composer  drop 区域 + 圆角 hover |
| `src/features/right-panel/components/workspace-file-tree.tsx` | 文件树 pointer 拖拽源 |

### 3.3 Agent 侧

发送时只传 **纯文本** `content: string`（见 `agent-store` → `createMessage`）。  
`@path` 目前 **没有** 单独解析或自动 read_file，就是 prompt 里的普通文字。

### 3.4 可复用但未接线的 UI 能力

- `PromptInput` 内已有 `referencedSources` 上下文（`SourceDocumentUIPart`），**尚无 UI、未进 onSubmit**
- `PromptComposerAttachmentsHeader` — 图片附件 inline tag（可参考样式）
- `ComposerEditTag` — 带 × 的 pill 样式（可参考视觉）

### 3.5 当前输入组件

```
PromptComposer
  └─ PromptInput
       └─ PromptInputTextarea  ← 要替换的目标
```

---

## 4. 推荐方案：TipTap + 自定义 Reference 节点

### 4.1 依赖（待安装）

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/pm
```

可选（第二期 @ 补全）：

```bash
pnpm add @tiptap/suggestion @tiptap/extension-mention
```

### 4.2 核心思路

1. 用 TipTap `EditorContent` **替换** `PromptInputTextarea`（仅在 chat composer 场景，或封装为 `PromptInputRichText`）
2. 自定义 **`WorkspaceReference` 扩展**（inline atom node）：
   - `attrs: { path, name, isDir }`
   - `inline: true`, `atom: true`, `selectable: true`
   - 渲染：pill + File/Folder 图标 + basename + ×
   - `addNodeView()` 或 `ReactNodeViewRenderer` 渲染 React 组件
3. **插入引用**：拖拽/右键 → `editor.chain().focus().insertWorkspaceReference({ path, name, isDir }).run()`
4. **提交序列化**：遍历 doc → 输出 agent 仍可用的字符串，例如：

   ```typescript
   // 示例：「请修 fix [Reference:src/App.tsx] 的 bug」→ "请修 fix @src/App.tsx 的 bug"
   function serializeComposerDoc(doc: JSONContent): string {
     // 文本节点原样；reference 节点 → `@${path}`
   }
   ```

5. **反序列化**（编辑历史消息时，可选）：正则或 token 解析 `@path` → 插回 reference 节点

### 4.3 编辑器配置要点

```typescript
import StarterKit from "@tiptap/starter-kit";
import { WorkspaceReference } from "./workspace-reference-extension";

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      // composer 不需要 heading/list 等，可关掉减小体积
      heading: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      codeBlock: false,
    }),
    WorkspaceReference,
  ],
  editorProps: {
    attributes: {
      class: "…", // 对齐现有 PromptInputTextarea 的 padding / min-height
    },
    handleKeyDown: (view, event) => {
      // Enter 发送、Shift+Enter 换行 — 迁移现有 PromptInputTextarea 逻辑
    },
  },
});
```

**IME**：TipTap 基于 ProseMirror，中文输入比手写 `contenteditable` 稳，但仍需在 **Tauri WKWebView** 上实测微信输入法 / 系统中文输入法。

**Enter 发送**：在 `handleKeyDown` 里复用现有逻辑（含 `isComposing` / IME 229 处理），避免 composition 未结束就 submit。

---

## 5. 与现有模块的对接

### 5.1 改造 `composer-insert-store`

由「字符串 append」改为「通知 editor 插入节点」：

```typescript
// 方向 A：store 持有 editor ref 的 insert 回调（注册制）
export function registerComposerReferenceInserter(fn: (path: string) => void): () => void;

// 方向 B：store 仍 emit path，PromptComposer 内 editor 监听并 insert
// （与现有 useComposerInsert 类似，但调 editor 而非 setPrompt）
```

推荐 **方向 B**，改动面小：保留 `insertFileMentionIntoComposer(path)` API，文件树/拖拽代码 **几乎不用动**。

### 5.2 `PromptComposer` 数据流

```
当前:
  prompt: string  →  textarea  →  onSend({ text: prompt })

目标:
  editor JSON / 内部 state  →  serialize  →  onSend({ text: serialized })
```

`ChatSessionView` / `NewChatView` 的 `prompt` state：

- 短期：仅存 **纯文本**（serialize 结果），编辑旧消息仍用 string
- 长期：可选存 TipTap JSON（需 DB 字段，非第一期）

### 5.3 拖拽

保留现有 pointer 拖拽链，只改 drop 回调：

```typescript
// prompt-composer.tsx
const handleWorkspacePathDrop = useCallback((path: string) => {
  insertFileMentionIntoComposer(path); // 内部改为 editor insert
}, []);
```

`insertFileMentionIntoComposer` 需要 **basename** 时，可从 path 解析：`path.split("/").pop() ?? path`；`isDir` 拖拽源已知，经 store 一并传递（扩展 payload）。

### 5.4 `focusComposerTextarea`

改为 `editor.commands.focus()`，或保留 selector 但指向 `.ProseMirror`。

### 5.5 `PromptInput` 集成方式

两种选一：

| 方式 | 优点 | 缺点 |
|------|------|------|
| **A. 在 PromptComposer 内直接用 TipTap**，不用 PromptInputTextarea | 改动集中 | PromptInput 的 form submit 取 text 要改 |
| **B. 新增 `PromptInputRichText` 子组件**，接口对齐 textarea | 结构清晰 | 多一层抽象 |

建议 **A**：composer 是主要场景；PromptInput 的 `onSubmit` 改为接收 serializer 提供的 `text`。

`PromptInputMessage` 暂可不变：

```typescript
type PromptInputMessage = { text: string; files: FileUIPart[] };
```

---

## 6. Reference 节点 spec（建议）

### 6.1 Node attrs

```typescript
type WorkspaceReferenceAttrs = {
  path: string;   // 工作区相对路径，序列化为 @path
  name: string;   // 展示名（通常 basename）
  isDir: boolean;
};
```

### 6.2 渲染（对齐现有设计 token）

参考 `ComposerEditTag` / 附件 pill：

- `rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs font-mono`
- 文件夹：`FolderIcon` + name；文件：`FileIcon` + name
- ×：`aria-label` 国际化 `chat.removeReference`（需加 i18n key）

### 6.3 行为

- **不可**在 tag 内编辑文字（atom）
- Click × → `deleteRange` 删节点
- 允许同一 `path` 多个节点（无去重）
- Paste：默认纯文本；第二期可解析 `@path` 为节点

---

## 7. 序列化 / 反序列化

### 7.1 提交（必须）

```typescript
function serializeEditorToAgentText(editor: Editor): string {
  let out = "";
  editor.state.doc.descendants((node) => {
    if (node.type.name === "workspaceReference") {
      out += `@${node.attrs.path}`;
    } else if (node.isText) {
      out += node.text;
    }
  });
  return out.trim();
}
```

块级结构：composer 仅用单段落时，换行用 `\n`（StarterKit paragraph 间 `\n\n` 或 hardBreak，按产品定）。

### 7.2 空内容判断

```typescript
const text = serializeEditorToAgentText(editor);
const hasRefs = editor.state.doc.content.content.some(
  (n) => n.type.name === "workspaceReference"
);
const canSend = text.length > 0 || hasRefs || files.length > 0;
```

### 7.3 加载编辑消息（可选第二期）

用户编辑历史 user message 时，若 content 含 `@src/App.tsx`，可用简单 tokenizer 还原为 reference + text 混合 doc。

---

## 8. 实施分期

### Phase 1 — MVP（Cursor-like inline tag）

- [x] 安装 TipTap，实现 `WorkspaceReference` 扩展 + React node view
- [x] `PromptComposer` 替换 textarea，Enter/Shift+Enter/IME 行为对齐
- [x] `insertFileMentionIntoComposer` → 插入 node；拖拽/右键打通
- [x] Submit 时 serialize 为 `@path` 字符串，agent 无改动
- [ ] × 移除、重复引用、Tauri 下 IME 冒烟测试（需本地手动验证）

### Phase 2 — 体验增强

- [ ] 输入 `@` 触发文件路径 suggestion（`@tiptap/suggestion`）
- [ ] 编辑历史消息时 deserialize `@path` → nodes
- [ ] Tag hover 显示完整相对路径 tooltip

### Phase 3 — Agent 能力（可选）

- [ ] 发送前根据 references 自动 `read_file` 注入 context（不只靠 `@` 文本）
- [ ] DB 存 TipTap JSON + 纯文本双份

---

## 9. 建议新增/修改文件

```
src/features/chat/
  components/
    composer-rich-input.tsx          # TipTap 包装，替代 PromptInputTextarea
    workspace-reference-node.tsx     # NodeView UI（pill + ×）
  lib/
    workspace-reference-extension.ts # TipTap Extension 定义
    composer-serialize.ts            # doc ↔ agent text
    composer-insert-store.ts         # 改 payload / focus API

src/features/chat/components/prompt-composer.tsx  # 接入 ComposerRichInput
src/features/chat/hooks/use-composer-insert.ts   # 调 editor insert

docs/composer-inline-file-references-tiptap.md     # 本文档
```

**尽量不改**：`workspace-path-pointer.ts`、文件树拖拽、agent-store 消息结构。

---

## 10. 测试清单

- [ ] 拖拽文件/文件夹 → inline tag 出现在光标处或文末
- [ ] 右键「添加到对话」同上
- [ ] 同一文件拖两次 → 两个 tag
- [ ] × 删除其中一个，另一个保留
- [ ] tag 与中文/英文混排同一行
- [ ] 中文 IME：组字期间 Enter 不发送
- [ ] Enter 发送、Shift+Enter 换行
- [ ] 发送后 serialize 字符串含正确 `@path`，agent 收到预期 content
- [ ] 仅 tag 无文字时可发送
- [ ] Tauri release 构建下 pointer 拖拽 + 预览仍正常

---

## 11. 备选方案（未采用）

| 方案 | 原因 |
|------|------|
| textarea 上方 tag 行 | 非 Cursor inline 体验，已明确不做 |
| Lexical Mention | 可行，但 Mention 插件上手曲线略陡；TipTap 文档更贴近「自定义 inline node」 |
| 手写 contenteditable | IME/选区/粘贴边界多，不符合 AGENTS.md 长期维护要求 |
| 继续纯 `@` 文本 | 无 ×、无 pill，体验差 |

---

## 12. 参考链接

- TipTap React：https://tiptap.dev/docs/editor/getting-started/install/react
- Custom node：https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new-node
- Node views (React)：https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react
- Mention（第二期）：https://tiptap.dev/docs/editor/extensions/nodes/mention

---

## 13. 接手会话时的第一句话（可复制）

> 请按 `docs/composer-inline-file-references-tiptap.md` Phase 1 实现 TipTap inline 文件引用：替换 PromptInputTextarea，自定义 WorkspaceReference 节点，保留现有拖拽/insertFileMentionIntoComposer 链路，submit 序列化为 `@path` 字符串。
