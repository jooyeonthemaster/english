// ============================================================================
// NARA ERP — Structured Question Type Schemas (배럴 파일)
// ============================================================================
// 스키마: question-schemas-{mc,essay,vocab}.ts
// 프롬프트: question-prompts-{mc,essay,vocab}.ts
// ============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. Question type metadata
// ---------------------------------------------------------------------------

export type QuestionCategory = "객관식" | "서술형" | "어휘";

export interface QuestionTypeMeta {
  typeId: string;
  category: QuestionCategory;
  label: string;
  includesPassage: boolean;
  description: string;
}

export const QUESTION_TYPE_META: Record<string, QuestionTypeMeta> = {
  BLANK_INFERENCE:      { typeId: "BLANK_INFERENCE",      category: "객관식", label: "빈칸 추론",      includesPassage: true,  description: "지문의 핵심 표현을 빈칸으로 만들어 추론하게 하는 문제" },
  GRAMMAR_ERROR:        { typeId: "GRAMMAR_ERROR",        category: "객관식", label: "어법 판단",      includesPassage: true,  description: "밑줄 친 5개 부분 중 어법상 틀린 것을 찾는 문제" },
  VOCAB_CHOICE:         { typeId: "VOCAB_CHOICE",         category: "객관식", label: "어휘 적절성",    includesPassage: true,  description: "밑줄 친 어휘 중 문맥상 적절하지 않은 것을 찾는 문제" },
  SENTENCE_ORDER:       { typeId: "SENTENCE_ORDER",       category: "객관식", label: "글의 순서",      includesPassage: true,  description: "주어진 글 다음에 이어질 글의 순서를 맞추는 문제" },
  SENTENCE_INSERT:      { typeId: "SENTENCE_INSERT",      category: "객관식", label: "문장 삽입",      includesPassage: true,  description: "주어진 문장이 들어갈 가장 적절한 위치를 찾는 문제" },
  TOPIC_MAIN_IDEA:      { typeId: "TOPIC_MAIN_IDEA",      category: "객관식", label: "주제/요지",      includesPassage: false, description: "글의 주제 또는 요지를 파악하는 문제" },
  TITLE:                { typeId: "TITLE",                category: "객관식", label: "제목 추론",      includesPassage: false, description: "글의 제목을 추론하는 문제" },
  REFERENCE:            { typeId: "REFERENCE",            category: "객관식", label: "지칭 추론",      includesPassage: true,  description: "밑줄 친 대명사가 가리키는 대상을 찾는 문제" },
  CONTENT_MATCH:        { typeId: "CONTENT_MATCH",        category: "객관식", label: "내용 일치",      includesPassage: false, description: "글의 내용과 일치/불일치하는 것을 찾는 문제" },
  IRRELEVANT:           { typeId: "IRRELEVANT",           category: "객관식", label: "무관한 문장",    includesPassage: true,  description: "전체 흐름과 관계없는 문장을 찾는 문제" },
  CONDITIONAL_WRITING:  { typeId: "CONDITIONAL_WRITING",  category: "서술형", label: "조건부 영작",    includesPassage: false, description: "조건에 맞게 영어 문장을 작성하는 문제" },
  SENTENCE_TRANSFORM:   { typeId: "SENTENCE_TRANSFORM",   category: "서술형", label: "문장 전환",      includesPassage: false, description: "주어진 문장을 조건에 맞게 전환하는 문제" },
  FILL_BLANK_KEY:       { typeId: "FILL_BLANK_KEY",       category: "서술형", label: "핵심 표현 빈칸",  includesPassage: true,  description: "핵심 표현의 빈칸을 채우는 문제" },
  SUMMARY_COMPLETE:     { typeId: "SUMMARY_COMPLETE",     category: "서술형", label: "요약문 완성",    includesPassage: false, description: "요약문의 빈칸을 완성하는 문제" },
  WORD_ORDER:           { typeId: "WORD_ORDER",           category: "서술형", label: "배열 영작",      includesPassage: false, description: "주어진 단어를 올바른 순서로 배열하는 문제" },
  GRAMMAR_CORRECTION:   { typeId: "GRAMMAR_CORRECTION",   category: "서술형", label: "문법 오류 수정",  includesPassage: false, description: "문법 오류를 찾아 바르게 고치는 문제" },
  CONTEXT_MEANING:      { typeId: "CONTEXT_MEANING",      category: "어휘",   label: "문맥 속 의미",   includesPassage: true,  description: "밑줄 친 단어의 문맥상 의미를 찾는 문제" },
  SYNONYM:              { typeId: "SYNONYM",              category: "어휘",   label: "동의어",        includesPassage: false, description: "핵심 어휘의 동의어를 찾는 문제" },
  ANTONYM:              { typeId: "ANTONYM",              category: "어휘",   label: "반의어",        includesPassage: true,  description: "핵심 어휘의 반의어를 찾는 문제" },
};

// ---------------------------------------------------------------------------
// 2. Re-export all schemas & types from category files
// ---------------------------------------------------------------------------

export {
  blankInferenceSchema, type BlankInferenceQuestion,
  grammarErrorSchema, type GrammarErrorQuestion,
  vocabChoiceSchema, type VocabChoiceQuestion,
  sentenceOrderSchema, type SentenceOrderQuestion,
  sentenceInsertSchema, type SentenceInsertQuestion,
  topicMainIdeaSchema, type TopicMainIdeaQuestion,
  titleSchema, type TitleQuestion,
  referenceSchema, type ReferenceQuestion,
  contentMatchSchema, type ContentMatchQuestion,
  irrelevantSchema, type IrrelevantQuestion,
} from "./question-schemas-mc";

