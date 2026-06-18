# 上下文巨大时的渲染与输入性能优化

## 目标
解决两个核心性能问题（**无论有无流式输出都存在的性能瓶颈**）：
1. **消息列表/Markdown 渲染卡顿** — 消息量大时页面滚动、重渲染都明显卡顿
2. **Prompt 输入框卡顿** — 上下文巨大时，在输入框中打字明显延迟

---

## 问题诊断

### 问题一：消息列表渲染性能

**静态场景（无流式）已经卡顿的根因：**

1. **无虚拟化，全量 DOM 渲染** — `MessageList`（`message-list.tsx` L182）使用 `.map()` 渲染全部消息。100 条消息 = 数千 DOM 节点（每条消息含 markdown 解析后的完整 HTML 树 + 代码块 + tool 调用等子组件）。

2. **react-markdown 是同步 CPU 密集型操作** — `MarkdownRenderer`（`markdown-renderer.tsx` L325-331）每条消息渲染时需要：
   - `remarkGfm` 解析 GFM 表格/任务列表
   - `remarkMath` + `rehypeKatex` 解析数学公式
   - `rehypeRaw` 解析原始 HTML
   - `rehypeSanitize` 安全过滤 HTML
   - `remarkGemoji` emoji 短码转换
   
   每条消息的 markdown 解析在主线程同步执行，100 条消息 = 100 次完整解析，阻塞主线程。

3. **任何原因触发的重渲染都会重新解析所有 markdown** — 即使 `MessageResponse` 使用了 `memo`（`message.tsx` L330-332），仅比较 `children` 和 `className`。但如果父组件重渲染（例如因为输入框打字），所有 `MessageItem` 仍会运行 memo 比较器，而 `MessageItem` 内部有多个 `useMemo`（`answerText`、`processSteps`、`timelineSteps` 等）。

4. **代码块 Shiki 语法高亮是同步阻塞操作** — `CodeBlock` 使用 Shiki 进行语法高亮，大代码块（几百行）的 tokenization 在主线程同步执行。

### 问题二：Prompt 输入框卡顿

**核心根因：状态提升过高 + 每次按键触发整棵树重渲染**

当前的渲染链路（`chat-session-view.tsx`）：
```
用户按键 → setPrompt(value) → ChatSessionView 重渲染
  ├── contextUsage useMemo 重新计算 → estimateSessionContextUsage() → 遍历所有消息估算 token
  ├── displayMessages useMemo 重新计算 → applyStreamingOverlays() → 遍历所有消息
  ├── MessageList 重渲染 → 所有 MessageItem 运行 memo 比较器
  └── PromptComposer 重渲染 → ComposerRichInput 重渲染 → TipTap effect 执行
```

这就是输入框卡顿的直接原因：**每一次按键都在触发 `estimateSessionContextUsage` 遍历 100+ 条消息做 token 估算 + `applyStreamingOverlays` 遍历所有消息 + 整棵组件树协调**。

具体热点：

1. **`prompt` 状态在 `ChatSessionView`**（L99）— `setPrompt` 触发整个 `ChatSessionView` 重渲染，连带所有子组件。

2. **`contextUsage` useMemo 每次按键都执行**（L506-522）— `estimateSessionContextUsage` 遍历 `displayMessages` 每条消息，调用 `estimateMessageUsage`，其中对 tool invocations 做 `JSON.stringify(invocation.input)` 和 `serializeInvocationToolContent`。100 条消息 = 大量同步计算。

3. **`displayMessages` useMemo 每次按键都执行**（L98）— `applyStreamingOverlays` 遍历所有消息做浅比较。

4. **`ComposerRichInput` 中的 `deserializeOptions` 引用不稳定**（`composer-rich-input.tsx` L102-108）：
   ```tsx
   const enabledSkillSlugs = useMemo(
     () => new Set(enabledSkills.map((s) => s.slug)),
     [enabledSkills]
   );
   ```
   `new Set()` 每次都是新引用 → 依赖它的 `deserializeOptions` 也是新引用 → 导致 L467-487 的 `useEffect` 在每次父组件重渲染时执行 `serializeEditorToAgentText`（遍历 TipTap 文档树）。

