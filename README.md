<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/favicon.png">
    <img alt="Coder" src="./public/favicon.png" width="128">
  </picture>
</p>

<h1 align="center">Coder</h1>

<p align="center">
  <strong>An AI-native development environment — built with React, Rust, and modern web technologies.</strong>
</p>

<p align="center">
  <a href="#features">Features</a>&nbsp;·&nbsp;
  <a href="#architecture">Architecture</a>&nbsp;·&nbsp;
  <a href="#quick-start">Quick Start</a>&nbsp;·&nbsp;
  <a href="#project-structure">Project Structure</a>&nbsp;·&nbsp;
  <a href="#configuration">Configuration</a>&nbsp;·&nbsp;
  <a href="#build--release">Build &amp; Release</a>&nbsp;·&nbsp;
  <a href="#contributing">Contributing</a>&nbsp;·&nbsp;
  <a href="#license">License</a>
</p>

<p align="center">
  <a href="./README.zh-CN.md">🇨🇳 中文</a>
</p>

---

## Overview

**Coder** is a full-featured AI-powered coding assistant that runs locally on your machine. It combines a high-performance Rust backend with a polished React frontend to deliver an intelligent development experience directly in your browser.

At its core, Coder runs an **autonomous agent loop** — the AI can read and write files, execute shell commands (locally and over SSH), search the web, browse pages, send emails, manage git repositories, and orchestrate complex multi-step workflows — all without leaving your local environment.

Beyond interactive chat, Coder supports a customizable **skills system**, and **multi-provider AI model** support through any OpenAI-compatible API.

---

## Features

### AI Agent

| Capability | Description |
|---|---|
| **Multi-turn Agent Loop** | Autonomous reasoning with tool calling, retry logic with exponential backoff, cancellation, and real-time streaming output via SSE. |
| **Context Monitoring** | Intelligent token budget tracking with automatic session compaction — when context runs low, Coder generates a structured summary and seamlessly continues in a fresh session. |
| **Reasoning & Thinking** | Full support for model reasoning traces (extended thinking), displayed as collapsible sections in the chat UI. |
| **Decision Engine** | Policy-based decision prompts that guide agent behavior with configurable rules and constraints. |
| **Prompt Refinement** | Optional AI-powered prompt optimization before sending — rewrites vague requests into clear, actionable instructions. |

### Tooling

| Capability | Description |
|---|---|
| **File System** | Read, write, edit (search-and-replace), replace lines/files, glob, grep, directory browsing, create/delete/rename/move operations with `.gitignore` awareness. |
| **Shell Execution** | Managed process pool with background execution, await/kill/poll lifecycle, real-time streaming output, and color-aware terminal banners. |
| **Remote SSH** | Persistent connection pool with session reuse, idle reaping, keepalive, multiple auth methods (SSH agent, key file, key content, password), and 10-minute hard execution limits. |
| **Git Integration** | Branch listing, checkout, status inspection — fully integrated into the agent's toolset. |
| **Web Search & Browsing** | Tavily-powered web search and page browsing with intelligent caching. |
| **Email** | SMTP email sending with TLS/STARTTLS support via configurable relay settings. |
| **Sub-agent Spawning** | Delegate independent sub-tasks to spawned agent instances with up to 3 levels of nesting depth. |

### Productivity

| Capability | Description |
|---|---|
| **Skills System** | Reusable, user-defined skill instructions that extend agent capabilities — managed through a dedicated UI with enable/disable per session. |
| **Plan Mode** | Structured task planning with event-driven progress tracking and visual plan sheets. |
| **Todo Management** | Agent-driven structured todo lists for multi-task workflows with real-time progress sync. |

### Editor & UI

| Capability | Description |
|---|---|
| **Rich Text Composer** | Tiptap-powered editor with `@` mentions for file/workspace references, skill references, image attachments, and context-aware insertions. |
| **Monaco Editor** | Full VS Code-style code editing with multiple syntax themes integrated inline. |
| **Markdown Rendering** | GFM-flavored Markdown with Shiki syntax highlighting, Mermaid diagrams, KaTeX math rendering, and emoji support. |
| **Virtual Scrolling** | High-performance message list rendering using TanStack Virtual for sessions with thousands of messages. |
| **Theme System** | Light / dark / system themes via `next-themes` with synchronized code editor theming. |
| **Internationalization** | Full English and Chinese localization with a pluggable i18n framework. |
| **Keyboard Shortcuts** | Customizable keyboard shortcut bindings with cross-platform support (macOS/Windows/Linux). |

### Session & Workspace

