// ============================================================================
// AI 응답 전용 스키마 — 객관식 (MC)
// 지문 전체 복사 필드를 제거하고, surroundingText 등으로 대체.
// 서버가 원본 지문을 기반으로 최종 지문을 재구성함.
// ============================================================================

import { z } from "zod";
import { aiWrongOptionExplanationsSchema } from "./question-wrong-option-explanations";

// AI variants for schemas that do not need passage reconstruction.
import {
  contentMatchSchema,
  sentenceOrderSchema,
  titleSchema,
  topicMainIdeaSchema,
} from "./question-schemas-mc";

export type {
  ContentMatchQuestion as AiContentMatchQuestion,
  SentenceOrderQuestion as AiSentenceOrderQuestion,
  TitleQuestion as AiTitleQuestion,
  TopicMainIdeaQuestion as AiTopicMainIdeaQuestion,
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
  wrongOptionExplanations: aiWrongOptionExplanationsSchema,
};

export const aiSentenceOrderSchema = sentenceOrderSchema.extend(mcWrongExplanations);
export const aiTopicMainIdeaSchema = topicMainIdeaSchema.extend(mcWrongExplanations);
export const aiTitleSchema = titleSchema.extend(mcWrongExplanations);
export const aiContentMatchSchema = contentMatchSchema.extend(mcWrongExplanations);

// ---------------------------------------------------------------------------
// 1. 빈칸 추론 (BLANK_INFERENCE)
// ---------------------------------------------------------------------------

export const aiBlankInferenceSchema = z.object({
  ...commonFields,
  originalExpression: z.string().describe("원문에서 빈칸으로 교체할 정확한 표현 (원문 그대로, 한 글자도 변경 금지)"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  blankAnswerMode: z.enum(["SOURCE_EXACT", "DOUBLE_NEGATIVE"]).optional().describe("빈칸 정답 구성 방식"),
  answerLogic: z.string().optional().describe("부정-부정 빈칸 등 특수 정답 논리 설명"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...mcWrongExplanations,
});
export type AiBlankInferenceQuestion = z.infer<typeof aiBlankInferenceSchema>;

// ---------------------------------------------------------------------------
// 2. 어법 판단 (GRAMMAR_ERROR)
// ---------------------------------------------------------------------------

// GRAMMAR_ERROR 한정: 다른 유형에 영향 없도록 commonFields/mcWrongExplanations를 인라인 오버라이드
// - correctAnswer: enum 강제 (괄호 포맷 보장)
// - markedExpressions[i].pointCode: 어법 출제 포인트 코드 (a~m), 5개 unique 강제 가이드
// - wrongOptionExplanations: array 형태로 변경 (label·expression·pointCode 일치 강제), 후처리에서 Record로 변환
export const aiGrammarErrorSchema = z.object({
  ...commonFields,
  correctAnswer: z
    .enum(["(A)", "(B)", "(C)", "(D)", "(E)"])
    .describe("정답 label. 반드시 괄호 포함 형식 '(A)' '(B)' '(C)' '(D)' '(E)' 중 하나"),
  markedExpressions: z.array(z.object({
    label: z.string().describe("(A)~(E) 라벨"),
    expression: z.string().describe("원문에서의 올바른 표현"),
    isError: z.boolean().describe("이 표현이 오류인지 여부"),
    correction: z.string().optional().describe("오류인 경우 올바른 표현"),
    errorExpression: z.string().describe("지문에 표시할 어법 오류 표현 (isError=true일 때 틀린 형태, isError=false일 때 원문 그대로)"),
    surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
    pointCode: z
      .enum(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"])
      .describe(
        "이 위치의 어법 출제 포인트 코드. 5개 markedExpression의 pointCode는 서로 달라야 함. (a)정·준동사 (b)관계사 (c)분사능수동 (d)수일치 (e)능수동태 (f)형부자리 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 (k)to-v/v-ing (l)전치사vs.접속사 (m)비교구문",
      ),
  })).length(5).describe("밑줄 표시할 5개 표현 (pointCode 5개 모두 unique)"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  wrongOptionExplanations: z
    .array(z.object({
      label: z.string().describe("정답이 아닌 4개 선지 label 중 하나 ('(A)'~'(E)' 형식)"),
      expression: z
        .string()
        .describe(
          "이 label의 markedExpression.expression 값과 완전히 동일해야 함. 다른 단어를 쓰면 안 됨.",
        ),
      pointCode: z
        .enum(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"])
        .describe(
          "이 label의 markedExpression.pointCode 값과 동일해야 함.",
        ),
      explanation: z
        .string()
        .describe(
          "이 위치의 expression이 어법상 왜 맞는지 한국어 1~2문장 해설. 반드시 markedExpression.expression을 인용하여 설명할 것.",
        ),
    }))
    .length(4)
    .describe(
      "정답을 제외한 4개 오답 위치 각각에 대한 해설 (배열 길이 정확히 4, label·expression·pointCode가 markedExpressions와 일치). 후처리에서 Record<label, explanation> 형태로 변환됨.",
    ),
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

export const AI_MC_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  BLANK_INFERENCE: aiBlankInferenceSchema,
  GRAMMAR_ERROR: aiGrammarErrorSchema,
  VOCAB_CHOICE: aiVocabChoiceSchema,
  SENTENCE_ORDER: aiSentenceOrderSchema,
  SENTENCE_INSERT: aiSentenceInsertSchema,
  TOPIC_MAIN_IDEA: aiTopicMainIdeaSchema,
  TITLE: aiTitleSchema,
  REFERENCE: aiReferenceSchema,
  CONTENT_MATCH: aiContentMatchSchema,
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
