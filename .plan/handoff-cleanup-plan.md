# Handoff 清理计划

## 目标

从项目中彻底移除 handoff 相关代码，将属于 compact 的逻辑抽离重命名，不破坏任何现有功能。

## 现状分析

### 涉及范围（完整清单）

**Frontend — 需删除的文件（13个）**：
| 文件 | 状态 | 说明 |
|------|------|------|
| `features/agent/handoff.ts` | 核心 handoff 逻辑 | 被 message-item.tsx、chat-session-view.tsx 引用 |
| `features/agent/handoff-settings.ts` | 设置管理 | 被 context-monitor.ts、general-settings-panel.tsx 引用 |
| `features/agent/handoff-snapshot.ts` | 快照收集 | 仅被 handoff.ts 和测试引用 |
| `features/agent/handoff-workspace.ts` | **含 compact 逻辑** | `compactReplayMessages` 是 compact 核心函数，需抽离 |
| `features/agent/handoff-system-prompt.ts` | 死代码 | 无人 import |
| `features/agent/auxiliary-prompts.ts` | 部分死代码 | `buildHandoffSystemPrompt` 仅被 handoff.ts 引用；`buildSubAgentSystemPrompt` 无人引用 |
| `features/agent/handoff/artifact-block.tsx` | UI 组件 | 仅被 handoff.ts 引用 |
| `features/agent/handoff/continuation-message.tsx` | UI 组件 | 仅被 handoff.ts 引用 |
| `features/agent/handoff/source-banner.tsx` | UI 组件 | 仅被 handoff.ts 引用 |
| `features/agent/handoff/source-message.tsx` | UI 组件 | 仅被 handoff.ts 引用 |
| `features/agent/handoff-preview-banner.tsx` | UI 组件 | 仅被 chat-session-view.tsx 引用 |
| `features/chat/lib/handoff/mock-handoff-preview.ts` | Mock 数据 | 仅被 handoff.ts 引用 |

**Frontend — 测试文件（4个）**：
| 文件 | 说明 |
|------|------|
| `features/agent/handoff-settings.test.ts` | 测试 handoff-settings.ts |
| `features/agent/handoff-snapshot.test.ts` | 测试 handoff-snapshot.ts |
| `features/agent/handoff-workspace.test.ts` | 测试 handoff-workspace.ts |
| `features/agent/handoff.fixture.test.ts` | fixture 文件验证测试 |

**Frontend — 需修改的文件（4个）**：
| 文件 | 改动内容 |
|------|----------|
| `features/chat/components/message-item.tsx` | 移除 handoff import、HandoffArtifactBlock/ContinuationMessage/SourceBanner/SourceMessage 渲染逻辑、handoff 相关变量 |
| `features/chat/views/chat-session-view.tsx` | 移除 HandoffPreviewBanner import 和渲染逻辑 |
| `features/agent/context-monitor.ts` | handoff-settings → session-settings，HandoffSettingsKey → SessionSettingsKey |
| `features/settings/components/general-settings-panel.tsx` | handoff-settings → session-settings，HandoffSettingsKey → SessionSettingsKey |

**Backend — 需修改的文件（4个）**：
| 文件 | 改动内容 |
|------|----------|
| `db/records.rs` | MessageRecord 移除 handoff_from_session_id、handoff_message_id、handoff_phase 三个字段及对应 normalize 调用 |
| `agent/messages.rs` | 构造 MessageRecord 时移除这三个字段（当前均为 None） |
| `http/routes_tool.rs` | 构造 MessageRecord 时移除这三个字段 |
| `scheduled_jobs/runner.rs` | 构造 MessageRecord 时移除这三个字段 |

**Backend — 注释清理（1个）**：
| 文件 | 改动内容 |
|------|----------|
| `agent/compact_prompt.rs` | 将 doc comment 中提及 handoff 的历史描述改为简洁表述 |

**Testdata — 需删除的目录**：
| 路径 | 说明 |
|------|------|
| `backend/testdata/handoff/` | 含 3 个 JSON fixture 文件，仅被已删测试引用 |

---

## 执行步骤

