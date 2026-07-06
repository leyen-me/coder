<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/favicon.png">
    <img alt="Coder" src="./public/favicon.png" width="128">
  </picture>
</p>

<h1 align="center">Coder</h1>

<p align="center">
  <strong>AI 原生开发环境 —— 基于 React、Rust 和现代 Web 技术构建。</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a>&nbsp;·&nbsp;
  <a href="#架构">架构</a>&nbsp;·&nbsp;
  <a href="#快速开始">快速开始</a>&nbsp;·&nbsp;
  <a href="#项目结构">项目结构</a>&nbsp;·&nbsp;
  <a href="#配置">配置</a>&nbsp;·&nbsp;
  <a href="#构建与发布">构建与发布</a>&nbsp;·&nbsp;
  <a href="#贡献指南">贡献指南</a>&nbsp;·&nbsp;
  <a href="#许可证">许可证</a>
</p>

<p align="center">
  <a href="./README.md">🇬🇧 English</a>
</p>

---

## 概述

**Coder** 是一款功能完整的 AI 编程助手，运行在你的本地机器上。它结合了高性能的 Rust 后端和精致的 React 前端，直接在浏览器中提供智能的开发体验。

核心是一个**自主 Agent 循环** —— AI 可以读写文件、执行 Shell 命令（本地和远程 SSH）、搜索网页、浏览页面、发送邮件、管理 Git 仓库，以及编排复杂的多步骤工作流 —— 所有操作都在你的本地环境中完成。

除了交互式聊天，Coder 还支持面向长任务的**上下文感知会话交接**、可定制的**技能系统**，以及通过任意 OpenAI 兼容 API 支持的**多模型提供商**。

---

## 功能特性

### AI Agent

| 能力 | 描述 |
|---|---|
| **多轮 Agent 循环** | 自主推理与工具调用、指数退避重试逻辑、取消支持和基于 SSE 的实时流式输出。 |
| **上下文监控与会话交接** | 智能 token 预算跟踪与自动会话交接 —— 当上下文不足时，Coder 会生成结构化摘要并在新会话中无缝继续。 |
| **推理与思考** | 完整支持模型推理痕迹（扩展思考），在聊天界面中以可折叠区域展示。 |
| **决策引擎** | 基于策略的决策提示，通过可配置的规则和约束引导 Agent 行为。 |
| **提示词优化** | 发送前可选的 AI 提示词优化 —— 将模糊的请求重写为清晰、可执行的指令。 |

### 工具集

| 能力 | 描述 |
|---|---|
| **文件系统** | 读取、写入、编辑（搜索替换）、替换行/文件、glob/grep 搜索、目录浏览、创建/删除/重命名/移动操作，支持 `.gitignore`。 |
| **Shell 执行** | 托管进程池支持后台执行、await/kill/poll 生命周期管理、实时流式输出和颜色感知的终端横幅。 |
| **远程 SSH** | 持久连接池支持会话复用、空闲回收、保活机制、多种认证方式（SSH agent、密钥文件、密钥内容、密码），以及 10 分钟硬执行时限。 |
| **Git 集成** | 分支列出、切换、状态检查 —— 完全集成到 Agent 工具集中。 |
| **网页搜索与浏览** | Tavily 驱动的网页搜索和页面浏览，支持智能缓存。 |
| **邮件发送** | 基于 SMTP 的邮件发送，支持 TLS/STARTTLS，通过可配置的中继设置。 |
| **子 Agent 派生** | 将独立子任务委派给派生的 Agent 实例，最多支持 3 层嵌套深度。 |

### 生产力

| 能力 | 描述 |
|---|---|
| **技能系统** | 可复用的用户自定义技能指令扩展 Agent 能力 —— 通过专用 UI 管理，支持按会话启用/禁用。 |
| **计划模式** | 结构化任务规划，事件驱动进度跟踪和可视化计划面板。 |
| **待办事项管理** | Agent 驱动的 structured todo 列表，用于多任务工作流的实时进度同步。 |

### 编辑器与界面

| 能力 | 描述 |
|---|---|
| **富文本编辑器** | Tiptap 驱动的编辑器，支持 `@` 提及文件/工作区引用、技能引用、图片附件和上下文感知插入。 |
| **Monaco 编辑器** | 完整的 VS Code 风格代码编辑，内联集成多种语法主题。 |
| **Markdown 渲染** | GFM Markdown、Shiki 语法高亮、Mermaid 图表、KaTeX 数学公式和表情符号支持。 |
| **虚拟滚动** | 使用 TanStack Virtual 实现高性能消息列表渲染，轻松处理数千条消息的会话。 |
| **主题系统** | 亮色/暗色/系统主题（via `next-themes`），同步代码编辑器配色。 |
| **国际化** | 完整的英文和中文本地化，基于可插拔 i18n 框架。 |
| **键盘快捷键** | 可自定义的键盘快捷键绑定，跨平台支持（macOS/Windows/Linux）。 |

### 会话与工作区

