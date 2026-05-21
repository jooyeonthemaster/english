export type QuestionGenerationPlan = "STANDARD" | "PREMIUM";

export interface QuestionGenerationPlanConfig {
  id: QuestionGenerationPlan;
  label: string;
  shortLabel: string;
  description: string;
  modelLabel: string;
  creditMultiplier: number;
}

export const QUESTION_GENERATION_PLANS: Record<QuestionGenerationPlan, QuestionGenerationPlanConfig> = {
  STANDARD: {
    id: "STANDARD",
    label: "Gemini 문제 생성",
    shortLabel: "Gemini",
    description: "Gemini 3.5 Flash 기반 문제 생성",
    modelLabel: "Gemini 3.5 Flash",
    creditMultiplier: 1,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "Claude 문제 생성",
    shortLabel: "Claude",
    description: "Claude Sonnet 4.6 기반 문제 생성",
    modelLabel: "Claude Sonnet 4.6",
    creditMultiplier: 2,
  },
};

export const QUESTION_GENERATION_PLAN_TAGS: Record<QuestionGenerationPlan, string> = {
  STANDARD: "Gemini 생성",
  PREMIUM: "Claude 생성",
};

const LEGACY_QUESTION_GENERATION_PLAN_TAGS: Record<QuestionGenerationPlan, string> = {
  STANDARD: "일반 생성",
  PREMIUM: "프리미엄 생성",
};

export function normalizeQuestionGenerationPlan(value: unknown): QuestionGenerationPlan {
  return value === "PREMIUM" ? "PREMIUM" : "STANDARD";
}

export function getQuestionGenerationPlanConfig(
  plan: QuestionGenerationPlan,
): QuestionGenerationPlanConfig {
  return QUESTION_GENERATION_PLANS[plan];
}

export function getQuestionGenerationCreditCost(
  baseCost: number,
  plan: QuestionGenerationPlan,
): number {
  return baseCost * getQuestionGenerationPlanConfig(plan).creditMultiplier;
}

export function getQuestionGenerationPlanTag(plan: QuestionGenerationPlan): string {
  return QUESTION_GENERATION_PLAN_TAGS[plan];
}

function normalizePlanTag(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function getQuestionGenerationPlanFromTags(tags: readonly string[]): QuestionGenerationPlan | null {
  const normalized = new Set(tags.map(normalizePlanTag));
  if (
    normalized.has(QUESTION_GENERATION_PLAN_TAGS.PREMIUM) ||
    normalized.has(LEGACY_QUESTION_GENERATION_PLAN_TAGS.PREMIUM)
  ) return "PREMIUM";
  if (
    normalized.has(QUESTION_GENERATION_PLAN_TAGS.STANDARD) ||
    normalized.has(LEGACY_QUESTION_GENERATION_PLAN_TAGS.STANDARD)
  ) return "STANDARD";
  return null;
}

export function isQuestionGenerationPlanTag(tag: unknown): boolean {
  const normalizedTag = normalizePlanTag(tag);
  return [
    ...Object.values(QUESTION_GENERATION_PLAN_TAGS),
    ...Object.values(LEGACY_QUESTION_GENERATION_PLAN_TAGS),
  ].some((planTag) => planTag === normalizedTag);
}

export function mergeQuestionGenerationPlanTag(
  tags: readonly string[] | null | undefined,
  plan: QuestionGenerationPlan,
): string[] {
  const merged = (tags ?? [])
    .map(normalizePlanTag)
    .filter((tag) => tag.length > 0 && !isQuestionGenerationPlanTag(tag));
  return [getQuestionGenerationPlanTag(plan), ...merged];
}
