// ============================================================================
// 내신 서술형 스키마 (6 types)
// ============================================================================

import { z } from "zod";

const commonFields = {
  direction: z.string().describe("발문 (한국어)"),
  correctAnswer: z.string(),
  explanation: z.string().describe("정답 해설 (한국어, 상세)"),
  keyPoints: z.array(z.string()).describe("학습 포인트 3개 이상"),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
};

// ── 조건부 영작 ──

export const conditionalWritingSchema = z.object({
  ...commonFields,
  referenceSentence: z.string().describe("학생이 영작해야 할 한국어 문장 (지문의 핵심 문장을 한국어로 번역한 것)"),
  conditions: z.array(z.string()).describe("작성 조건 목록 (한국어)"),
  modelAnswer: z.string().describe("모범 답안 (영어)"),
  scoringCriteria: z.array(z.string()).optional().describe("채점 기준"),
});
export type ConditionalWritingQuestion = z.infer<typeof conditionalWritingSchema>;

// ── 문장 전환 ──

export const sentenceTransformSchema = z.object({
  ...commonFields,
  originalSentence: z.string().describe("전환 대상 원래 문장"),
  conditions: z.array(z.string()).describe("전환 조건 목록 (한국어)"),
  modelAnswer: z.string().describe("모범 답안 (영어)"),
  scoringCriteria: z.array(z.string()).optional().describe("채점 기준"),
});
export type SentenceTransformQuestion = z.infer<typeof sentenceTransformSchema>;

// ── 핵심 표현 빈칸 ──

export const fillBlankKeySchema = z.object({
  ...commonFields,
  sentenceWithBlank: z.string().describe("빈칸이 포함된 문장 또는 지문"),
  answer: z.string().describe("빈칸에 들어갈 핵심 표현"),
});
export type FillBlankKeyQuestion = z.infer<typeof fillBlankKeySchema>;

// ── 요약문 완성 ──

export const summaryCompleteSchema = z.object({
  ...commonFields,
  summaryWithBlanks: z.string().describe("빈칸이 포함된 요약문"),
  blanks: z.array(z.object({
    label: z.string().describe("(A), (B) 등"),
    answer: z.string(),
  })),
});
export type SummaryCompleteQuestion = z.infer<typeof summaryCompleteSchema>;

// ── 배열 영작 ──

export const wordOrderSchema = z.object({
  ...commonFields,
  scrambledWords: z.array(z.string()).describe("뒤섞인 단어/구 목록"),
  contextHint: z.string().optional().describe("문맥 힌트 (한국어)"),
  modelAnswer: z.string().describe("올바른 완성 문장"),
});
export type WordOrderQuestion = z.infer<typeof wordOrderSchema>;

// ── 문법 오류 수정 ──

export const grammarCorrectionSchema = z.object({
  ...commonFields,
  sentenceWithError: z.string().describe("오류가 포함된 문장"),
  errorPart: z.string().describe("오류 부분"),
  correctedPart: z.string().describe("올바르게 수정된 부분"),
  correctedSentence: z.string().describe("전체 수정된 문장"),
});
export type GrammarCorrectionQuestion = z.infer<typeof grammarCorrectionSchema>;
