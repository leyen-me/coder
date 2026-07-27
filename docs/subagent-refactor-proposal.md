# SubAgent 架构重构方案 (v2 - 用户决策后)

> 状态: **已确认方案 - 待实施**
> 阶段: 调研与设计完成, 未做任何代码修改
> 日期: 2026-07-27

---

## 1. 目标与决策

### 1.1 重构目标

将 **SubAgent** 重构为与普通 **Session** 完全一致, 仅展示方式不同:

- SubAgent 本质上就是一个普通 Session (创建独立 SessionRecord)
- SubAgent 不在侧边栏展示, 也不允许搜索命中
- 前端只显示一个带加载状态的 Label (转圈 + 标题), 不再支持内联展开
- 点击 Label 后, 根据 `sessionId` 在 **顶部 Tab 栏** 打开子 session 详情页
- 创建 SubAgent = 创建普通 Session + 发 User Message + 启动执行, 复用普通 Session 能力

### 1.2 用户决策汇总

| 编号 | 决策点 | 用户决策 |
|------|--------|---------|
| Q1 | Tab 形式 | **顶部 Tab 栏** (参考 codex/claude/code) |
| Q2 | await_subagent 返回信息 | **仅返回子 session 最后一条 assistant message 作为摘要**, 不返回 steps 等过程信息 (主 agent 只关心结果) |
| Q3 | 子 session 标题策略 | **复用主 session 的标题逻辑** (`derive_session_title`), 不做任何特殊化 |
| Q4 | 旧数据兼容 | 降级显示"历史 SubAgent 记录 (无法展开)", 不报错 |
| Q5 | 是否允许搜索 | **不允许** — 侧边栏和搜索框都过滤 `parentSessionId != null` |
| Q6 | 嵌套逻辑 | **不提供 spawn_subagent / await_subagent 给子 agent** → 结构上不可能嵌套, `MAX_SUBAGENT_DEPTH` 检测整段删除 |
| Q7 | 实施顺序 | **分阶段** P0 → P1 → P2 |
| Q8 | 与 Automation 关系 | **合二为一** — 提取公共入口, Automation + SubAgent 共享底层机制, 长期只维护一份代码 |
| Q9 | 取消通信 | await_subagent 用 `select!` 同时监听子 Done 事件 + 父 cancel_token; 父取消时级联取消所有子 session |

### 1.3 本阶段约束

- **不修改任何代码, 不生成补丁**
- 待用户确认本 v2 方案后开始 P0 实施

---

## 2. 现状速览

### 2.1 当前 SubAgent (将被替换)

| 维度 | 现状 |
|------|------|
| 数据模型 | **不创建独立 SessionRecord**, 子 agent 继承父 session_id |
| 执行 | `execute_spawn_subagent` 内 `std::thread::spawn` + 新 tokio runtime + `run_agent_loop` |
| 消息存储 | 子 agent 消息**不落 DB**, 被 `collect_subagent_event` 压缩为 `steps[]` |
| 落库位置 | 作为 `spawn_subagent` 工具调用的 `output.__progress`, 写入父 assistant message 的 `tool_invocations` |
| 前端展示 | `SubAgentToolOutput` 内联可折叠展开 (时间线渲染) |
| `parent_session_id` | 字段已预留但**从未启用** (前后端均无 `Some(...)` 赋值) |

### 2.2 Automation 现状 (将部分复用)

`runner.rs:42-114` 通过三步完成"创建子 session + 发 user message + 启动 agent loop":

```
new_session_id() + put_session(SessionRecord{...})
  → start_agent_send_with_task_id(state, AgentSendParams{...}, task_id)  // routes_tool.rs:1235
    → agent::agent_start(...)  // mod.rs:98
```

`start_agent_send_with_task_id` 和 `agent::agent_start` 都接受 `Arc<AppState>` 作为参数, **没有任何 HTTP 上下文耦合**, 已经满足被任意 Rust 模块调用的前提。

### 2.3 关键代码位置

**后端 (Rust)**