| 能力 | 描述 |
|---|---|
| **会话管理** | 持久化聊天会话，自动生成标题、支持 fork 和全文搜索。 |
| **工作区绑定** | 每个会话独立的工作区目录，Git 仓库检测和文件路径感知。 |
| **消息队列** | 有序消息队列处理 Agent 执行期间的快速用户输入。 |

---

## 架构

```
┌───────────────────────────────────────────────────────────────────┐
│                    浏览器 (React 19 + TypeScript)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │   聊天界面    │  │ Monaco 编辑器│  │ Markdown 渲染器           │ │
│  │ (Agent 循环)  │  │  (代码视图)  │  │ (Shiki + Mermaid + KaTeX)│ │
│  └──────┬───────┘  └──────────────┘  └──────────────────────────┘ │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ 富文本编辑器  │  │   技能界面    │  │ 设置与工作区界面         │ │
│  │  (Tiptap)    │  │              │  │                          │ │
│  └──────┬───────┘  └──────────────┘  └──────────────────────────┘ │
│         │                                                           │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ 上下文管理    │  │ i18n (en/zh) │  │ 主题系统                 │ │
│  │ Token 监控   │  │              │  │ (亮色/暗色/系统)          │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└───────────────────┬────────────────────────────────────────────────┘
                    │ HTTP / SSE
┌───────────────────▼────────────────────────────────────────────────┐
│                  Rust HTTP 服务器 (axum + tokio)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Agent        │  │ Shell        │  │ 远程 SSH                 │  │
│  │ 注册表       │  │ 进程池       │  │ 连接池                   │  │
│  │ (Agent 循环) │  │ (进程管理)   │  │ (会话复用 + 空闲回收)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ 会话持久化    │  │ 工具实现      │  │ 页面缓存                 │  │
│  │ 与交接       │  │ (文件系统、Git│  │                          │  │
│  │              │  │  Web、邮件…) │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                                                           │
│  ┌──────▼───────┐                                                   │
│  │ SQLite       │  (~/.coder/)                                      │
│  │ 持久化存储    │  会话、消息、技能、待办…                           │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|---|---|
| **后端** | Rust，axum 0.8，tokio，reqwest，rusqlite，ssh2，lettre |
| **前端** | React 19，TypeScript 5.8，Vite 7，Tailwind CSS 4，shadcn/ui（Radix UI） |
| **富文本** | Tiptap 3（ProseMirror），Monaco Editor |
| **AI 集成** | AI SDK（`ai` 6.x），OpenAI 兼容流式输出，工具调用 |
| **Markdown** | react-markdown，remark-gfm，rehype-raw/sanitize，Shiki，KaTeX，Mermaid |
| **状态与路由** | React Router 7，自定义 stores（无外部状态库） |
| **存储** | 服务端 SQLite（`~/.coder/`），客户端 IndexedDB（通过 HTTP 代理） |
| **测试** | Vitest 4 支持 TypeScript |
| **CI/CD** | GitHub Actions → 多平台 Rust 二进制 → npm 发布 |

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) v20+（推荐 LTS）
- [pnpm](https://pnpm.io/) v9+
- [Rust](https://www.rust-lang.org/) 工具链（stable）

### 安装与开发运行

```bash
# 安装依赖
pnpm install

# 启动 Vite 开发服务器（端口 1420）
pnpm dev

# 另开一个终端，启动 Rust 后端（端口 1421）
pnpm dev:server
```

Vite 开发服务器会将 `/api`、`/agent`、`/sse`、`/ws` 和 `/db` 请求代理到 Rust 后端。在浏览器中打开 `http://localhost:1420`。

### 运行测试

```bash
# 运行所有前端测试
pnpm test

# 监听模式
pnpm test:watch
```

### 通过 npm 安装（生产环境）

```bash
npm i -g @alanwchat/coder
coder
```

CLI 会自动下载对应平台的二进制文件，启动本地服务器并打开浏览器。

---

## 项目结构

