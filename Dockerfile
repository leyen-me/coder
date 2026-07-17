# ─────────────────────────────────────────────
# Coder — AI-powered coding assistant
# Usage:
#   docker build -t coder .
#   docker run -p 1421:1421 -v coder-data:/root/.coder coder
#
# Options:
#   docker run -p 8080:1421 coder --port 8080
#   docker run -e CODER__MODEL=... -e CODER__API_KEY=... coder
# ─────────────────────────────────────────────

FROM node:20-slim AS base

RUN apt-get update -qq && apt-get install -y -qq \
    ca-certificates \
    git \
    # glibc 兼容性所需
    libc6 \
    && rm -rf /var/lib/apt/lists/*

# 全局安装 coder（CLI wrapper + 自动下载平台二进制）
RUN npm i -g @leyen/coder@latest

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:${PORT:-1421}/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 1421

ENTRYPOINT ["coder"]
CMD ["--port", "1421"]
