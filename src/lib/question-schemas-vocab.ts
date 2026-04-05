// ============================================================================
// 어휘 스키마 (3 types)
// ============================================================================

import { z } from "zod";

const optionSchema = z.object({ label: z.string(), text: z.string() });

const commonFields = {
  direction: z.string().describe("발문 (한국어)"),
  correctAnswer: z.string(),
  explanation: z.string().describe("정답 해설 (한국어, 상세)"),
  keyPoints: z.array(z.string()).describe("학습 포인트 3개 이상"),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
};

const mcWrongExplanations = {
  wrongOptionExplanations: z.record(z.string(), z.string()).describe("오답별 해설, key는 선지 label"),
};

// ── 문맥 속 의미 ──

export const contextMeaningSchema = z.object({
  ...commonFields,
  passageWithUnderline: z.string().describe("밑줄 친 단어가 포함된 지문. 밑줄 단어는 __단어__ 형태로 표시"),
  underlinedWord: z.string().describe("밑줄 친 단어"),
  options: z.array(optionSchema).length(5).describe("영어 동의어 선택지"),
  ...mcWrongExplanations,
});
export type ContextMeaningQuestion = z.infer<typeof contextMeaningSchema>;

// ── 동의어 ──

export const synonymSchema = z.object({
  ...commonFields,
  targetWord: z.string().describe("대상 단어"),
  contextSentence: z.string().describe("문맥 문장"),
  options: z.array(optionSchema).length(5).describe("영어 동의어 선택지"),
  ...mcWrongExplanations,
});
export type SynonymQuestion = z.infer<typeof synonymSchema>;

// ── 반의어 ──

export const antonymSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(A)~(E) 밑줄 어휘가 포함된 지문"),
  markedWords: z.array(z.object({
    label: z.string().describe("(A)~(E)"),
    word: z.string(),
    antonym: z.string(),
  })).length(5),
  options: z.array(optionSchema).length(5).describe("단어 - 반의어 쌍 선택지"),
  ...mcWrongExplanations,
});
export type AntonymQuestion = z.infer<typeof antonymSchema>;
