import fs from "node:fs";
import path from "node:path";
import {
  checkFetchUrl,
  checkShellCommand,
  isPathAllowed,
  isPathForbiddenRead,
  isWritePathForbidden,
} from "../security.js";
import type { HarnessPolicyEvaluation, HarnessRiskLevel } from "./types.js";

type ToolPolicyContext = {
  workspacePath: string;
  toolName: string;
  args: Record<string, unknown>;
};

function getRiskLevel(toolName: string): HarnessRiskLevel {
  if (toolName === "web_fetch" || toolName === "get_time") {
    return "safe";
  }

  if (toolName.startsWith("mcp_")) {
    return "guarded";
  }

  if (
    toolName === "file_read" ||
    toolName === "file_write" ||
    toolName === "shell_exec"
  ) {
    return "guarded";
  }

  return "safe";
}

function resolveWorkspacePath(workspacePath: string, targetPath: string): string {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(workspacePath, targetPath);
}

export function evaluateToolPolicy({
  workspacePath,
  toolName,
  args,
}: ToolPolicyContext): HarnessPolicyEvaluation {
  const riskLevel = getRiskLevel(toolName);

  if (toolName === "shell_exec") {
    const command = typeof args.command === "string" ? args.command : "";
    if (!command.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效命令。" },
      };
    }

    const result = checkShellCommand(command);
    if (!result.allowed) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: result.reason ?? "命令被安全策略拦截。" },
        normalizedArgs: { ...args, command },
      };
    }

    if (result.needsConfirmation) {
      return {
        toolName,
        riskLevel,
        decision: { type: "confirm", reason: "该命令不在自动通过白名单中。" },
        normalizedArgs: { ...args, command },
      };
    }

    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, command },
    };
  }

  if (toolName === "file_write") {
    const targetPath = typeof args.path === "string" ? args.path : "";
    if (!targetPath.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效文件路径。" },
      };
    }

    const resolvedPath = resolveWorkspacePath(workspacePath, targetPath);
    if (!isPathAllowed(resolvedPath, workspacePath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "路径超出 workspace 范围。" },
        metadata: { resolvedPath },
      };
    }

    if (isWritePathForbidden(resolvedPath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "该目录受写保护。" },
        metadata: { resolvedPath },
      };
    }

    const fileExists = fs.existsSync(resolvedPath);
    if (fileExists) {
      return {
        toolName,
        riskLevel,
        decision: { type: "confirm", reason: "覆盖已有文件需要用户确认。" },
        normalizedArgs: { ...args, path: targetPath },
        metadata: { resolvedPath, fileExists: true },
      };
    }

    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, path: targetPath },
      metadata: { resolvedPath, fileExists: false },
    };
  }

  if (toolName === "file_read") {
    const targetPath = typeof args.path === "string" ? args.path : "";
    if (!targetPath.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效文件路径。" },
      };
    }

    const resolvedPath = resolveWorkspacePath(workspacePath, targetPath);
    if (!isPathAllowed(resolvedPath, workspacePath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "路径超出 workspace 范围。" },
        metadata: { resolvedPath },
      };
    }

    if (isPathForbiddenRead(resolvedPath)) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "该文件受敏感读取保护。" },
        metadata: { resolvedPath },
      };
    }

    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, path: targetPath },
      metadata: { resolvedPath },
    };
  }

  if (toolName === "web_fetch") {
    const url = typeof args.url === "string" ? args.url : "";
    if (!url.trim()) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: "缺少有效 URL。" },
      };
    }

    const result = checkFetchUrl(url);
    if (!result.allowed) {
      return {
        toolName,
        riskLevel,
        decision: { type: "deny", reason: result.reason ?? "URL 被策略拒绝。" },
        normalizedArgs: { ...args, url },
      };
    }

    return {
      toolName,
      riskLevel,
      decision: { type: "allow" },
      normalizedArgs: { ...args, url },
    };
  }

  if (toolName.startsWith("mcp_")) {
    return {
      toolName,
      riskLevel,
      decision: { type: "confirm", reason: "MCP 工具默认需要通过 Harness 确认。" },
      normalizedArgs: args,
    };
  }

  return {
    toolName,
    riskLevel,
    decision: { type: "allow" },
    normalizedArgs: args,
  };
}

