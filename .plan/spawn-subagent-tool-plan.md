# Spawn Sub-Agent 工具

## Goal

为 Agent 添加 `spawn_subagent` 工具，使其能将独立子任务委托给一个子 Agent 实例执行。子 Agent 按串行、递归方式运行（父等待子完成后继续），结果以紧凑时间线视图展示。

---

## 设计要点

### 核心约束（小而美）
- **串行执行**：父 Agent 发起 `spawn_subagent` 后等待完成，不支持并发
- **递归复用**：子 Agent 直接调用现有的 `runAgentWithTools`，不引入新进程/新架构
- **最大嵌套深度 3**：防止 A→B→C→D 无限递归
- **工具子集**：子 Agent 默认继承父的所有工具，但工具定义层面可参数限制

### UI 展示三层结构
1. **Chip 层（折叠态）**：`🤖 {任务描述} ({步数})` — 在消息流中占一行
2. **Timeline 层（展开态）**：自定义精简时间线视图——每行一个图标 + Chip 标签，不渲染完整 ToolOutput
3. **摘要层**：子 Agent 的结果摘要，用 border 卡片兜底

---

## Steps

### Step 1: 定义 Tool 类型与 Handler

**文件：`src/features/agent/tools/spawn-subagent.ts`**（新建）

内容：
- `SPAWN_SUBAGENT_TOOL_NAME = "spawn_subagent"` 常量
- tool definition（JSON Schema）：`task: string`（必填），`context: string`（可选），`tools: string[]`（可选工具白名单）
- handler 函数 `spawnSubAgentHandler(args, context)`：
  - 校验嵌套深度（从 context 递归传递 depth 计数器，最大 3）
  - 生成子 taskId
  - 构建子 Agent 的 system prompt（描述子 Agent 角色 + 任务）
  - 调用 `runAgentWithTools` 并等待完成
  - 收集子 Agent 产生的事件，转存为 compact 格式的 steps
  - 返回 `toolSuccess` + 结构化结果

涉及类型：
- `SubAgentInput` — 入参类型
- `SubAgentStep` — 单步记录（kind: "reasoning" | "tool", text, toolName, toolLabel, state）
- `SubAgentOutput` — 返回类型（task, steps, summary, rounds, toolCalls, tokensUsed, error?）

### Step 2: 注册到工具系统

**修改：`src/features/agent/tools/definitions.ts`**
- 导出 `SPAWN_SUBAGENT_TOOL_NAME` 常量
- 导出 `SPAWN_SUBAGENT_TOOL` 定义

**修改：`src/features/agent/tools/registry.ts`**
- import `spawnSubAgentHandler`
- 在 `TOOL_HANDLERS` map 中注册

**修改：`src/features/agent/tools/index.ts`**
- 导出新增的常量、类型

### Step 3: 实现 Display Label

**文件：`src/features/agent/tools/spawn-subagent-display.ts`**（新建）

函数：
- `getSubAgentChipLabel(toolName, input, output): string | null` — 返回 `"spawn_subagent: {任务描述前40字}"`
- 从 input 中提取 task 字段截断后展示
- 从 output 中提取 steps 数量追加统计

### Step 4: 实现 Timeline 展示组件

**文件：`src/features/chat/components/sub-agent-tool-output.tsx`**（新建）

组件 `SubAgentToolOutput`：
- 接收 `invocation` 作为 props（包含 input, output, state, errorText）
- 从 output 提取 `SubAgentOutput`
- 渲染精简时间线：
  - reasoning 步骤：`💭 {文本}`
  - tool 步骤：`{对应图标} {chipLabel}`（复用已有的 `getXxxChipLabel` 逻辑）
  - 工具图标映射：🔍 grep, 📖 read_file, ⚡ edit_file, 💻 shell, 🌐 web_search, 🔧 其他
- 结果摘要卡片（底部 `summary` 区域）

**无依赖**：不引用 `ToolOutput`、`ShellOutput` 等重量级渲染组件。

### Step 5: 接入消息流渲染

**修改：`src/features/chat/components/tool-invocation-chip.tsx`**
- import `SPAWN_SUBAGENT_TOOL_NAME`
- import `getSubAgentChipLabel`
- 在 chipLabel 链中加入 `getSubAgentChipLabel`
- 新增 `isSubAgentTool` 判断
- 在非 inline 分支前新增处理：`isSubAgentTool` 时渲染 `<SubAgentToolOutput>`（内联折叠，非 Sheet）

**修改：`src/features/chat/components/tool-invocation-chip.tsx` 的内联工具列表**
- 将 `isSubAgentTool` 设为非 inline（用 Chip + 内联展开，不走 Sheet）
- 采用独立的渲染分支

### Step 6: 处理子 Agent 的事件管道

**修改：`src/features/agent/tools/spawn-subagent.ts`**（Step 1 的补充）

子 Agent 运行期间：
- 创建 `AbortController` 绑定到父 context.signal（父取消时递归取消子）
- 监听子 Agent 的 events，提取 reasoning 文本和 tool 标签
- 每一轮/每个工具调用记录为一条 `SubAgentStep`
- 子 Agent 完成时汇总 steps、rounds、toolCalls 数量

异常处理：
- 子 Agent 失败：记录 error 字段，父 Agent 仍可继续
- 子 Agent 超时/取消：同失败处理
- 深度超限：立即返回工具错误，不启动子 Agent

### Step 7: 验证

- 人工测试：在对话中触发父 Agent spawn 子 Agent，检查 UI 展示
- 边界：嵌套超过 3 层时工具返回错误
- 边界：子 Agent 任务为空字符串时返回错误
- 查看事件流：子 Agent 的 thinking/tool_call 不污染父消息

---

## Files to Touch

| 文件 | 操作 | 改动量 |
|------|------|--------|
| `src/features/agent/tools/spawn-subagent.ts` | 新建 | ~120 行 |
| `src/features/agent/tools/spawn-subagent-display.ts` | 新建 | ~30 行 |
| `src/features/chat/components/sub-agent-tool-output.tsx` | 新建 | ~80 行 |
| `src/features/agent/tools/definitions.ts` | 修改 | +5 行 |
| `src/features/agent/tools/registry.ts` | 修改 | +3 行 |
| `src/features/agent/tools/index.ts` | 修改 | +5 行 |
| `src/features/chat/components/tool-invocation-chip.tsx` | 修改 | +25 行 |
| **总计** | | **~268 行** |

---

## Risks / Verification

| 风险 | 缓解 |
|------|------|
| 子 Agent 修改文件后父 Agent 状态不一致 | 子 Agent 完成后父 Agent 可重新读取受影响文件，这是 LLM 自身行为非代码责任 |
| 子 Agent 递归嵌套失控 | depth 计数器 + 最大 3 层硬限制 |
| LLM 不理解何时使用 spawn_subagent | System prompt 中加入引导说明 + 随使用量改进 |
| 额外 Token 消耗 | 串行执行，消耗可预期且由用户可见 |

**验证方式**：
- TypeScript 编译通过（`tsc --noEmit`）
- 现有工具测试不回归
- 打开「研究认证架构」类场景手工验证子 Agent 的展开/折叠/进度/摘要展示