5. **contextUsage 计算对输入场景毫无必要** — 用户打字时 Context 用量指示器根本不需要实时更新，但它的计算却阻塞了输入响应。

---

## 优化方案

### 阶段一：Prompt 输入框状态隔离（最高优先级）

这是解决输入卡顿最关键的优化。**目标：打字时 `ChatSessionView` 不重渲染，`MessageList` 完全不受影响。**

**方案：将 `prompt` 状态从 `ChatSessionView` 下沉到 `PromptComposer` 内部**

1. `PromptComposer` 自己管理 `value` 状态（内部 `useState`）
2. `ChatSessionView` 不再持有 `prompt` state，改为传递 `initialPrompt`（仅在编辑消息时使用）和 `onSend` 回调
3. `PromptComposer` 发送消息时通过 `onSend` 回调将文本传出，同时清空内部状态
4. 编辑消息时通过 `key` prop（`composerKey`）强制重建组件来加载初始内容，而非通过 props 同步

**额外优化：contextUsage 计算解耦**

5. `contextUsage` 的计算从 `ChatSessionView` 的渲染路径中移出：
   - 使用 `useDeferredValue` 延迟 contextUsage 更新，或
   - 使用独立的小型 `setInterval`（500ms~1s）在 Effect 中计算，而非在渲染期间
   - ComposerContextUsage 组件内部也做一层防抖

### 阶段二：消息列表虚拟滚动

**方案：引入 `@tanstack/react-virtual` 实现虚拟列表**

1. 安装 `@tanstack/react-virtual`
2. 修改 `MessageList`，用 `useVirtualizer` 替换 `.map()`：
   - 动态高度估算（默认 200px） + `measureElement` 精确测量
   - 仅渲染视口内 + 上下各 3~5 条缓冲消息
3. 注意事项：
   - 自动滚到底部逻辑需适配：使用 `virtualizer.scrollToIndex(messages.length - 1)`
   - 流式消息高度变化时调用 `virtualizer.measure()`
   - 保留 `ScrollArea` 的外层结构，虚拟列表替换内部消息容器
4. **预期效果**：无论多少条消息，DOM 节点数恒定在 ~20-30 条

### 阶段三：Markdown 渲染优化

**方案 A：消息级别的懒 Markdown 渲染（推荐）**

1. 虚拟列表视口外的消息：渲染纯文本（`whitespace-pre-wrap`），不解析 markdown
2. 消息进入视口后才升级为完整 `MarkdownRenderer`
3. 利用虚拟列表自带的可见性信息判断

**方案 B：Markdown 渲染缓存优化**

1. `MarkdownRenderer` 的 `memo` 已做了基本缓存，但确保：
   - 同一消息的 markdown 内容未变时不重新解析
   - 利用 `useMemo` 包裹 `ReactMarkdown` 的渲染结果
2. 检查 `react-markdown` 是否有不必要的 re-mount（例如 key 不稳定）

**方案 C：按需启用重型插件**

1. 预扫描消息内容，不含数学公式（`$$` 或 `$`）时跳过 `remarkMath` + `rehypeKatex`
2. 不含 HTML 标签时跳过 `rehypeRaw`（`rehypeSanitize` 仍保留以保证安全）
3. 拆分出两个 `ReactMarkdown` 变体：完整版和轻量版

### 阶段四：精细化优化

1. **修复 `deserializeOptions` 引用稳定性**：
   - 将 `enabledSkillSlugs` 从 `new Set(...)` 改为用 `useRef` + 手动更新
   - 或用 `[...enabledSkills].map(s => s.slug).sort().join(',')` 作为 memo key

2. **`MessageItem` memo 比较器优化**：
   - 确保 `useDisplayMessages` 对非流式消息返回相同引用（`===` 比较），这样 memo 比较器可以在 O(1) 时间内跳过

