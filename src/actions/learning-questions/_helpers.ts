// ---------------------------------------------------------------------------
// Shared helpers + types for learning-questions actions. Pure-server module,
// no "use server" directive (imported only by sibling server actions).
// ---------------------------------------------------------------------------

import { getStaffSession } from "@/lib/auth";
import { SUBTYPE_TO_CATEGORY } from "@/lib/learning-constants";
import {
  wordMeaningItemSchema,
  wordMeaningReverseItemSchema,
  wordFillItemSchema,
  wordMatchItemSchema,
  wordSpellItemSchema,
  vocabSynonymItemSchema,
  vocabDefinitionItemSchema,
  vocabCollocationItemSchema,
  vocabConfusableItemSchema,
  sentenceInterpretItemSchema,
  sentenceCompleteItemSchema,
  wordArrangeItemSchema,
  keyExpressionItemSchema,
  sentChunkOrderItemSchema,
  grammarSelectItemSchema,
  errorFindItemSchema,
  errorCorrectItemSchema,
  gramTransformItemSchema,
  gramBinaryItemSchema,
  trueFalseItemSchema,
  contentQuestionItemSchema,
  passageFillItemSchema,
  connectorFillItemSchema,
} from "@/lib/learning-question-schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface LearningQuestionData {
  passageId: string;
  type: string;
  subType?: string | null;
  questionText: string;
  options?: string | null;
  correctAnswer: string;
  difficulty?: string;
  tags?: string | null;
  explanation?: string | null;
  keyPoints?: string | null;
  wrongOptionExplanations?: string | null;
}

export interface LearningSetData {
  passageId: string;
  publisher: string;
  textbook?: string;
  grade?: number;
  unit?: string;
  title: string;
}

export interface SuneungPassageData {
  title: string;
  content: string;
  source?: string;
  grade: number;
  year?: number;
  examType?: string;
  difficulty?: string;
  tags?: string;
}

export interface LearningQuestionFilters {
  learningSetId?: string;
  learningCategory?: string;
  subType?: string;
  difficulty?: string;
  passageId?: string;
  approved?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function requireAuth() {
  const staff = await getStaffSession();
  if (!staff) throw new Error("인증이 필요합니다.");
  return staff;
}

export function resolveCategory(subType?: string | null): string {
  if (!subType) return "VOCAB";
  return SUBTYPE_TO_CATEGORY[subType] || "VOCAB";
}

export function toJsonString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** subType별 Zod 스키마 맵 — questionText JSON 검증용 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SUBTYPE_SCHEMA_MAP: Record<string, any> = {
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

/** questionText JSON 기본 검증 — JSON 파싱 가능하고 최소 1개 이상의 필드가 있으면 통과
 *  AI 생성 출력이 매번 미세하게 다를 수 있으므로 너무 엄격하면 정상 문제도 탈락함 */
export function validateQuestionText(subType: string | null | undefined, questionText: string): boolean {
  if (!subType) return true;
  try {
    const data = JSON.parse(questionText);
    if (typeof data !== "object" || data === null) return false;
    // WORD_MATCH는 pairs 1개만 있어도 정상
    if (subType === "WORD_MATCH") return Array.isArray(data.pairs) && data.pairs.length > 0;
    // 나머지는 최소 2개 이상의 키
    return Object.keys(data).length >= 2;
  } catch {
    return false;
  }
}
