# SubAgent 架构重构 — 交接文档

> 日期: 2026-07-27
> 状态: P0 全部修复并**已通过用户运行时验证** (2026-07-27); 进入 P1 (UI 完善) 阶段
> 前一个 session 的对话已完成, 本文档供下一个 session 继续

---

## 1. 项目背景

### 1.1 重构目标

将 **SubAgent** 重构为与普通 **Session** 完全一致, 仅展示方式不同:
- SubAgent 本质上就是一个普通 Session (创建独立 SessionRecord, 设 `parent_session_id`)
- 不在侧边栏展示, 不允许搜索
- 前端只显示 Label (转圈 + 标题), 点击跳转到子 session 详情页
- 创建 SubAgent = 创建普通 Session + 发 User Message + 启动执行
- 参考 Automation 模式, 提取公共入口, Automation + SubAgent 合二为一

### 1.2 用户决策 (Q1-Q9)

| Q | 决策 |
|---|------|
| Q1 | 顶部 Tab 栏 (参考 codex/claude/code) |
| Q2 | await_subagent 仅返回子 session 最后一条 assistant message 作为摘要 |
| Q3 | 标题逻辑复用 `derive_session_title`, 与主 session 一致 |
| Q4 | 旧数据降级显示"历史 SubAgent 记录 (无法展开)", 不报错 |
| Q5 | 不允许搜索 — 侧边栏和搜索框都过滤 parentSessionId != null |
| Q6 | 不允许嵌套 — 子 agent 工具白名单排除 spawn_subagent + await_subagent |
| Q7 | 分阶段 P0 → P1 → P2 |
| Q8 | 合二为一 — 提取公共 `spawn_session` 入口, Automation + SubAgent 共享 |
| Q9 | await_subagent 用 `select!` 同时监听子 Done + 父 cancel_token; 父取消级联取消子 |

---

## 2. 已完成的工作 (P0)

### 2.1 已 commit 的代码

| Commit | 内容 |
|--------|------|
| `d784199` | P0 核心架构: spawn.rs + cancel.rs + tool_dispatch.rs 重写 + runner.rs 接入 + 前端 Label |
| `d2a5eea` | bugfix: spawn_tool_call_id + emit_spawn_subagent_status_update + watcher 竞态修复 |
| `a60e706` | bugfix: emit_spawn_subagent_status_update 加 DB 持久化 |
| `7030d9a` | bugfix: 遍历 session messages 查找 invocation + registry.rs 失败日志 |
| `1283ad3` | 诊断日志: wait_for_child_done + emit_spawn_status |
| `2ecc97a` | 延迟 unregister 2 秒修复 race (无效, 详见 §3.2) |
| `7021934` | **fix: DB 终态回退修复 race** (Closed → 读 DB assistant message status, 真正的修复) |
| `d43c304` | fix: merge_tool_invocations 保留 background emitter 写入的终态 status (修复刷新回退 running) |
| `60ad35f` | fix: 关浏览器重开后续跑 — 前端 reconcile spawn status + 后端 session status DB 兜底 (§3.6) |

### 2.2 新建文件

| 文件 | 用途 |
|------|------|
| `backend/src/agent/spawn.rs` | 统一入口 `spawn_session(state, opts)` — Automation + SubAgent 共享 |
| `backend/src/agent/cancel.rs` | 统一取消 `cancel_session_and_children(state, session_id)` — 递归取消子 session |
| `frontend/src/features/chat/components/sub-agent-label.tsx` | Label 组件 (spinner + 点击跳转 + 降级渲染) |
| `docs/subagent-refactor-proposal.md` | 方案设计文档 (v2) |

### 2.3 修改文件

