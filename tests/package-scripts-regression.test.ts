import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const gitignore = fs.readFileSync(".gitignore", "utf8");
const viteConfig = fs.readFileSync("electron.vite.config.ts", "utf8");
const vitestConfig = fs.readFileSync("vitest.config.ts", "utf8");
const vitestSetup = fs.readFileSync("tests/vitest-setup.ts", "utf8");
const mainTsConfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8")) as {
  compilerOptions: { types?: string[] };
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
assert.equal(packageJson.scripts["test:vitest"], "vitest run");
assert.equal(packageJson.scripts["test:coverage"], "vitest run --coverage");
assert.match(packageJson.devDependencies.vitest, /^\^/);
assert.match(packageJson.devDependencies["@vitest/coverage-v8"], /^\^/);
assert.equal(
  packageJson.scripts["chela:harness:eval"],
  "tsx scripts/readiness/run-readiness-report.ts --input tests/fixtures/readiness/all-scenarios-readiness.jsonl --json-out artifacts/readiness/eval-latest.json --md-out artifacts/readiness/eval-latest.md --fail-on-secret-leak",
);
assert.match(packageJson.scripts["test:regression"], /tests\/harness-readiness-report-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/readiness-runner-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/runtime-diagnostics-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/runtime-diagnostics-display-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/provider-autosave-ui-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/provider-state-cache-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/agent-lifecycle-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/parallel-tools-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/renderer-performance-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/shared-utils-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/metrics-cache-regression\.test\.ts/);
assert.match(packageJson.scripts["test:regression"], /tests\/module-split-regression\.test\.ts/);
assert.doesNotMatch(packageJson.scripts["test:regression"], /readiness_report_regression\.py/);

for (const dependencyName of [
  "@headlessui/react",
  "ansi-to-html",
  "dotenv",
  "motion",
  "prism-react-renderer",
  "radix-ui",
  "react-virtuoso",
]) {
  assert.equal(packageJson.dependencies[dependencyName], undefined);
}
assert.equal(packageJson.dependencies["electron"], undefined);
assert.equal(packageJson.dependencies["@types/diff"], undefined);
assert.equal(packageJson.devDependencies["electron"], "^41.1.0");
assert.equal(packageJson.devDependencies["@types/diff"], "^8.0.0");
assert.equal(packageJson.dependencies["framer-motion"], "^12.38.0");
assert.deepEqual(mainTsConfig.compilerOptions.types, ["node"]);
for (const dependencyName of [
  "@radix-ui/react-checkbox",
  "@radix-ui/react-select",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
]) {
  assert.ok(packageJson.dependencies[dependencyName]);
}

assert.match(viteConfig, /manualChunks/);
assert.match(viteConfig, /vendor-react/);
assert.match(viteConfig, /vendor-radix/);
assert.match(viteConfig, /vendor-editor/);
assert.match(vitestConfig, /from "vitest\/config"/);
assert.match(vitestConfig, /"@renderer": resolve\("src\/renderer\/src"\)/);
assert.match(vitestConfig, /"@shared": resolve\("src\/shared"\)/);
assert.match(vitestConfig, /setupFiles: \["tests\/vitest-setup\.ts"\]/);
assert.match(vitestConfig, /"tests\/vitest\/\*\*\/\*\.spec\.ts"/);
assert.match(vitestConfig, /reportsDirectory: "coverage"/);
assert.match(vitestConfig, /include: \["src\/\*\*\/\*\.\{ts,tsx\}"/);
assert.match(vitestSetup, /script regression module loads/);

assert.doesNotMatch(gitignore, /^pnpm-lock\.yaml$/m);
assert.match(gitignore, /^coverage$/m);

const regressionScript = packageJson.scripts["test:regression"];
const listedRegressionTests = new Set(
  [...regressionScript.matchAll(/tests\/[\w-]+\.test\.ts/g)].map((match) =>
    match[0].replaceAll("/", "\\"),
  ),
);
const topLevelRegressionTests = fs
  .readdirSync("tests")
  .filter((fileName) => fileName.endsWith(".test.ts"))
  .map((fileName) => `tests\\${fileName}`);
const unlistedRegressionTests = topLevelRegressionTests.filter(
  (filePath) => !listedRegressionTests.has(filePath),
);
assert.deepEqual(unlistedRegressionTests, []);

console.log("package scripts regression tests passed");
