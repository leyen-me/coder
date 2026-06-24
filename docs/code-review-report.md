# Coder 代码 Review 报告

> 本报告由 AI Agent 自动生成，记录对 Coder 项目的系统性代码审查结果。
> 每次完成一个功能点的 review 后，将 P0（严重）和 P1（重要）问题追加到此文档。
> 
> - **P0**：可能导致崩溃、数据丢失、安全漏洞的问题，需立即修复
> - **P1**：可能影响用户体验、性能或可维护性的问题，应尽快修复
> - Review 日期：2026-06-23

---

## 1. Agent 核心系统 (Agent Loop, Runner, Cancellation, Streaming)

Review 文件：`agent-loop.ts`, `runner.ts`, `cancellation.ts`, `streaming-buffer.ts`, `chat-retry.ts`, `tool-call-stall.ts`

### P0 问题

1. **P0-1: spawn_subagent 中 API Key 可能通过 subTaskId 泄露到子 agent 的上下文**
   - 位置：`spawn-subagent.ts:96-100`
   - 描述：`spawnSubAgentHandler` 将 `providerConfig.apiKey` 直接传递给子 agent 的 `runAgentWithTools`。如果子 agent 在消息中记录了 API Key（例如通过 error message），可能导致密钥泄露到数据库/消息历史中。
   - 风险：安全 — API Key 泄露

2. **P0-2: write_file 不检查 .gitignore**
   - 位置：`write_file.rs:52-120`
   - 描述：`tool_write_file` 没有 `respect_gitignore` 参数，也不检查目标路径是否被 .gitignore 忽略。这意味着 agent 可能意外创建被 git 忽略的文件（如 `.env`、`.log`），导致敏感数据进入版本控制。
   - 风险：安全 — 敏感文件可能被意外提交

### P1 问题

1. **P1-1: streaming-buffer 的 flush 链式 Promise 可能导致内存泄漏**
   - 位置：`streaming-buffer.ts:278-286`
   - 描述：`flushChains` Map 存储了每个 messageId 的 flush Promise 链。如果 `clear` 被调用但之前的 flush 尚未完成，`flushChains.delete(messageId)` 会移除引用，但如果 onFlush 内部有长时间操作（如数据库写入），旧的 Promise 可能持有大量缓冲区引用。
   - 风险：长期运行时内存增长

2. **P1-2: agent-loop 中 tool call 并行执行时 error 处理不完整**
   - 位置：`agent-loop.ts:536-540`
   - 描述：当某个 tool 执行失败（`kind === "fail"`），代码跳过了 `tool_call_finished` 事件的发射，但也没有将错误结果追加到 messages 中。这导致 LLM 不知道该 tool 调用的结果，可能导致 agent 产生幻觉或重复调用同一工具。
   - 风险：Agent 行为异常

3. **P1-3: cancelAgent 在 runner.ts 中先 kill shell 再 cancel agent**
   - 位置：`runner.ts:87-102`
   - 描述：`cancelAgent` 先调用 `shell_kill_by_task`，再调用 `agent_cancel`。如果 agent 正在等待 tool 执行（如 shell），kill shell 后 agent 可能已经抛出了 cancellation error，此时 `agent_cancel` 的 "Task not found" 误报会被吞掉。顺序应反过来：先 cancel agent，再清理资源。
   - 风险：调试困难，可能导致未清理的资源

4. **P1-4: context-monitor 的 handoff 阈值计算可能不准确**
   - 位置：`context-monitor.ts`（待深入审查）
   - 描述：上下文 handoff 触发依赖于 token 估算。如果估算与实际 provider 返回的 token 计数偏差较大，可能导致过早或过晚触发 handoff。
   - 风险：上下文管理效率

---

## 2. Agent 工具系统 (Tool Implementations)

Review 文件：`src/features/agent/tools/` 下所有工具实现（read-file, write-file, replace-file, edit-file, glob, grep, list-dir, browse-page, web-search, send-email, read-skill, create-skill, update-skill, list-skills, todo-read, todo-write, get-workspace-tree, plan tools）

### P0 问题

1. **P0-3: send-email.ts 缺少 Array.isArray 守卫**
   - 位置：`send-email.ts:106`
   - 描述：验证检查 `typeof rawArgs !== "object" || rawArgs === null` 未包含 `Array.isArray(rawArgs)`。由于 `typeof [] === "object"`，传入数组 `[1,2,3]` 会绕过验证。与其他所有工具的验证模式不一致。
   - 风险：输入验证绕过

2. **P0-4: read-skill.ts 缺少 Array.isArray 守卫**
   - 位置：`read-skill.ts:36`
   - 描述：与 P0-3 相同问题。传入 `[1]` 会通过检查，然后 `(rawArgs as ReadSkillArgs).slug` 为 `undefined`，导致下游出现难以理解的错误而非清晰的验证失败。
   - 风险：输入验证绕过

3. **P0-5: 文件工具缺少前端路径遍历验证**
   - 位置：`read-file.ts`, `write-file.ts`, `replace-file.ts`, `edit-file.ts`, `list-dir.ts`, `glob.ts`, `grep.ts`
   - 描述：所有文件操作工具在前端未对路径进行 `..` 序列或绝对路径验证。路径直接传递给 Tauri 后端 invoke 调用，未经任何净化。虽然 Rust 后端有防护，但纵深防御要求前端也做验证。
   - 风险：如果后端存在路径解析漏洞，LLM 生成的恶意路径（如 `../../../etc/passwd`）可能逃逸工作区

### P1 问题

1. **P1-5: 输入验证模式不一致**
   - 位置：多个工具文件
   - 描述：三种不同验证模式共存：Pattern A（检查 undefined/null + Array.isArray）、Pattern B（仅 typeof + null，如 send-email/read-skill）、Pattern C（合并检查）。增加维护负担和遗漏边缘情况的風險。
   - 风险：可维护性

2. **P1-6: 数值参数缺少范围验证**
   - 位置：`read-file.ts`, `glob.ts`, `grep.ts`, `list-dir.ts`
   - 描述：`start_line`, `max_lines`, `head_limit`, `max_depth`, `context_before/after` 等仅验证类型（typeof === "number"），未检查负值、NaN、Infinity 或不合理大值。例外：`get-workspace-tree.ts` 和 `web-search.ts` 做了正确的范围验证。
   - 风险：可能导致内存耗尽或异常行为

3. **P1-7: write/replace 操作无内容大小限制**
   - 位置：`write-file.ts:77-79`, `replace-file.ts:82-84`
   - 描述：`content` 字段仅验证类型，无最大尺寸限制。LLM 可能生成超大字符串，导致磁盘耗尽或 OOM。
   - 风险：资源耗尽

4. **P1-8: Email 凭据存储在 localStorage**
   - 位置：`send-email.ts:29-38`（`readEmailSettings()`）
   - 描述：SMTP 密码以明文存储在 `localStorage`，无加密。若浏览器上下文被攻破或 DevTools 可访问，凭据可能被提取。
   - 风险：敏感数据暴露

