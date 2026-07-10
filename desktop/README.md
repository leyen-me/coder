# Coder Desktop Shell

Thin Tauri wrapper around the existing HTTP architecture.

- Product logic: `backend/` (axum) + `frontend/` (React)
- This package: frameless window, title-bar chrome, macOS/Windows installers

## Develop

```bash
# from repo root
pnpm install
pnpm --dir desktop install   # first time
pnpm dev:desktop             # starts Vite + embedded HTTP server + Tauri window
```

Do not run `pnpm dev:server` in parallel — the shell already binds port `1421` in debug builds.

## Build

```bash
pnpm build:desktop
```

Artifacts: `desktop/src-tauri/target/release/bundle/` (dmg / nsis).
