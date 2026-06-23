# Statistics Page — 平台使用统计

## Goal

在侧边栏「Automations」下方新增一个「Statistics」入口，对应平级路由 `/statistics`，展示全平台（sessions / messages / agents）的使用统计数据，核心视觉是 GitHub 风格的 Token Usage 热力图。

## Steps

### 1. 新增路由和侧边栏入口

- `src/app/paths.ts` — 添加 `statistics: "/statistics"`
- `src/app/router.tsx` — 添加 `<Route path="statistics" element={<StatisticsPage />} />`，与 automations 平级
- `src/features/chat/components/app-sidebar.tsx` — 在 Automations 和 Settings 之间插入 Statistics 导航项，icon 用 `BarChart3`（lucide-react）
- `src/lib/i18n/messages/en.ts` — 添加 `sidebar.statistics`, `pages.statistics.title`
- `src/lib/i18n/messages/zh.ts` — 添加对应中文翻译

### 2. 新增数据库统计查询模块

新建 `src/lib/db/stats.ts`，提供以下查询函数：

| 函数 | 返回值 | 用途 |
|---|---|---|
| `getPlatformStats()` | `{ sessionCount, messageCount, agentRunCount, totalTokens }` | 概览卡片 |
| `getTodayStats()` | `{ todayMessages, weekMessages, todayTokens, todaySessions, topModel, avgDuration }` | 今日/本周活跃行 |
| `getMessageTrend(days)` | `{ date, userCount, assistantCount }[]` | 消息趋势折线图 |
| `getModelDistribution()` | `{ model, count, percentage }[]` | 模型饼图 |
| `getSessionTypeDistribution()` | `{ sessionKind, count }[]`, `{ autonomyMode, count }[]` | 会话类型分布 |
| `getToolUsageRanking(limit)` | `{ name, count }[]` | 工具调用 Top 10 |
| `getAgentDurationDistribution()` | `{ bucket, count }[]` (<5s, 5-15s, 15-30s, 30s+) | 耗时分布 |
| `getTokenUsageByDate(days)` | `{ date, totalTokens }[]` | 热力图数据源（按天聚合） |
| `getActiveSessions(limit)` | `{ title, messageCount, totalTokens, updatedAt }[]` | 活跃会话列表 |

所有函数遍历 IndexedDB 数据在 JS 层做聚合计算。

### 3. 新建 Statistics 页面组件

`src/features/statistics/` 目录结构：

```
features/statistics/
├── pages/
│   └── statistics-page.tsx       # 页面入口
├── components/
│   ├── stat-card.tsx             # 概览指标卡片
│   ├── today-activity-cards.tsx  # 今日/本周活跃行
│   ├── message-trend-chart.tsx   # 消息趋势折线图
│   ├── model-pie-chart.tsx       # 模型分布饼图
│   ├── session-type-chart.tsx    # 会话类型分布图
│   ├── tool-ranking-chart.tsx    # 工具调用 Top 10
│   ├── duration-chart.tsx        # Agent 耗时分布柱状图
│   ├── token-heatmap.tsx         # GitHub 风格热力图（手写）
│   └── active-sessions-table.tsx # 活跃会话表格
└── hooks/
    └── use-stats.ts              # 数据获取 hook
```

#### 3.1 `use-stats.ts`

- 页面挂载时调用所有 stats 查询函数
- 通过 `subscribeDb` 监听数据变更自动刷新
- 返回所有统计数据供组件消费

#### 3.2 页面布局

