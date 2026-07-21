import { FEATURE_FLAGS } from "@/lib/feature-flags";

export type QuestionGenerationPlan = "STANDARD" | "PREMIUM";

export interface QuestionGenerationPlanConfig {
  id: QuestionGenerationPlan;
  label: string;
  shortLabel: string;
  description: string;
  creditMultiplier: number;
}

// 이원 티어(26-07-20, 캠페인 O197~O201 확정): 두 티어 모두 동일 모델(flash3)이며
// 차이는 파이프라인 무게다 — STANDARD = 생성+통합 검수리 2콜+결정형 게이트,
// PREMIUM = 풀 파이프라인(어법 사다리·솔버·E-gate 검증/수리). 요금은 현행 단일가
// (getQuestionGenerationCreditCost)라 creditMultiplier 는 두 티어 모두 1 —
// 티어별 가격 차등은 별도 사용자 결정 사항이다(결정 시 이 표와 요금 함수 동기 수정).
export const QUESTION_GENERATION_PLANS: Record<
  QuestionGenerationPlan,
  QuestionGenerationPlanConfig
> = {
  STANDARD: {
    id: "STANDARD",
    label: "일반 문제 생성",
    shortLabel: "일반",
    description: "빠른 속도 · AI 검수 1회",
    creditMultiplier: 1,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "프리미엄 문제 생성",
    shortLabel: "프리미엄",
    description: "정밀 검수 · 심층 검증 파이프라인",
    creditMultiplier: 1,
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
  // 26-07-15 프리미엄 재개(어법 신 엔진 grammar-premium-ladder 검증 통과) —
  // 잠정 중단용 서버 클램프는 유지하되, 플래그가 다시 꺼지면(잠금 시) 저장된
  // 설정·직접 호출의 PREMIUM 도 STANDARD 로 강제해 2x 과금 구멍을 막는다.
  if (!FEATURE_FLAGS.SHOW_MODEL_SELECTOR) return "STANDARD";
  return value === "PREMIUM" ? "PREMIUM" : "STANDARD";
}

export function getQuestionGenerationPlanConfig(
  plan: QuestionGenerationPlan,
): QuestionGenerationPlanConfig {
  return QUESTION_GENERATION_PLANS[plan];
}

// ── 단일 상품 서버 코어 (26-07-21 사용자 결정) ───────────────────────────────
// 프리미엄 판매 중단 — 전 요청이 일반(STANDARD) 레인으로 간다: 빈칸=경량 생성+
// 통합 검수리 1콜, 어법 KILLER=사다리 3단계+검수리, 그 외=생성+검수리. 백그라운드
// 재검증 체인(E-gate verify→repair→re-verify)은 휴면(STANDARD 기본 off + PENDING
// 미발생 → 워커 미인큐). 프리미엄 파이프라인 코드는 보존 — env
// QUESTION_GENERATION_SINGLE_TIER=off 로 이원 티어 즉시 복귀 가능.

/** 단일 상품 모드(기본 on). env QUESTION_GENERATION_SINGLE_TIER=off 로 이원 티어 복귀. */
export function isQuestionGenerationSingleTier(): boolean {
  return (
    process.env.QUESTION_GENERATION_SINGLE_TIER?.trim().toLowerCase() !== "off"
  );
}

/**
 * 진입점 공용 최종 플랜 결정 — 정규화 후 단일 상품 모드면 STANDARD 로 접는다.
 * (fast/async/trigger/단건 4진입점의 유일한 결정 함수 — 규칙 중복 금지.)
 */
export function resolveEffectiveGenerationPlan(
  requested: unknown,
): QuestionGenerationPlan {
  const normalized = normalizeQuestionGenerationPlan(requested);
  return isQuestionGenerationSingleTier() ? "STANDARD" : normalized;
}

/**
 * 상품 단일화(W2-E)의 산물: 플랜별 2x 멀티플라이어를 폐지했다. 플랜과 무관하게
 * 단일가(baseCost)를 청구한다. 이원 티어에서도 단일가를 유지한다 — 티어별 가격
 * 차등은 사용자 결정 대기 사항. `plan` 파라미터는 호출부 시그니처 호환·로깅을
 * 위해 남겨두되 요금 계산에는 절대 쓰지 않는다.
 */
export function getQuestionGenerationCreditCost(
  baseCost: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 시그니처 호환용: 다수 호출부가 plan 을 위치 인자로 넘긴다. 요금은 플랜 무관 단일가라 값은 쓰지 않는다.
  plan?: QuestionGenerationPlan,
): number {
  return baseCost;
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
