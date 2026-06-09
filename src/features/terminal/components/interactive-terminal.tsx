"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import "@xterm/xterm/css/xterm.css";

type InteractiveTerminalProps = {
  cwd: string;
  className?: string;
};

export function InteractiveTerminal({ cwd, className }: InteractiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      theme: {
        background: "transparent",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    void (async () => {
      try {
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

  return <div className={className} ref={containerRef} />;
}
