# Session 消息列表性能优化

## 目标

优化 session message-list 在长上下文（50+ 条消息）下的渲染性能。当前所有消息同时渲染为 DOM 节点，每次流式更新触发全量数组操作。目标：100+ 消息的 session 达到流畅滚动、流式更新时帧预算 <16ms、内存可控。

---

## 当前瓶颈分析

| 层面 | 问题 |
|---|---|
| **数据获取** | `useSessionData` 每次 DB 变化时从 IndexedDB 读取**全部**消息（`getAllFromIndex`），150ms 防抖间隔内全量重取 |
| **流式覆盖** | `applyStreamingOverlays` 每次流式更新对整个消息数组执行 `.map()` |
| **DOM 渲染** | 所有消息同时在 DOM 树中（含 `MessageItem`、`AssistantProcessView` 内部步骤），无虚拟化 |
| **上下文估算** | `estimateSessionContextUsage` 每次渲染遍历所有消息做 token 估算 |
| **滚动容器** | Radix UI ScrollArea 无内置虚拟化 |

---

## 优化步骤

### 1. 引入虚拟滚动（最高收益）

安装 `@tanstack/react-virtual`，用 `useVirtualizer` 替换 `message-list.tsx` 中的 `.map()`。

**实现要点**：
- 虚拟化器的滚动容器绑定到 ScrollArea 的 viewport 元素（`[data-slot="scroll-area-viewport"]`）
- 使用**动态高度测量**（`measureElement`），因为消息高度差异巨大（1 行用户消息 vs 50 个 tool 的 assistant 回复）
- 上下 overscan 各 3 条
- 新消息到达时 `scrollToIndex(index, { align: "end" })` 保持钉底
- 流式内容更新时通过 `resizeObserver` 重新测量行高，避免滚动跳动

**涉及文件**：
- `package.json` — 添加 `@tanstack/react-virtual`
- `src/features/chat/components/message-list.tsx` — 重写渲染逻辑

### 2. 优化 `applyStreamingOverlays` 避免全量映射

当前：`messages.map(m => overlay ? {...m} : m)` 遍历所有消息。

优化方案：遍历较小的 `overlays` Map，只对存在 overlay 的消息生成新对象；当 `overlays.size === 0` 时直接返回原数组引用（已有）。进一步优化：使用 `Map` + 索引查找，仅修改被覆盖的消息。

**涉及文件**：
- `src/features/chat/hooks/use-session-messages.ts`

### 3. AssistantProcessView 内部列表虚拟化

`AssistantProcessView` 对 process steps（reasoning、tool calls、answer、decision）全量渲染。一条含 20+ tool 调用的消息可产生上百 DOM 节点。

方案：在 `assistant-process-view.tsx` 中给步骤组容器添加 `content-visibility: auto` + `contain-intrinsic-size`，让浏览器跳过离屏步骤的布局/绘制。

**涉及文件**：
- `src/features/chat/components/assistant-process-view.tsx`

### 4. 优化 `buildBoundaryIndex`

当前：`useMemo` 依赖 `[messages]`，每次消息变化从数组末尾向头扫描。

方案：由于 build 边界仅在第一次 plan build 时改变一次，改用 `useRef` + 惰性计算，或提取为独立状态。

**涉及文件**：
- `src/features/chat/components/message-list.tsx`

### 5. 优化上下文 token 估算的记忆化

`estimateSessionContextUsage` 已包裹 `useMemo`，但依赖项 `displayMessages` 在流式更新时每次都是新数组引用。

方案：改用稳定 key 做依赖（如 `messages.length + editingMessageId`），流式内容变化不影响 token 估算结果。

**涉及文件**：
- `src/features/chat/views/chat-session-view.tsx`

### 6. CSS content-visibility 兜底

为每条消息的 wrapper 添加 `content-visibility: auto` + `contain-intrinsic-size`。即使虚拟滚动失效，浏览器也能自动跳过离屏消息的渲染。

**涉及文件**：
- `src/features/chat/components/message-list.tsx`

### 7. 流式传输期间跳过 IndexedDB 全量重取

活跃流式时，每 150ms 的防抖仍会触发全量 DB 读取。由于流式 UI 由内存 overlay 驱动，可以：

- 在 `useSessionData` 中感知流式状态（通过 `useActiveStreamingMessageIds`）
- 流式活跃时跳过 `subscribeDb` 回调中的 DB 重取
- 流式结束后触发一次最终刷新

**涉及文件**：
- `src/features/chat/hooks/use-session-messages.ts`

### 8. 基准测试验证

用 React DevTools Profiler 测量优化前后的渲染耗时。

- 测试数据：构造 100 条消息的 mock session
- 测量指标：
  - 流式更新时的 FPS（50+ 消息场景）
  - 快速滚动 100+ 消息的帧稳定性
  - DOM 节点数（优化前 vs 优化后）
  - 冷启动首次渲染耗时

---

## 涉及文件汇总

| 文件 | 变更内容 |
|---|---|
| `package.json` | 添加 `@tanstack/react-virtual` 依赖 |
| `src/features/chat/components/message-list.tsx` | 虚拟滚动 + `content-visibility` + 优化 `buildBoundaryIndex` |
| `src/features/chat/hooks/use-session-messages.ts` | 流式时跳过 DB 重取 + 优化 overlay 映射 |
| `src/features/chat/components/assistant-process-view.tsx` | 步骤组容器添加 `content-visibility` |
| `src/features/chat/views/chat-session-view.tsx` | 优化 `estimateSessionContextUsage` 记忆化 key |

---

## 风险与应对

| 风险 | 应对 |
|---|---|
| 动态高度虚拟滚动在流式展开时产生滚动跳动 | 使用 `scrollToIndex(align: "end")` + 流式更新后通过 ResizeObserver 重新测量行高 |
| `content-visibility: auto` 导致嵌套定位元素布局偏移 | 回归测试 tool invocation chips、thinking blocks；出问题则回退 |
| 跳过流式时 DB 重取导致跨窗口不一致 | Tauri 是单窗口应用，无此问题 |
| 虚拟化后 scroll-to-bottom 逻辑失效 | 重写滚动钉底逻辑，通过虚拟化器的 `scrollToIndex` 实现 |
