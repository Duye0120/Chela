import { chatDev } from "./chat-dev.ts";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), chatDev()],
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 0 },
});