| 关注点 | 路径 |
|--------|------|
| `SessionRecord` (含预留 `parent_session_id` 字段) | `backend/src/db/records.rs:28-47` (第 40 行) |
| `execute_spawn_subagent` 主体 (将被重写) | `backend/src/agent/tool_dispatch.rs:2586-2935` |
| `execute_await_subagent` (将被改写) | `backend/src/agent/tool_dispatch.rs:2937-2975` |
| `SpawnSubAgentArgs` / `AwaitSubAgentArgs` | `backend/src/agent/tool_dispatch.rs:2186-2196` |
| `SpawnedAgent` / `ConcurrentAgentStore` | `backend/src/agent/tool_dispatch.rs:48-156` |
| `MAX_SUBAGENT_DEPTH = 3` (将被删除) | `backend/src/agent/tool_dispatch.rs:2198` |
| `collect_subagent_event` (将被删除) | `backend/src/agent/tool_dispatch.rs:2977-3094` |
| `build_subagent_summary` (将被删除) | `backend/src/agent/tool_dispatch.rs:3269-3318` |
| `subagent_context_depth` (将被删除) | `backend/src/agent/tool_dispatch.rs:3232-3237` |
| `start_agent_send_with_task_id` (复用) | `backend/src/http/routes_tool.rs:1235-1401` |
| `agent::agent_start` (复用) | `backend/src/agent/mod.rs:98-108` |
| `new_session_id` / `put_session` / `get_session` | `backend/src/db/session_store.rs:11-13, 56-64` |
| `derive_session_title` (复用) | `backend/src/db/session_store.rs` (Automation 在用) |
| sessions store 索引 (需新增 by-parentSessionId) | `backend/src/db/session_store.rs:23-28` |
| `ToolExecutionContext` (含 `concurrent_agents`, `parent_start_params`, `cancel_token`) | `backend/src/agent/loop_.rs:700-722` |
| Automation runner (将部分重构以接入公共入口) | `backend/src/scheduled_jobs/runner.rs:42-114` |
| Automation 取消路径 (`agent_cancel` + `shell_kill_by_task`) | `backend/src/http/routes_scheduled_jobs.rs:159-161` |

**前端 (React/TypeScript)**

| 关注点 | 路径 |
|--------|------|
| `SessionRecord.parentSessionId` (将启用) | `frontend/src/lib/db/types.ts:50` |
| `SubAgentToolOutput` 组件 (将被删除) | `frontend/src/features/chat/components/sub-agent-tool-output.tsx` |
| `spawn-subagent-display.ts` (将被删除) | `frontend/src/features/agent/tools/spawn-subagent-display.ts` |
| `tool-invocation-chip.tsx` isSubAgentTool 分支 (将替换为 Label) | `frontend/src/features/chat/components/tool-invocation-chip.tsx:142, 186, 366-371` |
| `useChatSessions` hook (将加过滤) | `frontend/src/features/chat/hooks/use-chat-sessions.ts` |
| session db 操作 (将加索引 + 过滤) | `frontend/src/lib/db/sessions.ts` |
| agent store (将简化 `tool_call_finished` 处理) | `frontend/src/features/agent/store/agent-store.tsx:410-429` |
| 侧边栏 (将加过滤) | `frontend/src/features/chat/components/app-sidebar.tsx` + `chat-history-list.tsx` |
| `SubAgentStep` 类型 + `spawnSubAgentConfig` 死字段 (将清理) | `frontend/src/features/agent/tools/types.ts:307-358` |

---

## 3. 推荐架构方案

### 3.1 统一入口设计 (响应 Q8 - 合二为一)

**核心思路**: 提取一个公共函数 `spawn_session`, 让 Automation 和 SubAgent 共享同一套"创建 session + 发消息 + 启动执行"逻辑。长期只维护这一份代码, 主 agent / Automation / SubAgent 三者都基于它。

#### 3.1.1 新增公共入口

**新文件**: `backend/src/agent/spawn.rs`

