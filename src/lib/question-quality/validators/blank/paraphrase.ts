// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, contentTokens, countContentTokens, countWordsForQuality, hasTrailingFunctionWordBlankTarget, normalizeComparableText, normalizeLabel, normalizeText } from "../../core";
import { isNearVerbatimBlankParaphrase } from "./shared";



export const BASIC_PARAPHRASE_ADVANCED_WORDS = new Set([
  "abstraction",
  "ambiguous",
  "conceptual",
  "consequential",
  "constitute",
  "cultivation",
  "epistemic",
  "framework",
  "fundamental",
  "heterogeneous",
  "intrinsic",
  "manifestation",
  "mechanism",
  "metacognitive",
  "normative",
  "paradigm",
  "phenomenon",
  "prerequisite",
  "reciprocal",
  "synthesize",
  "transcend",
]);



export const INTERMEDIATE_PARAPHRASE_OVERLY_ORNATE_WORDS = new Set([
  "acumen",
  "influx",
  "influxes",
  "sovereignly",
  "terrain",
  "terrains",
]);



export function validateBlankAnswerParaphraseMode(
  question: Record<string, unknown>,
  options: Record<string, unknown>[],
  originalExpression: string,
  blankCarrierText: string,
  correctText: string,
  correctLabel: string,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  if (originalExpression && normalizeComparableText(correctText) === normalizeComparableText(originalExpression)) {
    add(
      "error",
      "blank-paraphrase-answer-not-transformed",
      "PARAPHRASE blank correct option must not copy originalExpression verbatim.",
    );
  } else if (originalExpression && isNearVerbatimBlankParaphrase(correctText, originalExpression)) {
    add(
      "error",
      "blank-paraphrase-answer-too-verbatim",
      "PARAPHRASE blank correct option is too close to originalExpression; rewrite it as a real paraphrase.",
    );
  }

  const difficultyIssue = findBlankParaphraseDifficultyIssue(
    correctText,
    originalExpression,
    requestedDifficulty,
  );
  if (difficultyIssue) {
    add("error", difficultyIssue.code, difficultyIssue.message);
  }

  const slotIssue = findBlankParaphraseSlotIssue(
    blankCarrierText,
    originalExpression,
    correctText,
  );
  if (slotIssue) {
    add("error", slotIssue.code, slotIssue.message);
  }

  const killerIssue = findBlankParaphraseKillerIssue(
    options,
    correctLabel,
    originalExpression,
    correctText,
    requestedDifficulty,
  );
  if (killerIssue) {
    add("error", killerIssue.code, killerIssue.message);
  }

  const polarityIssue = findBlankParaphrasePolarityIssue(
    originalExpression,
    correctText,
  );
  if (polarityIssue) {
    add("error", polarityIssue.code, polarityIssue.message);
  }

  if (hasTrailingFunctionWordBlankTarget(originalExpression)) {
    add(
      "error",
      "blank-paraphrase-target-trailing-function",
      "PARAPHRASE blank originalExpression ends with a modal/auxiliary/function tail; choose a cleaner semantic unit so options do not become grammar-tail variants.",
    );
  }

  if (
    countWordsForQuality(originalExpression) > 12 ||
    originalExpression.length > 90
  ) {
    add(
      "error",
      "blank-paraphrase-target-too-wide",
      "PARAPHRASE blank originalExpression is too broad; choose a compact semantic unit instead of a long clause.",
    );
  }

  const answerLogic = normalizeText(question.answerLogic);
  if (answerLogic.length < 30) {
    add(
      "error",
      "blank-paraphrase-missing-answer-logic",
      "PARAPHRASE blank should include answerLogic explaining the source meaning and paraphrased correct option.",
    );
  }

  const optionTexts = options.map((option) => normalizeText(option.text)).filter(Boolean);
  const wordCounts = optionTexts.map(countWordsForQuality).filter((count) => count > 0);
  if (wordCounts.length >= 4) {
    const minWords = Math.min(...wordCounts);
    const maxWords = Math.max(...wordCounts);
    if (maxWords >= 8 && maxWords / Math.max(1, minWords) > 2.4) {
      add(
        "error",
        "blank-paraphrase-option-imbalance",
        `PARAPHRASE blank options are too uneven in length (${minWords}-${maxWords} words).`,
      );
    }
  }

  if (passage) {
    for (const option of options) {
      const optionText = normalizeText(option.text);
      if (!optionText || normalizeLabel(option.label) === correctLabel) continue;
      if (
        countContentTokens(optionText) >= 3 &&
        normalizeComparableText(passage).includes(normalizeComparableText(optionText))
      ) {
        add(
          "error",
          "blank-paraphrase-option-source-copy",
          `PARAPHRASE blank wrong option copies a source passage phrase verbatim: "${optionText.slice(0, 80)}".`,
        );
        break;
      }
    }
  }
}



