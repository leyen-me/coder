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
      // 所有 API 请求统一转发到 Rust 后端
      "/api": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:1421", ws: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