```
┌─────────────────────────────────────────────────────┐
│  📊 Statistics                                       │
│  Platform usage overview                             │
├──────────┬──────────┬──────────┬─────────────────────┤
│ Sessions  │ Messages  │ Agent Runs│ Total Tokens       │
├──────────┴──────────┴──────────┴─────────────────────┤
│  Today: Msgs  |  Week: Msgs  |  Today Tokens  | ...  │
├─────────────────────────────────────────────────────┤
│  ┌───Message Trend───┐  ┌───Model Distribution───┐  │
│  └───────────────────┘  └────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  ┌───Tool Ranking────┐  ┌───Agent Duration────────┐  │
│  └───────────────────┘  └────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  🔥 Token Usage Heatmap                              │
│  ┌─────────────────────────────────────────────────┐  │
│  │  GitHub-style calendar grid                     │  │
│  └─────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  Active Sessions                                     │
│  ┌──────┬──────┬──────────┬──────────┐              │
│  └──────┴──────┴──────────┴──────────┘              │
└─────────────────────────────────────────────────────┘
```

### 4. 手写 Token Heatmap 组件

`src/features/statistics/components/token-heatmap.tsx`

- 使用 CSS Grid 绘制格子矩阵（53 列 × 7 行）
- 数据：`getTokenUsageByDate(365)` 返回过去一年每天的 token 总量
- 颜色分 5 级：无数据（浅灰）、低（浅绿）、中、较高、高（深绿）
- 每月显示月份标签，左侧显示星期标签
- 右侧显示图例（Less / More）
- hover 时显示 tooltip：「June 15, 2026 — 142,530 tokens」
- 响应式：容器内自适应宽度

### 5. 国际化

`en.ts` 新增 keys：

```ts
sidebar: { statistics: "Statistics" }
pages: { statistics: { title: "Statistics" } }
statistics: {
  sessionCount, messageCount, agentRunCount, totalTokens,
  todayMessages, weekMessages, todayTokens, todaySessions,
  activeModel, avgDuration, messageTrend, modelDistribution,
  toolRanking, durationDistribution, tokenHeatmap, activeSessions,
  // tooltips
  less, more, tokens, messages, sessions, runs
}
```

`zh.ts` 对应中文。

### 6. 验证

- 路由 `/statistics` 可访问，页面不报错
- 侧边栏图标和文案正确，点击跳转正常
- 概览卡片显示正确数字
- 图表组件（Recharts）渲染正常
- 热力图渲染正确，hover tooltip 工作
- 空数据状态下（全新安装）不崩溃，显示友好提示
- 新增聊天/消息后刷新页面数据更新

## Files to Touch

| File | Change |
|---|---|
| `src/app/paths.ts` | 添加 `statistics` |
| `src/app/router.tsx` | 添加 Route |
| `src/features/chat/components/app-sidebar.tsx` | 添加导航项 |
| `src/lib/i18n/messages/en.ts` | 添加翻译 |
| `src/lib/i18n/messages/zh.ts` | 添加翻译 |
| `src/lib/db/stats.ts` | **新建** — 聚合查询模块 |
| `src/features/statistics/pages/statistics-page.tsx` | **新建** |
| `src/features/statistics/components/stat-card.tsx` | **新建** |
| `src/features/statistics/components/today-activity-cards.tsx` | **新建** |
| `src/features/statistics/components/message-trend-chart.tsx` | **新建** |
| `src/features/statistics/components/model-pie-chart.tsx` | **新建** |
| `src/features/statistics/components/session-type-chart.tsx` | **新建** |
| `src/features/statistics/components/tool-ranking-chart.tsx` | **新建** |
| `src/features/statistics/components/duration-chart.tsx` | **新建** |
| `src/features/statistics/components/token-heatmap.tsx` | **新建** |
| `src/features/statistics/components/active-sessions-table.tsx` | **新建** |
| `src/features/statistics/hooks/use-stats.ts` | **新建** |

## Risks / Verification

- **IndexedDB 聚合性能** — 如果 messages 表有数万条，遍历可能卡主线程。初始实现先全量遍历，后续可按需加 `limit` 或分页查询。验证：1000 条消息以内应 < 50ms。
- **热力图空数据** — 新安装用户没有数据，热力图应为全灰（无数据状态），不报错。
- **Recharts 版本兼容** — 确认项目现有 recharts 版本 API 匹配（项目已用 `recharts`，兼容性没问题）。
- **侧边栏图标** — `BarChart3` 确认在 lucide-react 中存在。
