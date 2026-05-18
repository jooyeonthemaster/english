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
    label: "일반 문제 생성",
    shortLabel: "일반",
    description: "빠르고 경제적인 표준 생성",
    modelLabel: "표준 생성 엔진",
    creditMultiplier: 1,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "프리미엄 문제 생성",
    shortLabel: "프리미엄",
    description: "고난도 문항과 해설 품질을 강화한 생성",
    modelLabel: "고급 생성 엔진",
    creditMultiplier: 2,
  },
};

export const QUESTION_GENERATION_PLAN_TAGS: Record<QuestionGenerationPlan, string> = {
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

export function getQuestionGenerationPlanFromTags(tags: readonly string[]): QuestionGenerationPlan | null {
  if (tags.includes(QUESTION_GENERATION_PLAN_TAGS.PREMIUM)) return "PREMIUM";
  if (tags.includes(QUESTION_GENERATION_PLAN_TAGS.STANDARD)) return "STANDARD";
  return null;
}

export function mergeQuestionGenerationPlanTag(
  tags: readonly string[] | null | undefined,
  plan: QuestionGenerationPlan,
): string[] {
  const generationTags = new Set(Object.values(QUESTION_GENERATION_PLAN_TAGS));
  const merged = (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && !generationTags.has(tag));
  return [getQuestionGenerationPlanTag(plan), ...merged];
}
