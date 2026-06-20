# Agent Loop 对比：智能体循环核心机制

## Coder Agent Loop

### 实现位置
`src/features/agent/agent-loop.ts` — `runAgentWithTools()`

### 循环结构
```typescript
while (true) {
  // 1. 检查取消信号
  throwIfAborted(context.signal, input.taskId);
  
  // 2. 上下文交接检测（token 预算检查）
  const handoffUsage = shouldTriggerContextHandoff({...});
  if (handoffUsage) { /* 触发交接，返回 */ }
  
  // 3. 执行单轮 Agent Turn（带重试）
  const turn = await runSingleAgentTurn(input, signal, onEvent);
  
  // 4. 无工具调用 → 判断是否需要 Proxy Decision
  if (turn.toolCalls.length === 0) {
    if (isLongTaskSession(...)) {
      // 调用决策代理，决定是否继续
      const decision = await requestProxyDecision({...});
      if (decision.outcome === "continue") { continue; }
    }
    // 完成
    return;
  }
  
  // 5. 工具调用停滞检测
  if (stallDetector.record(turn.toolCalls)) { throw stallError; }
  
  // 6. 执行工具，追加结果到消息
  messages = await appendToolResults(messages, turn, context, onEvent);
}
```

### 特点
- **串行工具执行**：工具按顺序逐个执行（`for (const call of turn.toolCalls)`）
- **Proxy Decision**：长任务会话中，AI 给出最终答案后调用决策代理决定是否继续
- **Chat Retry**：流空闲超时 + 可重试错误的自动恢复机制
- **Tool Call Stall**：检测 AI 重复调用相同工具的停滞行为
- **Handoff**：上下文预算不足时生成交接文档并创建新会话

## Claude Code Agentic Loop

### 实现位置
`src/query.ts` — `queryLoop()` 异步生成器

### 循环结构
```
while (true) {
  // 阶段1: 上下文预处理管道（5步串行）
  messages → applyToolResultBudget() → snipCompact() → microcompact() 
            → applyCollapsesIfNeeded() → autocompact()
  
  // 阶段2: 流式 API 调用
  deps.callModel() → AsyncGenerator<StreamEvent>
  - 收集 assistantMessages[]、toolUseBlocks[]
  - StreamingToolExecutor 并行执行工具（不等流结束）
  
  // 阶段3: 工具执行
  streamingToolExecutor.getRemainingResults() OR runTools(...)
  
  // 阶段4: 终止/继续判定
  needsFollowUp ? continue : return { reason }
}
```

### 特点
- **7 种终止条件**：completed / blocking_limit / aborted_streaming / model_error / prompt_too_long / image_error / stop_hook_prevented
- **4 种恢复路径**：正常循环 / max_output_tokens 恢复 / PTL 恢复 / Stop Hook 阻塞重试
- **模型降级**：主模型不可用时自动切换到 fallback 模型
- **并行工具执行**：`StreamingToolExecutor` 在流式过程中就开始执行已确定的工具
- **Token Budget**（实验性）：检测收益递减提前终止

## 对比分析

| 维度 | Coder | Claude Code |
|------|-------|-------------|
| **循环模式** | async function + while(true) | AsyncGenerator + yield |
| **工具执行** | 串行（逐个等待） | 并行（流式过程中就开始） |
| **上下文压缩** | Handoff（交接新会话） | 三层压缩（MicroCompact/SM/API摘要） |
| **错误恢复** | Chat Retry（最多3次） | 4种恢复路径 + 模型降级 |
| **停滞检测** | ToolCallStallDetector | Denial Tracking + Token Budget |
| **终止条件** | 无工具调用 + Handoff | 7种明确终止条件 |
| **长任务决策** | Proxy Decision（独立模型判断） | Token Budget + Stop Hook |

## Coder 可学习的思想

### 1. 并行工具执行
Claude Code 的 `StreamingToolExecutor` 在流式传输过程中就开始执行已确定的工具调用，不等整个流结束。这可以显著减少长任务的总耗时。

**建议**：Coder 可以在收到 `tool_call_pending` 事件后，对于独立性工具（如 read_file、glob）提前执行，而非等待整个 turn 完成。

### 2. 分层上下文压缩
Claude Code 的三层压缩策略（MicroCompact → Session Memory → API 摘要）比 Coder 的 Handoff 更精细：
- MicroCompact 清除旧工具输出（无 API 调用）
- Session Memory 利用已有摘要（无 API 调用）
- API 摘要是最后手段

**建议**：Coder 可引入 MicroCompact 级别的局部压缩，在触发 Handoff 前先尝试清除旧工具结果，延长当前会话寿命。

### 3. 更丰富的错误恢复
Claude Code 的 max_output_tokens 恢复（提升 token 上限后重试）、PTL 恢复（Reactive Compact → Truncate Retry）是成熟的容错机制。

**建议**：Coder 的 Chat Retry 可以扩展为针对特定错误类型的恢复策略，而非通用重试。

### 4. 工具结果预算控制
Claude Code 通过 `maxResultSizeChars` 限制每个工具的输出大小，超出部分持久化到磁盘文件。这防止大输出占用上下文空间。

**建议**：Coder 的工具执行器应增加输出截断机制，对 glob/grep/shell 等可能产生大量输出的工具设置合理上限。

### 5. 状态机设计
Claude Code 的 `State` 对象在迭代间传递，包含 autoCompactTracking、maxOutputTokensRecoveryCount 等有状态字段。Coder 的循环是无状态的（仅通过 messages 数组传递信息）。

**建议**：Coder 可引入类似 State 对象跟踪压缩历史、重试计数等跨迭代状态。

### 6. AsyncGenerator 模式
Claude Code 使用 AsyncGenerator + yield 产出事件，天然支持消费方按需拉取。Coder 用回调函数 `onEvent` 推送事件。

**建议**：考虑将 Agent Loop 改为 AsyncGenerator，让消费方（UI）可以控制消费速率，便于实现虚拟化和暂停恢复。