**后端:**
- `backend/src/agent/mod.rs` — 注册 `pub mod spawn` + `pub mod cancel`
- `backend/src/db/session_store.rs` — `session_indexes` 加 `by-parentSessionId` 索引 + `list_sessions_by_parent` 查询
- `backend/src/agent/tool_dispatch.rs` — ConcurrentAgentStore 调整 + execute_spawn_subagent 重写 + execute_await_subagent 改写 + spawn_completion_watcher + emit_spawn_subagent_status_update + wait_for_child_done + 诊断日志
- `backend/src/scheduled_jobs/runner.rs` — execute_job 改为调用 spawn_session
- `backend/src/http/routes_scheduled_jobs.rs` — 取消路径改为 cancel_session_and_children
- `backend/src/http/routes_tool.rs` — handle_agent_cancel 加级联取消子 session
- `backend/src/agent/registry.rs` — 延迟 unregister + log::error! 失败日志

**前端:**
- `frontend/src/lib/db/sessions.ts` — listSessions 过滤 parentSessionId
- `frontend/src/features/chat/components/tool-invocation-chip.tsx` — SubAgentToolOutput → SubAgentLabel

---

## 3. 未解决的问题 (核心 bug)

### 3.1 现象 (代码已修复, 待用户运行验证 ⏳)

> **状态说明**: 以下为本轮代码改动的**预期效果**, 尚未经用户实际运行回归确认。
> 编译通过 ≠ 已修复 —— 必须以用户在 `pnpm dev:server` 重新编译并实测的结果为准。

1. 子 agent 正常完成后, Label **应**显示 ✓ (completed) 而非 ✗ (failed) — 代码改为读 DB 终态, 待验证
2. await_subagent **应**返回正确的 `completed`/`cancelled`/`failed` — 待验证
3. 刷新页面后 Label **应**保持终态 (不再回到 running) — DB 现写正确终态, 待验证

### 3.2 根因 (已定位 + 已修复)

**真正的 race 不是 `registry.rs` 的 unregister 时机, 而是 broadcast channel 的「订阅之后才可见」语义。**

`await_subagent` 调用 `wait_for_child_done` 时, 是**事后订阅** `child_task_id` 的 broadcast channel
(见 `tool_dispatch.rs` 旧 `wait_for_child_done(broadcaster, task_id)`)。如果子 agent 在 `await_subagent`
被调用**之前**就已经跑完并发出了 `Status{Completed}` 事件, 那么这个新订阅者**永远收不到那个历史事件**
(broadcast 只对订阅之后的事件可见), 只能等 channel 关闭后收到 `RecvError::Closed`, 被硬编码成 `"failed"`。

- commit `2ecc97a` 的「延迟 unregister 2 秒」之所以无效: 延迟只是把 `Closed` 推后 2 秒,
  但新订阅者**本来就没收到过 Status 事件**, 推后也只是更晚收到 `Closed`, 结果一样是 `"failed"`。
- 日志里 `agent_task_completed` 和 `subagent_wait_closed` 恰好差 2 秒, 正是这个延迟 unregister 的证据。

**为什么 registry 也不能作为终态回退源:** `registry.rs` 在任务完成后**立即** `remove_run` (非延迟),
且 `get_session_status` 要求 `is_active_run_status`, terminal 状态本来就返回 `None`。所以 registry
查不到已结束任务的终态。

**权威终态源 = DB。** `registry.rs` 在 `unregister` (延迟 2s) **之前**, 已同步把子 session 的
assistant message `status` 写为 `completed`/`failed`/`cancelled` (registry.rs:537-545)。因此 channel
关闭那一刻, DB 里已经是终态 —— 读 DB 即可得到正确答案。

### 3.3 已尝试 / 已采用的修复

1. **延迟 unregister 2 秒** (commit `2ecc97a`): 无效 (见 §3.2 分析), 但保留无害, 仍有助于 watcher
   预订阅路径通过 channel 直接收到 Status 事件。
2. **✅ 采用 — `RecvError::Closed` 时回退查询 DB 终态** (commit 见 §2.1 最新):
   - `wait_for_child_done` / `wait_for_child_done_with_receiver` 现传入 `app_state` + `session_id` + `task_id`
   - 收到 `Closed` 不再返回 `"failed"`, 而是调用 `read_child_db_terminal_status()` 读子 session 的
     assistant message `status`; 若仍非终态, 做 10×200ms 的短暂轮询兜底 (实践中 DB 在 channel 关闭前
     已写好, 一次即命中)
   - 命中终态则返回 `"completed"`/`"cancelled"`/`"failed"`, 否则 (兜底耗尽) 才返回 `"failed"`
   - 这条路径同时修复了 `execute_await_subagent` (事后订阅) 和 `spawn_completion_watcher` (预订阅) 两条路径

