
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/tauri.svg">
    <img alt="Coder" src="./public/tauri.svg" width="128">
  </picture>
</p>

<h1 align="center">Coder</h1>

<p align="center">
  <strong>AI 原生代码编辑器 —— 基于 Tauri、React 与 Rust 构建。</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a>&nbsp;·&nbsp;
  <a href="#架构">架构</a>&nbsp;·&nbsp;
  <a href="#快速开始">快速开始</a>&nbsp;·&nbsp;
  <a href="#项目结构">项目结构</a>&nbsp;·&nbsp;
  <a href="#构建与发布">构建与发布</a>&nbsp;·&nbsp;
  <a href="#许可证">许可证</a>
</p>

<p align="center">
  <a href="./README.md">🇬🇧 English</a>
</p>

---

## 概述

**Coder** 是一款桌面端 AI 编程助手，将本地 Agent 循环运行在原生的 macOS / Windows / Linux 应用中。它集成了：

- **Rust 原生后端**（Tauri v2）—— 管理 AI Agent 生命周期、运行 PTY 终端、提供文件系统、Shell、Git 和 Web 工具。
- **React + TypeScript 前端** —— 丰富的聊天界面、内联 Markdown 渲染（支持 Mermaid 图表、KaTeX 数学公式、Shiki 代码高亮）、可拖拽面板和 xterm.js 终端。

Agent 可以读写文件、执行 Shell 命令、搜索网页、浏览页面、管理 Git 分支等——全部在一个原生窗口中完成。

---

## 功能特性

- **AI Agent 循环** — 多轮对话、工具调用、重试逻辑、取消支持和流式输出。
- **文件系统工具** — 读写、编辑、替换、glob 搜索、grep 搜索、创建/删除/重命名/移动文件和目录。
- **Shell 集成** — 通过托管进程池执行任意 Shell 命令；集成 xterm.js 终端，支持 PTY（macOS/Linux）。
- **Git 集成** — 列出分支、查看当前分支、切换分支。
- **Web 工具** — 网页搜索（Tavily）和页面浏览。
- **富 Markdown 渲染** — GFM、Shiki 语法高亮、Mermaid 图表、KaTeX 数学公式、表情符号。
- **技能与自动化** — 可自定义的 Agent 技能定义和自动化工作流。
- **会话历史** — 持久化聊天历史，支持自动生成会话标题。
- **工作区管理** — 每个会话独立的工作区目录，感知 Git 仓库。
- **主题支持** — 亮色/暗色/系统主题，支持多种代码编辑器配色方案。
- **跨平台** — 基于 Tauri v2，支持 macOS、Windows 和 Linux。
- **自动发布** — 通过 GitHub Actions，每次推送到 `main` 分支自动构建原生安装包。

---

## 架构

```
┌────────────────────────────────────────────────┐
│                Tauri Shell (Rust)                │
│  ┌────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Agent      │  │  PTY     │  │ Shell Pool │ │
│  │ Registry   │  │  Manager │  │ (Process)  │ │
│  └────┬───────┘  └──────────┘  └────────────┘ │
│       │            │                            │
│  ┌────▼────────────▼────────────────────┐       │
│  │        IPC（invoke / channels）        │       │
│  └────────────────┬─────────────────────┘       │
└───────────────────┼─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│              WebView (React 19 + TS)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Chat UI  │ │ Terminal │ │ Markdown Renderer│ │
│  │ (Agent)  │ │ (xterm)  │ │ (remark/rehype)  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Skills   │ │ History  │ │ Settings         │ │
│  │ & Auto   │ │ (IndexedDB)│ │ (Model/Theme)  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 核心技术栈

| 层级       | 技术                                                                   |
|-----------|----------------------------------------------------------------------|
| **核心**   | Tauri v2，Rust，tokio，reqwest，portable-pty                            |
| **前端**   | React 19，TypeScript，Vite 7，Tailwind CSS 4，shadcn/ui                 |
| **编辑器** | Tiptap（富文本）、Tiptap 扩展、xterm.js + @xterm/addon-fit               |
| **AI**     | AI SDK (`ai`)、流式输出、工具调用、退避重试                               |
| **Markdown** | remark-gfm、rehype-raw、rehype-sanitize、Shiki、KaTeX、Mermaid        |
| **存储**   | IndexedDB（通过 `idb`）、Redux Toolkit                                   |
| **CI/CD**  | GitHub Actions、tauri-action                                           |

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) v20+（推荐 LTS）
- [pnpm](https://pnpm.io/) v9+
- [Rust](https://www.rust-lang.org/) 工具链（stable）
- Tauri v2 所需的[平台相关依赖](https://v2.tauri.app/start/prerequisites/)

### 安装与开发

```bash
# 安装前端依赖
pnpm install