export {
  conditionalWritingSchema, type ConditionalWritingQuestion,
  sentenceTransformSchema, type SentenceTransformQuestion,
  fillBlankKeySchema, type FillBlankKeyQuestion,
  summaryCompleteSchema, type SummaryCompleteQuestion,
  wordOrderSchema, type WordOrderQuestion,
  grammarCorrectionSchema, type GrammarCorrectionQuestion,
} from "./question-schemas-essay";

export {
  contextMeaningSchema, type ContextMeaningQuestion,
  synonymSchema, type SynonymQuestion,
  antonymSchema, type AntonymQuestion,
} from "./question-schemas-vocab";

// ---------------------------------------------------------------------------
// 3. Schema registry
// ---------------------------------------------------------------------------

import { blankInferenceSchema as _bi, grammarErrorSchema as _ge, vocabChoiceSchema as _vc, sentenceOrderSchema as _so, sentenceInsertSchema as _si, topicMainIdeaSchema as _tm, titleSchema as _ti, referenceSchema as _rf, contentMatchSchema as _cm, irrelevantSchema as _ir } from "./question-schemas-mc";
import { conditionalWritingSchema as _cw, sentenceTransformSchema as _st, fillBlankKeySchema as _fb, summaryCompleteSchema as _sc, wordOrderSchema as _wo, grammarCorrectionSchema as _gc } from "./question-schemas-essay";
import { contextMeaningSchema as _cx, synonymSchema as _sy, antonymSchema as _an } from "./question-schemas-vocab";

export const QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  BLANK_INFERENCE: _bi, GRAMMAR_ERROR: _ge, VOCAB_CHOICE: _vc,
  SENTENCE_ORDER: _so, SENTENCE_INSERT: _si, TOPIC_MAIN_IDEA: _tm,
  TITLE: _ti, REFERENCE: _rf, CONTENT_MATCH: _cm, IRRELEVANT: _ir,
  CONDITIONAL_WRITING: _cw, SENTENCE_TRANSFORM: _st, FILL_BLANK_KEY: _fb,
  SUMMARY_COMPLETE: _sc, WORD_ORDER: _wo, GRAMMAR_CORRECTION: _gc,
  CONTEXT_MEANING: _cx, SYNONYM: _sy, ANTONYM: _an,
};

export function getResponseSchema(typeId: string) {
  const schema = QUESTION_SCHEMAS[typeId];
  if (!schema) throw new Error(`Unknown question type: ${typeId}`);
  return z.object({ questions: z.array(schema) });
}

// ---------------------------------------------------------------------------
// 4. Prompts — 카테고리별 분리 파일에서 합산
// ---------------------------------------------------------------------------

import { MC_PROMPTS } from "./question-prompts-mc";
import { ESSAY_PROMPTS } from "./question-prompts-essay";
import { VOCAB_PROMPTS } from "./question-prompts-vocab";

export const STRUCTURED_TYPE_PROMPTS: Record<string, string> = {
  ...MC_PROMPTS,
  ...ESSAY_PROMPTS,
  ...VOCAB_PROMPTS,
};

// ---------------------------------------------------------------------------
// 5. Union type
// ---------------------------------------------------------------------------

import type { BlankInferenceQuestion as BIQ, GrammarErrorQuestion as GEQ, VocabChoiceQuestion as VCQ, SentenceOrderQuestion as SOQ, SentenceInsertQuestion as SIQ, TopicMainIdeaQuestion as TMQ, TitleQuestion as TIQ, ReferenceQuestion as RFQ, ContentMatchQuestion as CMQ, IrrelevantQuestion as IRQ } from "./question-schemas-mc";
import type { ConditionalWritingQuestion as CWQ, SentenceTransformQuestion as STQ, FillBlankKeyQuestion as FBQ, SummaryCompleteQuestion as SCQ, WordOrderQuestion as WOQ, GrammarCorrectionQuestion as GCQ } from "./question-schemas-essay";
import type { ContextMeaningQuestion as CXQ, SynonymQuestion as SYQ, AntonymQuestion as ANQ } from "./question-schemas-vocab";

export type StructuredQuestion =
  | ({ _typeId: "BLANK_INFERENCE" } & BIQ)
  | ({ _typeId: "GRAMMAR_ERROR" } & GEQ)
  | ({ _typeId: "VOCAB_CHOICE" } & VCQ)
  | ({ _typeId: "SENTENCE_ORDER" } & SOQ)
  | ({ _typeId: "SENTENCE_INSERT" } & SIQ)
  | ({ _typeId: "TOPIC_MAIN_IDEA" } & TMQ)
  | ({ _typeId: "TITLE" } & TIQ)
  | ({ _typeId: "REFERENCE" } & RFQ)
  | ({ _typeId: "CONTENT_MATCH" } & CMQ)
  | ({ _typeId: "IRRELEVANT" } & IRQ)
  | ({ _typeId: "CONDITIONAL_WRITING" } & CWQ)
  | ({ _typeId: "SENTENCE_TRANSFORM" } & STQ)
  | ({ _typeId: "FILL_BLANK_KEY" } & FBQ)
  | ({ _typeId: "SUMMARY_COMPLETE" } & SCQ)
  | ({ _typeId: "WORD_ORDER" } & WOQ)
  | ({ _typeId: "GRAMMAR_CORRECTION" } & GCQ)
  | ({ _typeId: "CONTEXT_MEANING" } & CXQ)
  | ({ _typeId: "SYNONYM" } & SYQ)
  | ({ _typeId: "ANTONYM" } & ANQ);