### 3.4 关键修复代码位置

| 文件 | 行号 | 内容 |
|------|------|------|
| `backend/src/agent/tool_dispatch.rs` | ~2972 | `read_child_db_terminal_status(app_state, session_id, task_id)` — DB 权威终态回退 |
| `backend/src/agent/tool_dispatch.rs` | ~3008 | `wait_for_child_done(app_state, session_id, task_id)` — 重写 |
| `backend/src/agent/tool_dispatch.rs` | ~3024 | `wait_for_child_done_with_receiver(...)` — `Closed` 走 DB 回退 |
| `backend/src/agent/tool_dispatch.rs` | ~2707 | `execute_await_subagent` 调用点传入 session_id |
| `backend/src/agent/tool_dispatch.rs` | ~2895 | `spawn_completion_watcher` 调用点传入 app_state/session_id/task_id |

### 3.5 刷新后 Label 仍回退 "running" 的根因与修复 (用户回归发现)

**现象** (用户验证 §3.3 修复后): 运行中实时状态已正确 (Label 显示 ✓, 日志 `subagent_wait_done status=completed via DB`),
但**页面刷新后 Label 又回到转圈 (running)**。

**根因 — 父 agent loop 的回合末持久化覆盖了我们的 DB 写入 (两个写者竞争)**:
1. `emit_spawn_subagent_status_update` 在读到的 DB message 上把 `output.status` 改为 `"completed"` 并 `put_message` (正确写入, 日志 `found invocation, persisting to DB`)。
2. 但父 agent loop 在回合结束 (`agent_task_completed`, 比上面的写入**晚约 2 秒**) 调用
   `persist_message_snapshot` → `merge_tool_invocations`, 该函数**用 loop 内存里的 `state.tool_invocations`
   整体替换 DB 的 invocation** (loop_.rs 旧 `*db_invocations = state_invocations.to_vec()`), 而 loop 内存里
   spawn_subagent 的 `output.status` 永远是初始的 `"running"` (loop 自己从不更新它, 只有 background emitter 写 DB)。
   → 把我们刚写的 `"completed"` 覆盖回 `"running"`, 刷新即读到 `"running"`。
3. 现有 `merge_tool_invocations` 只保留 DB 侧的 `__progress` 字段, 漏掉了 `status`, 所以这个终态被丢。

**修复** (commit 见 §2.1 最新, 改 `backend/src/agent/loop_.rs` 的 `merge_tool_invocations`):
- 收集 DB 侧每个 invocation 的 background-writable 字段: `__progress` (原有) + `status` (新增)。
- 仅当 DB `status` 为终态 (`completed`/`cancelled`/`failed`) 且 loop 内存侧**不是**终态时才回写 (避免把已正确的终态降级为旧值)。
- 这样父 loop 回合末 `persist_message_snapshot` 时, spawn_subagent 的 `output.status` 会被保留为 DB 里的 `"completed"`,
  刷新后前端读到 `completed`, Label 显示 ✓。

**验证 (待用户回归)**: 子 agent 跑完 → 等父 session 也跑完 → **刷新页面** → Label 应保持 ✓ (不再回退 running)。

### 3.6 关浏览器后重开: 子 agent 完成但 Label 卡 running 的根因与修复 (架构级目标 review 发现)

**目标**: 前端发任务 → 关浏览器 → 后端继续跑 (独立 `tokio::spawn`, 已满足) → 重开浏览器状态还原且续跑。

