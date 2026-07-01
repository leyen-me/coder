# Coder CLI — Windows build script
$ErrorActionPreference = "Stop"

Set-Location (Split-Path $MyInvocation.MyCommand.Path)

Write-Host "==> Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "==> Building CLI..." -ForegroundColor Cyan
$env:NODE_ENV = "production"
node build.mjs

Write-Host "==> Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To install globally:"
Write-Host "  npm link"
Write-Host ""
Write-Host "Or run directly:"
Write-Host "  node dist/index.js --help"
