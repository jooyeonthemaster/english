// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, VisibleQuestionLanguage, collectCorrectAnswerLabels, containsHangul, containsLatinLetter, countContentTokens, countImpliedMeaningLexicalUnits, countUnderlineMarkers, countWordsForQuality, hasTrailingFunctionWord, isRecord, isSingleEnglishToken, isTinyFunctionWord, normalizeComparableText, normalizeLabel, normalizeText } from "../core";
import { countAttractiveImpliedMeaningWrongOptions, countMeaningTokenOverlap, englishWordCount, extractSingleUnderlineMarkerText, findDirectAnswerLeakage, findExpressionSentenceContext, findExpressionSentenceContextWithIndex, findImpliedMeaningAbsoluteGiveawayOption, findSameSentenceDirectAnswerLeakage, hasDirectExplanationCue, hasSurfaceHiddenGapSignal, isCentralImpliedMeaningTarget, isQuestionLikeImpliedMeaningTarget, meaningTokens } from "./implied-distractor";



export function validateImpliedMeaningQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  stemLanguage: VisibleQuestionLanguage | undefined,
  optionLanguage: VisibleQuestionLanguage | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const underlinedExpression = normalizeText(question.underlinedExpression);
  const passageWithUnderline = normalizeText(question.passageWithUnderline);
  const surfaceMeaning = normalizeText(question.surfaceMeaning);
  const impliedMeaning = normalizeText(question.impliedMeaning);
  const reasoningGap = normalizeText(question.reasoningGap);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctLabels = collectCorrectAnswerLabels(question);
  const correctLabelSet = new Set(correctLabels);
  const correctOptions = options.filter((option) => correctLabelSet.has(normalizeLabel(option.label)));
  const correctText = correctOptions.map((option) => normalizeText(option?.text)).filter(Boolean).join(" ");
  const expressionTokenCount = countContentTokens(underlinedExpression);
  const expressionWordCount = countWordsForQuality(underlinedExpression);
  const expressionLexicalUnitCount = countImpliedMeaningLexicalUnits(underlinedExpression);
  const optionTexts = options.map((option) => normalizeText(option.text)).filter(Boolean);
  const direction = normalizeText(question.direction);

  if (!underlinedExpression) {
    add("error", "implied-meaning-missing-expression", "IMPLIED_MEANING is missing underlinedExpression.");
    return;
  }

  if (stemLanguage === "en") {
    if (!containsLatinLetter(direction) || containsHangul(direction)) {
      add(
        "error",
        "implied-meaning-stem-language",
        "IMPLIED_MEANING direction must be English for this language setting.",
      );
    }
  } else if (stemLanguage === "ko" && !containsHangul(direction)) {
    add(
      "error",
      "implied-meaning-stem-language",
      "IMPLIED_MEANING direction must be Korean for this language setting.",
    );
  }

  const expectedOptionLanguage = optionLanguage ?? "en";
  if (expectedOptionLanguage === "en") {
    for (const optionText of optionTexts) {
      if (containsHangul(optionText)) {
        add(
          "error",
          "implied-meaning-option-language",
          "IMPLIED_MEANING options must be English-only; Korean text was found in an option.",
        );
        break;
      }
      if (!containsLatinLetter(optionText)) {
        add(
          "error",
          "implied-meaning-option-not-english",
          `IMPLIED_MEANING option is not a usable English phrase: ${optionText.slice(0, 80)}.`,
        );
        break;
      }
      if (englishWordCount(optionText) < 3) {
        add(
          "warning",
          "implied-meaning-option-too-short",
          "IMPLIED_MEANING options should be meaningful English phrases or clauses, not one- or two-word labels.",
        );
        break;
      }
    }
  } else {
    for (const optionText of optionTexts) {
      if (!containsHangul(optionText)) {
        add(
          "warning",
          "implied-meaning-option-language",
          "IMPLIED_MEANING options should be Korean statements for this language setting.",
        );
        break;
      }
      if (optionText.length < 6) {
        add(
          "warning",
          "implied-meaning-option-too-short",
          "IMPLIED_MEANING options should be meaningful Korean statements, not short labels.",
        );
        break;
      }
    }
  }

  if (!passageWithUnderline.includes("__")) {
    add("error", "implied-meaning-missing-underline", "IMPLIED_MEANING passageWithUnderline must include one underlined expression.");
  }

  if (countUnderlineMarkers(passageWithUnderline) !== 1) {
    add("error", "implied-meaning-underline-count", "IMPLIED_MEANING must contain exactly one underline marker.");
  }

  const visibleUnderline = extractSingleUnderlineMarkerText(passageWithUnderline);
  if (
    visibleUnderline &&
    normalizeComparableText(visibleUnderline) !== normalizeComparableText(underlinedExpression)
  ) {
    add(
      "error",
      "implied-meaning-underline-target-mismatch",
      "IMPLIED_MEANING passageWithUnderline must underline exactly the same text as underlinedExpression.",
    );
  }

  if (isSingleEnglishToken(underlinedExpression)) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-single-word-target",
      "IMPLIED_MEANING should underline a phrase, clause, or short sentence, not a single word.",
    );
  }

  if (isTinyFunctionWord(underlinedExpression) || expressionTokenCount < 2) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-target-too-short",
      "IMPLIED_MEANING target is too small to support real implied-meaning inference.",
    );
  }

  // 강사 실사용 기준: 함축의미 밑줄은 6단어 이내의 압축 표현이어야 한다.
  // 길어지면 함축의 "압축"이 무너져 주제/요지 문항처럼 보이므로 blocking error 로 재생성한다.
  if (underlinedExpression.length > 90 || expressionWordCount > 6 || expressionLexicalUnitCount > 6) {
    add(
      "error",
      "implied-meaning-target-too-long",
      "IMPLIED_MEANING target is too long: keep the underline to a compressed phrase/clause of 6 words or fewer. Use the core keyword/theme phrase, its opposite/contrast phrase, or a metaphorical/figurative phrase.",
    );
  }

  if (hasTrailingFunctionWord(underlinedExpression)) {
    add(
      "error",
      "implied-meaning-target-trailing-function",
      "IMPLIED_MEANING target is cut off at a trailing function word or preposition; copy a complete compact phrase instead.",
    );
  }

  const expressionSentenceContext = passage
    ? findExpressionSentenceContext(passage, underlinedExpression)
    : null;
  if (
    isQuestionLikeImpliedMeaningTarget(underlinedExpression) ||
    (expressionSentenceContext?.sentence && isQuestionLikeImpliedMeaningTarget(expressionSentenceContext.sentence))
  ) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-rhetorical-question-target",
      "IMPLIED_MEANING should not use a rhetorical/self-answering question as the underline target.",
    );
  }

  if (requestedDifficulty === "KILLER") {
    if (surfaceMeaning.length < 12) {
      add(
        "error",
        "implied-meaning-missing-surface-meaning",
        "KILLER IMPLIED_MEANING must include surfaceMeaning so the surface-to-hidden gap can be audited.",
      );
    }
    if (reasoningGap.length < 28) {
      add(
        "error",
        "implied-meaning-thin-reasoning-gap",
        "KILLER IMPLIED_MEANING must explain the real surface-to-hidden meaning gap, not just restate the answer.",
      );
    }
  }

  if (passage && !normalizeComparableText(passage).includes(normalizeComparableText(underlinedExpression))) {
    add(
      "error",
      "implied-meaning-target-not-in-passage",
      `underlinedExpression is not found in the original passage: ${underlinedExpression.slice(0, 80)}.`,
    );
  }

  if (passage) {
    const sentenceContext = expressionSentenceContext;
    const targetSentenceInfo = findExpressionSentenceContextWithIndex(
      passage,
      underlinedExpression,
    );
    if (
      targetSentenceInfo &&
      !isCentralImpliedMeaningTarget(
        targetSentenceInfo.sentence,
        targetSentenceInfo.index,
        targetSentenceInfo.total,
        underlinedExpression,
      )
    ) {
      add(
        requestedDifficulty === "KILLER" ? "error" : "warning",
        "implied-meaning-noncentral-target",
        "IMPLIED_MEANING underline should be a central-claim paraphrase, metaphor, compressed conclusion, or topic/gist-level expression, not a peripheral detail.",
      );
    }
    const directLeak = sentenceContext
      ? findDirectAnswerLeakage(underlinedExpression, sentenceContext.next) ??
        findSameSentenceDirectAnswerLeakage(underlinedExpression, sentenceContext.sentence)
      : null;
    if (directLeak) {
      add(
        requestedDifficulty === "KILLER" ? "error" : "warning",
        "implied-meaning-direct-answer-leak",
        `The underline is too directly answered by the next sentence: ${directLeak}.`,
      );
    }

    if (
      requestedDifficulty === "KILLER" &&
      sentenceContext?.next &&
      hasDirectExplanationCue(sentenceContext.next) &&
      !hasSurfaceHiddenGapSignal(underlinedExpression, reasoningGap)
    ) {
      add(
        "warning",
        "implied-meaning-low-surface-gap",
        "The target looks like a direct main-idea paraphrase rather than a high-gap implied-meaning target.",
      );
    }
  }

  if (
    correctText &&
    impliedMeaning &&
    containsHangul(correctText) === containsHangul(impliedMeaning) &&
    normalizeComparableText(correctText) !== normalizeComparableText(impliedMeaning) &&
    countMeaningTokenOverlap(meaningTokens(correctText), meaningTokens(impliedMeaning)) < 2
  ) {
    add(
      "warning",
      "implied-meaning-answer-summary-mismatch",
      "impliedMeaning should match the correct option's core meaning closely enough to audit the answer.",
    );
  }

  if (correctText.length > 0 && correctText.length < 8) {
    add(
      "warning",
      "implied-meaning-shallow-correct-option",
      "IMPLIED_MEANING correct option is too short to express a real implied meaning.",
    );
  }

  const evidenceChain = Array.isArray(question.evidenceChain)
    ? question.evidenceChain.map((item: unknown) => normalizeText(item)).filter(Boolean)
    : [];
  if (evidenceChain.length < 2) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-thin-evidence-chain",
      "IMPLIED_MEANING should include at least two evidenceChain steps.",
    );
  }

  if (!passage || !correctText) return;

  const attractiveWrongCount = countAttractiveImpliedMeaningWrongOptions(
    options,
    correctLabels,
    passage,
    correctText,
    underlinedExpression,
    impliedMeaning,
  );
  if (requestedDifficulty === "KILLER" && attractiveWrongCount < 2) {
    add(
      "warning",
      "implied-meaning-weak-distractors",
      "KILLER IMPLIED_MEANING should have at least two near-miss wrong options anchored in passage concepts.",
    );
  }

  if (requestedDifficulty === "KILLER") {
    const absoluteCue = findImpliedMeaningAbsoluteGiveawayOption(
      options,
      correctLabels,
      passage,
    );
    if (absoluteCue) {
      add(
        "error",
        "implied-meaning-absolute-giveaway-option",
        `KILLER IMPLIED_MEANING has an easily eliminated absolute-word distractor: ${absoluteCue}.`,
      );
    }
  }
}
