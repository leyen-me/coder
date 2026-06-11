
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/app-icon.png">
    <img alt="Coder" src="./public/app-icon.png" width="128">
  </picture>
</p>

<h1 align="center">Coder</h1>

<p align="center">
  <strong>AI‑native code editor — powered by Tauri, React, and Rust.</strong>
</p>

<p align="center">
  <a href="#features">Features</a>&nbsp;·&nbsp;
  <a href="#architecture">Architecture</a>&nbsp;·&nbsp;
  <a href="#getting-started">Getting Started</a>&nbsp;·&nbsp;
  <a href="#project-structure">Project Structure</a>&nbsp;·&nbsp;
  <a href="#build--release">Build &amp; Release</a>&nbsp;·&nbsp;
  <a href="#license">License</a>
</p>

<p align="center">
  <a href="./README.zh-CN.md">🇨🇳 中文</a>
</p>

---

## Overview

**Coder** is a desktop AI coding assistant that runs a local agent loop inside a native macOS / Windows / Linux application. It combines:

- A **Rust‑native backend** (Tauri v2) that manages an AI agent lifecycle, runs a PTY‑based terminal, and exposes filesystem, shell, git, and web tools.
- A **React + TypeScript frontend** with a rich chat interface, inline Markdown rendering (with Mermaid diagrams, KaTeX math, and code highlighting via Shiki), resizable panels, and an xterm.js terminal.

The agent can read and write files, run shell commands, search the web, browse pages, manage git branches, and more — all within a single native window.

---

## Features

- **AI Agent Loop** — Multi‑turn conversation with tool calling, retry logic, cancellation, and streaming output.
- **File System Tools** — Read, write, edit, replace, glob, grep, create/delete/rename/move files and directories.
- **Shell Integration** — Run arbitrary shell commands via a managed process pool; integrated xterm.js terminal with PTY support (macOS/Linux).
- **Git Integration** — List branches, get current branch, checkout branches.
- **Web Tools** — Web search (Tavily) and page browsing.
- **Rich Markdown Rendering** — GFM, code blocks with Shiki syntax highlighting, Mermaid diagrams, KaTeX math, emoji.
- **Skills & Automations** — Customisable skill definitions and automation workflows.
- **Session History** — Persistent chat history with session title generation.
- **Workspace Management** — Per‑session workspace directories with git repository awareness.
- **Theme Support** — Light/dark/system themes via `next-themes` with multiple code editor themes.
- **Cross‑platform** — Built with Tauri v2, runs on macOS, Windows, and Linux.
- **Automatic Releases** — CI/CD via GitHub Actions builds native installers on every push to `main`.

---

## Architecture

```
┌────────────────────────────────────────────────┐
│                 Tauri Shell (Rust)              │
│  ┌────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Agent      │  │  PTY     │  │ Shell Pool │ │
│  │ Registry   │  │  Manager │  │ (Process)  │ │
│  └────┬───────┘  └──────────┘  └────────────┘ │
│       │            │                            │
│  ┌────▼────────────▼────────────────────┐       │
│  │         IPC (invoke / channels)      │       │
│  └────────────────┬─────────────────────┘       │
└───────────────────┼─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│             WebView (React 19 + TS)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Chat UI │ │Terminal  │ │ Markdown Renderer│ │
│  │  (Agent) │ │ (xterm)  │ │ (remark/rehype)  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Skills   │ │ History  │ │ Settings         │ │
│  │ & Auto   │ │ (IndexedDB)│ │ (Model/Theme)  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Key technologies

| Layer        | Technology                                                        |
|-------------|-------------------------------------------------------------------|
| **Shell**    | Tauri v2, Rust, tokio, reqwest, portable-pty                      |
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui           |
| **Editor**   | Tiptap (rich text), TipTap extensions, xterm.js + @xterm/addon-fit |
| **AI**       | AI SDK (`ai`), streaming, tool calling, retry with backoff         |
| **Markdown** | remark-gfm, rehype-raw, rehype-sanitize, Shiki, KaTeX, Mermaid     |
| **Storage**  | IndexedDB via `idb`, Redux Toolkit                                 |
| **CI/CD**    | GitHub Actions, tauri-action                                       |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+ (LTS recommended)
- [pnpm](https://pnpm.io/) v9+
- [Rust](https://www.rust-lang.org/) toolchain (stable)
- Platform-specific dependencies for [Tauri v2](https://v2.tauri.app/start/prerequisites/)

### Install & run in development

```bash
# Install frontend dependencies
pnpm install

