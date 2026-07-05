
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/app-icon.png">
    <img alt="Coder" src="./public/app-icon.png" width="128">
  </picture>
</p>

<h1 align="center">Coder</h1>

<p align="center">
  <strong>AI‑native code editor — powered by React, Rust, and HTTP.</strong>
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

**Coder** is an AI coding assistant that runs a local agent loop backed by a Rust HTTP server. It combines:

- A **Rust backend** that manages an AI agent lifecycle, runs a PTY‑based terminal, and exposes filesystem, shell, git, and web tools over HTTP, SSE, and WebSocket.
- A **React + TypeScript frontend** with a rich chat interface, inline Markdown rendering (with Mermaid diagrams, KaTeX math, and code highlighting via Shiki), resizable panels, and an xterm.js terminal.

The agent can read and write files, run shell commands, search the web, browse pages, manage git branches, and more — all from your browser or the bundled CLI.

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
- **Cross‑platform** — Rust backend runs on macOS, Windows, and Linux; distributed via npm.
- **Automatic Releases** — CI/CD via GitHub Actions builds platform binaries and publishes to npm on every push to `main`.

---

## Architecture

```
┌────────────────────────────────────────────────┐
│              Rust HTTP Server (1421)            │
│  ┌────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Agent      │  │  PTY     │  │ Shell Pool │ │
│  │ Registry   │  │  Manager │  │ (Process)  │ │
│  └────┬───────┘  └──────────┘  └────────────┘ │
│       │            │                            │
│  ┌────▼────────────▼────────────────────┐       │
│  │   HTTP / SSE / WebSocket / SQLite    │       │
│  └────────────────┬─────────────────────┘       │
└───────────────────┼─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│             Browser (React 19 + TS)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Chat UI │ │Terminal  │ │ Markdown Renderer│ │
│  │  (Agent) │ │ (xterm)  │ │ (remark/rehype)  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Skills   │ │ History  │ │ Settings         │ │
│  │ & Auto   │ │ (SQLite) │ │ (settings.json)│ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Key technologies

| Layer        | Technology                                                        |
|-------------|-------------------------------------------------------------------|
| **Backend**  | Rust, axum, tokio, reqwest, portable-pty, SQLite                  |
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui           |
| **Editor**   | Tiptap (rich text), TipTap extensions, xterm.js + @xterm/addon-fit |
| **AI**       | AI SDK (`ai`), streaming, tool calling, retry with backoff         |
| **Markdown** | remark-gfm, rehype-raw, rehype-sanitize, Shiki, KaTeX, Mermaid     |
| **Storage**  | Server-side SQLite (entities), `~/.coder/settings.json` (settings) |
| **CI/CD**    | GitHub Actions, npm publish                                        |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+ (LTS recommended)
- [pnpm](https://pnpm.io/) v9+
- [Rust](https://www.rust-lang.org/) toolchain (stable)

### Install & run in development

```bash
# Install frontend dependencies
pnpm install

# Start the Vite dev server (port 1420)
pnpm dev

# In a separate terminal, start the Rust backend (port 1421)
pnpm dev:server
```

The Vite dev server proxies `/api`, `/agent`, `/sse`, `/ws`, and `/db` requests to the Rust backend. Open `http://localhost:1420` in your browser.

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
├── frontend/                     # React frontend
│   ├── src/
│   │   ├── app/                  # App shell, layout, router
│   │   ├── components/           # Shared UI components
│   │   ├── features/             # Feature modules (agent, chat, skills, …)
│   │   ├── lib/                  # Utilities (API client, i18n, theme, DB)
│   │   └── main.tsx              # Entry point
│   ├── vite.config.ts
│   └── dist/                     # Vite build output
├── backend/                      # Rust HTTP server
│   ├── src/
│   │   ├── main.rs               # Binary entry point
│   │   ├── agent/                # Agent orchestration
│   │   ├── tools/                # Tool implementations (fs, shell, git, web)
│   │   └── db/                   # SQLite persistence
│   └── Cargo.toml
├── npm/                          # CLI wrapper for npm distribution
├── npm-packages/                 # Platform-specific binary packages
├── .github/workflows/            # CI/CD (release.yml)
├── package.json
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
pnpm build:frontend    # Build frontend (TypeScript + Vite)
pnpm build:backend     # Build Rust backend (release)
```

### Install via npm

```bash
npm i -g @alanwchat/coder
coder
```

The CLI downloads the platform-specific binary and starts the local server, opening your browser automatically.

### Automatic release

Pushing to the `main` branch triggers the [release workflow](.github/workflows/release.yml), which:

1. Generates a timestamp‑based release tag.
2. Builds native binaries for Ubuntu, macOS, and Windows (via matrix strategy).
3. Publishes platform packages and the main `@alanwchat/coder` CLI to npm.
4. Creates a GitHub Release with release notes.

---

## Development

### Code style

This project follows the practices defined in [`AGENTS.md`](./AGENTS.md) — all code should meet world‑class open‑source standards for readability, maintainability, testability, and security. No technical debt.

### Adding a new tool

1. Implement the Rust handler in `backend/src/tools/`.
2. Register the HTTP route in the backend router.
3. Add the TypeScript binding in `frontend/src/features/agent/tools/`.
4. Write tests — both Rust unit tests and Vitest frontend tests.

---

## License

[MIT](./LICENSE) © 2026
