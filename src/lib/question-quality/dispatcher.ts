// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { type GrammarPointCode } from "@/lib/grammar-point-catalog";
import { normalizeGrammarAnswerCount, normalizeGrammarMarkedCount } from "./candidate-blocks/grammar";
import { validateDiversityTargetReuse } from "./candidate-blocks/shared";
import { QuestionQualityIssue, QuestionQualitySeverity, SHIP_FIRST_WARNING_CODES, VisibleQuestionLanguage, collectCorrectAnswerLabels, containsStandaloneToken, countUnderlineMarkers, countWordsForQuality, findDuplicate, isRecord, isSingleEnglishToken, isTinyFunctionWord, normalizeComparableText, normalizeLabel, normalizeText } from "./core";
import { validateAntonymQuestion } from "./validators/antonym";
import { validateFillBlankKeyQuestion } from "./validators/blank/fill-key";
import { validateBlankInferenceQuestion } from "./validators/blank/inference";
import { validateMultiBlankInferenceQuestion } from "./validators/blank/multi";
import { validateContentMatchAnswerConsistency, validateContentMatchPolarity } from "./validators/content-match";
import { isDisputableTenseToggle, validateGrammarChoiceComboQuestion } from "./validators/grammar/combo";
import { validateGrammarCorrectionQuestion } from "./validators/grammar/correction";
import { validateMarkedText } from "./validators/grammar/marked";
import { GRAMMAR_UNDERLINE_HARD_MAX_CHARS, GRAMMAR_UNDERLINE_HARD_MAX_WORDS, GRAMMAR_UNDERLINE_SOFT_MAX_CHARS, GRAMMAR_UNDERLINE_SOFT_MAX_WORDS, collectQuantityAnswerIssues, extractGrammarPointCode, findGrammarMarkerAdjacentDuplicate, findGrammarMisplacedMarker, findGrammarSurroundingMissingMarker, grammarExplanationLeaksMeta, grammarPointCodeSurfaceMismatch, isGrammarPosChangeMutation, isThinKillerGrammarErrorTarget } from "./validators/grammar/shared";
import { validateImpliedMeaningQuestion } from "./validators/implied";
import { validateIrrelevantQuestion } from "./validators/irrelevant";
import { validateKillerBar, validateTypeSignature } from "./validators/misc";
import { validateOptions } from "./validators/options";
import { validateSentenceInsertQuestion } from "./validators/sentence-insert";
import { validateSentenceOrderQuestion } from "./validators/sentence-order";
import { validateSummaryCompleteMcQuestion } from "./validators/summary/mc";
import { validateSummaryWritingQuestion } from "./validators/summary/writing";
import { validateTopicSentenceWritingQuestion } from "./validators/topic-sentence/writing";
import { validateGistNegativePolarity, validateTopicMainIdeaQuestion } from "./validators/topic";
import { validateVocabChoiceQuestion } from "./validators/vocab";



