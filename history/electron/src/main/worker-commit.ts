import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CommitPlanGroup,
  GenerateCommitPlanRequest,
  GenerateCommitPlanResult,
  GenerateCommitMessageRequest,
  GenerateCommitMessageResult,
} from "../shared/contracts.ts";
import { getRuntimeSkillUsage } from "../shared/skill-usage.ts";
import { getSettings } from "./settings.ts";
import { appLogger } from "./logger.ts";
import { escapeRegExp } from "../shared/text-utils.ts";
import {
  generateTextWithFallback,
} from "./worker-runtime.ts";

function getCommitRuntimeSkillUsage() {
  const usage = getRuntimeSkillUsage("commit", "right-panel.commit-plan");
  if (!usage) {
    throw new Error("commit skill usage registry 缺少 right-panel.commit-plan 配置。");
  }

  return usage;
}

const COMMIT_TYPE_META = {
  feat: { emoji: "✨", label: "feat" },
  fix: { emoji: "🐛", label: "fix" },
  docs: { emoji: "📝", label: "docs" },
  refactor: { emoji: "♻️", label: "refactor" },
  test: { emoji: "✅", label: "test" },
  chore: { emoji: "🔧", label: "chore" },
  ci: { emoji: "👷", label: "ci" },
  build: { emoji: "📦", label: "build" },
} as const;

type CommitTypeKey = keyof typeof COMMIT_TYPE_META;

const COMMIT_SKILL_FALLBACK = [
  "## 提交消息格式",
  "- 标题使用 Conventional Commit 风格。",
  "- 第一行只写标题，后续内容写描述。",
  "",
  "## 类型与 emoji",
  "- feat ✨",
  "- fix 🐛",
  "- docs 📝",
  "- style 🎨",
  "- refactor ♻️",
  "- perf ⚡️",
  "- test ✅",
  "- chore 🔧",
  "- ci 👷",
  "- build 📦",
  "- revert ⏪",
  "",
  "## 关键规则",
  "- 动词使用现在时、祈使句。",
  "- 标题保持单行，不加句号。",
  "- 避免把无关改动混在同一个标题里。",
  "- 正文简短，只写对 reviewer 有帮助的信息。",
].join("\n");

function extractMarkdownSection(markdown: string, heading: string): string | null {
  const pattern = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    "m",
  );
  const match = markdown.match(pattern);

  if (!match?.[1]?.trim()) {
    return null;
  }

  return `## ${heading}\n${match[1].trim()}`;
}

function readCommitSkillGuidance(workspacePath: string): string {
  const skillPath = path.resolve(workspacePath, ".agents", "skills", "commit", "SKILL.md");

  if (!fs.existsSync(skillPath)) {
    return COMMIT_SKILL_FALLBACK;
  }

  try {
    const skillMarkdown = fs.readFileSync(skillPath, "utf8");
    const sections = [
      extractMarkdownSection(skillMarkdown, "目标"),
      extractMarkdownSection(skillMarkdown, "提交消息格式"),
      extractMarkdownSection(skillMarkdown, "类型与 emoji"),
      extractMarkdownSection(skillMarkdown, "关键规则"),
      extractMarkdownSection(skillMarkdown, "示例"),
    ].filter((section): section is string => !!section);

    return sections.length > 0 ? sections.join("\n\n") : COMMIT_SKILL_FALLBACK;
  } catch {
    return COMMIT_SKILL_FALLBACK;
  }
}

function buildCommitMessageSystemPrompt(workspacePath: string): string {
  return [
    "你是 Chela 的提交信息生成器。",
    "当前任务由工具模型优先执行，职责只有分析变更并生成提交标题与描述。",
    "必须遵循下面的 commit skill 规则。",
    "",
    readCommitSkillGuidance(workspacePath),
    "",
    "输出约束：",
    "- 只输出纯文本，不要代码块，不要解释。",
    "- 第一行输出标题。",
    "- 第二行起输出描述，可为空。",
    "- 不要执行 git add、git commit、lint、build 或其它命令。",
    "- 标题必须可直接放进 commit title 输入框。",
    "- 描述必须可直接放进 description 输入框。",
  ].join("\n");
}