```rust
pub struct SpawnSessionOptions {
    pub parent_session_id: Option<String>,    // None = 顶层 session, Some = 子 session
    pub title: Option<String>,                // None = 自动派生 (derive_session_title)
    pub task: String,                          // User message 内容
    pub model: String,
    pub provider: String,
    pub workspace_dir: Option<String>,
    pub base_url: String,
    pub api_key: String,
    pub api_key_source: Option<String>,
    pub api_key_env_var: Option<String>,
    pub request_extensions: Option<...>,
    pub max_context_tokens: Option<u64>,
    pub agent_mode: Option<String>,           // "agent" | "ask"
    pub thinking_enabled: Option<bool>,
    pub extra_tools: Option<Vec<String>>,     // SubAgent 用来排除 spawn_subagent 自身
    pub autonomy_mode: Option<String>,
    pub decision_policy_version: Option<String>,
    pub decision_model: Option<String>,
}

pub struct SpawnSessionResult {
    pub session_id: String,
    pub task_id: String,
}

pub async fn spawn_session(
    state: Arc<AppState>,
    opts: SpawnSessionOptions,
) -> Result<SpawnSessionResult, SpawnError> {
    // 1. 生成 session_id + task_id
    let session_id = new_session_id();
    let task_id = uuid::Uuid::new_v4().to_string();

    // 2. 构造 SessionRecord (复用 derive_session_title, 与主 session 一致)
    let title = opts.title.unwrap_or_else(|| derive_session_title(&opts.task, 48));
    let session = SessionRecord {
        id: session_id.clone(),
        title,
        model: opts.model,
        provider: opts.provider,
        workspace_dir: opts.workspace_dir,
        session_kind: "standard",
        autonomy_mode: opts.autonomy_mode.unwrap_or_else(|| "interactive".to_string()),
        decision_policy_version: opts.decision_policy_version.unwrap_or_else(|| "mvp-v1".to_string()),
        decision_model: opts.decision_model,
        parent_session_id: opts.parent_session_id,  // ← 关键: SubAgent 传 Some, Automation 传 None
        plan_file_name: None,
        plan_built_at: None,
        context_usage_snapshot: None,
        pinned_at: None,
        created_at: current_timestamp_ms(),
        updated_at: current_timestamp_ms(),
    };

    // 3. 写库
    {
        let db = state.db.lock()?;
        put_session(&db, &session)?;
    }

    // 4. 发 user message + 启动 agent loop (复用现有入口)
    start_agent_send_with_task_id(
        state.clone(),
        AgentSendParams {
            session_id: session_id.clone(),
            content: opts.task,
            images: None,
            edit_message_id: None,
            referenced_skills: None,
            base_url: opts.base_url,
            api_key: opts.api_key,
            api_key_source: opts.api_key_source,
            api_key_env_var: opts.api_key_env_var,
            model: opts.model,
            request_extensions: opts.request_extensions,
            max_context_tokens: opts.max_context_tokens,
            compact_trigger_threshold: None,
            agent_mode: opts.agent_mode,
            thinking_enabled: opts.thinking_enabled,
            models: None,
            extra_tools: opts.extra_tools,
        },
        task_id.clone(),
    ).await?;

    Ok(SpawnSessionResult { session_id, task_id })
}
```

#### 3.1.2 Automation 接入 (替换 runner.rs:42-114)

Automation 当前手工 `new SessionRecord` + `put_session` + `start_agent_send_with_task_id`, 改为:

```rust
// runner.rs (重构后)
let result = agent::spawn::spawn_session(state.clone(), SpawnSessionOptions {
    parent_session_id: None,
    title: Some(derive_automation_session_title(&job, 48)),  // 保留"自动化 · "前缀
    task: job.prompt.clone(),
    model: job.model.clone(),
    provider: runtime.provider.clone(),
    workspace_dir,
    base_url: runtime.base_url,
    api_key: runtime.api_key,
    ...
    extra_tools: None,
    ...
}).await?;
```

> **注意**: Automation 保留 title 前缀 "自动化 · " 是合理的 (它需要肉眼区分来源), 这不是"特殊化"而是"业务标识"。SubAgent 不加前缀, 直接用 `derive_session_title(task)`, 与主 session 完全一致 (响应 Q3)。

#### 3.1.3 SubAgent 接入 (替换 execute_spawn_subagent)

```rust
// tool_dispatch.rs execute_spawn_subagent 重写后
let result = agent::spawn::spawn_session(ctx.app_state.clone(), SpawnSessionOptions {
    parent_session_id: Some(ctx.session_id.clone()),  // ← 关键: 建立父子关系
    title: None,  // 自动派生, 与主 session 一致
    task: args.task.clone(),
    model: ctx.parent_start_params.model.clone(),
    provider: ctx.parent_start_params.provider.clone(),
    workspace_dir: ctx.parent_start_params.workspace_dir.clone(),
    base_url: ...,  // 从父 runtime 继承
    api_key: ...,
    ...
    extra_tools: Some(allowed_tools),  // 已排除 spawn_subagent + await_subagent
    agent_mode: Some("agent".to_string()),
    thinking_enabled: ...,
}).await?;

// 注册到 ConcurrentAgentStore (用于管理并发和取消)
ctx.concurrent_agents
    .register(handle.clone(), args.task.clone(), result.session_id.clone(), result.task_id.clone())
    .await?;

// 立即返回 handleId + sessionId
Ok(ToolResultEnvelope {
    output: json!({
        "handleId": handle,
        "sessionId": result.session_id,
        "status": "running"
    }),
    ...
})
```