### Phase 1: 抽离 compact 逻辑（保护核心功能）

**Step 1.1**: 从 `handoff-workspace.ts` 抽离 compact 相关代码到新文件 `compact-workspace.ts`
- 抽离内容：`CompactConfig`、`CompactReplayResult`、`compactReplayMessages` 函数及其依赖（`readWorkspaceFiles`）
- 保留在待删文件中：`HandoffSnapshotContent`、`collectHandoffSnapshot`、`buildHandoffContext`

**Step 1.2**: 更新 `session-compact-ui-store.ts` 的 import（如果引用了 handoff-workspace 中的 compact 代码，改为从 `compact-workspace.ts` 引用）
- 当前状态：session-compact-ui-store.ts **不引用** handoff-workspace，此步可能无改动

**Step 1.3**: Commit — "refactor: extract compact workspace logic from handoff module"

### Phase 2: 重命名 session-settings

**Step 2.1**: `handoff-settings.ts` → `session-settings.ts`
- 文件重命名
- `HandoffSettingsKey` enum → `SessionSettingsKey`
- `getHandoffSetting` / `setHandoffSetting` → `getSessionSetting` / `setSessionSetting`
- `DEFAULT_HANDOFF_SETTINGS` → `DEFAULT_SESSION_SETTINGS`
- 更新所有 import：
  - `context-monitor.ts` — 更新 import path 和类型名
  - `general-settings-panel.tsx` — 更新 import path 和类型名

**Step 2.2**: `handoff-settings.test.ts` → `session-settings.test.ts`
- 重命名文件，更新内部引用

**Step 2.3**: Commit — "refactor: rename handoff-settings to session-settings"

### Phase 3: 删除纯 Handoff UI 组件和工具

**Step 3.1**: 删除 `features/agent/handoff/` 目录（4个文件）
- artifact-block.tsx、continuation-message.tsx、source-banner.tsx、source-message.tsx

**Step 3.2**: 删除 `features/chat/lib/handoff/mock-handoff-preview.ts`

**Step 3.3**: 删除 `features/agent/handoff-snapshot.ts`（仅被 handoff.ts 引用）

**Step 3.4**: 删除 `features/agent/handoff-system-prompt.ts`（死代码，无人引用）

**Step 3.5**: 处理 `auxiliary-prompts.ts`
- 移除 `buildHandoffSystemPrompt` 函数
- 移除 `buildSubAgentSystemPrompt` 函数（无人引用）
- 如果文件变为空或只剩 import，删除整个文件

**Step 3.6**: Commit — "refactor: remove dead handoff helper files"

### Phase 4: 删除 Handoff 核心逻辑和 UI 引用

**Step 4.1**: 修改 `features/chat/components/message-item.tsx`
- 移除所有 handoff import：`resolveHandoffMessageKind`、`HandoffMessageKind`、`HandoffArtifactBlock`、`HandoffContinuationMessage`、`HandoffSourceBanner`、`HandoffSourceMessage`、`mockHandoffPreviewMessages`
- 移除 `handoffKind`、`isPreviewMode`、`isMockHandoff`、`mockHandoffMessages` 变量定义
- 移除 handoff 相关渲染逻辑（`<HandoffArtifactBlock>`、`<HandoffContinuationMessage>`、`<HandoffSourceBanner>`、`<HandoffSourceMessage>`）
- 保留 compact replay 相关逻辑（如果有的话）

**Step 4.2**: 修改 `features/chat/views/chat-session-view.tsx`
- 移除 `HandoffPreviewBanner` import
- 移除 `<HandoffPreviewBanner />` 渲染

**Step 4.3**: 删除 `features/agent/handoff-preview-banner.tsx`

**Step 4.4**: 删除 `features/agent/handoff.ts`（核心文件）

**Step 4.5**: Commit — "refactor: remove handoff core logic and UI references"

### Phase 5: 删除 Handoff workspace 和测试

**Step 5.1**: 删除 `features/agent/handoff-workspace.ts`（compact 逻辑已在 Phase 1 抽离）

