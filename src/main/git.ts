import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createTwoFilesPatch, parsePatch } from "./diff-shim.ts";
import {
  getExtension,
  IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
} from "../shared/file-extensions.ts";
import type {
  GitBranchEntry,
  GitBranchSummary,
  GitDiffFile,
  GitDiffOverview,
  GitDiffSource,
  GitDiffSourceSnapshot,
} from "../shared/contracts.ts";

const execFileAsync = promisify(execFile);
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const MAX_UNTRACKED_PATCH_BYTES = 1024 * 1024;
const DIFF_SOURCES = ["unstaged", "staged", "all"] as const satisfies readonly GitDiffSource[];

type GitCommandResult = {
  stdout: string;
  stderr: string;
};

type GitStatusEntry = {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  status: GitDiffFile["status"];
};

type GitStatusSnapshot = {
  branch: GitBranchSummary;
  entries: GitStatusEntry[];
};

function normalizeGitPaths(paths: string[]): string[] {
  return Array.from(
    new Set(
      paths
        .map((filePath) => filePath.trim())
        .filter((filePath) => filePath.length > 0),
    ),
  );
}

function stripGitWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("warning: in the working copy of") &&
        !trimmed.startsWith("hint: Use -f") &&
        !trimmed.startsWith("hint: Disable this message")
      );
    })
    .join("\n")
    .trim();
}

async function runGit(args: string[], cwd: string): Promise<GitCommandResult> {
  const result = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: GIT_MAX_BUFFER,
    encoding: "utf8",
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function createEmptySourceSnapshot(): GitDiffSourceSnapshot {
  return {
    files: [],
    totalFiles: 0,
    totalAdditions: 0,
    totalDeletions: 0,
  };
}

function createEmptyBranchSummary(): GitBranchSummary {
  return {
    branchName: null,
    isDetached: false,
    hasChanges: false,
  };
}

function createEmptyOverview(generatedAt: number, isGitRepo: boolean): GitDiffOverview {
  return {
    isGitRepo,
    generatedAt,
    branch: createEmptyBranchSummary(),
    sources: {
      unstaged: createEmptySourceSnapshot(),
      staged: createEmptySourceSnapshot(),
      all: createEmptySourceSnapshot(),
    },
  };
}

async function isGitRepository(workspacePath: string) {
  try {
    const result = await runGit(["rev-parse", "--is-inside-work-tree"], workspacePath);
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

function getGitErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    stderr?: unknown;
    stdout?: unknown;
    message?: unknown;
  };
  const stderr =
    typeof candidate.stderr === "string" ? candidate.stderr.trim() : "";
  const stdout =
    typeof candidate.stdout === "string" ? candidate.stdout.trim() : "";

  if (stderr) return stderr;
  if (stdout) return stdout;
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }

  return fallback;
}

function createGitUserError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function isIpcPayloadLike(error: unknown): error is { code: string; message: string } {
  return (
    !!error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function isEmptyCommitOutput(output: string): boolean {
  return /nothing to commit|no changes added to commit/i.test(output);
}

async function hasStagedChanges(
  workspacePath: string,
  paths: string[],
): Promise<boolean> {
  const args = ["diff", "--cached", "--name-only"];
  if (paths.length > 0) {
    args.push("--", ...paths);
  }

  const result = await runGit(args, workspacePath);
  return result.stdout.trim().length > 0;
}

async function ensureGitRepository(workspacePath: string) {
  const repository = await isGitRepository(workspacePath);
  if (!repository) {
    throw new Error("当前 workspace 不是 Git 仓库。");
  }
}

async function assertBranchName(workspacePath: string, branchName: string) {
  const normalizedBranchName = branchName.trim();
  if (!normalizedBranchName) {
    throw new Error("分支名不能为空。");
  }

  try {
    await runGit(["check-ref-format", "--branch", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "分支名不合法。"));
  }

  return normalizedBranchName;
}

async function resolveDiffBase(workspacePath: string) {
  try {
    await runGit(["rev-parse", "--verify", "HEAD"], workspacePath);
    return "HEAD";
  } catch {
    return EMPTY_TREE_HASH;
  }
}

function normalizeStatus(statusCode: string): GitDiffFile["status"] | null {
  if (statusCode === "??") {
    return "untracked";
  }

  if (statusCode === "!!") {
    return null;
  }

  if (statusCode.includes("D")) {
    return "deleted";
  }

  return "modified";
}

function normalizePath(rawPath: string) {
  if (rawPath.includes(" -> ")) {
    return rawPath.split(" -> ").at(-1) ?? rawPath;
  }

  return rawPath;
}

function parseBranchTrackingCounts(summary: string) {
  const bracketStart = summary.indexOf("[");
  const bracketEnd = summary.indexOf("]", bracketStart + 1);
  if (bracketStart < 0 || bracketEnd <= bracketStart) {
    return {};
  }

  const trackingSummary = summary.slice(bracketStart + 1, bracketEnd);
  const aheadMatch = trackingSummary.match(/ahead\s+(\d+)/i);
  const behindMatch = trackingSummary.match(/behind\s+(\d+)/i);

  return {
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1] ?? "0", 10) : undefined,
    behind: behindMatch ? Number.parseInt(behindMatch[1] ?? "0", 10) : undefined,
  };
}