#### 3.1.4 统一入口的红利

| 维护点 | 之前 | 重构后 |
|--------|------|--------|
| 创建 session 逻辑 | Automation 独有 + SubAgent 独有 + 前端 IndexedDB | `agent::spawn::spawn_session` 一处 |
| 发消息 + 启动 agent loop | `start_agent_send_with_task_id` (已共享) | 同上 |
| 取消逻辑 | Automation 独有 + SubAgent 独有 | 见 §3.4 统一取消通信 |
| 标题派生 | Automation 独有 (`derive_automation_session_title`) + SubAgent 独有 | 主用 `derive_session_title`, Automation 保留前缀包装 |

### 3.2 后端改造方案

#### 3.2.1 `execute_spawn_subagent` 重写 (tool_dispatch.rs:2586-2935)

**保留**:
- 工具签名 `spawn_subagent(task, context?, tools?)` 不变 (LLM 行为兼容)
- 工具白名单过滤 (排除 `spawn_subagent` 自身 **+ `await_subagent`**, 响应 Q6)
- `build_subagent_system_prompt` (子 agent 仍需独立 system prompt)
- `ConcurrentAgentStore` (仍需管理并发、注册 handle、cancel_all)
- 立即返回 `handleId` 的非阻塞语义
- 返回值新增 `sessionId` 字段

**移除** (响应 Q2 + Q6):
- `MAX_SUBAGENT_DEPTH = 3` 与 `subagent_context_depth` 函数 (Q6 不允许嵌套, 结构上不可能)
- `collect_subagent_event` (不再压缩事件)
- `build_subagent_summary` (不再生成摘要, Q2 直接读最后一条 assistant message)
- `extract_subagent_tool_label`
- 进度回写父 message 的 emit_progress 闭包 (`tool_dispatch.rs:2721-2805`)
- 最终结果写回父 message (`tool_dispatch.rs:2870-2914`)
- `std::thread::spawn` + 新 tokio runtime (改用 `spawn_session` 内部的 `agent_start`, 它本身就是后台 task)

#### 3.2.2 `execute_await_subagent` 改写 (tool_dispatch.rs:2937-2975)

**响应 Q2 + Q9**:

```rust
async fn execute_await_subagent(args, ctx) -> Result<ToolResultEnvelope, String> {
    let handle_ids: Vec<String> = args.handle_ids;
    let mut results = Vec::new();

    for handle_id in handle_ids {
        let (child_session_id, child_task_id) = ctx.concurrent_agents
            .get_session_and_task(&handle_id)
            .await
            .ok_or("handle not found")?;

        // 关键: 用 select! 同时监听两个取消来源 (Q9)
        let outcome = tokio::select! {
            // 来源 1: 子 session 自然结束或被用户手动停 (子 task_id Done 事件)
            done = wait_for_child_done(&ctx.app_state.sse_broadcaster, &child_task_id) => {
                let status = match done.event_kind {
                    AgentEventKind::Done => "completed",
                    AgentEventKind::Cancelled => "cancelled",
                    AgentEventKind::Error => "error",
                    _ => "completed",
                };
                // Q2: 读取子 session 最后一条 assistant message 作为摘要
                let last_msg = get_last_assistant_message(&ctx.app_state.db, &child_session_id).await?;
                AwaitOutcome { session_id: child_session_id, status, summary: last_msg.map(|m| m.content) }
            }
            // 来源 2: 父 cancel_token 触发 (用户停止父 session)
            _ = ctx.cancel_token.cancelled() => {
                // 级联取消所有子 session (见 §3.4)
                cancel_all_child_sessions(&ctx.app_state, &ctx.session_id).await;
                AwaitOutcome { session_id: child_session_id, status: "cancelled", summary: None }
            }
        };
        results.push(outcome);
    }

    Ok(ToolResultEnvelope {
        output: json!({ "results": results }),
        ...
    })
}
```

#### 3.2.3 sessions store 加索引 (session_store.rs:23-28)

新增 `by-parentSessionId` 索引以支持:
- 侧边栏过滤 (前端 list 接口可以查询时过滤)
- 父取消时级联查找子 session (§3.4)
- 子 session 完成时通知父 session 的 await_subagent (可选优化)

