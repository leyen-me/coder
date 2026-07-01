/**
 * Terminal output utilities for Coder CLI.
 * Provides colored output, progress indication, and streaming helpers.
 */

import { isatty } from "node:tty";

const stdoutIsTTY = isatty(process.stdout.fd);
const stderrIsTTY = isatty(process.stderr.fd);

// ANSI color codes (no dependency on chalk for speed)
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function colorize(text: string, color: keyof typeof colors): string {
  if (!stdoutIsTTY) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

export function dim(text: string): string {
  return colorize(text, "dim");
}

export function bold(text: string): string {
  if (!stdoutIsTTY) return text;
  return `${colors.bold}${text}${colors.reset}`;
}

export function error(text: string): string {
  return colorize(text, "red");
}

export function success(text: string): string {
  return colorize(text, "green");
}

export function warning(text: string): string {
  return colorize(text, "yellow");
}

export function info(text: string): string {
  return colorize(text, "cyan");
}

// ---------------------------------------------------------------------------
// Streaming output
// ---------------------------------------------------------------------------

export function writeStream(text: string): void {
  process.stdout.write(text);
}

export function writeLine(text: string): void {
  process.stdout.write(text + "\n");
}

export function writeError(text: string): void {
  process.stderr.write(text + "\n");
}

// ---------------------------------------------------------------------------
// Spinner / progress
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private frame = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message = "";
  private running = false;

  start(message: string): void {
    if (!stderrIsTTY) {
      writeError(`⏳ ${message}`);
      return;
    }

    this.message = message;
    this.running = true;
    this.frame = 0;
    process.stderr.write(`${SPINNER_FRAMES[0]} ${message}`);
    this.interval = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      process.stderr.write(`\r${SPINNER_FRAMES[this.frame]} ${this.message}`);
    }, 80);
  }

  update(message: string): void {
    this.message = message;
    if (this.interval) {
      process.stderr.write(`\r${SPINNER_FRAMES[this.frame]} ${this.message}`);
    }
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    // Clear the spinner line
    if (stderrIsTTY) {
      process.stderr.write("\r\x1b[K");
    }
    if (finalMessage) {
      writeError(finalMessage);
    }
  }

  succeed(text: string): void {
    this.stop(`${success("✓")} ${text}`);
  }

  fail(text: string): void {
    this.stop(`${error("✗")} ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Thinking block rendering (like Claude Code's thinking animation)
// ---------------------------------------------------------------------------

export class ThinkingDisplay {
  private spinner: Spinner;
  private lines: string[] = [];
  private expanded = false;

  constructor() {
    this.spinner = new Spinner();
  }

  start(): void {
    this.spinner.start("Thinking...");
  }

  update(delta: string): void {
    this.spinner.update("Thinking...");
  }

  stop(): void {
    this.spinner.stop();
  }
}

// ---------------------------------------------------------------------------
// Confirm prompt
// ---------------------------------------------------------------------------

export async function confirmPrompt(question: string, autoYes: boolean = false): Promise<boolean> {
  if (autoYes) {
    return true;
  }

  if (!stderrIsTTY) {
    // Non-interactive: assume yes for piped input
    writeError(`${warning("⚠")} ${question} ${dim("(assuming yes for non-interactive)")}`);
    return true;
  }

  writeError(`${question} ${dim("[y/N]")} `);

  return new Promise((resolve) => {
    process.stdin.once("data", (data: Buffer) => {
      const input = data.toString().trim().toLowerCase();
      resolve(input === "y" || input === "yes");
    });
  });
}

// ---------------------------------------------------------------------------
// Box / separator
// ---------------------------------------------------------------------------

export function separator(title?: string): string {
  const width = Math.min(process.stdout.columns || 80, 80);
  if (!title) {
    return dim("─".repeat(width));
  }
  const titleStr = ` ${title} `;
  const half = Math.floor((width - titleStr.length) / 2);
  return dim("─".repeat(Math.max(0, half))) + bold(titleStr) + dim("─".repeat(Math.max(0, width - half - titleStr.length)));
}
