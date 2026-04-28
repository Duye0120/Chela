import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

assert.equal(
  packageJson.scripts["native:rebuild:electron"],
  "pnpm dlx @electron/rebuild -f -o better-sqlite3 -v 41.1.0",
);
assert.equal(packageJson.scripts["native:verify:electron"], "tsx scripts/verify-electron-native.ts");
assert.match(packageJson.scripts.build, /native:rebuild:electron/);
assert.match(packageJson.scripts.build, /native:verify:electron/);
assert.match(packageJson.scripts.build, /electron-vite build/);
assert.equal(packageJson.scripts["build:raw"], "electron-vite build");

console.log("package scripts regression tests passed");
