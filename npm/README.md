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
```

Installing `@leyen/coder` automatically pulls the correct platform binary (`darwin-arm64`, `darwin-x64`, `linux-x64`, or `win32-x64`).

## Features

- Multi-turn AI agent with tools: files, shell, remote SSH, Git, web search, email
- Monaco editor, Markdown rendering (Shiki, Mermaid, KaTeX), skills system
- Context-aware session handoff, plan mode, bilingual UI (English / 中文)

## Requirements

- Node.js 20+ (CLI wrapper)
- An OpenAI-compatible model API configured on first run

## Links

- [GitHub](https://github.com/leyen-me/coder)
- [Report an issue](https://github.com/leyen-me/coder/issues)

## 中文

**Coder** 是一款本地运行的 AI 编程助手。安装后执行 `coder` 即可启动服务并在浏览器中使用。

```bash
npm i -g @leyen/coder
coder
```

## License

MIT
