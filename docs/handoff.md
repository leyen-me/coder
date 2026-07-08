# Session Handoff 设计与改进方案

> 本文档描述 Coder 当前的上下文交接（Handoff）机制、已知问题，以及面向长程任务的完整改进路线图。
>
> 最后更新：2026-07-08

---

## 目录

1. [背景与目标](#背景与目标)
2. [现状：当前 Handoff 如何工作](#现状当前-handoff-如何工作)
3. [核心问题](#核心问题)
4. [与业界方案对比](#与业界方案对比)
5. [设计原则](#设计原则)
6. [改进方案总览](#改进方案总览)
7. [方案详解](#方案详解)
8. [优先级与实施路线图](#优先级与实施路线图)
9. [附录](#附录)

---

## 背景与目标

### 为什么需要 Handoff

Agent 在长任务中会快速消耗上下文窗口：读文件、跑测试、工具输出、多轮推理都会累积 token。当窗口接近上限时，必须有一种机制让任务**继续推进**，而不是崩溃或截断。

Coder 选择的策略是 **Session Rollover（换 Session 接力）**，而不是在同一条对话历史里做有损压缩（in-place compaction）。这一选型比多数竞品更诚实、更适合长程任务，但当前实现仍存在明显的**失忆与重复探索**问题。

### 目标

| 目标 | 说明 |
|------|------|
| **任务连续性** | 换 Session 后，Agent 能从上一 Session 结束的地方继续，而非重新入职 |
| **避免重复劳动** | 不再反复 `glob` / `grep` / `read_file` 已经探索过的内容 |
| **信息可追溯** | 用户和 Agent 都能回溯源 Session 的细节 |
| **支持长程任务** | `long_task` + `unattended` 模式下，可稳定滚动多个 Session |
| **有损但可控** | 承认摘要是有损的，用外部状态补偿损失 |

### 非目标

- 不追求「单个 LLM 上下文窗口撑 N 天」——这在工程上不现实
- 不把 Handoff 做成通用的跨项目知识库
- 不在第一版引入需要额外 embedding 服务的语义索引（可作为后续增强）

---

## 现状：当前 Handoff 如何工作

### 整体流程

```
上下文接近上限
    ↓
agent-loop 发出 handoff_required，停止当前 loop
    ↓
用完整 Session 历史调用 LLM，生成结构化 Handoff 文档
    ↓
源 Session 写入 handoff artifact（messageKind: handoff）
    ↓
创建新 Session（Continue · {原标题}）
    ↓
新 Session 首条消息为 handoff_continuation prompt
    ↓
自动 startAgentTask，无人值守续跑
```

### 关键代码模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 触发检测 | `frontend/src/features/agent/context-monitor.ts` | 估算 token 用量，判断是否触发 |
| Handoff 文案 | `frontend/src/features/agent/handoff.ts` | 构建 prompt、artifact、continuation |
| 系统 Prompt | `frontend/src/features/agent/auxiliary-prompts.ts` | 12 段结构化 Handoff 章节 |
| 阈值配置 | `frontend/src/features/agent/handoff-settings.ts` | 默认 80%，可调 50%–95% |
| 执行流程 | `frontend/src/features/agent/store/agent-store.tsx` | 生成文档、建 Session、自动续跑 |
| Agent Loop | `frontend/src/features/agent/agent-loop.ts` | 每轮开始前检查 handoff |

### 触发条件

默认阈值 **80%**（用户可在设置中调整）。满足以下任一条件即触发：

- `usedTokens >= maxTokens × triggerThreshold`
- `remainingTokens <= reservedTokens`（reserve 约为窗口 25%，夹在 1k–24k）

额外保护：只有 Session 中已出现**可回放的工作**（assistant 输出、tool call、tool result）才触发，避免用户刚发一条长消息就误触发。

### Handoff 文档结构

生成时使用固定 12 个章节：

1. Original User Intent
2. Current Objective
3. Constraints
4. Completed
5. In Progress
6. Pending Next Actions
7. Key Decisions
8. Rejected Or Superseded Approaches
9. Artifacts And Evidence
10. Background Jobs And Follow-ups
11. Open Questions
12. Resume Instructions

Artifact 头部附带元数据：`sourceSessionId`、`continuedSessionId`、`contextBudget`、`sessionKind`、`autonomyMode` 等。

### 续跑 Session 实际拿到的 Context

```
system prompt（环境、AGENTS.md、skills）
+ session policy（long_task / unattended）
+ todo snapshot（若有）
+ 一条 handoff_continuation 用户消息（含完整 artifact）
→ 自动开跑
```

### 已有优势

- **Session Rollover** 优于 in-place compaction，避免「摘要的摘要的摘要」连环漂移
- **12 段结构化文档**，比 Codex 等短 prompt 更完整
- **unattended 续跑**一等公民，适合长任务
- **Artifact 持久化** + UI 展示源/续 Session 互跳
- **Fallback 兜底**：生成失败时有确定性 fallback body
- **测试覆盖**：`handoff.test.ts`、`context-monitor.test.ts`、`agent-loop.test.ts`

---

## 核心问题

### 问题一：续跑 Session「重新入职」

换 Session 后，Agent 丢失了整个源 Session 的**操作态**：

- 读过哪些文件、grep 过什么、测试输出是什么
- 文件原文（之前 `read_file` 的内容全没了）
- 推理轨迹（`processSteps` 里的 reasoning / decision）
- 源 Session 聊天记录

续跑 Agent 只剩一份几千字的 Markdown 摘要，不得不重新探索工程。

### 问题二：Prompt 鼓励盲目验证

当前 continuation prompt 包含：

> Continue without repeating completed work **unless verification is necessary**
>
> Start by **validating the prior state**

模型合理理解为「先 re-read 一圈确认」→ 开局 `glob` + `grep` + `read_file` 大礼包。

### 问题三：没有压缩前减负

Claude Code 有 microcompact（无 LLM 清理旧 tool output），Cursor 把长输出写文件。Coder 没有这层，context 涨得快，Handoff 更频繁，每次交接时「刚探索完就失忆」。

### 问题四：Handoff 生成本身吃满窗

快满窗时才 Handoff，但生成 Handoff 时又把**完整历史**再喂一次 LLM。窗口已 80%+ 时，这次调用可能超窗失败或摘要质量差。

### 问题五：多轮 Handoff 链无累积机制

每次 Handoff 都是从完整历史重新总结，不是增量合并上一份 Handoff。第 3、4 次交接时，早期细节仍会丢失。

### 问题六：可继承状态未迁移

`fork-session` 会复制 `planFileName`、`planBuiltAt`、todos、完整消息；**Handoff 不会**。续跑 Session 与 Plan、Todo、Skill 绑定断裂。

### 问题七：Token 估算非 Provider 真值

`estimateTextTokens` 是本地启发式，可能与实际 `usage.promptTokens` 有偏差，导致过早或过晚触发。

### 实际代价

| 损失 | 影响 |
|------|------|
| 重复 read | 浪费 token + 时间 |
| 摘要细节不足 | 可能读错文件、漏边界条件 |
| 重新探索 | 行为和决策可能与上一 Session 不一致 |
| 多轮 Handoff 后 | 每次都要「重新认识工程」 |

**根因一句话：做了「任务状态交接」（Handoff 文档），没做「操作态恢复」（Working Set Rehydration）。**

---

## 与业界方案对比

| 维度 | Coder（现状） | Claude Code | Cursor | Codex |
|------|--------------|-------------|--------|-------|
| 策略 | 换 Session | 同 Session 内 compact | 同 Session 摘要 + 历史文件 | 同 Session 服务端 compact |
| 压缩前减负 | ❌ | ✅ microcompact | ✅ 长输出写文件 | 部分 |
| 压缩后恢复 | ❌ | ✅ 重读文件/技能/plan | ✅ 历史/终端可 grep | ❌ |
| 结构化交接 | ✅ 12 段 | ✅ 9 段 | 较短摘要 | 短 handoff |
| 自主续跑 | ✅ long_task | 部分 | 部分 | 部分 |
| 可追溯 | ✅ artifact + session 链 | 部分 | ✅ 历史文件 | 部分 |

Coder 的**架构选型**（Session Rollover）领先，但**恢复层**明显落后。

---

## 设计原则

### 1. 把不可压缩的事实放在 LLM 外面

以下内容不应只存在于摘要 prose 中，而应持久化为可检索、可验证的外部状态：

- Git diff / status
- 测试命令与退出码
- 后台进程状态
- Tool 输出原文
- Plan / Todo / Decision 记录
- 文件 mtime / hash

### 2. 续跑默认「信任 Handoff，增量验证」

- 默认信任 Handoff 中的 working set 和决策
- 只在「即将修改文件」或「checklist 验证失败」时 read
- 用机制（探索预算、prompt 约束）而非仅靠「请不要 re-read」

### 3. Handoff 是接力，不是重新招聘

理想续跑开局：

```
摘要（决策 + 进度 + 下一步）
+ working set（文件列表 + 关键片段/签名）
+ plan 全文 + todos
+ git delta + 验证 checklist
+ 「除非改文件，否则不要 re-read」
→ 直接执行 Pending Next Actions 第 1 条
```

### 4. 有损但可补偿

承认 Markdown 摘要必有损。补偿手段：外部档案库、链式 manifest、增量 Handoff、质量门禁。

### 5. 优先复用现有能力

`fork-session`、`toolInvocations`（DB）、`plan`、`todos`、`list_shells`、`processSteps` 等已有基础设施，改进应优先嫁接而非重写。

---

## 改进方案总览

```
┌─────────────────────────────────────────────────────────────┐
│                    Handoff 改进体系                          │
├─────────────────────────────────────────────────────────────┤
│  Layer 0: 压缩前减负                                         │
│    · Micro-prune 旧 tool output                              │
│    · 长输出落盘                                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Handoff 生成增强                                  │
│    · Working set 提取                                        │
│    · Git / 测试 / 进程快照                                   │
│    · 负向记忆 + 假设日志                                     │
│    · 质量门禁                                                │
│    · 增量 Handoff（链式 manifest）                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 续跑 Context 注入                                  │
│    · Plan / Todo / Skill 继承                                │
│    · 预加载 working set 摘要                                 │
│    · 验证 checklist                                          │
│    · 探索预算（首 1–2 轮限 read）                            │
│    · 调整 continuation prompt                                │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 外部记忆与检索                                     │
│    · Tool output 档案库                                      │
│    · 源 Session 历史可检索                                   │
│    · Session chain manifest                                  │
│    · 文件 mtime 失效检测                                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: 架构演进                                           │
│    · Fork + truncate 续跑                                    │
│    · Archivist 子 Agent                                      │
│    · 用户可编辑 Handoff 暂停点                               │
│    · 真实 token 计数驱动触发                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 方案详解

### Layer 0：压缩前减负

#### 0.1 Micro-prune（无 LLM 清理）

**思路**：借鉴 Claude Code microcompact。在 Handoff 触发前，或每轮 API 调用前，将旧的 tool result 原地替换为占位符（如 `[旧 tool 输出已清理，详见 .agent/archive/...]`），始终保留最近 N 个（建议 3–5 个）tool result。

**收益**：推迟 Handoff 触发，减少「刚探索完就交接」的频率。

**实现要点**：
- 清理前将原文写入 tool archive（见 Layer 3）
- 在 `buildAgentMessages` 或序列化层处理，不需要额外 LLM 调用

#### 0.2 长输出落盘

**思路**：借鉴 Cursor dynamic context discovery。超长 shell 输出、MCP 结果、大 JSON tool 输出写入 `.agent/sessions/{sessionId}/outputs/`，context 中只保留文件路径和摘要行。

**收益**：降低 token 增长速度，减少 Handoff 频率。

---

### Layer 1：Handoff 生成增强

#### 1.1 Working Set 提取

**思路**：从源 Session 的 `toolInvocations` 中提取：

| 工具 | 提取内容 |
|------|----------|
| `read_file` | 路径 + 时间戳 |
| `edit_file` / `write_file` / `replace_lines` | 路径 + 时间戳 |
| `grep` / `glob` | 查询模式（作为探索证据） |

按时间排序、去重，取最近 N 个（建议 8–12 个），写入 Handoff artifact 新章节：

```markdown
## Working Set
| 路径 | 最后操作 | 操作类型 |
|------|----------|----------|
| frontend/src/features/agent/handoff.ts | 2026-07-08T10:30:00Z | edit |
| frontend/src/features/agent/context-monitor.ts | 2026-07-08T10:25:00Z | read |
```

**续跑时**：注入 working set 列表，并明确「默认信任，除非文件已变更或即将修改」。

#### 1.2 Git 状态快照

**思路**：Handoff 时自动采集：

```bash
git status --short
git diff --stat
git diff          # 未暂存变更
git diff --staged # 已暂存变更
git log --oneline -n 20
git branch --show-current
```

写入 Handoff 章节 `## Code Delta`。代码变更比 prose 摘要更可靠。

**续跑策略**：Agent 从 diff 理解「改了什么」，而非从 README 重新了解工程。

#### 1.3 测试与构建状态

**思路**：从 Session 的 `run_command` tool 输出中提取：

- 最后一次测试/构建命令
- 退出码
- 失败时的关键错误片段（截断到合理长度）

写入结构化字段：

```yaml
verification:
  last_test_command: "pnpm test handoff"
  last_test_exit_code: 0
  last_build_command: "pnpm build"
  last_build_exit_code: 0
```

**续跑策略**：先跑 checklist 验证（复跑 last_test_command），通过则直接继续 Pending Actions。

#### 1.4 后台进程快照

**思路**：Handoff 时调用 `list_shells`，记录：

- 运行中的 dev server / watcher
- `shell_id`、cwd、端口（若可推断）
- 最后一条关键输出

写入 `## Background Jobs And Follow-ups`（当前章节已有，需改为结构化采集而非仅靠 LLM 回忆）。

**收益**：避免续跑 Session 重复 `pnpm dev` 导致端口冲突。

#### 1.5 负向记忆强化

**思路**：`Rejected Or Superseded Approaches` 章节已有，但需强化为结构化条目：

```markdown
## Rejected Or Superseded Approaches
- **方案**：改用 webpack 配置解决
  **失败原因**：与现有 vite 流水线冲突
  **证据**：测试 xxx 失败，见 tool archive `run_command__test.json`
  **禁止重复**：除非用户明确要求
```

续跑 prompt 写死：**禁止重复探索已列出的方案**。

#### 1.6 假设日志（Assumption Log）

**思路**：新增章节 `## Assumptions`：

```markdown
## Assumptions
- 目标环境 Node >= 20（未向用户确认，基于 package.json engines）
- 测试可 mock 数据库（基于 prior session 决策）
```

续跑时默认沿用；若要推翻，必须明确说明并记录。

#### 1.7 Decision / Reasoning 轨迹

**思路**：从 `processSteps` 提取最近 3 条 decision 记录和关键 reasoning 片段（非全文），写入 `## Key Decisions` 的补充上下文。

**收益**：保留「为什么选 A 不选 B」，减少决策漂移。

#### 1.8 Handoff 质量门禁

**思路**：自动生成后校验：

| 检查项 | 要求 |
|--------|------|
| Pending Next Actions | 至少 1 条 |
| 相关文件路径 | 至少 3 个 |
| Key Decisions | 非空或明确标注 Unknown |
| 测试/构建状态 | 已记录或明确标注 Unknown |
| Working Set | 至少 1 个文件 |

不通过 → 重试生成（最多 2 次）→ 仍失败则暂停续跑、通知用户。

#### 1.9 增量 Handoff 与 Session Chain Manifest

**思路**：为长任务链维护持久文件：

```
.agent/chains/{rootSessionId}/manifest.json
```

每次 Handoff **追加**而非覆盖：

```json
{
  "rootSessionId": "session-abc",
  "hops": [
    {
      "hop": 1,
      "sourceSessionId": "session-abc",
      "continuedSessionId": "session-def",
      "generatedAt": "2026-07-08T10:00:00Z",
      "summary": "...",
      "workingSet": ["path/a.ts", "path/b.ts"],
      "invariants": ["不要修改 backend 认证逻辑"],
      "openRisks": ["测试覆盖率不足"]
    }
  ],
  "cumulativeWorkingSet": ["path/a.ts", "path/b.ts", "path/c.ts"],
  "invariants": ["不要修改 backend 认证逻辑"],
  "assumptions": ["Node >= 20"]
}
```

第 N 次 Handoff 时，模型读的是整条链的 manifest + 本轮 delta，而非对完整历史的第 N 次压缩。

#### 1.10 符号级缓存（可选增强）

**思路**：对 working set 文件提取 export 的 function/class 签名、关键 type definition（tree-sitter 或简单 AST）。注入续跑 context 作为 **API 地图**，写调用代码时再 read 实现细节。

---

### Layer 2：续跑 Context 注入

#### 2.1 Plan / Todo / Skill 继承

**思路**：复用 `fork-session` 逻辑，Handoff 时：

- 复制 `planFileName`、`planBuiltAt` 到续跑 Session
- 调用 `copyAgentTodosForSession(source, continued)`
- 收集源 Session 使用过的 `referencedSkills`，续跑时重新注入

**收益**：与 `assembleSystemMessages` 中的 todo snapshot 无缝衔接。

#### 2.2 预加载 Working Set 内容

**思路**：除文件路径列表外，对 working set 前 K 个文件（建议 3–5 个）预注入：

- 文件签名摘要（exports / types）
- 或最近修改的函数片段（从 git diff 提取）

控制总 token 预算（建议 8k–15k）。

#### 2.3 验证 Checklist 注入

**思路**：将 Layer 1.3 的结构化 verification 注入续跑 system message：

```markdown
## Continuation Verification Checklist
1. 复跑 `pnpm test handoff` — 预期 exit 0
2. 确认 `frontend/src/features/agent/handoff.ts` 存在且包含 WorkingSet 章节
3. 确认 dev server 未重复启动（查 list_shells）
```

Agent 第一件事是验证，不是探索。

#### 2.4 探索预算

**思路**：续跑 system prompt 加入硬约束：

```markdown
## Exploration Budget (Turn 1–2)
- 最多 2 次 read_file
- 0 次 glob（除非 checklist 失败）
- 优先使用 Handoff 证据和 tool archive
- 超出预算需明确 justification
```

#### 2.5 调整 Continuation Prompt

**现状问题**：鼓励「validate prior state」→ 导致全盘 re-read。

**建议改为**：

```markdown
A previous session handed off its working state. Treat the handoff as authoritative.

Rules:
1. Execute Pending Next Actions immediately if checklist passes.
2. Do NOT re-read files listed in Working Set unless:
   - You are about to edit them, OR
   - Checklist verification failed, OR
   - Handoff marks them as "needs_verification"
3. Do NOT glob or explore the codebase to "understand the project".
4. Use tool archive and source session history for details instead of re-running tools.
5. Continue autonomously with safe defaults; record assumptions.
```

#### 2.6 错误指纹去重

**思路**：Handoff 记录已调查过的 error signature：

```markdown
## Known Errors Already Investigated
- TS2345 @ handoff.ts:42 — 已通过添加类型守卫修复
- ECONNREFUSED :3000 — dev server 未启动，非代码问题
```

续跑遇到相同指纹 → 直接套用已知修复。

---

### Layer 3：外部记忆与检索

#### 3.1 Tool Output 档案库

**思路**：利用已持久化的 `toolInvocations`，建立：

```
.agent/sessions/{sessionId}/tool-archive/
  read_file__handoff.ts.json
  grep__context-monitor.json
  run_command__pnpm_test.json
  index.json          # 路径 → 档案文件映射
```

**续跑 Agent 新能力**：通过工具或 prompt 指引访问档案：

```
read_prior_tool_output(session_id, tool_name, path_pattern)
```

需要某文件历史内容时**查档案**，不是再 `read_file`。

#### 3.2 源 Session 历史可检索

**思路**：将源 Session 消息导出为：

```
.agent/sessions/{sourceSessionId}/history.md
```

或在 DB 层提供查询 API。续跑 Agent 需要细节时 grep 该文件，而非从头探索。

**UI**：续跑 Session 已有 `handoffFromSessionId` 和 banner 互跳，可在此基础上增加「搜索源 Session」工具。

#### 3.3 文件 Mtime 失效检测

**思路**：Working set 记录每个文件在源 Session 最后一次 read 时的 mtime/hash。续跑时对比：

| 状态 | 行为 |
|------|------|
| mtime 未变 | 信任 Handoff 描述，禁止 re-read |
| mtime 已变 | 标记 `needs_verification`，允许 read |

把「验证」从「读一遍工程」变成「增量校验」。

#### 3.4 Session Memory 文件（边做边写）

**思路**：长任务过程中持续更新：

```
.agent/sessions/{sessionId}/session-memory.md
```

由 Agent 在关键节点更新（完成子任务、做出决策、发现约束）。Handoff 时该文件**原样继承**到续跑 Session，比临时生成的摘要更稳定。

建议章节：Goal / Architecture Notes / Key Files / Decisions / Dead Ends / Current Blockers。

---

### Layer 4：架构演进

#### 4.1 Fork + Truncate 续跑

**思路**：不完全新建干净 Session，而是：

```
forkSessionFromMessage(source, handoffMessageId, title)
  → 截断 handoff 前的 tool 大输出
  → 保留 handoff artifact + 最近 N 条消息
  → 作为续跑 Session
```

比「干净 Session + 一条摘要」保留更多操作态，又比全量历史省 token。`fork-session.ts` 已实现消息复制、todos、plan 继承，可在此基础上扩展。

#### 4.2 Archivist 子 Agent

**思路**：Handoff 生成同时 spawn 只读子 Agent：

- **输入**：源 Session 的 tool log
- **输出**：结构化 `{files, decisions, tests, commands, dead_ends}`
- **合并**：archivist 报告 + 主 Handoff 文档 → 注入续跑

专门从 tool 垃圾堆里提取事实，比单次摘要更全面。

#### 4.3 用户可编辑 Handoff 暂停点

**思路**：`long_task` 自动续跑前，展示 5–10 秒预览：

- Handoff 摘要
- Working set
- 将要预加载的内容
- 允许用户补一句「别忘了 X」

无人值守与可控性的折中。

#### 4.4 真实 Token 计数

**思路**：用 Provider 返回的 `usage.promptTokens`（已在 `done` 事件中记录到 message）驱动触发判断，替代纯本地 `estimateTextTokens`。

可设 hybrid：估算用于实时 UI 展示，真值用于 Handoff 触发。

#### 4.5 子 Agent 预热查询（远期）

**思路**：若有 codebase index / semantic search，Handoff 时用 `Current Objective` 预跑 search，将 top-K 文件路径 + 相关性说明注入续跑 context。

---

## 优先级与实施路线图

### Phase 1：止血（1–2 周）

> 目标：解决「续跑 Session 开局 read 大礼包」最痛的问题。

| # | 方案 | 改动范围 | 预期收益 |
|---|------|----------|----------|
| 1 | Working set 提取 + 注入 | `handoff.ts`, `agent-store.tsx` | 高 |
| 2 | 调整 continuation prompt | `handoff.ts` | 高 |
| 3 | Plan / Todo 继承 | `agent-store.tsx`（复用 fork 逻辑） | 高 |
| 4 | 探索预算（prompt 约束） | `handoff.ts` | 中 |
| 5 | Git status + diff 快照 | 新增 `handoff-snapshot.ts`，Handoff 时调用 | 高 |

**Phase 1 完成后的续跑体验**：

```
system + handoff 摘要 + working set + git delta + todos + plan
+ 「信任 handoff，限制 re-read」
→ 直接执行 Pending Next Actions
```

### Phase 2：补偿层（2–4 周）

| # | 方案 | 预期收益 |
|---|------|----------|
| 6 | Tool output 档案库 | 彻底解决 re-read |
| 7 | 测试/构建/进程快照 | 避免重复跑命令 |
| 8 | Handoff 质量门禁 | 防止烂摘要 |
| 9 | 负向记忆 + 假设日志结构化 | 减少重复踩坑 |
| 10 | Micro-prune | 推迟 Handoff 频率 |

### Phase 3：长程稳定（4–8 周）

| # | 方案 | 预期收益 |
|---|------|----------|
| 11 | Session chain manifest | 多轮 Handoff 防漂移 |
| 12 | 增量 Handoff | 同上 |
| 13 | Fork + truncate 续跑 | 保留更多操作态 |
| 14 | 文件 mtime 失效检测 | 精准 re-read |
| 15 | 源 Session 历史可检索 | 按需捞细节 |
| 16 | 真实 token 计数 | 精准触发 |

### Phase 4：体验与智能化（远期）

| # | 方案 |
|---|------|
| 17 | Archivist 子 Agent |
| 18 | 用户可编辑 Handoff 暂停点 |
| 19 | 符号级缓存 |
| 20 | 语义搜索预热 |
| 21 | Session memory 边做边写 |

---

## 附录

### A. 理想 Handoff Artifact 完整示例

```markdown
# Automatic Session Handoff

- sourceSessionId: session-abc
- continuedSessionId: session-def
- sourceSessionTitle: Handoff v2 实现
- generatedAt: 2026-07-08T10:30:00.000Z
- model: claude-sonnet-4
- sessionKind: long_task
- autonomyMode: unattended
- decisionPolicyVersion: mvp-v1
- contextBudget: 160000/200000 used, 40000 remaining, reserve 24000

## Original User Intent
实现 Handoff 续跑时不重复探索工程。

## Current Objective
完成 Phase 1：working set 提取 + git 快照 + prompt 调整。

## Constraints
- 不修改 backend Rust 代码（仅 frontend）
- 保持现有 handoff 测试通过
- 遵循 AGENTS.md 规范

## Completed
- [x] 编写 docs/handoff.md 设计文档
- [x] 分析现有 handoff 流程

## In Progress
- [ ] 实现 working set 提取函数

## Pending Next Actions
1. 在 handoff.ts 新增 extractWorkingSet()
2. 修改 buildStoredHandoffArtifact() 加入 Working Set 章节
3. 修改 buildContinuationPrompt() 加入信任策略
4. 在 continueTaskFromHandoff 中复制 todos 和 plan

## Key Decisions
- 选择 Session Rollover 而非 in-place compact（已验证正确）
- Working set 上限 12 个文件，按最后操作时间排序

## Rejected Or Superseded Approaches
- **方案**：干净新 Session + 短摘要
  **原因**：导致全盘 re-read
  **禁止重复**：已废弃

## Assumptions
- 仅修改 frontend/src/features/agent/ 目录
- pnpm 为包管理工具

## Artifacts And Evidence
- 设计文档：docs/handoff.md
- 现有测试：frontend/src/features/agent/handoff.test.ts

## Working Set
| 路径 | 最后操作 | 操作类型 |
|------|----------|----------|
| frontend/src/features/agent/handoff.ts | 2026-07-08T10:25:00Z | read |
| frontend/src/features/agent/store/agent-store.tsx | 2026-07-08T10:20:00Z | read |

## Code Delta
\`\`\`
 M frontend/src/features/agent/handoff.ts
?? docs/handoff.md
\`\`\`

## Verification
- last_test_command: pnpm test handoff
- last_test_exit_code: 0

## Background Jobs And Follow-ups
- dev server: shell_id=sh-001, port=3000, running

## Open Questions
- 无

## Resume Instructions
1. 跑 Verification checklist
2. 直接实现 Pending Next Actions 第 1 条
3. 不要 glob/read README
```

### B. 续跑 Session 理想 Context 结构

```
┌──────────────────────────────────────────┐
│ system: 环境 + AGENTS.md + skills        │
├──────────────────────────────────────────┤
│ system: session policy (long_task)       │
├──────────────────────────────────────────┤
│ system: todo snapshot（继承的 todos）     │
├──────────────────────────────────────────┤
│ system: continuation checklist           │
├──────────────────────────────────────────┤
│ system: exploration budget               │
├──────────────────────────────────────────┤
│ user: handoff_continuation               │
│   ├─ 信任策略 prompt                     │
│   ├─ 完整 handoff artifact               │
│   └─ working set 预加载片段（可选）       │
└──────────────────────────────────────────┘
```

### C. 数据流（改进后）

```
                    ┌─────────────┐
                    │  Agent 工作  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ tool     │ │ session  │ │ git /    │
        │ archive  │ │ memory   │ │ test     │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └────────────┼────────────┘
                          ▼
                  ┌───────────────┐
                  │ Handoff 生成   │
                  │ + 质量门禁     │
                  └───────┬───────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌─────────┐ ┌──────────┐
        │ artifact │ │ chain   │ │ fork +   │
        │ 存入源    │ │ manifest│ │ truncate │
        │ session  │ │ 追加     │ │ 续跑      │
        └──────────┘ └─────────┘ └────┬─────┘
                                      ▼
                              ┌───────────────┐
                              │ 续跑 Session   │
                              │ 验证→执行      │
                              │ 不重新探索     │
                              └───────────────┘
```

### D. 相关代码索引

| 文件 | 说明 |
|------|------|
| `frontend/src/features/agent/handoff.ts` | Handoff prompt 与 artifact 构建 |
| `frontend/src/features/agent/handoff-settings.ts` | 触发阈值配置 |
| `frontend/src/features/agent/context-monitor.ts` | Token 监控与触发判断 |
| `frontend/src/features/agent/auxiliary-prompts.ts` | Handoff 系统 prompt |
| `frontend/src/features/agent/store/agent-store.tsx` | Handoff 执行主流程 |
| `frontend/src/features/agent/agent-loop.ts` | Loop 内 Handoff 检测 |
| `frontend/src/features/agent/system-messages.ts` | Todo snapshot 注入 |
| `frontend/src/lib/db/fork-session.ts` | Fork 逻辑（可复用） |
| `frontend/src/lib/db/agent-todos.ts` | Todo 复制函数 |
| `frontend/src/features/chat/components/handoff-*.tsx` | Handoff UI 组件 |

### E. 术语表

| 术语 | 定义 |
|------|------|
| **Handoff** | 上下文接近上限时，生成结构化交接文档并创建续跑 Session |
| **Session Rollover** | 换 Session 接力，而非同 Session 内压缩 |
| **Working Set** | 当前任务相关的文件集合及最后操作记录 |
| **Rehydration** | 续跑时恢复操作态（文件、plan、todo 等） |
| **Tool Archive** | 历史 tool 输出的持久化档案 |
| **Chain Manifest** | 跨多轮 Handoff 的累积任务档案 |
| **Micro-prune** | 无 LLM 的旧 tool output 清理 |
| **质量门禁** | Handoff 生成后的自动校验 |

---

## 变更记录

| 日期 | 作者 | 变更 |
|------|------|------|
| 2026-07-08 | Agent 讨论沉淀 | 初版：现状分析 + 完整改进方案 + 路线图 |