**架构事实 (review 确认)**:
- 后端 agent loop = `registry.rs:436` `tokio::spawn`; `spawn_completion_watcher` = `tool_dispatch.rs:2890` `tokio::spawn` → 后端脱离浏览器自治, 关浏览器后仍写 DB + 发 ToolCallFinished 给父 task_id。✓
- `execute_spawn_subagent` fire-and-forget 立即返回 (`tool_dispatch.rs:2660`) → 父 task run 很快从 registry 移除。
- SSE 支持 `from_seq` 重放 (`routes_sse.rs` + `event_log`), 但**仅在 run 仍在 registry 时有效**。
- 前端重开走 `resumeSessionTask` (`agent-store.tsx:671`): 只 `getAgentSessionStatus(parentSessionId)` + `resumeAgentStream(parentTaskId)` → **只续父 session, 不处理 spawn_subagent 子 session**。

**根因**: 若 fire-and-forget 派生子 agent 后关浏览器、子仍在跑, 重开时:
- 子若在关浏览器期间完成: watcher 已写 DB completed, 重开读 DB 得 completed (§3.5 修复保证不被父 loop 覆盖) → Label ✓。
- 子若重开时仍在跑、之后才完成: 重开读 DB=running → Label 转圈; 前端只续父 task (父 run 已删, 无直播); 子完成后 watcher 写 DB completed + 发 ToolCallFinished 给父 task_id (run 已删, 事件丢失); 前端**不再回读 DB** → Label 卡 running。✗
- 关键: 前端 `useSessionData` 的 `subscribeDb` 只订阅**前端本地 DB**, 后端 watcher 在浏览器关闭期间写的 server DB 变更重开时不会触发它 → 必须主动轮询。

**修复** (commit 见 §2.1 最新, 改动 3 个文件):
1. 后端 `backend/src/db/session_store.rs`: 新增 `latest_assistant_message_status(session_id)` — 读子 session 最新 assistant message 的 DB 状态。
2. 后端 `backend/src/http/routes_tool.rs`: `handle_agent_session_status` 在 registry 无 run 时回退读 DB 终态 (`{running:false, status}`), 使前端重连后仍能查到子 session 完成状态。
3. 前端 `frontend/src/features/chat/hooks/use-session-messages.ts`: `useSessionData` 加载完成后枚举仍 running 的 spawn_subagent 子 session, 每 2.5s 轮询 `getAgentSessionStatus(子)`, 一旦终态即 `refresh()` 让 Label 翻状态 (读 DB 中 watcher 已写的终态)。轮询上限 ~10min, 卸载即取消。

**为何这样修**: 后端已把子终态写进 DB (§3.5 保证不被覆盖), 只差前端消费这份权威状态。reconcile 轮询最小侵入, 不动 resume 主流程, 不改既有 SSE 路径; 用户打开子 session 时其自身 `resumeSessionTask` 仍负责直播续跑。

**验证 (待用户回归)**:
- 场景 A (子关浏览器期间完成): 派生子 agent → 关浏览器 → 等子完成 → 重开父 session → Label 应直接显示 ✓ (读 DB)。
- 场景 B (子重开后仍跑、之后完成): 派生子 agent → 关浏览器 → 重开父 session (子还在跑, Label 转圈) → 等子完成 → Label 应自动翻 ✓ (reconcile 轮询), 无需手动刷新。

---

## 4. 关键代码位置

### 4.1 后端

