# ───────────────────────────────────────────────────────
# Coder — AI-powered coding assistant
# Multi-stage build from source:
#   1. frontend-builder — Vite + React → frontend/dist/
#   2. rust-builder     — Rust 编译 coder 二进制（嵌入前端）
#   3. runtime          — 最精简运行镜像
#
# ── 最低启动 ──
#   docker build -t coder .
#   docker run -p 1421:1421 -v coder-data:/root/.coder coder
#
# ── 持久化数据（推荐）──
#   docker volume create coder-data
#   docker run \
#     -p 1421:1421 \
#     -p 3000-3010:3000-3010 \
#     -p 5173-5183:5173-5183 \
#     -p 8000-8010:8000-8010 \
#     -v coder-data:/root/.coder \
#     coder
#
#   ~/.coder/ 包含: SQLite DB（设置/会话/历史）、logs、skills
#   挂载后重启容器设置和会话全部保留。
#
# ── 自定义端口 ──
#   docker run -p 8080:1421 -v coder-data:/root/.coder coder --port 8080
#
# ── 环境变量配置 ──
#   docker run \
#     -e CODER__MODEL=gpt-4 \
#     -e CODER__API_KEY=sk-... \
#     -v coder-data:/root/.coder \
#     coder
#
# ── 指定工作目录（默认 ~/.coder，agent 在此读写文件）──
#   docker run \
#     -v coder-data:/root/.coder \
#     -v /host/projects:/workspace \
#     coder --workspace-dir /workspace
# ───────────────────────────────────────────────────────

# ========================================================
# Stage 1 — Frontend 构建
# ========================================================
FROM node:20-slim AS frontend-builder

WORKDIR /app

# pnpm 激活
RUN npm i -g corepack && corepack enable pnpm

# 先复制依赖清单，利用 Docker 层缓存
COPY package.json pnpm-lock.yaml ./
COPY frontend/package.json frontend/

# 安装依赖（frozen lockfile → 确保可复现）
RUN pnpm install --frozen-lockfile

# 复制前端源码并构建
COPY frontend/ frontend/
RUN cd frontend && npx vite build

# ========================================================
# Stage 2 — Rust 后端编译
# ========================================================
FROM rust:1-slim-bookworm AS rust-builder

WORKDIR /app

# 编译依赖：gcc 在 rust:1-slim-bookworm 中已包含
RUN apt-get update -qq && apt-get install -y -qq \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Step 1: 仅复制 Cargo 清单 + 创建虚拟源 → 编译所有依赖（层缓存）
COPY backend/Cargo.toml backend/Cargo.lock backend/
RUN mkdir -p backend/src && \
    echo "fn main() {}" > backend/src/main.rs && \
    echo "" > backend/src/lib.rs
RUN cd backend && cargo build --release

# Step 2: 清除虚拟源，复制真实源码
RUN rm -rf backend/src/
COPY backend/ backend/

# Step 3: 复制前端构建产物（rust_embed 编译时嵌入）
COPY --from=frontend-builder /app/frontend/dist frontend/dist/

# Step 4: 编译真实二进制（仅重新编译 coder crate，依赖已缓存）
RUN cd backend && cargo build --release

# ========================================================
# Stage 3 — 运行镜像
# ========================================================
FROM debian:bookworm-slim

RUN apt-get update -qq && apt-get install -y -qq \
    ca-certificates \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=rust-builder /app/backend/target/release/coder /usr/local/bin/coder

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-1421}/ || exit 1

# 主服务端口
EXPOSE 1421
# Agent 可能启动的 dev server 端口范围 (Vite / Next.js / Python http.server 等)
EXPOSE 3000-3010 5173-5183 8000-8010

ENTRYPOINT ["coder"]
CMD ["--port", "1421"]
