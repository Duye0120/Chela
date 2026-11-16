import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../../", import.meta.url);
const output = new URL("native/bin/runtime/", root);
await mkdir(output, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("native/agent/chat.mjs", root))],
  outfile: fileURLToPath(new URL("chat.cjs", output)),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  logLevel: "error",
  banner: {
    js: "const chelaModuleUrl = require('node:url').pathToFileURL(__filename).href; for (const key of ['log','info','warn','error','debug']) console[key] = (...args) => process.stderr.write(require('node:util').format(...args)+'\\n');",
  },
  define: { "import.meta.url": "chelaModuleUrl", PI_BUNDLED_NODE: "true" },
});
await copyFile(
  process.execPath,
  fileURLToPath(
    new URL(process.platform === "win32" ? "node.exe" : "node", output),
  ),
);
await build({entryPoints:[fileURLToPath(new URL("native/agent/mcp-host.mjs",root))],outfile:fileURLToPath(new URL("mcp.cjs",output)),bundle:true,platform:"node",format:"cjs",target:"node24",logLevel:"error"});
