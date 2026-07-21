// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, REPEATED_PHRASE_STOPWORDS, containsLoose, containsStandaloneToken, countContentTokens, isListLikeBlankTarget, isRecord, isSingleAbstractNounTarget, isSingleEnglishToken, normalizeComparableText, normalizeLabel, normalizeText, toLowerTokens } from "../../core";
import { countAttractiveBlankWrongOptions, crossesStrongContrastBoundary, extractBlankCarrierText, findAdjacentBlankConclusionIssue, findAwkwardBlankOptionPhrase, findContextualAwkwardBlankOptionPhrase, findNegativeParaphraseSlotIssue, findNoSubjectDoubleNegationIssue, findOddCapitalizedOptionToken, findStandardBlankKillerIssue, findTangledNegativeParaphraseIssue, hasNegationCue, hasOnlyWeakNegationCue, requiresCompleteClauseAfterConnector, startsWithoutClauseSubject } from "./inference-distractor";
import { findInfinitivePastOnlyForms } from "./option-grammar";
import { validateBlankAnswerParaphraseMode } from "./paraphrase";
import { analyzeBlankSeam } from "./seam";
import { findBlankSourceReconstructionMismatch } from "./source-reconstruction";
import {
  findBlankSentenceSwallowIssue,
  findBlankSpanCarveIssues,
  findBlankTrailingDependentIssue,
} from "./span-carve";



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

  const reconstructionMismatch = findBlankSourceReconstructionMismatch(
    passageWithBlank,
    originalExpression,
    passage,
  );
  if (reconstructionMismatch) {
    add(
      "error",
      "blank-source-reconstruction-mismatch",
      "Replacing the single blank with originalExpression does not reconstruct the source passage exactly. Preserve every source character outside the blank, including quotation marks and punctuation.",
    );
  }

  // span 경계 선택 결함(전문장 통삭제·삽입구 절단) — O164 실전 붕괴 클래스의 결정형 차단.
  for (const carve of findBlankSpanCarveIssues(passageWithBlank, originalExpression, correctText)) {
    add("error", carve.code, carve.message);
  }

  // O201 S3i 이식 게이트 2종 — 문장삼킴 비율(호스트 문장의 88%↑, 결정형 error)과
  // 빈칸 직후 의존 잔여 구문(", nor/which/in which/whom …" — 선행사 중의성 때문에
  // 경고로만 발화, 확정 판정은 통합 검수리 콜 축⑤ 담당. 리뷰 실측 판정 26-07-20).
  const sentenceSwallow = findBlankSentenceSwallowIssue(passage, originalExpression);
  if (sentenceSwallow) {
    add("error", sentenceSwallow.code, sentenceSwallow.message);
  }
  const trailingDependent = findBlankTrailingDependentIssue(passageWithBlank);
  if (trailingDependent) {
    add("warning", trailingDependent.code, trailingDependent.message);
  }

  // Every option must enter the same syntactic slot. A fixed relative/finite
  // tail, article, connector, preposition, or punctuation mark that fits only
  // some options turns a meaning-inference item into a grammar-elimination
  // shortcut (jul15 Q008). Run this before semantic/craft checks and keep high
  // confidence findings blocking in every quality mode.
  for (const finding of analyzeBlankSeam({
    passageWithBlank,
    correctAnswer: correctLabel,
    options: options.map((option) => ({
      label: normalizeLabel(option.label),
      text: normalizeText(option.text),
    })),
  })) {
    if (finding.severity !== "high") continue;
    const affected = Array.isArray(finding.evidence.incompatibleLabels)
      ? finding.evidence.incompatibleLabels
      : Array.isArray(finding.evidence.affectedLabels)
        ? finding.evidence.affectedLabels
        : [];
    add(
      "error",
      finding.code,
      `${finding.message}${affected.length > 0 ? ` Affected option(s): ${affected.join(", ")}.` : ""}`,
    );
  }

  // 해설 서술 단계 번호 오용 게이트 (26-07-07 실측 5/60, 유저 검수 3회+ 재발) —
  // 예전 규칙은 선지 원문을 직접 인용하지 않은 모든 문장 첫 원형숫자를 단계 번호로
  // 보아, "①은 범위를 과장해 오답이다" 같은 정상적인 축약 선지 해설도 막았다.
  // 이제는 (a) 선지 참조/판정 문맥을 먼저 제외하고, (b) 빈칸·근거·종합·순서 같은
  // 담화 단서가 붙은 원형숫자가 2회 이상일 때만 별도 불변식 코드로 차단한다.
  // 인용이 없지만 분류가 모호한 구형 신호는 craft warning 으로만 남긴다.
  {
    const explanationText = normalizeText(question.explanation);
    const CIRCLED_OPTION_MARKS = "①②③④⑤";
    if (explanationText) {
      const optionHeads = options.map((option) =>
        normalizeText(option.text).toLowerCase().slice(0, 12),
      );
      // Tokenize every marker independently. Requiring punctuation before a
      // marker missed compact fragments such as "① 빈칸 확인 ② 근거 확인".
      const markerMatches = Array.from(explanationText.matchAll(/([①②③④⑤])/g));
      const coordinatedOptionListRanges = Array.from(
        explanationText.matchAll(/[①②③④⑤](?:\s*,\s*[①②③④⑤])+(?:\s*(?:번)?\s*)(?:은|는|이|가|의)/g),
        (listMatch) => ({
          start: listMatch.index ?? 0,
          end: (listMatch.index ?? 0) + listMatch[0].length,
        }),
      );
      let broadUnquotedMarkerCount = 0;
      let narrativeMarkerCount = 0;

      for (const [markerIndex, match] of markerMatches.entries()) {
        const optionIndex = CIRCLED_OPTION_MARKS.indexOf(match[1]);
        const start = (match.index ?? 0) + match[0].length;
        const nextMarkerStart = markerMatches[markerIndex + 1]?.index;
        const rawFollowing = explanationText.slice(
          start,
          typeof nextMarkerStart === "number"
            ? nextMarkerStart
            : Math.min(explanationText.length, start + 180),
        );
        const following = rawFollowing.trimStart().toLowerCase();
        const followingContent = following.replace(/^[\s:：.)\-–—]+/, "");
        const head = optionHeads[optionIndex] ?? "";
        const quotesOwnOption =
          head.length >= 6 && followingContent.includes(head.slice(0, 8));
        const markerHasAttachedSuffix = rawFollowing.length > 0 && !/^\s/.test(rawFollowing);
        const hasAttachedOptionParticle =
          markerHasAttachedSuffix && /^(?:번\s*)?[은는이가의]/.test(following);
        const namesOptionExplicitly = /^(?:해당\s*)?(?:선지|보기|선택지)\s*(?:은|는|이|가|의)?/.test(
          followingContent,
        );
        const verdictClause = followingContent.split(/[.!?。]/u, 1)[0]?.trim() ?? "";
        const hasOutcomeWord = /(?:정답|오답|적절|부적절)/.test(verdictClause);
        // "오답이라고 판단할 수 있다" is a finite option verdict; "오답으로
        // 판단할 수 있는 기준을 세운다" is a meta-level solution step. Anchor
        // the judgment predicate at clause end and reject an intervening meta
        // noun instead of enumerating every surface conjugation near the marker.
        const hasMetaJudgmentNoun =
          /(?:정답|오답|적절|부적절)[^.!?。]{0,90}(?:기준|조건|규칙|항목|순서|방법)/.test(
            verdictClause,
          );
        const endsInJudgmentPredicate =
          /(?:이다|입니다|이므로|이어서|(?:볼|할|판단할|인정할)\s*수\s*있(?:다|습니다)|(?:봐야|보아야|분류해야|처리해야)\s*한다|판단된다|(?:정답|오답)(?:이라|이라고)\s*판단한다|인정된다|분류된다|간주된다|해당한다|해당한다고\s*판단한다|소거된다|제외된다|제외한다)\s*$/u.test(
            verdictClause,
          );
        // A marker followed by an explicit terminal outcome assertion is an
        // option analysis even when a discourse adverb ("먼저/다음으로") is
        // present. Match the outcome phrase and its tightly-bound predicate as
        // one anchored unit; merely mentioning a "정답 근거/오답 기준" before
        // a narrative verb must not receive this exemption.
        const hasTerminalOutcomeAssertion =
          /(?:정답|오답)\s*(?:(?:이다|입니다|이므로|이어서)|(?:이?라(?:고)?|이라고|으로|임이)\s*(?:본다|보인다|분명하다|확실하다|확정된다|결론짓는다|귀결된다|판정한다|판단한다|인정된다|분류된다|간주된다|해당한다)|(?:으로\s*)?(?:봐야|보아야|분류해야|처리해야)\s*한다|(?:이?라(?:고)?|이라고|으로)\s*(?:볼|할|판단할|인정할)\s*수\s*있(?:다|습니다))\s*$/u.test(verdictClause) ||
          /(?:적절|부적절)\s*(?:하다|합니다|하다고\s*(?:본다|보인다|판단한다|판정한다|결론짓는다|볼\s*수\s*있(?:다|습니다)))\s*$/u.test(
            verdictClause,
          );
        const hasDirectOptionVerdict =
          (hasOutcomeWord && !hasMetaJudgmentNoun &&
            (endsInJudgmentPredicate || hasTerminalOutcomeAssertion)) ||
          (!hasMetaJudgmentNoun && /(?:소거된다|제외된다|제외한다)\s*$/u.test(verdictClause));
        const hasNarrativeDiscourseCue =
          /^(?:먼저|우선|첫째|첫\s*번째|처음|이어서|다음으로|그다음|그\s*다음|둘째|마지막으로|끝으로|따라서|그러므로|결국)(?:\s|,|는|은)/.test(
            followingContent,
          ) ||
          /^(?:빈칸(?:\s*문장|은|의|에서)?|근거(?:\s*문장|는|가)?|앞서|앞선|이\s*두|두\s*문장|이를\s*종합|문맥(?:은|상|에서)?|논지(?:는|의|상)?|지문(?:은|의|에서)?|전체\s*글|글의\s*흐름|핵심\s*근거|결론(?:은|에서)?)(?:\s|,|을|를|이|가|은|는|의)/.test(
            followingContent,
          ) ||
          // A numbered clause can be an unmistakable solver operation even
          // without an overt discourse adverb. Keep this bounded to terminal
          // analysis/selection actions; the option-reference checks below run
          // first, so "①은 … 오답이다" remains a legitimate option verdict.
          (/(?:확인|찾|해석|연결|확정|추적|읽|묶|표시|제거|대입|비교|파악|추출|만들|대응시키|반영|검토|계산|정리|대비|선택|분리|배치|적용|완성|고르|택하|넣|모으|삼)(?:하|한|해|되)?(?:ㄴ다|는다|다)\s*$/u.test(
            verdictClause,
          ) || /(?:정한다|고른다|모은다|만든다|넣는다|읽는다|찾는다|삼는다)\s*$/u.test(verdictClause));
        const markerPosition = match.index ?? 0;
        const isCoordinatedOptionListMember = coordinatedOptionListRanges.some(
          (range) => markerPosition >= range.start && markerPosition < range.end,
        );
        const isOptionReference =
          isCoordinatedOptionListMember ||
          quotesOwnOption ||
          namesOptionExplicitly ||
          (hasAttachedOptionParticle &&
            /(?:정답|오답|선지|보기|과장|과도|축소|확대|왜곡|반전|뒤집|일치|무관|소거)/.test(
              followingContent,
            )) ||
          hasDirectOptionVerdict;

        if (!isOptionReference) {
          broadUnquotedMarkerCount += 1;
        }

        if (!isOptionReference && hasNarrativeDiscourseCue) {
          narrativeMarkerCount += 1;
        }
      }

      if (broadUnquotedMarkerCount >= 2) {
        add(
          "warning",
          "blank-explanation-step-numbering",
          "Explanation may be using circled digits (①②③…) as prose structure rather than option references. Prefer 먼저/이어서/따라서 and reserve ①~⑤ for citing options.",
        );
      }
      if (narrativeMarkerCount >= 2) {
        add(
          "error",
          "blank-explanation-narrative-circled-numbering",
          "Explanation uses two or more circled option digits as narrative/discourse step numbers. Replace those step labels with 먼저/이어서/따라서 and reserve ①~⑤ strictly for option references.",
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

  // A transformed correct option can still be leaked if that *new wording*
  // remains verbatim elsewhere in the student-visible carrier. Keep this
  // separate from answer-not-transformed: the option may be a legitimate
  // paraphrase of originalExpression while still being directly copyable from
  // another sentence. This is an exposure failure, never a craft-only issue.
  if (isAnswerParaphraseMode && correctText && passageWithBlank) {
    const transformedAnswerVisible = containsNormalizedEnglishPhrase(
      passageWithBlank,
      correctText,
    );
    if (transformedAnswerVisible) {
      add(
        "error",
        "blank-paraphrase-correct-residual-visible",
        `The paraphrased correct option "${correctText.slice(0, 60)}" remains verbatim in passageWithBlank (answer leak). Rewrite the correct option or choose a carrier where the answer wording is not visible.`,
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
    const invalidInfinitiveForms = findInfinitivePastOnlyForms(optionText);
    if (invalidInfinitiveForms.length > 0) {
      add(
        "error",
        "blank-option-infinitive-past-form",
        `BLANK_INFERENCE option ${normalizeLabel(option.label) || "(unlabeled)"} uses an irregular past form after infinitive "to": ${invalidInfinitiveForms
          .map(({ form }) => `to ${form}`)
          .join(", ")}. Use the base verb form.`,
      );
      break;
    }
    // Duplicating a left-context frame or stacking a preposition makes the
    // substituted sentence malformed. Keep this validity failure separate
    // from lexical awkwardness so ship-first/salvage cannot demote it.
    const contextualAwkwardOptionPhrase = findContextualAwkwardBlankOptionPhrase(
      blankCarrierText,
      optionText,
    );
    if (contextualAwkwardOptionPhrase) {
      add(
        "error",
        "blank-option-slot-syntax",
        `BLANK_INFERENCE option is syntactically malformed in the blank sentence: ${contextualAwkwardOptionPhrase}.`,
      );
      break;
    }
    const awkwardOptionPhrase = findAwkwardBlankOptionPhrase(optionText);
    if (awkwardOptionPhrase) {
      add(
        "error",
        "blank-awkward-option",
        `BLANK_INFERENCE option contains an awkward or non-CSAT-like phrase: ${awkwardOptionPhrase}.`,
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



function containsNormalizedEnglishPhrase(text: string, phrase: string): boolean {
  const normalizeApostrophes = (value: string) =>
    value.normalize("NFKC").toLowerCase().replace(/[‘’‛]/g, "'").trim();
  const normalizedPhrase = normalizeApostrophes(phrase);
  if (!/[a-z0-9]/.test(normalizedPhrase)) return false;

  // Preserve meaningful punctuation literally (comma, slash, ampersand,
  // parentheses, colon, abbreviation periods, semicolon, plus). Only spacing
  // and dash variants are intentionally equivalent, matching the existing
  // evidence-based/evidence based contract. Tokenizing to words first erased
  // those punctuation distinctions and missed exact visible answers.
  const parts = normalizedPhrase.split(/([\s\-\u2010-\u2015]+)/u).filter(Boolean);
  const patternBody = parts.map((part) =>
    /^[\s\-\u2010-\u2015]+$/u.test(part)
      ? "(?:[\\s\\-\\u2010-\\u2015]+)"
      : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("");
  const startsWithWord = /^[a-z0-9]/i.test(normalizedPhrase);
  const endsWithWord = /[a-z0-9]$/i.test(normalizedPhrase);
  const pattern = new RegExp(
    `${startsWithWord ? "(?<![A-Za-z0-9])" : ""}${patternBody}${endsWithWord ? "(?![A-Za-z0-9])" : ""}`,
    "i",
  );
  return pattern.test(normalizeApostrophes(text));
}
