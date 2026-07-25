# Coder

AI-powered coding assistant — local Rust backend with a modern React UI.

## Install

```bash
npm i -g @leyen/coder
```

## Usage

```bash
coder          # start the local server and open the browser
coder --help   # show CLI options
coder --version # show CLI version
```

Installing `@leyen/coder` automatically pulls the correct platform binary (`darwin-arm64`, `darwin-x64`, `linux-x64`, or `win32-x64`).

## Features

- Multi-turn AI agent with tools: files, shell, remote SSH, Git, web search, email
- Monaco editor, Markdown rendering (Shiki, Mermaid, KaTeX), skills system
- Context-aware session compaction, plan mode, bilingual UI (English / 中文)

## Requirements

- Node.js 20+ (CLI wrapper)
- An OpenAI-compatible model API configured on first run
- Linux (x64): glibc 2.35+ (e.g. Ubuntu 22.04 LTS or newer)

## Links

- [GitHub](https://github.com/leyen-me/coder)
- [Report an issue](https://github.com/leyen-me/coder/issues)

## 中文

**Coder** 是一款本地运行的 AI 编程助手。安装后执行 `coder` 即可启动服务并在浏览器中使用。

Linux (x64) 需要 glibc 2.35+（例如 Ubuntu 22.04 LTS 及以上）。

```bash
npm i -g @leyen/coder
coder
coder --version
```

## License

MIT
