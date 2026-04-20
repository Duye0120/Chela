import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SoulFilesStatus } from "../shared/contracts.js";

const SOUL_DIR = ".pi";
const SOUL_FILE = "SOUL.md";
const USER_FILE = "USER.md";
const AGENTS_FILE = "AGENTS.md";
const CLAUDE_FILE = "CLAUDE.md";

function resolveSoulFilePaths(workspacePath: string, filename: string): string[] {
  return [
    join(workspacePath, filename),
    join(workspacePath, SOUL_DIR, filename),
  ];
}

function readFirstExistingFile(paths: string[]): string {
  for (const filePath of paths) {
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      return readFileSync(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  return "";
}

/**
 * Read a Soul file from the workspace. Returns empty string if not found.
 */
function readSoulFile(workspacePath: string, filename: string): string {
  return readFirstExistingFile(resolveSoulFilePaths(workspacePath, filename));
}

/**
 * Get the status of all Soul files in the workspace.
 */
export function getSoulFilesStatus(workspacePath: string): SoulFilesStatus {
  function fileInfo(filename: string) {
    for (const filePath of resolveSoulFilePaths(workspacePath, filename)) {
      if (!existsSync(filePath)) {
        continue;
      }

      try {
        const content = readFileSync(filePath, "utf-8");
        return { exists: true, sizeBytes: Buffer.byteLength(content, "utf-8") };
      } catch {
        return { exists: false, sizeBytes: 0 };
      }
    }

    return { exists: false, sizeBytes: 0 };
  }

  return {
    soul: fileInfo(SOUL_FILE),
    user: fileInfo(USER_FILE),
    agents: fileInfo(AGENTS_FILE),
    claude: fileInfo(CLAUDE_FILE),
  };
}

/**
 * Build the system prompt section from Soul files.
 * Returns empty string if no Soul files exist.
 */
export function buildSoulPromptSection(workspacePath: string): string {
  const soul = readSoulFile(workspacePath, SOUL_FILE);
  const user = readSoulFile(workspacePath, USER_FILE);
  const agents = readSoulFile(workspacePath, AGENTS_FILE);
  const claude = readSoulFile(workspacePath, CLAUDE_FILE);

  if (!soul && !user && !agents && !claude) return "";

  const sections: string[] = [];

  if (soul) {
    sections.push("## 项目说明（SOUL.md）\n\n" + soul);
  }
  if (user) {
    sections.push("## 用户偏好（USER.md）\n\n" + user);
  }
  if (agents) {
    sections.push("## Agent 配置（AGENTS.md）\n\n" + agents);
  }
  if (claude) {
    sections.push("## Claude 配置（CLAUDE.md）\n\n" + claude);
  }

  return sections.join("\n\n---\n\n");
}
