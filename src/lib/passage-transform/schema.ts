import { z } from "zod";

// ============================================================================
// AI 지문 변형 (passage transform) — shared schemas/types
//
// 두 갈래의 변형 모드:
//  ── 구간(span) 변형 — 저지연 Flash-Lite, 인라인 미리보기 ──
//   - PARAPHRASE: 드래그로 선택한 문장(들)을 뜻은 동일하게, 표현만 바꿔 재작성
//   - PREPEND:    지문 전체 맥락과 자연스럽게 이어지는 "앞 문단"을 새로 생성
//
//  ── 지문 전체(whole-passage) 변형 — 추론이 필요해 품질 모델(3.5-flash) 기본 ──
//   - RELATED_TOPIC:  같은 분야·난이도·길이, 다른 소재/관점의 "새 지문"
//   - OPPOSITE_TOPIC: 같은 소재에 대한 반대 입장·반박 구조의 새 지문
//   - DIFFICULTY:     주제·핵심 의미 유지, 어휘·구문 난이도만 조절 (EASIER/HARDER)
//   - LENGTH:         주제·난이도 유지, 분량만 조절 (SHORTER/LONGER)
//
// 전체 변형은 결과가 "새 지문" 한 편이므로 변형본(variant) Passage 로 저장돼
// 지문 목록·문제 생성에 그대로 연동된다. (구간 변형은 인라인 편집으로만 적용)
// ============================================================================

/** 구간(span) 변형 — 인라인 편집으로 적용, DB 저장 없음. */
export const SPAN_TRANSFORM_MODES = ["PARAPHRASE", "PREPEND"] as const;

/** 지문 전체 변형 — 결과를 변형본 Passage 로 저장. */
export const WHOLE_PASSAGE_TRANSFORM_MODES = [
  "RELATED_TOPIC",
  "OPPOSITE_TOPIC",
  "DIFFICULTY",
  "LENGTH",
] as const;

export const PASSAGE_TRANSFORM_MODES = [
  ...SPAN_TRANSFORM_MODES,
  ...WHOLE_PASSAGE_TRANSFORM_MODES,
] as const;
export type PassageTransformMode = (typeof PASSAGE_TRANSFORM_MODES)[number];
export type WholePassageTransformMode =
  (typeof WHOLE_PASSAGE_TRANSFORM_MODES)[number];

export function isWholePassageMode(
  mode: PassageTransformMode,
): mode is WholePassageTransformMode {
  return (WHOLE_PASSAGE_TRANSFORM_MODES as readonly string[]).includes(mode);
}

/**
 * DIFFICULTY / LENGTH 모드의 방향. 다른 모드에서는 무시된다.
 *  - EASIER / HARDER : 난이도 ↓ / ↑
 *  - SHORTER / LONGER: 분량 ↓ / ↑
 */
export const VARIANT_DIRECTIONS = [
  "EASIER",
  "HARDER",
  "SHORTER",
  "LONGER",
] as const;
export type VariantDirection = (typeof VARIANT_DIRECTIONS)[number];

/**
 * 변형 유형의 짧은 한국어 라벨. (UI 버튼·변형본 제목·태그·결정론적 요약에 공용)
 * Flash-Lite 가 meta 필드를 자주 비우므로, 모델 출력 대신 이 라벨로 폴백한다.
 */
export function variantModeLabel(
  mode: WholePassageTransformMode,
  direction?: VariantDirection,
): string {
  switch (mode) {
    case "RELATED_TOPIC":
      return "관련 주제";
    case "OPPOSITE_TOPIC":
      return "상반 주제";
    case "DIFFICULTY":
      return direction === "HARDER" ? "어려운 난이도" : "쉬운 난이도";
    case "LENGTH":
      return direction === "SHORTER" ? "축약" : "확장";
  }
}

/** 변형본 Passage 제목 — 모델 제안(title)이 있으면 우선, 없으면 "원제목 (라벨 변형)". */
export function defaultVariantTitle(
  sourceTitle: string,
  mode: WholePassageTransformMode,
  direction?: VariantDirection,
): string {
  const base = (sourceTitle || "지문").trim();
  return `${base} (${variantModeLabel(mode, direction)} 변형)`;
}

/** 변형본 식별 태그 — Passage.tags(JSON 배열)에 넣어 목록에서 구분·필터. */
export function variantTag(
  mode: WholePassageTransformMode,
  direction?: VariantDirection,
): string {
  return `변형:${variantModeLabel(mode, direction)}`;
}

