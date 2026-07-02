# Coder CLI

**Coder CLI** is a terminal-based AI coding assistant that brings the full power of the [Coder](https://github.com/coder/coder) AI agent to your command line. It supports multiple AI providers, file operations, shell execution, web search, and more — all from the terminal.

## Features

- 🤖 **Full agent mode** – read, write, edit files, run shell commands, browse the web
- 📖 **Ask mode** – read-only queries (file reading, search, web)
- 📋 **Plan mode** – create and manage structured plans
- 💬 **Interactive REPL** – persistent chat sessions
- 🔧 **Multiple AI providers** – DeepSeek, GLM, Agnes, NVIDIA, MiniMax, custom OpenAI-compatible
- 🌐 **Cross-platform** – macOS, Windows, Linux
- 🚀 **Pipe-friendly** – works with stdin/stdout for scripting

## Installation

### Prerequisites

- **Node.js 18+** (Node.js 20+ recommended)

### Quick Install

```bash
# Clone the repository
git clone https://github.com/your-org/coder.git
cd coder/cli

# Install dependencies
npm install

# Build the CLI
npm run build

# Install globally (optional)
npm link
```

Or run directly:

```bash
node dist/index.js --help
```

## Quick Start

### 1. Initialize Configuration

```bash
coder init
```

This will guide you through setting up your AI provider and API key.

### 2. Run a Prompt

```bash
coder "What files are in this directory?"
```

### 3. Ask Mode (Read-Only)

```bash
coder ask "Explain the architecture of this project"
```

### 4. Interactive REPL

```bash
coder repl
```

### 5. With Specific Model/Provider

```bash
coder -m deepseek-v4-flash -p deepseek "Show me the main entry point"
```

## Usage Guide

### Command Reference

| Command | Description |
|---------|-------------|
| `coder <prompt>` | Run agent with inline prompt |
| `coder ask <prompt>` | Read-only query mode |
| `coder plan <prompt>` | Plan creation/management mode |
| `coder repl` | Start interactive REPL session |
| `coder init` | First-time configuration setup |
| `coder config` | View or edit configuration |
| `coder --help` | Show help |
| `coder --version` | Show version |

### Global Options

| Option | Description |
|--------|-------------|
| `-m, --model <model>` | Model ID to use |
| `-p, --provider <provider>` | Provider ID (`deepseek`, `glm`, `agnes`, `nvidia`, `minimax`, `custom`) |
| `-w, --workspace <path>` | Workspace directory (default: current directory) |
| `-y, --yes` | Auto-confirm prompts |
| `--no-stream` | Disable streaming output |

### REPL Commands

Inside the REPL, you can use:

| Command | Description |
|---------|-------------|
| `<prompt>` | Ask the agent anything |
| `exit` / `quit` | Exit REPL |
| `clear` | Clear screen |
| `help` | Show REPL commands |
| `model <id>` | Switch model |

### Configuration

Configuration is stored in a platform-appropriate directory:

- **macOS / Linux**: `~/.config/coder/cli/settings.json`
- **Windows**: `%APPDATA%/Coder/cli/settings.json`

View current configuration:

```bash
coder config
```

Set a specific value:

```bash
coder config activeProvider deepseek
coder config lastModel deepseek-v4-flash
coder config providers.deepseek.apiKeySource env
```

### Environment Variables

API keys can be set via environment variables (recommended for security):

| Provider | Environment Variable |
|----------|---------------------|
| DeepSeek | `DEEPSEEK_API_KEY` |
| GLM | `GLM_API_KEY` |
| Agnes | `AGNES_API_KEY` |
| NVIDIA | `NVIDIA_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| Custom | `CUSTOM_API_KEY` (configurable) |

Set an API key:

```bash
# macOS / Linux
export DEEPSEEK_API_KEY=your-api-key-here

# Windows (Command Prompt)
set DEEPSEEK_API_KEY=your-api-key-here

# Windows (PowerShell)
$env:DEEPSEEK_API_KEY="your-api-key-here"
```

## Examples

### File Operations

```bash
# Read a file
coder "Show me the contents of package.json"

# Edit a file
coder "Add a 'test' script to package.json that runs vitest"

# Search for code
coder ask "Find all places where we handle API errors"
```

### Web Browsing

```bash
# Web search
coder "Search for the latest TypeScript release notes"

# Browse a page
coder "Read https://nodejs.org/en/about and summarize"
```

### Shell Commands

```bash
# Run a build
coder "Run npm test and fix any failures"
```

### Pipe Mode

```bash
# Pipe input
cat errors.txt | coder "Analyze these errors and suggest fixes"

# Pipe output
coder "Generate a .gitignore for a Node.js project" >> .gitignore
```

## Platform Notes

### macOS
- Works out of the box with Terminal, iTerm2, or Warp
- For best REPL experience, use a terminal that supports true color

### Windows
- Works with Command Prompt, PowerShell, and Windows Terminal
- For the REPL, Windows Terminal is recommended
- Path separators are automatically handled

### Linux
- Works with any terminal emulator
- Requires Node.js 18+ (install via nvm or package manager)

## Development

### Project Structure

```
cli/
├── src/
│   ├── index.ts              # CLI entrypoint
│   ├── agent/                # Agent loop & LLM streaming
│   │   ├── runner.ts         # Multi-turn agent execution
│   │   ├── llm-stream.ts     # SSE streaming from OpenAI-compatible APIs
│   │   ├── session.ts        # Agent session lifecycle
│   │   ├── types.ts          # Agent types
│   │   └── environment/      # Environment resolution
│   ├── commands/             # CLI command implementations
│   │   ├── run.ts            # coder <prompt>
│   │   ├── ask.ts            # coder ask
│   │   ├── plan.ts           # coder plan
│   │   ├── repl.ts           # coder repl
│   │   ├── init.ts           # coder init
│   │   └── config.ts         # coder config
│   ├── config/               # Configuration management
│   │   └── index.ts
│   ├── handlers/             # Node.js-native tool handlers
│   │   ├── index.ts          # Handler registry & definitions
│   │   ├── list-dir.ts
│   │   ├── read-file.ts
│   │   ├── write-file.ts
│   │   ├── replace-file.ts
│   │   ├── edit-file.ts
│   │   ├── replace-lines.ts
│   │   ├── glob.ts
│   │   ├── grep.ts
│   │   ├── shell.ts
│   │   ├── shell-manager.ts
│   │   ├── web-search.ts
│   │   ├── browse-page.ts
│   │   ├── workspace-tree.ts
│   │   ├── todos.ts
│   │   ├── plans.ts
│   │   ├── ask-question.ts
│   │   └── spawn-subagent.ts
│   └── ui/                   # Terminal UI utilities
│       └── index.ts
├── build.mjs                 # esbuild configuration
├── build.sh                  # Unix build script
├── build.ps1                 # Windows build script
├── package.json
├── tsconfig.json
└── README.md
```

### Build

```bash
# Development build
node build.mjs

# Production build
NODE_ENV=production node build.mjs
```

### Type Check

```bash
npx tsc --noEmit
```

## License

MIT
