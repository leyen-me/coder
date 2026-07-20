# ───────────────────────────────────────────────────────
# Coder — AI-powered coding assistant
# Multi-stage build from source:
#   1. frontend-builder — Vite + React → frontend/dist/
#   2. rust-builder     — Rust 编译 coder 二进制（嵌入前端）
#   3. runtime          — 最精简运行镜像
#
# Usage:
#   docker build -t coder .
#   docker run -p 1421:1421 -v coder-data:/root/.coder coder
#
# Options:
#   docker run -p 8080:1421 coder --port 8080
#   docker run -e CODER__MODEL=... -e CODER__API_KEY=... coder
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

EXPOSE 1421

ENTRYPOINT ["coder"]
CMD ["--port", "1421"]
