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
    port: 1420,
    strictPort: true,
    proxy: {
      // API 请求全部转发到 Rust 后端
      "/api": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/agent": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/sse": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:1421", ws: true },
      "/db": { target: "http://127.0.0.1:1421", changeOrigin: true },
      "/settings": { target: "http://127.0.0.1:1421", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