#### 3.2.4 `ConcurrentAgentStore` 调整 (tool_dispatch.rs:48-156)

`SpawnedAgent` 结构调整:

```rust
// 旧
struct SpawnedAgent {
    handle_id: String,
    task: String,
    join_handle: JoinHandle<()>,    // ← 删除 (不再用 thread::spawn)
    cancel_token: CancellationToken,  // ← 删除 (改用 agent_cancel)
}

// 新
struct SpawnedAgent {
    handle_id: String,
    task: String,
    session_id: String,             // ← 新增 (用于 await_subagent 读取摘要)
    task_id: String,                // ← 新增 (用于订阅 SSE Done 事件)
}
```

`register` / `take_result` / `cancel_all` 签名相应调整。`cancel_all` 改为遍历所有子 session 调用 `agent_cancel` (而不是 cancel_token 触发)。

### 3.3 前端改造方案

#### 3.3.1 顶部 Tab 栏 (Q1)

**新增**: `frontend/src/features/chat/components/session-tabs.tsx`

设计要点:
- 顶部水平 Tab 栏, 紧贴主聊天区上方 (参考 codex/claude/code)
- 每个 Tab 显示: session 标题 + 状态指示器 (running 转圈 / idle 静止 / error 红点) + 关闭按钮
- 状态: `openTabs: SessionTab[]` (sessionId + title + status + isSubAgent)
- 点击 Tab → 切换主聊天区显示对应 session 内容
- 关闭 Tab → 仅从 `openTabs` 移除, 不删除 session 数据
- 关闭父 session Tab → 提示"将同时关闭 N 个子 agent Tab" (与 Q9 级联取消呼应)
- 最大 Tab 数限制 (建议 8-10, 防止 Tab 栏溢出)

**与侧边栏联动**:
- 点击侧边栏 session → 在当前 Tab 打开 (替换内容), 不新开 Tab
- 点击 Label → 新开 Tab

#### 3.3.2 Label 组件 (新增)

**新增**: `frontend/src/features/chat/components/sub-agent-label.tsx`

```tsx
interface SubAgentLabelProps {
  task: string;
  sessionId: string;
  status: "running" | "completed" | "error" | "cancelled";
  onOpen: (sessionId: string) => void;
}

// 渲染: [spinner / ✓ / ✗] task 文本预览 (前 40 字)
// 点击: onOpen(sessionId) → 在 Tab 栏新开 Tab
```

`tool-invocation-chip.tsx:366-371` 的 `isSubAgentTool` 分支替换为渲染 `<SubAgentLabel />` 而非 `<SubAgentToolOutput />`。

#### 3.3.3 侧边栏 + 搜索过滤 (Q5)

`use-chat-sessions.ts` 中 `listSessions()` 改为按 `parentSessionId` 过滤:

```typescript
const sessions = await db.getAllFromIndex(SESSIONS_STORE, 'by-updatedAt');
return sessions.filter(s => !s.parentSessionId);  // 顶层 session 才显示
```

同时确保搜索框 (`chat-history-list.tsx` 的搜索逻辑) 也基于这个过滤后的列表, **SubAgent 永远不可被搜索命中**。

#### 3.3.4 SSE 订阅调整

`agent-store.tsx:410-429` 的 `tool_call_finished` 处理简化:

- **旧**: 解析 `event.output.__progress.steps[]` 写入 `toolInvocations[].output`
- **新**: 工具 output 为 `{ handleId, sessionId, status }`, 直接写入 `toolInvocations[].output`, Label 据此渲染
- 子 session 自己的 SSE 流由子 session 详情页 (Tab 内) 订阅, 复用现有 session 详情页机制, 无需额外开发

#### 3.3.5 降级渲染 (Q4)

在 Label 组件中检测旧格式 output:

```tsx
if (invocation.output?.__progress) {
  // 旧格式: 显示降级提示, 不报错
  return <span className="text-muted">历史 SubAgent 记录 (无法展开)</span>;
}
// 新格式: 渲染 Label
return <SubAgentLabel ... />;
```

#### 3.3.6 可清理代码