export function findBlankParaphraseSlotIssue(
  blankCarrierText: string,
  originalExpression: string,
  correctText: string,
): { code: string; message: string } | null {
  const carrier = normalizeText(blankCarrierText);
  if (!carrier.includes("_____")) return null;

  const sourceIsTaskLikeSubject =
    /\b(?:challenge|task|problem|question|issue|matter)\b/i.test(originalExpression);
  const isWhetherHowSubjectFrame =
    /^_____\s+(?:is|are|was|were)\s+not\s+(?:whether|if)\b/i.test(carrier) ||
    /^_____\s+(?:is|are|was|were)\s+not\s+(?:a\s+)?(?:question|matter|issue)\s+of\s+(?:whether|if)\b/i.test(carrier);

  if (
    sourceIsTaskLikeSubject &&
    isWhetherHowSubjectFrame &&
    startsWithGerundProcessPhrase(correctText)
  ) {
    return {
      code: "blank-paraphrase-subject-slot-mismatch",
      message:
        "PARAPHRASE blank uses a process-like gerund phrase in a task/challenge subject slot; use a compact noun phrase such as the central challenge/task.",
    };
  }

  const blankIndex = carrier.indexOf("_____");
  const leftOfBlank = blankIndex >= 0 ? carrier.slice(0, blankIndex).trim() : "";
  if (
    /\bto\s*$/i.test(leftOfBlank) &&
    startsWithGerundProcessPhrase(correctText)
  ) {
    return {
      code: "blank-paraphrase-verb-form-slot-mismatch",
      message:
        "PARAPHRASE blank uses a gerund phrase after an infinitive marker; use a base verb phrase that fits the blank sentence.",
    };
  }

  if (
    startsLikeFiniteClause(originalExpression) &&
    startsWithGerundProcessPhrase(correctText) &&
    /(?:^|[.;:!?])$/.test(leftOfBlank)
  ) {
    return {
      code: "blank-paraphrase-clause-slot-mismatch",
      message:
        "PARAPHRASE blank turns a finite source clause into a gerund phrase in an independent-clause slot.",
    };
  }

  return null;
}



export function findBlankParaphraseKillerIssue(
  options: Record<string, unknown>[],
  correctLabel: string,
  originalExpression: string,
  correctText: string,
  requestedDifficulty: string | undefined,
): { code: string; message: string } | null {
  if (requestedDifficulty !== "KILLER") return null;

  const sourceContentCount = countContentTokens(originalExpression);
  const sourceWordCount = countWordsForQuality(originalExpression);
  const correctContentCount = countContentTokens(correctText);
  const correctWordCount = countWordsForQuality(correctText);
  if (
    sourceWordCount < 7 ||
    sourceContentCount < 5 ||
    correctContentCount < 6 ||
    correctWordCount < 8
  ) {
    return {
      code: "blank-paraphrase-killer-too-easy",
      message:
        "KILLER PARAPHRASE blank is too surface-level; use a richer central relation and a correct option with enough conceptual load.",
    };
  }

  const wrongOptions = options.filter(
    (option) => normalizeLabel(option.label) !== correctLabel,
  );
  const giveawayCount = wrongOptions.filter((option) =>
    hasKillerBlankGiveawayCue(normalizeText(option.text)),
  ).length;
  if (giveawayCount >= 2) {
    return {
      code: "blank-paraphrase-killer-giveaway-distractors",
      message:
        "KILLER PARAPHRASE blank has too many obviously eliminable distractors; replace extreme/opposite options with passage-grounded near misses.",
    };
  }

  return null;
}



export function hasKillerBlankGiveawayCue(text: string): boolean {
  const normalized = normalizeText(text);
  return /\b(?:unconditionally|completely|passive(?:ly)?|strict(?:ly)?|inevitably|naturally|whatever|successfully|always|never|solely|entirely|exclusively|fully|merely|simply|all|every|only|must|cannot|guarantee(?:s|d)?|definitive|flawless|seamless|error-free|automatically|altogether|indefinitely|immediate(?:ly)?|eliminate(?:s|d|ing)?|bound\s+to|any\s+form\s+of|(?:from|without|against)\s+any|without\s+\w+\s+any|fail(?:s|ed|ing)?\s+to|prevent(?:s|ed|ing)?\s+all|avoid(?:s|ed|ing)?\s+all)\b/i.test(
    normalized,
  );
}