3. **代码块语法高亮延迟**：
   - `CodeBlock` 使用 `startTransition` 包裹 Shiki 高亮
   - 或使用 Web Worker 异步高亮

4. **流式输出场景的额外保护**（阶段一已解决大部分，此为补充）：
   - `streamingOverlays` 更新时确保非流式消息引用不变
   - streaming buffer 的 onChange 频率已经做了 RAF 节流（`streaming-buffer.ts`），确认效果足够

---

## 实施文件清单

| 优先级 | 文件 | 改动 |
|--------|------|------|
| **P0** | `src/features/chat/views/chat-session-view.tsx` | 移除 `prompt` state，`contextUsage` 计算延迟/解耦，简化渲染路径 |
| **P0** | `src/features/chat/components/prompt-composer.tsx` | 内置 `value` state 管理，接收 `initialPrompt` + `onSend`，`React.memo` |
| **P0** | `src/features/chat/components/composer-rich-input.tsx` | 修复 `deserializeOptions` 引用稳定性 |
| **P1** | `package.json` | 添加 `@tanstack/react-virtual` |
| **P1** | `src/features/chat/components/message-list.tsx` | 引入虚拟滚动 |
| **P2** | `src/components/markdown/markdown-renderer.tsx` | 轻量/完整模式拆分，插件预扫描 |
| **P2** | `src/features/chat/components/streaming-message-content.tsx` | 支持纯文本降级模式 |
| **P3** | `src/components/ai-elements/code-block.tsx` | 语法高亮延迟/异步 |
| **P3** | `src/features/chat/hooks/use-session-messages.ts` | 优化引用稳定性 |
| **P3** | `src/features/chat/components/message-item.tsx` | memo 比较器简化 |

---

## 风险与验证

### 虚拟化对流式输出的影响分析

**结论：不影响流式输出，反而提升流式期间的性能。**

1. **数据流完全不变** — 虚拟滚动只改变渲染层（哪些消息在 DOM 中），不碰数据层。`streamingBuffer` → `streamingOverlays` → `useDisplayMessages` 链路完全不受影响。

2. **流式消息尺寸变化自动适应** — `@tanstack/react-virtual` 的 `measureElement` 内部用 `ResizeObserver` 监听已渲染元素高度。流式消息内容增长 → 高度自动更新 → virtualizer 自动调整间距，无需手动干预。

3. **自动滚底适配** — 当前用 `viewport.scrollTo({ top: scrollHeight })`，改为 `virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })`。需要适配的点：
   - `isPinnedToBottomRef` 的判断从 `viewport.scrollTop + clientHeight >= scrollHeight` 改为比较 `virtualizer.scrollOffset` 与滚动范围
   - `scrollMessagesToBottom` 函数改用 `virtualizer.scrollToIndex`

4. **流式期间性能反而更好** — 当前每 ~50ms：`MessageList` 重渲染 → 100 条 `MessageItem` 全部运行 memo 比较器。虚拟化后仅视口内 ~5-10 条消息参与渲染和比较。

### 其他风险
- **PromptComposer 状态下沉** — 确保与编辑消息、队列消息功能的兼容性。编辑时通过 `key` 重建组件是可靠模式，但需确认 `initialFiles` 同步
- **react-markdown 插件条件启用** — 预扫描可能有漏报（如 `$` 出现在代码块中），需保留完整模式作为 fallback
- **`@tanstack/react-virtual` 与现有 `ScrollArea`** — 虚拟列表需要自己的滚动容器（`overflow: auto`），需确认能否复用 `ScrollArea` 内部的 viewport，或直接替换 `ScrollArea`

### 验证方法
1. 创建 200+ 条消息的测试会话（含代码块、表格、长文本）
2. Chrome DevTools Performance 录制：
   - 页面首次加载耗时
   - 在输入框中快速打字，检查每次按键的渲染耗时（应在 1-2ms 内）
   - 确认 `MessageList`/`MessageItem` 在打字时**完全不被重渲染**
3. React DevTools Profiler：确认 `ChatSessionView` 在输入时不触发重渲染
4. 流式输出场景：FPS 保持 60fps