5. **P1-9: 错误处理模式不一致**
   - 位置：`glob.ts:46`, `grep.ts:64`, `list-dir.ts:46` vs `read-file.ts:47-57`, `write-file.ts:44-54`
   - 描述：部分工具使用结构化错误解析（如 `parseReadFileToolError`），其他工具（glob/grep/list-dir）回退到通用 `execution_failed` 错误，导致错误信息不够可操作。
   - 风险：调试困难

---

## 3. Rust 后端工具 (Shell, Network, Remote, Browse)

Review 文件：`src-tauri/src/tools/shell.rs`, `pty_terminal.rs`, `shell_registry.rs`, `network.rs`, `browse_page.rs`, `web_search.rs`, `remote_connection.rs`, `mail.rs`, `search.rs`, `workspace_tree.rs`

### P0 问题

1. **P0-6: Shell 命令注入 — 未消毒的命令直接传递给系统 shell**
   - 位置：`shell.rs:182-194`（`shell_command_builder`）
   - 描述：用户/AI 输入的命令字符串直接传递给系统 shell（Windows: `cmd /C`，Unix: `sh -c`），无任何消毒、允许列表或命令策略执行。工作目录通过 `resolve_workspace_path` 沙箱化，但命令内容本身不受限制。
   - 风险：如果攻击者控制命令输入，可导致完整系统破坏、数据销毁、权限提升

2. **P0-7: SSH Host Key 验证被禁用（无存储的 TOFU）**
   - 位置：`remote_connection.rs:83`（`let _ = session.host_key();`）
   - 描述：SSH host key 被获取但立即丢弃。无 host key 验证、known_hosts 检查或用户确认。每次连接都盲目信任服务器的 host key，允许中间人攻击。
   - 风险：凭据（密码、密钥）传输到攻击者控制的服务器

3. **P0-8: SSH 私钥写入未加密的临时文件**
   - 位置：`remote_connection.rs:102-131`（`KeyContent` auth variant）
   - 描述：使用内联密钥内容认证时，SSH 私钥被写入临时文件 `temp_dir/coder-ssh-key-{uuid}/id_rsa`。虽然认证后清理，但存在竞态窗口。若进程在此窗口崩溃或被杀，私钥会持久留在磁盘上。无安全删除（如 shred）。
   - 风险：本地攻击者或取证分析可恢复私钥

### P1 问题

1. **P1-10: DNS Rebinding — 重定向后验证**
   - 位置：`network.rs:107-124`（`fetch_public_url`）
   - 描述：URL 在请求时验证（line 112），HTTP 客户端跟随重定向后重新验证 `final_url`（line 124）。但此验证使用同步 DNS 解析，可能过期。攻击者可设置域名初始解析到公网 IP（通过验证），然后在重定向后更改 DNS 指向私有 IP。
   - 风险：访问内部服务（云元数据、localhost API、内部数据库）

2. **P1-11: Shell Registry 内存泄漏 — 已完成 shell 从未被清除**
   - 位置：`shell_registry.rs:43-52, 619-663`
   - 描述：完成的 shell 永久保留在 `shells: HashMap` 中。`wait_for_child` 将状态更新为 Completed/Failed，但从未从注册表移除条目。长时间运行的会话会累积数百个带有完整 stdout/stderr 的 shell 条目。无 LRU 淘汰、TTL 清理或定期清除机制。
   - 风险：无界内存增长导致 OOM 崩溃

3. **P1-12: PTY Reader 线程在应用关闭时成为孤儿**
   - 位置：`pty_terminal.rs:114-165`
   - 描述：PTY reader 作为原始 `std::thread::spawn` 启动（line 114），无句柄存储和清理机制。若应用意外退出，此线程可能不会优雅终止，留下 PTY master fd 打开且子 shell 进程作为孤儿运行。
   - 风险：孤立的 shell 进程消耗系统资源、文件描述符泄漏

4. **P1-13: SSH 进程 Kill 直接使用 SIGKILL**
   - 位置：`shell_registry.rs:676-683`（`kill_process_tree`）
   - 描述：Unix 上进程直接用 `kill -9 <pid>`（SIGKILL）终止，未先发送 SIGTERM 允许优雅关闭。可能导致正在进行文件写入、数据库事务等原子操作的进程数据丢失。
   - 风险：输出文件损坏、不完整的构建、丢失的数据

5. **P1-14: browse_page 的 allow_private_network 默认为 true**
   - 位置：`browse_page.rs:46`（`allow_private_network.unwrap_or(true)`）
   - 描述：`tool_browse_page` 在未指定时默认 `allow_private_network` 为 `true`。AI agent 可默认浏览 localhost、内部 API 和私有网络服务。结合 P1-10（DNS rebinding），可访问内部服务而无需用户明确同意。
   - 风险：SSRF / 内部信息泄露

6. **P1-15: SSH Idle Reaper 任务永不终止**
   - 位置：`remote_connection.rs:214-241`（`start_idle_reaper`）
   - 描述：空闲会话清理器作为无限 `loop` 通过 `tauri::async_runtime::spawn` 启动。无取消令牌、关闭信号或应用退出时停止任务的机制。
   - 风险：后台任务在应用关闭后持续运行（若运行时未清理）

---

## 4. 数据库层与聊天系统 (Database & Chat/Message System)

Review 文件：`src/lib/db/`（client, messages, sessions, subscriptions, fork-session, normalize-session, types, stats, clear-chat-data, agent-todos, message-tools, chat-search）, `src/features/chat/`（hooks, contexts, lib）, `src/features/agent/store/agent-store.tsx`

### P0 问题

1. **P0-9: touchSession 竞态条件 — read-modify-write 风暴**
   - 位置：`sessions.ts:121-133`, `messages.ts:101-106`
   - 描述：`touchSession` 执行 read-modify-write（get → update updatedAt → put）。快速流式刷新期间，多个并行的 `touchSession` 调用会互相覆盖 `updatedAt`。IndexedDB 事务在 store 之间不是原子的。
   - 风险：会话列表排序可能不正确

2. **P0-10: 流式 Flush 与直接 DB 写入竞态**
   - 位置：`agent-store.tsx:210-231`（silent flush）, `agent-store.tsx:412-427`（non-silent tool write）
   - 描述：streaming buffer 以 `{ silent: true }` 刷新到 IndexedDB，但独立事件处理器发出非 silent 写入（如 `addMessageToolInvocation`）。两者可能竞态：flush 读取消息 → 合并 processSteps/toolInvocations → 写入；同时 tool 事件处理器读取同一消息（过期数据）→ 合并 → 写入。一方的数据被另一方覆盖。
   - 风险：高吞吐量流式传输期间工具调用或 process steps 丢失

3. **P0-11: deleteMessagesBySession 无事务原子性**
   - 位置：`messages.ts:144-156`
   - 描述：每个 `db.delete` 创建独立隐式事务。若应用删除中途崩溃，部分消息被删除而其他消息保留。
   - 风险：会话删除后遗留孤立消息

