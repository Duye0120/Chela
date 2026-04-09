// ---------------------------------------------------------------------------
// Personality Drift — 性格自然演化层
// ---------------------------------------------------------------------------
//
// 不直接修改 SOUL.md，而是维护一个独立的性格漂移文件，
// 作为 soft prompt 附加在 SOUL.md 之后。
//
// 规则：
// - 来源只从反思报告/学习引擎产生
// - trait 需 3 次独立提及才固化
// - 30 天未 reinforce 衰减
// - 最多 20 个活跃 trait
// ---------------------------------------------------------------------------

import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { appLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonalityTrait {
  trait: string;
  source: string;
  strength: number; // 0-1
  firstSeen: number;
  lastReinforced: number;
  mentionCount: number;
  locked: boolean;
}

export interface PersonalityDrift {
  traits: PersonalityTrait[];
  lastUpdated: number;
  generation: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SOLIDIFY_THRESHOLD = 3; // 需要 3 次独立提及才固化
const DECAY_DAYS = 30;
const DECAY_MS = DECAY_DAYS * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_TRAITS = 20;
const INITIAL_STRENGTH = 0.3;
const REINFORCE_BOOST = 0.15;
const DECAY_AMOUNT = 0.1;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let drift: PersonalityDrift = {
  traits: [],
  lastUpdated: Date.now(),
  generation: 0,
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function getDriftPath(): string {
  return join(app.getPath("userData"), "data", "personality-drift.json");
}

function loadDrift(): PersonalityDrift {
  const path = getDriftPath();
  if (!existsSync(path)) {
    return { traits: [], lastUpdated: Date.now(), generation: 0 };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { traits: [], lastUpdated: Date.now(), generation: 0 };
  }
}

function saveDrift(): void {
  try {
    const dir = join(app.getPath("userData"), "data");
    mkdirSync(dir, { recursive: true });
    drift.lastUpdated = Date.now();
    writeFileSync(getDriftPath(), JSON.stringify(drift, null, 2), "utf-8");
  } catch (err) {
    appLogger.error({
      scope: "personality-drift",
      message: "性格漂移数据保存失败",
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

/**
 * 处理来自反思报告的性格漂移候选
 */
export function processPersonalityDrift(candidates: string[], source: string): void {
  const now = Date.now();

  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized) continue;

    // 查找是否已存在相似 trait
    const existing = drift.traits.find(
      (t) => t.trait === normalized || isSimilarTrait(t.trait, normalized)
    );

    if (existing) {
      // 增强已有 trait
      existing.mentionCount++;
      existing.lastReinforced = now;
      existing.strength = Math.min(1, existing.strength + REINFORCE_BOOST);
      existing.source = `${existing.source}; ${source}`;
    } else {
      // 添加新候选
      drift.traits.push({
        trait: normalized,
        source,
        strength: INITIAL_STRENGTH,
        firstSeen: now,
        lastReinforced: now,
        mentionCount: 1,
        locked: false,
      });
    }
  }

  // 衰减 + 淘汰
  decayTraits();
  pruneTraits();

  drift.generation++;
  saveDrift();
}

/**
 * 简单相似度判断（子串匹配）
 */
function isSimilarTrait(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la.includes(lb) || lb.includes(la);
}

/**
 * 衰减未被 reinforce 的 trait
 */
function decayTraits(): void {
  const now = Date.now();
  for (const trait of drift.traits) {
    if (trait.locked) continue;
    if (now - trait.lastReinforced > DECAY_MS) {
      trait.strength = Math.max(0, trait.strength - DECAY_AMOUNT);
    }
  }
  // 移除强度为 0 的非锁定 trait
  drift.traits = drift.traits.filter((t) => t.strength > 0 || t.locked);
}

/**
 * 保证活跃 trait 不超过上限
 */
function pruneTraits(): void {
  if (drift.traits.length <= MAX_ACTIVE_TRAITS) return;

  // 按 strength 排序，保留最强的
  drift.traits.sort((a, b) => {
    if (a.locked && !b.locked) return -1;
    if (!a.locked && b.locked) return 1;
    return b.strength - a.strength;
  });

  drift.traits = drift.traits.slice(0, MAX_ACTIVE_TRAITS);
}

// ---------------------------------------------------------------------------
// Prompt Section Builder
// ---------------------------------------------------------------------------

/**
 * 构建性格漂移的 prompt 文本，附加在 SOUL.md 之后
 */
export function buildPersonalityDriftPromptText(): string {
  // 只注入已固化的 trait（mentionCount >= SOLIDIFY_THRESHOLD）
  const solidified = drift.traits.filter(
    (t) => t.mentionCount >= SOLIDIFY_THRESHOLD || t.locked
  );

  if (solidified.length === 0) return "";

  const lines = [
    "[性格成长笔记]",
    "以下是我从日常互动中自然学到的行为偏好（仅供参考，不强制执行）：",
    "",
  ];

  for (const trait of solidified) {
    const confidence = trait.strength.toFixed(1);
    lines.push(`- ${trait.trait}（置信度: ${confidence}）`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// External API
// ---------------------------------------------------------------------------

export function getPersonalityDrift(): PersonalityDrift {
  return JSON.parse(JSON.stringify(drift));
}

export function lockTrait(traitText: string): boolean {
  const trait = drift.traits.find((t) => t.trait === traitText);
  if (!trait) return false;
  trait.locked = true;
  saveDrift();
  return true;
}

export function unlockTrait(traitText: string): boolean {
  const trait = drift.traits.find((t) => t.trait === traitText);
  if (!trait) return false;
  trait.locked = false;
  saveDrift();
  return true;
}

export function removeTrait(traitText: string): boolean {
  const before = drift.traits.length;
  drift.traits = drift.traits.filter((t) => t.trait !== traitText);
  if (drift.traits.length < before) {
    saveDrift();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initPersonalityDrift(): void {
  drift = loadDrift();

  appLogger.info({
    scope: "personality-drift",
    message: `性格漂移层已加载 — ${drift.traits.length} 个 trait, 第 ${drift.generation} 代`,
  });
}
