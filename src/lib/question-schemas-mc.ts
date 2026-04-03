// ============================================================================
// 수능/모의고사 객관식 스키마 (10 types)
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

// ── 빈칸 추론 ──

export const blankInferenceSchema = z.object({
  ...commonFields,
  passageWithBlank: z.string().describe("빈칸(_____) 이 삽입된 지문 전체"),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type BlankInferenceQuestion = z.infer<typeof blankInferenceSchema>;

// ── 어법 판단 ──

export const grammarErrorSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(A)~(E) 밑줄 표시가 포함된 지문. 밑줄 부분은 __(A) expression__ 형태로 표시"),
  markedExpressions: z.array(z.object({
    label: z.string().describe("(A)~(E)"),
    expression: z.string().describe("해당 밑줄 표현"),
    isError: z.boolean().describe("이 표현이 오류인지"),
    correction: z.string().optional().describe("오류인 경우 올바른 표현"),
  })).length(5),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type GrammarErrorQuestion = z.infer<typeof grammarErrorSchema>;

// ── 어휘 적절성 ──

export const vocabChoiceSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(a)~(e) 밑줄 어휘가 포함된 지문. 밑줄 부분은 __(a) word__ 형태로 표시"),
  markedWords: z.array(z.object({
    label: z.string().describe("(a)~(e)"),
    word: z.string(),
    isInappropriate: z.boolean(),
    betterWord: z.string().optional().describe("부적절한 경우 적절한 단어"),
  })).length(5),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type VocabChoiceQuestion = z.infer<typeof vocabChoiceSchema>;

// ── 글의 순서 ──

export const sentenceOrderSchema = z.object({
  ...commonFields,
  givenSentence: z.string().describe("주어진 첫 문장"),
  paragraphs: z.array(z.object({
    label: z.string().describe("(A), (B), (C)"),
    text: z.string(),
  })).length(3),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type SentenceOrderQuestion = z.infer<typeof sentenceOrderSchema>;

// ── 문장 삽입 ──

export const sentenceInsertSchema = z.object({
  ...commonFields,
  givenSentence: z.string().describe("삽입할 문장"),
  passageWithMarkers: z.string().describe("①~⑤ 위치 마커가 포함된 지문"),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type SentenceInsertQuestion = z.infer<typeof sentenceInsertSchema>;

// ── 주제/요지 ──

export const topicMainIdeaSchema = z.object({
  ...commonFields,
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...mcWrongExplanations,
});
export type TopicMainIdeaQuestion = z.infer<typeof topicMainIdeaSchema>;

// ── 제목 추론 ──

export const titleSchema = z.object({
  ...commonFields,
  options: z.array(optionSchema).length(5).describe("영어 제목 선택지"),
  ...mcWrongExplanations,
});
export type TitleQuestion = z.infer<typeof titleSchema>;

// ── 지칭 추론 ──

export const referenceSchema = z.object({
  ...commonFields,
  passageWithUnderline: z.string().describe("밑줄 친 대명사가 포함된 지문. 밑줄 대명사는 __단어__ 형태로 표시"),
  underlinedPronoun: z.string().describe("밑줄 친 대명사"),
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...mcWrongExplanations,
});
export type ReferenceQuestion = z.infer<typeof referenceSchema>;

// ── 내용 일치 ──

export const contentMatchSchema = z.object({
  ...commonFields,
  matchType: z.enum(["일치", "불일치"]).describe("일치 또는 불일치 문제"),
  options: z.array(optionSchema).length(5).describe("한국어 진술문 선택지"),
  ...mcWrongExplanations,
});
export type ContentMatchQuestion = z.infer<typeof contentMatchSchema>;

// ── 무관한 문장 ──

export const irrelevantSchema = z.object({
  ...commonFields,
  passageWithNumbers: z.string().describe("①~⑤ 번호가 매겨진 문장들이 포함된 지문"),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type IrrelevantQuestion = z.infer<typeof irrelevantSchema>;
