# 多 Session + 多 Provider 架构设计

## 目标 / 背景

用户希望可以在多个 session 中使用不同的 provider/model（如 session A 用 DeepSeek，session B 用 GLM）。当前架构限制了这一点：

1. **单 Provider 上下文**：`ModelProviderProvider` 只有一个 `activeProvider`，所有 session 共享同一个 resolved 配置
2. **运行时绑死**：`agent-store.tsx` 的 `startAgentTask()` 使用全局 `resolvedRef.current` 取 API key/base URL，不按 session 的 model 来解析对应的 provider
3. **设置页受限**：设置页只允许配置一个`activeProvider`，其他 provider 即使有配置数据也无法在运行时被使用

注意：路由级别的多 session 切换已有（`chat/:chatId` + sidebar），这部分不变，不加 tab。

---

## 设计思路

核心变更：**Provider 从单激活模式改为多 provider 并行配置 + 按 session model 自动路由到对应 provider**。

---

### Step 1 — 数据层：Session 级别绑定 Provider

**现状**：`SessionRecord.model` 存储模型 ID，但无法反查来自哪个 provider。

**变更**：

- 向 `SessionRecord` 添加 `provider: ProviderId` 字段，显式记录该 session 使用的 provider

**改动文件**：
| 文件 | 变更 |
|---|---|
| `src/lib/db/types.ts` | `SessionRecord` 增加 `provider: ProviderId` 字段 |
| `src/lib/db/normalize-session.ts` | 处理 `provider` 字段的默认值/backward-compat |
| `src/lib/db/client.ts` | DB_VERSION 提升 + migration（补齐旧 session 的 provider） |
| `src/lib/db/sessions.ts` | `CreateSessionInput` / `SessionPatch` 增加 `provider` |

---

### Step 2 — Provider 配置：支持多 Provider 同时启用

**现状**：`ModelProviderSettings.activeProvider` 决定唯一激活的 provider，其他 provider 有存储但不被使用。

**变更**：

- 移除 `activeProvider` 概念，改为 `enabledProviders: ProviderId[]`（默认全部启用）
- 新增 `resolveProviderForModel(models: ModelProviderSettings, modelId: string): ResolvedProviderConfig | null` — 遍历所有 enabled provider，找到拥有该 model ID 的 provider 并返回其 resolved config
- `ModelProviderProvider` 不再只暴露一个 `resolved`，而是暴露：
  - `enabledProviders: ProviderId[]`
  - `allModels: ModelDefinition[]`（所有 enabled provider 的模型扁平合并）
  - `resolveProviderForModel(modelId: string): ResolvedProviderConfig`

**改动文件**：
| 文件 | 变更 |
|---|---|
| `src/lib/model-provider/types.ts` | `ModelProviderSettings` 增加 `enabledProviders: ProviderId[]`，移除 `activeProvider` |
| `src/lib/model-provider/constants.ts` | `DEFAULT_MODEL_PROVIDER_SETTINGS` 调整，`PROVIDER_IDS` 不再需要 active 概念 |
| `src/lib/model-provider/resolve-provider-config.ts` | 新增 `resolveProviderForModel()` 和 `mergeAllModels()` |
| `src/lib/model-provider/model-provider-provider.tsx` | 重构 context value：暴露 `enabledProviders`, `allModels`, `resolveProviderForModel()`，移除 `activeProvider` / `setActiveProvider` |
| `src/lib/model-provider/parse-model-provider-settings.ts` | 解析新字段 |

---

### Step 3 — Runtime：按 Session Model 解析 Provider Config

**现状**：`startAgentTask()` 固定使用 `{ baseUrl: resolved.baseUrl, apiKey: resolveApiKey(resolved), ... }`。

**变更**：

- `sendMessage()` 和 `regenerateMessage()` 在启动任务前：
  1. 读取 session 的 `provider` 字段（或 model ID）
  2. 调用 `resolveProviderForModel(modelId)` 获取该 session 对应的 provider config
  3. 将 resolved config 传给 `startAgentTask()`，而不是使用全局 `resolvedRef.current`
- `startAgentTask()` 增加 `resolvedConfig: ResolvedProviderConfig` 参数
- `generateHandoffDocument()` 和 `continueTaskFromHandoff()` 同理

**改动文件**：
| 文件 | 变更 |
|---|---|
| `src/features/agent/store/agent-store.tsx` | `startAgentTask`, `sendMessage`, `regenerateMessage`, `generateHandoffDocument`, `continueTaskFromHandoff` 均改为按 session 的 model 解析 provider config |
| `src/features/agent/model-preference.ts` | `resolveDefaultModel` 改为从 `allModels` 取默认，而不是从 `resolved.models` |

