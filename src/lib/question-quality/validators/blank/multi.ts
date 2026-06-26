// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, REPEATED_PHRASE_STOPWORDS, countContentTokens, countLiteral, findDuplicate, isRecord, isTinyFunctionWord, normalizeComparableText, normalizeLabel, normalizeText, toLowerTokens } from "../../core";
import { isNearVerbatimBlankParaphrase } from "./shared";



export function countContentWords(tokens: string[]): number {
  return tokens.filter(
    (t) => !REPEATED_PHRASE_STOPWORDS.has(t.toLowerCase()) && t.length >= 3,
  ).length;
}



/**
 * 의미가 비어 있는 placeholder 명사 + 경동사 — 이들만으로 이뤄진 빈칸은
 * 학생이 내용 이해 없이 관용 표현 감으로 채운다 (예: "doing things").
 */
export const SEMANTICALLY_LIGHT_WORDS = new Set([
  "thing", "things", "stuff", "way", "ways", "something", "anything", "everything",
  "someone", "somebody", "one", "ones", "kind", "kinds", "sort", "sorts",
  "do", "doing", "does", "done", "make", "making", "makes", "made",
  "get", "getting", "gets", "got", "have", "having", "has", "had",
  "go", "going", "goes", "gone", "take", "taking", "takes", "taken",
]);



/**
 * 빈칸 표현이 placeholder 명사/경동사만으로 이뤄진 의미 빈약 연어인지 검출한다
 * ("doing things", "get things done"). 내용어가 1개뿐인 단일 표현은 별개라 제외한다.
 */
export function isSemanticallyLightExpression(expression: string): boolean {
  const tokens = toLowerTokens(expression).filter(
    (t) => t.length >= 3 && !REPEATED_PHRASE_STOPWORDS.has(t),
  );
  if (tokens.length < 2) return false;
  return tokens.every((t) => SEMANTICALLY_LIGHT_WORDS.has(t));
}



/**
 * 빈칸 값의 의미 핵심부(연속한 내용어 2개 이상 부분구)가 빈칸 처리 후 본문에
 * 그대로 남아 정답을 부분 누설하는지 검출한다. 전체 일치는 별도 게이트가 잡으므로
 * 여기서는 부분구만 본다. 잔존 부분구를 찾으면 반환, 없으면 null.
 */
export function findVisibleContentSubphrase(answer: string, blankedPassage: string): string | null {
  const tokens = toLowerTokens(answer);
  if (tokens.length < 2) return null;
  // 구두점을 제거하고 토큰 단위로 비교 (구두점이 붙은 "situations," 같은 잔존을 놓치지 않도록).
  const haystack = ` ${toLowerTokens(blankedPassage).join(" ")} `;
  for (let len = tokens.length - 1; len >= 2; len -= 1) {
    for (let i = 0; i + len <= tokens.length; i += 1) {
      const window = tokens.slice(i, i + len);
      if (countContentWords(window) < 2) continue;
      const phrase = window.join(" ");
      if (haystack.includes(` ${phrase} `)) return phrase;
    }
  }
  return null;
}



export const MULTI_BLANK_INFERENCE_LABELS = ["(A)", "(B)", "(C)"] as const;



export function validateMultiBlankInferenceQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedBlankCount: number | undefined,
  blankInferenceParaphraseAnswer: boolean | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const isParaphraseMode =
    question.blankAnswerMode === "PARAPHRASE" ||
    blankInferenceParaphraseAnswer === true;
  const blanks = Array.isArray(question.blanks) ? question.blanks.filter(isRecord) : [];
  const expectedBlankCount =
    requestedBlankCount && requestedBlankCount >= 2 && requestedBlankCount <= 3
      ? requestedBlankCount
      : blanks.length >= 2 && blanks.length <= 3
        ? blanks.length
        : 2;

  if (blanks.length !== expectedBlankCount) {
    add(
      "error",
      "multi-blank-count",
      `Multi-blank BLANK_INFERENCE must have exactly ${expectedBlankCount} blanks, got ${blanks.length}.`,
    );
    return;
  }

  const expectedLabels = MULTI_BLANK_INFERENCE_LABELS.slice(0, expectedBlankCount);
  const blankAnswers: string[] = [];
  for (const [index, blank] of blanks.entries()) {
    const label = normalizeText(blank.label);
    const expression = normalizeText(blank.originalExpression);
    if (label !== expectedLabels[index]) {
      add(
        "error",
        "multi-blank-label",
        `Multi-blank labels must be ${expectedLabels.join(", ")} in passage order; blank ${index + 1} has "${label}".`,
      );
    }
    if (!expression) {
      add("error", "multi-blank-missing-expression", `Blank ${expectedLabels[index]} is missing originalExpression.`);
      continue;
    }
    blankAnswers.push(expression);
    if (passage && !normalizeComparableText(passage).includes(normalizeComparableText(expression))) {
      add(
        "error",
        "multi-blank-expression-not-in-passage",
        `Blank ${expectedLabels[index]} expression is not found verbatim in the passage: "${expression.slice(0, 80)}".`,
      );
    }
    if (
      countContentTokens(expression) < 1 ||
      isTinyFunctionWord(expression) ||
      isSemanticallyLightExpression(expression)
    ) {
      add(
        "warning",
        "multi-blank-weak-expression",
        `Blank ${expectedLabels[index]} should blank a meaningful content expression, not a bare function word or an empty light phrase like "doing things".`,
      );
    }
  }

  const passageWithBlank = normalizeText(question.passageWithBlank);
  if (!passageWithBlank) {
    add("error", "multi-blank-missing-passage", "Multi-blank BLANK_INFERENCE is missing passageWithBlank.");
    return;
  }
  for (const label of expectedLabels) {
    const markerCount = countLiteral(passageWithBlank, `${label} _____`);
    if (markerCount !== 1) {
      add(
        "error",
        "multi-blank-marker-count",
        `passageWithBlank must contain the marker "${label} _____" exactly once, found ${markerCount}.`,
      );
    }
  }
  for (const answer of blankAnswers) {
    if (!answer) continue;
    if (normalizeComparableText(passageWithBlank).includes(normalizeComparableText(answer))) {
      add(
        "error",
        "multi-blank-answer-visible",
        `A blanked expression is still visible in passageWithBlank: "${answer.slice(0, 60)}".`,
      );
      continue;
    }
    const leakedSubphrase = findVisibleContentSubphrase(answer, passageWithBlank);
    if (leakedSubphrase) {
      add(
        "error",
        "multi-blank-answer-partial-visible",
        `A blanked expression's meaningful core "${leakedSubphrase}" still appears in passageWithBlank, partially revealing the answer.`,
      );
    }
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctLabel = normalizeLabel(question.correctAnswer);
  let correctValues: string[] | null = null;
  const comboKeys: string[] = [];
  for (const [index, option] of options.entries()) {
    const values = Array.isArray(option.blankValues)
      ? option.blankValues.map((value: unknown) => normalizeText(value))
      : [];
    if (values.length !== expectedBlankCount || values.some((value: string) => !value)) {
      add(
        "error",
        "multi-blank-option-values",
        `Option ${index + 1} must provide exactly ${expectedBlankCount} non-empty blankValues.`,
      );
      continue;
    }
    comboKeys.push(values.map(normalizeComparableText).join(" | "));
    if (normalizeLabel(option.label) === correctLabel) {
      correctValues = values;
    }
  }
  const duplicateCombo = findDuplicate(comboKeys);
  if (duplicateCombo) {
    add("error", "multi-blank-duplicate-option", "Two or more options share the same blank-value combination.");
  }

  if (!correctValues) {
    add("error", "multi-blank-missing-correct-option", "correctAnswer does not match any option label.");
    return;
  }
  if (
    blankAnswers.length === expectedBlankCount &&
    !isParaphraseMode &&
    !correctValues.every(
      (value, index) => normalizeComparableText(value) === normalizeComparableText(blankAnswers[index]),
    )
  ) {
    add(
      "error",
      "multi-blank-correct-option-mismatch",
      "The correct option's blankValues must be exactly the original passage expressions, in blank order.",
    );
  }
  if (
    blankAnswers.length === expectedBlankCount &&
    isParaphraseMode &&
    correctValues.every(
      (value, index) => normalizeComparableText(value) === normalizeComparableText(blankAnswers[index]),
    )
  ) {
    add(
      "error",
      "multi-blank-paraphrase-correct-source-exact",
      "PARAPHRASE multi-blank correct option must not copy the original passage expressions verbatim.",
    );
  } else if (
    blankAnswers.length === expectedBlankCount &&
    isParaphraseMode &&
    correctValues.some((value, index) => isNearVerbatimBlankParaphrase(value, blankAnswers[index]))
  ) {
    add(
      "error",
      "blank-paraphrase-answer-too-verbatim",
      "PARAPHRASE multi-blank correct option has a blank value too close to the original passage expression.",
    );
  }

  // 변별 보조(권장): 한 빈칸만 틀린 근접 오답이 최소 1개는 있어야 모든 빈칸 검증을 강제한다.
  if (correctValues) {
    const nearMissCount = options.filter((option) => {
      if (normalizeLabel(option.label) === correctLabel) return false;
      const values = Array.isArray(option.blankValues)
        ? option.blankValues.map((value: unknown) => normalizeText(value))
        : [];
      if (values.length !== expectedBlankCount) return false;
      const matches = values.filter(
        (value: string, index: number) =>
          normalizeComparableText(value) === normalizeComparableText(correctValues![index]),
      ).length;
      return matches === expectedBlankCount - 1;
    }).length;
    if (nearMissCount < 1) {
      add(
        "warning",
        "multi-blank-weak-near-miss",
        "Include at least one wrong option that is correct for all but one blank so students must verify every blank.",
      );
    }
  }
}