4. **P0-12: deleteSession 先删会话再删消息**
   - 位置：`sessions.ts:144-152`
   - 描述：会话在消息之前被删除。若 `deleteMessagesBySession` 失败或中断，孤立消息引用不存在的会话。
   - 风险：数据完整性 — 孤立消息

5. **P0-13: forkSessionFromMessage TOCTOU 竞态**
   - 位置：`fork-session.ts:17-70`
   - 描述：session 和 messages 并行获取（`Promise.all`）。若两读之间有新消息加入源会话，fork 会遗漏该消息。
   - 风险：不完整的 fork — 近期消息可能丢失

### P1 问题

1. **P1-16: searchMessages/searchChats 全表扫描**
   - 位置：`messages.ts:182-201`, `chat-search.ts:85-141`
   - 描述：搜索加载 IndexedDB 中所有消息到内存，然后在 JavaScript 中过滤。数千条消息时导致主线程阻塞、高内存使用。
   - 风险：搜索时 UI 冻结

2. **P1-17: stats.ts 重复全表加载**
   - 位置：`stats.ts:141-383`
   - 描述：每个统计查询独立调用 `db.getAll(MESSAGES_STORE)`。Dashboard 同时渲染多个统计卡片时，消息表被加载 5-6 次。
   - 风险：Dashboard 渲染导致过度 IndexedDB 读取和主线程阻塞

3. **P1-18: useChatSessions 无防抖**
   - 位置：`use-chat-sessions.ts:44-49`
   - 描述：与 `useSessionMessages`（150ms debounce）不同，`useChatSessions` 在每次 DB 变更时立即重新获取会话列表。流式传输期间触发频繁的全量会话列表获取。
   - 风险：不必要的重渲染和 IndexedDB 读取

4. **P1-19: useSessionData 流式期间过期数据窗口**
   - 位置：`use-session-messages.ts:158-177`
   - 描述：流式 overlay 活跃时，DB 变更通知被抑制。若另一标签页修改了同一会话的消息，更改不会反映直到流式完成。
   - 风险：短暂 UI 不一致

5. **P1-20: notifyDbChange 无错误处理**
   - 位置：`subscriptions.ts:12-15`
   - 描述：若任一监听器抛出异常，后续监听器被静默跳过。可能导致部分 UI 数据过期。
   - 风险：一个监听器崩溃导致静默数据过期

6. **P1-21: streaming-buffer flush 错误静默吞没**
   - 位置：`streaming-buffer.ts:278-286`
   - 描述：flush 错误被 `.catch(() => {})` 静默吞没。若 IndexedDB 满或损坏，刷新失败且流式内容丢失，无任何指示。
   - 风险：静默数据丢失

7. **P1-22: normalize-session Provider 白名单可能遗漏新 Provider**
   - 位置：`normalize-session.ts:68-93`
   - 描述：硬编码白名单未包含的新 provider 被静默映射为 `"custom"`，丢失实际 provider 身份。
   - 风险：Provider 信息丢失

8. **P1-23: agent-store 会话更新 fire-and-forget**
   - 位置：`agent-store.tsx:1124-1129, 1268-1273`
   - 描述：模型/provider 更新以 fire-and-forget 方式发出，错误被静默忽略。若写入失败（如会话被并发删除），模型选择未持久化。
   - 风险：模型选择静默丢失

9. **P1-24: useDisplayMessages useMemo 内缓存突变**
   - 位置：`use-session-messages.ts:208-247`
   - 描述：在 `useMemo` 内部修改 `cachedOverlaysRef.current`。React StrictMode 下 useMemo 可能双调用，导致缓存更新不一致。
   - 风险：开发模式下过期 overlay 数据

10. **P1-25: forkSessionFromMessage 通知风暴**
    - 位置：`fork-session.ts:48-66`
    - 描述：每个 `createMessage` 触发独立 `notifyDbChange()`。N 条消息的 fork 产生 N+1 次变更通知，导致 N+1 次完整重新获取。
    - 风险：fork 性能下降、UI 闪烁

---

## 5. 设置系统、模型 Provider 与 Lab 功能 (Settings, Model Provider, Lab)

Review 文件：`src/features/settings/`, `src/lib/model-provider/`, `src/features/lab/`

### P0 问题

1. **P0-14: API Key 以明文存储在 localStorage**
   - 位置：`model-provider/storage.ts:28`
   - 描述：API keys 通过 `JSON.stringify(settings)` 直接存入 localStorage，无加密或掩码。localStorage 可被任何 XSS 漏洞、浏览器扩展或 DevTools 访问。
   - 风险：安全 — API Key 泄露

2. **P0-15: Custom Base URL 无验证**
   - 位置：`model-provider-settings-panel.tsx:68-71`
   - 描述：自定义 base URL 输入接受任意字符串，无协议验证（http/https）、格式检查。用户可能输入 `javascript:` URLs、file:// 路径或格式错误的字符串。
   - 风险：安全 / 可靠性 — API 调用失败或潜在 SSRF

### P1 问题

1. **P1-26: isRecord() 在 Lab Settings 中允许数组**
   - 位置：`parse-lab-settings.ts:9-11`
   - 描述：`isRecord` 检查 `typeof value === "object" && value !== null` 但未排除数组。若存储的 lab settings 为数组，会通过验证并导致下游属性访问错误。
   - 风险：数据损坏 / 运行时错误

2. **P1-27: Legacy 迁移后旧 Storage Key 未清理**
   - 位置：`lab/storage.ts:37-45`
   - 描述：从旧 key `coder:lab:prompt-refine-enabled` 迁移到新统一存储时，旧 key 从未被移除。localStorage 中留下过期数据。
   - 风险：数据完整性

3. **P1-28: 空 Custom Base URL 产生空 baseUrl**
   - 位置：`resolve-provider-config.ts:19`
   - 描述：自定义 provider 的 `customBaseUrl.trim()` 可能返回空字符串（用户未配置 base URL）。空字符串被用作 API 端点。
   - 风险：运行时错误

4. **P1-29: Thinking Config 模板检测忽略 defaultEnabled**
   - 位置：`thinking-config.ts:108-126`
   - 描述：`detectThinkingConfigTemplate()` 仅比较 `enabled` 和 `disabled` 字段，忽略 `defaultEnabled`。参数匹配但 defaultEnabled 不同的配置会被错误识别为已知模板。
   - 风险：不正确的 UI 状态

5. **P1-30: 添加新 Model 时创建空 ID**
   - 位置：`custom-models-editor.tsx:191-197`
   - 描述："Add Model" 按钮创建空字符串 ID 的模型。`normalizeModels` 虽过滤空 ID，但 UI 在规范化前仍渲染该行，造成困惑的中间状态。
   - 风险：数据质量 / UX

6. **P1-31: DeepSeek Balance 获取无超时**
   - 位置：`deepseek-balance.ts:15-49`
   - 描述：`fetch()` 调用无 AbortSignal 或超时。若 DeepSeek API 挂起，余额检查可能无限阻塞。
   - 风险：可靠性 / UX

