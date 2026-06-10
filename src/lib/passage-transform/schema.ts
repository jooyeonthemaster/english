import { z } from "zod";

// ============================================================================
// AI 지문 변형 (passage transform) — shared schemas/types
//
// Two transform modes, both powered by the low-latency Flash-Lite model:
//  - PARAPHRASE: 드래그로 선택한 문장(들)을 뜻은 동일하게, 표현만 바꿔 재작성
//  - PREPEND:    지문 전체 맥락과 자연스럽게 이어지는 "앞 문단"을 새로 생성
// ============================================================================

export const PASSAGE_TRANSFORM_MODES = ["PARAPHRASE", "PREPEND"] as const;
export type PassageTransformMode = (typeof PASSAGE_TRANSFORM_MODES)[number];

export const transformRequestSchema = z.object({
  mode: z.enum(PASSAGE_TRANSFORM_MODES),
  /** 전체 지문 본문 (맥락 제공용). */
  passageText: z.string().min(20, "지문이 너무 짧습니다.").max(20_000),
  /** PARAPHRASE 전용 — 지문 안에서 드래그로 선택한 원문 조각. */
  selectedText: z.string().max(4_000).optional(),
  /**
   * "다시 생성" 시 직전 결과들. 모델이 같은 표현을 반복하지 않도록
   * 회피 목록으로 프롬프트에 주입한다.
   */
  avoidTexts: z.array(z.string().max(4_000)).max(5).optional(),
  /** PREPEND 전용 — 생성할 앞 문단의 문장 수 (1~5, 기본 3). */
  sentenceCount: z.number().int().min(1).max(5).optional(),
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

/** API 응답 (성공). */
export interface TransformResponse {
  mode: PassageTransformMode;
  /** PARAPHRASE: 선택 구간 대체 텍스트 / PREPEND: 새 앞 문단. */
  text: string;
  changes: { before: string; after: string }[];
  note: string;
}