| 文件 | 行号 | 内容 |
|------|------|------|
| `backend/src/agent/spawn.rs` | 全文件 | 统一入口 `spawn_session` |
| `backend/src/agent/cancel.rs` | 全文件 | 统一取消 `cancel_session_and_children` |
| `backend/src/agent/tool_dispatch.rs` | ~2586 | `execute_spawn_subagent` (重写) |
| `backend/src/agent/tool_dispatch.rs` | ~2680 | `execute_await_subagent` (重写) |
| `backend/src/agent/tool_dispatch.rs` | ~2776 | `emit_spawn_subagent_status_update` (DB 更新 + emit 事件) |
| `backend/src/agent/tool_dispatch.rs` | ~2815 | `spawn_completion_watcher` (后台 watcher, 预订阅 receiver) |
| `backend/src/agent/tool_dispatch.rs` | ~2880 | `wait_for_child_done` / `wait_for_child_done_with_receiver` |
| `backend/src/agent/tool_dispatch.rs` | ~2900 | `terminal_status_from_payload` (解析 SSE Status 事件) |
| `backend/src/agent/tool_dispatch.rs` | ~2920 | `read_last_assistant_message` (读取子 session 最后一条 assistant message) |
| `backend/src/agent/registry.rs` | ~450 | `final_status` 计算 (Ok → Completed, Err → Failed) |
| `backend/src/agent/registry.rs` | ~496 | emit Status 事件 (final_event) |
| `backend/src/agent/registry.rs` | ~513 | **unregister(&task_id) — race condition 根因** |
| `backend/src/scheduled_jobs/runner.rs` | ~40 | `execute_job` (Automation 接入 spawn_session) |
| `backend/src/http/routes_tool.rs` | ~1562 | `handle_agent_cancel` (级联取消子 session) |
| `backend/src/http/routes_tool.rs` | ~1638 | `handle_agent_session_status` (registry 无 run 时回退 DB 终态, §3.6) |
| `backend/src/db/session_store.rs` | 新增 | `latest_assistant_message_status(session_id)` (§3.6) |

### 4.2 前端

| 文件 | 行号 | 内容 |
|------|------|------|
| `frontend/src/features/chat/components/sub-agent-label.tsx` | 全文件 | Label 组件 |
| `frontend/src/features/chat/components/tool-invocation-chip.tsx` | ~103, ~366 | import + 渲染分支 |
| `frontend/src/lib/db/sessions.ts` | ~132 | listSessions 过滤 parentSessionId |
| `frontend/src/features/chat/hooks/use-session-messages.ts` | `useSessionData` | spawn_subagent reconcile 轮询 (§3.6) |

### 4.3 关键类型

| 类型 | 位置 | 说明 |
|------|------|------|
| `SpawnSessionOptions` / `SpawnSessionResult` | `spawn.rs` | 统一入口参数/返回值 |
| `SpawnedAgent` | `tool_dispatch.rs:49` | {handle_id, task, session_id, task_id, spawn_tool_call_id, started_at} |
| `ConcurrentAgentStore` | `tool_dispatch.rs:59` | register/get/remove/cancel_all |
| `AgentEvent` | `types.rs:86` | `#[serde(tag = "type", rename_all_fields = "camelCase")]` |
| `AgentStatus` | `types.rs:6` | Pending/Running/Cancelling/Cancelled/Completed/Failed (PascalCase 序列化) |
| `AgentEvent::Status` | `types.rs:87` | serde type="status" |
| `AgentEvent::Done` | `types.rs:150` | serde type="done" |
| `SseBroadcaster` | `lib.rs:53` | HashMap<String, broadcast::Sender<String>> |

### 4.4 关键数据流

```
spawn_subagent 工具调用
  → execute_spawn_subagent
    → spawn_session (创建 SessionRecord + start_agent_send_with_task_id)
    → concurrent_agents.register (存 session_id, task_id, spawn_tool_call_id)
    → 预订阅 broadcaster.subscribe(child_task_id) → watcher_receiver
    → spawn_completion_watcher (后台 task, 用 watcher_receiver)
    → 返回 {handleId, sessionId, status: "running"}

子 session 运行
  → run_agent_loop (标准 agent loop)
  → emit 各种事件 (ContentDelta, ToolCallFinished, ...)
  → 结束时: emit Done 事件 → emit Status{Completed} 事件 → unregister(task_id)

await_subagent 工具调用
  → execute_await_subagent
    → concurrent_agents.get(handle_id) → 获取 session_id, task_id, spawn_tool_call_id
    → tokio::select!:
      Branch A: wait_for_child_done (订阅 child_task_id, 等 Status 事件)
        → emit_spawn_subagent_status_update (更新 DB + emit ToolCallFinished)
      Branch B: ctx.cancel_token.cancelled() (父取消)
        → cancel_session_and_children (级联取消)
```

---

## 5. 诊断日志

当前代码中有以下诊断日志 (在 `tool_dispatch.rs` 中):

