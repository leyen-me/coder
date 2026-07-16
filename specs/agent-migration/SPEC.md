# Agent 后端化 — 可执行迁移规格

> **给 Claude Code 执行用。不要猜测 — 全部在此。**
>
> 工作目录：`/Users/apple/Desktop/project/coder`
> 后端目录：`backend/src/agent/`
>
> **规则：**
> 1. 严格按阶段顺序，每个阶段 `cargo test` 通过后再进入下一阶段
> 2. 所有 serde 结构体用 `#[serde(rename_all = "camelCase")]`
> 3. 不要改前端代码，直到阶段 5 后端全部完成
> 4. 不要改 `backend/src/tools/` 已有工具实现
> 5. 后端消息存储已存在（SQLite via `AppState.db`），agent 循环直接写入

---

## 阶段 0：准备 — 补充已有类型

### 先读这些文件

```
backend/src/agent/types.rs     ← AgentStartParams, AgentEvent, ChatMessage, ToolCall, AgentToolDefinition, TokenUsage
backend/src/agent/mod.rs       ← agent_start(), agent_cancel(), agent_get_status(), AgentState
backend/src/agent/registry.rs  ← AgentRegistry, AgentRun, start() 方法
backend/src/agent/openai.rs    ← stream_chat_completion(), chat_completions_url(), build_http_client()
backend/src/lib.rs             ← SseBroadcaster (subscribe, emit, emit_event, emit_agent_event), AppState
```

### 修改 `types.rs`

#### 1) 在 `AgentStartParams` 末尾（`request_extensions` 之后）追加：

```rust
#[serde(default)]
pub session_id: Option<String>,
#[serde(default)]
pub emit_assistant_output: Option<bool>,
#[serde(default)]
pub max_context_tokens: Option<u32>,
#[serde(default)]
pub handoff_trigger_threshold: Option<f64>,
#[serde(default)]
pub agent_mode: Option<String>,
#[serde(default)]
pub thinking_enabled: Option<bool>,
#[serde(default)]
pub models: Option<Vec<Value>>,
#[serde(default)]
pub session_kind: Option<String>,
#[serde(default)]
pub autonomy_mode: Option<String>,
#[serde(default)]
pub decision_policy_version: Option<String>,
#[serde(default)]
pub decision_model: Option<String>,
```

#### 2) 在 `AgentEvent` 枚举中，`Error` 变体之前追加 `HandoffRequired`：

```rust
#[serde(rename = "handoff_required")]
HandoffRequired {
    task_id: String,
    context_usage: AgentContextUsageSnapshot,
},
```

#### 3) 在文件末尾新增：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextUsageSnapshot {
    pub used_tokens: u32,
    pub max_tokens: u32,
    pub remaining_tokens: u32,
    pub reserved_tokens: u32,
    pub trigger_threshold: f64,
}
```

### 修改 `AgentStatusResponse`（`types.rs`）

追加字段：

```rust
#[serde(default)]
pub last_seq: Option<u64>,
```

---

## 阶段 1：工具注册表

### 新文件：`backend/src/agent/tool_dispatch.rs`

#### 1.1 类型定义（本模块内部）

```rust
use std::collections::HashMap;
use serde_json::Value;

pub struct ToolExecutionContext {
    pub workspace_dir: Option<String>,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub agent_mode: Option<String>,
    pub web_search_config: Option<Value>,
    pub spawn_sub_agent_config: Option<SpawnSubAgentConfig>,
}

