import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

type Props = {
  terminalId: string;
  visible: boolean;
};

export function TerminalTab({ terminalId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !terminalId) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      cursorBlink: true,
      cursorStyle: "bar",
      // Light theme colors
      theme: {
        background: "#f8f9fc",
        foreground: "#1e293b",
        cursor: "#3b82f6",
        selectionBackground: "#bfdbfe",
        selectionForeground: "#1e293b",
        black: "#334155",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#f1f5f9",
        brightBlack: "#64748b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    const desktopApi = window.desktopApi;

    // Send user keystrokes to pty
    const disposeData = term.onData((data) => {
      desktopApi?.terminal.write(terminalId, data);
    });

    // Receive pty output
    const cleanupOnData = desktopApi?.terminal.onData((id, data) => {
      if (id === terminalId) term.write(data);
    });

    // Handle resize
    const disposeResize = term.onResize(({ cols, rows }) => {
      desktopApi?.terminal.resize(terminalId, cols, rows);
    });

    // Window resize handler
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);

    cleanupRef.current = () => {
      disposeData.dispose();
      disposeResize.dispose();
      cleanupOnData?.();
      resizeObserver.disconnect();
      term.dispose();
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (visible && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#f8f9fc]"
      style={{ padding: "4px 0 0 4px" }}
    />
  );
}
