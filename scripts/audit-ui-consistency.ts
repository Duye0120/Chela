import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type Finding = {
  file: string;
  line: number;
  rule: string;
  text: string;
};

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const SCAN_ROOTS = [
  path.join(ROOT, "src", "renderer", "src"),
  path.join(ROOT, "tailwind.config.ts"),
];

const ALLOWED_TOKEN_SOURCE = new Set([
  "src/renderer/src/styles/theme.css",
  "src/renderer/src/styles.css",
]);
const SPECIAL_BOUNDARY_FILES = new Set([
  "src/renderer/src/lib/browser-inspector-script.ts",
  "src/renderer/src/components/ui/avatar.tsx",
]);
const CONFIG_TOKEN_FILES = new Set([
  "tailwind.config.ts",
]);

const RULES: {
  id: string;
  description: string;
  pattern: RegExp;
  skip?: (relativeFile: string, line: string) => boolean;
}[] = [
  {
    id: "raw-tailwind-color",
    description: "Tailwind palette or literal color class should use Chela semantic tokens",
    pattern:
      /\b(?:bg|text|border|ring|outline|decoration|from|via|to)-(?:gray|zinc|slate|neutral|stone|red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?\b|\b(?:bg|text|border|ring|shadow)-\[(?:#[0-9a-fA-F]{3,8}|color:(?:rgb|rgba|hsl|hsla)\([^)\]]+\)|(?:rgb|rgba|hsl|hsla)\([^)\]]+\))/gu,
    skip: (relativeFile) =>
      ALLOWED_TOKEN_SOURCE.has(relativeFile) ||
      CONFIG_TOKEN_FILES.has(relativeFile) ||
      SPECIAL_BOUNDARY_FILES.has(relativeFile),
  },
  {
    id: "raw-css-color",
    description: "Raw CSS color outside theme token source should be promoted to a semantic token",
    pattern:
      /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/gu,
    skip: (relativeFile, line) =>
      ALLOWED_TOKEN_SOURCE.has(relativeFile) ||
      CONFIG_TOKEN_FILES.has(relativeFile) ||
      SPECIAL_BOUNDARY_FILES.has(relativeFile) ||
      line.includes("getCssVariable(") ||
      line.includes("var(") ||
      line.trim().startsWith("//"),
  },
  {
    id: "radius-drift",
    description: "Generic radius utility should use var(--radius-shell) or a named Chela radius token",
    pattern:
      /\brounded-(?:none|xs|sm|md|lg|xl|2xl|3xl|full|\[(?!var\(--radius-shell\)|var\(--radius-pill\)|calc\(var\(--radius-shell\))[^"'\s]*)/gu,
    skip: (relativeFile, line) =>
      SPECIAL_BOUNDARY_FILES.has(relativeFile) ||
      line.includes("avatar") ||
      line.includes("Avatar") ||
      line.includes("progress") ||
      line.includes("Progress") ||
      line.includes("status") ||
      line.includes("Status") ||
      line.includes("dot") ||
      line.includes("Dot") ||
      line.includes("indicator") ||
      line.includes("Indicator") ||
      line.includes("scrollbar") ||
      line.includes("size-1") ||
      line.includes("size-2") ||
      line.includes("h-2 w-2") ||
      line.includes("size-8 rounded-full bg-transparent p-0") ||
      line.includes("absolute -top-12"),
  },
  {
    id: "heavy-border-default",
    description: "Border usage should stay limited to inputs, clear edges, errors, and separators",
    pattern: /\bborder(?:-[trblxy])?(?:\s|["'`])/gu,
    skip: (relativeFile, line) =>
      relativeFile.includes("/markdown-text.tsx") ||
      CONFIG_TOKEN_FILES.has(relativeFile) ||
      line.includes("border-none") ||
      line.includes("border-transparent") ||
      line.includes("border-[color:var(--color-control-border)]") ||
      line.includes("border-[color:var(--color-shell-border)]") ||
      line.includes("border-[color:var(--color-border-light)]") ||
      line.includes("border-border/50") ||
      line.includes("border-border bg-background") ||
      line.includes("border border-border") ||
      line.includes("divide-border"),
  },
];

async function collectFiles(target: string): Promise<string[]> {
  const normalized = path.normalize(target);
  if (path.extname(normalized)) {
    return [normalized];
  }

  const entries = await readdir(normalized, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const nextPath = path.join(normalized, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(nextPath);
      }
      if (/\.(css|ts|tsx)$/u.test(entry.name)) {
        return Promise.resolve([nextPath]);
      }
      return Promise.resolve([]);
    }),
  );
  return files.flat();
}

function relative(file: string) {
  return path.relative(ROOT, file).replace(/\\/gu, "/");
}

async function auditFile(file: string): Promise<Finding[]> {
  const content = await readFile(file, "utf8");
  const relativeFile = relative(file);
  const findings: Finding[] = [];

  content.split(/\r?\n/u).forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.skip?.(relativeFile, line)) {
        continue;
      }
      const matches = line.match(rule.pattern);
      if (!matches?.length) {
        continue;
      }
      findings.push({
        file: relativeFile,
        line: index + 1,
        rule: rule.id,
        text: line.trim().slice(0, 180),
      });
    }
  });

  return findings;
}

function formatFinding(finding: Finding) {
  return `${finding.file}:${finding.line} [${finding.rule}] ${finding.text}`;
}

const files = (await Promise.all(SCAN_ROOTS.map(collectFiles))).flat();
const findings = (await Promise.all(files.map(auditFile))).flat();
const grouped = new Map<string, Finding[]>();
const byFile = new Map<string, number>();

for (const finding of findings) {
  const items = grouped.get(finding.rule) ?? [];
  items.push(finding);
  grouped.set(finding.rule, items);
  byFile.set(finding.file, (byFile.get(finding.file) ?? 0) + 1);
}

console.log("Chela UI consistency audit");
console.log(`Scanned ${files.length} files`);
console.log(`Findings ${findings.length}`);
console.log("");
console.log("Top files");
for (const [file, count] of [...byFile.entries()]
  .sort(([, left], [, right]) => right - left)
  .slice(0, 10)) {
  console.log(`  ${file}: ${count}`);
}

for (const rule of RULES) {
  const items = grouped.get(rule.id) ?? [];
  console.log("");
  console.log(`${rule.id}: ${items.length}`);
  console.log(`  ${rule.description}`);
  for (const finding of items.slice(0, 12)) {
    console.log(`  ${formatFinding(finding)}`);
  }
  if (items.length > 12) {
    console.log(`  ... ${items.length - 12} more`);
  }
}

if (STRICT && findings.length > 0) {
  process.exitCode = 1;
}