#[derive(Debug, Clone)]
pub struct SpawnSubAgentConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub thinking_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultEnvelope {
    pub ok: bool,
    pub tool: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ToolErrorPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolErrorPayload {
    pub code: String,
    pub message: String,
}
```

#### 1.2 工具列表（24 个，名字严格匹配）

| 工具名 | 后端函数 | 阶段 1 实现 |
|--------|---------|-----------|
| `read_file` | `crate::tools::tool_read_file` | ✅ 完整实现 |
| `write_file` | `crate::tools::tool_write_file` | ✅ |
| `replace_file` | `crate::tools::tool_replace_file` | ✅ |
| `edit_file` | `crate::tools::tool_edit_file` | ✅ |
| `replace_lines` | `crate::tools::tool_replace_lines` | ✅ |
| `list_dir` | `crate::tools::tool_list_dir` | ✅ |
| `glob` | `crate::tools::tool_glob` | ✅ |
| `grep` | `crate::tools::tool_grep` | ✅ |
| `shell` | `crate::tools::tool_shell` | ✅ |
| `remote_shell` | `crate::tools::tool_remote_shell` | ✅ |
| `await` | `crate::tools::tool_await` | ✅ |
| `list_shells` | `crate::tools::shell_list` | ✅ |
| `kill_shell` | `crate::tools::shell_kill` | ✅ |
| `read_shell_logs` | `crate::tools::shell_read_logs` | ✅ |
| `web_search` | `crate::tools::tool_web_search` | ✅ |
| `browse_page` | `crate::tools::tool_browse_page` | ✅ |
| `get_workspace_tree` | `crate::tools::tool_get_workspace_tree` | ✅ |
| `read_prior_tool_output` | 调 `tool_read_file` + JSON 解析 | ✅ |
| `send_email` | `crate::tools::send_email` | ✅ |
| `spawn_subagent` | `subagent.rs` | ⏳ 返回 toolSuccess dummy |
| `ask_question` | 无需后端逻辑 | ⏳ 返回 toolSuccess dummy |
| `todo_read` | 读 SQLite `agent_todos` 表 | ⏳ 返回 empty list |
| `todo_write` | 写 SQLite `agent_todos` 表 | ⏳ 返回 toolSuccess dummy |

#### 1.3 公共 API

```rust
type ToolFn = fn(args: Value, ctx: &ToolExecutionContext) -> Result<ToolResultEnvelope, String>;

/// 按 agent_mode 返回可用工具定义（AgentToolDefinition 来自 types.rs）
pub fn get_tool_definitions(agent_mode: Option<&str>) -> Vec<AgentToolDefinition>;

/// 执行单个工具调用。arguments 是 JSON 字符串（OpenAI 格式）
pub fn execute_tool_call(
    name: &str,
    arguments: &str,
    ctx: &ToolExecutionContext,
) -> Result<ToolResultEnvelope, String>;

/// 序列化为 JSON 字符串
pub fn serialize_tool_result(result: &ToolResultEnvelope) -> String;

/// 给所有 handler 注册的工具名集合
pub fn all_tool_names() -> Vec<String>;
```

---

## 阶段 2：消息构建

### 新文件：`backend/src/agent/system_prompt.rs`

#### 类型

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEnvironment {
    pub workspace_dir: Option<String>,
    pub os: String,
    pub shell: String,
    pub is_git_repository: bool,
    pub today: String,
    pub agents_md: Option<AgentProjectInstructions>,
    pub system_modules: Vec<SystemModule>,
    pub skill_roots: SkillRoots,
    pub available_skills: Vec<AvailableSkill>,
    pub remote_targets: Vec<RemoteTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProjectInstructions { pub path: String, pub content: String, pub truncated: bool }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemModule { pub slug: String, pub name: String, pub content: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRoots { pub user: String, pub workspace: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableSkill { pub slug: String, pub name: String, pub description: String, pub path: String, pub source: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTarget { pub alias: String, pub host: String, pub port: u16, pub user: String }
```

#### 核心函数

```rust
/// 构建 system prompt。直接对应前端 build-system-prompt.ts 的 buildSystemPrompt()
pub fn build_system_prompt(environment: &AgentEnvironment, agent_mode: Option<&str>) -> String;
```

**实现**：从前端 `frontend/src/features/agent/environment/build-system-prompt.ts`（337 行）复制所有 prompt 文本 → 转成 Rust 字符串模板 → 用 `format!()` 插值。

包含 20 个部分（按顺序）：身份声明、环境信息、通信规则(5条)、运行原则、上下文规则、工具规则、Shell 规则、失败规则、通信风格、代码导航、代码修改、高风险区域、任务规划、验证规则、Git 工作流、代码审查、System Modules、Skill 目录、项目指令(AGENTS.md)、Remote 机器。

---

### 新文件：`backend/src/agent/message_builder.rs`

```rust
use super::types::ChatMessage;
use super::system_prompt::{AgentEnvironment, build_system_prompt};

pub struct BuildMessagesInput {
    pub history: Vec<ChatMessage>,
    pub user_content: String,
    pub environment: AgentEnvironment,
    pub agent_mode: Option<String>,
    pub session_id: Option<String>,
    pub session_policy: Option<SessionPolicy>,
    pub todo_snapshot: Option<String>,
}

pub struct SessionPolicy {
    pub session_kind: String,
    pub autonomy_mode: String,
    pub decision_policy_version: String,
    pub decision_model: Option<String>,
}

pub fn build_agent_messages(input: &BuildMessagesInput) -> Vec<ChatMessage>;
```

**逻辑**：
1. 过滤 history 中空 content 的非 user 消息
2. 构建 system messages（system prompt + policy + todo snapshot）
3. 对 user_content 扫描 `/slug` 引用 → 从 `available_skills` 匹配 → 读 SKILL.md 文件 → 注入到 content
4. 返回 `[system_messages..., ...filtered_history..., user_message]`

---

## 阶段 3：核心 Agent 循环

### 新文件：`backend/src/agent/event_log.rs`

```rust
use std::collections::VecDeque;
const MAX_BUFFERED_EVENTS: usize = 500;

pub struct EventLog {
    events: VecDeque<(u64, String)>,
    next_seq: u64,
}

impl EventLog {
    pub fn new() -> Self;
    pub fn push(&mut self, event_json: &str) -> u64;
    pub fn replay_from(&self, from_seq: u64) -> Vec<String>;
    pub fn latest_seq(&self) -> u64;
}
```

### 新文件：`backend/src/agent/compaction.rs`

```rust
const KEEP_COUNT: usize = 4;
const MAX_CHARS: usize = 4000;
pub fn compact_tool_result_messages(messages: &[ChatMessage]) -> Vec<ChatMessage>;
```

保留最近 4 条 tool result 不变，更早的超过 4000 字符的压缩为摘要 JSON。

### 新文件：`backend/src/agent/stall_detect.rs`

```rust
pub struct ToolCallStallDetector { ... }
impl ToolCallStallDetector {
    pub fn new() -> Self;
    pub fn record(&mut self, calls: &[ToolCall]) -> bool;  // true = stalled
}
```
阈值 = 3。`await` 和 `read_shell_logs` 豁免。

### 新文件：`backend/src/agent/context_monitor.rs`

```rust
pub fn should_trigger_handoff(
    messages: &[ChatMessage],
    params: &AgentStartParams,
) -> Option<AgentContextUsageSnapshot>;

pub fn estimate_text_tokens(text: &str) -> usize;
```

`estimate_text_tokens`：CJK 字符 = 1 token，其他 4 字符 = 1 token。用 `f64` 除法 + `.ceil()`。

### 新文件：`backend/src/agent/retry.rs`

```rust
pub const MAX_RETRY_ATTEMPTS: u32 = 3;
pub fn build_stream_idle_recovery_messages(
    messages: &[ChatMessage],
    partial_content: &str,
    partial_reasoning: &str,
    pending_tool_name: Option<&str>,
) -> Vec<ChatMessage>;
```

### 核心文件：`backend/src/agent/loop_.rs`

#### 错误类型

```rust
pub enum AgentLoopError { Cancelled, Stalled(String), Chat(String), Tool(String), Other(String) }
impl std::fmt::Display for AgentLoopError { ... }
impl std::error::Error for AgentLoopError {}
```

#### 内部类型

```rust
struct AgentTurnResult {
    tool_calls: Vec<ToolCall>,      // types.rs 的 ToolCall
    content: String,
    reasoning_content: String,
    usage: Option<TokenUsage>,      // types.rs 的 TokenUsage
}
```

#### 主函数

```rust
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;
use super::types::{AgentStartParams, TokenUsage, ToolCall, ChatMessage, AgentContextUsageSnapshot};
use super::registry::AgentRegistry;
use crate::Database;   // from backend/src/db/

pub async fn run_agent_loop(
    params: AgentStartParams,
    http_client: reqwest::Client,
    broadcaster: Arc<crate::SseBroadcaster>,
    cancel_token: CancellationToken,
    registry: Arc<Mutex<AgentRegistry>>,
    db: Arc<Mutex<Database>>,
) -> Result<(), AgentLoopError>;
```

#### 单轮 LLM 调用（含重试）

```rust
/// 运行单轮 LLM + 最多 3 次重试。内部分配 event_log 并转发事件。
async fn run_single_turn_with_retry(
    params: &AgentStartParams,
    messages: &[ChatMessage],
    tools: &[AgentToolDefinition],
    client: &reqwest::Client,
    broadcaster: &Arc<crate::SseBroadcaster>,
    cancel_token: &CancellationToken,
    event_log: &mut EventLog,
) -> Result<AgentTurnResult, AgentLoopError>;
```

**实现**：循环最多 3 次，每次调 `openai.rs::stream_chat_completion()`。在其回调中：
- 所有 AgentEvent → `broadcaster.emit_agent_event()` + `event_log.push()`
- 从 TurnComplete 事件提取 tool_calls
- 从 Done 事件提取 usage
- Stream idle timeout → `retry::build_stream_idle_recovery_messages()` → 重试

#### 工具执行

```rust
/// 并行执行所有工具调用，构建 tool result messages，追加到消息列表
async fn execute_and_append_tool_results(
    messages: &[ChatMessage],
    turn: &AgentTurnResult,
    ctx: &ToolExecutionContext,
    broadcaster: &Arc<crate::SseBroadcaster>,
    cancel_token: &CancellationToken,
    event_log: &mut EventLog,
    db: &Arc<Mutex<Database>>,
) -> Result<Vec<ChatMessage>, AgentLoopError>;
```

**实现**：`tokio::join_all` 并行执行所有 tool calls → 对每个结果 emit tool_call_started/finished → 构建 `role: "tool"` 消息 → 追加。

#### 辅助函数

```rust
/// 合并两次 TokenUsage
fn merge_usage(acc: Option<&TokenUsage>, next: &TokenUsage) -> TokenUsage;
```

### 修改 `registry.rs`

`AgentRun` 加：
```rust
session_id: Option<String>,
event_log: EventLog,
```

`start()` 改为调 `loop_::run_agent_loop()`。

---

## 阶段 4：Handoff + 决策 + 子 Agent

### `backend/src/agent/handoff.rs`

```rust
pub async fn generate_handoff_document(
    client: &reqwest::Client,
    params: &AgentStartParams,
    messages: &[ChatMessage],
    context_usage: &AgentContextUsageSnapshot,
    workspace_dir: Option<&str>,
) -> Result<String, String>;
```

### `backend/src/agent/handoff_snapshot.rs`

```rust
pub struct HandoffGitSnapshot { branch, status_short, diff_stat, unstaged_diff, staged_diff, recent_log }
pub async fn collect_git_snapshot(workspace_dir: &str) -> Result<HandoffGitSnapshot, String>;
```

### `backend/src/agent/handoff_workspace.rs`

```rust
pub async fn write_tool_archives(...) -> Result<Vec<ToolArchiveEntry>, String>;
```

### `backend/src/agent/decision.rs`

```rust
pub struct DecisionResponse { outcome, selected_option_id, reason, risk_level, ... }
pub async fn request_proxy_decision(...) -> Result<DecisionResponse, String>;
```

### `backend/src/agent/subagent.rs`

```rust
pub struct SubAgentOutput { task, steps: Vec<SubAgentStep>, summary, rounds, tool_calls, tokens_used, error, content }
pub struct SubAgentStep { kind, text, tool_name, tool_label, state }
pub async fn run_sub_agent(
    task, context, tools, depth, max_depth: usize,  // max_depth = 3
    parent_params, client, broadcaster, cancel_token, registry, db
) -> Result<SubAgentOutput, String>;
```

**实现**：构建新的 `AgentStartParams`（简化 system prompt + 受限工具），递归调用 `run_agent_loop()`。

---

## 阶段 5：HTTP + 模块注册 + 前端

### 5.1 注册模块

`backend/src/agent/mod.rs` 添加所有新模块的 `pub mod` 声明。修改 `agent_start()` 签名传入 `db`。

### 5.2 新增路由

```
GET /api/agent/session/{session_id}/status
  → { running: bool, taskId?: string, lastSeq?: number, status?: string }

GET /api/agent/stream/{task_id}?from_seq={N}
  → SSE：先补发 event_log 中 from_seq+ 的事件，再实时推送
```

### 5.3 前端修改

修改 `frontend/src/features/agent/store/agent-store.tsx` 的 `sendMessage`：

```
旧：buildAgentMessages() → runAgentWithTools() (797 行循环)
新：POST /api/agent/start → 连接 SSE → 纯 UI 渲染

不删 lib/db/（它是 HTTP API 封装）。
SSE 事件从「写 DB + 渲染」变为「只渲染」（后端 agent 自己写 SQLite）。
```

---

## 差异陷阱

| 情况 | 做法 |
|------|------|
| NaN/Infinity | 检查后替换为 `Value::Null` |
| HashMap 无序 | 确定性输出用 `BTreeMap` |
| 正则无 lookbehind | `fancy-regex` crate 或重写 |
| `3/2 = 1` | token 估算用 `f64` + `.ceil()` |
| `Mutex` 跨 `.await` | `tokio::sync::Mutex` |
| `Option` → null | `#[serde(skip_serializing_if = "Option::is_none")]` |
| `Vec` → null | `#[serde(default, skip_serializing_if = "Vec::is_empty")]` |

---

## 文件创建顺序

```
1.  修改 backend/src/agent/types.rs
2.  backend/src/agent/event_log.rs
3.  backend/src/agent/tool_dispatch.rs      ← 阶段 1
4.  backend/src/agent/system_prompt.rs      ← 阶段 2
5.  backend/src/agent/message_builder.rs    ← 阶段 2
6.  backend/src/agent/compaction.rs         ← 阶段 3
7.  backend/src/agent/context_monitor.rs    ← 阶段 3
8.  backend/src/agent/stall_detect.rs       ← 阶段 3
9.  backend/src/agent/retry.rs              ← 阶段 3
10. backend/src/agent/loop_.rs              ← 阶段 3 核心
11. 修改 backend/src/agent/registry.rs      ← 阶段 3
12. backend/src/agent/handoff.rs            ← 阶段 4
13. backend/src/agent/handoff_snapshot.rs   ← 阶段 4
14. backend/src/agent/handoff_workspace.rs  ← 阶段 4
15. backend/src/agent/decision.rs           ← 阶段 4
16. backend/src/agent/subagent.rs           ← 阶段 4
17. 修改 backend/src/agent/mod.rs          ← 阶段 5（注册模块 + agent_start 加 db 参数）
18. 修改 backend/src/http/mod.rs             ← 阶段 5（新增 /api/agent/session/... 和 SSE 重连路由）
19. 修改前端 agent-store.tsx                ← 阶段 5 最后
```

每完成一个文件 → `cargo check`。全部完成后 → `cargo test` → 手动端到端验证。


## 验证清单

- [ ] `cargo check` 无错误
- [ ] `cargo test` 全通过
- [ ] 发送消息 → 后端跑 agent 循环 → 前端看到流式输出
- [ ] 关闭浏览器 → agent 继续跑 → 重新打开 → 无缝恢复（含 streaming 状态）
- [ ] 取消操作正常工作