function buildCommitMessagePrompt(
  request: GenerateCommitMessageRequest,
): string {
  const fileList = request.selectedFiles
    .map((file) => `[${file.status}] ${file.path} (+${file.additions}/-${file.deletions})`)
    .join("\n");

  return [
    "请基于下面的改动生成提交标题和描述。",
    "",
    "[当前分支]",
    request.branchName ?? "未知分支",
    "",
    "[最近一次提交标题]",
    request.latestCommitSubject ?? "无可用参考",
    "",
    "[文件列表]",
    fileList || "无文件",
    "",
    "[Diff]",
    request.diffContent?.trim() || "无 diff 内容",
  ].join("\n");
}

function buildCommitPlanSystemPrompt(workspacePath: string): string {
  return [
    "你是 Chela 的提交计划生成器。",
    "当前任务由工具模型优先执行，职责只有分析选中文件并拆成合理的多次提交计划。",
    "必须遵循下面的 commit skill 规则。",
    "",
    readCommitSkillGuidance(workspacePath),
    "",
    "输出约束：",
    "- 只输出 JSON，不要代码块，不要解释。",
    "- JSON 结构固定为 {\"groups\":[{\"title\":\"\",\"description\":\"\",\"filePaths\":[\"path\"],\"reason\":\"\"}]}。",
    "- 每个 group 只放强相关改动。",
    "- 每个 filePath 都必须来自用户给出的文件列表。",
    "- 所有文件都要被覆盖，且每个文件只能出现一次。",
    "- title 必须是可直接用于 git commit 的 Conventional Commit 标题。",
    "- description 写简短正文，可为空字符串。",
    "- reason 用一句话解释为什么这样分组。",
    "- groups 数量控制在 1 到 6 之间。",
    "- 不要执行 git add、git commit、lint、build 或其它命令。",
  ].join("\n");
}

function buildCommitPlanPrompt(
  request: GenerateCommitPlanRequest,
): string {
  const fileList = request.selectedFiles
    .map((file) => `[${file.status}] ${file.path} (+${file.additions}/-${file.deletions})`)
    .join("\n");

  return [
    "请基于下面的改动生成分组提交计划。",
    "",
    "[当前分支]",
    request.branchName ?? "未知分支",
    "",
    "[最近一次提交标题]",
    request.latestCommitSubject ?? "无可用参考",
    "",
    "[文件列表]",
    fileList || "无文件",
    "",
    "[Diff]",
    request.diffContent?.trim() || "无 diff 内容",
  ].join("\n");
}

function buildCommitMessageRepairPrompt(analysis: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const compactAnalysis = analysis.trim().slice(0, 6000);

  return {
    systemPrompt: [
      "你是 Chela 的提交信息整理器。",
      "你已经完成改动分析，现在只负责输出最终提交标题和描述。",
      "只输出纯文本。",
      "第一行输出标题。",
      "第二行起输出描述，可为空。",
      "不要解释，不要复述分析过程。",
    ].join("\n"),
    userPrompt: [
      "请把下面这段分析整理成最终 commit 标题和描述。",
      "",
      "[分析结果]",
      compactAnalysis || "无可用分析",
    ].join("\n"),
  };
}

