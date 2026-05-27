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
    description: "기본 AI 문제 생성",
    modelLabel: "기본 AI",
    creditMultiplier: 1,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "프리미엄 문제 생성",
    shortLabel: "프리미엄",
    description: "고급 AI 문제 생성",
    modelLabel: "고급 AI",
    creditMultiplier: 1,
  },
};

export const QUESTION_GENERATION_PLAN_TAGS: Record<QuestionGenerationPlan, string> = {
  STANDARD: "일반 생성",
  PREMIUM: "프리미엄 생성",
};

const QUESTION_GENERATION_PLAN_TAG_ALIASES: Record<QuestionGenerationPlan, readonly string[]> = {
  STANDARD: [
    QUESTION_GENERATION_PLAN_TAGS.STANDARD,
    "Gemini 생성",
    "Gemini 문제 생성",
    "Gemini",
    "Gemini 3.5 Flash",
    "제미나이",
  ],
  PREMIUM: [
    QUESTION_GENERATION_PLAN_TAGS.PREMIUM,
    "Claude 생성",
    "Claude 문제 생성",
    "Claude",
    "Claude Sonnet 4.6",
    "Sonnet",
  ],
};

const AI_MODEL_DISCLOSURE_PATTERNS = [
  /gemini/i,
  /제미나이/i,
  /claude/i,
  /sonnet/i,
  /gpt[-\s]?\d*/i,
  /openai/i,
  /llm/i,
  /ai\s*model/i,
  /AI\s*모델/i,
];

const AI_MODEL_DISCLOSURE_REPLACEMENTS = [
  /google\s+gemini/gi,
  /gemini\s*\d*(?:\.\d+)?\s*flash/gi,
  /gemini/gi,
  /제미나이/gi,
  /claude\s+sonnet\s*[\d.\-]*/gi,
  /claude/gi,
  /sonnet\s*[\d.\-]*/gi,
  /gpt[-\s]?\d*/gi,
  /openai/gi,
  /llm/gi,
  /ai\s*model/gi,
  /AI\s*모델/gi,
];

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
  if (QUESTION_GENERATION_PLAN_TAG_ALIASES.PREMIUM.some((tag) => normalized.has(tag))) return "PREMIUM";
  if (QUESTION_GENERATION_PLAN_TAG_ALIASES.STANDARD.some((tag) => normalized.has(tag))) return "STANDARD";
  return null;
}

export function isQuestionGenerationPlanTag(tag: unknown): boolean {
  const normalizedTag = normalizePlanTag(tag);
  if (
    Object.values(QUESTION_GENERATION_PLAN_TAG_ALIASES)
      .flat()
      .some((planTag) => planTag === normalizedTag)
  ) {
    return true;
  }
  return AI_MODEL_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(normalizedTag));
}

export function getVisibleQuestionTags(
  tags: readonly string[] | null | undefined,
): string[] {
  return (tags ?? [])
    .map(normalizePlanTag)
    .filter((tag) => tag.length > 0 && !isQuestionGenerationPlanTag(tag));
}

export function sanitizeAiModelDisclosureText(value: string | null | undefined): string {
  if (!value) return "";
  return AI_MODEL_DISCLOSURE_REPLACEMENTS
    .reduce((text, pattern) => text.replace(pattern, "AI"), value)
    .replace(/\bAI(?:\s+AI)+\b/g, "AI")
    .replace(/\s{2,}/g, " ")
    .trim();
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
