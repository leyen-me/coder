"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";

import { getXtermTheme } from "../get-xterm-theme";
import { waitForTerminalFit } from "../wait-for-terminal-fit";

import "@xterm/xterm/css/xterm.css";
import "../interactive-terminal.css";

type InteractiveTerminalProps = {
  cwd: string;
  className?: string;
  isActive?: boolean;
};

export function InteractiveTerminal({
  cwd,
  className,
  isActive = true,
}: InteractiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const isActiveRef = useRef(isActive);
  const [error, setError] = useState<string | null>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isTauri() || !containerRef.current) {
      return;
    }

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: getXtermTheme(resolved),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const container = containerRef.current;

    void (async () => {
      try {
        await waitForTerminalFit(container, terminal, fitAddon);

        if (disposed) {
          return;
        }

        const outputUnlisten = await listen<{ ptyId: string; data: string }>(
          "pty-output",
          (event) => {
            if (event.payload.ptyId === ptyIdRef.current) {
              terminal.write(event.payload.data);
            }
          }
        );
        unlisteners.push(outputUnlisten);

        const closedUnlisten = await listen<{ ptyId: string }>(
          "pty-closed",
          (event) => {
            if (event.payload.ptyId === ptyIdRef.current) {
              terminal.writeln("\r\n[terminal closed]");
            }
          }
        );
        unlisteners.push(closedUnlisten);

        const cols = terminal.cols;
        const rows = terminal.rows;
        const session = await invoke<{ ptyId: string; cwd: string }>("pty_create", {
          cwd,
          cols,
          rows,
        });

        if (disposed) {
          await invoke("pty_close", { ptyId: session.ptyId });
          return;
        }

        ptyIdRef.current = session.ptyId;

        const dataDisposable = terminal.onData((data) => {
          const ptyId = ptyIdRef.current;
          if (!ptyId) {
            return;
          }
          void invoke("pty_write", { ptyId, data });
        });

        unlisteners.push(() => dataDisposable.dispose());

        const resizeObserver = new ResizeObserver(() => {
          fitAddon.fit();
          if (!isActiveRef.current) {
            return;
          }
          const ptyId = ptyIdRef.current;
          if (!ptyId) {
            return;
          }
          void invoke("pty_resize", {
            ptyId,
            cols: terminal.cols,
            rows: terminal.rows,
          });
        });
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }
        unlisteners.push(() => resizeObserver.disconnect());
      } catch (createError) {
        const message =
          createError instanceof Error
            ? createError.message
            : String(createError);
        setError(message);
      }
    })();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }

      const ptyId = ptyIdRef.current;
      if (ptyId) {
        void invoke("pty_close", { ptyId });
      }

      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      ptyIdRef.current = null;
    };
  }, [cwd]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = getXtermTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        await waitForTerminalFit(container, terminal, fitAddon);
        fitAddon.fit();
        const ptyId = ptyIdRef.current;
        if (ptyId) {
          void invoke("pty_resize", {
            ptyId,
            cols: terminal.cols,
            rows: terminal.rows,
          });
        }
        terminal.refresh(0, terminal.rows - 1);
        terminal.focus();
      })();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isActive]);

  if (!isTauri()) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Terminal is only available in the desktop app.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className={cn("interactive-terminal-host", className)} ref={containerRef} />
  );
}