function buildCommitPlanRepairPrompt(analysis: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const compactAnalysis = analysis.trim().slice(0, 6000);

  return {
    systemPrompt: [
      "你是 Chela 的提交计划整理器。",
      "你已经完成改动分析，现在只负责输出最终 JSON。",
      "只输出 JSON。",
      "JSON 结构固定为 {\"groups\":[{\"title\":\"\",\"description\":\"\",\"filePaths\":[\"path\"],\"reason\":\"\"}]}。",
      "不要解释，不要复述分析过程。",
    ].join("\n"),
    userPrompt: [
      "请把下面这段分析整理成最终提交计划 JSON。",
      "",
      "[分析结果]",
      compactAnalysis || "无可用分析",
    ].join("\n"),
  };
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function stripLeadingLabel(value: string): string {
  return value.replace(/^(title|subject|description|body|标题|描述|正文)\s*[:：-]\s*/iu, "").trim();
}

function stripFieldPrefix(value: string): string {
  return value.replace(/^(?:[-*+]\s+|\d+\.\s+)?(?:#{1,6}\s+)?/u, "").trim();
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^["'`]+|["'`]+$/gu, "").trim();
}

function cleanTitleCandidate(value: string): string {
  return stripWrappingQuotes(stripLeadingLabel(stripFieldPrefix(value)));
}

function cleanDescriptionLine(value: string): string {
  return stripLeadingLabel(value.trim());
}

function matchTitleField(value: string): RegExpMatchArray | null {
  return stripFieldPrefix(value).match(/^(?:title|subject|标题|提交标题)\s*[:：-]?\s*(.*)$/iu);
}

function matchDescriptionField(value: string): RegExpMatchArray | null {
  return stripFieldPrefix(value).match(
    /^(?:description|body|描述|正文|提交描述)\s*[:：-]?\s*(.*)$/iu,
  );
}

function previewCommitResponse(rawText: string): string {
  const preview = stripCodeFence(rawText).replace(/\s+/g, " ").trim();
  return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
}

function extractJsonCandidate(rawText: string): string {
  const normalized = stripCodeFence(rawText);

  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return normalized;
  }

  const objectStart = normalized.indexOf("{");
  const arrayStart = normalized.indexOf("[");
  const candidates = [objectStart, arrayStart].filter((index) => index >= 0);

  if (candidates.length === 0) {
    return normalized;
  }

  const start = Math.min(...candidates);
  const objectEnd = normalized.lastIndexOf("}");
  const arrayEnd = normalized.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);

  if (end > start) {
    return normalized.slice(start, end + 1);
  }

  return normalized;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function detectCommitTopics(
  selectedFiles: GenerateCommitMessageRequest["selectedFiles"],
): Array<{ key: string; scope: string; label: string }> {
  const normalizedPaths = selectedFiles.map((file) => toPosixPath(file.path));
  const topics = [
    {
      key: "commit",
      scope: "commit",
      label: "commit generation",
      matches: normalizedPaths.some(
        (filePath) =>
          filePath.includes("diff-panel") ||
          filePath.includes("worker-service") ||
          filePath.includes("ipc/worker"),
      ),
    },
    {
      key: "models",
      scope: "models",
      label: "model directory refresh",
      matches: normalizedPaths.some(
        (filePath) =>
          filePath.includes("provider-directory") ||
          filePath.includes("settings-view") ||
          filePath.includes("keys-section") ||
          filePath.includes("thread"),
      ),
    },
    {
      key: "contracts",
      scope: "shared",
      label: "shared contract updates",
      matches: normalizedPaths.some((filePath) => filePath.includes("contracts")),
    },
    {
      key: "docs",
      scope: "docs",
      label: "documentation updates",
      matches: normalizedPaths.some((filePath) => filePath.startsWith("docs/")),
    },
  ];

  return topics
    .filter((topic) => topic.matches)
    .map(({ key, scope, label }) => ({ key, scope, label }));
}

function inferCommitType(
  request: GenerateCommitMessageRequest,
  topics: Array<{ key: string; scope: string; label: string }>,
): CommitTypeKey {
  const normalizedPaths = request.selectedFiles.map((file) => toPosixPath(file.path));

  if (normalizedPaths.every((filePath) => filePath.startsWith("docs/"))) {
    return "docs";
  }

  if (
    normalizedPaths.every(
      (filePath) =>
        filePath.includes(".github/") ||
        filePath.includes("/workflows/") ||
        filePath.includes("ci"),
    )
  ) {
    return "ci";
  }

  if (
    normalizedPaths.some(
      (filePath) =>
        filePath.includes("package.json") ||
        filePath.includes("pnpm-lock") ||
        filePath.includes("vite.config") ||
        filePath.includes("tsconfig"),
    )
  ) {
    return "build";
  }

  if (normalizedPaths.every((filePath) => /(^|\/)(test|tests|__tests__)\//.test(filePath))) {
    return "test";
  }

  if (topics.some((topic) => topic.key === "commit" || topic.key === "models")) {
    return "refactor";
  }

  return "chore";
}

function buildHeuristicCommitTitle(
  request: GenerateCommitMessageRequest,
  topics: Array<{ key: string; scope: string; label: string }>,
): string {
  const commitType = inferCommitType(request, topics);
  const { emoji, label } = COMMIT_TYPE_META[commitType];
  const scope =
    topics.length === 1
      ? topics[0]?.scope ?? "app"
      : topics.length > 1
        ? "app"
        : "workspace";
  const labels = topics.map((topic) => topic.label);

  let subject = "";
  if (labels.length >= 2) {
    subject = `improve ${labels[0]} and ${labels[1]}`;
  } else if (labels.length === 1) {
    subject = `improve ${labels[0]}`;
  } else if (request.selectedFiles.length === 1) {
    subject = `update ${path.basename(request.selectedFiles[0]?.path ?? "changes")}`;
  } else {
    subject = `update workspace changes`;
  }

  return `${emoji} ${label}(${scope}): ${subject}`;
}

function buildHeuristicCommitDescription(
  request: GenerateCommitMessageRequest,
  topics: Array<{ key: string; scope: string; label: string }>,
): string {
  const descriptionLines = [
    topics.length > 0
      ? `- focus: ${topics.map((topic) => topic.label).join(", ")}`
      : null,
    request.branchName ? `- branch: ${request.branchName}` : null,
    `- files: ${request.selectedFiles.length}`,
  ].filter((line): line is string => !!line);

  return descriptionLines.join("\n");
}

function buildHeuristicCommitMessageResult(
  request: GenerateCommitMessageRequest,
  rawText: string,
  meta: Omit<
    GenerateCommitMessageResult,
    "title" | "description" | "skillName" | "skillUsage"
  >,
): GenerateCommitMessageResult {
  const topics = detectCommitTopics(request.selectedFiles);
  const title = buildHeuristicCommitTitle(request, topics);
  const description = buildHeuristicCommitDescription(request, topics);

  appLogger.warn({
    scope: "worker.commit",
    message: "提交信息生成进入本地兜底",
    data: {
      usedModelRole: meta.usedModelRole,
      fallbackUsed: meta.fallbackUsed,
      selectedFiles: request.selectedFiles.map((file) => file.path),
      rawResponsePreview: previewCommitResponse(rawText),
      title,
      description,
    },
  });

  return {
    title,
    description,
    skillName: "commit",
    skillUsage: getCommitRuntimeSkillUsage(),
    ...meta,
  };
}

function pickFirstString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function pickFirstStringArray(values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      const strings = value
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }

          if (
            item &&
            typeof item === "object" &&
            "path" in item &&
            typeof (item as Record<string, unknown>).path === "string"
          ) {
            return ((item as Record<string, unknown>).path as string).trim();
          }

          return "";
        })
        .filter(Boolean);

      if (strings.length > 0) {
        return strings;
      }
    }
  }

  return [];
}