export const transformRequestSchema = z.object({
  mode: z.enum(PASSAGE_TRANSFORM_MODES),
  /** 전체 지문 본문 (맥락 제공용 / 전체 변형의 원본). */
  passageText: z.string().min(20, "지문이 너무 짧습니다.").max(20_000),
  /** PARAPHRASE 전용 — 지문 안에서 드래그로 선택한 원문 조각. */
  selectedText: z.string().max(4_000).optional(),
  /**
   * "다시 생성" 시 직전 결과들. 모델이 같은 표현을 반복하지 않도록
   * 회피 목록으로 프롬프트에 주입한다.
   */
  avoidTexts: z.array(z.string().max(20_000)).max(5).optional(),
  /** PREPEND 전용 — 생성할 앞 문단의 문장 수 (1~5, 기본 3). */
  sentenceCount: z.number().int().min(1).max(5).optional(),
  /** DIFFICULTY / LENGTH 전용 — 변형 방향. */
  direction: z.enum(VARIANT_DIRECTIONS).optional(),
});

export type TransformRequest = z.infer<typeof transformRequestSchema>;

/** PARAPHRASE 모델 응답. */
export const paraphraseResultSchema = z.object({
  rewrittenText: z
    .string()
    .describe(
      "선택 구간을 대체할 재작성 영어 텍스트. 마크다운/따옴표 없이 본문 그대로.",
    ),
  changes: z
    .array(
      z.object({
        before: z.string().default(""),
        after: z.string().default(""),
      }),
    )
    .default([])
    .describe("바뀐 핵심 표현 쌍 목록 (원문 표현 → 새 표현)."),
  note: z
    .string()
    .default("")
    .describe(
      "어떻게 바꿨는지 한국어 한 문장 요약. 반드시 한국어. 예: \"핵심 동사·형용사를 동의어로 교체하고 수동태로 전환했습니다.\"",
    ),
});

export type ParaphraseResult = z.infer<typeof paraphraseResultSchema>;

/** PREPEND 모델 응답. */
export const prependResultSchema = z.object({
  paragraph: z
    .string()
    .describe(
      "지문 맨 앞에 붙을 새 영어 문단 (요청된 문장 수 엄수). 마크다운 없이 본문 그대로.",
    ),
  note: z
    .string()
    .default("")
    .describe(
      "새 문단이 지문과 어떻게 연결되는지 한국어 한 문장 설명. 반드시 한국어.",
    ),
});

export type PrependResult = z.infer<typeof prependResultSchema>;

/**
 * 지문 전체 변형 모델 응답 (RELATED_TOPIC / OPPOSITE_TOPIC / DIFFICULTY / LENGTH).
 *
 * Flash-Lite 안정성을 위해 필드를 최소화한다(3개). 한국어 설명은 `summary` 한
 * 필드로 합쳤다 — 여러 한국어 필드를 두면 lite 가 첫 필드에만 몰아넣고 나머지를
 * 비우거나 비정상 JSON 을 내는 사고가 실측에서 확인됐다.
 */
export const wholePassageResultSchema = z.object({
  passage: z
    .string()
    .describe(
      "The full new English passage. Same language as the source (English), with natural paragraphing. Plain text only — no markdown, no surrounding quotes, no title line.",
    ),
  title: z
    .string()
    .default("")
    .describe(
      "A short English title for the new passage (<= 8 words). e.g. \"The Instant-Success Fallacy\".",
    ),
  summary: z
    .string()
    .default("")
    .describe(
      "새 지문이 무엇인지/원본 대비 무엇이 달라졌는지 한국어 한 줄 요약. 반드시 한국어. 예: \"같은 학습심리 분야에서 소재를 '분산 학습'으로 바꾼 새 지문\".",
    ),
});

export type WholePassageResult = z.infer<typeof wholePassageResultSchema>;

/** API 응답 (성공). */
export interface TransformResponse {
  mode: PassageTransformMode;
  /** PARAPHRASE: 선택 구간 대체 텍스트 / PREPEND: 새 앞 문단 / 전체 변형: 새 지문 본문 전체. */
  text: string;
  changes: { before: string; after: string }[];
  note: string;
  /** 전체 변형 전용 — 새 지문 제목 제안 (변형본 저장 시 사용). */
  title?: string;
  /** 전체 변형 전용 — 새 지문 한 줄 요약 (한국어, 미리보기 표시용). */
  summary?: string;
}