| 可清理项 | 路径 |
|---------|------|
| `SubAgentToolOutput` 组件 | `frontend/src/features/chat/components/sub-agent-tool-output.tsx` (整文件删除) |
| `extractSubAgentOutput` / `getSubAgentChipLabel` | `frontend/src/features/agent/tools/spawn-subagent-display.ts` (整文件删除) |
| `SubAgentStep` 类型 | `frontend/src/features/agent/tools/types.ts:327-358` 中 `SubAgentStep` 可移除 |
| `ToolExecutionContext.spawnSubAgentConfig` (死字段) | `frontend/src/features/agent/tools/types.ts:307-319` |

### 3.4 取消通信设计 (响应 Q9)

#### 3.4.1 两种取消来源

| 来源 | 触发 | 处理 |
|------|------|------|
| 用户手停子 agent | 子 session Tab 上的 stop 按钮 → `agent_cancel(child_session_id)` | 子 agent loop 退出, emit Done(cancelled); await_subagent 的 select! 收到 Done, 返回 `status=cancelled` + 最后一条 assistant message (可能为空) |
| 用户停父 agent | 父 session Tab 上的 stop 按钮 → `agent_cancel(parent_session_id)` | **必须级联**: 遍历 `by-parentSessionId` 找所有直接子 session, 对每个调用 `agent_cancel` (递归取消孙 session, 但 Q6 不允许嵌套, 实际只有一层) |

#### 3.4.2 级联取消实现

**新增**: `backend/src/agent/cancel.rs` (或加到 `spawn.rs`)

```rust
pub async fn cancel_session_and_children(
    state: &Arc<AppState>,
    session_id: &str,
) -> Result<(), String> {
    // 1. 取消当前 session 的活动 task
    agent::agent_cancel(&state.agent_registry, session_id).await?;
    shell_kill_by_task(state, session_id).await?;

    // 2. 查询所有直接子 session
    let children = list_sessions_by_parent(&state.db, session_id)?;

    // 3. 递归取消每个子 session (Q6 不允许嵌套, 实际只有一层, 但保留递归语义以备未来)
    for child in children {
        Box::pin(cancel_session_and_children(state, &child.id)).await?;
    }
    Ok(())
}
```

**Automation 接入**: Automation 的取消路径 (`routes_scheduled_jobs.rs:159-161`) 也改为调用 `cancel_session_and_children`, 与 SubAgent 共用 (响应 Q8 合二为一)。Automation 当前没有子 session, 但调用同一个函数保证未来一致。

#### 3.4.3 await_subagent 的 select! 语义

```rust
tokio::select! {
    // 分支 A: 子 session Done (自然完成 / 用户手停子)
    done = wait_for_child_done(...) => { ... }
    // 分支 B: 父 cancel_token (用户停父)
    _ = ctx.cancel_token.cancelled() => {
        cancel_all_child_sessions(state, parent_session_id).await;
        // 返回 cancelled, 不读子 message (可能正在写入, 不安全)
    }
}
```

**关键细节**:
- 分支 B 触发后, 必须先级联取消子 session, 再让 await_subagent 返回。否则父 agent loop 退出, 但子 session 可能还在跑 (独立 session), 造成孤儿任务。
- 分支 A 的"用户手停子"场景: await_subagent 返回 `cancelled` + 子最后一条 assistant message (可能为部分结果), 主 agent 据此决定后续 (例如重试或换方案)。
- 分支 A 的"自然完成"场景: await_subagent 返回 `completed` + 子最后一条 assistant message (完整结果)。
- 如果父 agent 没有调用 await_subagent 就直接结束 (LLM 主动停止响应), 子 session **继续独立运行** (用户可在 Tab 查看), 不强制取消。这是合理的: 子 session 是独立 session, 可以独立完成。

---

## 4. 受影响模块清单

### 4.1 后端 (Rust)

| 模块 | 改动类型 | 影响 |
|------|---------|------|
| `backend/src/agent/spawn.rs` | **新增** | 公共 `spawn_session` 入口 (Q8 合二为一) |
| `backend/src/agent/cancel.rs` | **新增** | 公共 `cancel_session_and_children` (Q8 + Q9) |
| `backend/src/agent/tool_dispatch.rs` (核心) | **大改** | `execute_spawn_subagent` 重写, `execute_await_subagent` 改写, 移除 4 个辅助函数 + MAX_SUBAGENT_DEPTH |
| `backend/src/db/records.rs` | 不变 | `parent_session_id` 字段已存在, 仅启用 |
| `backend/src/db/session_store.rs` | **小改** | 新增 `by-parentSessionId` 索引 + `list_sessions_by_parent` 查询函数 |
| `backend/src/agent/loop_.rs` | 小改 | `ToolExecutionContext` 中 `concurrent_agents` / `parent_start_params` 字段语义微调 |
| `backend/src/agent/mod.rs` | 不变 | `agent_start` 直接复用, 可能需要 `pub use` 导出 spawn / cancel 模块 |
| `backend/src/http/routes_tool.rs` | 不变 | `start_agent_send_with_task_id` 直接复用 |
| `backend/src/scheduled_jobs/runner.rs` | **中改** | 改为调用 `agent::spawn::spawn_session` (Q8 Automation 接入公共入口) |
| `backend/src/http/routes_scheduled_jobs.rs` | 小改 | 取消路径改为调用 `cancel_session_and_children` |

