#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";

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
  // resolve package.json explicitly because the platform package has no "main" field
  const pkgJson = require.resolve(`@leyen/coder-${key}/package.json`);
  binaryPath = path.join(path.dirname(pkgJson), PLATFORM === "win32" ? "coder.exe" : "coder");
} catch {
  console.error(
    `Missing binary for ${PLATFORM} ${ARCH}.\n` +
    `Make sure @leyen/coder-${key} is installed.`
  );
  process.exit(1);
}

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));
