import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";

const MAX_ATTEMPTS = 20;

/** Wait until the terminal container has layout and xterm can fit. */
export async function waitForTerminalFit(
  container: HTMLElement,
  terminal: Terminal,
  fitAddon: FitAddon
): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    fitAddon.fit();

    if (
      container.clientWidth > 0 &&
      container.clientHeight > 0 &&
      terminal.cols > 0 &&
      terminal.rows > 0
    ) {
      return;
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}