7. **P1-32: Prompt Refine 静默吞没 HTTP 错误**
   - 位置：`refine-prompt.ts:148-150`
   - 描述：非 200 响应返回 `null`，不记录日志。API 配置错误或认证失败对用户和开发者不可见。
   - 风险：可调试性 / UX

8. **P1-33: Model ID 输入未 Trim**
   - 位置：`custom-models-editor.tsx:50`
   - 描述：模型 ID 输入存储原始值，未 trim。空白 ID 或尾部空格可能创建解析时静默失败的模型。
   - 风险：数据质量

9. **P1-34: Lab Settings Patching 使用浅合并**
   - 位置：`lab-settings-store.ts:31-35`
   - 描述：`patchLabSettings` 使用浅 spread 合并，嵌套对象如 `responseStyle` 被完全覆盖而非深度合并。
   - 风险：数据丢失

10. **P1-35: Custom Prompt 无长度限制**
    - 位置：`parse-lab-settings.ts:29-37`
    - 描述：自定义 prompt 仅验证为字符串，无长度限制。超长 prompt 可能膨胀 localStorage 并导致序列化问题。
    - 风险：存储膨胀 / 性能

---

## 6. 右侧面板与文件树 (Right Panel, File Tree, Preview/Editor, Watcher)

Review 文件：`src/features/right-panel/`（hooks, lib, components）

### P0 问题

1. **P0-16: file-preview.tsx 加载失败时内容被静默擦除**
   - 位置：`file-preview.tsx:109-113`
   - 描述：当 `readWorkspaceFile` 抛出异常（网络错误、权限拒绝）时，catch 块重置所有状态（content, savedContent, sha256）。若用户正在编辑且自动重载触发瞬态错误，所有未保存更改被静默丢弃。
   - 风险：数据丢失

2. **P0-17: 外部重载时不检查未保存更改**
   - 位置：`file-preview.tsx:86-127, 191`
   - 描述：`onReload` 回调调用 `loadFile`，覆盖 content 和 savedContent。若用户有未保存编辑时外部文件变更触发重载，编辑被覆盖而无确认对话框。
   - 风险：数据丢失

3. **P0-18: File Watcher 异步清理导致内存泄漏**
   - 位置：`use-file-watcher.ts:30-46`
   - 描述：`listen()` 返回 Promise，cleanup 函数异步注册。若组件在 Promise 解析前卸载，cleanup 在空的 cleanups 数组上运行，监听器保持附加状态——导致内存泄漏和未挂载组件的回调崩溃。
   - 风险：内存泄漏 / 崩溃

4. **P0-19: Delete 跳过未保存更改检查**
   - 位置：`use-file-tree-actions.ts:391-411`
   - 描述：`confirmDelete` 调用 `onFileClose?.(path)` 但不触发未保存更改对话框。从树上下文菜单删除有未保存编辑的文件时，用户工作无警告丢失。
   - 风险：数据丢失

5. **P0-20: Rename 不验证打开编辑器状态**
   - 位置：`use-file-tree-actions.ts:342-346`
   - 描述：重命名有未保存更改的打开预览文件时，编辑器的 sha256 hash 过期（指向旧路径），后续保存尝试以 "file_changed" 错误失败，可能丢失编辑。
   - 风险：数据丢失

6. **P0-21: Editor Session Map 在关闭期间可能过期**
   - 位置：`use-file-editor-sessions.ts:36-46, 89-95`
   - 描述：`createRequestClose` 和 `confirmSave` 都从 `sessionsRef.current.get(path)` 读取。dirty check 与 save 之间，若组件卸载或文件被外部删除，session 可能为 null。
   - 风险：竞态条件

### P1 问题

1. **P1-36: 无界并行目录加载**
   - 位置：`use-workspace-file-tree.ts:128`
   - 描述：刷新时所有展开目录通过 `Promise.all` 并行加载。50+ 文件夹时产生并发 Tauri invoke 调用爆发，导致 UI 卡顿和后端竞争。
   - 风险：性能

2. **P1-37: handleExpandedChange 依赖 entriesByPath 触发重渲染**
   - 位置：`use-workspace-file-tree.ts:154`
   - 描述：`entriesByPath` Map 在每次目录加载时替换，导致 `handleExpandedChange` 频繁重建，树组件不必要重渲染。
   - 风险：性能

3. **P1-38: Monaco 全量 Remount on Tab Switch**
   - 位置：`monaco-preview-editor.tsx:56`
   - 描述：`key={path}` 强制 Monaco 每次文件切换时完全 remount。大文件（1000+ 行）时导致明显延迟和内存 churn。
   - 风险：性能

4. **P1-39: Delete Dialog 静默吞没错误**
   - 位置：`file-tree-dialogs.tsx:185-194`
   - 描述：catch 块为空（`catch {}`）。删除失败时对话框不关闭且无内联反馈。
   - 风险：UX

5. **P1-40: 文件名字符无验证**
   - 位置：`file-tree-dialogs.tsx:87-92`
   - 描述：仅验证非空，不拒绝文件系统无效字符（`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`）。用户输入这些字符得到不透明的后端错误。
   - 风险：UX

6. **P1-41: 仅考虑根 .gitignore**
   - 位置：`gitignore.ts:12-13`
   - 描述：嵌套 `.gitignore`（如 `src/.gitignore`）未加载。被嵌套 gitignore 忽略的文件会出现在树中。
   - 风险：正确性

7. **P1-42: .gitignore 每次刷新重新解析**
   - 位置：`use-gitignore.ts:31-65`
   - 描述：`.gitignore` 在每次 `refreshTick` 时从磁盘读取并解析。应缓存 matcher 直到 `.gitignore` 本身变更。
   - 风险：性能

8. **P1-43: closeFile 嵌套 setState**
   - 位置：`use-file-preview-tabs.ts:37-59`
   - 描述：在 `setTabs` updater 内调用 `setActiveTabPath`。嵌套 setState 模式脆弱，React 18 并发特性下可能行为异常。
   - 风险：稳定性

---

## 7. 终端、工作区、快捷键、i18n、主题 (Terminal, Workspace, Keyboard Shortcuts, i18n, Theme)

Review 文件：`src/features/terminal/`, `src/features/workspace/`, `src/lib/keyboard-shortcuts/`, `src/features/keyboard-shortcuts/`, `src/lib/i18n/`, `src/lib/theme/`

### P0 问题

1. **P0-22: Shell Process Store stdout/stderr 字符串无界增长**
   - 位置：`shell-processes-context.tsx:234-238`
   - 描述：`appendStream` 无限追加数据到 stdout/stderr 字符串。长时间运行的进程在内存中累积输出，无任何截断或上限，导致无界内存增长和渲染大字符串时 UI 冻结。
   - 风险：内存泄漏 / 性能退化

