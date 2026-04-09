// ---------------------------------------------------------------------------
// Active Learning Engine — 从工具失败和用户纠正中自动学习
// ---------------------------------------------------------------------------
//
// 信号检测 → 阈值判断 → 生成学习条目 → 写入 semantic memory
// 学习结果在下次 prompt 注入时自动携带，改变 Agent 行为。
// ---------------------------------------------------------------------------

import { bus } from "../event-bus.js";
import { getMemdirStore } from "../memory/service.js";
import { appLogger } from "../logger.js";
import { scheduler } from "../scheduler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LearningSignalType =
  | "tool_repeated_failure"
  | "user_correction"
  | "retry_after_reject"
  | "pattern_inefficiency"
  | "tool_discovery_opportunity"
  | "tool_misuse_pattern";

interface LearningSignal {
  type: LearningSignalType;
  toolName: string;
  message: string;
  sessionId: string;
  timestamp: number;
}

interface SignalAccumulator {
  count: number;
  lastSeen: number;
  samples: string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SIGNAL_THRESHOLD = 3;
const MAX_SAMPLES_PER_SIGNAL = 5;
const MAX_LEARNINGS = 50;
const SIGNAL_DECAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// tool_failure 按 toolName 聚合
const failureAccum = new Map<string, SignalAccumulator>();
// rejection 按 toolName 聚合
const rejectionAccum = new Map<string, SignalAccumulator>();
// 已产出的学习记录（避免重复）
const producedLearnings = new Set<string>();

// ---------------------------------------------------------------------------
// Signal Collection — 通过 Event Bus 被动收集
// ---------------------------------------------------------------------------

function onToolFailed(data: { toolName: string; toolCallId: string; error: string; sessionId: string }): void {
  const key = data.toolName;
  const accum = failureAccum.get(key) ?? { count: 0, lastSeen: 0, samples: [] };
  accum.count++;
  accum.lastSeen = Date.now();
  if (accum.samples.length < MAX_SAMPLES_PER_SIGNAL) {
    accum.samples.push(data.error.slice(0, 200));
  }
  failureAccum.set(key, accum);

  // 实时检查是否达到阈值
  if (accum.count >= SIGNAL_THRESHOLD && !producedLearnings.has(`failure:${key}`)) {
    void processSignal({
      type: "tool_repeated_failure",
      toolName: key,
      message: `工具 ${key} 连续失败 ${accum.count} 次。常见错误: ${accum.samples[0]}`,
      sessionId: data.sessionId,
      timestamp: Date.now(),
    });
  }
}

function onApprovalResolved(data: { requestId: string; allowed: boolean; sessionId: string; runId: string }): void {
  if (data.allowed) return;

  // 从 requestId 提取 toolName（格式：toolName-hash）
  const toolName = data.requestId.split("-")[0] || "unknown";
  const key = toolName;
  const accum = rejectionAccum.get(key) ?? { count: 0, lastSeen: 0, samples: [] };
  accum.count++;
  accum.lastSeen = Date.now();
  rejectionAccum.set(key, accum);

  if (accum.count >= SIGNAL_THRESHOLD && !producedLearnings.has(`reject:${key}`)) {
    void processSignal({
      type: "retry_after_reject",
      toolName: key,
      message: `工具 ${key} 被用户拒绝 ${accum.count} 次，Agent 应考虑替代方案或减少使用`,
      sessionId: data.sessionId,
      timestamp: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Signal Processing — 达到阈值后生成学习条目
// ---------------------------------------------------------------------------

async function processSignal(signal: LearningSignal): Promise<void> {
  const learningKey = `${signal.type}:${signal.toolName}`;
  if (producedLearnings.has(learningKey)) return;

  try {
    const store = getMemdirStore();

    // 生成学习摘要
    let summary: string;
    let detail: string;

    switch (signal.type) {
      case "tool_repeated_failure":
        summary = `[学习] 工具 ${signal.toolName} 频繁失败，需注意参数校验`;
        detail = [
          `信号类型: ${signal.type}`,
          `工具: ${signal.toolName}`,
          `描述: ${signal.message}`,
          `建议: 使用该工具前先验证参数有效性，或考虑替代工具`,
        ].join("\n");
        break;

      case "retry_after_reject":
        summary = `[学习] 工具 ${signal.toolName} 常被用户拒绝，优先尝试其他方案`;
        detail = [
          `信号类型: ${signal.type}`,
          `工具: ${signal.toolName}`,
          `描述: ${signal.message}`,
          `建议: 减少使用该工具，或在使用前先征求用户意见`,
        ].join("\n");
        break;

      case "tool_discovery_opportunity":
        summary = `[学习] 用户可能不知道工具 ${signal.toolName} 的存在`;
        detail = signal.message;
        break;

      case "tool_misuse_pattern":
        summary = `[学习] 工具 ${signal.toolName} 的参数使用存在常见错误模式`;
        detail = signal.message;
        break;

      default:
        summary = `[学习] ${signal.message}`;
        detail = `信号类型: ${signal.type}, 工具: ${signal.toolName}`;
    }

    store.save({
      summary,
      detail,
      topic: "learnings",
      source: "system:active-learning",
    });

    producedLearnings.add(learningKey);

    bus.emit("learning:applied", {
      type: signal.type,
      target: signal.toolName,
      message: summary,
    });

    appLogger.info({
      scope: "active-learning",
      message: `生成学习条目: ${summary.slice(0, 60)}`,
    });
  } catch (err) {
    appLogger.error({
      scope: "active-learning",
      message: "学习条目写入失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

// ---------------------------------------------------------------------------
// Periodic Decay — 清理过期信号
// ---------------------------------------------------------------------------

function decaySignals(): void {
  const now = Date.now();
  for (const [key, accum] of failureAccum) {
    if (now - accum.lastSeen > SIGNAL_DECAY_MS) {
      failureAccum.delete(key);
      producedLearnings.delete(`failure:${key}`);
    }
  }
  for (const [key, accum] of rejectionAccum) {
    if (now - accum.lastSeen > SIGNAL_DECAY_MS) {
      rejectionAccum.delete(key);
      producedLearnings.delete(`reject:${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Manual Signal Injection (for external use)
// ---------------------------------------------------------------------------

export function reportLearningSignal(signal: LearningSignal): void {
  void processSignal(signal);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initActiveLearning(): void {
  // 订阅工具失败事件
  bus.on("tool:failed", onToolFailed);
  // 订阅审批拒绝事件
  bus.on("approval:resolved", onApprovalResolved);

  // 注册定期信号衰减任务
  scheduler.register(
    {
      id: "active-learning-decay",
      name: "主动学习信号衰减",
      type: "interval",
      intervalMs: 60 * 60 * 1000, // 每小时
      enabled: true,
    },
    decaySignals
  );

  appLogger.info({
    scope: "active-learning",
    message: "主动学习引擎已启动",
  });
}
