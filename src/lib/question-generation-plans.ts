import { FEATURE_FLAGS } from "@/lib/feature-flags";

export type QuestionGenerationPlan = "STANDARD" | "PREMIUM";

export interface QuestionGenerationPlanConfig {
  id: QuestionGenerationPlan;
  label: string;
  shortLabel: string;
  description: string;
  creditMultiplier: number;
}

// ── 난이도 기반 티어 (26-08-18, 사용자 결정 — O223 캠페인 귀결) ─────────────────
// 플랜(일반/프리미엄) 선택 상품은 폐지. **난이도가 티어를 결정한다**:
//   KILLER → PREMIUM 파이프라인(gemini 3.7-flash·v2 프롬프트·E-gate·사다리) + 요금 2배
//   그 외   → STANDARD(luna 레인) 1배
// 근거: luna 킬러는 신뢰성은 잡히나(V4 30%→5%) 미학은 못 사고(A 0), 3.7 v2 는
// A+B 16/20 — 원가 ₩20 vs ₩27 이라 티어를 플랜으로 가르는 의미가 없었다. 요청
// generationPlan 은 무시된다(레거시 저장값·세트 프리셋의 좀비 PREMIUM 차단).
// PREMIUM/STANDARD 열거형은 엔진 내부 분기(모델·E-gate·사다리·태그)의 진실원으로
// 유지 — 이름만 "티어"로 읽으면 된다.
export const QUESTION_GENERATION_PLANS: Record<
  QuestionGenerationPlan,
  QuestionGenerationPlanConfig
> = {
  STANDARD: {
    id: "STANDARD",
    label: "기본·중급 생성",
    shortLabel: "일반",
    description: "빠른 속도 · AI 검수 1회",
    creditMultiplier: 1,
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "킬러 생성",
    shortLabel: "킬러",
    description: "상위 모델 · 정밀 검수 파이프라인 (킬러 난이도 전용, 2배)",
    creditMultiplier: 2,
  },
};

/** 난이도 → 티어. KILLER 만 PREMIUM. 문자열 비교는 대문자 정규화(레거시 소문자 방어). */
export function planForDifficulty(difficulty: unknown): QuestionGenerationPlan {
  return typeof difficulty === "string" &&
    difficulty.trim().toUpperCase() === "KILLER"
    ? "PREMIUM"
    : "STANDARD";
}

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
    // 26-08-18 난이도 기반 티어: PREMIUM=킬러 티어. 저장 태그 값('프리미엄 생성')은
    // 기존 데이터 역추출 호환을 위해 그대로 두고, 표시명 계열만 별칭으로 흡수한다.
    "킬러 생성",
    "킬러",
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
 * 진입점 공용 최종 티어 결정 — **난이도가 결정한다**(26-08-18): KILLER → PREMIUM,
 * 그 외 → STANDARD. 요청 generationPlan 은 무시한다(플랜 상품 폐지 — 레거시
 * 저장값·세트 프리셋의 좀비 PREMIUM 이 2배 과금·모델 분기로 새는 구멍 차단).
 * 단일상품 클램프(QUESTION_GENERATION_SINGLE_TIER)도 난이도 규칙에 양보한다 —
 * 프로덕션 env 가 on 이어도 KILLER 2배가 작동해야 한다.
 * (md-stream/fast/async/trigger/단건/그래머스튜디오 6진입점의 유일한 결정 함수 —
 *  규칙 중복 금지. difficulty 미전달 호출부는 STANDARD 로 떨어진다.)
 * 비상 복귀: env QGEN_DIFFICULTY_TIER=off 면 종전 규칙(요청 플랜 + 단일상품 클램프).
 */
export function resolveEffectiveGenerationPlan(
  requested: unknown,
  difficulty?: unknown,
): QuestionGenerationPlan {
  if (process.env.QGEN_DIFFICULTY_TIER?.trim().toLowerCase() === "off") {
    const normalized = normalizeQuestionGenerationPlan(requested);
    return isQuestionGenerationSingleTier() ? "STANDARD" : normalized;
  }
  return planForDifficulty(difficulty);
}

/**
 * 티어별 요금(26-07-22 사용자 확정): PREMIUM = 2배. 단일상품(W2-E) 때 폐지했던
 * 멀티플라이어를 이원 티어 복귀(O213, 3.6-flash 프리미엄)와 함께 부활 —
 * QUESTION_GENERATION_PLANS 의 creditMultiplier 표와 반드시 동기 유지.
 * plan 미전달 호출부(플랜 개념 없는 기능)는 STANDARD 단가로 계산된다.
 */
export function getQuestionGenerationCreditCost(
  baseCost: number,
  plan?: QuestionGenerationPlan,
): number {
  return plan === "PREMIUM"
    ? baseCost * QUESTION_GENERATION_PLANS.PREMIUM.creditMultiplier
    : baseCost;
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
