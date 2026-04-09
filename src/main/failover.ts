// ---------------------------------------------------------------------------
// Failover — Provider 级别的故障转移
// ---------------------------------------------------------------------------
//
// 当主模型 API 不可用时，自动尝试备选模型。
// 与 providers.ts 的 resolveModelEntry 配合使用。
// ---------------------------------------------------------------------------

import { net } from "electron";
import { listEntries, resolveModelEntry } from "./providers.js";
import { getSettings } from "./settings.js";
import { appLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FailoverResult = {
  entryId: string;
  entryName: string;
  failedEntries: string[];
  isFailover: boolean;
};

// ---------------------------------------------------------------------------
// 网络检测
// ---------------------------------------------------------------------------

export function isOnline(): boolean {
  return net.isOnline();
}

// ---------------------------------------------------------------------------
// Provider 错误分类
// ---------------------------------------------------------------------------

const RETRIABLE_PATTERNS = [
  "econnrefused",
  "enotfound",
  "etimedout",
  "econnreset",
  "socket hang up",
  "fetch failed",
  "network",
  "rate limit",
  "429",
  "503",
  "502",
  "500",
  "overloaded",
  "capacity",
];

export function isProviderTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return RETRIABLE_PATTERNS.some((p) => msg.includes(p));
}

// ---------------------------------------------------------------------------
// Failover 解析
// ---------------------------------------------------------------------------

/**
 * 尝试解析主模型，失败时依次尝试其他已启用的模型。
 * 返回第一个成功解析的模型信息。
 */
export function resolveWithFailover(
  primaryEntryId: string,
): FailoverResult & { resolved: ReturnType<typeof resolveModelEntry> } {
  const failedEntries: string[] = [];

  // 尝试主模型
  try {
    const resolved = resolveModelEntry(primaryEntryId);
    return {
      entryId: resolved.entry.id,
      entryName: resolved.entry.name,
      failedEntries,
      isFailover: false,
      resolved,
    };
  } catch (err) {
    failedEntries.push(primaryEntryId);
    appLogger.warn({
      scope: "failover",
      message: `主模型 ${primaryEntryId} 不可用，尝试备选`,
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }

  // 尝试备选模型（按创建顺序）
  const allEntries = listEntries().filter(
    (e) => e.enabled && e.id !== primaryEntryId,
  );

  for (const entry of allEntries) {
    try {
      const resolved = resolveModelEntry(entry.id);
      appLogger.info({
        scope: "failover",
        message: `已降级到备选模型：${entry.name} (${entry.id})`,
      });
      return {
        entryId: entry.id,
        entryName: entry.name,
        failedEntries,
        isFailover: true,
        resolved,
      };
    } catch {
      failedEntries.push(entry.id);
    }
  }

  // 全部失败
  throw new Error(
    `所有模型均不可用（已尝试 ${failedEntries.length} 个）。请检查 API Key 和网络连接。`,
  );
}

// ---------------------------------------------------------------------------
// Retry with failover（包装 async 操作）
// ---------------------------------------------------------------------------

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 1000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isProviderTransientError(err) || attempt === maxRetries) {
        throw err;
      }

      appLogger.info({
        scope: "failover",
        message: `暂时性错误，${retryDelayMs}ms 后重试 (${attempt + 1}/${maxRetries})`,
      });

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError;
}