### 4.2 前端 (React/TypeScript)

| 模块 | 改动类型 | 影响 |
|------|---------|------|
| `frontend/src/features/chat/components/session-tabs.tsx` | **新增** | 顶部 Tab 栏容器 (Q1) |
| `frontend/src/features/chat/components/sub-agent-label.tsx` | **新增** | Label 组件 + 降级渲染 (Q4) |
| `frontend/src/features/chat/components/sub-agent-tool-output.tsx` | **删除** | 整文件移除 |
| `frontend/src/features/agent/tools/spawn-subagent-display.ts` | **删除** | 整文件移除 |
| `frontend/src/features/chat/components/tool-invocation-chip.tsx` | 小改 | isSubAgentTool 分支替换组件 + 降级渲染分支 |
| `frontend/src/features/chat/components/app-sidebar.tsx` + `chat-history-list.tsx` | 小改 | 过滤 + Tab 联动 |
| `frontend/src/features/chat/hooks/use-chat-sessions.ts` | 小改 | 过滤 `parentSessionId != null` (Q5) |
| `frontend/src/lib/db/sessions.ts` + IndexedDB schema | 小改 | 新增 `by-parentSessionId` 索引 |
| `frontend/src/features/agent/store/agent-store.tsx` | 小改 | 简化 `tool_call_finished` 处理 + 新增 Tab 状态管理 |
| `frontend/src/features/agent/tools/types.ts` | 小改 | 类型清理 (`SubAgentStep` + `spawnSubAgentConfig`) |
| `frontend/src/features/agent/tools/definitions.ts` | 不变 | 工具定义不变 |

### 4.3 类型/API 兼容性

- `spawn_subagent` / `await_subagent` 工具**对外签名不变**, LLM 行为完全兼容
- 工具 output 结构变化:
  - `spawn_subagent`: `{ __progress, steps[], summary }` → `{ handleId, sessionId, status }`
  - `await_subagent`: `{ results: [{ steps, summary }] }` → `{ results: [{ sessionId, status, summary }] }` (summary = 子最后一条 assistant message)
- `SessionRecord` schema 不变, 仅启用已存在的 `parent_session_id`

---

## 5. 风险与兼容性

### 5.1 数据迁移

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 历史 SubAgent 数据无法在新架构展示 | 中 | 降级渲染"历史 SubAgent 记录 (无法展开)", 不报错 (Q4) |
| 历史子 session 不存在 | 低 | 旧架构没有创建子 session 记录, 无法回填, 接受丢失 |

### 5.2 行为兼容性

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| LLM 拿到的 await_subagent 结果信息量减少 | **中** | 这是 Q2 的明确决策 (主 agent 只关心结果)。若 LLM 决策受影响, 可在 prompt 中引导 LLM 主动读取子 session 详情 |
| 子 session 取消时摘要为空 | 低 | await_subagent 返回 `summary: None`, 主 agent 据此判断"子被取消" |
| Tab 数量爆炸 | 中 | Tab 栏最大数限制 (建议 8), 关闭父 Tab 时级联关闭子 Tab |
| ConcurrentAgentStore 并发限制 | 低 | 保留 `new(3)` 但改为可配置 |

### 5.3 取消通信边界情况

| 场景 | 处理 |
|------|------|
| 用户停父, 子仍在跑 | 级联取消所有子 session (§3.4) |
| 用户停子, 父仍在 await | await_subagent select! 收到 Done(cancelled), 返回 cancelled |
| 父 agent 自然完成 (LLM 主动结束), 没调 await_subagent | 子 session 继续独立运行, 用户可在 Tab 查看 (不强制取消) |
| 用户手停子, 父没在 await (父在做别的事) | 子 session emit Done(cancelled), 父下次调用 await_subagent 时立即返回 cancelled |
| await_subagent 等待中, 父 agent loop 因异常退出 | cancel_token 触发 → 级联取消子 session |

