// ============================================================================
// AI 응답 전용 스키마 — 객관식 (MC)
// 지문 전체 복사 필드를 제거하고, surroundingText 등으로 대체.
// 서버가 원본 지문을 기반으로 최종 지문을 재구성함.
// ============================================================================

import { z } from "zod";

// Re-export unchanged schemas (지문 복사 없는 유형)
export {
  sentenceOrderSchema as aiSentenceOrderSchema,
  type SentenceOrderQuestion as AiSentenceOrderQuestion,
  topicMainIdeaSchema as aiTopicMainIdeaSchema,
  type TopicMainIdeaQuestion as AiTopicMainIdeaQuestion,
  titleSchema as aiTitleSchema,
  type TitleQuestion as AiTitleQuestion,
  contentMatchSchema as aiContentMatchSchema,
  type ContentMatchQuestion as AiContentMatchQuestion,
} from "./question-schemas-mc";

// ---------------------------------------------------------------------------
// Shared definitions
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  label: z.string().describe("선지 라벨 (①~⑤)"),
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
  wrongOptionExplanations: z.record(z.string(), z.string()).describe("오답별 해설, key는 선지 label"),
};

// ---------------------------------------------------------------------------
// 1. 빈칸 추론 (BLANK_INFERENCE)
// ---------------------------------------------------------------------------

export const aiBlankInferenceSchema = z.object({
  ...commonFields,
  originalExpression: z.string().describe("원문에서 빈칸으로 교체할 정확한 표현 (원문 그대로, 한 글자도 변경 금지)"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...mcWrongExplanations,
});
export type AiBlankInferenceQuestion = z.infer<typeof aiBlankInferenceSchema>;

// ---------------------------------------------------------------------------
// 2. 어법 판단 (GRAMMAR_ERROR)
// ---------------------------------------------------------------------------

export const aiGrammarErrorSchema = z.object({
  ...commonFields,
  markedExpressions: z.array(z.object({
    label: z.string().describe("(A)~(E) 라벨"),
    expression: z.string().describe("원문에서의 올바른 표현"),
    isError: z.boolean().describe("이 표현이 오류인지 여부"),
    correction: z.string().optional().describe("오류인 경우 올바른 표현"),
    errorExpression: z.string().describe("지문에 표시할 어법 오류 표현 (isError=true일 때 틀린 형태, isError=false일 때 원문 그대로)"),
    surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  })).length(5).describe("밑줄 표시할 5개 표현"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...mcWrongExplanations,
});
export type AiGrammarErrorQuestion = z.infer<typeof aiGrammarErrorSchema>;

// ---------------------------------------------------------------------------
// 3. 어휘 적절성 (VOCAB_CHOICE)
// ---------------------------------------------------------------------------

export const aiVocabChoiceSchema = z.object({
  ...commonFields,
  markedWords: z.array(z.object({
    label: z.string().describe("(a)~(e) 라벨"),
    originalWord: z.string().describe("원문의 올바른 단어"),
    isInappropriate: z.boolean().describe("이 위치에 부적절한 단어를 넣을지 여부"),
    betterWord: z.string().optional().describe("부적절한 경우 적절한 단어 (= originalWord)"),
    substituteWord: z.string().describe("지문에 표시할 단어 (isInappropriate=true일 때 부적절한 단어, isInappropriate=false일 때 원문 그대로)"),
    surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  })).length(5).describe("밑줄 표시할 5개 어휘"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...mcWrongExplanations,
});
export type AiVocabChoiceQuestion = z.infer<typeof aiVocabChoiceSchema>;

// ---------------------------------------------------------------------------
// 4. 문장 삽입 (SENTENCE_INSERT)
// ---------------------------------------------------------------------------

export const aiSentenceInsertSchema = z.object({
  ...commonFields,
  givenSentence: z.string().describe("삽입할 문장"),
  markerAfterSentenceIndices: z.array(z.number()).length(5).describe("①~⑤ 마커를 배치할 위치 (0-based: 'N번째 문장 뒤에 마커 삽입'). 5개 인덱스 배열"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...mcWrongExplanations,
});
export type AiSentenceInsertQuestion = z.infer<typeof aiSentenceInsertSchema>;

// ---------------------------------------------------------------------------
// 5. 무관한 문장 (IRRELEVANT)
// ---------------------------------------------------------------------------

export const aiIrrelevantSchema = z.object({
  ...commonFields,
  sentences: z.array(z.string()).length(5).describe("표시할 5개 문장 (①~⑤). 이 중 하나는 AI가 생성한 무관한 문장"),
  irrelevantIndex: z.number().describe("무관한 문장의 인덱스 (0~4)"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...mcWrongExplanations,
});
export type AiIrrelevantQuestion = z.infer<typeof aiIrrelevantSchema>;

// ---------------------------------------------------------------------------
// 6. 지칭 추론 (REFERENCE)
// ---------------------------------------------------------------------------

export const aiReferenceSchema = z.object({
  ...commonFields,
  underlinedPronoun: z.string().describe("밑줄 칠 대명사"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...mcWrongExplanations,
});
export type AiReferenceQuestion = z.infer<typeof aiReferenceSchema>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

import {
  sentenceOrderSchema,
  topicMainIdeaSchema,
  titleSchema,
  contentMatchSchema,
} from "./question-schemas-mc";

export const AI_MC_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  BLANK_INFERENCE: aiBlankInferenceSchema,
  GRAMMAR_ERROR: aiGrammarErrorSchema,
  VOCAB_CHOICE: aiVocabChoiceSchema,
  SENTENCE_ORDER: sentenceOrderSchema,
  SENTENCE_INSERT: aiSentenceInsertSchema,
  TOPIC_MAIN_IDEA: topicMainIdeaSchema,
  TITLE: titleSchema,
  REFERENCE: aiReferenceSchema,
  CONTENT_MATCH: contentMatchSchema,
  IRRELEVANT: aiIrrelevantSchema,
};

// ---------------------------------------------------------------------------
// Combined registry (MC + Vocab)
// ---------------------------------------------------------------------------

import { AI_VOCAB_QUESTION_SCHEMAS } from "./question-ai-schemas-vocab";
import {
  conditionalWritingSchema,
  sentenceTransformSchema,
  fillBlankKeySchema,
  summaryCompleteSchema,
  wordOrderSchema,
  grammarCorrectionSchema,
} from "./question-schemas-essay";

const AI_ESSAY_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  CONDITIONAL_WRITING: conditionalWritingSchema,
  SENTENCE_TRANSFORM: sentenceTransformSchema,
  FILL_BLANK_KEY: fillBlankKeySchema,
  SUMMARY_COMPLETE: summaryCompleteSchema,
  WORD_ORDER: wordOrderSchema,
  GRAMMAR_CORRECTION: grammarCorrectionSchema,
};

export const AI_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  ...AI_MC_QUESTION_SCHEMAS,
  ...AI_VOCAB_QUESTION_SCHEMAS,
  ...AI_ESSAY_QUESTION_SCHEMAS,
};

export function getAiResponseSchema(typeId: string) {
  const schema = AI_QUESTION_SCHEMAS[typeId];
  if (!schema) throw new Error(`Unknown AI question type: ${typeId}`);
  return z.object({ questions: z.array(schema) });
}
