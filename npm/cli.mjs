#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const PLATFORM = os.platform();
const ARCH = os.arch();

function platformKey() {
  const map = {
    darwin:  { arm64: "darwin-arm64", x64: "darwin-x64" },
    linux:   { x64: "linux-x64" },
    win32:   { x64: "win32-x64" },
  };
  return map[PLATFORM]?.[ARCH];
}

const key = platformKey();
if (!key) {
  console.error(`Unsupported platform: ${PLATFORM} ${ARCH}`);
  process.exit(1);
}

let binaryPath;
try {
  binaryPath = require.resolve(`@alanwchat/coder-${key}`);
} catch {
  console.error(
    `Missing binary for ${PLATFORM} ${ARCH}.\n` +
    `Make sure @alanwchat/coder-${key} is installed.`
  );
  process.exit(1);
}

const binary = path.join(
  path.dirname(binaryPath),
  PLATFORM === "win32" ? "coder.exe" : "coder"
);

const child = spawn(binary, process.argv.slice(2), {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));