function tryParseCommitMessageJson(
  rawText: string,
): Pick<GenerateCommitMessageResult, "title" | "description"> | null {
  const normalized = stripCodeFence(rawText);

  if (!normalized.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const title = cleanTitleCandidate(
      pickFirstString([record.title, record.subject, record["标题"], record["提交标题"]]),
    );

    if (!title) {
      return null;
    }

    return {
      title,
      description: pickFirstString([
        record.description,
        record.body,
        record["描述"],
        record["正文"],
        record["提交描述"],
      ]),
    };
  } catch {
    return null;
  }
}

function buildSelectedFilePathMap(
  selectedFiles: GenerateCommitPlanRequest["selectedFiles"],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const file of selectedFiles) {
    const posixPath = toPosixPath(file.path);
    map.set(posixPath, file.path);
    map.set(posixPath.replace(/^\.\//u, ""), file.path);
  }

  return map;
}

function normalizeRequestedFilePath(pathMap: Map<string, string>, value: string): string | null {
  const normalized = toPosixPath(value.trim()).replace(/^\.\//u, "");
  return pathMap.get(normalized) ?? pathMap.get(`./${normalized}`) ?? null;
}

function buildPlanGroupId(): string {
  return randomUUID();
}

function groupFilesForHeuristicPlan(
  selectedFiles: GenerateCommitPlanRequest["selectedFiles"],
): Array<{ key: string; reason: string; files: GenerateCommitPlanRequest["selectedFiles"] }> {
  const groups = new Map<
    string,
    { key: string; reason: string; files: GenerateCommitPlanRequest["selectedFiles"] }
  >();

  for (const file of selectedFiles) {
    const normalizedPath = toPosixPath(file.path);
    const segments = normalizedPath.split("/").filter(Boolean);
    const [first = "workspace", second = ""] = segments;

    let key = first;
    let reason = "按目录边界拆分这组改动。";

    if (first === "docs") {
      key = "docs";
      reason = "文档改动单独提交，review 更清晰。";
    } else if (first === "src" && second) {
      key = `src/${second}`;
      reason = `把 ${second} 相关改动放进同一组。`;
    } else if (first === ".agents") {
      key = ".agents";
      reason = "skill 和 agent 规则改动单独提交。";
    } else if (segments.length === 1) {
      key = "root";
      reason = "根目录文件单独整理成一组。";
    }

    const existing = groups.get(key);
    if (existing) {
      existing.files.push(file);
      continue;
    }

    groups.set(key, {
      key,
      reason,
      files: [file],
    });
  }

  return Array.from(groups.values());
}

function buildHeuristicCommitPlanGroups(
  request: GenerateCommitPlanRequest,
): CommitPlanGroup[] {
  return groupFilesForHeuristicPlan(request.selectedFiles).map((group) => {
    const scopedRequest: GenerateCommitPlanRequest = {
      ...request,
      selectedFiles: group.files,
    };
    const topics = detectCommitTopics(group.files);

    return {
      id: buildPlanGroupId(),
      title: buildHeuristicCommitTitle(scopedRequest, topics),
      description: buildHeuristicCommitDescription(scopedRequest, topics),
      filePaths: group.files.map((file) => file.path),
      reason: group.reason,
    };
  });
}

function normalizeCommitPlanGroups(
  groups: CommitPlanGroup[],
  request: GenerateCommitPlanRequest,
): CommitPlanGroup[] {
  const pathMap = buildSelectedFilePathMap(request.selectedFiles);
  const assigned = new Set<string>();
  const normalizedGroups: CommitPlanGroup[] = [];

  for (const group of groups) {
    const title = cleanTitleCandidate(group.title);
    if (!title) {
      continue;
    }

    const filePaths = group.filePaths
      .map((filePath) => normalizeRequestedFilePath(pathMap, filePath))
      .filter((filePath): filePath is string => !!filePath)
      .filter((filePath) => {
        if (assigned.has(filePath)) {
          return false;
        }

        assigned.add(filePath);
        return true;
      });

    if (filePaths.length === 0) {
      continue;
    }

    normalizedGroups.push({
      id: buildPlanGroupId(),
      title,
      description: group.description.trim(),
      filePaths,
      reason: group.reason?.trim() || undefined,
    });
  }

  if (assigned.size === request.selectedFiles.length) {
    return normalizedGroups;
  }

  const uncoveredFiles = request.selectedFiles.filter((file) => !assigned.has(file.path));
  if (uncoveredFiles.length === 0) {
    return normalizedGroups;
  }

  const fallbackGroups = buildHeuristicCommitPlanGroups({
    ...request,
    selectedFiles: uncoveredFiles,
  });

  return [...normalizedGroups, ...fallbackGroups];
}

function tryParseCommitPlanJson(
  rawText: string,
  request: GenerateCommitPlanRequest,
): CommitPlanGroup[] | null {
  const candidate = extractJsonCandidate(rawText);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const rawGroups = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? ((parsed as Record<string, unknown>).groups ??
          (parsed as Record<string, unknown>).commits ??
          (parsed as Record<string, unknown>).items)
        : null;

    if (!Array.isArray(rawGroups)) {
      return null;
    }

    const groups: CommitPlanGroup[] = [];
    for (const item of rawGroups) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      const record = item as Record<string, unknown>;
      const title = cleanTitleCandidate(
        pickFirstString([record.title, record.subject, record["标题"], record["提交标题"]]),
      );

      if (!title) {
        continue;
      }

      const reason = pickFirstString([record.reason, record.summary, record["原因"]]);
      const group: CommitPlanGroup = {
        id: buildPlanGroupId(),
        title,
        description: pickFirstString([
          record.description,
          record.body,
          record["描述"],
          record["正文"],
          record["提交描述"],
        ]),
        filePaths: pickFirstStringArray([record.filePaths, record.paths, record.files]),
      };
      if (reason) {
        group.reason = reason;
      }
      groups.push(group);
    }

    if (groups.length === 0) {
      return null;
    }

    return normalizeCommitPlanGroups(groups, request);
  } catch {
    return null;
  }
}

