import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { isPathAllowed } from "../security.js";
import {
  resolveWorkspaceBasePath,
  toRelativeWorkspacePath,
} from "./fs-utils.js";
import { resolveRipgrepCommand } from "./ripgrep.js";

const parameters = Type.Object({
  pattern: Type.Optional(Type.String({ description: "要搜索的模式；默认按正则解释" })),
  query: Type.Optional(Type.String({ description: "兼容参数：旧版 literal 搜索词" })),
  path: Type.Optional(Type.String({ description: "可选搜索根目录，默认 workspace 根目录" })),
  glob: Type.Optional(Type.String({ description: "可选 glob 过滤，例如 src/**/*.ts" })),
  filePattern: Type.Optional(Type.String({ description: "兼容参数：旧版 glob 过滤" })),
  output_mode: Type.Optional(Type.String({ description: "files_with_matches | content | count" })),
  regex: Type.Optional(Type.Boolean({ description: "兼容参数：旧版是否按正则处理 query" })),
  caseSensitive: Type.Optional(Type.Boolean({ description: "兼容参数：旧版是否区分大小写" })),
  "-B": Type.Optional(Type.Number({ description: "前文行数" })),
  "-A": Type.Optional(Type.Number({ description: "后文行数" })),
  "-C": Type.Optional(Type.Number({ description: "上下文行数" })),
  context: Type.Optional(Type.Number({ description: "上下文行数" })),
  "-n": Type.Optional(Type.Boolean({ description: "是否显示行号" })),
  "-i": Type.Optional(Type.Boolean({ description: "是否忽略大小写" })),
  type: Type.Optional(Type.String({ description: "文件类型，例如 ts / rs / py" })),
  head_limit: Type.Optional(Type.Number({ description: "最多返回多少条，默认 250" })),
  offset: Type.Optional(Type.Number({ description: "从第几条开始截取，默认 0" })),
  multiline: Type.Optional(Type.Boolean({ description: "是否启用 multiline" })),
  maxResults: Type.Optional(Type.Number({ description: "兼容参数：旧版最大结果数" })),
});

type GrepSearchDetails = {
  mode: string;
  numFiles: number;
  filenames: string[];
  content: string | null;
  numLines: number | null;
  numMatches: number | null;
  appliedLimit: number | null;
  appliedOffset: number | null;
};

const MAX_LINE_CHARS = 500;
const HARD_LINE_CAP = 5000; // absolute upper bound to protect against runaways

function toSafeInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback;
}

function normalizeMode(value?: string): "files_with_matches" | "content" | "count" {
  switch (value) {
    case "content":
    case "count":
      return value;
    default:
      return "files_with_matches";
  }
}

function normalizePattern(params: Record<string, unknown>): {
  pattern: string;
  fixedStrings: boolean;
  caseInsensitive: boolean;
} {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const pattern = typeof params.pattern === "string" ? params.pattern.trim() : "";
  const regex = params.regex === true;
  const caseSensitive = params.caseSensitive === true;
  const caseInsensitive = params["-i"] === true || (!caseSensitive && !params["-i"]);

  if (query) {
    return { pattern: query, fixedStrings: !regex, caseInsensitive };
  }
  return { pattern, fixedStrings: false, caseInsensitive };
}

function normalizeRipgrepPath(workspacePath: string, rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return trimmed;
  return toRelativeWorkspacePath(workspacePath, path.resolve(workspacePath, trimmed));
}

function extractFilenameFromContentLine(workspacePath: string, line: string): string | null {
  const matchLine = line.match(/^(.+?):(\d+):/);
  if (matchLine?.[1]) return normalizeRipgrepPath(workspacePath, matchLine[1]);
  const contextLine = line.match(/^(.+?)-(\d+)-/);
  if (contextLine?.[1]) return normalizeRipgrepPath(workspacePath, contextLine[1]);
  return null;
}

function truncateLine(line: string): string {
  if (line.length <= MAX_LINE_CHARS) return line;
  return `${line.slice(0, MAX_LINE_CHARS)}…[truncated ${line.length - MAX_LINE_CHARS} chars]`;
}

type StreamOptions = {
  cwd: string;
  args: string[];
  /**
   * Stop reading once we've collected this many usable lines past the offset.
   * Once reached, the child process is killed.
   */
  stopAfter: number;
  /** Skip this many usable lines before counting. */
  offset: number;
};

type StreamResult = {
  collected: string[];
  totalSeen: number;
  hadMore: boolean;
};

function streamRipgrep(options: StreamOptions): Promise<StreamResult> {
  return new Promise((resolve) => {
    const child = spawn(resolveRipgrepCommand(), options.args, {
      cwd: options.cwd,
      windowsHide: true,
    });

    const collected: string[] = [];
    let totalSeen = 0;
    let hadMore = false;
    let killed = false;

    const finalize = () => {
      try {
        child.stdout?.destroy();
      } catch { /* ignore */ }
      try {
        child.stderr?.destroy();
      } catch { /* ignore */ }
      try {
        child.kill();
      } catch { /* ignore */ }
    };

    const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (killed) return;
      if (!line.length) return;
      totalSeen += 1;
      // Skip until past offset.
      if (totalSeen <= options.offset) return;
      collected.push(truncateLine(line));
      if (collected.length >= options.stopAfter || totalSeen >= HARD_LINE_CAP) {
        hadMore = true;
        killed = true;
        rl.close();
        finalize();
      }
    });

    // Drain stderr to avoid backpressure but don't surface noise.
    child.stderr?.on("data", () => { /* ignore */ });

    const settle = () => {
      if (!killed && totalSeen > options.offset + collected.length) {
        // Should not happen but keep semantics consistent.
        hadMore = true;
      }
      resolve({ collected, totalSeen, hadMore });
    };

    rl.on("close", settle);
    child.on("error", () => settle());
    child.on("close", () => settle());
  });
}

