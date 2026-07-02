/**
 * esbuild configuration for Coder CLI.
 * Bundles the CLI into a single executable Node.js file.
 */

import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

const isWatch = process.argv.includes("--watch");

async function build() {
  const buildOptions = {
    entryPoints: [join(__dirname, "src/index.ts")],
    outfile: join(__dirname, "dist/index.cjs"),
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    sourcemap: true,
    minify: process.env.NODE_ENV === "production",
    external: [],
    banner: {
      js: `#!/usr/bin/env node
/**
 * Coder CLI — AI-powered coding assistant
 * Bundled with esbuild
 */
`,
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
      "process.env.CLI_VERSION": JSON.stringify(pkg.version),
    },
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
    return;
  }

  const result = await esbuild.build(buildOptions);

  if (result.errors.length > 0) {
    console.error("Build failed:");
    for (const err of result.errors) {
      console.error(`  ${err.text}`);
    }
    process.exit(1);
  }

  // Make the output file executable (Unix)
  const outfile = join(__dirname, "dist/index.cjs");
  if (process.platform !== "win32") {
    try {
      const { chmodSync } = await import("node:fs");
      chmodSync(outfile, 0o755);
    } catch {
      // Windows doesn't support chmod
    }
  }

  const stats = readFileSync(outfile, "utf-8");
  const sizeKB = (Buffer.byteLength(stats) / 1024).toFixed(1);
  console.log(`\u2713 Build complete: ${outfile} (${sizeKB} KB)`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
