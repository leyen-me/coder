import path from "path";
import tailwindcss from "@tailwindcss/vite";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    // Dependencies live in the workspace root node_modules (pnpm hoisting).
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    proxy: {
      // API 请求全部转发到 Rust 后端
      "/api": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/agent": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/sse": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:1421", ws: true },
      "/db": { target: "http://127.0.0.1:1421", changeOrigin: true },
      // Settings API 端点单独代理，避免前端路由 /settings 被劫持
      "/settings/get": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/settings/set": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/settings/delete": { target: "http://127.0.0.1:1421", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
