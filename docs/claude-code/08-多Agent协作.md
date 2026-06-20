# 多 Agent 协作对比：子 Agent 与编排

## Coder 多 Agent 能力

### 现状
**Coder 目前没有原生多 Agent 支持。**

现有的相关机制：
- **Handoff（会话交接）**：上下文不足时创建新会话继续任务，但这不是真正的多 Agent 协作
- **Proxy Decision**：长任务中独立模型判断是否继续，这是决策辅助而非 Agent 协作
- **Plan 模式**：独立的规划 Agent 生成计划，再由执行 Agent 实施，但两者是顺序执行

## Claude Code 多 Agent 系统

### 两种协作模式

#### Coordinator Mode（星型编排）
```
         [Coordinator]
        /       |       \
  [Worker A] [Worker B] [Worker C]
```
- Coordinator 理解需求、分配任务、综合结果
- Worker 只负责执行，不写代码/读文件以外的编排操作
- 通信通过 `SendMessage`（定向）和 `<task-notification>`（广播）

#### Agent Swarms（蜂群协作）
```
[Agent A] ←→ [共享任务列表] ←→ [Agent B]
[Agent C] ←→ [共享任务列表] ←→ [Agent D]
```
- 对等 Agent 共享任务列表，竞争认领任务
- `claimTask()` 原子操作保证只有一个 Agent 获得任务
- 任务完成自动解锁依赖任务

### Coordinator 的工具集
| 工具 | 用途 |
|------|------|
| **Agent** | 启动新 Worker（`subagent_type: "worker"`） |
| **SendMessage** | 向已有 Worker 发送后续指令 |
| **TaskStop** | 中途停止走错方向的 Worker |
| **subscribe_pr_activity** | 订阅 GitHub PR 事件 |

Coordinator **不写代码、不读文件、不执行命令**——只做三件事：理解需求、分配任务、综合结果。

### Scratchpad（共享知识库）
- Workers 可自由读写，无需权限审批
- 用于持久化的跨 Worker 知识传递
- 结构由 Coordinator 决定（无固定格式）

### `<task-notification>` 通信协议
```xml
<task-notification>
  <task-id>agent-a1b</task-id>
  <status>completed|failed|killed</status>
  <summary>Agent "Investigate auth bug" completed</summary>
  <result>Found null pointer in src/auth/validate.ts:42...</result>
  <usage>
    <total_tokens>N</total_tokens>
    <tool_uses>N</tool_uses>
    <duration_ms>N</duration_ms>
  </usage>
</task-notification>
```

### Worker 生命周期管理
```
Teammate 异常退出
  → unassignTeammateTasks()
  → 扫描任务列表，找到 owner === teammateName 的未完成任务
  → 重置为 pending + owner=undefined
  → Leader 通过 mailbox 收到通知 → 重新分配或创建新 Teammate
```

### 7 种任务类型
| 类型 | 运行位置 | 适用场景 |
|------|---------|---------|
| LocalAgentTask | 本地子进程 | 标准子 Agent |
| LocalShellTask | 本地 shell | 后台命令 |
| InProcessTeammateTask | 同进程内 | 轻量级队友 |
| RemoteAgentTask | 远程服务器 | 分布式 Agent |
| DreamTask | 后台静默 | 自主整理记忆 |
| LocalWorkflowTask | 本地 | 工作流编排 |
| MonitorMcpTask | 本地 | MCP 监控 |

### Coordinator System Prompt 核心约束
```
反模式（禁止）：
  "Based on your findings, fix the auth bug"
  → 把理解的责任推给了 Worker

正确做法：
  "Fix the null pointer in src/auth/validate.ts:42.
   The user field on Session is undefined when sessions expire..."
  → Coordinator 自己理解了问题，给出精确指令
```

## Coder 可学习的思想

### 1. 子 Agent 架构
Claude Code 的 `Agent` 工具允许主 Agent 启动子 Agent 执行独立任务。这是复杂任务分解的基础能力。

**建议**：Coder 可引入 `spawn_subagent` 工具，允许 Agent 启动独立的 Agent Loop 实例处理子任务。子 Agent 完成后将结果回传到主会话。

### 2. Coordinator 模式
对于需要集中决策的复杂任务（如"重构认证系统"），Coordinator 理解全局、分配子任务、综合结果的模式非常有效。

**建议**：Coder 可引入 `coordinator` session kind，在此模式下 Agent 只能使用编排工具（spawn_agent、send_message），不能直接操作文件。

### 3. 任务列表与竞争认领
Swarm 模式的共享任务列表 + 原子认领机制是并行执行的优雅方案。多个 Agent 自主发现并认领待处理任务。

**建议**：Coder 可引入轻量级任务队列——Agent 创建任务列表，多个子 Agent 竞争认领执行。这比 Coordinator 模式更简单，适合独立子任务的并行。

### 4. 通信协议设计
`<task-notification>` XML 格式通知 + `SendMessage` 定向通信构成灵活的 Agent 间通信机制。

**建议**：Coder 的子 Agent 通信可借鉴此模式——完成时发送结构化通知（包含摘要、使用统计），支持定向续传指令。

### 5. Worker 生命周期管理
Teammate 异常退出时自动释放任务锁，Leader 重新分配。这是分布式系统的经典故障恢复模式。

**建议**：Coder 的子 Agent 应实现类似的故障恢复——当子 Agent 异常终止时，其未完成的任务自动回到待处理队列。

### 6. Scratchpad 共享知识库
Workers 通过 Scratchpad 目录直接交换信息，无需通过 Coordinator 中转。这是一个简单但强大的协作原语。

**建议**：Coder 可为多 Agent 场景提供一个共享的临时目录（`.coder/scratchpad/`），子 Agent 可自由读写交换中间结果。

### 7. "先理解再分配"原则
Coordinator System Prompt 明确要求 Coordinator 必须先理解 Worker 的结果，再给出精确指令。这是避免"懒惰委派"的关键设计。

**建议**：Coder 的 Proxy Decision 机制可扩展为此原则的实现——在继续之前要求 Agent 证明它理解了当前状态。

### 8. 渐进式实现策略
多 Agent 是复杂功能，建议分阶段实现：

**Phase 1**（基础子 Agent）：
- `spawn_subagent` 工具：启动独立 Agent Loop
- 子 Agent 完成后返回结构化结果
- 无并发支持（串行等待子 Agent 完成）

**Phase 2**（并行子 Agent）：
- 同时启动多个子 Agent
- 共享任务队列 + 原子认领
- 故障恢复（任务释放与重新分配）

**Phase 3**（高级编排）：
- Coordinator 模式（专用编排 Agent）
- SendMessage 定向通信
- Scratchpad 共享知识库