export interface ValidateQuestionQualityInput {
  typeId: string;
  question: Record<string, unknown>;
  passage?: string;
  requestedDifficulty?: string;
  irrelevantSlotCount?: number;
  grammarMarkerCount?: number;
  grammarAnswerCount?: number;
  grammarCorrectionErrorCount?: number;
  /** Legacy name; interpreted as grammarMarkerCount. */
  grammarErrorCount?: number;
  /** Requested visible direction/stem language. Omitted = type default (Korean). */
  stemLanguage?: VisibleQuestionLanguage;
  /** Requested visible option-text language. Omitted = type default. */
  optionLanguage?: VisibleQuestionLanguage;
  /** Requested VOCAB_CHOICE underlined word count (5~10). Omitted = infer/default 5. */
  vocabChoiceMarkerCount?: number;
  /** Requested VOCAB_CHOICE inappropriate word count. Omitted = 1. */
  vocabChoiceAnswerCount?: number;
  /** Requested SENTENCE_INSERT insertion-marker count (5~8). Omitted = infer/default 5. */
  sentenceInsertSlotCount?: number;
  /** Requested ANTONYM word-pair count (5~10). Omitted = infer/default 5. */
  antonymPairCount?: number;
  /** Requested BLANK_INFERENCE blank count. 2~3 routes to the multi-blank validator. */
  blankInferenceBlankCount?: number;
  /** Requested BLANK_INFERENCE paraphrased answer mode. */
  blankInferenceParaphraseAnswer?: boolean;
  /** Requested BLANK_INFERENCE blank unit. "word" intentionally allows single-word blanks. */
  blankInferenceGranularity?: "auto" | "word" | "phrase" | "clause";
  /** Requested TOPIC_SENTENCE_WRITING (cloze mode) blank count (1~2). Omitted = infer from data. */
  topicSentenceWritingBlankCount?: number;
  /** Requested option count for free-text option types (TOPIC/TITLE/...). */
  genericOptionCount?: number;
  /** Requested correct-answer count for free-text option types. Omitted = 1. */
  genericAnswerCount?: number;
  /**
   * 내용 일치 강제 정답 극성("일치"/"불일치"). 주어졌을 때만 극성 일관성 게이트가
   * 동작한다. Omitted = AUTO(모델 결정) — 게이트 미동작, 기존 동작과 동일.
   */
  contentMatchType?: "일치" | "불일치";
  /**
   * 대의파악 계열(제목/주제/요지) 강제 정답 극성. "NEGATIVE"일 때만 부정 극성
   * 게이트가 동작한다. Omitted/"POSITIVE" = 기존 동작과 동일.
   */
  answerPolarity?: "POSITIVE" | "NEGATIVE";
  /**
   * 다양성: 같은 지문에서 이미 사용된 타깃(원문 표현). 전달 시 동일 타깃 재사용을
   * error 로 표시해 strict 재시도를 유도한다 (RELAXED_BLOCKING 미포함 — relaxed
   * 폴백은 통과시키므로 타깃 풀이 고갈된 지문에서도 생성은 성공한다).
   */
  diversityUsedTargets?: string[];
}



export const SHORT_TARGET_TYPES = new Set([
  "REFERENCE",
  "CONTEXT_MEANING",
  "ANTONYM",
]);



export function validateQuestionQuality({
  typeId,
  question,
  passage,
  requestedDifficulty,
  irrelevantSlotCount,
  grammarMarkerCount,
  grammarAnswerCount,
  grammarCorrectionErrorCount,
  grammarErrorCount,
  stemLanguage,
  optionLanguage,
  vocabChoiceMarkerCount,
  vocabChoiceAnswerCount,
  sentenceInsertSlotCount,
  antonymPairCount,
  blankInferenceBlankCount,
  blankInferenceParaphraseAnswer,
  blankInferenceGranularity,
  genericOptionCount,
  genericAnswerCount,
  contentMatchType,
  answerPolarity,
  diversityUsedTargets,
}: ValidateQuestionQualityInput): QuestionQualityIssue[] {
  const issues: QuestionQualityIssue[] = [];
  const add = (severity: QuestionQualitySeverity, code: string, message: string) => {
    issues.push({ severity, code, message });
  };

  if (requestedDifficulty && question.difficulty && question.difficulty !== requestedDifficulty) {
    add("warning", "difficulty-mismatch", `Expected ${requestedDifficulty}, got ${question.difficulty}.`);
  }

  validateDiversityTargetReuse(question, typeId, diversityUsedTargets, add);

  // C5: 유형 변형(이질 필드/발문) 결정형 차단 — typeId 격리, 무조건 호출.
  validateTypeSignature(question, typeId, add);

  validateOptions(question, typeId, genericOptionCount, add);

  // Teacher-requested multi-answer for free-text option types: enforce the
  // exact answer-label count. Single-answer (default) keeps the legacy
  // behavior with no additional gate.
  if (
    typeof genericAnswerCount === "number" &&
    Number.isFinite(genericAnswerCount) &&
    genericAnswerCount >= 2
  ) {
    const expectedAnswers = Math.round(genericAnswerCount);
    const answerLabels = collectCorrectAnswerLabels(question);
    if (answerLabels.length !== expectedAnswers) {
      add(
        "error",
        "generic-answer-count",
        `Expected exactly ${expectedAnswers} correct answer label(s), got ${answerLabels.length}.`,
      );
    }
    const direction = normalizeText(question.direction);
    if (!/(모두|all|apply)/i.test(direction)) {
      add(
        "error",
        "generic-multi-answer-direction",
        "Multi-answer items must ask students to choose all appropriate options.",
      );
    }
  }
  validateMarkedText(question, add);
  validateTypeSpecific(
    question,
    typeId,
    passage,
    requestedDifficulty,
    irrelevantSlotCount,
    grammarMarkerCount ?? grammarErrorCount,
    grammarAnswerCount,
    grammarCorrectionErrorCount,
    stemLanguage,
    optionLanguage,
    vocabChoiceMarkerCount,
    vocabChoiceAnswerCount,
    sentenceInsertSlotCount,
    antonymPairCount,
    blankInferenceBlankCount,
    blankInferenceParaphraseAnswer,
    blankInferenceGranularity,
    add,
  );

  // ── 정답 극성 토글 게이트 (강제 설정일 때만 동작 — 미설정/기본 경로 불변) ──
  if (
    typeId === "CONTENT_MATCH" &&
    (contentMatchType === "일치" || contentMatchType === "불일치")
  ) {
    validateContentMatchPolarity(question, contentMatchType, add);
  }
  // C3: 복수정답 휴리스틱 — contentMatchType 신호 무관하게 항상 검사(독립).
  if (typeId === "CONTENT_MATCH") {
    validateContentMatchAnswerConsistency(question, add);
  }
  if (
    answerPolarity === "NEGATIVE" &&
    (typeId === "TOPIC" ||
      typeId === "MAIN_IDEA" ||
      typeId === "TOPIC_MAIN_IDEA" ||
      typeId === "TITLE")
  ) {
    validateGistNegativePolarity(question, typeId, add);
  }

  if (requestedDifficulty === "KILLER") {
    validateKillerBar(question, typeId, add);
  }

  // SHIP-FIRST 강등: 취향/난이도 게이트(B 36종)는 차단(error)이 아니라 경고로만
  // 남긴다 — 강사 의도 우선, 명백한 오류만 차단. 단일 진실원(개별 emit 사이트 무수정).
  return issues.map((issue) =>
    issue.severity === "error" &&
    SHIP_FIRST_WARNING_CODES.has(issue.code) &&
    !isBlockingKillerImpliedMeaningIssue(typeId, requestedDifficulty, issue.code)
      ? { ...issue, severity: "warning" as const }
      : issue,
  );
}

