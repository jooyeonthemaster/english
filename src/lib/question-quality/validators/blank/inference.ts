// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, REPEATED_PHRASE_STOPWORDS, countContentTokens, isListLikeBlankTarget, isRecord, isSingleAbstractNounTarget, normalizeComparableText, normalizeLabel, normalizeText, toLowerTokens } from "../../core";
import { countAttractiveBlankWrongOptions, crossesStrongContrastBoundary, extractBlankCarrierText, findAdjacentBlankConclusionIssue, findAwkwardBlankOptionPhrase, findContextualAwkwardBlankOptionPhrase, findNegativeParaphraseSlotIssue, findNoSubjectDoubleNegationIssue, findOddCapitalizedOptionToken, findStandardBlankKillerIssue, findTangledNegativeParaphraseIssue, hasNegationCue, hasOnlyWeakNegationCue, requiresCompleteClauseAfterConnector, startsWithoutClauseSubject } from "./inference-distractor";
import { validateBlankAnswerParaphraseMode } from "./paraphrase";



export function validateBlankInferenceQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  blankInferenceParaphraseAnswer: boolean | undefined,
  blankInferenceGranularity: "auto" | "word" | "phrase" | "clause" | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  // "단어" 단위는 교사가 일부러 단일 단어 빈칸을 고른 것 — 크기/단일명사 게이트를 건너뛴다
  // (그렇지 않으면 의도된 단어 빈칸이 거부되어 생성 실패로 이어질 수 있음).
  const isWordGranularity = blankInferenceGranularity === "word";
  const isNegativeParaphraseMode = question.blankAnswerMode === "DOUBLE_NEGATIVE";
  const isParaphraseMode = question.blankAnswerMode === "PARAPHRASE";
  // 변형 정답 모드(DN·패러프레이즈)는 빈칸 설계 결함(슬롯 문법)을 error 로 승격한다.
  const isTransformedMode = isNegativeParaphraseMode || isParaphraseMode;
  // jooyeon 변형 빈칸 토글 경로 — 정답 패러프레이즈 게이트(not-transformed 등)용.
  const isAnswerParaphraseMode =
    question.blankAnswerMode === "PARAPHRASE" ||
    (blankInferenceParaphraseAnswer === true && !isNegativeParaphraseMode);
  const originalExpression = normalizeText(question.originalExpression);
  const passageWithBlank = normalizeText(question.passageWithBlank);
  const blankCarrierText = extractBlankCarrierText(passageWithBlank);
  const correctLabel = normalizeLabel(question.correctAnswer);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctOption = options.find((option) => normalizeLabel(option.label) === correctLabel);
  const correctText = normalizeText(correctOption?.text);
  const wrongOptions = options.filter((option) => normalizeLabel(option.label) !== correctLabel);
  const wrongNegationCount = wrongOptions.filter((option) =>
    hasNegationCue(normalizeText(option.text)),
  ).length;
  const totalNegationCount = options.filter((option) =>
    hasNegationCue(normalizeText(option.text)),
  ).length;

  if (!correctText) {
    add("error", "blank-missing-answer", "BLANK_INFERENCE item is missing a correct option text.");
    return;
  }

  if (isAnswerParaphraseMode) {
    validateBlankAnswerParaphraseMode(
      question,
      options,
      originalExpression,
      blankCarrierText,
      correctText,
      correctLabel,
      passage,
      requestedDifficulty,
      add,
    );
  }

  if (crossesStrongContrastBoundary(originalExpression)) {
    add(
      isTransformedMode ? "error" : "warning",
      "blank-crosses-contrast",
      "BLANK_INFERENCE blank must not swallow a contrast marker; keep but/rather/instead structure visible.",
    );
  }

  if (
    !isWordGranularity &&
    requestedDifficulty === "KILLER" &&
    countContentTokens(originalExpression) < 2
  ) {
    add(
      isTransformedMode ? "error" : "warning",
      "blank-target-too-small",
      "KILLER BLANK_INFERENCE should target a meaningful phrase or relation, not a single obvious keyword.",
    );
  }

  if (
    requestedDifficulty === "KILLER" &&
    !isNegativeParaphraseMode &&
    !isAnswerParaphraseMode
  ) {
    const killerSourceIssue = findStandardBlankKillerIssue(originalExpression);
    if (killerSourceIssue) {
      add("error", killerSourceIssue.code, killerSourceIssue.message);
    }
  }

  if (!isWordGranularity && isSingleAbstractNounTarget(originalExpression)) {
    add(
      isTransformedMode ? "error" : "warning",
      "blank-single-abstract-noun",
      "BLANK_INFERENCE should avoid targeting a single abstract noun when a logical phrase is available.",
    );
  }

  if (isListLikeBlankTarget(originalExpression)) {
    add(
      "error",
      "blank-target-list-like",
      "BLANK_INFERENCE should not target a long, punctuated, or list-like span.",
    );
  }

  const adjacentConclusionIssue = findAdjacentBlankConclusionIssue(
    passageWithBlank,
    correctText,
  );
  if (adjacentConclusionIssue) {
    add("error", adjacentConclusionIssue.code, adjacentConclusionIssue.message);
  }

  const awkwardCorrectPhrase = findAwkwardBlankOptionPhrase(correctText);
  if (awkwardCorrectPhrase) {
    add(
      "error",
      "blank-awkward-correct-option",
      `BLANK_INFERENCE correct option contains an awkward or non-CSAT-like phrase: ${awkwardCorrectPhrase}.`,
    );
  }

  for (const option of options) {
    const optionText = normalizeText(option.text);
    const awkwardOptionPhrase = findAwkwardBlankOptionPhrase(optionText);
    if (awkwardOptionPhrase) {
      add(
        "error",
        "blank-awkward-option",
        `BLANK_INFERENCE option contains an awkward or non-CSAT-like phrase: ${awkwardOptionPhrase}.`,
      );
      break;
    }
    const contextualAwkwardOptionPhrase = findContextualAwkwardBlankOptionPhrase(
      blankCarrierText,
      optionText,
    );
    if (contextualAwkwardOptionPhrase) {
      add(
        "error",
        "blank-awkward-option",
        `BLANK_INFERENCE option is awkward in the blank sentence: ${contextualAwkwardOptionPhrase}.`,
      );
      break;
    }
  }

  // 등위 명사열 중간절단 누설: 빈칸이 "_____, X, Y, and Z" 형태로 등위 나열의 첫
  // 항목 자리에 carve되면, 정답의 꼬리 단어가 뒤따르는 명사열을 문법적으로 헤드한다
  // → 학생이 의미 추론 없이 "명사로 끝나는 보기"를 문법만으로 고를 수 있다(실측
  // BLANK_INFERENCE 누설). 정답 무효급 → 차단(repair/재시도가 다른 자리를 고르게).
  if (
    /_____,\s+(?!(?:which|who|whom|whose|that|where|when|while|and|or|but|so|because|although|though|since|if|unless|as|to)\b)[A-Za-z][^.!?]{1,80}?,\s+(?:and|or)\s+[A-Za-z]/i.test(
      blankCarrierText,
    )
  ) {
    add(
      "error",
      "blank-mid-coordinated-list-carve",
      'The blank is carved at the head of a coordinated list ("_____, X, Y, and Z"); the answer tail completes the list grammatically and is selectable without comprehension. Blank a logical clause/predicate/relation instead.',
    );
  }

  if (/\b(?:such as|including|for example)\s+_____/.test(blankCarrierText)) {
    add(
      isTransformedMode ? "error" : "warning",
      "blank-example-list-slot",
      "Avoid example-list blanks; choose a logical clause, predicate, or relation where passage reasoning decides the answer.",
    );
  }

  if (passage) {
    const attractiveWrongCount = countAttractiveBlankWrongOptions(
      options,
      correctLabel,
      passage,
      correctText,
    );
    if (attractiveWrongCount === 0) {
      add(
        // KILLER 는 간섭 오답이 핵심 변별 장치 — 무간섭이면 모드 무관 error.
        isTransformedMode || requestedDifficulty === "KILLER" ? "error" : "warning",
        "blank-weak-distractors",
        "BLANK_INFERENCE has no wrong options with passage-keyword, semantic, or polarity overlap.",
      );
    } else if (attractiveWrongCount < 2) {
      // KILLER 도 warning 유지 — 추상 패러프레이즈 오답은 본문 키워드 재활용이
      // 적어 검출기가 과소평가한다. error 승격 시 재시도 폭증 실측(iter2 52회).
      add(
        "warning",
        "blank-weak-distractors",
        "BLANK_INFERENCE should have more wrong options with passage-keyword, semantic, or polarity overlap.",
      );
    }
  }

  if (isParaphraseMode) {
    // 슬롯 문법 가드 (검수 실측 critical 2종):
    // ① 스팬이 주격 대명사로 시작하는 절인데 정답이 무주어 동사로 시작 →
    //    "As a result, is deprived of..." 비문.
    if (
      /^(?:she|he|it|they|we|i|you)\b/i.test(originalExpression) &&
      // be/조동사/-ing 시작만 — 복수 명사 주어("systems ...")를 오탐하지 않게
      // 일반 3단수 동사(-s)는 제외하고 프롬프트(2b)에 맡긴다.
      /^(?:is|are|was|were|has|have|had|[a-z]+ing)\b/.test(correctText)
    ) {
      add(
        "error",
        "blank-paraphrase-slot-missing-subject",
        "The blanked span starts with a subject pronoun, so the correct option must also contain a subject; a bare predicate produces a broken sentence.",
      );
    }
    // ② "to ___" 슬롯에 동명사 정답 → "is to sacrificing..." 비문.
    if (/\bto\s+_____/.test(blankCarrierText) && /^[a-z]+ing\b/.test(correctText)) {
      add(
        "error",
        "blank-paraphrase-slot-to-infinitive",
        "A to-infinitive blank needs the correct option to start with a base verb, not a gerund.",
      );
    }
    // ③ be 동사가 빈칸 밖에 남았는데 정답이 정동사로 시작 → "is turns out" 비문
    //    (스팬이 보어인데 패러프레이즈가 술부 전체를 재진술한 스팬 불일치).
    if (
      /\b(?:is|are|was|were)\s+_____/.test(blankCarrierText) &&
      /^(?:turns?|seems?|appears?|becomes?|proves?|remains?|looks?|sounds?|feels?|gets?|grows?|stays?|is|are|was|were|has|have|had)\b/.test(
        correctText,
      )
    ) {
      add(
        "error",
        "blank-paraphrase-slot-double-verb",
        "The blank follows a be-verb, so the correct option must be a complement phrase, not start with another finite verb.",
      );
    }
    // 극성 지름길 차단: 정답이 부정 극성인데 오답에 부정 극성이 하나도 없으면
    // 'Unfortunately' 같은 전환 단서 + 극성 스캔만으로 즉답된다 (검수 실측 —
    // KILLER 미달의 최다 원인). DN 의 negative-distractor 게이트와 동일 패턴.
    if (hasNegationCue(correctText) && wrongNegationCount < 1) {
      add(
        "error",
        "blank-killer-polarity-shortcut",
        "PARAPHRASE blank with a negative-polarity answer needs at least 1 negative-polarity wrong option; otherwise polarity scanning alone solves the item.",
      );
    } else if (hasNegationCue(correctText) && wrongNegationCount < 2) {
      add(
        "warning",
        "blank-killer-polarity-shortcut",
        "PARAPHRASE blank should include at least 2 negative-polarity wrong options to block polarity scanning.",
      );
    }
    // KILLER 패러프레이즈 정답 검증 — 원문 verbatim 이면 추론 없이 풀린다.
    if (
      originalExpression &&
      normalizeComparableText(correctText) === normalizeComparableText(originalExpression)
    ) {
      add(
        "error",
        "blank-paraphrase-answer-not-transformed",
        "PARAPHRASE blank must use an abstract restatement as the correct option, not the verbatim originalExpression.",
      );
    } else if (originalExpression) {
      const sourceTokens = toLowerTokens(originalExpression).filter(
        (t) => t.length >= 3 && !REPEATED_PHRASE_STOPWORDS.has(t),
      );
      const answerTokens = new Set(toLowerTokens(correctText));
      const sharedCount = sourceTokens.filter((t) => answerTokens.has(t)).length;
      if (sourceTokens.length >= 2 && sharedCount / sourceTokens.length > 0.6) {
        add(
          "warning",
          "blank-paraphrase-too-similar",
          "PARAPHRASE blank correct option reuses most of the source span's content words; restate it more abstractly.",
        );
      }
    }
  }

  if (!isNegativeParaphraseMode) return;

  if (originalExpression && normalizeComparableText(correctText) === normalizeComparableText(originalExpression)) {
    add(
      "error",
      "double-negative-answer-not-transformed",
      "DOUBLE_NEGATIVE blank must use a transformed correct option, not the verbatim originalExpression.",
    );
  }

  if (!hasNegationCue(correctText)) {
    add(
      "error",
      "double-negative-no-option-negation",
      "DOUBLE_NEGATIVE blank correct option must contain a negation cue or negative expression.",
    );
  }

  if (wrongNegationCount < 1) {
    add(
      "error",
      "negative-paraphrase-not-enough-negative-distractors",
      `Correct option must not be the only negative-looking option; expected at least 1 negative-looking wrong option, got ${wrongNegationCount}.`,
    );
  } else if (wrongNegationCount < 2) {
    add(
      "warning",
      "negative-paraphrase-thin-negative-distractors",
      `Negative-paraphrase blank should include at least 2 negative-looking wrong options; got ${wrongNegationCount}.`,
    );
  }

  if (totalNegationCount < 2) {
    add(
      "error",
      "negative-paraphrase-negative-option-shortcut",
      `Negative-paraphrase blank needs at least 2 negative-looking options total, got ${totalNegationCount}.`,
    );
  } else if (totalNegationCount < 3) {
    add(
      "warning",
      "negative-paraphrase-negative-option-shortcut",
      `Negative-paraphrase blank is stronger with at least 3 negative-looking options total; got ${totalNegationCount}.`,
    );
  }

  const slotIssue = findNegativeParaphraseSlotIssue(blankCarrierText, correctText);
  if (slotIssue) {
    add("error", slotIssue.code, slotIssue.message);
  }

  const noSubjectDoubleNegationIssue = findNoSubjectDoubleNegationIssue(
    blankCarrierText,
    correctText,
  );
  if (noSubjectDoubleNegationIssue) {
    add("error", noSubjectDoubleNegationIssue.code, noSubjectDoubleNegationIssue.message);
  }

  const tangledNegationIssue = findTangledNegativeParaphraseIssue(correctText);
  if (tangledNegationIssue) {
    add("error", tangledNegationIssue.code, tangledNegationIssue.message);
  }

  for (const option of options) {
    const optionText = normalizeText(option.text);
    const oddCapital = findOddCapitalizedOptionToken(optionText);
    if (oddCapital) {
      add(
        "error",
        "double-negative-option-capitalization",
        `DOUBLE_NEGATIVE option contains unexpected capitalization: ${oddCapital}.`,
      );
      break;
    }
  }

  if (hasOnlyWeakNegationCue(blankCarrierText) && countContentTokens(originalExpression) < 3) {
    add(
      "error",
      "double-negative-weak-rarely-slot",
      "Avoid shallow weak-negation blanks such as rarely + a single positive concept; choose a stronger negation structure.",
    );
  }

  if (requiresCompleteClauseAfterConnector(blankCarrierText) && startsWithoutClauseSubject(correctText)) {
    add(
      "error",
      "double-negative-clause-missing-subject",
      "Options after since/because/that must be complete clauses with an explicit subject.",
    );
  }

  if (/\bbecause\s+_____/.test(blankCarrierText) && /^(?:without|by|not by)\b/i.test(correctText)) {
    add(
      "error",
      "double-negative-because-phrase-slot",
      "A because-blank needs a clause, not a bare prepositional or without-phrase.",
    );
  }

  const answerLogic = normalizeText(question.answerLogic);
  if (answerLogic.length < 20) {
    add(
      "warning",
      "double-negative-thin-logic",
      "DOUBLE_NEGATIVE blank should include answerLogic explaining the negation trap.",
    );
  }
}