### 5.4 与 Automation 的兼容性

Automation 接入 `spawn_session` 后, 行为应保持不变:
- title 前缀 "自动化 · " 保留 (业务标识, 不是特殊化)
- 取消路径统一为 `cancel_session_and_children` (Automation 没有子 session, 行为等价)
- 不影响 Automation 的 cron / 互斥锁 / 运行注册表等独有逻辑

---

## 6. 实施计划 (分阶段)

### P0 - 核心路径 (端到端可用)

> 目标: SubAgent 能创建独立 session, 在 Label 渲染, 点击 Label 跳转到子 session 详情页 (暂用现有 session 详情页代替 Tab)

1. 后端: 新增 `agent::spawn::spawn_session` 公共入口
2. 后端: `execute_spawn_subagent` 重写 (调用 spawn_session, 移除 thread::spawn)
3. 后端: `execute_await_subagent` 改写 (select! + 读最后一条 assistant message)
4. 后端: sessions store 加 `by-parentSessionId` 索引 + `list_sessions_by_parent`
5. 后端: 新增 `cancel_session_and_children`, 父 cancel 级联取消子
6. 后端: `ConcurrentAgentStore` 调整 (存 session_id + task_id, 不再存 join_handle)
7. 前端: 侧边栏 + 搜索过滤 `parentSessionId != null`
8. 前端: 新增 `SubAgentLabel` 组件 (含降级渲染)
9. 前端: `tool-invocation-chip.tsx` 替换 isSubAgentTool 分支
10. 前端: `agent-store.tsx` 简化 `tool_call_finished` 处理
11. 前端: 点击 Label 暂时跳转到 `/chat/:sessionId` (现有路由, 在当前页打开)

**验收**: spawn_subagent 工具能创建独立子 session, 父 message chip 显示 Label (转圈), 子 session 完成后 Label 显示 ✓, 点击 Label 能看到子 session 完整内容; 停止父 session 时子 session 也被取消。

### P1 - UI 完善 (Tab 栏 + Automation 接入)

12. 前端: 新增 `session-tabs.tsx` 顶部 Tab 栏
13. 前端: Tab 与侧边栏联动 (点击侧边栏在当前 Tab 打开, 点击 Label 新开 Tab)
14. 前端: Tab 关闭/最大数限制/关闭父 Tab 级联关闭子 Tab
15. 后端: Automation runner 改为调用 `agent::spawn::spawn_session` (Q8 合二为一)
16. 后端: Automation 取消路径改为 `cancel_session_and_children`
17. 前端: 旧格式 output 降级渲染完善 (Q4)

**验收**: Tab 栏完整可用, Automation 和 SubAgent 共享同一套创建/取消逻辑, 维护一份代码。

### P2 - 清理与优化

18. 后端: 移除 `collect_subagent_event` / `build_subagent_summary` / `extract_subagent_tool_label` / `subagent_context_depth` / `MAX_SUBAGENT_DEPTH` 死代码
19. 前端: 删除 `sub-agent-tool-output.tsx` + `spawn-subagent-display.ts`
20. 前端: 清理 `SubAgentStep` 类型 + `spawnSubAgentConfig` 死字段
21. 后端: `ConcurrentAgentStore` 并发数可配置化
22. (可选) 提取公共 prompt 模板给 spawn_subagent (子 agent system prompt 也走统一通道)

---

## 7. 总结

本次重构的核心价值:

1. **统一数据模型**: SubAgent = 普通 Session, 启用已预留的 `parent_session_id`, 数据层零迁移
2. **统一创建入口**: `agent::spawn::spawn_session` 让 Automation + SubAgent 共享底层机制 (Q8 合二为一)
3. **统一取消通信**: `cancel_session_and_children` + await_subagent 的 select! 双监听 (Q9)
4. **简化前端**: 移除时间线渲染组件, 改为 Label + 顶部 Tab 栏 (Q1)
5. **结构上禁止嵌套**: 子 agent 工具白名单排除 spawn_subagent + await_subagent, 删除深度检测 (Q6)
6. **保留 LLM 接口**: 工具签名不变, 不影响 prompt 工程

主要风险集中在**LLM 决策信息量减少** (Q2 明确接受) 和**Tab 数量管理** (有上限方案), 均可接受。

请确认本 v2 方案, 我会开始 P0 实施。
