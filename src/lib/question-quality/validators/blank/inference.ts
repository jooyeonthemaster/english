// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, REPEATED_PHRASE_STOPWORDS, containsLoose, containsStandaloneToken, countContentTokens, isListLikeBlankTarget, isRecord, isSingleAbstractNounTarget, isSingleEnglishToken, normalizeComparableText, normalizeLabel, normalizeText, toLowerTokens } from "../../core";
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

  // 해설 서술 단계 번호 오용 게이트 (26-07-07 실측 5/60, 유저 검수 3회+ 재발) —
  // 해설 본문의 문장 첫머리 원형숫자(①~⑤)가 해당 선지 텍스트 인용 없이 담화
  // 서술("① 빈칸 문장은…, ② 근거는…")을 이끌면 설명 '단계 번호'다. 선지
  // 번호와 같은 기호계라 학생이 정답을 오독한다. 정당한 선지 분석("③ 'option
  // text'는 … 오답")은 그 선지 텍스트 인용으로 구분되어 통과한다.
  {
    const explanationText = normalizeText(question.explanation);
    const CIRCLED_OPTION_MARKS = "①②③④⑤";
    if (explanationText) {
      const optionHeads = options.map((option) =>
        normalizeText(option.text).toLowerCase().slice(0, 12),
      );
      let stepMarkerCount = 0;
      for (const match of explanationText.matchAll(
        /(?:^|[.!?다:]\s+)([①②③④⑤])/g,
      )) {
        const optionIndex = CIRCLED_OPTION_MARKS.indexOf(match[1]);
        const start = (match.index ?? 0) + match[0].length;
        const following = explanationText
          .slice(start, start + 90)
          .toLowerCase();
        const head = optionHeads[optionIndex] ?? "";
        const quotesOwnOption = head.length >= 6 && following.includes(head.slice(0, 8));
        if (!quotesOwnOption) stepMarkerCount += 1;
      }
      if (stepMarkerCount >= 2) {
        add(
          "error",
          "blank-explanation-step-numbering",
          "Explanation prose uses circled digits (①②③…) as narrative step numbers instead of option references — students misread them as option numbers. Remove step numbering (use 먼저/이어서/따라서) and reserve ①~⑤ strictly for citing options.",
        );
      }
    }
  }

  // 단일 빈칸 잔존 누수 게이트 (wave1) — SOURCE_EXACT 모드는 정답 선지가 빈칸으로
  // 제거된 원문 스팬(originalExpression) 그대로다. 그 스팬이 빈칸 처리된 지문의
  // 다른 곳에 verbatim 으로 남아 있으면 학생이 베껴 즉답한다(정답 노출).
  // multi-blank-answer-visible 의 단일 빈칸 미러 — PARAPHRASE/DOUBLE_NEGATIVE 는
  // 자체 변형/누수 게이트가 있으므로 여기서 발화하지 않는다. RELAXED_BLOCKING.
  if (!isTransformedMode && !isAnswerParaphraseMode && originalExpression && passageWithBlank) {
    const residualVisible = isSingleEnglishToken(originalExpression)
      ? containsStandaloneToken(passageWithBlank, originalExpression)
      : containsLoose(passageWithBlank, originalExpression);
    if (residualVisible) {
      add(
        "error",
        "blank-answer-residual-visible",
        `The blanked answer span "${originalExpression.slice(0, 60)}" still appears verbatim elsewhere in passageWithBlank (answer leak). Blank a span that occurs only once, or choose a different target.`,
      );
    }
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

  // ── 슬롯 복원 무결성 (모드 불문, F급) — 26-07-06 검수 패널 FATAL 3건 대응 ──
  // 원문 스팬(originalExpression)이 "빈칸이 무엇을 삼켰는지"의 진실 앵커다: 스팬
  // 형태가 선지가 갖춰야 할 문법 골격을 결정한다. 빈칸 앞 조각만 보는 나이브 규칙은
  // 코퍼스 실측 오탐율 85~92% — 아래 검사는 스팬 형태 + 선지 표면의 고정밀 조합만
  // 본다. 기존 슬롯 가드(PARAPHRASE 한정·정답 선지만·코퓰러/aux 시작만)의 4중
  // 사각(실측: 정답이 bare 과거동사 시작 + 오답 3개가 "were" 시작인데 무검사)을 막는다.
  {
    const optionSurfaces = options.map((option) => ({
      label: normalizeLabel(option.label),
      text: normalizeText(option.text),
    }));
    // 주어가 될 수 없는 시작 토큰(정동사/조동사) — being/been/be 는 보어·분사구
    // 시작으로 정당할 수 있어 C(이중동사)에서는 제외하고 A(주어리스)에서만 포함.
    const FINITE_VERB_START =
      /^(?:is|are|was|were|am|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must)\b/i;
    const BE_FORM_START = /^(?:be|been|being)\b/i;
    // "-ed + 한정사/목적격 대명사" 시작 = 목적어를 취한 타동사 과거형 술어
    // ("transcended the ...", "shunned any ..."). 분사형용사 NP("Educated people")는
    // -ed 뒤에 명사가 오므로 구별된다.
    const PAST_VERB_WITH_OBJECT_START =
      /^[a-z]+ed\s+(?:the|a|an|any|its|his|her|their|our|your|my|this|that|these|those|some|no|all|both|each|every|it|them|him|us|me)\b/i;
    const blankIdxInCarrier = blankCarrierText.indexOf("_____");
    const preBlankFragment =
      blankIdxInCarrier >= 0 ? blankCarrierText.slice(0, blankIdxInCarrier).trim() : "";

    // [A] 주어 삼킴: 스팬이 "주어 대명사류 + 정동사"로 시작하는 완전절이면 빈칸이
    // 주어를 삼킨 것 — 모든 선지가 주어를 복원해야 한다. 술어로만 시작하는 선지는
    // 복원 시 무주어 비문("In addition to being a great scholar, transcended ...").
    // 예외: 빈칸 직전이 등위접속사(and/or/but/;)면 VP 등위로 무주어 선지도 정문일
    // 수 있어 건너뛴다.
    const spanIsSubjectInitialClause =
      /^(?:i|you|he|she|it|we|they|there|this|that|these|those|one|people)\s+(?:is|are|was|were|am|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|[a-z]+ed|[a-z]+s)\b/i.test(
        originalExpression,
      );
    const preBlankEndsWithCoordinator = /(?:\band\b|\bor\b|\bbut\b|;)\s*$/i.test(
      preBlankFragment,
    );
    if (spanIsSubjectInitialClause && !preBlankEndsWithCoordinator) {
      const predicateOnlyOptions = optionSurfaces.filter(
        ({ text }) =>
          FINITE_VERB_START.test(text) ||
          BE_FORM_START.test(text) ||
          PAST_VERB_WITH_OBJECT_START.test(text),
      );
      if (predicateOnlyOptions.length > 0) {
        add(
          "error",
          "blank-slot-subject-swallowed",
          `The blanked span is a full clause starting with its own subject ("${originalExpression.slice(0, 50)}"), so every option must restore a subject. Predicate-only option(s) ${predicateOnlyOptions
            .map(({ label }) => label)
            .join(", ")} produce subjectless broken sentences when inserted.`,
        );
      }
    }

    // [B] 조동사 삼킴 + 동명사 주어 수일치: 스팬이 조동사로 시작하고(빈칸이 조동사를
    // 삼킴) 캐리어 문장이 동명사 주어로 시작하면(동명사구 주어는 항상 단수) 선지
    // 집합에 조동사/3단수(-s) 시작이 하나도 없을 때 복원문 전체가 수일치 비문이
    // 된다("Orienting the building ... reduce the pressure ..."). 분사 전치 수식
    // ("Living in cities, people ___")은 쉼표가 반드시 개입 — 쉼표 없음 조건으로 배제.
    const spanStartsWithModal =
      /^(?:can|could|will|would|shall|should|may|might|must)\b/i.test(originalExpression);
    if (
      spanStartsWithModal &&
      /^[A-Za-z]+ing\b/.test(preBlankFragment) &&
      !preBlankFragment.includes(",") &&
      optionSurfaces.length > 0
    ) {
      const anyOptionAgrees = optionSurfaces.some(
        ({ text }) =>
          /^(?:can|could|will|would|shall|should|may|might|must|is|was|has|does)\b/i.test(
            text,
          ) || /^[a-z]{3,}(?:s|es)\s/i.test(text),
      );
      if (!anyOptionAgrees) {
        add(
          "error",
          "blank-slot-aux-agreement-broken",
          `The blank swallowed a modal ("${originalExpression.slice(0, 30)}") in a sentence whose subject is a gerund phrase (always singular), but no option starts with a modal or a singular finite verb — every restored sentence breaks subject-verb agreement.`,
        );
      }
    }

    // [C] 코퓰러 잔존 + 정동사 시작 선지: be 동사가 빈칸 밖 직전(부사 1개 개입 허용)에
    // 남아 있으면 선지는 보어구여야 한다 — 정동사 시작 선지는 복원 시 이중동사 비문
    // ("were probably were ..."). 기존 ③ 가드는 PARAPHRASE 한정 + 정답 선지만 검사
    // 했다(실측 cmr0isf0t: 오답 4개가 정동사 시작인데 무검사) — 모드 불문·전 선지 확장.
    if (/\b(?:is|are|was|were|am)(?:\s+\w+)?\s+_____/.test(blankCarrierText)) {
      const doubleVerbOptions = optionSurfaces.filter(
        ({ text }) =>
          FINITE_VERB_START.test(text) || PAST_VERB_WITH_OBJECT_START.test(text),
      );
      if (doubleVerbOptions.length > 0) {
        add(
          "error",
          "blank-slot-double-verb-option",
          `A be-verb remains immediately before the blank, so every option must be a complement phrase. Finite-verb-initial option(s) ${doubleVerbOptions
            .map(({ label }) => label)
            .join(", ")} produce double-verb broken sentences when inserted.`,
        );
      }
    }
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