---

### Step 4 — 设置页重构：多 Provider 并行配置

**现状**：`ModelProviderSettingsPanel` 有一个 provider 选择下拉 + 该 provider 的独占配置区域。

**变更**：

- 移除"选择激活 provider"的下拉
- 改为 **所有 provider 的配置列表**，每个 provider 一个配置卡片/区块：
  - 每个 provider 顶部有 enable/disable 开关
  - 独立配置 API Key Source / API Key / Env Var
  - Custom provider 独立配置 Base URL 和自定义模型列表
  - Preset provider 显示 endpoint（只读）+ 模型列表（只读）
  - Provider 之间用分隔线隔开
- 视觉风格：垂直排列的配置卡片

**改动文件**：
| 文件 | 变更 |
|---|---|
| `src/features/settings/components/model-provider-settings-panel.tsx` | 大重构 |
| `src/features/settings/pages/settings-page.tsx` | 无需大改 |
| `src/features/settings/types.ts` | 无需改 |

---

### Step 5 — Model 选择器：展示所有已启用 Provider 的模型

**现状**：`PromptComposer` 和 `NewChatView` 中 model 选择器只展示 `resolved.models`。

**变更**：

- `PromptComposer` 的 model 下拉改为展示**所有 enabled provider 下的所有模型**
- 模型列表格式：`ProviderIcon ProviderName / ModelName`，用 group label 分隔
- 选中 model 时创建 session 自动绑定对应的 `provider`
- 已有 session（chat-session-view）加载时读取 session 的 `model` 和 `provider`，展示正确的当前选择

**改动文件**：
| 文件 | 变更 |
|---|---|
| `src/features/chat/components/prompt-composer.tsx` | Model selector props/内部逻辑改为接收分组模型列表 |
| `src/features/chat/views/new-chat-view.tsx` | `createSession` 增加 `provider`，`resolved.models` → `allModels` |
| `src/features/chat/views/chat-session-view.tsx` | model 选择逻辑改为从 `allModels` 中匹配 |

---

### Step 6 — 自动化（Automations）适配

**现状**：`AutomationRecord` 只有 `model` 字段。

**变更**：

- `AutomationRecord` 增加 `provider: ProviderId` 字段
- 自动化运行配置时按 provider 解析对应的 API key/base URL
- 自动化设置 UI 增加 provider 选择

**改动文件**：
| 文件 | 变更 |
|---|---|
| `src/lib/db/types.ts` | `AutomationRecord` 增加 `provider` |
| `src/lib/db/normalize-automation.ts` | 处理 `provider` backward-compat |
| `src/lib/db/client.ts` | migration |
| `src/features/automations/components/automation-dialog.tsx` | 增加 provider 选择器 |
| `src/features/automations/lib/run-config.ts` | 按 provider 解析运行配置 |

---

## 用户操作流程（无 Tab）

1. 用户进入设置 → Provider 配置页面 → 可看到所有 provider 的配置卡片，分别配置 DeepSeek / GLM / Agnes 的 API Key
2. 回到首页 → 新建 session → model 选择器里看到"DeepSeek / DeepSeek V4 Flash"、"GLM / GLM-5"等选项
3. 选了一个 DeepSeek 模型 → 发消息 → 系统用 DeepSeek 的 API Key 调 DeepSeek 的 endpoint
4. 侧边栏切到另一个 session（之前用 GLM 的）→ 继续发消息 → 系统用 GLM 的 API Key
5. 两个 session 互不干扰，各用各的 provider

---

## 风险 / 验证

### 兼容性
- 旧 `ModelProviderSettings` 没有 `enabledProviders` → 默认全部启用
- 旧 `SessionRecord` 没有 `provider` → normalize 时通过 model ID 反查，查不到则设默认值
- `activeProvider` 移除后，旧 localStorage 数据需要迁移

### 验证清单
1. [ ] 多个 provider 各自配置 API Key，分别能正常发消息
2. [ ] 旧 session 加载后正常运行
3. [ ] 旧 localStorage 数据升级无报错
4. [ ] 自动化选择不同 provider 正常运行
5. [ ] Provider 在设置页 enable/disable 后，模型列表立即更新

---

## 执行顺序

**Step 1 → Step 2 → Step 3 → Step 5 → Step 4 → Step 6**

数据层和配置层先改好（Step 1-2），再改运行时（Step 3），然后 UI（Step 5, 4），最后自动化（Step 6）。
