// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { koMcTypeIds } from "@/lib/korean/registry";
import { sentenceInsertOptionMarkerIndex } from "@/lib/sentence-insert-options";
import { ANTONYM_MARKER_COUNT_MAX, ANTONYM_MARKER_COUNT_MIN, IRRELEVANT_SLOT_MIN, QuestionQualitySeverity, SENTENCE_INSERT_SLOT_MAX, SENTENCE_INSERT_SLOT_MIN, VOCAB_CHOICE_MARKER_COUNT_MAX, VOCAB_CHOICE_MARKER_COUNT_MIN, collectCorrectAnswerLabels, collectWrongOptionExplanations, findDuplicate, isRecord, normalizeLabel, normalizeText } from "../core";


export const GENERIC_OPTION_COUNT_MIN = 4;


export const GENERIC_OPTION_COUNT_MAX = 8;

const TRIPLE_LETTER_TOKEN = /\b[A-Za-z]*([A-Za-z])\1{2,}[A-Za-z]*\b/g;
const ALLOWED_TRIPLE_LETTER_TOKENS = new Set(["iii", "www"]);

export function findTripleLetterOptionToken(text: string): string | null {
  for (const match of text.matchAll(TRIPLE_LETTER_TOKEN)) {
    const token = match[0];
    if (ALLOWED_TRIPLE_LETTER_TOKENS.has(token.toLowerCase())) continue;
    return token;
  }
  return null;
}