| Capability | Description |
|---|---|
| **Session Management** | Persistent chat sessions with auto-generated titles, fork capability, and full-text search. |
| **Workspace Binding** | Per-session workspace directories with git repository detection and file path awareness. |
| **Message Queue** | Ordered message queue for handling rapid user input during agent execution. |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                    Browser (React 19 + TypeScript)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │   Chat UI    │  │ Monaco Editor│  │ Markdown Renderer        │ │
│  │ (Agent Loop) │  │  (Code View) │  │ (Shiki + Mermaid + KaTeX)│ │
│  └──────┬───────┘  └──────────────┘  └──────────────────────────┘ │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Rich Composer│  │  Skills UI   │  │ Settings & Workspace UI  │ │
│  │ (Tiptap)     │  │              │  │                          │ │
│  └──────┬───────┘  └──────────────┘  └──────────────────────────┘ │
│         │                                                           │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Context Mgmt │  │  i18n (en/zh)│  │ Theme System             │ │
│  │ Token Monitor│  │              │  │ (Light/Dark/System)      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└───────────────────┬────────────────────────────────────────────────┘
                    │ HTTP / SSE
┌───────────────────▼────────────────────────────────────────────────┐
│                  Rust HTTP Server (axum + tokio)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Agent        │  │ Shell        │  │ Remote SSH               │  │
│  │ Registry     │  │ Pool         │  │ Connection Pool          │  │
│  │ (Agent Loop) │  │ (Process Mgmt│  │ (Session Reuse + Reaper) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Session      │  │ Tool         │  │ Page                     │  │
│  │ Persistence  │  │ Implementations│ │ Cache                    │  │
│  │              │  │ (fs, git, web,│  │                          │  │
│  │              │  │   mail, …)    │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                                                           │
│  ┌──────▼───────┐                                                   │
│  │ SQLite       │  (~/.coder/)                                      │
│  │ Persistence  │  sessions, messages, skills, todos, …            │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|---|---|
| **Backend** | Rust, axum 0.8, tokio, reqwest, rusqlite, ssh2, lettre |
| **Frontend** | React 19, TypeScript 5.8, Vite 7, Tailwind CSS 4, shadcn/ui (Radix UI) |
| **Rich Text** | Tiptap 3 (ProseMirror), Monaco Editor |
| **AI Integration** | AI SDK (`ai` 6.x), OpenAI-compatible streaming, tool calling |
| **Markdown** | react-markdown, remark-gfm, rehype-raw/sanitize, Shiki, KaTeX, Mermaid |
| **State & Routing** | React Router 7, custom stores (no external state library) |
| **Storage** | Server-side SQLite (`~/.coder/`), client-side IndexedDB via HTTP proxy |
| **Testing** | Vitest 4 with TypeScript support |
| **CI/CD** | GitHub Actions → npm package + macOS/Windows desktop installers |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20+ (LTS recommended)
- [pnpm](https://pnpm.io/) v9+
- [Rust](https://www.rust-lang.org/) toolchain (stable)

### Install & run in development

```bash
# Install dependencies
pnpm install

# Start the Vite dev server (port 1420)
pnpm dev

# In a separate terminal, start the Rust backend (port 1421)
pnpm dev:server

# Or start the desktop shell (embedded HTTP backend + Vite HMR; do not run with dev:server)
pnpm --dir desktop install   # first time
pnpm dev:desktop
```

The Vite dev server proxies `/api`, `/agent`, `/sse`, `/ws`, and `/db` requests to the Rust backend. Open `http://localhost:1420` in your browser.

### Run tests

```bash
# Run all frontend tests
pnpm test

# Watch mode
pnpm test:watch
```

### Install via npm (production)

```bash
npm i -g @leyen/coder
coder
```

The CLI downloads the platform-specific binary and starts the local server, opening your browser automatically.

---

## Project Structure

```
├── frontend/                          # React + TypeScript frontend
│   ├── src/
│   │   ├── app/                       # App shell, layout, router
│   │   ├── components/                # Shared UI components
│   │   │   ├── ai-elements/           # AI-specific rendering (messages, tools, reasoning)
│   │   │   ├── layout/                # Window controls, sidebar, title bar
│   │   │   ├── markdown/              # Markdown renderer with Shiki/Mermaid/KaTeX
│   │   │   └── ui/                    # shadcn/ui component library
│   │   ├── features/                  # Feature modules
│   │   │   ├── agent/                 # Agent loop, tools, context monitoring
│   │   │   ├── chat/                  # Chat session, composer, message list, hooks
│   │   │   ├── history/               # Session history page
│   │   │   ├── keyboard-shortcuts/    # Keyboard shortcut system
│   │   │   ├── lab/                   # Prompt refinement, response styles, DeepSeek balance
│   │   │   ├── plan/                  # Task planning service
│   │   │   ├── settings/              # Settings panels (model, email, remote, appearance…)
│   │   │   ├── skills/                # Skills management UI and registry
│   │   │   └── workspace/             # Workspace picker, git integration
│   │   ├── hooks/                     # Global custom hooks
│   │   └── lib/                       # Shared utilities
│   │       ├── api/                   # HTTP client, SSE handler
│   │       ├── db/                    # Client-side DB layer (IndexedDB via HTTP)
│   │       ├── i18n/                  # Internationalization (en, zh)
│   │       ├── keyboard-shortcuts/    # Shortcut matching and binding
│   │       ├── model-provider/        # AI model provider configuration
│   │       ├── monaco/                # Monaco editor setup
│   │       ├── storage/               # Storage abstraction layer
│   │       ├── theme/                 # Theme resolution and application
│   │       └── web-tools/             # Web search/browsing configuration
│   └── vite.config.ts
├── backend/                           # Rust HTTP server
│   ├── src/
│   │   ├── main.rs                    # Binary entry point, CLI args, graceful shutdown
│   │   ├── lib.rs                     # Library root, AppState initialization
│   │   ├── agent/                     # Agent orchestration, OpenAI client, SSE events
│   │   ├── tools/                     # Tool implementations
│   │   │   ├── fs: read/write/edit/glob/grep/list-dir/workspace-tree
│   │   │   ├── shell: process pool, background execution, streaming
│   │   │   ├── remote_connection: SSH pool, session management
│   │   │   ├── mail: SMTP email sending
│   │   │   ├── web_search/browse_page: Tavily search + page cache
│   │   │   └── git: branch operations
│   │   ├── http/                      # axum routes (agent, SSE, tools, settings, DB)
│   │   ├── db/                        # SQLite persistence layer
│   │   └── shell_env.rs               # Shell environment preloading
│   └── Cargo.toml
├── desktop/                           # Thin Tauri shell (window chrome + installers)
│   └── src-tauri/                     # Starts coder_lib HTTP server and loads WebView
├── npm/                               # CLI wrapper for npm distribution
│   └── cli.mjs
├── .github/workflows/                 # CI/CD (release.yml)
├── package.json
└── tsconfig.json
```

---

## Configuration

### AI Model Provider

Configure your AI provider in the **Settings → Model** page. Coder supports any OpenAI-compatible API endpoint, including:

- **OpenAI** — GPT-4, o1, and other models
- **Anthropic** — Claude (via compatible gateway)
- **DeepSeek** — With built-in balance tracking in Lab settings
- **Local Models** — Ollama, LM Studio, vLLM, or any OpenAI-compatible server

Multiple providers can be configured simultaneously with per-session model selection.

### Workspace

Each chat session binds to a workspace directory. The agent operates within this directory and is aware of git repositories rooted there. `.gitignore` rules are respected for file operations.

### Remote SSH Targets

Configure remote machines in **Settings → Remote Targets** with support for:

- **SSH Agent** authentication (forwarded from local agent)
- **Key file** or **inline key content** authentication
- **Password** authentication
- Automatic session pooling with 5-minute idle timeout and keepalive

### Skills

Custom skills define reusable instructions that extend the agent's capabilities. Manage them in the **Skills** page — create, enable/disable, and reference them inline using `@` mentions in the composer.

### Scheduled Automations

Create cron-based scheduled runs with:

- Configurable cron expressions
- Per-job workspace, model, and agent mode (Agent/Ask)
- Optional thinking/reasoning per job
- Each trigger creates a fresh standard session and sends the saved prompt as the first user message
- Run history with up to 50 recorded executions, each linked to its generated session

---

## Build & Release

### Manual build

```bash
pnpm build:frontend    # Build frontend (TypeScript + Vite → dist/)
pnpm build:backend     # Build Rust backend (release mode)
pnpm build:desktop     # Build desktop installers (dmg / nsis)
```

### Preview production build

```bash
pnpm preview           # Serve the built frontend locally
```

### Automatic release pipeline

Pushing to `main` triggers [`release.yml`](.github/workflows/release.yml), which publishes **one** versioned GitHub Release (`v0.1.<run_number>`) containing:

1. **Versioning** — `0.1.<run_number>` shared by npm and desktop installers.
2. **CLI binaries** — Cross-platform Rust builds published as `@leyen/coder-*` optional deps.
3. **npm publish** — Main package `@leyen/coder`.
4. **Desktop installers** — macOS `.dmg` and Windows NSIS `.exe` attached to the same Release Assets.
5. **Release notes** — Install instructions for both CLI and desktop, plus changelog.
---

## Contributing

### Code standards

This project follows the practices defined in [`AGENTS.md`](./AGENTS.md) — all code must meet world-class open-source standards for readability, maintainability, testability, and security. No technical debt is accepted.

### Adding a new tool

1. Implement the Rust handler in `backend/src/tools/`.
2. Register the HTTP route in the axum router (`backend/src/http/`).
3. Add the TypeScript binding and display component in `frontend/src/features/agent/tools/`.
4. Write tests — both Rust unit tests and Vitest frontend tests.

### Development workflow

```bash
# Frontend hot-reload (port 1420)
pnpm dev

# Backend with auto-recompile (port 1421)
pnpm dev:server

# Run tests
pnpm test
```

---

## License

[MIT](./LICENSE) © 2026
