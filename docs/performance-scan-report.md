# 性能扫描报告

> 扫描日期：2026-06-30  
> 扫描范围：输入框、消息列表、工具、工具详情  
> 严重等级：**P0**（每次交互都可见卡顿） / **P1**（特定条件下显著卡顿）

---

## 目录

- [一、输入框（Input / Composer）](#一输入框input--composer)
- [二、消息列表（Message List）](#二消息列表message-list)
- [三、工具（Tools）](#三工具tools)
- [四、工具详情（Tool Details）](#四工具详情tool-details)
- [五、全局性问题（Cross-cutting）](#五全局性问题cross-cutting)
- [六、修复建议优先级](#六修复建议优先级)

---

## 一、输入框（Input / Composer）

### 🔴 P0：`composer-rich-input.tsx:409` — 每次按键都序列化整个编辑器文档

```tsx
// composer-rich-input.tsx, line 407-410
onUpdate: ({ editor: currentEditor }) => {
  syncMentionState(currentEditor);
  handleUpdate(serializeEditorToAgentText(currentEditor)); // 每次按键都执行
},
```

**问题**：用户每输入一个字符，`serializeEditorToAgentText` 都会遍历整个 ProseMirror 文档树（`editor.state.doc.forEach(...)`）来拼接文本、解析 `@workspace` 和 `/skill` 引用节点。对于包含多个段落和引用的长消息，序列化开销显著。

**连锁反应**：序列化 → `onChange` → 父组件 `setValue` → 父组件重渲染 → 新的 `value` prop → `ComposerRichInput` 重渲染 → `useEffect`（line 471）再触发**第二次序列化**做比较。

**影响**：每次按键都触发完整文档树遍历 + 级联重渲染，是输入卡顿的头号原因。

### 🔴 P0：`composer-rich-input.tsx:408` — 每次按键都检测 Mention 状态

```tsx
// composer-rich-input.tsx, line 408
syncMentionState(currentEditor);
```

**问题**：`syncMentionState` 内部调用 `getActiveComposerMention(editor.state)`，在每次按键时都会：

1. 访问 `state.selection.$from`
2. 检查父节点类型
3. 从光标位置往回提取文本
4. 执行正则匹配 `parseActiveComposerMention(...)`

当用户没有输入 `@` 时（大部分时间），这是完全浪费的计算。

### 🟡 P1：`composer-rich-input.tsx:98-105` — `useMemo` 依赖在每次渲染时重新计算

```tsx
const enabledSkillSlugs = useMemo(
  () => new Set(enabledSkills.map((s) => s.slug)),
  [JSON.stringify(enabledSkills.map((s) => s.slug).sort())] // 每次渲染都执行
);
```

**问题**：`useMemo` 的依赖数组表达式 `JSON.stringify(enabledSkills.map(...).sort())` **在每次渲染时都会完整求值**，包括遍历所有技能 → 排序 → JSON 序列化。当用户有 20+ 个技能时，每次按键都做了不必要的计算。

### 🟡 P1：`composer-rich-input.tsx:94-97` — `filterEnabledSkills` 每次渲染都执行

```tsx
const skillResults = filterEnabledSkills(enabledSkills, skillMention?.query ?? "");
```

**问题**：即使没有在输入 `/skill` mention（大部分情况），这个函数每次渲染都运行，做了不必要的 `query.trim().toLowerCase()` 和数组遍历。

### 🟡 P1：`prompt-composer.tsx:378-427`（调用于 line 807） — Model 下拉菜单每次渲染都重建

```tsx
{renderModelOptions(models, modelProviders)} // line 807
```

**问题**：`renderModelOptions` 构造了一个完整的 JSX 树（遍历所有 models → 建立 Map → 生成 DropdownMenuRadioItem 数组），在每次 `PromptComposer` 渲染时都执行。即使下拉菜单很少打开，30+ 模型时重建所有元素也是浪费。

### 🟡 P1：`prompt-composer.tsx:611-625` — 静态 className 每次渲染都重新计算

```tsx
const promptInputClassName = cn("...", "...", ...); // 14+ 静态参数
```

**问题**：所有参数都是字符串字面量，结果永远不变。应提取为模块级常量。

### 🟡 P1：`prompt-composer.tsx:483` — `findModelDefinition` 每次渲染都做线性查找

```tsx
const selectedModel = findModelDefinition(models, model);
```

**问题**：`models.find(m => m.id === id)` 在每次按键时都做 O(n) 遍历。应使用 `useMemo` 缓存结果。

### 🟡 P1：`prompt-input.tsx:634` — `PromptInput` 未包裹 `React.memo`

**问题**：根组件没有 memo，每次父组件（`PromptComposer`）重渲染都导致整个 `PromptInput` 子树（包括 context providers、form 元素、footer）全部重渲染。

---

## 二、消息列表（Message List）

### 🔴 P0：`message-list.tsx:331-336` — 非虚拟化路径完整渲染所有消息

```tsx
{/* ── Simple (non-virtualized) rendering ── */}
messages.map((message, index) => (
  <Fragment key={message.id}>
    {renderBuildBoundarySeparator(index)}
    {renderMessage(message)}
  </Fragment>
))
```

**问题**：当 `virtualScrollEnabled` 为 `false`（通过 lab 设置控制），**每条消息都渲染为完整的 DOM 子树**。每条 `MessageItem` 包含：process steps 折叠面板、工具调用列表、附件、流式内容、操作按钮等。50+ 条消息时可能产生 **数千个 DOM 节点**，导致：

- 初始渲染/布局缓慢
- 高内存占用
- 滚动卡顿
- 流式更新时动画帧率下降

**影响**：核心对话体验随对话长度线性退化。没有虚拟化的回退保护。

### 🟡 P1：`message-item.tsx:144` — `.trim()` 每次渲染都创建新字符串

```tsx
const hasThinkingText = Boolean(message.thinking.trim());
```

**问题**：`String.prototype.trim()` 在每条消息的每次渲染都分配新字符串。流式推理消息频繁重渲染时产生 GC 压力。建议改为 `/[^\s]/.test(message.thinking)` 避免分配。

### 🟡 P1：`queued-message-list.tsx:22` — 缺少 `React.memo`

**问题**：`QueuedMessageList` 没有 memo 包裹，父组件重渲染时即使 props 不变也会完整重渲染。

### 🟡 P1：`message-list.tsx:248-260` — `renderMessage` 每次渲染重新创建

**问题**：`renderMessage` 是组件内定义的普通函数，每次渲染重建。虽然 `MessageItem` 有 memo comparator，但 comparator **对每条消息都执行**（line 56-103 的字段对比），同时 `chatRetryByMessageId.get()` 和 `streamingMessageIds.has()` 对每条消息都做 Map 查找。

### 🟡 P1：`message-item.tsx:182-189` — `shouldShowProcessTimeline` 等函数未 memo 化

```tsx
const showProcessTimeline = shouldShowAssistantProcessTimeline({ steps, isPlanMessage });
const showStandaloneAnswer = shouldRenderStandaloneAssistantAnswer({ steps, isPlanMessage });
```

**问题**：这些函数每次渲染都执行，即使 `processSteps`（useMemo 过的）和 `isPlanMessage` 未改变。

---

## 三、工具（Tools）

### 🔴 P0：`tool.tsx:245` — `ToolInput` 中 `JSON.stringify` 每次渲染都执行

```tsx
// tool.tsx, line 244-245
export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const code = JSON.stringify(input, null, 2);
```

**问题**：`JSON.stringify(input, null, 2)` 在每次渲染都执行。工具调用参数可能很大（如 shell 命令、文件内容），这是昂贵的操作。应使用 `useMemo` 包裹。

### 🔴 P0：`tool.tsx:270, 278, 284` — `ToolOutput` 中序列化和格式化每次渲染都执行

```tsx
// tool.tsx, line 270
const copyText = serializeToolOutput(output, errorText);
// line 278
code={formatOutputForDisplay(output)}
```

**问题**：

- `serializeToolOutput`（line 122-141）：拼接字符串，对非字符串输出执行 `JSON.stringify(output, null, 2)`
- `formatOutputForDisplay`（line 170-184）：调用 `truncateDeepStrings` 递归遍历整个输出对象，再 `JSON.stringify`
- `truncateDeepStrings`（line 145-168）：递归遍历对象的每个字段值

这三个函数都在每次渲染时重复执行，没有 memo 缓存。

### 🟡 P1：`tool.tsx:77, 108, 227` — `ToolHeader`、`ToolContent`、`ToolSectionHeader` 缺少 `React.memo`

**问题**：这些组件作为纯展示组件，无 memo 时父组件重渲染就无条件重建。

---

## 四、工具详情（Tool Details）

### 🔴 P0：`tool-invocation-chip.tsx:108-135` — 每次渲染调用 ~20 个 `getXxxChipLabel` 函数

```tsx
const chipLabel =
  getShellChipLabel(invocation.name, invocation.input, invocation.output) ??
  getBrowsePageChipLabel(invocation.name, invocation.input, invocation.output) ??
  getAskQuestionChipLabel(invocation.name, invocation.output) ??
  // ... 还有 ~17 个
```

**问题**：这是一个长达 20+ 次函数调用的**短路链**。每次渲染都依次调用所有 `getXxxChipLabel` 函数，每个函数内都处理 `invocation.name`、`invocation.input`、`invocation.output`。当 `invocation` 对象引用变化（流式更新导致）时，整条链重新执行。应使用 `useMemo` 包裹，依赖 `invocation`。

### 🔴 P0：`tool-invocation-chip.tsx:102-343` — `ToolInvocationChip` 缺少 `React.memo`

**问题**：这是一个约 240 行的巨型组件（含 Sheet、15+ 条件渲染分支），没有 memo 包裹。当它在 `MessageToolItem` 的 `.map()` 中被使用（message-tool-list.tsx:22-28），任何一个工具调用的状态更新都会导致**所有** `ToolInvocationChip` 重渲染。

### 🔴 P0：`message-tool-list.tsx:39-53` — `MessageToolItem` 缺少 `React.memo`

**问题**：`MessageToolItem` 在 `.map()` 中被渲染，没有 memo 包裹。任何一个 invocation 的状态变化都会导致列表中所有工具项重渲染，级联到 `ToolInvocationChip`。

### 🔴 P0：`assistant-process-view.tsx:39` — `groupAssistantProcessSteps` 每次渲染都执行

```tsx
const groups = groupAssistantProcessSteps(steps);
```

**问题**：`groupAssistantProcessSteps`（line 291-315）遍历所有 steps，创建新的数组和 group 对象。在每次渲染（包括流式更新）都重新执行。应使用 `useMemo(() => groupAssistantProcessSteps(steps), [steps])`。

### 🔴 P0：`assistant-process-view.tsx:37-289` — `AssistantProcessView` 缺少 `React.memo`

**问题**：约 250 行的巨型组件，无 memo 包裹。每次父组件重渲染都导致完整的 grouping、条件判断和子组件重建。

### 🔴 P0：`assistant-process-view.tsx:43-286` — `.map()` 内创建巨型匿名函数

```tsx
{groups.map((group) => {
  // 240+ 行的匿名函数，每次渲染重建
  if (group.kind === "tools") { ... }
  if (group.kind === "reasoning") { ... }
  // ...
})}
```

**问题**：`.map()` 回调是一个 240+ 行的匿名函数，每次渲染都重新创建，导致 JSX 树完全重建，无法对单个 group 做 memo。

### 🟡 P1：`tool-invocation-chip.tsx:138-171` — 15+ 个 `isXxxTool` 布尔值每次渲染重算

**问题**：每个 `isXxxTool` 都是字符串比较（如 `invocation.name === SHELL_TOOL_NAME`），共 15+ 个，每次渲染都执行。应统一使用 `useMemo` 或查询表。

### 🟡 P1：`tool-invocation-chip.tsx:212-337` — 长 if/else 链每次渲染重评估

**问题**：15+ 分支的条件渲染链（从上到下逐个检查），每次渲染都完整评估。分支顺序表明一些常用工具（如 `isFileDiffTool`、`isShellTool`）排在前面，但整体复杂度仍为 O(n)。应使用查找映射表。

### 🟡 P1：`tool-status-icon.tsx:21-44` — 缺少 `React.memo`

**问题**：纯展示组件，只依赖 `state` 和 `status` 两个 prop，应 memo 化。

### 🟡 P1：`assistant-process-view.tsx:45-50` — `.filter()` 每次渲染创建新数组

```tsx
const askQuestionInvocations = group.invocations.filter(...);
const standardInvocations = group.invocations.filter(...);
```

**问题**：每次渲染对同一个数组做两次 `.filter()`，创建两个新数组。应一次遍历完成分组。

### 🟡 P1：`assistant-process-view.tsx:113-279` — 重复的 HoverCard 渲染块

**问题**："continue with continuation"（line 113-193）和 "resolved no continuation"（line 197-279）两个分支的 HoverCard 内容几乎完全重复。增加包体积和维护成本。

---

## 五、全局性问题（Cross-cutting）

### 🔴 P0：`message-tool-list.tsx → tool-invocation-chip.tsx` 级联重渲染

**问题链路**：

```
流式更新 → invocation.state 变化
→ MessageToolItem(无memo) 重渲染所有
  → ToolInvocationChip(无memo) 重渲染
    → chipLabel 链(20函数) 重执行
    → isXxxTool 布尔值(15+) 重计算
    → if/else 链(15+分支) 重评估
    → ToolInput JSON.stringify 重执行
    → ToolOutput formatOutputForDisplay 重执行
```

这是最严重的级联性能问题，一个工具的流式状态更新会触发大量的无意义计算。

---

## 六、修复建议优先级

### P0 立即修复（按影响排序）

| 优先级 | 文件 | 修复方案 |
|--------|------|----------|
| 1 | `composer-rich-input.tsx:408` | 在 `syncMentionState` 前加快速检查：仅在编辑器文本包含 `@` 时才运行 |
| 2 | `composer-rich-input.tsx:409` | 将 `serializeEditorToAgentText` 延迟到 `requestAnimationFrame` 或在 `onUpdate` 中增量处理 |
| 3 | `message-tool-list.tsx:39` | 给 `MessageToolItem` 加 `React.memo`（用 shallow equal） |
| 4 | `tool-invocation-chip.tsx:102` | 给 `ToolInvocationChip` 加 `React.memo` |
| 5 | `tool-invocation-chip.tsx:108` | 将 chipLabel 计算包裹在 `useMemo` 中 |
| 6 | `assistant-process-view.tsx:37` | 给 `AssistantProcessView` 加 `React.memo` |
| 7 | `assistant-process-view.tsx:39` | 用 `useMemo` 包裹 `groupAssistantProcessSteps` |
| 8 | `assistant-process-view.tsx:43` | 提取 Group 渲染为独立的 memo 化子组件 |
| 9 | `tool.tsx:245` | 用 `useMemo` 包裹 `JSON.stringify(input, null, 2)` |
| 10 | `tool.tsx:270,278` | 用 `useMemo` 包裹 `serializeToolOutput` 和 `formatOutputForDisplay` |
| 11 | `message-list.tsx:331-336` | 移除非虚拟化渲染路径，或添加阈值强制切换 |

### P1 逐步修复

| 优先级 | 文件 | 修复方案 |
|--------|------|----------|
| 12 | `prompt-composer.tsx:611-625` | 将静态 `promptInputClassName` 提取为模块常量 |
| 13 | `prompt-composer.tsx:378` | 用 `useMemo` 包裹 `renderModelOptions` |
| 14 | `prompt-composer.tsx:483` | 用 `useMemo` 包裹 `findModelDefinition` 结果 |
| 15 | `composer-rich-input.tsx:94` | 用 `useMemo` 包裹 `filterEnabledSkills` 结果 |
| 16 | `composer-rich-input.tsx:98` | 将 useMemo 依赖计算移到单独的 useMemo |
| 17 | `prompt-input.tsx:634` | 给 `PromptInput` 加 `React.memo` |
| 18 | `tool-status-icon.tsx:21` | 给 `ToolStatusIcon` 加 `React.memo` |
| 19 | `tool-invocation-chip.tsx:138` | 用 `useMemo` 合并 isXxxTool 布尔值 |
| 20 | `tool-invocation-chip.tsx:212` | 将 if/else 链改为工具名→组件的查找映射表 |
| 21 | `queued-message-list.tsx:22` | 给 `QueuedMessageList` 加 `React.memo` |
| 22 | `message-item.tsx:144` | 用 `/[^\s]/.test()` 代替 `.trim()` |
| 23 | `message-item.tsx:182-189` | 用 `useMemo` 包裹 `showProcessTimeline` 等 |
| 24 | `assistant-process-view.tsx:45` | 一次遍历代替两次 `.filter()` |
| 25 | `assistant-process-view.tsx:113-279` | 提取公共 HoverCard 为共享函数/组件 |
