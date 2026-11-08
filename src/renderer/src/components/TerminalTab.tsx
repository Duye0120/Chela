import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Settings } from "@shared/contracts";
import "@xterm/xterm/css/xterm.css";

type Props = {
  terminalId: string;
  visible: boolean;
  focused?: boolean;
  settings: Settings | null;
};

function getCssVariable(name: string, fallback: string) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function getTerminalTheme() {
  return {
    background: getCssVariable("--color-shell-terminal", "#f8f9fc"),
    foreground: getCssVariable("--color-terminal-text", "#1e293b"),
    cursor: getCssVariable("--color-accent", "#3b82f6"),
    selectionBackground: getCssVariable("--color-accent-subtle", "#bfdbfe"),
    selectionForeground: getCssVariable("--color-terminal-text", "#1e293b"),
    black: getCssVariable("--terminal-ansi-black", "#334155"),
    red: getCssVariable("--terminal-ansi-red", "#ef4444"),
    green: getCssVariable("--terminal-ansi-green", "#22c55e"),
    yellow: getCssVariable("--terminal-ansi-yellow", "#eab308"),
    blue: getCssVariable("--terminal-ansi-blue", "#3b82f6"),
    magenta: getCssVariable("--terminal-ansi-magenta", "#a855f7"),
    cyan: getCssVariable("--terminal-ansi-cyan", "#06b6d4"),
    white: getCssVariable("--terminal-ansi-white", "#f1f5f9"),
    brightBlack: getCssVariable("--terminal-ansi-bright-black", "#64748b"),
    brightRed: getCssVariable("--terminal-ansi-bright-red", "#f87171"),
    brightGreen: getCssVariable("--terminal-ansi-bright-green", "#4ade80"),
    brightYellow: getCssVariable("--terminal-ansi-bright-yellow", "#facc15"),
    brightBlue: getCssVariable("--terminal-ansi-bright-blue", "#60a5fa"),
    brightMagenta: getCssVariable("--terminal-ansi-bright-magenta", "#c084fc"),
    brightCyan: getCssVariable("--terminal-ansi-bright-cyan", "#22d3ee"),
    brightWhite: getCssVariable("--terminal-ansi-bright-white", "#ffffff"),
  };
}

function parseFontFamily(fontFamily: string | undefined): string {
  if (!fontFamily) return "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace";

  const fonts = fontFamily.split(',').map((f) => {
    const trimmed = f.trim();
    if (trimmed.includes(' ') && !trimmed.startsWith("'") && !trimmed.startsWith('"')) {
      return `"${trimmed}"`;
    }
    return trimmed;
  });

  if (!fonts.some(f => f.toLowerCase() === 'monospace')) {
    fonts.push('monospace');
  }

  return fonts.join(', ');
}

export function TerminalTab({ terminalId, visible, focused = visible, settings }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !terminalId) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      theme: getTerminalTheme(),
      allowProposedApi: true,
      customGlyphs: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn("Failed to load WebGL addon", e);
    }

    termRef.current = term;
    fitRef.current = fitAddon;

    const desktopApi = window.desktopApi;

    // Send user keystrokes to pty
    const disposeData = term.onData((data) => {
      void desktopApi?.terminal.write(terminalId, data).catch((error: unknown) => {
        term.writeln(`\r\n终端输入失败：${String(error)}`);
      });
    });

    // Receive pty output
    const cleanupOnData = desktopApi?.terminal.onData((id, data) => {
      if (id === terminalId) term.write(data);
    });

    // Handle resize
    const disposeResize = term.onResize(({ cols, rows }) => {
      void desktopApi?.terminal.resize(terminalId, cols, rows).catch(console.warn);
    });

    // Window resize handler
    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) fitAddon.fit();
    });
    resizeObserver.observe(container);

    void desktopApi?.terminal.attach(terminalId).catch((error: unknown) => {
      term.writeln(`\r\n连接终端失败：${String(error)}`);
    });

    return () => {
      disposeData.dispose();
      disposeResize.dispose();
      cleanupOnData?.();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      fitRef.current?.fit();
      if (focused) termRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focused, visible]);

  useEffect(() => {
    const terminal = termRef.current;
    const container = containerRef.current;
    if (!terminal || !container) {
      return;
    }

    terminal.options.fontFamily = parseFontFamily(settings?.terminal.fontFamily);
    terminal.options.fontSize =
      settings?.terminal.fontSize ?? 13;
    terminal.options.scrollback = settings?.terminal.scrollback ?? 5000;
    terminal.options.theme = getTerminalTheme();
    container.style.backgroundColor = getCssVariable(
      "--color-shell-terminal",
      getCssVariable("--chela-bg-surface", ""),
    );
    if (container.clientWidth > 0 && container.clientHeight > 0) fitRef.current?.fit();
  }, [
    settings?.terminal.fontFamily,
    settings?.terminal.fontSize,
    settings?.terminal.scrollback,
    settings?.theme,
    settings?.customTheme,
  ]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-shell-terminal"
      style={{ padding: "4px 0 0 4px" }}
    />
  );
}
