import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["diff"] })],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
    build: {
      rollupOptions: {
        external: ["typescript"],
        input: {
          index: resolve("src/main/index.ts"),
          "embedding-worker": resolve("src/main/memory/embedding-worker.ts"),
        },
        output: {
          // 主入口与 worker 入口都按各自名字落到 out/main 下，便于 worker_threads
          // 用 `new URL("./embedding-worker.js", import.meta.url)` 解析。
          entryFileNames: "[name].js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return undefined;
            }

            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/react-router-dom/")) {
              return "vendor-react";
            }
            if (id.includes("@assistant-ui")) {
              return "vendor-assistant-ui";
            }
            if (id.includes("@radix-ui")) {
              return "vendor-radix";
            }
            if (id.includes("@tiptap") || id.includes("tiptap-markdown")) {
              return "vendor-editor";
            }
            if (id.includes("react-markdown") || id.includes("remark-gfm")) {
              return "vendor-markdown";
            }
            if (id.includes("@xterm")) {
              return "vendor-terminal";
            }

            return "vendor";
          },
        },
      },
    },
    server: {
      host: "127.0.0.1",
      hmr: {
        host: "127.0.0.1",
        protocol: "ws",
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
  },
});
