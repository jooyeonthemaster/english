// ============================================================================
// AI 문제 수정 — 베이스라인에서 스키마 카운트 파생
// ============================================================================
// "유형 고정, 내부만 수정"이므로 표시 개수/선지 수/빈칸 수 등 구조 카운트는 원본을
// 그대로 유지한다. getAiResponseSchema 가 정확 길이(.length(n)) 스키마를 만들 때 쓰는
// 카운트를 베이스라인에서 읽어 넘긴다 → 수정본이 원본과 구조적으로 일치(스키마 불일치
// 실패 방지). 사용자가 개수 변경을 원하는 경우는 v1 범위 밖(유형 고정 결정).
// ============================================================================

type Rec = Record<string, unknown>;

function arrLen(v: unknown): number | undefined {
  return Array.isArray(v) ? v.length : undefined;
}

function countCommaAnswers(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = v
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  return n > 0 ? n : undefined;
}

export interface DerivedEditSchemaOptions {
  irrelevantSlotCount?: number;
  grammarMarkerCount?: number;
  grammarAnswerCount?: number;
  grammarCorrectionErrorCount?: number;
  summaryCompleteMcBlankCount?: number;
  summaryCompleteBlankCount?: number;
  summaryWritingBlankCount?: number;
  contentMatchOptionCount?: number;
  contentMatchAnswerCount?: number;
  vocabChoiceMarkerCount?: number;
  vocabChoiceAnswerCount?: number;
  sentenceInsertSlotCount?: number;
  antonymPairCount?: number;
  blankInferenceBlankCount?: number;
  genericOptionCount?: number;
  genericAnswerCount?: number;
}

const GENERIC_OPTION_TYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "CONTEXT_MEANING",
  "SYNONYM",
]);

/**
 * 베이스라인 구조에서 스키마 카운트를 파생한다. getAiResponseSchema 는 "기본값과 다를
 * 때만" 동적 빌더를 타므로, 기본값(5/1/2 등)이면 굳이 넣지 않아도 무방하지만 명시해도
 * 동일 결과다. 안전하게 항상 명시한다.
 */
export function deriveEditSchemaOptions(
  subType: string,
  baseline: Rec,
): DerivedEditSchemaOptions {
  const opts: DerivedEditSchemaOptions = {};
  const correctCount = countCommaAnswers(baseline.correctAnswer);
  const correctArr = arrLen(baseline.correctAnswers);
  const answerCount = correctArr ?? correctCount ?? 1;

  switch (subType) {
    case "GRAMMAR_ERROR":
      opts.grammarMarkerCount = arrLen(baseline.markedExpressions) ?? 5;
      opts.grammarAnswerCount = correctArr ?? correctCount ?? 1;
      break;
    case "IRRELEVANT":
      opts.irrelevantSlotCount =
        arrLen(baseline.sentences) ?? arrLen(baseline.options) ?? 5;
      break;
    case "VOCAB_CHOICE":
      opts.vocabChoiceMarkerCount = arrLen(baseline.markedWords) ?? 5;
      opts.vocabChoiceAnswerCount = correctArr ?? correctCount ?? 1;
      break;
    case "ANTONYM":
      opts.antonymPairCount = arrLen(baseline.markedWords) ?? 5;
      break;
    case "SENTENCE_INSERT":
      opts.sentenceInsertSlotCount = arrLen(baseline.options) ?? 5;
      break;
    case "SUMMARY_COMPLETE_MC":
      opts.summaryCompleteMcBlankCount = arrLen(baseline.blanks) ?? 2;
      break;
    case "SUMMARY_COMPLETE":
      opts.summaryCompleteBlankCount = arrLen(baseline.blanks) ?? 2;
      break;
    case "SUMMARY_WRITING":
      opts.summaryWritingBlankCount = arrLen(baseline.blanks) ?? 1;
      break;
    case "CONTENT_MATCH":
      opts.contentMatchOptionCount = arrLen(baseline.options) ?? 5;
      opts.contentMatchAnswerCount = answerCount;
      break;
    case "BLANK_INFERENCE":
      opts.blankInferenceBlankCount = arrLen(baseline.blanks) ?? 1;
      break;
    case "GRAMMAR_CORRECTION":
      opts.grammarCorrectionErrorCount = arrLen(baseline.underlinedSegments) ?? 1;
      break;
    default:
      if (GENERIC_OPTION_TYPES.has(subType)) {
        opts.genericOptionCount = arrLen(baseline.options) ?? 5;
        opts.genericAnswerCount = answerCount;
      }
      break;
  }
  return opts;
}