| 日志 | 含义 |
|------|------|
| `subagent_wait_done status=X via Status event` | wait_for_child_done 正常收到 Status 事件 |
| `subagent_wait_closed: channel closed before Status event` | **race! channel 在 Status 事件前关闭** |
| `subagent_wait_lagged n=N` | broadcast 缓冲区溢出 |
| `emit_spawn_status: updating tool_call_id=X session_id=Y status=Z` | emit_spawn_subagent_status_update 被调用 |
| `emit_spawn_status: found invocation, persisting to DB` | DB 更新成功 |
| `emit_spawn_status: invocation not found` | DB 更新找不到 invocation |
| `agent_loop_failed task_id=X session_id=Y error=Z` | (registry.rs) agent loop 返回 Err |

**测试方法**: 重启后端 (`pnpm dev:server`), 触发 spawn_subagent, 看后端终端日志。

---

## 6. 后续工作

### 6.1 P0 (已完成并验证 ✅)

> 2026-07-27 用户运行时回归确认三个修复均通过 (运行中 Label ✓ / 刷新保持 ✓ / 关浏览器重开续跑 ✓)。

1. **修复 race condition — `RecvError::Closed` 回退 DB 终态 (已验证)** — §3.3, commit `7021934`
2. **修复刷新回退 running — 父 loop 持久化覆盖 (已验证)** — §3.5, commit `d43c304` (`merge_tool_invocations` 保留终态 `status`)
3. **修复关浏览器重开后续跑卡 running — 前端 reconcile + 后端 session status DB 兜底 (已验证)** — §3.6, commit `60ad35f`
4. **验证覆盖项 (均已通过)**:
   - 运行中: 转圈停止后显示 ✓ (completed), await_subagent 返回 status=completed
   - 刷新后: Label 保持 ✓, 不再回退 running
   - 关浏览器重开续跑 (场景 A 直接 ✓ / 场景 B 自动翻 ✓)
   - 重点: 子 agent 跑完后过几秒再调 await_subagent (subscribe-after-emit race)

### 6.2 P1 (UI 完善)

3. **顶部 Tab 栏组件** (`session-tabs.tsx`)
   - Tab 显示: 标题 + 状态指示器 + 关闭按钮
   - 点击侧边栏 session → 在当前 Tab 打开
   - 点击 Label → 新开 Tab
   - 关闭父 Tab → 级联关闭子 Tab
   - 最大 Tab 数限制
4. **Tab 与路由联动**
5. **旧格式 output 降级渲染完善** (Q4)

### 6.3 P2 (清理)

6. **删除后端死代码** (9 个 warning):
   - `collect_subagent_event` (tool_dispatch.rs:~2900)
   - `build_subagent_summary` (tool_dispatch.rs:~3180)
   - `build_subagent_system_prompt` (tool_dispatch.rs:~3010)
   - `subagent_context_depth` (tool_dispatch.rs:~3150)
   - `extract_subagent_tool_label` (tool_dispatch.rs:~3155)
   - `truncate_label` (tool_dispatch.rs:~3175)
   - `build_project_overview` (tool_dispatch.rs:~3075)
   - `MAX_SUBAGENT_DEPTH` 常量 (tool_dispatch.rs:~2173)
   - `SpawnSubAgentArgs.context` 字段
7. **删除前端死代码**:
   - `frontend/src/features/chat/components/sub-agent-tool-output.tsx` (整文件)
   - `frontend/src/features/agent/tools/spawn-subagent-display.ts` (整文件)
   - `SubAgentStep` 类型 (`types.ts:327-358`)
   - `ToolExecutionContext.spawnSubAgentConfig` 死字段 (`types.ts:307-319`)
8. **移除诊断日志** (修复后不再需要)
9. **`ConcurrentAgentStore` 并发数可配置化** (当前硬编码 3)

---

## 7. AGENTS.md 合规性

- **遵循**: 工程质量达到开源标准; 复用现有 `start_agent_send_with_task_id`; 工具签名不变
- **偏离**: 无 (P0 三个修复均已完成且用户验证通过); 死代码留到 P2 清理
- **Git commits**: 已创建 9+ 个 commit (含 P0 三修复 + 文档), 代码已保存