function buildHeuristicCommitPlanResult(
  request: GenerateCommitPlanRequest,
  rawText: string,
  meta: Omit<GenerateCommitPlanResult, "groups" | "skillName" | "skillUsage">,
): GenerateCommitPlanResult {
  const groups = buildHeuristicCommitPlanGroups(request);

  appLogger.warn({
    scope: "worker.commit-plan",
    message: "提交计划生成进入本地兜底",
    data: {
      usedModelRole: meta.usedModelRole,
      fallbackUsed: meta.fallbackUsed,
      selectedFiles: request.selectedFiles.map((file) => file.path),
      rawResponsePreview: previewCommitResponse(rawText),
      groupCount: groups.length,
    },
  });

  return {
    groups,
    skillName: "commit",
    skillUsage: getCommitRuntimeSkillUsage(),
    ...meta,
  };
}

function parseCommitMessageResult(
  rawText: string,
  meta: Omit<
    GenerateCommitMessageResult,
    "title" | "description" | "skillName" | "skillUsage"
  >,
): GenerateCommitMessageResult {
  const jsonResult = tryParseCommitMessageJson(rawText);

  if (jsonResult) {
    return {
      ...jsonResult,
      skillName: "commit",
      skillUsage: getCommitRuntimeSkillUsage(),
      ...meta,
    };
  }

  const normalized = stripCodeFence(rawText);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let title = "";
  const descriptionLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!title) {
      const titleMatch = matchTitleField(line);

      if (titleMatch) {
        const inlineTitle = cleanTitleCandidate(titleMatch[1] ?? "");

        if (inlineTitle) {
          title = inlineTitle;
          continue;
        }

        for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
          const nextLine = lines[nextIndex] ?? "";
          if (!nextLine) {
            continue;
          }
          if (matchDescriptionField(nextLine)) {
            break;
          }

          title = cleanTitleCandidate(nextLine);
          index = nextIndex;
          break;
        }

        continue;
      }

      if (matchDescriptionField(line)) {
        continue;
      }

      title = cleanTitleCandidate(line);
      continue;
    }

    const descriptionMatch = matchDescriptionField(line);
    if (descriptionMatch) {
      const inlineDescription = cleanDescriptionLine(descriptionMatch[1] ?? "");
      if (inlineDescription) {
        descriptionLines.push(inlineDescription);
      }
      continue;
    }

    descriptionLines.push(cleanDescriptionLine(line));
  }

  if (!title) {
    const responsePreview = previewCommitResponse(rawText);
    throw new Error(
      responsePreview
        ? `模型没有返回可用的提交标题。原始返回：${responsePreview}`
        : "模型没有返回可用的提交标题。",
    );
  }

  return {
    title,
    description: descriptionLines.join("\n").trim(),
    skillName: "commit",
    skillUsage: getCommitRuntimeSkillUsage(),
    ...meta,
  };
}

