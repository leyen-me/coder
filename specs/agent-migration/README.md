# Agent 后端化迁移 — 给 Claude Code 的执行指令

## 你要做什么

把 agent 自主循环从前端 TypeScript 迁移到后端 Rust，让 agent 在服务器端运行。

## 从哪里开始

**只读 `SPEC.md`。不要读前端源码。**SPEC.md 里已经包含了所有需要的类型定义、函数签名、控制流、测试数据。

## 关键规则

1. **严格按 SPEC.md 的阶段顺序**：阶段 1 → 2 → 3 → 4 → 5。每阶段 cargo test 全部通过后再进入下一阶段。
2. **不要猜测**：所有类型和函数签名都在 SPEC.md 里。如果 SPEC.md 没写清楚，问我，不要自己猜。
3. **不要改前端代码**：直到阶段 5 后端全部完成。
4. **不要改 `backend/src/tools/` 里的已有工具实现**：只需调用它们。
5. **所有新增文件在 `backend/src/agent/` 下**。
6. **serde 字段全部用 `#[serde(rename_all = "camelCase")]`**。
7. **消息存储在后端（SQLite）**：前端不存消息，不从 IndexedDB 读写消息。前端通过 `GET /api/session/{id}/messages` 加载历史，SSE 只用于实时流式渲染。

## 文件结构

```
specs/agent-migration/
├── README.md                              ← 本文件
├── SPEC.md                                ← 可执行规格（唯一需要读的文件）
└── fixtures/
    ├── messages/
    │   └── simple_conversation_input.json ← 测试数据
    ├── compaction/
    └── context/

docs/
└── agent-migration-plan.md                ← 架构设计文档（参考用）

backend/src/agent/                         ← 你需要创建/修改的文件都在这里
```

## 速查：文件创建顺序

```
1.  backend/src/agent/tool_dispatch.rs
2.  backend/src/agent/system_prompt.rs
3.  backend/src/agent/message_builder.rs
4.  backend/src/agent/event_log.rs
5.  backend/src/agent/compaction.rs
6.  backend/src/agent/retry.rs
7.  backend/src/agent/context_monitor.rs
8.  backend/src/agent/stall_detect.rs
9.  backend/src/agent/loop.rs
10. 修改 backend/src/agent/registry.rs
11. backend/src/agent/handoff.rs
12. backend/src/agent/handoff_workspace.rs
13. backend/src/agent/handoff_snapshot.rs
14. backend/src/agent/decision.rs
15. backend/src/agent/subagent.rs
16. 修改 backend/src/agent/mod.rs（注册新模块）
17. 修改 HTTP 路由（阶段 5）
```
