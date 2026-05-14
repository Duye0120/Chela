import { Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { TooltipProvider } from "@renderer/components/ui/tooltip";
import "./styles.css";

type BoundaryState = {
  hasError: boolean;
  message: string;
};

class RenderErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }

  override componentDidCatch(error: unknown) {
    console.error("Renderer crashed:", error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="grid h-screen place-items-center bg-shell-window px-6 text-[color:var(--color-text-muted)]">
          <div className="max-w-xl rounded-[var(--radius-shell)] bg-[color:var(--chela-status-error-bg)] px-6 py-4 text-[color:var(--chela-status-error-text)] shadow-[var(--shadow-subtle)] ring-1 ring-[color:var(--chela-status-error-text)]/20">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--chela-status-error-text)]/60">Render Crash</p>
            <h1 className="mt-2 text-lg font-medium text-foreground">界面渲染失败</h1>
            <pre className="mt-2 whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--color-text-secondary)]">
              {this.state.message}
            </pre>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RenderErrorBoundary>
    <HashRouter>
      <TooltipProvider delayDuration={150}>
        <App />
      </TooltipProvider>
    </HashRouter>
  </RenderErrorBoundary>,
);
