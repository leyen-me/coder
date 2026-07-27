# SubAgent 架构重构 — 交接文档

> 日期: 2026-07-27
> 状态: P0 核心架构完成, 有一个未解决的 race condition bug
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
| `2ecc97a` | 延迟 unregister 2 秒修复 race (用户报告仍未解决) |

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

### 3.1 现象

1. **子 agent 正常完成后, Label 显示 ✗ (failed) 而非 ✓ (completed)**
2. **await_subagent 返回 `status: "failed"`** (子 agent 实际正常完成)
3. **刷新页面后, Label 回到转圈 (status 回到 "running")** — DB 持久化没生效

### 3.2 根因 (已通过诊断日志确认)

**Race condition in `registry.rs:513`**

`registry.rs` 在 agent loop 结束后的执行顺序:
```
1. emit Status { status: Completed } 事件    (registry.rs:507)
2. unregister(&task_id)                      (registry.rs:513) ← 立即关闭 channel!
```

`wait_for_child_done` 的 receiver 订阅了 `child_task_id`, 等待 `type == "status"` 的事件。但 `unregister` 在 emit 后立即执行, 删除了 HashMap 中的 sender, channel 关闭。

**receiver 在 poll 时收到 `RecvError::Closed` (而不是 Status 事件), 返回 `"failed"`。**

诊断日志确认:
```
agent_task_completed turns=2 total_tokens=17694           ← 子 session 正常完成 (Ok)
subagent_wait_closed: channel closed before Status event  ← race! channel 关闭
emit_spawn_status: status=failed                          ← 错误的 status
emit_spawn_status: found invocation, persisting to DB     ← DB 更新成功 (但值是错的)
```

### 3.3 已尝试的修复 (未解决)

1. **延迟 unregister 2 秒** (commit `2ecc97a`): `tokio::spawn + sleep(2s) + unregister`
   - 用户报告: 仍未解决
   - 可能原因: 2 秒不够? 或者 race 不在 unregister, 而在别的地方? 或者用户没有重新编译?

### 3.4 下一步建议

**方案 A (推荐): 不依赖 broadcast channel, 改用 registry 查询**

在 `wait_for_child_done` 收到 `RecvError::Closed` 时, 不直接返回 "failed", 而是:
1. 查询 `agent_get_session_status(registry, session_id)` 获取最终状态
2. 如果状态是 Completed/Cancelled/Failed, 返回对应的字符串
3. 如果状态仍然是 Running (agent loop 还没结束), 继续等待

需要把 `registry` 传入 `wait_for_child_done`。

**方案 B: 增大延迟时间**

把延迟从 2 秒增加到 5 秒或 10 秒。但这不优雅, 且不可靠。

**方案 C: 不调用 unregister**

让 channel 永远不关闭 (不调用 unregister)。但这会导致 HashMap 中的 sender 永远不被清理, 内存泄漏。

**方案 D: 在 emit Status 事件后, 主动 sleep 一个 async tick**

```rust
emit_broadcaster.emit(&task_id, &status_event);
tokio::task::yield_now().await;  // 让其他 task 有机会 poll
emit_broadcaster.unregister(&task_id);
```

但这不可靠 (yield_now 不保证所有 receiver 都 poll 了)。

**方案 E (最彻底): 重构 wait_for_child_done, 不用 broadcast channel**

改用 `agent_get_session_status` 轮询 registry 的状态, 直到状态变为终止状态:
```rust
async fn wait_for_child_done(registry: &Arc<Mutex<AgentRegistry>>, session_id: &str) -> String {
    loop {
        let status = agent_get_session_status(registry, session_id.to_string());
        if let Ok(Some(resp)) = status {
            match resp.status {
                AgentStatus::Completed => return "completed",
                AgentStatus::Cancelled => return "cancelled",
                AgentStatus::Failed => return "failed",
                _ => {} // Pending/Running/Cancelling — 继续等
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}
```

这样完全避免了 broadcast channel 的 race condition。缺点是轮询 (每 100ms 查一次), 但对 SubAgent 场景可接受。

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

### 4.2 前端

| 文件 | 行号 | 内容 |
|------|------|------|
| `frontend/src/features/chat/components/sub-agent-label.tsx` | 全文件 | Label 组件 |
| `frontend/src/features/chat/components/tool-invocation-chip.tsx` | ~103, ~366 | import + 渲染分支 |
| `frontend/src/lib/db/sessions.ts` | ~132 | listSessions 过滤 parentSessionId |

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

### 6.1 P0 剩余 (必须先解决)

1. **修复 race condition** — 用本文档 §3.4 的方案 A 或 E
2. **验证**: 转圈停止后显示 ✓ (completed), 刷新后保持 ✓, await_subagent 返回 status=completed

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
- **偏离**: P0 尚未完全可用 (race condition 未解决); 死代码留到 P2 清理
- **Git commits**: 已创建 6 个 commit, 代码已保存