export function findBlankParaphrasePolarityIssue(
  originalExpression: string,
  correctText: string,
): { code: string; message: string } | null {
  const original = normalizeText(originalExpression);
  const answer = normalizeText(correctText);

  const originalResistsReduction =
    /\bresist\w*\s+(?:the\s+)?temptation\s+to\s+(?:reduce|simplify|limit|narrow)\b/i.test(original);
  const answerPerformsReduction =
    /\b(?:reduce|reducing|simplify|simplifying|limit|limiting|narrow|narrowing)\b/i.test(answer);
  const answerKeepsResistance =
    /\b(?:resist\w*|avoid\w*|refus\w*|reject\w*|guard(?:ing)?\s+against|prevent\w*|keep\w*\s+from|not|never|without|rather\s+than|instead\s+of)\b/i.test(answer);

  if (originalResistsReduction && answerPerformsReduction && !answerKeepsResistance) {
    return {
      code: "blank-paraphrase-polarity-loss",
      message:
        "PARAPHRASE blank loses the source resistance/negation relation; it turns resisting reduction into performing reduction.",
    };
  }

  return null;
}



export function startsWithGerundProcessPhrase(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  const match = normalized.match(
    /^(?:(?:the|a|an)\s+)?(?:(?:act|process|practice)\s+of\s+)?(?:[a-z][a-z'-]*ly\s+){0,2}([a-z][a-z'-]*ing)\b/,
  );
  if (!match) return false;
  return !new Set(["anything", "everything", "nothing", "something", "thing"]).has(match[1] ?? "");
}



export function startsLikeFiniteClause(text: string): boolean {
  return /^(?:it|this|that|these|those|they|we|one|people|students|readers|leaders|scientists|researchers|individuals|societies|communities)\s+(?:requires?|demands?|allows?|enables?|helps?|makes?|does|is|are|was|were|can|could|will|would|should|must|may|might)\b/i.test(
    normalizeText(text),
  );
}



export function findBlankParaphraseDifficultyIssue(
  correctText: string,
  originalExpression: string,
  requestedDifficulty: string | undefined,
): { code: string; message: string } | null {
  const wordCount = countWordsForQuality(correctText);
  const contentCount = countContentTokens(correctText);
  const originalWordCount = countWordsForQuality(originalExpression);
  const originalContentCount = countContentTokens(originalExpression);

  if (requestedDifficulty === "BASIC") {
    const advancedCount = [...contentTokens(correctText)].filter((token) =>
      BASIC_PARAPHRASE_ADVANCED_WORDS.has(token),
    ).length;
    if (wordCount > 12 || advancedCount > 1 || /[;:]/.test(correctText)) {
      return {
        code: "blank-paraphrase-difficulty-mismatch",
        message:
          "BASIC PARAPHRASE blank should use short high-frequency wording, not dense academic phrasing.",
      };
    }
  }

  if (requestedDifficulty === "INTERMEDIATE") {
    const ornateCount = [...contentTokens(correctText)].filter((token) =>
      INTERMEDIATE_PARAPHRASE_OVERLY_ORNATE_WORDS.has(token),
    ).length;
    if (
      originalWordCount < 4 ||
      originalContentCount < 4 ||
      wordCount < 4 ||
      contentCount < 4
    ) {
      return {
        code: "blank-paraphrase-difficulty-mismatch",
        message:
          "INTERMEDIATE PARAPHRASE blank should be more than a short local synonym swap; choose a fuller source relation and paraphrase.",
      };
    }
    if (wordCount > 16 || ornateCount > 0) {
      return {
        code: "blank-paraphrase-difficulty-mismatch",
        message:
          "INTERMEDIATE PARAPHRASE blank should stay natural and readable, not drift into ornate KILLER-level diction.",
      };
    }
  }

  if (
    requestedDifficulty === "KILLER" &&
    originalContentCount >= 4 &&
    contentCount < 3
  ) {
    return {
      code: "blank-paraphrase-correct-too-thin",
      message:
        "KILLER PARAPHRASE blank should preserve a multi-part source idea, not collapse it into a thin generic phrase.",
    };
  }

  return null;
}
