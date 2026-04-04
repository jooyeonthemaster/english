// ============================================================================
// 듀오링고 스타일 학습 문제 — Zod 스키마 + 타입 메타데이터
// ============================================================================
// 23종 드릴 문제 타입, 4카테고리
// 기존 question-schemas.ts(시험용)와 완전 별도
// 프롬프트 빌더는 ./learning-question-prompts.ts 에 분리
// ============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. 타입 메타데이터
// ---------------------------------------------------------------------------

export type InteractionType =
  | "FOUR_CHOICE"
  | "THREE_CHOICE"
  | "BINARY_CHOICE"
  | "WORD_BANK"
  | "MATCHING"
  | "TEXT_INPUT"
  | "TAP_TEXT";

export interface LearningQuestionTypeMeta {
  id: string;
  category: string;
  label: string;
  interactionType: InteractionType;
  description: string;
}

export const LEARNING_QUESTION_TYPES: Record<string, LearningQuestionTypeMeta> = {
  // VOCAB (9종)
  WORD_MEANING:         { id: "WORD_MEANING",         category: "VOCAB",          label: "영→한 뜻",     interactionType: "FOUR_CHOICE",   description: "영어 단어 + 문맥 문장 → 한국어 뜻 4지선다" },
  WORD_MEANING_REVERSE: { id: "WORD_MEANING_REVERSE", category: "VOCAB",          label: "한→영 뜻",     interactionType: "FOUR_CHOICE",   description: "한국어 뜻 → 영어 단어 4지선다" },
  WORD_FILL:            { id: "WORD_FILL",            category: "VOCAB",          label: "빈칸 채우기",   interactionType: "THREE_CHOICE",  description: "지문 문장에서 단어 빈칸 → 3지선다" },
  WORD_MATCH:           { id: "WORD_MATCH",           category: "VOCAB",          label: "매칭",         interactionType: "MATCHING",      description: "영어-한국어 5쌍 매칭" },
  WORD_SPELL:           { id: "WORD_SPELL",           category: "VOCAB",          label: "스펠링",       interactionType: "TEXT_INPUT",    description: "한국어 뜻 + 힌트 → 영단어 직접 입력" },
  VOCAB_SYNONYM:        { id: "VOCAB_SYNONYM",        category: "VOCAB",          label: "유의어/반의어", interactionType: "THREE_CHOICE",  description: "단어의 유의어 또는 반의어 3지선다" },
  VOCAB_DEFINITION:     { id: "VOCAB_DEFINITION",     category: "VOCAB",          label: "영영풀이",     interactionType: "FOUR_CHOICE",   description: "영어 정의 → 단어 4지선다" },
  VOCAB_COLLOCATION:    { id: "VOCAB_COLLOCATION",    category: "VOCAB",          label: "연어",         interactionType: "THREE_CHOICE",  description: "연어 빈칸 → 3지선다" },
  VOCAB_CONFUSABLE:     { id: "VOCAB_CONFUSABLE",     category: "VOCAB",          label: "혼동 단어",    interactionType: "THREE_CHOICE",  description: "혼동 단어 중 문맥에 맞는 것 3지선다" },
  // INTERPRETATION (5종)
  SENTENCE_INTERPRET:   { id: "SENTENCE_INTERPRET",   category: "INTERPRETATION", label: "해석 고르기",   interactionType: "FOUR_CHOICE",   description: "영어 문장 → 한국어 해석 4지선다" },
  SENTENCE_COMPLETE:    { id: "SENTENCE_COMPLETE",    category: "INTERPRETATION", label: "영문 고르기",   interactionType: "FOUR_CHOICE",   description: "한국어 해석 → 영어 문장 4지선다" },
  WORD_ARRANGE:         { id: "WORD_ARRANGE",         category: "INTERPRETATION", label: "단어 배열",     interactionType: "WORD_BANK",     description: "한국어 뜻 → 영어 단어/구 탭 배열" },
  KEY_EXPRESSION:       { id: "KEY_EXPRESSION",       category: "INTERPRETATION", label: "핵심 표현",     interactionType: "THREE_CHOICE",  description: "지문 핵심 구문 빈칸 → 3지선다" },
  SENT_CHUNK_ORDER:     { id: "SENT_CHUNK_ORDER",     category: "INTERPRETATION", label: "끊어읽기",     interactionType: "WORD_BANK",     description: "끊어읽기 청크 순서 배열" },
  // GRAMMAR (5종)
  GRAMMAR_SELECT:       { id: "GRAMMAR_SELECT",       category: "GRAMMAR",        label: "문법 고르기",   interactionType: "THREE_CHOICE",  description: "문법 빈칸 → 올바른 형태 3지선다" },
  ERROR_FIND:           { id: "ERROR_FIND",           category: "GRAMMAR",        label: "오류 찾기",     interactionType: "TAP_TEXT",      description: "문장에서 문법 오류 단어 탭" },
  ERROR_CORRECT:        { id: "ERROR_CORRECT",        category: "GRAMMAR",        label: "오류 수정",     interactionType: "TEXT_INPUT",    description: "오류 부분 → 올바른 형태 입력" },
  GRAM_TRANSFORM:       { id: "GRAM_TRANSFORM",       category: "GRAMMAR",        label: "문장 전환",     interactionType: "TEXT_INPUT",    description: "문장을 다른 형태로 전환 입력" },
  GRAM_BINARY:          { id: "GRAM_BINARY",          category: "GRAMMAR",        label: "문법 O/X",     interactionType: "BINARY_CHOICE", description: "문장의 문법 정오 판단" },
  // COMPREHENSION (4종)
  TRUE_FALSE:           { id: "TRUE_FALSE",           category: "COMPREHENSION",  label: "O/X",          interactionType: "BINARY_CHOICE", description: "지문 내용 진술 → 참/거짓" },
  CONTENT_QUESTION:     { id: "CONTENT_QUESTION",     category: "COMPREHENSION",  label: "내용 이해",     interactionType: "FOUR_CHOICE",   description: "내용 이해 질문 → 4지선다" },
  PASSAGE_FILL:         { id: "PASSAGE_FILL",         category: "COMPREHENSION",  label: "지문 빈칸",     interactionType: "THREE_CHOICE",  description: "지문 핵심 구문 빈칸 → 3지선다" },
  CONNECTOR_FILL:       { id: "CONNECTOR_FILL",       category: "COMPREHENSION",  label: "연결어",       interactionType: "THREE_CHOICE",  description: "연결어 빈칸 → 3지선다" },
};