2. **P0-23: 生产环境 Polling Interval 永不清除**
   - 位置：`shell-processes-context.tsx:91-95, 107-123`
   - 描述：`pollIntervalId` 仅在 `import.meta.hot.dispose()` 内清除。生产构建中 HMR 被禁用，轮询间隔（`setInterval(refreshProcesses, 2000)`）永远运行且永不清理。
   - 风险：内存泄漏 / 资源泄漏

3. **P0-24: 使用 Agent tool 验证工作区目录**
   - 位置：`use-validated-workspace-dir.ts:38-54`
   - 描述：工作区验证使用 `invoke("tool_list_dir", ...)` 检查目录是否存在。这是可能有副作用、速率限制或成本影响的 agent tool。应使用专用的文件系统检查。
   - 风险：安全 / 性能

4. **P0-25: 快捷键冲突检测不完整**
   - 位置：`match.ts:125-129`
   - 描述：`bindingsConflict` 仅比较规范化字符串的精确匹配。不检测用户设置 `mod+k` 而 `mod+shift+k` 已分配的情况——这些是不同的字符串但在快速按键时可能混淆。更严重的是，不警告与 OS 级快捷键（如 `mod+n`, `mod+w`）的冲突。
   - 风险：UX / 可用性

5. **P0-26: terminal.* 消息 Key 在 Schema 中缺失**
   - 位置：`terminal-tab.tsx:111, 230, 259, 260, 283, 299, 317` vs `message-schema.ts`
   - 描述：终端组件使用 `terminal.unavailable`, `terminal.processStatus.*`, `terminal.closeSession` 等翻译 key，这些不在 Messages 类型 schema 中。translator 回退到返回 key 字符串本身，导致 UI 显示原始 key 名。
   - 风险：缺失翻译 / UX

### P1 问题

1. **P1-44: Shell 输出事件在 Poll 初始化前的竞态**
   - 位置：`shell-processes-context.tsx:70-96`
   - 描述：`initializeShellProcessStore` 设置事件监听器后调用 `refreshProcesses()`。若 shell 进程在监听器注册和初始轮询完成之间结束，其输出可能丢失。
   - 风险：数据丢失 / 竞态条件

2. **P1-45: xterm Theme 应用导致视觉闪烁**
   - 位置：`interactive-terminal.tsx:189-195`
   - 描述：主题更新使用 `setTimeout(..., 0)` 延迟 xterm canvas 更新。可能导致主题切换期间终端短暂显示不匹配颜色的可见闪烁。
   - 风险：视觉闪烁 / UX

3. **P1-46: ResizeObserver 在布局动画期间过度触发**
   - 位置：`interactive-terminal.tsx:130-148`
   - 描述：ResizeObserver 每次 resize 事件都触发 `fitAddon.fit()` 和 `pty_resize` invoke，无防抖/节流。面板折叠/展开动画期间可能产生数十次快速 IPC 调用。
   - 风险：性能退化

4. **P1-47: 工作区目录外部删除后不重新验证**
   - 位置：`use-validated-workspace-dir.ts:18-59`
   - 描述：仅在 `workspaceDir` 变化时验证。若工作区目录被外部删除，应用继续使用过期路径直到组件用新值重新渲染。无周期性重新验证或文件系统 watcher 集成。
   - 风险：过期状态 / UX

5. **P1-48: set_workspace_dir Rust invoke 错误静默忽略**
   - 位置：`workspace-provider.tsx:54-58`
   - 描述：`.catch()` handler 仅记录到 console，无用户反馈。若 Rust 文件 watcher 更新失败，应用可能处于不一致状态（UI 显示新工作区，但后端监视旧的）。
   - 风险：静默失败 / 状态不一致

6. **P1-49: eventToBinding 修饰符排序与 normalizeBinding 不一致**
   - 位置：`match.ts:68-102`
   - 描述：`eventToBinding` 产生 `mod+ctrl+shift+alt+key`，但存储/默认绑定使用 `mod+key` 或 `ctrl+key`。排序逻辑可能为语义等效的组合键产生不同的字符串表示，导致冲突检测假阴性。
   - 风险：Bug / 不正确行为

7. **P1-50: global.newWindow 无运行时检查调用 Tauri API**
   - 位置：`keyboard-shortcuts.tsx:48-50`
   - 描述：`tauriInvoke("create_new_window")` 直接调用，未检查 `isTauri()`。Web 部署中用户按快捷键时会抛出未处理错误。
   - 风险：运行时错误

8. **P1-51: 键盘事件监听器缺少 capture:true**
   - 位置：`keyboard-shortcuts.tsx:135`
   - 描述：`keydown` 监听器无 `{ capture: true }`。若子组件在全局 handler 运行前调用 `event.stopPropagation()`，快捷键被静默吞没。影响嵌套对话框和 iframe。
   - 风险：快捷键可靠性

9. **P1-52: getMessageByPath 回退到 Key 字符串无警告**
   - 位置：`create-translator.ts:4-17`
   - 描述：消息 key 未找到时，函数返回原始 key 路径作为显示文本。静默产生对用户令人困惑的输出。
   - 风险：静默失败 / 缺失翻译

10. **P1-53: formatMessage 正则不处理嵌套花括号或转义**
    - 位置：`format-message.ts:9-11`
    - 描述：正则 `/\{(\w+)\}/g` 仅匹配花括号内的单词字符。不能处理带数字、下划线的参数名（如 `{param_1}`, `{count0}`）。缺失参数保留为字面 `{key}` 字符串。
    - 风险：有限参数支持

11. **P1-54: applyTheme 无 SSR 守卫**
    - 位置：`apply-theme.ts:3-7`
    - 描述：`initThemeBeforeRender` 检查 `typeof document === "undefined"`，但 `applyTheme` 本身不检查。SSR 或 Node.js 测试环境中调用会抛出 `document is not defined`。
    - 风险：运行时错误

12. **P1-55: getSystemPrefersDark SSR 回退可能导致 Hydration 不匹配**
    - 位置：`get-system-prefers-dark.ts:1-7`
    - 描述：SSR 上下文返回 `false`（亮色主题）。若客户端实际系统偏好为暗色，导致 ThemeProvider 协调前闪烁不正确主题。
    - 风险：视觉闪烁 / Hydration 不匹配

13. **P1-56: applyTheme 使用 classList.toggle 而非显式设置**
    - 位置：`apply-theme.ts:6`
    - 描述：若其他脚本独立添加/移除 `"dark"` class，toggle 行为变得不可预测。应使用 `classList.add`/`classList.remove` 显式控制。
    - 风险：Class 碰撞风险

---

## 8. Skills 系统 (Skills System)

Review 文件：`src/features/skills/`（components, hooks, lib, pages, system, types）, `src/lib/db/skills.ts`

### P0 问题

1. **P0-57: readEnabledSkillBySlug 逻辑错误 — 系统技能被错误拒绝**
   - 位置：`resolve-skills.ts:85-91`
   - 描述：当 slug 匹配系统技能时，函数返回 `{ error: "not_found" }`。这是语义错误的——该技能确实存在，只是不是用户技能。使用此函数的 `read_skill` 工具会为所有系统技能 slug 失败。
   - 风险：高 — 工具调用失败