export function isBlockingKillerImpliedMeaningIssue(
  typeId: string,
  requestedDifficulty: string | undefined,
  code: string,
): boolean {
  return (
    typeId === "IMPLIED_MEANING" &&
    requestedDifficulty === "KILLER" &&
    KILLER_IMPLIED_MEANING_BLOCKING_CODES.has(code)
  );
}

export const KILLER_IMPLIED_MEANING_BLOCKING_CODES = new Set<string>([
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-thin-reasoning-gap",
]);



export function validateTypeSpecific(
  question: Record<string, unknown>,
  typeId: string,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  irrelevantSlotCount: number | undefined,
  grammarMarkerCount: number | undefined,
  grammarAnswerCount: number | undefined,
  grammarCorrectionErrorCount: number | undefined,
  stemLanguage: VisibleQuestionLanguage | undefined,
  optionLanguage: VisibleQuestionLanguage | undefined,
  vocabChoiceMarkerCount: number | undefined,
  vocabChoiceAnswerCount: number | undefined,
  sentenceInsertSlotCount: number | undefined,
  antonymPairCount: number | undefined,
  blankInferenceBlankCount: number | undefined,
  blankInferenceParaphraseAnswer: boolean | undefined,
  blankInferenceGranularity: "auto" | "word" | "phrase" | "clause" | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  if (SHORT_TARGET_TYPES.has(typeId)) {
    const targets = getTargetExpressions(question, typeId);
    for (const target of targets) {
      if (typeId !== "REFERENCE" && isTinyFunctionWord(target)) {
        add("warning", "weak-target-word", `${typeId} uses a very short target word: ${target}.`);
      }
      if (passage && isSingleEnglishToken(target) && !containsStandaloneToken(passage, target)) {
        add("error", "target-not-standalone", `Target is not a standalone token in the passage: ${target}.`);
      }
    }
  }

  if (typeId === "BLANK_INFERENCE") {
    const multiBlanks = Array.isArray(question.blanks)
      ? question.blanks.filter(isRecord)
      : [];
    if ((blankInferenceBlankCount ?? 1) >= 2 || multiBlanks.length >= 2) {
      // Multi-blank combination variant; the single-blank validator (and its
      // distractor/double-negative machinery) is single-blank-only.
      validateMultiBlankInferenceQuestion(
        question,
        passage,
        blankInferenceBlankCount,
        blankInferenceParaphraseAnswer,
        add,
      );
    } else {
      validateBlankInferenceQuestion(
        question,
        passage,
        requestedDifficulty,
        blankInferenceParaphraseAnswer,
        blankInferenceGranularity,
        add,
      );
    }
  }

  if (typeId === "IMPLIED_MEANING") {
    validateImpliedMeaningQuestion(
      question,
      passage,
      requestedDifficulty,
      stemLanguage,
      optionLanguage,
      add,
    );
  }

  if (typeId === "TOPIC" || typeId === "MAIN_IDEA" || typeId === "TOPIC_MAIN_IDEA") {
    validateTopicMainIdeaQuestion(question, typeId, stemLanguage, optionLanguage, add);
  }

  if (typeId === "SUMMARY_COMPLETE_MC") {
    validateSummaryCompleteMcQuestion(question, requestedDifficulty, add);
  }

  if (typeId === "SUMMARY_WRITING") {
    validateSummaryWritingQuestion(question, add);
  }

  if (typeId === "TOPIC_SENTENCE_WRITING") {
    validateTopicSentenceWritingQuestion(question, add);
  }

  if (typeId === "IRRELEVANT") {
    validateIrrelevantQuestion(
      question,
      passage,
      requestedDifficulty,
      irrelevantSlotCount,
      add,
    );
  }

  if (typeId === "SENTENCE_INSERT") {
    validateSentenceInsertQuestion(question, passage, sentenceInsertSlotCount, add);
  }

  if (typeId === "SENTENCE_ORDER") {
    validateSentenceOrderQuestion(question, add);
  }

  if (typeId === "VOCAB_CHOICE") {
    validateVocabChoiceQuestion(
      question,
      passage,
      vocabChoiceMarkerCount,
      vocabChoiceAnswerCount,
      add,
    );
  }

  if (typeId === "ANTONYM") {
    validateAntonymQuestion(question, passage, antonymPairCount, add);
  }

  if (typeId === "WORD_ORDER" && Array.isArray(question.scrambledWords)) {
    if (question.scrambledWords.some((part: unknown) => typeof part === "string" && /^[^\wA-Za-z]+$/.test(part.trim()))) {
      add("error", "punctuation-only-chunk", "WORD_ORDER has a punctuation-only chunk.");
    }

    const scrambled = question.scrambledWords.map((part: unknown) => normalizeText(part)).join(" ");
    if (normalizeText(question.modelAnswer) && scrambled === normalizeText(question.modelAnswer)) {
      add("error", "scrambled-already-solved", "scrambledWords are already in answer order.");
    }
  }

  if (typeId === "GRAMMAR_CHOICE_COMBO") {
    validateGrammarChoiceComboQuestion(question, passage, requestedDifficulty, add);
  }

  if (typeId === "GRAMMAR_ERROR") {
    const markedExpressions = Array.isArray(question.markedExpressions)
      ? question.markedExpressions.filter(isRecord)
      : [];
    const passageWithMarkers = normalizeText(question.passageWithMarkers);
    const markerCount = countUnderlineMarkers(passageWithMarkers);
    const expectedMarkedCount = normalizeGrammarMarkedCount(grammarMarkerCount);
    const expectedAnswerCount = normalizeGrammarAnswerCount(
      grammarAnswerCount,
      expectedMarkedCount,
    );
    if (markedExpressions.length !== expectedMarkedCount) {
      add("error", "grammar-marker-count", `Expected ${expectedMarkedCount} grammar marked expressions, got ${markedExpressions.length}.`);
    }
    if (passageWithMarkers && markerCount !== expectedMarkedCount) {
      add("error", "grammar-render-marker-count", `Expected ${expectedMarkedCount} rendered grammar markers, got ${markerCount}.`);
    }

    const errorLabels = markedExpressions
      .filter((markedExpression) => markedExpression.isError === true)
      .map((markedExpression) => normalizeLabel(markedExpression.label))
      .filter(Boolean);
    if (errorLabels.length !== expectedAnswerCount) {
      add("error", "grammar-error-count", `Expected exactly ${expectedAnswerCount} grammar error answer(s) for ${expectedMarkedCount} marked expressions, got ${errorLabels.length}.`);
    }
    const answerLabels = collectCorrectAnswerLabels(question);
    const missingAnswerLabels = errorLabels.filter((label) => !answerLabels.includes(label));
    const extraAnswerLabels = answerLabels.filter((label) => !errorLabels.includes(label));
    if (missingAnswerLabels.length > 0 || extraAnswerLabels.length > 0) {
      add(
        "error",
        "grammar-correct-answer-labels",
        `correctAnswer/correctAnswers must match isError labels. Missing: ${missingAnswerLabels.join(", ") || "none"}; extra: ${extraAnswerLabels.join(", ") || "none"}.`,
      );
    }
    const markedPointCodes = markedExpressions
      .map((markedExpression) => extractGrammarPointCode(markedExpression.pointCode))
      .filter((code): code is GrammarPointCode => !!code);
    if (
      expectedMarkedCount >= 5 &&
      markedPointCodes.length >= 4 &&
      new Set(markedPointCodes).size < 3
    ) {
      add(
        "error",
        "grammar-decoy-point-diversity",
        "GRAMMAR_ERROR should distribute marked expressions across at least three real grammar point codes; repeated pointCode decoys make the item feel padded.",
      );
    }
    // 단조 방지: distinct 코드가 3개여도 한 코드가 3회 이상 쓰이면(예: 관계사 b
    // 4개 — 프리미엄 실측) 한 가지 문법만 반복 검사하는 꼴이라 변별력이 떨어진다.
    // 코드당 최대 2회. strict 전용(RELAXED 미포함)이라 완전 실패는 유발하지 않는다.
    if (markedPointCodes.length >= 5) {
      const codeCounts = new Map<GrammarPointCode, number>();
      for (const code of markedPointCodes) {
        codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
      }
      const worst = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (worst && worst[1] >= 3) {
        add(
          "error",
          "grammar-decoy-point-monotony",
          `pointCode (${worst[0]}) is used ${worst[1]} times across the marks — decoys are monotonous (one grammar point repeated). Use at most 2 marks per code and spread across more grammar points.`,
        );
      }
    }
    // 규범 논쟁 자리 검출: "복수 등위 주어 + 동격 each + 단수동사"(예: A and B
    // each assumes)는 표준 규범과 실사용이 갈리는 자리 — 여기 밑줄(정답·디코이
    // 불문)을 그으면 복수정답 시비가 생긴다 (실측 critical, 프롬프트 소프트
    // 금지로는 불충분). surroundingText 는 모델이 잘라먹거나 조작해 우회할 수
    // 있으므로(attempt 2 우회 실측) 렌더링된 passageWithMarkers 에서 실제 밑줄
    // 위치 기준으로 판정한다. 좁은 패턴만 정확 타격해 과잉 reject 를 피한다.
    if (passageWithMarkers) {
      // 주의: 마커의 밑줄(_)도 \w 라서 "assumes__" 에는 \b 가 성립하지 않는다 —
      // 동사 끝 경계는 (?=\s|_) 룩어헤드로 판정한다.
      const disputedMarkerPatterns = [
        // "and/or ... each __(X) <동사>s__" — each 바로 뒤 단수동사가 밑줄
        /\b(?:and|or)\b[^.;]{0,80}?\beach\s+__\([A-Ja-j]\)\s*[A-Za-z]+s(?=\s|_)[^_]*__/i,
        // 밑줄 안에 "each + 단수동사"가 통째로 포함
        /\b(?:and|or)\b[^.;]{0,80}?__\([A-Ja-j]\)[^_]*\beach\s+[A-Za-z]+s(?=\s|_)[^_]*__/i,
      ];
      if (disputedMarkerPatterns.some((pattern) => pattern.test(passageWithMarkers))) {
        add(
          "error",
          "grammar-disputed-usage-target",
          'A marker underlines a usage-disputed spot ("compound subject + each + singular verb"). Standard and actual usage diverge here — do not underline it as answer or decoy; test a different location.',
        );
      }
    }
    // 마커 인접 토큰 중복 검출: 모델 errorExpression이 앞/뒤 문맥 단어를 포함해
    // "which is __(F) is costed__"(앞 'is' 중복) 같은 깨진 텍스트가 렌더된다 —
    // 후처리는 위치만 맞추고 토큰 중복은 못 막는다(실측 critical). +RELAXED.
    if (passageWithMarkers) {
      const dup = findGrammarMarkerAdjacentDuplicate(passageWithMarkers);
      if (dup) {
        add(
          "error",
          "grammar-marker-adjacent-duplicate",
          `A grammar marker repeats an adjacent word ("${dup}"), producing broken text; the underlined span likely swallowed a neighboring word.`,
        );
      }
    }
    // surroundingText 무효 검출: 정상 마커의 surroundingText는 그 마커 단어를
    // 반드시 포함한다. isError 마커의 surroundingText에 expression/errorExpression/
    // correction 토큰이 하나도 없으면 모델이 다른 문장을 가리킨 것 — 전역 폴백
    // 오배치와 해설-오류 불일치의 근원이다(실측: surround가 'maintenance...costly'를
    // 가리키나 마커는 'realizes that→those'에 박혀 해설이 엉뚱한 오류를 설명). +RELAXED.
    {
      const badSurround = findGrammarSurroundingMissingMarker(markedExpressions);
      if (badSurround) {
        add(
          "error",
          "grammar-surrounding-missing-marker",
          `Marker ${badSurround}'s surroundingText does not contain its own expression — the position cue points at a different sentence, risking misplacement and a mismatched explanation.`,
        );
      }
    }
    // 마커 오배치 검출: 모델 surroundingText가 오류 버전이라 윈도우 탐색이 실패하면
    // 후처리가 전역 폴백으로 엉뚱한 동형 단어에 마커를 박는다(예: 의도 'which is
    // costly' → 실제 'she is'에 → "she are"). 렌더 위치 주변이 surroundingText와
    // 전혀 겹치지 않으면 거부한다(실측: 해설과 밑줄이 다른 문장). +RELAXED.
    if (passageWithMarkers) {
      const misplaced = findGrammarMisplacedMarker(passageWithMarkers, markedExpressions);
      if (misplaced) {
        add(
          "error",
          "grammar-marker-context-mismatch",
          `Marker ${misplaced} is rendered in a context that does not match its surroundingText — it is likely placed on a wrong same-form word.`,
        );
      }
    }
    // 생성 플로우 전용 '오류 미도입' 검출: 마커를 벗긴 지문이 원문과 동일하면
    // 모든 isError 자리가 원문 그대로라는 뜻 — 원문을 오류로 판정했거나 치환이
    // 빗나간 문항(정답 무효/복수정답 실측 critical). 지문에 오류가 인쇄된
    // 추출/원본 재현 흐름은 이 게이트를 타지 않으므로 영향 없다.
    if (passage && passageWithMarkers && errorLabels.length > 0) {
      const stripped = passageWithMarkers.replace(
        /__\([A-Ja-j]\)\s*([^_]+)__/g,
        "$1",
      );
      if (normalizeText(stripped) === normalizeText(passage)) {
        add(
          "error",
          "grammar-error-not-mutated",
          "Stripping the markers reproduces the original passage unchanged — no grammar error was introduced; the answer flags unmutated source text.",
        );
      }
    }
    for (const markedExpression of markedExpressions) {
      if (markedExpression.isError !== true) continue;
      const expression = normalizeText(markedExpression.expression);
      const correction = normalizeText(markedExpression.correction);
      const errorExpression = normalizeText(markedExpression.errorExpression);
      const combined = `${expression} ${correction} ${errorExpression}`.toLowerCase();
      if (!errorExpression) {
        add("error", "grammar-missing-error-expression", "The grammar error item is missing errorExpression.");
      }
      if (errorExpression && expression && errorExpression === expression) {
        add("error", "grammar-error-not-mutated", "The grammar error surface matches the original expression.");
      }
      if (expression && errorExpression && isGrammarPosChangeMutation(expression, errorExpression)) {
        add(
          "error",
          "grammar-error-pos-change",
          `The grammar error mutates a word across part of speech (adjective/verb → noun: "${expression}" → "${errorExpression}"). Keep the same part of speech and mutate form only (e.g. adjective↔adverb, verb agreement, finite↔nonfinite).`,
        );
      }
      // 시제 단독변경(현재 3인칭↔과거, 같은 어간)은 기출 검증 변형이 아니며
      // 문맥상 두 시제가 모두 가능해 정답 시비가 된다 (실측: outpaces→outpaced).
      // 수일치(is/are·has/have)는 별도로 제외 — 그건 합법 변형(d).
      if (expression && errorExpression && isDisputableTenseToggle(expression, errorExpression)) {
        add(
          "error",
          "grammar-tense-only-error",
          `The grammar error is a tense-only change ("${expression}" ↔ "${errorExpression}"), which is contextually disputable; use a proven mutation type instead.`,
        );
      }
      // 수량(m) 정답 시비 게이트 — 의미토글·양용명사·규범논쟁·very/more 수식 예외.
      if (expression && errorExpression) {
        for (const qIssue of collectQuantityAnswerIssues(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )) {
          add("error", qIssue.code, qIssue.message);
        }
      }
      if (correction && expression && correction !== expression) {
        add("warning", "grammar-correction-differs-from-source", "The correction differs from the original expression; verify the model did not rewrite acceptable source text.");
      }
      if (/\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/.test(combined)) {
        add("error", "grammar-debatable-infinitive", "Do not use active/passive infinitive preference as the grammar-error target.");
      }
      if (requestedDifficulty === "KILLER" && isThinKillerGrammarErrorTarget(markedExpression)) {
        add(
          "error",
          "grammar-killer-thin-answer",
          "KILLER GRAMMAR_ERROR answer looks like a local one-token change without a long-distance clause, modifier, relation, or parallel-structure check.",
        );
      }
    }
    // 밑줄 span 길이 + pointCode 진실성 — 모든 밑줄(정답·디코이) 검사.
    // 화면 밑줄 표면 = 오류는 errorExpression, 디코이는 expression
    // (getMarkedSurfaceExpression 와 동일). 절/문장 통째 밑줄(프리미엄 실측 결함)을
    // egregious(relaxed에서도 차단) / wide(strict 전용) 2단으로 막는다.
    for (const markedExpression of markedExpressions) {
      const surface = normalizeText(
        markedExpression.isError === true
          ? normalizeText(markedExpression.errorExpression) ||
              normalizeText(markedExpression.expression)
          : markedExpression.expression,
      );
      if (!surface) continue;
      const markerLabel = normalizeText(markedExpression.label) || "(?)";
      const surfaceWords = countWordsForQuality(surface);
      const surfaceChars = surface.length;
      if (
        surfaceWords > GRAMMAR_UNDERLINE_HARD_MAX_WORDS ||
        surfaceChars > GRAMMAR_UNDERLINE_HARD_MAX_CHARS
      ) {
        add(
          "error",
          "grammar-underline-too-long",
          `Underline ${markerLabel} spans ${surfaceWords} words / ${surfaceChars} chars ("${surface.slice(0, 60)}") — a full clause or sentence was underlined. Underline only the minimal grammatical unit (usually 1-4 words).`,
        );
      } else if (
        surfaceWords > GRAMMAR_UNDERLINE_SOFT_MAX_WORDS ||
        surfaceChars > GRAMMAR_UNDERLINE_SOFT_MAX_CHARS
      ) {
        add(
          "error",
          "grammar-underline-wide",
          `Underline ${markerLabel} is too wide (${surfaceWords} words / ${surfaceChars} chars: "${surface.slice(0, 60)}"). Tighten it to the core grammar token (usually 1-4 words, max 5).`,
        );
      }
      const surfacePointCode = extractGrammarPointCode(markedExpression.pointCode);
      if (surfacePointCode && grammarPointCodeSurfaceMismatch(surfacePointCode, surface)) {
        add(
          "warning",
          "grammar-pointcode-span-mismatch",
          `Underline ${markerLabel} is tagged pointCode (${surfacePointCode}) but its surface "${surface.slice(0, 50)}" has no token matching that grammar point — the label looks fabricated. Move the underline onto the real ${surfacePointCode}-token or fix the code.`,
        );
      }
    }
    const grammarExplanationText = [
      question.explanation,
      question.wrongOptionExplanations,
    ]
      .map((value) => JSON.stringify(value ?? ""))
      .join(" ");
    if (
      /전치사(?:\s*\/\s*준동사|\s*\([^)]{0,40}\)|\s*(?:혹은|또는)\s*[^\s'"]{1,20})?\s*['"]?\s*(?:ask|asking|require|requires|spend|spent|developing)\b/i.test(grammarExplanationText) ||
      /\b(?:ask|asking|require|requires|spend|spent|developing)\b\s*(?:은|는|이|가|을|를|도)?\s*전치사/i.test(grammarExplanationText)
    ) {
      add("error", "grammar-category-mislabel", "Grammar explanation mislabels a verb form as a preposition.");
    }
    // 메타 누출: 해설이 출제 과정/생성 지침을 학생에게 노출(실측 u6:
    // "지시문 가이드라인의 1순위 포인트인 ...를 활용하여 ... 함정으로 X를 Y로
    // 잘못 변형하였습니다"). 학생 해설은 왜 그 형태가 어법상 틀린지만 설명해야 함.
    if (grammarExplanationLeaksMeta(grammarExplanationText)) {
      // error 로 승격(2026-06-15): warning 은 strict 재시도를 안 시켜 그대로 출하됨.
      // focus/최소대립쌍이 준 내부 framing(1순위·출제 포인트·변형 방향)을 모델이
      // 해설에 베끼는 누출이 잦아(R2 3/10), strict 재시도로 강제 회피한다.
      // RELAXED 미등록 — 끈질기면 relaxed 폴백이 출하(0수율 방지).
      add(
        "error",
        "grammar-explanation-meta-leak",
        "Grammar explanation narrates the generation process or instruction (지시문/가이드라인/출제 포인트/1순위/함정으로/X를 Y로 변형) instead of explaining the grammar from the student's view.",
      );
    }
    // CoT 덤프 백스톱: 정상 어법 해설은 300~500자. 900자 초과는 사고과정
    // 덤프(정답 번복·무관 내용 나열) 의심 (실측 focus u7: 1012자 자기모순).
    if (normalizeText(question.explanation).length > 900) {
      add(
        "warning",
        "grammar-explanation-too-long",
        "Grammar explanation is excessively long (>900 chars), suggesting a chain-of-thought dump rather than a concise student-facing rationale.",
      );
    }
  }

  if (typeId === "GRAMMAR_CORRECTION") {
    validateGrammarCorrectionQuestion(
      question,
      passage,
      grammarCorrectionErrorCount,
      requestedDifficulty,
      add,
    );
  }

  if (typeId === "FILL_BLANK_KEY") {
    validateFillBlankKeyQuestion(question, passage, add);
  }

  if ((typeId === "CONDITIONAL_WRITING" || typeId === "SENTENCE_TRANSFORM") && Array.isArray(question.conditions)) {
    if (question.difficulty === "KILLER" && question.conditions.length < 2) {
      add("warning", "killer-needs-multiple-conditions", `${typeId} KILLER should require at least two conditions.`);
    }
  }

  // M9: SENTENCE_TRANSFORM 전환 미이행 — modelAnswer 가 originalSentence 와 (구두점·대소문자·
  // 공백 정규화 후) 동일하면 요청한 문장 전환이 적용되지 않은 것. 콤마/마침표만 다른 퇴화형도
  // 잡는다(실제 전환은 어순·시제·대명사 등 단어가 바뀌므로 구두점 strip 이 오탐을 만들지 않음).
  // 빈 필드는 스킵.
  if (typeId === "SENTENCE_TRANSFORM") {
    const strip = (value: string) =>
      normalizeComparableText(value).replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
    const orig = strip(normalizeText(question.originalSentence));
    const model = strip(normalizeText(question.modelAnswer));
    if (orig && model && orig === model) {
      add(
        "error",
        "transform-answer-not-transformed",
        "SENTENCE_TRANSFORM modelAnswer가 originalSentence와 (구두점·대소문자 제외) 동일합니다 — 요청한 문장 전환이 적용되지 않았습니다.",
      );
    }
  }

  if ((typeId === "SUMMARY_COMPLETE" || typeId === "SUMMARY_COMPLETE_MC") && Array.isArray(question.blanks)) {
    const answers = question.blanks.filter(isRecord).map((blank) => normalizeText(blank.answer)).filter(Boolean);
    if (findDuplicate(answers)) {
      add("warning", "duplicate-summary-answer", `${typeId} repeats the same blank answer.`);
    }
  }
}



export function getTargetExpressions(question: Record<string, unknown>, typeId: string): string[] {
  if (typeId === "REFERENCE") return [normalizeText(question.underlinedPronoun)].filter(Boolean);
  if (typeId === "CONTEXT_MEANING") return [normalizeText(question.underlinedWord)].filter(Boolean);
  if (typeId === "VOCAB_CHOICE" || typeId === "ANTONYM") {
    const marked = Array.isArray(question.markedWords) ? question.markedWords.filter(isRecord) : [];
    return marked
      .map((word) => normalizeText(word.word) || normalizeText(word.originalWord) || normalizeText(word.substituteWord))
      .filter(Boolean);
  }
  return [];
}
