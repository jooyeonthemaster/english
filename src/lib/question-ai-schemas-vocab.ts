// ============================================================================
// AI 응답 전용 스키마 — 어휘 (Vocab)
// 지문 전체 복사 필드를 제거하고, surroundingText 등으로 대체.
// 서버가 원본 지문을 기반으로 최종 지문을 재구성함.
// ============================================================================

import { z } from "zod";
import { aiWrongOptionExplanationsSchema } from "./question-wrong-option-explanations";

// Re-export unchanged schema (지문 복사 없는 유형)
import { synonymSchema } from "./question-schemas-vocab";

export type { SynonymQuestion as AiSynonymQuestion } from "./question-schemas-vocab";

// ---------------------------------------------------------------------------
// Shared definitions
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  label: z.string().describe("선지 라벨"),
  text: z.string().describe("선지 내용"),
});

const commonFields = {
  direction: z.string().describe("발문 (한국어)"),
  correctAnswer: z.string().describe("정답 라벨"),
  explanation: z.string().describe("정답 해설 (한국어, 상세)"),
  keyPoints: z.array(z.string()).describe("학습 포인트 3개 이상"),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).describe("난이도"),
};

const mcWrongExplanations = {
  wrongOptionExplanations: aiWrongOptionExplanationsSchema,
};

export const aiSynonymSchema = synonymSchema.extend(mcWrongExplanations);

// ---------------------------------------------------------------------------
// 1. 문맥 속 의미 (CONTEXT_MEANING)
// ---------------------------------------------------------------------------

export const aiContextMeaningSchema = z.object({
  ...commonFields,
  underlinedWord: z.string().describe("밑줄 칠 단어"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  options: z.array(optionSchema).length(5).describe("영어 동의어 선택지. text에는 뜻풀이/괄호 설명 없이 단어 또는 짧은 구만 작성"),
  ...mcWrongExplanations,
});
export type AiContextMeaningQuestion = z.infer<typeof aiContextMeaningSchema>;

// ---------------------------------------------------------------------------
// 2. 반의어 (ANTONYM)
// ---------------------------------------------------------------------------

export const aiAntonymSchema = z.object({
  ...commonFields,
  markedWords: z.array(z.object({
    label: z.string().describe("(A)~(E) 라벨"),
    word: z.string().describe("원문에 실제로 존재하는 대상 단어"),
    antonym: z.string().describe("선지에 표시할 짝 단어. isIncorrectPair=false이면 정확한 문맥상 반의어, true이면 반의어가 아닌 오답 짝"),
    isIncorrectPair: z.boolean().describe("이 단어-짝 단어 쌍이 문맥상 반의어 관계로 잘못 짝지어진 정답 쌍인지 여부. 정확히 하나만 true"),
    correctAntonym: z.string().optional().describe("isIncorrectPair=true인 경우의 실제 문맥상 정확한 반의어"),
    surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  })).length(5).describe("밑줄 표시할 5개 어휘"),
  options: z.array(optionSchema).length(5).describe("단어 - 짝 단어 쌍 선택지. text에는 '(A) word - pair' 형식의 영어 단어쌍만 작성하고 뜻풀이/괄호 설명 금지"),
  ...mcWrongExplanations,
});
export type AiAntonymQuestion = z.infer<typeof aiAntonymSchema>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const AI_VOCAB_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  CONTEXT_MEANING: aiContextMeaningSchema,
  SYNONYM: aiSynonymSchema,
  ANTONYM: aiAntonymSchema,
};