async function resolveDetachedHeadLabel(workspacePath: string): Promise<string> {
  try {
    const result = await runGit(["rev-parse", "--short", "HEAD"], workspacePath);
    const label = result.stdout.trim();
    return label || "HEAD";
  } catch {
    return "HEAD";
  }
}

async function resolveCurrentBranchName(workspacePath: string): Promise<string | null> {
  try {
    const result = await runGit(["symbolic-ref", "--short", "-q", "HEAD"], workspacePath);
    const branchName = result.stdout.trim();
    return branchName || null;
  } catch {
    return null;
  }
}

async function hasBranchUpstream(workspacePath: string): Promise<boolean> {
  try {
    await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], workspacePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePushRemote(workspacePath: string, branchName: string): Promise<string | null> {
  try {
    const configuredRemote = (
      await runGit(["config", "--get", `branch.${branchName}.remote`], workspacePath)
    ).stdout.trim();
    if (configuredRemote) {
      return configuredRemote;
    }
  } catch {
    // 读取分支配置失败时继续回退到仓库远程列表。
  }

  try {
    const result = await runGit(["remote"], workspacePath);
    const remotes = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (remotes.includes("origin")) {
      return "origin";
    }
    return remotes[0] ?? null;
  } catch {
    return null;
  }
}

async function resolveBranchSummary(
  branchLine: string | undefined,
  workspacePath: string,
): Promise<Omit<GitBranchSummary, "hasChanges">> {
  if (!branchLine || !branchLine.startsWith("## ")) {
    return {
      branchName: null,
      isDetached: false,
    };
  }

  const summary = branchLine.slice(3).trim();
  const trackingCounts = parseBranchTrackingCounts(summary);

  if (summary.startsWith("No commits yet on ")) {
    return {
      branchName: summary.slice("No commits yet on ".length).trim() || null,
      isDetached: false,
      ...trackingCounts,
    };
  }

  if (summary.startsWith("HEAD")) {
    return {
      branchName: await resolveDetachedHeadLabel(workspacePath),
      isDetached: true,
      ...trackingCounts,
    };
  }

  const branchName = summary.split("...")[0]?.trim() || null;
  return {
    branchName,
    isDetached: false,
    ...trackingCounts,
  };
}

async function listStatusSnapshot(workspacePath: string): Promise<GitStatusSnapshot> {
  const result = await runGit(
    ["status", "--porcelain=v1", "--branch", "--untracked-files=all"],
    workspacePath,
  );

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const firstLine = lines[0];
  const statusLines = firstLine?.startsWith("## ") ? lines.slice(1) : lines;
  const entries = statusLines
    .map((line) => {
      const statusCode = line.slice(0, 2);
      const fileStatus = normalizeStatus(statusCode);
      const filePath = normalizePath(line.slice(3));

      if (!fileStatus || !filePath) {
        return null;
      }

      return {
        path: filePath,
        indexStatus: statusCode[0] ?? " ",
        worktreeStatus: statusCode[1] ?? " ",
        status: fileStatus,
      };
    })
    .filter((entry): entry is GitStatusEntry => !!entry);
  const branch = await resolveBranchSummary(firstLine, workspacePath);

  return {
    branch: {
      ...branch,
      hasChanges: entries.length > 0,
    },
    entries,
  };
}

function isEntryInSource(entry: GitStatusEntry, source: GitDiffSource) {
  if (source === "staged") {
    return entry.status !== "untracked" && entry.indexStatus !== " " && entry.indexStatus !== "?";
  }

  if (source === "unstaged") {
    return entry.status === "untracked" || (entry.worktreeStatus !== " " && entry.worktreeStatus !== "?");
  }

  return true;
}

function resolveSourceStatus(entry: GitStatusEntry, source: GitDiffSource): GitDiffFile["status"] {
  if (source === "staged") {
    return entry.indexStatus === "D" ? "deleted" : "modified";
  }

  if (source === "unstaged") {
    if (entry.status === "untracked") {
      return "untracked";
    }

    return entry.worktreeStatus === "D" ? "deleted" : "modified";
  }

  return entry.status;
}

function resolveFileKind(filePath: string, patch: string): GitDiffFile["kind"] {
  const extension = getExtension(filePath);

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (patch.includes("Binary files")) {
    return "binary";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  return "binary";
}

function resolvePreviewPath(workspacePath: string, filePath: string, kind: GitDiffFile["kind"]) {
  if (kind !== "image") {
    return undefined;
  }

  const absolutePath = path.resolve(workspacePath, filePath);
  return existsSync(absolutePath) ? absolutePath : undefined;
}

function createUntrackedPatch(workspacePath: string, filePath: string) {
  const absolutePath = path.resolve(workspacePath, filePath);

  if (!existsSync(absolutePath)) {
    return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n`;
  }

  const fileStats = statSync(absolutePath);
  if (fileStats.size > MAX_UNTRACKED_PATCH_BYTES) {
    return [
      `diff --git a/${filePath} b/${filePath}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${filePath}`,
      `@@ -0,0 +1 @@`,
      `+File is too large to display (${fileStats.size} bytes).`,
    ].join("\n");
  }

  const buffer = readFileSync(absolutePath);
  if (buffer.includes(0)) {
    return [
      `diff --git a/${filePath} b/${filePath}`,
      "new file mode 100644",
      `Binary files /dev/null and b/${filePath} differ`,
    ].join("\n");
  }

  const content = buffer.toString("utf8");
  return createTwoFilesPatch(
    filePath,
    filePath,
    "",
    content,
    "0000000",
    "working-tree",
    { context: 3 },
  );
}

async function createTrackedPatch(
  workspacePath: string,
  filePath: string,
  baseRef: string,
  source: GitDiffSource,
) {
  try {
    const sourceArgs =
      source === "staged"
        ? ["diff", "--cached", "--no-ext-diff", "--unified=3", "--relative", baseRef]
        : source === "all"
          ? ["diff", "--no-ext-diff", "--unified=3", "--relative", baseRef]
          : ["diff", "--no-ext-diff", "--unified=3", "--relative"];

    const result = await runGit(
      [...sourceArgs, "--", filePath],
      workspacePath,
    );

    return result.stdout;
  } catch {
    return "";
  }
}

function countPatchStats(patch: string) {
  const parsed = parsePatch(patch);
  let additions = 0;
  let deletions = 0;

  for (const filePatch of parsed) {
    for (const hunk of filePatch.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) {
          additions += 1;
        } else if (line.startsWith("-")) {
          deletions += 1;
        }
      }
    }
  }

  return { additions, deletions };
}

async function buildDiffFile(
  workspacePath: string,
  baseRef: string,
  source: GitDiffSource,
  entry: GitStatusEntry,
): Promise<GitDiffFile> {
  const status = resolveSourceStatus(entry, source);
  const patch =
    status === "untracked"
      ? createUntrackedPatch(workspacePath, entry.path)
      : await createTrackedPatch(workspacePath, entry.path, baseRef, source);
  const kind = resolveFileKind(entry.path, patch);
  const { additions, deletions } = countPatchStats(patch);

  return {
    path: entry.path,
    status,
    patch,
    kind,
    additions,
    deletions,
    previewPath: resolvePreviewPath(workspacePath, entry.path, kind),
  };
}

function createSourceSnapshot(files: GitDiffFile[]): GitDiffSourceSnapshot {
  return {
    files,
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

async function buildSourceSnapshot(
  workspacePath: string,
  baseRef: string,
  source: GitDiffSource,
  entries: GitStatusEntry[],
): Promise<GitDiffSourceSnapshot> {
  const sourceEntries = entries
    .filter((entry) => isEntryInSource(entry, source))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));

  if (sourceEntries.length === 0) {
    return createEmptySourceSnapshot();
  }

  const files = await Promise.all(
    sourceEntries.map((entry) => buildDiffFile(workspacePath, baseRef, source, entry)),
  );

  return createSourceSnapshot(files);
}

export async function getGitDiffSnapshot(workspacePath: string): Promise<GitDiffOverview> {
  const generatedAt = Date.now();
  const repository = await isGitRepository(workspacePath);

  if (!repository) {
    return createEmptyOverview(generatedAt, false);
  }

  const baseRef = await resolveDiffBase(workspacePath);
  const statusSnapshot = await listStatusSnapshot(workspacePath);
  const sourceSnapshots = await Promise.all(
    DIFF_SOURCES.map(async (source) => [
      source,
      await buildSourceSnapshot(workspacePath, baseRef, source, statusSnapshot.entries),
    ] as const),
  );

  return {
    isGitRepo: true,
    generatedAt,
    branch: statusSnapshot.branch,
    sources: Object.fromEntries(sourceSnapshots) as GitDiffOverview["sources"],
  };
}

export async function getGitBranchSummary(workspacePath: string): Promise<GitBranchSummary> {
  const repository = await isGitRepository(workspacePath);

  if (!repository) {
    return createEmptyBranchSummary();
  }

  try {
    const result = await runGit(["symbolic-ref", "--short", "-q", "HEAD"], workspacePath);
    const branchName = result.stdout.trim();
    if (branchName) {
      return {
        branchName,
        isDetached: false,
        hasChanges: false,
      };
    }
  } catch {
    // Detached HEAD 走下面的 fallback。
  }

  return {
    branchName: await resolveDetachedHeadLabel(workspacePath),
    isDetached: true,
    hasChanges: false,
  };
}

export async function listGitBranches(workspacePath: string): Promise<GitBranchEntry[]> {
  await ensureGitRepository(workspacePath);

  try {
    const result = await runGit(
      [
        "for-each-ref",
        "--format=%(refname:short)%00%(if)%(HEAD)%(then)1%(else)0%(end)",
        "refs/heads",
      ],
      workspacePath,
    );

    return result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, isCurrentFlag] = line.split("\0");
        return {
          name: name?.trim() ?? "",
          isCurrent: isCurrentFlag === "1",
        } satisfies GitBranchEntry;
      })
      .filter((branch) => branch.name.length > 0)
      .sort((left, right) => {
        if (left.isCurrent !== right.isCurrent) {
          return left.isCurrent ? -1 : 1;
        }

        return left.name.localeCompare(right.name, "en");
      });
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "读取本地分支失败。"));
  }
}

export async function switchGitBranch(
  workspacePath: string,
  branchName: string,
): Promise<void> {
  await ensureGitRepository(workspacePath);
  const normalizedBranchName = await assertBranchName(workspacePath, branchName);

  try {
    await runGit(["switch", "--quiet", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "切换分支失败。"));
  }
}

export async function createAndSwitchGitBranch(
  workspacePath: string,
  branchName: string,
): Promise<void> {
  await ensureGitRepository(workspacePath);
  const normalizedBranchName = await assertBranchName(workspacePath, branchName);

  try {
    await runGit(["switch", "--quiet", "-c", normalizedBranchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "创建并切换分支失败。"));
  }
}

export async function stageGitFiles(workspacePath: string, paths: string[]): Promise<void> {
  const normalizedPaths = normalizeGitPaths(paths);
  if (normalizedPaths.length === 0) return;

  try {
    await runGit(["add", "--", ...normalizedPaths], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "暂存文件失败。"));
  }
}

export async function unstageGitFiles(workspacePath: string, paths: string[]): Promise<void> {
  const normalizedPaths = normalizeGitPaths(paths);
  if (normalizedPaths.length === 0) return;

  try {
    await runGit(["reset", "HEAD", "--", ...normalizedPaths], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "取消暂存失败。"));
  }
}

async function stageFiles(
  workspacePath: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;

  try {
    await runGit(["add", "--", ...paths], workspacePath);
  } catch (addError) {
    const errorMessage = getGitErrorMessage(addError, "");

    // 如果报错包含 ignored 路径，用 git check-ignore 快速筛出后重试。
    // check-ignore 只检查模式匹配，不扫描文件内容，开销极小。
    const ignoredPaths = /ignored/i.test(errorMessage)
      ? await getIgnoredPaths(workspacePath, paths)
      : new Set<string>();

    const safePaths = paths.filter((p) => !ignoredPaths.has(p));

    if (safePaths.length > 0) {
      try {
        await runGit(["add", "--", ...safePaths], workspacePath);
      } catch {
        // 某些路径可能已从索引中删除（D 状态）或不存在，逐个重试。
        for (const path of safePaths) {
          try {
            await runGit(["add", "--", path], workspacePath);
          } catch {
            // 无法暂存的路径跳过（已 staged 或不存在）。
          }
        }
      }
    }

    // 对 ignored 路径尝试 git rm --cached，暂存可能的删除操作。
    // 仅修改索引不触碰磁盘；对已从索引删除或不存在的路径静默跳过。
    for (const path of ignoredPaths) {
      try {
        await runGit(["rm", "--cached", "--", path], workspacePath);
      } catch {
        // 文件不在索引中或未被删除，跳过。
      }
    }
  }
}

async function getIgnoredPaths(
  workspacePath: string,
  paths: string[],
): Promise<Set<string>> {
  try {
    const result = await runGit(
      ["check-ignore", "--", ...paths],
      workspacePath,
    );

    return new Set(
      result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
  } catch {
    return new Set();
  }
}

export async function commitGitChanges(
  workspacePath: string,
  message: string,
  paths: string[],
): Promise<void> {
  await ensureGitRepository(workspacePath);

  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new Error("提交信息不能为空。");
  }

  const normalizedPaths = normalizeGitPaths(paths);

  try {
    if (normalizedPaths.length > 0) {
      await stageFiles(workspacePath, normalizedPaths);
    }

    const hasCommitContent = await hasStagedChanges(workspacePath, normalizedPaths);
    if (!hasCommitContent) {
      throw createGitUserError(
        "GIT_COMMIT_EMPTY",
        normalizedPaths.length > 0
          ? "选中的文件没有可提交内容。请刷新 Diff 面板后重新选择有改动的文件。"
          : "没有已暂存的改动。请先在 Diff 面板选择文件或暂存改动。",
      );
    }

    const commitArgs = ["commit", "-m", normalizedMessage];
    if (normalizedPaths.length > 0) {
      commitArgs.push("--", ...normalizedPaths);
    }

    await runGit(commitArgs, workspacePath);
  } catch (error) {
    if (isIpcPayloadLike(error)) {
      throw error;
    }

    if (error && typeof error === "object" && "stderr" in error) {
      (error as { stderr: string }).stderr = stripGitWarnings(
        (error as { stderr: string }).stderr ?? "",
      );
    }

    const gitMessage = getGitErrorMessage(
      error,
      normalizedPaths.length > 0 ? "提交选中文件失败。" : "提交改动失败。",
    );
    if (isEmptyCommitOutput(gitMessage)) {
      throw createGitUserError(
        "GIT_COMMIT_EMPTY",
        normalizedPaths.length > 0
          ? "选中的文件没有可提交内容。请刷新 Diff 面板后重新选择有改动的文件。"
          : "没有已暂存的改动。请先在 Diff 面板选择文件或暂存改动。",
      );
    }

    throw new Error(
      gitMessage,
    );
  }
}

export async function pushGitChanges(workspacePath: string): Promise<void> {
  await ensureGitRepository(workspacePath);
  const branchName = await resolveCurrentBranchName(workspacePath);

  if (!branchName) {
    throw new Error("分离 HEAD 状态需要先切换到本地分支再推送。");
  }

  try {
    if (await hasBranchUpstream(workspacePath)) {
      await runGit(["push"], workspacePath);
      return;
    }

    const remote = await resolvePushRemote(workspacePath, branchName);
    if (!remote) {
      throw new Error("请先添加远程仓库，再推送当前分支。");
    }

    await runGit(["push", "--set-upstream", remote, branchName], workspacePath);
  } catch (error) {
    throw new Error(getGitErrorMessage(error, "推送失败。"));
  }
}

export async function pullGitChanges(workspacePath: string): Promise<void> {
  await runGit(["pull", "--ff-only"], workspacePath);
}

export async function getLatestCommitSubject(
  workspacePath: string,
): Promise<string | null> {
  const repository = await isGitRepository(workspacePath);

  if (!repository) {
    return null;
  }

  try {
    const result = await runGit(["log", "-1", "--pretty=%s"], workspacePath);
    const subject = result.stdout.trim();
    return subject || null;
  } catch {
    return null;
  }
}

export async function getDiffForFiles(
  workspacePath: string,
  filePaths: string[],
): Promise<string> {
  if (filePaths.length === 0) return "";

  const baseRef = await resolveDiffBase(workspacePath);
  const parts: string[] = [];

  for (const filePath of filePaths) {
    // Try unstaged diff first, then staged, then combined
    let patch = "";
    try {
      const result = await runGit(
        ["diff", "--no-ext-diff", "--unified=3", "--relative", "--", filePath],
        workspacePath,
      );
      patch = result.stdout;
    } catch {
      // no unstaged diff
    }

    if (!patch) {
      try {
        const result = await runGit(
          ["diff", "--cached", "--no-ext-diff", "--unified=3", "--relative", "--", filePath],
          workspacePath,
        );
        patch = result.stdout;
      } catch {
        // no staged diff either
      }
    }

    if (!patch) {
      // Might be untracked
      patch = createUntrackedPatch(workspacePath, filePath);
    }

    if (patch) {
      parts.push(patch);
    }
  }

  return parts.join("\n");
}