// ---------------------------------------------------------------------------
// 2. 개별 문제 Zod 스키마
// ---------------------------------------------------------------------------

const optionSchema = z.object({ label: z.string(), text: z.string() });

// ── VOCAB ─────────────────────────────────────────────────

export const wordMeaningItemSchema = z.object({
  word: z.string(),
  contextSentence: z.string().describe("해당 단어 포함 문장 1개만 (지문 전체 X)"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const wordMeaningReverseItemSchema = z.object({
  koreanMeaning: z.string(),
  contextSentence: z.string().describe("해당 단어 포함 문장 1개만"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const wordFillItemSchema = z.object({
  sentence: z.string().describe("빈칸(_____)이 포함된 문장 1개"),
  blankWord: z.string(),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const wordMatchItemSchema = z.object({
  pairs: z.array(z.object({ en: z.string(), ko: z.string() })),
  explanation: z.string(),
});

export const wordSpellItemSchema = z.object({
  koreanMeaning: z.string(),
  contextSentence: z.string().optional().describe("해당 단어 포함 문장 1개 (원문 그대로)"),
  hint: z.string().describe("첫 1~2글자 힌트"),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const vocabSynonymItemSchema = z.object({
  word: z.string(),
  contextSentence: z.string().describe("해당 단어 포함 문장 1개만"),
  targetRelation: z.enum(["synonym", "antonym"]),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const vocabDefinitionItemSchema = z.object({
  englishDefinition: z.string(),
  contextSentence: z.string().describe("해당 단어 포함 문장 1개만"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const vocabCollocationItemSchema = z.object({
  sentence: z.string().describe("빈칸(_____)이 포함된 연어 문장"),
  collocation: z.string().describe("전체 연어 표현 (예: make a decision)"),
  blankPart: z.string().describe("빈칸에 들어갈 부분"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const vocabConfusableItemSchema = z.object({
  sentence: z.string().describe("빈칸(_____)이 포함된 문장 1개"),
  confusablePair: z.array(z.string()).describe("혼동 단어 쌍 (예: [affect, effect])"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

// ── INTERPRETATION ────────────────────────────────────────

export const sentenceInterpretItemSchema = z.object({
  englishSentence: z.string().describe("지문 문장 1개"),
  sentenceIndex: z.number(),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const sentenceCompleteItemSchema = z.object({
  koreanSentence: z.string(),
  sentenceIndex: z.number(),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const wordArrangeItemSchema = z.object({
  koreanSentence: z.string(),
  correctOrder: z.array(z.string()).describe("올바른 순서의 영어 단어/구 배열 (의미 단위 3~8조각)"),
  distractorWords: z.array(z.string()).describe("함정 단어 (최대 3개)"),
  explanation: z.string(),
});

export const keyExpressionItemSchema = z.object({
  sentence: z.string().describe("빈칸(_____)이 포함된 문장 1개"),
  blankExpression: z.string(),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const sentChunkOrderItemSchema = z.object({
  chunks: z.array(z.string()).describe("섞인 끊어읽기 청크 배열"),
  correctOrder: z.array(z.number()).describe("올바른 순서 인덱스 배열"),
  koreanHint: z.string().describe("한국어 해석 힌트"),
  explanation: z.string(),
});

// ── GRAMMAR ───────────────────────────────────────────────

export const grammarSelectItemSchema = z.object({
  sentence: z.string().describe("빈칸(_____)이 포함된 문장 1개"),
  grammarPoint: z.string().describe("문법 포인트명"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const errorFindItemSchema = z.object({
  sentence: z.string().describe("오류 포함 문장 1개"),
  words: z.array(z.string()).describe("문장을 단어별로 분리한 배열"),
  errorWord: z.string(),
  correction: z.string(),
  grammarPoint: z.string(),
  explanation: z.string(),
});

export const errorCorrectItemSchema = z.object({
  sentence: z.string().describe("오류 포함 문장 1개"),
  errorPart: z.string().describe("밑줄 칠 오류 부분"),
  correctAnswer: z.string(),
  grammarPoint: z.string(),
  explanation: z.string(),
});

export const gramTransformItemSchema = z.object({
  originalSentence: z.string().describe("원본 문장 1개"),
  instruction: z.string().describe("전환 지시 (예: '수동태로 바꾸시오')"),
  correctAnswer: z.string(),
  grammarPoint: z.string(),
  explanation: z.string(),
});

export const gramBinaryItemSchema = z.object({
  sentence: z.string().describe("문법 정오 판단 대상 문장 1개"),
  isCorrect: z.boolean(),
  errorExplanation: z.string().describe("틀린 경우 오류 설명, 맞는 경우 빈 문자열"),
  grammarPoint: z.string(),
  explanation: z.string(),
});

// ── COMPREHENSION ─────────────────────────────────────────

export const trueFalseItemSchema = z.object({
  statement: z.string().describe("지문 내용에 대한 한국어 진술문"),
  contextExcerpt: z.string().describe("관련 지문 1~2문장 발췌 (영어 원문)"),
  isTrue: z.boolean(),
  explanation: z.string(),
});

export const contentQuestionItemSchema = z.object({
  question: z.string(),
  contextExcerpt: z.string().describe("관련 지문 발췌 1~2문장"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const passageFillItemSchema = z.object({
  excerpt: z.string().describe("빈칸(_____)이 포함된 지문 1~2문장"),
  blankPhrase: z.string(),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const connectorFillItemSchema = z.object({
  sentenceBefore: z.string().describe("연결어 앞 문장"),
  sentenceAfter: z.string().describe("연결어 뒤 문장"),
  options: z.array(optionSchema),
  correctAnswer: z.string(),
  explanation: z.string(),
});

// ---------------------------------------------------------------------------
// 3. 카테고리별 응답 스키마 (generateObject용)
// ---------------------------------------------------------------------------

export const vocabResponseSchema = z.object({
  WORD_MEANING: z.array(wordMeaningItemSchema),
  WORD_MEANING_REVERSE: z.array(wordMeaningReverseItemSchema),
  WORD_FILL: z.array(wordFillItemSchema),
  WORD_MATCH: z.array(wordMatchItemSchema),
  WORD_SPELL: z.array(wordSpellItemSchema),
  VOCAB_SYNONYM: z.array(vocabSynonymItemSchema),
  VOCAB_DEFINITION: z.array(vocabDefinitionItemSchema),
  VOCAB_COLLOCATION: z.array(vocabCollocationItemSchema),
  VOCAB_CONFUSABLE: z.array(vocabConfusableItemSchema),
});

export const interpretationResponseSchema = z.object({
  SENTENCE_INTERPRET: z.array(sentenceInterpretItemSchema),
  SENTENCE_COMPLETE: z.array(sentenceCompleteItemSchema),
  WORD_ARRANGE: z.array(wordArrangeItemSchema),
  KEY_EXPRESSION: z.array(keyExpressionItemSchema),
  SENT_CHUNK_ORDER: z.array(sentChunkOrderItemSchema),
});

export const grammarResponseSchema = z.object({
  GRAMMAR_SELECT: z.array(grammarSelectItemSchema),
  ERROR_FIND: z.array(errorFindItemSchema),
  ERROR_CORRECT: z.array(errorCorrectItemSchema),
  GRAM_TRANSFORM: z.array(gramTransformItemSchema),
  GRAM_BINARY: z.array(gramBinaryItemSchema),
});

export const comprehensionResponseSchema = z.object({
  TRUE_FALSE: z.array(trueFalseItemSchema),
  CONTENT_QUESTION: z.array(contentQuestionItemSchema),
  PASSAGE_FILL: z.array(passageFillItemSchema),
  CONNECTOR_FILL: z.array(connectorFillItemSchema),
});

export const CATEGORY_RESPONSE_SCHEMAS: Record<string, z.ZodType> = {
  VOCAB: vocabResponseSchema,
  INTERPRETATION: interpretationResponseSchema,
  GRAMMAR: grammarResponseSchema,
  COMPREHENSION: comprehensionResponseSchema,
};

// ---------------------------------------------------------------------------
// 4. subType별 개별 스키마 매핑 (동적 스키마 빌드용)
// ---------------------------------------------------------------------------

export const SUBTYPE_ITEM_SCHEMAS: Record<string, z.ZodType> = {
  WORD_MEANING: wordMeaningItemSchema,
  WORD_MEANING_REVERSE: wordMeaningReverseItemSchema,
  WORD_FILL: wordFillItemSchema,
  WORD_MATCH: wordMatchItemSchema,
  WORD_SPELL: wordSpellItemSchema,
  VOCAB_SYNONYM: vocabSynonymItemSchema,
  VOCAB_DEFINITION: vocabDefinitionItemSchema,
  VOCAB_COLLOCATION: vocabCollocationItemSchema,
  VOCAB_CONFUSABLE: vocabConfusableItemSchema,
  SENTENCE_INTERPRET: sentenceInterpretItemSchema,
  SENTENCE_COMPLETE: sentenceCompleteItemSchema,
  WORD_ARRANGE: wordArrangeItemSchema,
  KEY_EXPRESSION: keyExpressionItemSchema,
  SENT_CHUNK_ORDER: sentChunkOrderItemSchema,
  GRAMMAR_SELECT: grammarSelectItemSchema,
  ERROR_FIND: errorFindItemSchema,
  ERROR_CORRECT: errorCorrectItemSchema,
  GRAM_TRANSFORM: gramTransformItemSchema,
  GRAM_BINARY: gramBinaryItemSchema,
  TRUE_FALSE: trueFalseItemSchema,
  CONTENT_QUESTION: contentQuestionItemSchema,
  PASSAGE_FILL: passageFillItemSchema,
  CONNECTOR_FILL: connectorFillItemSchema,
};

/** 요청된 subType들만 포함하는 동적 스키마 빌드 */
export function buildDynamicSchema(subTypes: string[]): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const st of subTypes) {
    const itemSchema = SUBTYPE_ITEM_SCHEMAS[st];
    if (itemSchema) shape[st] = z.array(itemSchema);
  }
  return z.object(shape);
}