2. **P0-58: Prompt Injection via User-Created Skill Content**
   - 位置：`parse-skill-references.ts:16-29`
   - 描述：用户创建的技能内容被直接注入到 LLM prompt 中，无任何消毒或长度限制。恶意用户可制作包含对抗性指令的技能来覆盖 agent 行为（prompt injection 攻击）。
   - 风险：高 — 任意 prompt 注入

3. **P0-59: 突变 Hooks 中未处理的 Promise Rejections**
   - 位置：`use-skills.ts:49-62`
   - 描述：`setSystemEnabled`、`setUserEnabled`、`removeUserSkill` 均无 try/catch。若 IndexedDB 操作失败（如配额满、DB 损坏），会产生未处理的 promise rejection。
   - 风险：中 — 静默数据丢失或运行时崩溃

4. **P0-60: 删除确认对话框关闭时无错误反馈**
   - 位置：`skills-page.tsx:75-82`
   - 描述：若 `removeUserSkill` 抛出异常，对话框仍会关闭（通过 `onOpenChange`）。用户看不到错误并假设删除成功，而实际可能失败。
   - 风险：中 — 数据不一致

### P1 问题

1. **P1-57: Registry 文件膨胀（~540 行嵌入式 Prompt 文本）**
   - 位置：`registry.ts:24-544`
   - 描述：超过 500 行的技能内容作为字符串常量嵌入，实际代码从第 546 行才开始。文件膨胀至 670 行，增加调试难度和包体积。
   - 风险：可维护性差

2. **P1-58: Slug 查找线性扫描 — 无 IndexedDB Index**
   - 位置：`skills.ts:28-34`
   - 描述：每次 slug 查找都从 IndexedDB 加载所有用户技能并在内存中过滤。未定义 `slug` 索引。
   - 风险：性能随技能数量增长而退化

3. **P1-59: 重复的 Slug 验证（UI + DB 层）**
   - 位置：`user-skill-dialog.tsx:91`, `skills.ts:51-54`
   - 描述：Slug 唯一性在 UI 和 DB 层各检查一次，造成冗余且存在竞态窗口。
   - 风险：低 — DB 层应是唯一事实来源

4. **P1-60: 技能创建/更新无内容长度验证**
   - 位置：`skills.ts:43-72`
   - 描述：未验证 content 长度。用户可创建兆字节级别的内容，显著膨胀 prompt。
   - 风险：Token 预算耗尽

5. **P1-61: 技能开关操作无防抖/限流**
   - 位置：`use-skills.ts:49-62`
   - 描述：快速切换开关触发多次 IndexedDB 写入，每次写触发 `notifyDbChange()`。
   - 风险：不必要的重渲染

6. **P1-62: listEnabledSkillsForTools 排除系统技能**
   - 位置：`resolve-skills.ts:71-83`
   - 描述：仅返回用户技能，不包含系统技能。若意图是列出所有可用技能则存在 bug。
   - 风险：低（若为设计如此）/ 中（若为 bug）

7. **P1-63: getUserSkillCards 先 Map 后 Filter**
   - 位置：`resolve-skills.ts:174-188`
   - 描述：`.map()` 创建完整视图模型后再 `.filter()` 丢弃冲突项。应先过滤再映射。
   - 风险：低 — 性能微优化

8. **P1-64: SkillReferenceValidationError 错误消息不友好**
   - 位置：`skill-errors.ts:6`
   - 描述：Error message 仅为错误码字符串（"not_found"/"not_enabled"），非人类可读文本。
   - 风险：UX

9. **P1-65: SkillCard 可点击内容缺少 aria-label**
   - 位置：`skill-card.tsx:49-63`
   - 描述：CardContent 设为 `role="button"` 但无 `aria-label`，屏幕阅读器无法描述操作。
   - 风险：无障碍合规

---

## 9. Automations 系统 (Automations System)

Review 文件：`src/features/automations/`（components, hooks, lib, pages）, `src/lib/db/automations.ts`, `src/lib/db/automation-runs.ts`

### P0 问题

1. **P0-61: XSS via dangerouslySetInnerHTML with User-Controlled Input**
   - 位置：`delete-automation-dialog.tsx:34-38`
   - 描述：用户提供的自动化名称直接传入 `dangerouslySetInnerHTML`。若翻译字符串包含 HTML 格式化（如 `<strong>{name}</strong>`），恶意 HTML/JS 可能执行。
   - 风险：高 — XSS 安全漏洞

2. **P0-62: storeExecuteAutomation 中无界事件监听器泄漏**
   - 位置：`run-automation.ts:106-115`
   - 描述：若 agent 任务从未发出 `agent:task_completed`（崩溃、bug），事件监听器永远不会被移除，Promise 永远不 resolve。导致内存泄漏、自动化运行挂起（锁永久持有）、`finally` 块永不执行。
   - 风险：高 — 内存泄漏 / 锁死

3. **P0-63: Scheduler 在 App Unmount 时永不停止**
   - 位置：`scheduler.ts:7-25`
   - 描述：全局 `setInterval` 每 30 秒触发。若 `stopAutomationScheduler` 未在 app 卸载时调用，interval 持续运行，可能在 UI 消失后继续执行自动化。
   - 风险：中 — 资源泄漏

### P1 问题

1. **P1-66: 过期的相对时间显示**
   - 位置：`use-automations.ts:31-43`
   - 描述：`relativeTime` 计算一次后缓存，不会自动更新。"just now" 可能无限期持续直到下次 DB 变更。
   - 风险：UX

2. **P1-67: Search Input DOM 值与 React State 不同步**
   - 位置：`automation-run-history-sheet.tsx:86-106`
   - 描述：输入为非受控组件，但 debounced state 驱动过滤。关闭/重开 Sheet 时直接操作 DOM，可能导致视觉闪烁。
   - 风险：UX

3. **P1-68: load() 中静默吞没错误**
   - 位置：`use-automations.ts:62-63`
   - 描述：数据库错误被 `catch {}` 完全忽略。IndexedDB 损坏时用户看到空列表而无任何指示。
   - 风险：可调试性

4. **P1-69: storeExecuteAutomation 事件等待无超时**
   - 位置：`run-automation.ts:106-115`
   - 描述：与 P0-62 相关。自动化可能挂起数小时，运行状态永远为 "running"。
   - 风险：可靠性

5. **P1-70: Cron 表达式验证允许空字符串**
   - 位置：`types.ts:31-38`
   - 描述：`isValidCronExpression("")` 可能返回 true（取决于 cron-parser 版本）。Dialog 有单独检查，但函数本身应防御。
   - 风险：数据完整性

6. **P1-71: Delete 按钮缺少 aria-label**
   - 位置：`automation-card.tsx:158-165`
   - 描述：删除按钮无 `aria-label`，屏幕阅读器无法识别操作目标。
   - 风险：无障碍

