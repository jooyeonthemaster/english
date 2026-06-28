export type QuestionGenerationPlan = "STANDARD" | "PREMIUM";

export interface QuestionGenerationPlanConfig {
  id: QuestionGenerationPlan;
  label: string;
  shortLabel: string;
  description: string;
  creditMultiplier: number;
}

export const QUESTION_GENERATION_PLANS: Record<
  QuestionGenerationPlan,
  QuestionGenerationPlanConfig
> = {
  STANDARD: {
    id: "STANDARD",
    label: "일반 문제 생성",
    shortLabel: "일반",
    description: "빠른 속도 · 기본 품질",
    creditMultiplier: 1,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "프리미엄 문제 생성",
    shortLabel: "프리미엄",
    description: "정밀 검수 · 고난도 품질",
    creditMultiplier: 2,
  },
};

export const QUESTION_GENERATION_PLAN_TAGS: Record<QuestionGenerationPlan, string> = {
  STANDARD: "일반 생성",
  PREMIUM: "프리미엄 생성",
};

const QUESTION_GENERATION_PLAN_TAG_ALIASES: Record<
  QuestionGenerationPlan,
  readonly string[]
> = {
  STANDARD: [
    QUESTION_GENERATION_PLAN_TAGS.STANDARD,
    "일반",
    "표준",
    "표준 생성",
    "Gemini 생성",
    "Gemini 문제 생성",
    "Gemini",
    "Gemini 3.5 Flash",
    "제미나이",
  ],
  PREMIUM: [
    QUESTION_GENERATION_PLAN_TAGS.PREMIUM,
    "프리미엄",
    "고급",
    "고급 생성",
    "Claude 생성",
    "Claude 문제 생성",
    "Claude",
    "Claude Sonnet",
    "Claude Sonnet 4.6",
    "Sonnet",
    "소넷",
  ],
};

const AI_MODEL_DISCLOSURE_PATTERNS = [
  /gemini/i,
  /제미나이/i,
  /claude/i,
  /sonnet/i,
  /소넷/i,
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
  /소넷/gi,
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

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map(normalizePlanTag)
      .filter((tag) => tag.length > 0);
  }

  if (typeof rawTags !== "string") return [];
  const trimmed = rawTags.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map(normalizePlanTag)
        .filter((tag) => tag.length > 0);
    }
  } catch {
    // Fall through to comma-separated tag parsing.
  }

  return trimmed
    .split(",")
    .map(normalizePlanTag)
    .filter((tag) => tag.length > 0);
}

export function getQuestionGenerationPlanFromTags(
  tags: readonly string[],
): QuestionGenerationPlan | null {
  const normalized = new Set(tags.map(normalizePlanTag));
  if (QUESTION_GENERATION_PLAN_TAG_ALIASES.PREMIUM.some((tag) => normalized.has(tag))) {
    return "PREMIUM";
  }
  if (QUESTION_GENERATION_PLAN_TAG_ALIASES.STANDARD.some((tag) => normalized.has(tag))) {
    return "STANDARD";
  }
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

// `prefix:value` 형태(예: kice:2027_06_…)의 내부 식별 키 태그. ASCII 식별자 +
// 콜론으로 시작하는 것만 매칭해 한글 라벨("단원:1과" 등) 오탐을 피한다.
const MACHINE_KEY_TAG = /^[A-Za-z0-9_.-]+:/;

export function isMachineKeyTag(tag: string): boolean {
  return MACHINE_KEY_TAG.test(tag);
}

/**
 * 화면 표시용 태그 — `getVisibleQuestionTags` 에서 기계용 식별 키(`kice:` 등)까지
 * 추가로 제거한다. 데이터/저장에는 영향이 없도록 '표시' 경로에서만 쓸 것
 * (편집 초기값 등 저장으로 왕복하는 곳에는 `getVisibleQuestionTags` 를 그대로 사용).
 */
export function getDisplayQuestionTags(
  tags: readonly string[] | null | undefined,
): string[] {
  return getVisibleQuestionTags(tags).filter((tag) => !isMachineKeyTag(tag));
}

export function sanitizeAiModelDisclosureText(value: string | null | undefined): string {
  if (!value) return "";
  return AI_MODEL_DISCLOSURE_REPLACEMENTS.reduce(
    (text, pattern) => text.replace(pattern, "AI"),
    value,
  )
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

export function withQuestionGenerationPlanMetadata<T extends Record<string, unknown>>(
  question: T,
  plan: QuestionGenerationPlan,
): T & { _generationPlan: QuestionGenerationPlan; tags: string[] } {
  const tags = mergeQuestionGenerationPlanTag(readQuestionTags(question.tags), plan);
  return {
    ...question,
    _generationPlan: plan,
    tags,
  };
}