function emptyDetails(mode: string): GrepSearchDetails {
  return {
    mode,
    numFiles: 0,
    filenames: [],
    content: null,
    numLines: null,
    numMatches: null,
    appliedLimit: null,
    appliedOffset: null,
  };
}

export function createGrepSearchTool(
  workspacePath: string,
): AgentTool<typeof parameters, GrepSearchDetails> {
  return {
    name: "grep_search",
    label: "文本搜索",
    description:
      "在 workspace 中做高性能全文搜索，调用原生 ripgrep。支持流式提前终止与单行截断，避免巨型文件拖垮上下文。",
    parameters,
    async execute(_toolCallId, params) {
      const normalized = normalizePattern(params as Record<string, unknown>);
      if (!normalized.pattern) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "pattern 不能为空。" }, null, 2) }],
          details: emptyDetails("files_with_matches"),
        };
      }

      const basePath = resolveWorkspaceBasePath(workspacePath, params.path);
      if (!isPathAllowed(basePath, workspacePath)) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "路径超出 workspace 范围。" }, null, 2) }],
          details: emptyDetails("files_with_matches"),
        };
      }

      const mode = normalizeMode(params.output_mode);
      const rgBasePath = path.relative(workspacePath, basePath) || ".";
      const limit = Math.max(
        1,
        Math.min(
          toSafeInteger(params.head_limit, toSafeInteger(params.maxResults, 250)),
          1000,
        ),
      );
      const offset = toSafeInteger(params.offset, 0);
      const context = toSafeInteger(params.context ?? params["-C"] ?? undefined, 0);
      const before = toSafeInteger(params["-B"], context);
      const after = toSafeInteger(params["-A"], context);
      const glob =
        typeof params.glob === "string"
          ? params.glob
          : typeof params.filePattern === "string"
            ? params.filePattern
            : undefined;

      const commonArgs = ["--color", "never", "--no-heading"];
      if (normalized.caseInsensitive) commonArgs.push("-i");
      if (normalized.fixedStrings) commonArgs.push("-F");
      if (params.multiline) commonArgs.push("--multiline");
      if (glob?.trim()) commonArgs.push("-g", glob.trim());
      if (params.type?.trim()) commonArgs.push("--type", params.type.trim());

      let details: GrepSearchDetails;

      if (mode === "files_with_matches") {
        const stream = await streamRipgrep({
          cwd: workspacePath,
          args: [...commonArgs, "-l", normalized.pattern, rgBasePath],
          stopAfter: limit,
          offset,
        });
        const filenames = stream.collected
          .map((line) => normalizeRipgrepPath(workspacePath, line))
          .filter(Boolean);
        details = {
          mode,
          numFiles: filenames.length,
          filenames,
          content: null,
          numLines: null,
          numMatches: null,
          appliedLimit: stream.hadMore ? limit : null,
          appliedOffset: offset > 0 ? offset : null,
        };
      } else if (mode === "count") {
        const stream = await streamRipgrep({
          cwd: workspacePath,
          args: [...commonArgs, "--count-matches", normalized.pattern, rgBasePath],
          stopAfter: limit,
          offset,
        });
        const filenames: string[] = [];
        let matchCounts = 0;
        for (const row of stream.collected) {
          const idx = row.lastIndexOf(":");
          const file = idx >= 0 ? row.slice(0, idx) : row;
          const tail = idx >= 0 ? row.slice(idx + 1) : "0";
          const value = Number.parseInt(tail, 10);
          filenames.push(normalizeRipgrepPath(workspacePath, file));
          if (Number.isFinite(value)) matchCounts += value;
        }
        details = {
          mode,
          numFiles: filenames.length,
          filenames,
          content: null,
          numLines: null,
          numMatches: matchCounts,
          appliedLimit: stream.hadMore ? limit : null,
          appliedOffset: offset > 0 ? offset : null,
        };
      } else {
        const stream = await streamRipgrep({
          cwd: workspacePath,
          args: [
            ...commonArgs,
            "-n",
            ...(before > 0 ? ["-B", String(before)] : []),
            ...(after > 0 ? ["-A", String(after)] : []),
            normalized.pattern,
            rgBasePath,
          ],
          stopAfter: limit,
          offset,
        });
        const filenames = [
          ...new Set(
            stream.collected
              .map((line) => extractFilenameFromContentLine(workspacePath, line))
              .filter((value): value is string => !!value),
          ),
        ];
        details = {
          mode,
          numFiles: filenames.length,
          filenames,
          content: stream.collected.join("\n"),
          numLines: stream.collected.length,
          numMatches: null,
          appliedLimit: stream.hadMore ? limit : null,
          appliedOffset: offset > 0 ? offset : null,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
        details,
      };
    },
  };
}