7. **P1-72: Date 构造潜在空引用**
   - 位置：`automation-run-list.tsx:56-58`
   - 描述：`new Date(run.completedAt ?? run.startedAt)`。若两者均为 null，创建 Invalid Date。
   - 风险：边缘情况崩溃

8. **P1-73: 删除失败无错误反馈**
   - 位置：`automations-page.tsx:51-57`
   - 描述：`remove` 失败时对话框关闭但自动化未实际删除。用户无感知。
   - 风险：UX

9. **P1-74: Scheduler 错误对用户不可见**
   - 位置：`scheduler.ts:38-40`
   - 描述：调度器失败仅记录到 console，用户无可见性。
   - 风险：可靠性

10. **P1-75: normalizeAutomationRecord Spread 顺序风险**
    - 位置：`normalize-automation.ts:65-76`
    - 描述：`...rest` spread 可能携带旧字段覆盖规范化值。
    - 风险：数据完整性

11. **P1-76: 自动化名称无长度验证**
    - 位置：`automation-dialog.tsx:125-129`, `automations.ts:55`
    - 描述：未限制名称最大长度，超长名称可能导致 UI 布局问题和 DB 约束。
    - 风险：UX

12. **P1-77: Cron 时区歧义**
    - 位置：`is-automation-due.ts:9-18`
    - 描述：Cron 表达式使用本地时区，跨 DST 转换或不同地区用户可能看到意外执行时间。无 UI 指示。
    - 风险：UX

13. **P1-78: Run Now 无结果反馈**
    - 位置：`automations-page.tsx:66-71`
    - 描述：点击 "Run Now" 后无 toast 通知。用户不知道是否成功启动。
    - 风险：UX

14. **P1-79: Debounce Timer 未清理**
    - 位置：`automation-run-history-sheet.tsx:86-94`
    - 描述：Sheet 关闭时 debounce timer 未清除，可能导致 unmount 后 setState。
    - 风险：低 — 内存泄漏

---

## 10. Git 模块、Statistics、DnD、Web Tools

Review 文件：`src/features/git/`, `src/features/statistics/`, `src/lib/dnd/`, `src/lib/web-tools/`

### P0 问题

1. **P0-64: initRepo 成功后 isLoading 永不为 false**
   - 位置：`git-provider.tsx:451-461`
   - 描述：`initRepo` 成功时未调用 `setIsLoading(false)`。仅 catch 块中有重置。成功后 `isLoading` 永久保持 `true`，冻结 UI。
   - 风险：UI 冻结

2. **P0-65: external-file-drop text/plain fallback 接受任意路径**
   - 位置：`external-file-drop.ts:51-56`
   - 描述：`text/plain` fallback 使用 `looksLikeAbsolutePath()` 仅检查格式，不验证路径是否在工作区内。攻击者可构造包含 `../../etc/passwd` 的 drop event。
   - 风险：高 — 路径遍历 / 安全

### P1 问题

1. **P1-80: refresh 无防抖**
   - 位置：`git-provider.tsx:169-176`
   - 描述：面板打开、文件 watcher tick、工作区变更可并发触发 `refresh()`。仅文件 watcher 有冷却，手动/其他触发无。
   - 风险：性能 / UX 闪烁

2. **P1-81: isGitRepo 默认为 true**
   - 位置：`git-provider.tsx:109`
   - 描述：初始状态假设工作区是 git repo。非 git 工作区打开时短暂显示错误 UI。
   - 风险：UX 闪烁

3. **P1-82: 分支名称无验证**
   - 位置：`branch-selector.tsx:72-83`
   - 描述：`createBranch` 接受任何非空字符串，不验证 git 命名规则（无空格、无 `?*[]` 等）。Git 会拒绝但错误信息不透明。
   - 风险：UX 困惑

4. **P1-83: Delete 按钮永远不可见**
   - 位置：`branch-selector.tsx:152-165`
   - 描述：使用 `opacity-0 group-hover:opacity-100` 但父级 `<CommandItem>` 缺少 `group` class，删除按钮始终隐藏。
   - 风险：UX — 功能损坏

5. **P1-84: React Key 可能碰撞**
   - 位置：`changes-view.tsx:133`
   - 描述：key 格式 `${staged?..}-${path}-${status}` 在文件同时有 staged 和 unstaged 不同状态时可能碰撞。
   - 风险：渲染 bug

6. **P1-85: history-view workspaceDir prop 未使用**
   - 位置：`history-view.tsx:28`
   - 描述：接收 `_workspaceDir` 但从未使用（依赖 context）。死参数。
   - 风险：可维护性

7. **P1-86: GitBranchesResponse 类型重复定义**
   - 位置：`git-service.ts:232`, `workspace/git.ts`
   - 描述：`GitBranchesResponse` 在两个文件中定义。`checkoutGitBranch` 从 workspace/git re-export，与 git-service 的 `checkoutBranch` 重复。
   - 风险：可维护性 / 混淆

8. **P1-87: Pull 被不必要地阻止**
   - 位置：`remote-actions.tsx:61-68`
   - 描述：当 `statusEntries.length > 0` 时 pull 显示 "blocked"，即使无冲突（如纯新增文件）。用户被迫先 commit。
   - 风险：UX 摩擦

9. **P1-88: token-heatmap Theme 逻辑反转**
   - 位置：`token-heatmap.tsx:142`
   - 描述：`theme={{ light: isDark ? DARK_THEME : LIGHT_THEME, dark: isDark ? DARK_THEME : LIGHT_THEME }}`。library 期望 `light` key 为亮色主题颜色，`dark` key 为暗色主题颜色。当前逻辑导致错误主题渲染。
   - 风险：视觉 bug

10. **P1-89: use-stats load 无错误处理**
    - 位置：`use-stats.ts:34-50`
    - 描述：`Promise.all` 中任何查询失败会导致整个 load 失败，UI 永久卡在 `loading: true`。
    - 风险：UI 冻结

11. **P1-90: workspace-path-pointer 模块级可变状态**
    - 位置：`workspace-path-pointer.ts:36-41`
    - 描述：全局单例状态（`pointerSession`, `dragPreview`, `dropTargets`）导致测试污染、潜在内存泄漏。
    - 风险：内存泄漏 / 测试不稳定

12. **P1-91: Document Listeners 可能不分离**
    - 位置：`workspace-path-pointer.ts:89-98`
    - 描述：`detachDocumentListenersIfIdle()` 仅在 `pointerSession === null && dropTargets.size === 0` 时触发。若 cleanup 遗漏（组件卸载未 unregister），监听器永久附加。
    - 风险：内存泄漏

13. **P1-92: Drop Target DOMRect 过期**
    - 位置：`workspace-path-pointer.ts:144-149`
    - 描述：pointer events 期间调用 `target.getRect()`，但 DOM 变化（滚动、resize）可能导致缓存 rect 过期。
    - 风险：UX 不精确

14. **P1-93: isWorkspacePathDragActive 冗余检查**
    - 位置：`workspace-path.ts:60-78`
    - 描述：第 63 行和第 77 行均调用 `getActiveWorkspaceDragPath()`。死代码路径。
    - 风险：可维护性