# 启动 Vite 开发服务器（端口 1420）
pnpm dev

# 另开一个终端，启动 Tauri 桌面应用
pnpm tauri dev
```

Tauri CLI 会自动连接 Vite 开发服务器并打开原生窗口。

### 运行测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test:watch
```

---

## 项目结构

```
├── src/                          # React 前端
│   ├── app/                      # 应用外壳、布局、路由
│   ├── assets/                   # 静态资源（图标、图片）
│   ├── components/               # 共享 UI 组件
│   │   ├── ai-elements/          # AI 相关 UI 原语
│   │   ├── dnd/                  # 拖拽
│   │   ├── layout/               # 主列、侧边栏、面板
│   │   ├── markdown/             # Markdown 渲染器（Shiki、Mermaid、KaTeX）
│   │   └── ui/                   # shadcn/ui 组件
│   ├── features/                 # 功能模块
│   │   ├── agent/                # Agent 循环、运行器、工具执行
│   │   ├── automations/          # 自动化工作流
│   │   ├── chat/                 # 聊天界面、消息、会话
│   │   ├── history/              # 会话历史
│   │   ├── right-panel/          # 右侧面板（文件树等）
│   │   ├── settings/             # 设置（模型、主题、API 密钥）
│   │   ├── skills/               # 技能定义与管理
│   │   ├── terminal/             # xterm.js 终端集成
│   │   └── workspace/            # 工作区目录管理
│   ├── hooks/                    # 共享 React Hook
│   ├── lib/                      # 工具库（i18n、主题、平台、数据库）
│   └── main.tsx                  # 入口文件
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 二进制入口
│   │   ├── lib.rs                # Tauri builder、插件注册
│   │   ├── agent/                # Agent 编排（Rust 侧）
│   │   ├── tools/                # 工具实现（文件系统、Shell、Git、Web）
│   │   ├── shell_env.rs          # Shell 环境预加载
│   │   └── window_chrome.rs      # 自定义窗口边框（macOS）
│   ├── capabilities/             # Tauri 权限/ACL
│   ├── icons/                    # 应用图标
│   └── Cargo.toml                # Rust 依赖
├── dist/                         # Vite 构建输出（前端）
├── docs/                         # 文档
├── .github/workflows/            # CI/CD（release.yml）
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 配置

### AI 模型

你可以在**设置**页面中配置 AI 提供商（基础 URL、API 密钥、模型名称）。应用支持任何兼容 OpenAI API 的服务：

- OpenAI
- Anthropic（通过兼容网关）
- 本地模型（Ollama、LM Studio 等）

### 工作区

开始新的聊天会话时，系统会提示你选择一个工作区目录。Agent 在此目录内操作，并能感知该目录下的 Git 仓库。

### 技能

自定义技能定义了 Agent 可复用的指令。通过**技能**页面管理，可在每个会话中启用或禁用。

---

## 构建与发布

### 手动构建

```bash
pnpm build            # 构建前端（TypeScript + Vite）
pnpm tauri build      # 构建 Tauri 原生应用
```

原生安装包将输出到 `src-tauri/target/release/bundle/`。

### 自动发布

推送到 `main` 分支会触发[发布工作流](.github/workflows/release.yml)，它会：

1. 生成基于时间戳的发布标签。
2. 在矩阵策略下为 Ubuntu、macOS 和 Windows 构建原生二进制。
3. 将构建产物发布到 GitHub Release。

---

## 开发

### 代码风格

本项目遵循 [`AGENTS.md`](./AGENTS.md) 中定义的规范——所有代码必须达到世界级开源标准，确保可读性、可维护性、可测试性和安全性。不接受技术债务。

### 添加新工具

1. 在 `src-tauri/src/tools/` 中实现 Rust 函数。
2. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册。
3. 在 `src/features/agent/tools/` 中添加 TypeScript 绑定。
4. 编写测试——包括 Rust 单元测试和 Vitest 前端测试。

---

## 许可证

[MIT](./LICENSE) © 2026