**Step 5.2**: 删除测试文件
- `handoff-settings.test.ts`（已重命名为 session-settings.test.ts，跳过）
- `handoff-snapshot.test.ts`
- `handoff-workspace.test.ts`
- `handoff.fixture.test.ts`

**Step 5.3**: Commit — "refactor: remove handoff workspace and tests"

### Phase 6: Backend DB 字段清理

**Step 6.1**: 修改 `backend/src/db/records.rs`
- 从 `MessageRecord` struct 移除：`handoff_from_session_id`、`handoff_message_id`、`handoff_phase`
- 从 `normalize` 方法移除对应三行调用

**Step 6.2**: 修改 `backend/src/agent/messages.rs` — 移除构造 MessageRecord 时的三个字段赋值

**Step 6.3**: 修改 `backend/src/http/routes_tool.rs` — 同上

**Step 6.4**: 修改 `backend/src/scheduled_jobs/runner.rs` — 同上

**Step 6.5**: Commit — "refactor: remove handoff DB fields from MessageRecord"

### Phase 7: 清理测试数据和注释

**Step 7.1**: 删除 `backend/testdata/handoff/` 目录及所有文件

**Step 7.2**: 修改 `backend/src/agent/compact_prompt.rs` — 简化 doc comment，移除对 handoff 的历史描述

**Step 7.3**: Commit — "chore: clean up handoff testdata and comments"

### Phase 8: 验证和 Review

**Step 8.1**: 全局搜索确认
```bash
# Frontend 中不应再有 handoff 引用（注释除外）
grep -rn "handoff" frontend/src --include="*.ts" --include="*.tsx"

# Backend 中不应再有 handoff 引用（注释除外）
grep -rn "handoff" backend/src --include="*.rs"
```

**Step 8.2**: Frontend typecheck
```bash
cd frontend && pnpm typecheck
```

**Step 8.3**: Backend build
```bash
cd backend && cargo check
```

**Step 8.4**: 运行测试
```bash
# Frontend tests
cd frontend && pnpm test

# Backend tests
cd backend && cargo test
```

**Step 8.5**: Review checklist（执行者自查）
- [ ] `grep -rn "handoff"` 返回结果仅为注释/文档中的历史提及
- [ ] compact-workspace.ts 存在且包含完整的 compactReplayMessages 函数
- [ ] session-settings.ts 导出接口与原 handoff-settings.ts 一致
- [ ] message-item.tsx 无编译错误，compact replay 逻辑完整保留
- [ ] chat-session-view.tsx 无 HandoffPreviewBanner 引用
- [ ] MessageRecord struct 不再包含 handoff_ 字段
- [ ] pnpm typecheck 零错误
- [ ] cargo check 零错误
- [ ] 所有测试通过

**Step 8.6**: Commit — "chore: verify handoff cleanup complete"

---

## 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | `pnpm typecheck` 零错误 | 自动化 |
| 2 | `cargo check` 零错误 | 自动化 |
| 3 | 所有测试通过 | 自动化 |
| 4 | `grep -rn "handoff"` 仅返回注释 | 自动化 |
| 5 | compactReplayMessages 功能完整保留 | 代码审查 + 手动验证 |
| 6 | session-settings 导出接口不变 | 代码审查 |
| 7 | UI 无 handoff 组件残留 | 手动验证（需用户确认） |
| 8 | 每次改动独立 commit | git log 检查 |

## 风险点

| 风险 | 缓解措施 |
|------|----------|
| compactReplayMessages 抽离不完整 | Phase 1 先做，验证后再继续；对比抽离前后签名 |
| message-item.tsx 中 handoff 和 compact 逻辑交织 | 仔细审查渲染条件分支，只删 handoff 相关分支 |
| DB 字段删除影响已有数据查询 | handoff_ 字段当前均为 None，无实际数据；但需注意 SQL query 是否引用这些列名 |
| session-settings localStorage key 断裂 | 如果前端用硬编码字符串作为 storage key，需保持 key 不变或做迁移 |

## 不做的事

- **不删除** DB 表中的 handoff_ 列（需要 migration，风险高，收益低）
- **不改** compact 的核心逻辑，只移动位置
- **不改** API 接口定义
