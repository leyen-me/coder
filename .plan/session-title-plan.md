# Session 标题即时生成方案

## 目标

把 session title 的生成时机从「等 assistant 第一轮跑完」改为「用户一发消息就触发」，避免 agent 长时间运行时侧边栏一直显示「新对话」。

## 当前问题

- 现在 title 要在 `event.status === "completed" && task.isFirstTurn` 时才触发
- 调 LLM 时需要 user message + assistant reply，必须等 assistant 跑完
- agent 可能跑很久（工具调用、思考），期间标题一直是空的

## 新方案

用户发送第一条消息时，**同步 + 异步两层策略**：

1. **同步兜底**：立即用 `deriveSessionTitle(userMessage)` 截取 prompt 前 48 字符作为标题写入数据库，用户发完消息侧边栏立刻有显示
2. **异步优化**：同时 Fire-and-forget 调 LLM（**只传 user message，不等 assistant reply**），如果成功返回，覆盖为更智能的标题

这样既快又好——即时可见，最终标题也智能。

## 执行步骤

### 1. 调整 generate-session-title.ts

不删除这个文件，而是**改造**它：

- **`requestSessionTitle`**：改为只接收 userMessage，不再需要 assistantMessage 参数
- **`applyGeneratedSessionTitle`**：不再需要 `assistantMessageId` 参数，调用 `requestSessionTitle` 时只传 user message
- **保留** `normalizeSessionTitle`、`parseTitleFromCompletionBody` 等辅助函数
- **保留** system prompt，user prompt 简化为只用 user message 概括 session

新的 user prompt 示例：
```
Summarize this chat session based on the user's first message:

{userMessage}
```

### 2. 修改 agent-store.tsx

- **删除** assistant 完成事件中的 `shouldGenerateTitle` / `titleInput` / `scheduleSessionTitleGeneration` 逻辑（550行附近）
- **删除** 原来的 `scheduleSessionTitleGeneration` 函数
- **新增**：在用户发送首条消息的代码路径中（1088行/1108行附近），当 `isFirstTurn` 为 true 时：
  1. 同步调用 `updateSessionTitle(input.sessionId, deriveSessionTitle(trimmed))`
  2. 异步 Fire-and-forget 调用新的 `applyGeneratedSessionTitle`（只传 userMessage）

### 3. 保留 session-title-store.ts

不删除，因为 `applyGeneratedSessionTitle` 仍然需要 `markSessionTitleGenerating` / `clearSessionTitleGenerating` 来告知 UI 标题正在优化中。

### 4. 更新 generate-session-title.test.ts

更新测试，去掉已删除的参数，保持 `normalizeSessionTitle` 和 `parseTitleFromCompletionBody` 的测试。

### 5. 验证

- `tsc --noEmit` 无类型错误
- `npx vitest run` 测试通过
- 手动测试：新开对话 → 发消息 → 侧边栏立即显示截断标题 → 几秒后更新为 LLM 生成的智能标题

## 涉及文件

| 文件 | 操作 |
|------|------|
| `src/features/agent/generate-session-title.ts` | 改造 |
| `src/features/agent/generate-session-title.test.ts` | 更新 |
| `src/features/agent/store/agent-store.tsx` | 修改 |
| `src/features/agent/session-title-store.ts` | 保留不变 |
| `src/features/chat/components/app-sidebar.tsx` | 不变（仍需要 useGeneratingSessionTitles） |
| `src/features/chat/hooks/use-session-title-bar-slots.tsx` | 不变 |
| `src/features/chat/components/chat-history-list.tsx` | 不变 |
| `src/features/chat/components/session-title-label.tsx` | 不变 |

## 风险

- 需要确认 `applyGeneratedSessionTitle` 的调用方（agent-store.tsx 里的 handoff 等路径）是否需要同步更新参数类型
- LLM 调用是 fire-and-forget，失败不影响用户体验（因为同步兜底已经设置好了）
