# AI 回答风格功能（实验室）

## 目标

在实验室设置中新增「AI 回答风格」功能，允许用户选择不同的 AI 表达风格（正常、玩梗、嘴臭、搞笑等），通过向系统提示词注入风格指令来改变 AI 的回答语气和表达方式。

## 决策记录

- **预设 + 自定义**：提供内置风格模板，用户可自定义每个风格的 system prompt
- **替换风格部分**：选中风格时，在系统提示词末尾追加风格指令覆盖默认表达方式
- **全局生效**：风格设置对所有对话生效
- **实验室设置页配置**：UI 只在实验室设置页中展示

## 实现步骤

### Step 1: 定义风格数据结构和预设

**文件：`src/features/lab/types.ts`**

在 `LabSettings` 中新增字段：

```typescript
export type ResponseStyleConfig = {
  enabled: boolean;
  selectedKey: string; // "normal" | "meme" | "roast" | "funny"
  customPrompts: Record<string, string>; // key → custom prompt, 覆盖默认
};
```

修改 `LabSettings`:

```typescript
export type LabSettings = {
  promptRefineEnabled: boolean;
  promptRefineSystemPrompt: string;
  responseStyle: ResponseStyleConfig;
};
```

**文件：`src/features/lab/constants.ts`**

定义风格预设列表：

| key | 名称 | 说明 |
|-----|------|------|
| `normal` | 正常版 | 默认，无额外指令 |
| `meme` | 玩梗版 | 融入网络热梗、流行梗 |
| `roast` | 嘴臭版 | 毒舌、刻薄但技术准确 |
| `funny` | 搞笑版 | 幽默风趣的编程助手 |

为每个风格（除 normal 外）定义默认的 system prompt 内容。

定义默认的 `ResponseStyleConfig`:

```typescript
export const DEFAULT_RESPONSE_STYLE_CONFIG: ResponseStyleConfig = {
  enabled: false,
  selectedKey: "normal",
  customPrompts: {},
};
```

更新 `DEFAULT_LAB_SETTINGS` 包含 `responseStyle` 字段。

### Step 2: 更新解析逻辑

**文件：`src/features/lab/parse-lab-settings.ts`**

在 `parseLabSettings` 中解析 `responseStyle` 字段，处理旧数据兼容（无该字段时使用默认值）。

### Step 3: 更新 store 和 useLabSettings

**文件：`src/features/lab/use-lab-settings.ts`**

新增辅助方法：

- `selectResponseStyle(key: string)` — 选择风格
- `toggleResponseStyle(enabled: boolean)` — 启用/关闭
- `updateResponseStyleCustomPrompt(key: string, prompt: string)` — 自定义某个风格的 prompt
- `resetResponseStyleCustomPrompt(key: string)` — 重置为默认

### Step 4: 注入风格到系统提示词

**文件：`src/features/agent/environment/build-system-prompt.ts`**

- 导入 `getLabSettingsSnapshot` 从 lab store
- 当 `responseStyle.enabled === true` 且 `selectedKey !== "normal"` 时，获取对应风格的 prompt（优先用 customPrompts[key]，回退到默认模板）
- 在系统提示词末尾（`modeGuidance` 之前）注入一个 `## Response Style` 章节：

```
## Response Style
{style_prompt_content}
```

对于 `normal` 风格或功能未启用时，不做任何修改。

同时需要将原有的 "Be concise, accurate, and friendly" 行标注为可被风格覆盖的基线，在风格生效时可以移除或垫上风格指令。

> 具体做法：将 `buildSystemPrompt` 的 identity 行改为由风格驱动的动态内容；当风格启用且非 normal 时，跳过默认语调行，改为输出风格指令。

### Step 5: 构建 UI — 实验室设置面板

**文件：`src/features/settings/components/lab-settings-panel.tsx`**

在现有设置项下方新增：

1. **开关**：启用/禁用回答风格功能（`responseStyle.enabled`）
2. **风格选择器**：当启用时，显示一组 radio 按钮/选择框列出所有风格
   - 每个选项显示风格名称
   - 选中时高亮
3. **自定义编辑器**：当选中非 normal 风格时，显示 textarea 允许用户编辑该风格的 prompt
   - 旁边有「恢复默认」按钮

使用现有 `SettingRow` / `SettingField` 组件保持一致 UI 风格。

### Step 6: 国际化文案

**文件：`src/lib/i18n/message-schema.ts`**

在 `settings.lab` 下新增：

```typescript
responseStyleLabel: string;
responseStyleDescription: string;
responseStyleAriaLabel: string;
responseStyleSelectLabel: string;
```

在 `settings.lab` 下新增各风格名称 key，或者在 `lab` 顶层新增 style 相关文案。

**文件：`src/lib/i18n/messages/en.ts`** — 英文翻译
**文件：`src/lib/i18n/messages/zh.ts`** — 中文翻译

### Step 7: 测试验证

- 确认 `parseLabSettings` 能正确解析新/旧数据
- 确认 `buildSystemPrompt` 在风格启用/未启用时输出正确的 prompt
- 确认 UI 中开关、选择、自定义编辑功能正常

## 涉及文件清单

| # | 文件 | 改动类型 |
|---|------|---------|
| 1 | `src/features/lab/types.ts` | 新增 `ResponseStyleConfig` 类型，修改 `LabSettings` |
| 2 | `src/features/lab/constants.ts` | 新增风格预设定义、默认配置 |
| 3 | `src/features/lab/parse-lab-settings.ts` | 新增 `responseStyle` 解析逻辑 |
| 4 | `src/features/lab/use-lab-settings.ts` | 新增风格选择/自定义辅助函数 |
| 5 | `src/features/agent/environment/build-system-prompt.ts` | 注入风格指令到系统提示词 |
| 6 | `src/features/settings/components/lab-settings-panel.tsx` | 新增风格选择 UI |
| 7 | `src/lib/i18n/message-schema.ts` | 新增翻译 key |
| 8 | `src/lib/i18n/messages/en.ts` | 英文文案 |
| 9 | `src/lib/i18n/messages/zh.ts` | 中文文案 |

## 风险 / 验证

- **风险**：`buildSystemPrompt` 是纯函数，导入 lab store 会引入副作用依赖。替代方案是将 style 作为参数传入，需要修改调用链。选择导入 store 的方案更简洁。
- **验证**：
  1. 开启风格 → 选择一个非 normal 风格 → 发送消息 → AI 应按照风格回复
  2. 切换回 normal / 关闭功能 → AI 应恢复默认回复风格
  3. 自定义某个风格的 prompt → 生效
  4. 恢复默认 → 回到预设
