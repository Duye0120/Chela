import type {
  RuntimeSkillUsage,
  SkillUsageTarget,
} from "./contracts.js";

type SkillUsageRegistryEntry = {
  skillId: string;
  skillLabel: string;
  targets: SkillUsageTarget[];
};

const SKILL_USAGE_REGISTRY: Record<string, SkillUsageRegistryEntry> = {
  commit: {
    skillId: "commit",
    skillLabel: "commit skill",
    targets: [
      {
        entryPointId: "right-panel.commit-plan",
        label: "右侧边栏 / 提交计划生成",
        surface: "right-panel",
        trigger: "manual",
      },
    ],
  },
};

export function getSkillUsageTargets(skillId: string): SkillUsageTarget[] {
  const entry = SKILL_USAGE_REGISTRY[skillId.trim().toLowerCase()];
  if (!entry) {
    return [];
  }

  return entry.targets.map((target) => ({ ...target }));
}

export function getRuntimeSkillUsage(
  skillId: string,
  entryPointId: string,
): RuntimeSkillUsage | null {
  const normalizedSkillId = skillId.trim().toLowerCase();
  const entry = SKILL_USAGE_REGISTRY[normalizedSkillId];
  if (!entry) {
    return null;
  }

  const target = entry.targets.find((item) => item.entryPointId === entryPointId);
  if (!target) {
    return null;
  }

  return {
    skillId: entry.skillId,
    skillLabel: entry.skillLabel,
    ...target,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeSkillUsage(value: unknown): value is RuntimeSkillUsage {
  return (
    isObject(value) &&
    typeof value.skillId === "string" &&
    typeof value.skillLabel === "string" &&
    typeof value.entryPointId === "string" &&
    typeof value.label === "string" &&
    (value.surface === "right-panel" || value.surface === "chat") &&
    (value.trigger === "manual" || value.trigger === "automatic")
  );
}

export function extractRuntimeSkillUsages(value: unknown): RuntimeSkillUsage[] {
  if (Array.isArray(value)) {
    return value.filter(isRuntimeSkillUsage).map((item) => ({ ...item }));
  }

  if (isRuntimeSkillUsage(value)) {
    return [{ ...value }];
  }

  if (!isObject(value)) {
    return [];
  }

  if (Array.isArray(value.skillUsages)) {
    return extractRuntimeSkillUsages(value.skillUsages);
  }

  if ("skillUsage" in value) {
    return extractRuntimeSkillUsages(value.skillUsage);
  }

  return [];
}
