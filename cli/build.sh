#!/usr/bin/env bash
# Coder CLI — Unix build script
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Installing dependencies..."
npm install

echo "==> Building CLI..."
NODE_ENV=production node build.mjs

echo "==> Build complete!"
echo ""
echo "To install globally:"
echo "  npm link"
echo ""
echo "Or run directly:"
echo "  node dist/index.js --help"