# Start the Vite dev server (port 1420)
pnpm dev

# In a separate terminal, start the Tauri desktop app
pnpm tauri dev
```

The Tauri CLI will automatically connect to the Vite dev server and open the native window.

### Run tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch
```

---

## Project Structure

```
├── src/                          # React frontend
│   ├── app/                      # App shell, layout, router
│   ├── assets/                   # Static assets (icons, images)
│   ├── components/               # Shared UI components
│   │   ├── ai-elements/          # AI-specific UI primitives
│   │   ├── dnd/                  # Drag & drop
│   │   ├── layout/               # Main column, sidebar, panels
│   │   ├── markdown/             # Markdown renderer (Shiki, Mermaid, KaTeX)
│   │   └── ui/                   # shadcn/ui components
│   ├── features/                 # Feature modules
│   │   ├── agent/                # Agent loop, runner, tool execution
│   │   ├── automations/          # Automation workflows
│   │   ├── chat/                 # Chat UI, messages, sessions
│   │   ├── history/              # Session history
│   │   ├── right-panel/          # Right-side panels (file tree, etc.)
│   │   ├── settings/             # Settings (model, theme, API keys)
│   │   ├── skills/               # Skill definitions & management
│   │   ├── terminal/             # xterm.js terminal integration
│   │   └── workspace/            # Workspace directory management
│   ├── hooks/                    # Shared React hooks
│   ├── lib/                      # Utilities (i18n, theme, platform, DB)
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Binary entry point
│   │   ├── lib.rs                # Tauri builder, plugin registration
│   │   ├── agent/                # Agent orchestration (Rust side)
│   │   ├── tools/                # Tool implementations (fs, shell, git, web)
│   │   ├── shell_env.rs          # Shell environment preloader
│   │   └── window_chrome.rs      # Custom window chrome (macOS)
│   ├── capabilities/             # Tauri capabilities/ACL
│   ├── icons/                    # App icons
│   └── Cargo.toml                # Rust dependencies
├── dist/                         # Vite build output (frontend)
├── docs/                         # Documentation
├── .github/workflows/            # CI/CD (release.yml)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Configuration

### AI Model

You can configure the AI provider (base URL, API key, model name) in the **Settings** page. The app supports any OpenAI‑compatible API, including:

- OpenAI
- Anthropic (via compatible gateway)
- Local models (Ollama, LM Studio, etc.)

### Workspace

When you start a new chat session, you will be prompted to select a workspace directory. The agent operates within this directory and is aware of git repositories rooted there.

### Skills

Custom skills define reusable instructions for the agent. They are managed via the **Skills** page and can be enabled/disabled per session.

---

## Build & Release

### Manual build

```bash
pnpm build            # Build frontend (TypeScript + Vite)
pnpm tauri build      # Build native Tauri application
```

The native installers will be placed in `src-tauri/target/release/bundle/`.

### Automatic release

Pushing to the `main` branch triggers the [release workflow](.github/workflows/release.yml), which:

1. Generates a timestamp‑based release tag.
2. Builds native binaries for Ubuntu, macOS, and Windows (via matrix strategy).
3. Publishes a GitHub Release with the built assets.

---

## Development

### Code style

This project follows the practices defined in [`AGENTS.md`](./AGENTS.md) — all code should meet world‑class open‑source standards for readability, maintainability, testability, and security. No technical debt.

### Adding a new tool

1. Implement the Rust function in `src-tauri/src/tools/`.
2. Register it in the `invoke_handler` in `src-tauri/src/lib.rs`.
3. Add the TypeScript binding in `src/features/agent/tools/`.
4. Write tests — both Rust unit tests and Vitest frontend tests.

---

## License

[MIT](./LICENSE) © 2026