export async function generateCommitMessage(
  request: GenerateCommitMessageRequest,
): Promise<GenerateCommitMessageResult> {
  const workspacePath = getSettings().workspace;
  const generation = await generateTextWithFallback({
    systemPrompt: buildCommitMessageSystemPrompt(workspacePath),
    userPrompt: buildCommitMessagePrompt(request),
    repairPromptBuilder: buildCommitMessageRepairPrompt,
  });

  const meta = {
    usedModelRole: generation.usedModelRole,
    fallbackUsed: generation.fallbackUsed,
  } as const;

  try {
    return parseCommitMessageResult(generation.text, meta);
  } catch (error) {
    appLogger.warn({
      scope: "worker.commit",
      message: "提交信息解析失败，切换本地兜底",
      data: {
        usedModelRole: generation.usedModelRole,
        fallbackUsed: generation.fallbackUsed,
        rawResponsePreview: previewCommitResponse(generation.text),
      },
      error,
    });

    return buildHeuristicCommitMessageResult(request, generation.text, meta);
  }
}

export async function generateCommitPlan(
  request: GenerateCommitPlanRequest,
): Promise<GenerateCommitPlanResult> {
  const workspacePath = getSettings().workspace;
  const generation = await generateTextWithFallback({
    systemPrompt: buildCommitPlanSystemPrompt(workspacePath),
    userPrompt: buildCommitPlanPrompt(request),
    repairPromptBuilder: buildCommitPlanRepairPrompt,
  });

  const meta = {
    usedModelRole: generation.usedModelRole,
    fallbackUsed: generation.fallbackUsed,
  } as const;

  const parsed = tryParseCommitPlanJson(generation.text, request);
  if (parsed && parsed.length > 0) {
    return {
      groups: parsed,
      skillName: "commit",
      skillUsage: getCommitRuntimeSkillUsage(),
      ...meta,
    };
  }

  appLogger.warn({
    scope: "worker.commit-plan",
    message: "提交计划解析失败，切换本地兜底",
    data: {
      usedModelRole: generation.usedModelRole,
      fallbackUsed: generation.fallbackUsed,
      rawResponsePreview: previewCommitResponse(generation.text),
    },
  });

  return buildHeuristicCommitPlanResult(request, generation.text, meta);
}
