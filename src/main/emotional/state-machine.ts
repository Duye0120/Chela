// ---------------------------------------------------------------------------
// Emotional State Machine — 根据对话氛围自动切换行为模式
// ---------------------------------------------------------------------------
//
// 简单启发式（时间/频率/长度/错误/关键词）→ 情绪信号 → 状态转移
// 每轮评估一次，结果注入 prompt 为 soft section。
// ---------------------------------------------------------------------------

import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BUS_EVENTS, bus } from "../event-bus.js";
import { appLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmotionalMode =
  | "focused"
  | "companion"
  | "quiet"
  | "encouraging"
  | "creative";

interface MoodSignal {
  type: "time_of_day" | "reply_frequency" | "message_length" | "error_streak" | "sentiment" | "explicit_cue";
  value: number; // -1 ~ 1
  weight: number;
}

export interface EmotionalState {
  currentMode: EmotionalMode;
  confidence: number;
  since: number;
  signals: MoodSignal[];
  locked: boolean;
}

// ---------------------------------------------------------------------------
// Mode Descriptions (注入 prompt 用)
// ---------------------------------------------------------------------------

const MODE_PROMPTS: Record<EmotionalMode, string> = {
  focused: [
    "[当前模式: 专注工作]",
    "- 回复简洁直接，优先给方案和代码",
    "- 减少寒暄，但不要冷冰冰",
    "- 如果用户主动闲聊，可以短暂切换",
  ].join("\n"),
  companion: [
    "[当前模式: 陪伴]",
    "- 温暖关怀，可以适当闲聊",
    "- 关心用户状态，适当询问近况",
    "- 回复可以稍长，加入个人风格",
  ].join("\n"),
  quiet: [
    "[当前模式: 安静]",
    "- 只在被问时回答，减少主动性",
    "- 回复简短精炼",
    "- 不主动发起话题",
  ].join("\n"),
  encouraging: [
    "[当前模式: 鼓励]",
    "- 遇到挫折时加油打气",
    "- 强调进展和成就，淡化困难",
    "- 提供备选方案时语气积极",
  ].join("\n"),
  creative: [
    "[当前模式: 创意]",
    "- 头脑风暴，发散思维",
    "- 大胆提出不寻常的方案",
    "- 鼓励探索，减少否定",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const COOLDOWN_MS = 5 * 60 * 1000; // 模式切换冷却期 5 分钟
const DEFAULT_STATE: EmotionalState = {
  currentMode: "focused",
  confidence: 0.5,
  since: Date.now(),
  signals: [],
  locked: false,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: EmotionalState = { ...DEFAULT_STATE };
let initialized = false;
let teardownEmotionalStateMachine: (() => void) | null = null;

// 实时追踪
let recentMessageTimestamps: number[] = [];
let recentErrorCount = 0;
let lastMessageLength = 0;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function getStatePath(): string {
  return join(app.getPath("userData"), "data", "emotional-state.json");
}

function loadState(): EmotionalState {
  try {
    const raw = readFileSync(getStatePath(), "utf-8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(): void {
  try {
    const dir = join(app.getPath("userData"), "data");
    mkdirSync(dir, { recursive: true });
    writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    appLogger.error({
      scope: "emotional",
      message: "情感状态保存失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

// ---------------------------------------------------------------------------
// Signal Collection
// ---------------------------------------------------------------------------

function collectSignals(): MoodSignal[] {
  const signals: MoodSignal[] = [];
  const now = Date.now();
  const hour = new Date().getHours();

  // 时间信号
  if (hour >= 0 && hour < 6) {
    signals.push({ type: "time_of_day", value: -0.5, weight: 0.3 }); // 深夜 → 安静
  } else if (hour >= 6 && hour < 9) {
    signals.push({ type: "time_of_day", value: 0.3, weight: 0.2 }); // 早上 → 陪伴
  } else if (hour >= 9 && hour < 18) {
    signals.push({ type: "time_of_day", value: 0.5, weight: 0.2 }); // 工作时间 → 专注
  } else {
    signals.push({ type: "time_of_day", value: 0, weight: 0.1 }); // 晚上 → 中性
  }

  // 回复频率信号（最近 5 分钟内的消息数）
  const recentWindow = recentMessageTimestamps.filter((t) => now - t < 5 * 60 * 1000);
  if (recentWindow.length >= 5) {
    signals.push({ type: "reply_frequency", value: 0.7, weight: 0.3 }); // 高频 → 专注
  } else if (recentWindow.length <= 1) {
    signals.push({ type: "reply_frequency", value: -0.3, weight: 0.2 }); // 低频 → 安静
  }

  // 消息长度信号
  if (lastMessageLength > 200) {
    signals.push({ type: "message_length", value: 0.5, weight: 0.2 }); // 长消息 → 专注/创意
  } else if (lastMessageLength < 20 && lastMessageLength > 0) {
    signals.push({ type: "message_length", value: -0.3, weight: 0.15 }); // 短消息 → 急/安静
  }

  // 错误连续信号
  if (recentErrorCount >= 3) {
    signals.push({ type: "error_streak", value: -0.8, weight: 0.4 }); // 连续错误 → 鼓励
  }

  return signals;
}

// ---------------------------------------------------------------------------
// State Transition
// ---------------------------------------------------------------------------

function computeNextMode(signals: MoodSignal[]): { mode: EmotionalMode; confidence: number } {
  // 加权平均
  let totalWeight = 0;
  let weightedSum = 0;
  for (const sig of signals) {
    totalWeight += sig.weight;
    weightedSum += sig.value * sig.weight;
  }

  const avgSignal = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // 特殊规则优先
  const hasErrorStreak = signals.some((s) => s.type === "error_streak" && s.value < -0.5);
  if (hasErrorStreak) {
    return { mode: "encouraging", confidence: 0.8 };
  }

  const hasCreativeCue = signals.some((s) => s.type === "explicit_cue" && s.value > 0.5);
  if (hasCreativeCue) {
    return { mode: "creative", confidence: 0.9 };
  }

  // 基于加权信号选择模式
  if (avgSignal > 0.4) {
    return { mode: "focused", confidence: Math.min(0.9, 0.5 + avgSignal) };
  }
  if (avgSignal > 0.1) {
    return { mode: "companion", confidence: 0.6 };
  }
  if (avgSignal < -0.3) {
    return { mode: "quiet", confidence: Math.min(0.8, 0.5 + Math.abs(avgSignal)) };
  }

  return { mode: "companion", confidence: 0.5 };
}

/**
 * 评估当前情绪信号并可能切换模式。
 * 每次用户发消息时调用。
 */
export function evaluateAndTransition(): EmotionalState {
  if (state.locked) return state;

  // 冷却期检查
  if (Date.now() - state.since < COOLDOWN_MS) return state;

  const signals = collectSignals();
  const next = computeNextMode(signals);

  if (next.mode !== state.currentMode && next.confidence > 0.6) {
    const from = state.currentMode;
    state = {
      currentMode: next.mode,
      confidence: next.confidence,
      since: Date.now(),
      signals,
      locked: false,
    };

    bus.emit(BUS_EVENTS.EMOTION_CHANGED, {
      from,
      to: next.mode,
      trigger: signals.map((s) => s.type).join(", "),
    });

    appLogger.info({
      scope: "emotional",
      message: `情感模式切换: ${from} → ${next.mode} (confidence: ${next.confidence.toFixed(2)})`,
    });

    saveState();
  } else {
    state.signals = signals;
  }

  return state;
}

// ---------------------------------------------------------------------------
// Prompt Section Builder
// ---------------------------------------------------------------------------

/**
 * 构建情感模式的 prompt section（供 prompt-control-plane 使用）
 */
export function buildEmotionalPromptText(): string {
  return MODE_PROMPTS[state.currentMode] || MODE_PROMPTS.focused;
}

// ---------------------------------------------------------------------------
// External API
// ---------------------------------------------------------------------------

export function getEmotionalState(): EmotionalState {
  return { ...state };
}

export function lockMode(mode: EmotionalMode): void {
  state.currentMode = mode;
  state.locked = true;
  state.since = Date.now();
  saveState();
}

export function unlockMode(): void {
  state.locked = false;
  saveState();
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

function onUserMessage(data: { text: string }): void {
  recentMessageTimestamps.push(Date.now());
  // 只保留最近 10 分钟的时间戳
  const cutoff = Date.now() - 10 * 60 * 1000;
  recentMessageTimestamps = recentMessageTimestamps.filter((t) => t > cutoff);
  lastMessageLength = data.text.length;

  // 检测明确暗示
  const text = data.text.toLowerCase();
  if (text.includes("头脑风暴") || text.includes("想想办法") || text.includes("brainstorm")) {
    state.signals.push({ type: "explicit_cue", value: 0.8, weight: 0.9 });
  }
  if (text.includes("安静") || text.includes("别说了") || text.includes("quiet")) {
    state.signals.push({ type: "explicit_cue", value: -0.8, weight: 0.9 });
  }

  // 重置错误计数（用户发消息说明还在互动）
  recentErrorCount = 0;
}

function onToolFailed(): void {
  recentErrorCount++;
}

function onRunCompleted(): void {
  // 每次 run 结束时评估情绪
  evaluateAndTransition();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initEmotionalStateMachine(): void {
  if (initialized) {
    return;
  }

  initialized = true;
  state = loadState();

  const disposers = [
    bus.on(BUS_EVENTS.MESSAGE_USER, onUserMessage),
    bus.on(BUS_EVENTS.TOOL_FAILED, onToolFailed),
    bus.on(BUS_EVENTS.RUN_COMPLETED, onRunCompleted),
  ];

  teardownEmotionalStateMachine = () => {
    disposers.forEach((dispose) => dispose());
    disposers.length = 0;
    recentMessageTimestamps = [];
    recentErrorCount = 0;
    lastMessageLength = 0;
    teardownEmotionalStateMachine = null;
    initialized = false;
  };

  appLogger.info({
    scope: "emotional",
    message: `情感状态机已启动 — 当前模式: ${state.currentMode}`,
  });
}

export function stopEmotionalStateMachine(): void {
  teardownEmotionalStateMachine?.();
}