export const MC_TYPE_IDS = new Set([
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);

// KO(국어) 객관식(MC5) 유형 병합 — 레지스트리 파생. option-count(5) 게이트를
// 영어 경로와 동일하게 재사용한다(KOQ 게이트와 이중 방어, 기존 엔트리 무변경).
for (const koTypeId of koMcTypeIds()) {
  MC_TYPE_IDS.add(koTypeId);
}



export function getExpectedOptionCount(question: Record<string, unknown>, typeId: string): number {
  if (typeId === "GRAMMAR_ERROR") {
    const markedCount = Array.isArray(question.markedExpressions)
      ? question.markedExpressions.length
      : 0;
    if (markedCount >= 5 && markedCount <= 10) {
      return markedCount;
    }
    return 5;
  }

  if (typeId === "VOCAB_CHOICE") {
    const markedCount = Array.isArray(question.markedWords)
      ? question.markedWords.length
      : 0;
    if (
      markedCount >= VOCAB_CHOICE_MARKER_COUNT_MIN &&
      markedCount <= VOCAB_CHOICE_MARKER_COUNT_MAX
    ) {
      return markedCount;
    }
    return 5;
  }

  if (typeId === "CONTENT_MATCH") {
    const optionCount = Array.isArray(question.options) ? question.options.length : 0;
    if (optionCount >= 5 && optionCount <= 12) return optionCount;
    return 5;
  }

  if (typeId === "SENTENCE_INSERT") {
    const markerIndexCount = Array.isArray(question.markerAfterSentenceIndices)
      ? question.markerAfterSentenceIndices.length
      : 0;
    if (
      markerIndexCount >= SENTENCE_INSERT_SLOT_MIN &&
      markerIndexCount <= SENTENCE_INSERT_SLOT_MAX
    ) {
      return markerIndexCount;
    }
    return 5;
  }

  if (typeId === "ANTONYM") {
    const pairCount = Array.isArray(question.markedWords)
      ? question.markedWords.length
      : 0;
    if (pairCount >= ANTONYM_MARKER_COUNT_MIN && pairCount <= ANTONYM_MARKER_COUNT_MAX) {
      return pairCount;
    }
    return 5;
  }

  if (typeId !== "IRRELEVANT") return 5;

  const sentenceCount = Array.isArray(question.sentences)
    ? question.sentences.length
    : 0;
  if (sentenceCount >= IRRELEVANT_SLOT_MIN) {
    return sentenceCount;
  }

  return 5;
}



export function validateOptions(
  question: Record<string, unknown>,
  typeId: string,
  genericOptionCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (!options.length) return;

  // A teacher-requested option count (free-text option types) overrides the
  // per-type default; clamp defensively to the supported range.
  const expectedOptionCount =
    typeof genericOptionCount === "number" && Number.isFinite(genericOptionCount)
      ? Math.min(
          GENERIC_OPTION_COUNT_MAX,
          Math.max(GENERIC_OPTION_COUNT_MIN, Math.round(genericOptionCount)),
        )
      : getExpectedOptionCount(question, typeId);
  if (MC_TYPE_IDS.has(typeId) && options.length !== expectedOptionCount) {
    add("error", "option-count", `Expected ${expectedOptionCount} options, got ${options.length}.`);
  }

  const normalizedLabels = options.map((opt) => normalizeLabel(opt?.label));
  const duplicateLabel = findDuplicate(normalizedLabels.filter(Boolean));
  if (duplicateLabel) {
    add("error", "duplicate-option-label", `Duplicate option label: ${duplicateLabel}.`);
  }

  const normalizedTexts = options.map((opt) => normalizeText(opt?.text));
  const duplicateText = findDuplicate(normalizedTexts.filter(Boolean));
  if (duplicateText) {
    add("error", "duplicate-option-text", "Two or more options have the same text.");
  }

  if (options.some((opt) => !normalizeText(opt?.text))) {
    add("error", "empty-option-text", "One or more options are empty.");
  }

  if (MC_TYPE_IDS.has(typeId)) {
    const typoOptions = options
      .map((option) => ({
        label: normalizeLabel(option.label),
        token: findTripleLetterOptionToken(normalizeText(option.text)),
      }))
      .filter(
        (item): item is { label: string; token: string } =>
          typeof item.token === "string",
      );
    if (typoOptions.length > 0) {
      add(
        "error",
        "option-spelling-triple-letter",
        `Option text contains an impossible-looking three-letter repetition: ${typoOptions
          .map(({ label, token }) => `${label || "(unlabeled)"} "${token}"`)
          .join(", ")}.`,
      );
    }
  }

  if (typeId === "SENTENCE_INSERT") {
    const badOption = options.find((opt, index) => {
      const markerIndex = sentenceInsertOptionMarkerIndex(opt?.text);
      return markerIndex !== index;
    });
    if (badOption) {
      add(
        "error",
        "sentence-insert-option-marker",
        "SENTENCE_INSERT options must be canonical gap markers in order: ①, ②, ③, ④, ⑤.",
      );
    }
  }

  const correctAnswerLabels = collectCorrectAnswerLabels(question);
  const correctAnswer = normalizeText(question.correctAnswer);
  if (correctAnswer) {
    const missingCorrectLabels = correctAnswerLabels.filter(
      (answerLabel) => !normalizedLabels.includes(answerLabel),
    );
    const matchesOption =
      correctAnswerLabels.length > 0
        ? missingCorrectLabels.length === 0
        : options.some((opt) => {
            const label = normalizeLabel(opt?.label);
            const text = normalizeText(opt?.text);
            return correctAnswer === label || correctAnswer === text || normalizeLabel(correctAnswer) === label;
          });
    if (!matchesOption) {
      add(
        "error",
        "correct-answer-mismatch",
        missingCorrectLabels.length
          ? `correctAnswer labels do not match options: ${missingCorrectLabels.join(", ")}.`
          : "correctAnswer does not match any option label or text.",
      );
    }
  }

  const wrongExplanations = question.wrongOptionExplanations;
  const correctAnswerLabelSet = new Set(correctAnswerLabels);
  const wrongOptionLabels = normalizedLabels.filter(
    (label) => label && !correctAnswerLabelSet.has(label),
  );
  const expectedWrongExplanationCount =
    correctAnswerLabelSet.size > 0
      ? wrongOptionLabels.length
      : Math.max(0, options.length - 1);
  if (typeId === "IRRELEVANT" || typeId === "GRAMMAR_ERROR" || typeId === "IMPLIED_MEANING" || typeId === "ANTONYM") {
    const explanationMap = collectWrongOptionExplanations(wrongExplanations);
    const missingLabels = wrongOptionLabels.filter((label) => !explanationMap.get(label));
    if (missingLabels.length > 0 || explanationMap.size < expectedWrongExplanationCount) {
      add(
        "error",
        "wrong-option-explanation-count",
        `Expected explanations for ${expectedWrongExplanationCount} wrong options, got ${explanationMap.size}. Missing: ${missingLabels.join(", ") || "unknown"}.`,
      );
    }
  }

  if (question.difficulty === "KILLER" && wrongExplanations && typeof wrongExplanations === "object") {
    const explanationCount = collectWrongOptionExplanations(wrongExplanations).size;
    if (explanationCount < expectedWrongExplanationCount) {
      add("warning", "thin-wrong-option-explanations", "KILLER item should explain every wrong option.");
    }
  }

  // M5: 해설 선지개수 환각 — 해설이 "N지선다" 또는 "모두/총/전체 N개의 선택지"라 진술하는데
  // 실제 선지 수와 다르면 AI 수정이 선지 수를 환각한 것. 객관식(options 존재)에서만.
  // ⚠️ severity=warning: 부분개수 서술("오답 선택지 2개가 매력적")·비교("3지선다와 다릅니다")
  //    같은 정상 해설을 완전 배제하긴 어렵고, validateOptions 는 생성 경로에서도 호출되므로
  //    error 로 두면 정상 후보를 거부·재시도 폭주시킨다. 검토 신호(warning)로 둔다.
  //    패턴은 '총개수 단정'(모두/총/전체 N개의 선택지) 또는 'N지선다'로 한정해 부분개수 오탐을 줄인다.
  const optionCount = Array.isArray(question.options) ? question.options.length : 0;
  if (optionCount > 0) {
    const allExpl = [
      normalizeText(question.explanation),
      ...collectWrongOptionExplanations(question.wrongOptionExplanations).values(),
    ].join(" ");
    const choiceCountMatch =
      /([0-9]+)\s*지\s*선다|(?:모두|총|전체)\s*([0-9]+)\s*개의?\s*선택지/.exec(allExpl);
    if (choiceCountMatch) {
      const statedCount = Number(choiceCountMatch[1] ?? choiceCountMatch[2]);
      if (Number.isFinite(statedCount) && statedCount !== optionCount) {
        add(
          "warning",
          "explanation-choice-count-mismatch",
          `해설이 ${statedCount}지선다라 진술하나 실제 선지는 ${optionCount}개입니다.`,
        );
      }
    }
  }
}