```
├── frontend/                          # React + TypeScript 前端
│   ├── src/
│   │   ├── app/                       # 应用外壳、布局、路由
│   │   ├── components/                # 共享 UI 组件
│   │   │   ├── ai-elements/           # AI 专属渲染（消息、工具、推理）
│   │   │   ├── layout/                # 窗口控制、侧边栏、标题栏
│   │   │   ├── markdown/              # Markdown 渲染器（Shiki/Mermaid/KaTeX）
│   │   │   └── ui/                    # shadcn/ui 组件库
│   │   ├── features/                  # 功能模块
│   │   │   ├── agent/                 # Agent 循环、工具、上下文监控、会话交接
│   │   │   ├── chat/                  # 聊天会话、编辑器、消息列表、hooks
│   │   │   ├── history/               # 会话历史页面
│   │   │   ├── keyboard-shortcuts/    # 键盘快捷键系统
│   │   │   ├── lab/                   # 提示词优化、回复风格、DeepSeek 余额
│   │   │   ├── plan/                  # 任务规划服务
│   │   │   ├── settings/              # 设置面板（模型、邮件、远程、外观…）
│   │   │   ├── skills/                # 技能管理 UI 和注册表
│   │   │   └── workspace/             # 工作区选择器、Git 集成
│   │   ├── hooks/                     # 全局自定义 hooks
│   │   └── lib/                       # 共享工具库
│   │       ├── api/                   # HTTP 客户端、SSE 处理器
│   │       ├── db/                    # 客户端数据库层（IndexedDB via HTTP）
│   │       ├── i18n/                  # 国际化（en, zh）
│   │       ├── keyboard-shortcuts/    # 快捷键匹配与绑定
│   │       ├── model-provider/        # AI 模型提供商配置
│   │       ├── monaco/                # Monaco 编辑器设置
│   │       ├── storage/               # 存储抽象层
│   │       ├── theme/                 # 主题解析与应用
│   │       └── web-tools/             # 网页搜索/浏览配置
│   └── vite.config.ts
├── backend/                           # Rust HTTP 服务器
│   ├── src/
│   │   ├── main.rs                    # 二进制入口、CLI 参数、优雅关闭
│   │   ├── lib.rs                     # 库根目录、AppState 初始化
│   │   ├── agent/                     # Agent 编排、OpenAI 客户端、SSE 事件
│   │   ├── tools/                     # 工具实现
│   │   │   ├── fs: read/write/edit/glob/grep/list-dir/workspace-tree
│   │   │   ├── shell: 进程池、后台执行、流式输出
│   │   │   ├── remote_connection: SSH 连接池、会话管理
│   │   │   ├── mail: SMTP 邮件发送
│   │   │   ├── web_search/browse_page: Tavily 搜索 + 页面缓存
│   │   │   └── git: 分支操作
│   │   ├── http/                      # axum 路由（agent、SSE、工具、设置、DB）
│   │   ├── db/                        # SQLite 持久化层
│   │   └── shell_env.rs               # Shell 环境预加载
│   └── Cargo.toml
├── npm/                               # npm 分发的 CLI 包装器
│   └── cli.mjs
├── .github/workflows/                 # CI/CD（release.yml）
├── package.json
└── tsconfig.json
```

---

## 配置

### AI 模型提供商

在**设置 → 模型**页面中配置你的 AI 提供商。Coder 支持任何 OpenAI 兼容的 API 端点，包括：

- **OpenAI** — GPT-4、o1 等模型
- **Anthropic** — Claude（通过兼容网关）
- **DeepSeek** — 在 Lab 设置中内置余额跟踪
- **本地模型** — Ollama、LM Studio、vLLM 或任何 OpenAI 兼容服务器

可同时配置多个提供商，支持按会话选择模型。

### 工作区

每个聊天会话绑定一个工作区目录。Agent 在此目录内操作，并能感知该目录下的 Git 仓库。文件操作会遵守 `.gitignore` 规则。

### 远程 SSH 目标

在**设置 → 远程目标**中配置远程机器，支持：

- **SSH Agent** 认证（从本地 agent 转发）
- **密钥文件**或**内联密钥内容**认证
- **密码**认证
- 自动会话池管理，5 分钟空闲超时和保活机制

### 技能

自定义技能定义可复用的指令来扩展 Agent 能力。在**技能**页面管理 —— 创建、启用/禁用，并在编辑器中通过 `@` 提及内联引用。

## 构建与发布

### 手动构建

```bash
pnpm build:frontend    # 构建前端（TypeScript + Vite → dist/）
pnpm build:backend     # 构建 Rust 后端（release 模式）
```

### 预览生产构建

```bash
pnpm preview           # 本地服务构建后的前端
```

### 自动发布流水线

推送到 `main` 分支会触发[发布工作流](.github/workflows/release.yml)：

1. **版本生成** — 基于 GitHub run 计数生成 `0.1.<run_number>` 版本号。
2. **前端构建** — 编译 React 前端，通过 `rust-embed` 嵌入 Rust 二进制。
3. **跨平台编译** — 矩阵策略构建原生二进制：
   - `aarch64-apple-darwin`（macOS Apple Silicon）
   - `x86_64-apple-darwin`（macOS Intel）
   - `x86_64-unknown-linux-gnu`（Linux x64）
   - `x86_64-pc-windows-msvc`（Windows x64）
4. **npm 发布** — 发布平台特定包（`@alanwchat/coder-*`）和主 CLI 包（`@alanwchat/coder`）。
5. **GitHub Release** — 创建包含安装说明的 Release。

---

## 贡献指南

### 代码规范

本项目遵循 [`AGENTS.md`](./AGENTS.md) 中定义的规范 —— 所有代码必须达到世界级开源标准，确保可读性、可维护性、可测试性和安全性。不接受技术债务。

### 添加新工具

1. 在 `backend/src/tools/` 中实现 Rust 处理函数。
2. 在 axum 路由中注册 HTTP 端点（`backend/src/http/`）。
3. 在 `frontend/src/features/agent/tools/` 中添加 TypeScript 绑定和显示组件。
4. 编写测试 —— 包括 Rust 单元测试和 Vitest 前端测试。

### 开发工作流

```bash
# 前端热重载（端口 1420）
pnpm dev

# 后端自动重编译（端口 1421）
pnpm dev:server

# 运行测试
pnpm test
```

---

## 许可证

[MIT](./LICENSE) © 2026