15. **P1-94: fileUriToPath 不处理 Windows UNC 路径**
    - 位置：`external-file-drop.ts:61-79`
    - 描述：`file://server/share/path` 格式未处理，仅支持 `/C:/...` 风格。
    - 风险：跨平台 bug

16. **P1-95: Web Tools API Key 明文存储在 localStorage**
    - 位置：`web-tools/storage.ts:26`
    - 描述：`tavilyApiKey` 以纯 JSON 存储在浏览器 localStorage，任何脚本（包括 XSS payload）可访问。
    - 风险：安全 / 数据暴露

17. **P1-96: resolve-tavily-config env-based apiKey 为空字符串**
    - 位置：`resolve-tavily-config.ts:10-16`
    - 描述：当 `tavilyApiKeySource === "env"` 时，返回 `apiKey: ""`。下游消费者检查 `if (config.apiKey)` 会错误地认为未配置。
    - 风险：逻辑 bug

18. **P1-97: web-tools-provider SSR Hydration 不匹配风险**
    - 位置：`web-tools-provider.tsx:28-30`
    - 描述：`useState(readWebToolsSettings)` 使用 localStorage，SSR 环境下不可用。
    - 风险：潜在 SSR 崩溃

19. **P1-98: writeWebToolsSettings 无 try-catch**
    - 位置：`web-tools/storage.ts:8-23`
    - 描述：localStorage 满或禁用时（隐私模式），`setItem` 抛出未处理异常。
    - 风险：受限环境崩溃

20. **P1-99: checkoutGitBranch 重复功能**
    - 位置：`git-service.ts:232`
    - 描述：re-export 的 `checkoutGitBranch` 与 git-service 内的 `checkoutBranch` 功能重复。
    - 风险：可维护性

---

## 11. Rust Agent 模块、File Watcher、Shell Environment

Review 文件：`src-tauri/src/agent/`（mod, openai, registry, stream_log, types）, `src-tauri/src/file_watcher.rs`, `src-tauri/src/shell_env.rs`

### P0 问题

1. **P0-66: file_watcher.rs Panic on Watcher Creation Failure**
   - 位置：`file_watcher.rs:53, 58-62`
   - 描述：两处 panic site。`.expect("Failed to create file watcher")` 和 `.unwrap_or_else(|e| { panic!(...) })`。若 OS 文件通知子系统不可用（inotify fd 耗尽、FSEvent 问题），整个应用崩溃。
   - 风险：DoS — 工作区打开时崩溃

2. **P0-67: stream_log.rs Panic in OnceLock Init**
   - 位置：`stream_log.rs:28`
   - 描述：`open_log_file()` 在 `OnceLock::get_or_init()` 内 panic。若 `.logs` 目录无法创建（权限、只读文件系统），app 在首次日志调用时崩溃且无法恢复。
   - 风险：崩溃 — 调试时启用日志可能导致崩溃

3. **P0-68: shell_env.rs Shell Spawn Security Surface**
   - 位置：`shell_env.rs:96-110`
   - 描述：使用用户登录 shell（`$SHELL` env var）以 `-ilc` flag 启动以捕获环境变量。若 `$SHELL` 被设置为恶意或配置错误路径，可能在 app 启动时执行 `.zshrc`/`.bashrc` 中的任意命令。
   - 风险：中 — 代码执行

### P1 问题

1. **P1-100: registry.rs Task Entry Leak on Mutex Poison**
   - 位置：`registry.rs:362-364`
   - 描述：若 `AgentRegistry` mutex 被毒化（另一任务持锁时 panic），已完成/失败任务的清理被静默跳过。`runs` HashMap 永久保留过期条目。
   - 风险：内存泄漏

2. **P1-101: registry.rs Silent Event Drop on Channel Closure**
   - 位置：`registry.rs:314, 352, 360`
   - 描述：`let _ = channel.send(...)`。若前端监听器断开（如页面导航），错误事件和最终状态事件可能永远不会到达 UI。
   - 风险：用户看到过期的 "Running" 状态

3. **P1-102: file_watcher.rs Comment/Code Mismatch**
   - 位置：`file_watcher.rs:44-48`
   - 描述：注释说 "Ignore internal temporary events such as `AnyOther`" 但代码过滤 `EventKind::Any`。这是不同的 variant。
   - 风险：低 — 误导性注释

4. **P1-103: file_watcher.rs Silent Gitignore Parse Failure**
   - 位置：`file_watcher.rs:242`
   - 描述：`.gitignore` 包含无效模式时解析失败，静默回退到空 gitignore。所有文件（包括 `node_modules`、构建产物）触发变更事件。
   - 风险：性能退化

5. **P1-104: openai.rs UTF-8 Lossy Conversion in SSE Stream**
   - 位置：`openai.rs:367`
   - 描述：`String::from_utf8_lossy()` 将无效 UTF-8 字节替换为 `�`。Provider 返回二进制数据或错误编码时内容可能损坏。
   - 风险：低 — SSE 响应应为有效 UTF-8

6. **P1-105: openai.rs SSE Line Parsing Without Strict Prefix Check**
   - 位置：`openai.rs:468-477`
   - 描述：不以 `data:` 开头的行仍尝试解析为 JSON。非 SSE 行（如 HTTP chunk headers）若碰巧包含有效 JSON 会被错误解析。
   - 风险：极低

7. **P1-106: stream_log.rs Silent Log Skip on Mutex Poison**
   - 位置：`stream_log.rs:43-46`
   - 描述：log mutex 被毒化时所有后续日志写入被静默丢弃。崩溃时最需要的诊断数据丢失。
   - 风险：低 — 仅影响诊断

8. **P1-107: types.rs API Key Stored in Serializable Structs**
   - 位置：`types.rs:118, 139, 157`
   - 描述：`AgentStartParams`, `GenerateSessionTitleParams`, `RefinePromptParams` 均含 `pub api_key: Option<String>`，通过 serde 可序列化。若这些 struct 被格式化用于日志（如 `{params:?}`），API key 可能写入日志。
   - 风险：中 — 取决于是否记录日志

---

## 审查总结

| 区域 | P0 数量 | P1 数量 |
|------|---------|---------|
| 1. Agent 核心系统 | 2 | 4 |
| 2. Agent 工具系统 | 3 | 5 |
| 3. Rust 后端工具 | 3 | 6 |
| 4. 数据库层与聊天系统 | 5 | 10 |
| 5. 设置系统与 Model Provider | 2 | 10 |
| 6. 右侧面板与文件树 | 6 | 8 |
| 7. 终端、工作区、快捷键等 | 5 | 13 |
| 8. Skills 系统 | 4 | 9 |
| 9. Automations 系统 | 3 | 14 |
| 10. Git/Statistics/DnD/Web Tools | 2 | 20 |
| 11. Rust Agent/File Watcher | 3 | 8 |
| **总计** | **38** | **107** |

---

<!-- 各功能点 review 结果将按完成顺序追加在此 -->
