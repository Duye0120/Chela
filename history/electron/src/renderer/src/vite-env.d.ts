/// <reference types="vite/client" />

import type { DesktopApi } from "@shared/contracts";
import type React from "react";

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        partition?: string;
        allowpopups?: boolean;
        webpreferences?: string;
      };
    }
  }
}

export {};
