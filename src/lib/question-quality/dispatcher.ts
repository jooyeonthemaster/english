// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { type GrammarPointCode } from "@/lib/grammar-point-catalog";
import { isKoQuestionType } from "@/lib/korean/registry";
import { validateKoQuestion } from "@/lib/korean/quality/dispatch";
import { normalizeGrammarAnswerCount, normalizeGrammarMarkedCount } from "./candidate-blocks/grammar";
import { validateDiversityTargetReuse } from "./candidate-blocks/shared";
import { QuestionQualityIssue, QuestionQualitySeverity, SHIP_FIRST_WARNING_CODES, VisibleQuestionLanguage, answerRunInPassage, collectCorrectAnswerLabels, collectWrongOptionExplanations, containsStandaloneToken, countUnderlineMarkers, countWordsForQuality, findDuplicate, isRecord, isSingleEnglishToken, isTinyFunctionWord, normalizeComparableText, normalizeLabel, normalizeText, summaryWritingComparableTokens } from "./core";
import { validateAntonymQuestion } from "./validators/antonym";
import { validateConditionalWritingConditions } from "./validators/conditional-writing";
import { validateFillBlankKeyQuestion } from "./validators/blank/fill-key";
import { validateBlankInferenceQuestion } from "./validators/blank/inference";
import { validateMultiBlankInferenceQuestion } from "./validators/blank/multi";
import { validateContentMatchAnswerConsistency, validateContentMatchPolarity } from "./validators/content-match";
import { isDisputableTenseToggle, validateGrammarChoiceComboQuestion } from "./validators/grammar/combo";
import { validateGrammarCorrectionQuestion } from "./validators/grammar/correction";
import { collectGrammarExplanationLintFindings } from "./validators/grammar/explanation-lint";
import { validateMarkedText } from "./validators/grammar/marked";
import { findGrammarAnswerForcedNonword, findGrammarDecoyFillerSpan } from "./validators/grammar/nonword-filler";
import { GRAMMAR_UNDERLINE_HARD_MAX_CHARS, GRAMMAR_UNDERLINE_HARD_MAX_WORDS, GRAMMAR_UNDERLINE_SOFT_MAX_CHARS, GRAMMAR_UNDERLINE_SOFT_MAX_WORDS, collectQuantityAnswerIssues, extractGrammarPointCode, findGrammarAnswerPointNotCore, findGrammarCorrectionFormExposed, findGrammarKeypointChoiceMismatch, findGrammarKeypointNonexistentLabel, findGrammarKillerOverdrilledAnswer, findGrammarMarkerAdjacentDuplicate, findGrammarMarkerErrorFormMismatch, findGrammarMisplacedMarker, findGrammarPerceptionComplementToggle, findGrammarSurroundingMissingMarker, findGrammarTerminologyError, findGrammarTerminologyRegister, grammarExplanationLeaksMeta, grammarPointCodeSurfaceMismatch, isGrammarPosChangeMutation, isThinKillerGrammarErrorTarget } from "./validators/grammar/shared";
import { validateImpliedMeaningQuestion } from "./validators/implied";
import { validateIrrelevantQuestion } from "./validators/irrelevant";
import { validateKillerBar, validateTypeSignature } from "./validators/misc";
import { validateOptions } from "./validators/options";
import { validateReferenceQuestion } from "./validators/reference";
import { validateSentenceInsertQuestion } from "./validators/sentence-insert";
import { validateSentenceOrderQuestion } from "./validators/sentence-order";
import { validateSummaryCompleteMcQuestion } from "./validators/summary/mc";
import { validateSummaryCompleteQuestion } from "./validators/summary/complete";
import { validateSummaryWritingQuestion } from "./validators/summary/writing";
import { validateTopicSentenceWritingQuestion } from "./validators/topic-sentence/writing";
import { validateGistNegativePolarity, validateTopicMainIdeaQuestion } from "./validators/topic";
import { validateVocabChoiceQuestion } from "./validators/vocab";
import { validateWordOrderReconstruction } from "./validators/word-order";
import { chipsAreInAnswerOrder } from "@/lib/topic-sentence-writing";
import { analyzeEnglishPassageIntegrity } from "./passage-integrity";



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

function findGrammarExplanationAnswerRangeLeak(
  explanation: unknown,
  answerLabels: string[],
): string | null {
  const text = normalizeText(explanation);
  if (!text || answerLabels.length === 0) return null;
  const answerSet = new Set(answerLabels.map(normalizeLabel).filter(Boolean));
  const re =
    /(?:\uB098\uBA38\uC9C0|remaining|the rest).{0,40}\(([A-Ja-j])\)\s*(?:~|-|\u2013|\u2014|to)\s*\(([A-Ja-j])\)/g;

  for (const match of text.matchAll(re)) {
    const start = match[1]?.toUpperCase().charCodeAt(0);
    const end = match[2]?.toUpperCase().charCodeAt(0);
    if (!start || !end) continue;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let code = lo; code <= hi; code += 1) {
      const label = String.fromCharCode(code).toLowerCase();
      if (answerSet.has(label)) return match[0];
    }
  }
  return null;
}

function findGrammarExplanationRangeShorthand(explanation: unknown): string | null {
  const text = normalizeText(explanation);
  if (!text) return null;
  const re =
    /(?:\uB098\uBA38\uC9C0|remaining|the rest).{0,40}\(([A-Ja-j])\)\s*(?:~|-|\u2013|\u2014|to)\s*\(([A-Ja-j])\)/g;
  const match = re.exec(text);
  return match?.[0] ?? null;
}

function indexOfFolded(haystack: string, needle: string): number {
  if (!haystack || !needle) return -1;
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

function indexOfSurfaceMention(haystack: string, surface: string): number {
  const normalizedSurface = normalizeComparableText(surface);
  if (!haystack || !normalizedSurface) return -1;
  if (/^[a-z]{1,3}$/.test(normalizedSurface)) {
    const match = new RegExp(`\\b${escapeRegex(normalizedSurface)}\\b`, "i").exec(haystack);
    return match?.index ?? -1;
  }
  return indexOfFolded(haystack, surface);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findGrammarErrorExplanationSurfaceOrderIssue(
  question: Record<string, unknown>,
  markedExpressions: Record<string, unknown>[],
): { label: string; surface: string; correction: string } | null {
  const explanation = normalizeText(question.explanation);
  if (!explanation) return null;

  for (const markedExpression of markedExpressions) {
    if (markedExpression.isError !== true) continue;
    const label = normalizeLabel(markedExpression.label);
    if (!label) continue;
    const surface =
      normalizeText(markedExpression.errorExpression) ||
      normalizeText(markedExpression.expression);
    const correction =
      normalizeText(markedExpression.correction) ||
      normalizeText(markedExpression.expression);
    if (
      !surface ||
      !correction ||
      normalizeComparableText(surface) === normalizeComparableText(correction)
    ) {
      continue;
    }

    const labelRe = new RegExp(`(?:\\(${label}\\)|\\b${label}\\b)`, "i");
    const labelMatch = labelRe.exec(explanation);
    const segment = labelMatch
      ? explanation.slice(labelMatch.index, labelMatch.index + 360)
      : explanation;
    const surfaceIndex = indexOfSurfaceMention(segment, surface);
    const correctionIndex = indexOfSurfaceMention(segment, correction);
    if (correctionIndex >= 0 && (surfaceIndex < 0 || correctionIndex < surfaceIndex)) {
      return { label, surface, correction };
    }
  }
  return null;
}

function hasDenseGrammarMarkers(passageWithMarkers: string): boolean {
  const matches = [...passageWithMarkers.matchAll(/__\([A-Ja-j]\)\s*[^_]+__/g)];
  for (let i = 1; i < matches.length; i += 1) {
    const previous = matches[i - 1];
    const current = matches[i];
    if (previous.index === undefined || current.index === undefined) continue;
    const previousEnd = previous.index + previous[0].length;
    const between = passageWithMarkers.slice(previousEnd, current.index);
    const words = between.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
    if (words.length < 2) return true;
  }
  return false;
}

function hasUnsupportedGrammarKeyPointToken(
  question: Record<string, unknown>,
  passage: string,
): string | null {
  const keyPointText = JSON.stringify([
    question.keyPoints,
    question.explanation,
    question.wrongOptionExplanations,
  ]);
  const source = `${passage} ${question.passageWithMarkers ?? ""}`;
  for (const token of ["whether"]) {
    if (
      new RegExp(`\\b${token}\\b`, "i").test(keyPointText) &&
      !new RegExp(`\\b${token}\\b`, "i").test(source)
    ) {
      return token;
    }
  }
  return null;
}

function hasUntestedGrammarKeyPointToken(
  question: Record<string, unknown>,
  markedExpressions: Record<string, unknown>[],
): string | null {
  const keyPointText = JSON.stringify([
    question.keyPoints,
    question.explanation,
  ]);
  const markedContext = JSON.stringify(
    markedExpressions.map((markedExpression) => [
      markedExpression.expression,
      markedExpression.errorExpression,
      markedExpression.correction,
      markedExpression.surroundingText,
    ]),
  );
  for (const token of ["unless", "although", "even though"]) {
    if (
      new RegExp(`\\b${token.replace(/\s+/g, "\\s+")}\\b`, "i").test(keyPointText) &&
      !new RegExp(`\\b${token.replace(/\s+/g, "\\s+")}\\b`, "i").test(markedContext)
    ) {
      return token;
    }
  }
  return null;
}

function isMixedAsItGrammarSpan(surface: string): boolean {
  return /^as\s+it$/i.test(normalizeComparableText(surface));
}

function isSimpleThirdPersonSFlip(sourceForm: string, displayedForm: string): boolean {
  if (!sourceForm || !displayedForm) return false;
  if (sourceForm.endsWith("ies") && displayedForm === `${sourceForm.slice(0, -3)}y`) return true;
  if (displayedForm.endsWith("ies") && sourceForm === `${displayedForm.slice(0, -3)}y`) return true;
  if (sourceForm.endsWith("es") && displayedForm === sourceForm.slice(0, -2)) return true;
  if (displayedForm.endsWith("es") && sourceForm === displayedForm.slice(0, -2)) return true;
  if (sourceForm.endsWith("s") && displayedForm === sourceForm.slice(0, -1)) return true;
  if (displayedForm.endsWith("s") && sourceForm === displayedForm.slice(0, -1)) return true;
  return false;
}

function hasAdjacentSimpleSubjectVerbAgreement(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  if (!isSimpleThirdPersonSFlip(sourceForm, displayedForm)) return false;
  const source = escapeRegex(sourceForm);
  return new RegExp(
    `(?:^|[.!?]\\s+|\\b)(?:[A-Z][a-z]+|[a-z]+)\\s+${source}\\b`,
    "i",
  ).test(surroundingText);
}

function isDebatableWhoObjectTarget(surface: string, surroundingText: string): boolean {
  return (
    normalizeComparableText(surface) === "who" &&
    /\bwho\s+(?:(?:you|we|they|he|she|i|one)\s+(?:are\s+|were\s+|is\s+|was\s+)?|(?:you|we|they|he|she|i|one)'re\s+)(?:ask|asking|asked)\b/i.test(surroundingText)
  );
}

function isSemanticWhoWhatAskingTrap(sourceForm: string, displayedForm: string, surroundingText: string): boolean {
  const pair = [normalizeComparableText(sourceForm), normalizeComparableText(displayedForm)].sort().join("|");
  return pair === "what|who" && /\b(?:who|what)\s+(?:you|we|they|he|she|i|one|'re|are|were|is|was|ask|asking|asked)/i.test(surroundingText);
}

function isDemonstrativeThatWayDecoy(surface: string, surroundingText: string): boolean {
  return (
    normalizeComparableText(surface) === "that" &&
    /\bthat(?:'s|\s+is)\s+the\s+way\b/i.test(surroundingText)
  );
}

function isWeakGrammarFillerSurface(surface: string): boolean {
  return /^(?:hard|quite|more|misshapen|given|thicker|both liquid and|one|ones|this|these|those|as one)$/i.test(normalizeComparableText(surface));
}

function isDecorativeGrammarDecoy(surface: string, surroundingText: string): boolean {
  const normalizedSurface = normalizeComparableText(surface);
  if (isWeakGrammarFillerSurface(normalizedSurface)) return true;
  if (
    normalizedSurface === "it" &&
    /\b(?:as\s+it\s+might\s+appear|the\s+way\s+it\s+does)\b/i.test(surroundingText)
  ) {
    return true;
  }
  if (
    normalizedSurface === "it" &&
    !/\b(?:make|makes|made|find|finds|found|think|thinks|thought|consider|considers|considered)\s+it\s+(?:possible|impossible|easy|easier|hard|harder|difficult|necessary|important|clear|natural|useful|safe|risky|obvious|worthwhile|likely|unlikely|essential|reasonable)\b/i.test(
      surroundingText,
    ) &&
    /\bit\s+(?:is|was|has|does)\b|\bit's\b/i.test(surroundingText)
  ) {
    return true;
  }
  if (normalizedSurface === "that" && /\bthat\s+way\b/i.test(surroundingText)) {
    return true;
  }
  if (/^looks?$/.test(normalizedSurface) && /\blooks?\s+more\s+like\b/i.test(surroundingText)) {
    return true;
  }
  if (/^(?:former|latter)$/.test(normalizedSurface)) {
    return true;
  }
  if (normalizedSurface === "it's" || normalizedSurface === "it is") {
    return /\bit(?:'s|\s+is)\s+(?:not\s+)?(?:a|an|the)?\s*[a-z]/i.test(surroundingText);
  }
  if (
    normalizedSurface === "uneven" &&
    /\b(?:is|are|was|were|be|been|being|seem|seems|look|looks|become|becomes)\s+uneven\b/i.test(
      surroundingText,
    )
  ) {
    return true;
  }
  return false;
}

function isShallowNearbyPassiveDecoy(surface: string, surroundingText: string): boolean {
  const normalizedSurface = normalizeComparableText(surface);
  if (!/^(?:is|are|was|were)\s+[a-z]+(?:ed|en|own)$/.test(normalizedSurface)) return false;
  return new RegExp(
    `\\b(?:it|they|he|she|we|you)\\s+${escapeRegex(normalizedSurface)}\\b`,
    "i",
  ).test(surroundingText);
}

function isObviousLocalPronounAgreementMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!source || !displayed) return false;

  const singularPronoun = /^(?:it|this|that|he|she)$/;
  const pluralPronoun = /^(?:they|these|those|we)$/;
  const sourceEscaped = escapeRegex(source);
  const sourceBeforePluralAux = new RegExp(`\\b${sourceEscaped}\\s+(?:are|were|have|do)\\b`, "i").test(surroundingText);
  const sourceBeforeSingularAux = new RegExp(`\\b${sourceEscaped}\\s+(?:is|was|has|does)\\b`, "i").test(surroundingText);

  return (
    (pluralPronoun.test(source) && singularPronoun.test(displayed) && sourceBeforePluralAux) ||
    (singularPronoun.test(source) && pluralPronoun.test(displayed) && sourceBeforeSingularAux)
  );
}

function isObviousObjectPronounSubjectMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!source || !displayed) return false;
  if (!/^(?:me|him|her|them|us)$/.test(displayed)) return false;

  const sourceEscaped = escapeRegex(source);
  return new RegExp(
    `\\b${sourceEscaped}\\s+(?:am|is|are|was|were|has|have|had|do|does|did|can|could|will|would|should|may|might|must|[a-z]+s|[a-z]+ed)\\b`,
    "i",
  ).test(surroundingText);
}

function isObviousBeforeAfterToInfinitiveMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!source || !displayed) return false;
  if (!/^[a-z]+ing$/.test(source) || !/^to\s+(?:be\s+)?[a-z]+$/.test(displayed)) {
    return false;
  }
  return new RegExp(
    `\\b(?:before|after)\\s+${escapeRegex(source)}\\b`,
    "i",
  ).test(surroundingText);
}

function isShallowThanDecoy(surface: string, surroundingText: string): boolean {
  if (normalizeComparableText(surface) !== "than") return false;
  return /\b(?:more|less|fewer|greater|smaller|larger|better|worse|higher|lower|thicker|thinner|older|younger|rather)\b[^.;!?]{0,90}\bthan\b/i.test(surroundingText);
}

function isObviousAdverbAdjectiveMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  const adjectiveBase =
    source.endsWith("ibly")
      ? `${source.slice(0, -4)}ible`
      : source.endsWith("ably")
        ? `${source.slice(0, -4)}able`
        : source.endsWith("ly")
          ? source.slice(0, -2)
          : "";
  return (
    !!adjectiveBase &&
    displayed === adjectiveBase &&
    new RegExp(`\\b${escapeRegex(source)}\\s+[a-z]+\\b`, "i").test(surroundingText)
  );
}

function isObviousModalToInfinitiveMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!source || !displayed) return false;
  const modalBeforeSource = new RegExp(
    `\\b(?:can|could|may|might|must|shall|should|will|would|do|does|did)\\s+${escapeRegex(source)}\\b`,
    "i",
  ).test(surroundingText);
  return (
    modalBeforeSource &&
    new RegExp(`^to\\s+(?:be\\s+)?${escapeRegex(source)}$`, "i").test(displayed)
  );
}

function isObviousIntransitivePassiveMutation(
  sourceForm: string,
  displayedForm: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!source || !displayed) return false;
  const intransitiveFamily =
    /^(?:appear|appears|appeared|happen|happens|happened|occur|occurs|occurred|disappear|disappears|disappeared|arrive|arrives|arrived|emerge|emerges|emerged|exist|exists|existed|belong|belongs|belonged|consist|consists|consisted|remain|remains|remained|seem|seems|seemed|rise|rises|rose|risen|fall|falls|fell|fallen|die|dies|died)$/i;
  if (!intransitiveFamily.test(source)) return false;
  return /\b(?:be|been|being|is|are|was|were|get|gets|got)\s+(?:appeared|happened|occurred|disappeared|arrived|emerged|existed|belonged|consisted|remained|seemed|risen|fallen|died)\b/i.test(displayed);
}

function pastEdToIng(source: string): string {
  if (source.endsWith("ied")) return `${source.slice(0, -3)}ying`;
  if (source.endsWith("ed")) return `${source.slice(0, -2)}ing`;
  return "";
}

function isShallowParticipleAdjectiveMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!source.endsWith("ed") || displayed !== pastEdToIng(source)) return false;
  // 등위 동사열(", played …"/"and played …")의 -ed→-ing 는 얕은 관형 분사 플립이
  // 아니라 병렬 깨기 — KILLER 심층 메뉴가 권장하는 함정을 이 표면 검사가 오폭하던
  // 실측 편향(26-07-06 RCA: 동심도 to-V형 병렬 깨기는 통과·-ing형만 반려).
  if (
    new RegExp(`(?:,|\\band\\b|\\bor\\b)\\s+${escapeRegex(source)}\\b`, "i").test(
      surroundingText,
    )
  ) {
    return false;
  }
  return new RegExp(
    `\\b(?:traditionally|commonly|widely|newly|previously|formerly|often)?\\s*${escapeRegex(source)}\\s+[a-z][a-z'-]*s?\\b`,
    "i",
  ).test(surroundingText);
}

function isThinKillerConnectorMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!source || !displayed || source === displayed) return false;
  const pair = `${source}->${displayed}`;
  const thinPairs = new Set([
    "because->because of",
    "because of->because",
    "although->despite",
    "despite->although",
    "though->despite",
    "despite->though",
    "while->during",
    "during->while",
  ]);
  if (!thinPairs.has(pair)) return false;
  return /\b(?:the|a|an|this|that|it|they|he|she|we|you|[a-z][a-z'-]*)\s+(?:am|is|are|was|were|has|have|had|can|could|will|would|should|may|might|must|[a-z]+s)\b/i.test(surroundingText);
}

function isKoreanScratchpadGrammarExplanation(explanation: string): boolean {
  return /(?:\uC9C8\uBB38\uC744\s*\uB2E4\uC2DC|\uB2E4\uC2DC\s*(?:\uC810\uAC80|\uD655\uC778|\uAC80\uD1A0)|\uAC80\uD1A0\uD574\s*\uBCF4\uACA0|\uC810\uAC80\uD574\s*\uBCF4\uACA0|\uD655\uC778\uD574\s*\uBCF4\uACA0|\uC815\uB2F5[^.?!]{0,80}\uC124\uACC4|\uADF8\uB7EC\uBA74\s*\uC815\uB2F5|\uD655\uC778\uD558\uACA0\uC2B5\uB2C8\uB2E4)/.test(explanation);
}

function mislabelsAppearAsAdverb(text: string): boolean {
  return /(?:\uBD80\uC0AC\s*['"]?appear\b|\bappear['"]?\s*(?:\uC740|\uB294|\uB97C|\uC744)?\s*\uBD80\uC0AC)/i.test(text);
}

// (26-07-06) '\uC804\uC0AC\uAD6C' \uB2E8\uC77C \uAC80\uC0AC\uC600\uB358 \uB85C\uCEEC \uD568\uC218\uB294 shared.ts \uC758
// findNonstandardGrammarTerminology(\uC0C1\uC704\uC9D1\uD569: \uACC4\uC0AC\u00B7\uBCF4\uBB38 \uBA85\uC0AC\u00B7\uC220\uC5B4\uBD80 \uACE8\uACA9 \uB4F1 +
// \uD559\uC0DD\uC6A9 \uB300\uCCB4 \uD45C\uD604 \uD3EC\uD568 \uBA54\uC2DC\uC9C0)\uB85C \uB300\uCCB4\uB410\uB2E4.

function findGrammarExplanationTypo(text: string): string | null {
  const typoPatterns = [
    /\bdsepite\b/i,
    /\bdesipte\b/i,
  ];
  for (const pattern of typoPatterns) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

function hasNounClausePronounMislabel(text: string): boolean {
  return (
    /\uBA85\uC0AC\uC808\s*\uB0B4[^\n]{0,120}\b(?:it|this|that|they|them|their)\b/i.test(text) ||
    /\uBA85\uC0AC\uC808[^\n]{0,80}\uB300\uBA85\uC0AC[^\n]{0,80}\b(?:it|this|that|they|them|their)\b/i.test(text) ||
    /\bnoun\s+clause[^\n]{0,80}\b(?:it|this|that|they|them|their)\b/i.test(text)
  );
}

function hasPhrasalVerbMislabel(text: string): boolean {
  return /\uAD6C\uB3D9\uC0AC[\s\S]{0,140}\b(?:were\s+)?(?:blown|solidified|made|given|used|seen|found)\b/i.test(text) ||
    /\b(?:were\s+)?(?:blown|solidified|made|given|used|seen|found)\b[\s\S]{0,140}\uAD6C\uB3D9\uC0AC/i.test(text) ||
    /\uAD6C\uB3D9\uC0AC[\s\S]{0,120}(?:\uACFC\uAC70\uBD84\uC0AC|\uC218\uB3D9\uD0DC|\uBCD1\uB82C)/.test(text);
}

function hasVagueGrammarMetadataTag(text: string): boolean {
  return /(?:\uBA85\uC0AC\s*\uD750\uB984\s*\uBD84\uC11D|\uC5B4\uD718\s*\uD750\uB984\s*\uBD84\uC11D|grammar\s+flow|noun\s+flow)/i.test(text);
}

function hasBasicOverloadedGrammarDesign(text: string): boolean {
  const advancedSignals = [
    /(?:\uC591\uBCF4\s*\uB3C4\uCE58|concessive\s+inversion|Adj\s*\+\s*as)/i,
    /(?:\uC758\uBBF8\uC0C1\s*\uC8FC\uC5B4|semantic\s+subject|it\s+being)/i,
    /(?:\uC218\uB3D9\uD0DC[\s\S]{0,40}\uBCD1\uB82C|parallel\s+passive|were\s+blown\s+and\s+solidified)/i,
    /(?:\uAC00\uBAA9\uC801\uC5B4|dummy\s*object)/i,
    /(?:\uBD80\uC815\uC5B4\s*\uB3C4\uCE58|negative\s+inversion)/i,
  ];
  return advancedSignals.filter((pattern) => pattern.test(text)).length >= 2;
}

function isThinKillerConcessiveAsMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!/^(?:as|though)$/.test(source) || displayed !== "how") return false;
  return /\b[A-Z]?[a-z]+(?:\s+and\s+[a-z]+)?\s+(?:as|though)\s+(?:it|he|she|they|we|I|[a-z][a-z'-]*)\s+(?:may|might|can|could|is|are|was|were|seems?|appears?)\b/i.test(surroundingText);
}

function isDebatableAccusativeGerundDecoy(surface: string, surroundingText: string): boolean {
  const normalizedSurface = normalizeComparableText(surface);
  return (
    (/\bit\s+being\b/i.test(surface) ||
      normalizedSurface === "being" ||
      /^(?:despite|in spite of|because of|due to|without|with)$/.test(normalizedSurface)) &&
    /\b(?:despite|in spite of|because of|due to|without|with)\s+it\s+being\b/i.test(surroundingText)
  );
}

function isShallowDependsOnDecoy(surface: string, surroundingText: string): boolean {
  return (
    /^depends$/i.test(normalizeComparableText(surface)) &&
    /\b(?:term|mess|thing|fact|answer|result)\b[^.;!?]{0,80}\bdepends\s+on\b/i.test(surroundingText)
  );
}

function isShallowDespiteAlthoughGerundMutation(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  return (
    source === "despite" &&
    displayed === "although" &&
    /\bdespite\s+it\s+being\b/i.test(surroundingText)
  );
}

function isObviousEndurePassiveWithObject(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  return (
    /\b(?:has|have|had)?\s*endured\b/i.test(sourceForm) &&
    /\b(?:has|have|had|is|are|was|were|be|been|being)\s+been\s+endured\b|\b(?:is|are|was|were|be|been|being)\s+endured\b/i.test(displayedForm) &&
    /\bendured\s+(?:temperatures|pressure|conditions|changes|stress|hardship)s?\b/i.test(surroundingText)
  );
}

const RETAINED_OBJECT_PASSIVE_VERBS: Array<{
  lemma: string;
  active: RegExp;
  participle: string;
}> = [
  { lemma: "allow", active: /\b(?:allow|allows|allowed|allowing)\b/i, participle: "allowed" },
  { lemma: "ask", active: /\b(?:ask|asks|asked|asking)\b/i, participle: "asked" },
  { lemma: "award", active: /\b(?:award|awards|awarded|awarding)\b/i, participle: "awarded" },
  { lemma: "deny", active: /\b(?:deny|denies|denied|denying)\b/i, participle: "denied" },
  { lemma: "give", active: /\b(?:give|gives|gave|given|giving)\b/i, participle: "given" },
  { lemma: "grant", active: /\b(?:grant|grants|granted|granting)\b/i, participle: "granted" },
  { lemma: "offer", active: /\b(?:offer|offers|offered|offering)\b/i, participle: "offered" },
  { lemma: "pay", active: /\b(?:pay|pays|paid|paying)\b/i, participle: "paid" },
  { lemma: "permit", active: /\b(?:permit|permits|permitted|permitting)\b/i, participle: "permitted" },
  { lemma: "promise", active: /\b(?:promise|promises|promised|promising)\b/i, participle: "promised" },
  { lemma: "show", active: /\b(?:show|shows|showed|shown|showing)\b/i, participle: "shown" },
  { lemma: "teach", active: /\b(?:teach|teaches|taught|teaching)\b/i, participle: "taught" },
  { lemma: "tell", active: /\b(?:tell|tells|told|telling)\b/i, participle: "told" },
];

function findDebatableRetainedObjectPassiveMutation(
  sourceForm: string,
  displayedForm: string,
): string | null {
  const passiveAuxiliary =
    "(?:am|is|are|was|were|be|been|being|has\\s+been|have\\s+been|had\\s+been)";
  for (const verb of RETAINED_OBJECT_PASSIVE_VERBS) {
    if (!verb.active.test(sourceForm)) continue;
    const passive = new RegExp(
      `\\b${passiveAuxiliary}\\s+(?:not\\s+)?${verb.participle}\\b`,
      "i",
    );
    if (passive.test(sourceForm)) continue;
    if (passive.test(displayedForm)) return verb.lemma;
  }
  return null;
}

function isObviousFiniteToIngBeforeColon(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  return (
    /^(?:depends|seems|appears|requires|makes|shows|suggests|means|contains|includes)$/.test(source) &&
    displayed === `${source.replace(/s$/, "")}ing` &&
    /\b[A-Z][^:]{0,90}\b(?:depends|seems|appears|requires|makes|shows|suggests|means|contains|includes)\b[^:]{0,90}:/i.test(surroundingText)
  );
}

function isTooBasicHigherTierDecoy(surface: string): boolean {
  return /^(?:those|these|this|one|ones|does|do|did|it'?s|as one)$/i.test(normalizeComparableText(surface));
}

function isShallowChecklistGrammarDecoy(surface: string, surroundingText: string): boolean {
  const normalizedSurface = normalizeComparableText(surface);
  if (/^(?:this|these|those|one|ones|does|do|did|as a)$/.test(normalizedSurface)) return true;
  if (/^looks?\s+more\s+like$/.test(normalizedSurface)) return true;
  if (/^seems?\s+to\s+[a-z]+$/.test(normalizedSurface)) return true;
  if (
    /^to\s+[a-z]+$/.test(normalizedSurface) &&
    new RegExp(`\\bseems?\\s+${escapeRegex(normalizedSurface)}\\b`, "i").test(surroundingText)
  ) {
    return true;
  }
  if (/^looks?$/.test(normalizedSurface) && /\blooks?\s+more\s+like\b/i.test(surroundingText)) return true;
  if (/^seems?$/.test(normalizedSurface) && /\bseems?\s+to\s+[a-z]/i.test(surroundingText)) return true;
  return false;
}

function mislabelsLookMoreLikeAsAdjectiveComplement(text: string): boolean {
  return (
    /\blooks?\s+more\s+like\b[\s\S]{0,180}(?:\uAC10\uAC01\uB3D9\uC0AC|\uBE44\uAD50\uAE09\s*\uC804\uCE58\uC0AC\uAD6C|\uD615\uC6A9\uC0AC\s*\uBCF4\uC5B4|\uBCF4\uC5B4\s*\(?\uD615\uC6A9\uC0AC)/i.test(text) ||
    /(?:\uAC10\uAC01\uB3D9\uC0AC|\uBE44\uAD50\uAE09\s*\uC804\uCE58\uC0AC\uAD6C|\uD615\uC6A9\uC0AC\s*\uBCF4\uC5B4|\uBCF4\uC5B4\s*\(?\uD615\uC6A9\uC0AC)[\s\S]{0,180}\blooks?\s+more\s+like\b/i.test(text)
  );
}

function mislabelsSeemToVAsComplement(text: string): boolean {
  return /\bseems?\s+to\s+[a-z]+\b[\s\S]{0,140}\uBCF4\uC5B4|(?:\uBCF4\uC5B4|linking\s+verb|copula)[\s\S]{0,140}\bseems?\s+to\s+[a-z]+\b/i.test(text);
}

function mislabelsSeemToVAsObject(text: string): boolean {
  return /\bseems?\s+to\s+[a-z]+\b[\s\S]{0,140}(?:\uBAA9\uC801\uC5B4|direct\s+object)|(?:\uBAA9\uC801\uC5B4|direct\s+object)[\s\S]{0,140}\bseems?\s+to\s+[a-z]+\b/i.test(text);
}

function mislabelsThatWayAsAdverb(text: string): boolean {
  return /\bthat\s+way\b[\s\S]{0,120}(?:\uC9C0\uC2DC\uBD80\uC0AC|demonstrative\s+adverb)|(?:\uC9C0\uC2DC\uBD80\uC0AC|demonstrative\s+adverb)[\s\S]{0,120}\bthat\s+way\b|\bthat\b[\s\S]{0,40}\bway\b[\s\S]{0,120}(?:\uC9C0\uC2DC\uBD80\uC0AC|demonstrative\s+adverb)/i.test(text);
}

function mislabelsHumanMadeAsPostmodifier(text: string): boolean {
  return /\bhuman-made\b[\s\S]{0,160}(?:\uD6C4\uCE58\s*\uC218\uC2DD|post[- ]?nominal|postmodifier)|(?:\uD6C4\uCE58\s*\uC218\uC2DD|post[- ]?nominal|postmodifier)[\s\S]{0,160}\bhuman-made\b|\bmade\b[\s\S]{0,80}(?:\uD6C4\uCE58\s*\uC218\uC2DD|post[- ]?nominal|postmodifier)[\s\S]{0,80}\bhuman-made\b/i.test(text);
}

function isGibberishInversionFragment(displayedForm: string): boolean {
  return /\bhad\s+some\s+[a-z][a-z'-]*\s+[a-z]+(?:ed|en)\b/i.test(displayedForm) ||
    /\b(?:had|were|should)\s+(?:some|any|the)\s+[a-z][a-z'-]*\s+(?:had|has|have|is|are|was|were)\b/i.test(displayedForm);
}

function isLongDistanceAgreementTarget(
  sourceForm: string,
  displayedForm: string,
  surroundingText: string,
): boolean {
  const source = normalizeComparableText(sourceForm);
  const displayed = normalizeComparableText(displayedForm);
  if (!/^(?:is|are|was|were|has|have)$/.test(source) || !/^(?:is|are|was|were|has|have)$/.test(displayed)) {
    return false;
  }
  return (
    surroundingText.length > 110 ||
    /\b(?:you|we|they|that|which|who)\s+[^.;!?]{0,80}\b(?:see|saw|reviewed|found|made|called)\b/i.test(surroundingText) ||
    /\bthicker\s+at\s+the\s+bottom\b/i.test(surroundingText)
  );
}

function hasThinLongDistanceAgreementExplanation(explanation: string): boolean {
  return !/(?:\uC218\uC2DD\uC5B4|\uAD00\uACC4(?:\uC0AC|\uC808)|\uC0BD\uC785|\uD575\uC2EC\s*\uC8FC\uC5B4|\uD575|\bmodifier|relative\s+clause|intervening|you\s+sometimes\s+see|thicker\s+at\s+the\s+bottom)/i.test(explanation);
}

function isSelfContradictoryGrammarExplanation(explanation: string): boolean {
  return (
    isKoreanScratchpadGrammarExplanation(explanation) ||
    /다른\s+유력한\s+함정|정답인?\s*\([A-Ja-j]\)[^.!?]{0,80}(?:아니라|다른)|반면[^.!?]{0,160}(?:점검해야|고쳐야|정답)/.test(explanation) ||
    /wrong hypotheses|scratchpad|chain[- ]of[- ]thought/i.test(explanation)
  );
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

  if (passage && !isKoQuestionType(typeId)) {
    for (const finding of analyzeEnglishPassageIntegrity(passage)) {
      add("error", finding.code, finding.message);
    }
  }

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
  // ── KO(국어) 게이트 — 유형 특화 검증 전량을 KO 디스패처에 위임 ──────────────
  // 영어 토크나이저 기반 게이트는 한글에서 거짓음성(무발화)이므로 유형 특화
  // 분기 진입 전에 조기반환한다. type-agnostic 공용 게이트(validateOptions·
  // validateTypeSignature 등)는 호출자(validateQuestionQuality)에서 이미 실행됨.
  // examMode·passageKind 는 질문 객체의 koContext 에서 복원(시그니처 무변경).
  if (isKoQuestionType(typeId)) {
    for (const koIssue of validateKoQuestion({
      typeId,
      question,
      passage,
      requestedDifficulty,
    })) {
      add(koIssue.severity, koIssue.code, koIssue.message);
    }
    return;
  }

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

  if (typeId === "SUMMARY_COMPLETE") {
    validateSummaryCompleteQuestion(question, add);
  }

  if (typeId === "SUMMARY_WRITING") {
    validateSummaryWritingQuestion(question, add);
  }

  if (typeId === "TOPIC_SENTENCE_WRITING") {
    validateTopicSentenceWritingQuestion(question, add);
  }

  // ── 영작형 정답↔지문 verbatim 누수 게이트 (warning) ──
  // SUMMARY_WRITING / TOPIC_SENTENCE_WRITING / WORD_ORDER / CONDITIONAL_WRITING 은 원본 지문이
  // 문제 안에 INLINE 으로 함께 노출된다(passage-policy.ts). 정답 어구가 지문 문장에 통째로
  // (연속 내용토큰 3+) 있으면 학생이 베껴 써서 영작이 무력화된다(= "본문에 답 노출"의 핵심
  // 메커니즘). 정답은 지문 문장의 패러프레이즈/상위 추론이어야 한다. 거짓양성을 피하려고
  // warning 으로 시작(차단 아님) — QA·검수면에 노출해 모니터한 뒤 필요 시 error 승격.
  // SENTENCE_TRANSFORM 은 원문 변형이 정답이라 부분 겹침이 본질적이므로 제외(자체 게이트 보유).
  if (
    passage &&
    (typeId === "SUMMARY_WRITING" ||
      typeId === "TOPIC_SENTENCE_WRITING" ||
      typeId === "WORD_ORDER" ||
      typeId === "CONDITIONAL_WRITING" ||
      typeId === "SUMMARY_COMPLETE")
  ) {
    const phrases: string[] = [];
    if (typeof question.modelAnswer === "string") phrases.push(question.modelAnswer);
    if (Array.isArray(question.blanks)) {
      for (const blank of question.blanks) {
        if (isRecord(blank) && typeof blank.answer === "string") phrases.push(blank.answer);
      }
    }
    for (const phrase of phrases) {
      const run = answerRunInPassage(phrase, passage, 3);
      if (run) {
        add(
          "warning",
          "writing-answer-verbatim-in-passage",
          `정답 어구가 원본 지문에 그대로 있어 학생이 INLINE 지문에서 베껴 쓸 수 있습니다(본문 답 노출): "${run}". 정답은 지문 문장의 패러프레이즈/상위 추론으로 만드세요.`,
        );
        break;
      }
    }

    // wave2 승격: "부분 겹침 경고"와 별개로, 정답이 지문 문장의 사실상 통째 복사면
    // (내용토큰 6개 이상 + 정답 내용토큰의 80%+ 가 지문에 연속 verbatim) 영작이
    // 받아쓰기로 전락한 정답 무효급 결함이다. 베이스라인 실측에서 CONDITIONAL_WRITING
    // 2건·WORD_ORDER 2건이 이 형태로 경고만 받고 출하돼 llm 심사 fatal 판정
    // (runIndex 37/38/47/48). error + RELAXED_BLOCKING 으로 차단한다.
    // 패러프레이즈 정답(연속 런이 짧음)은 기존 경고 경로 그대로 — 무회귀.
    for (const phrase of phrases) {
      const phraseTokens = summaryWritingComparableTokens(phrase);
      if (phraseTokens.length < 6) continue;
      const fullRun = answerRunInPassage(
        phrase,
        passage,
        Math.max(6, Math.ceil(phraseTokens.length * 0.8)),
      );
      if (fullRun) {
        add(
          "error",
          typeId === "CONDITIONAL_WRITING"
            ? "cond-writing-verbatim-answer"
            : "writing-answer-verbatim-copy",
          `모범답안이 원본 지문 문장의 사실상 통째 복사입니다(베껴쓰기 과제화): "${fullRun}". 정답은 지문 문장의 패러프레이즈/재구성이어야 합니다.`,
        );
        break;
      }
    }
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

  if (typeId === "REFERENCE") {
    validateReferenceQuestion(question, add);
  }

  if (typeId === "SENTENCE_ORDER") {
    validateSentenceOrderQuestion(question, passage, add);
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
    // 완전동일이 아니어도 칩을 왼→오로 읽었을 때 정답 어간을 순서대로 60%+ 덮으면(청크
    // 근사정렬) 어순이 사실상 누설된다. 결정론 재배열(reorderChipsAwayFromAnswer)이 생성
    // 단계에서 적용되므로 정상 문항은 항상 통과 = 무회귀 그물.
    const modelAnswer = normalizeText(question.modelAnswer);
    if (
      modelAnswer &&
      scrambled !== modelAnswer &&
      chipsAreInAnswerOrder(question.scrambledWords as string[], modelAnswer)
    ) {
      add(
        "error",
        "scrambled-near-answer-order",
        "scrambledWords are arranged close to answer order (left-to-right reading solves it). Shuffle further away from modelAnswer order.",
      );
    }
    // 재구성 게이트 (wave1) — 칩(선언 미끼 제외)으로 modelAnswer 를 조립할 수
    // 있는지 토큰 멀티셋으로 검증. 조립 불가면 정답 무효급 → RELAXED_BLOCKING.
    validateWordOrderReconstruction(question, add);
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
    if (passageWithMarkers && hasDenseGrammarMarkers(passageWithMarkers)) {
      add(
        "error",
        "grammar-marker-too-dense",
        "Grammar markers are placed too close together; adjacent underlines make the item look padded and non-CSAT-like.",
      );
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
    if (requestedDifficulty === "KILLER") {
      const answerPointCodes = new Set(
        markedExpressions
          .filter((markedExpression) => markedExpression.isError === true)
          .map((markedExpression) => extractGrammarPointCode(markedExpression.pointCode))
          .filter((code): code is GrammarPointCode => !!code),
      );
      const repeatedAnswerCodes = markedExpressions
        .filter((markedExpression) => markedExpression.isError !== true)
        .map((markedExpression) => extractGrammarPointCode(markedExpression.pointCode))
        .filter((code): code is GrammarPointCode => !!code && answerPointCodes.has(code));
      if (repeatedAnswerCodes.length > 0) {
        add(
          "error",
          "grammar-killer-answer-point-repeated",
          `KILLER GRAMMAR_ERROR repeats the answer pointCode (${[...new Set(repeatedAnswerCodes)].join(", ")}) in non-answer decoys; use different grammar frames for distractors.`,
        );
      }
    }
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
    // 마커 오류형 불일치 검출 (wave5): isError 마커의 렌더 inner 는 errorExpression
    // 그대로여야 한다 — 정답형을 지문에 박으면 학생이 보는 표면과 선지가 어긋나
    // 무정답이 된다(실측 26-07-05 final-std: (E) 렌더 'in which'(정답형) vs 선지
    // 'which'(오류형)). +RELAXED.
    if (passageWithMarkers) {
      const formMismatch = findGrammarMarkerErrorFormMismatch(
        passageWithMarkers,
        markedExpressions,
      );
      if (formMismatch) {
        add(
          "error",
          "grammar-marker-error-form-mismatch",
          `Marker ${formMismatch}'s rendered text does not equal its errorExpression — the passage shows a different (possibly correct) form than the option students must judge.`,
        );
      }
    }
    // 교정형 원형 노출 검출 (round-1 ①): 정답 밑줄의 correction(교정형)이 학생이
    // 보는 지문의 다른 위치에 그대로 남아 있으면(대소문자 무시·단어 경계) 두 자리
    // 대조만으로 정답이 노출된다 — round-0 q30 실측("get __(A) that__ they want"
    // vs 뒷문장 "to get what they want"). 짧은 교정형은 이웃 단어 프레임까지
    // 일치할 때만 발화(기능어 오탐 방지). 정답을 직접 대조할 수 있는 누출이라
    // RELAXED/salvage 에서도 출하하지 않고 정답 자리를 다시 고르게 한다.
    if (passageWithMarkers) {
      const exposed = findGrammarCorrectionFormExposed(
        passageWithMarkers,
        markedExpressions,
      );
      if (exposed) {
        add(
          "error",
          "grammar-correction-form-exposed",
          `The corrected form of answer ${exposed.label} is echoed verbatim elsewhere in the passage ("${exposed.needle}") — students can find the answer by direct comparison. Choose an answer spot whose corrected form is not repeated elsewhere in the passage.`,
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
      if (passage && expression && !normalizeText(passage).includes(expression)) {
        add(
          "error",
          "grammar-source-expression-not-backed",
          `The source/correction expression "${expression}" is not found in the original passage; GRAMMAR_ERROR must mutate a real source expression, not mark an already-correct source form as wrong.`,
        );
      }
      if (passage && correction && !normalizeText(passage).includes(correction)) {
        add(
          "error",
          "grammar-correction-not-source-backed",
          `The correction "${correction}" is not found in the original passage; use the exact original expression as the correction.`,
        );
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
      // 지각동사 보어 토글 — 오류형이 지각동사 구문/명사+to-V 파스로 정문이 되어
      // 무정답이 되는 자리 (실측 2026-07-04: "We see the ... power of AI to
      // broaden"의 to 삭제 = see+O+원형으로 정문 → 정답 없는 문항 출하).
      if (expression && errorExpression) {
        const perceptionToggle = findGrammarPerceptionComplementToggle(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
          passage,
        );
        if (perceptionToggle) {
          add("error", "grammar-perception-complement-toggle", perceptionToggle);
        }
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
      // 확정 비문 오형 게이트 (round-2 감독관 판정 ①): do/does/did+be 연쇄·
      // 불규칙PP+ly 비단어·명사 뒤 what 삽입 — 학생이 보자마자 비문임을 아는
      // 즉답 오형이라 '오형 재선정' 재시도를 지시한다. 모든 품질 모드에서
      // 차단해 최후 구제 경로가 비단어 정답을 되살리지 못하게 한다.
      if (errorExpression) {
        const forcedNonword = findGrammarAnswerForcedNonword(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        );
        if (forcedNonword) {
          add("error", "grammar-answer-nonword-forced", forcedNonword);
        }
      }
      if (correction && expression && correction !== expression) {
        add("warning", "grammar-correction-differs-from-source", "The correction differs from the original expression; verify the model did not rewrite acceptable source text.");
      }
      if (/\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/.test(combined)) {
        add("error", "grammar-debatable-infinitive", "Do not use active/passive infinitive preference as the grammar-error target.");
      }
      if (
        expression &&
        errorExpression &&
        (
          /\b(?:can|could|may|might|must|shall|should|will|would|do|does|did)\s+[a-z]+ing\b/i.test(errorExpression) ||
          (
            /^[a-z]+ing$/i.test(errorExpression) &&
            new RegExp(
              `\\b(?:can|could|may|might|must|shall|should|will|would|do|does|did)\\s+${escapeRegex(normalizeComparableText(expression))}\\b`,
              "i",
            ).test(normalizeText(markedExpression.surroundingText))
          )
        )
      ) {
        add(
          "error",
          "grammar-obvious-modal-gerund",
          `GRAMMAR_ERROR should not use a visibly broken modal/auxiliary + gerund form such as "${errorExpression}". Use a subtler finite/nonfinite or complement trap.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousModalToInfinitiveMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-modal-to-infinitive",
          `GRAMMAR_ERROR should not use a visibly broken modal/auxiliary + to-infinitive form such as "${errorExpression}". Use a subtler complement or clause-boundary trap.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousIntransitivePassiveMutation(expression, errorExpression)
      ) {
        add(
          "error",
          "grammar-obvious-intransitive-passive",
          `GRAMMAR_ERROR should not passivize an intransitive verb as "${errorExpression}". Use a less obvious voice or complement trap.`,
        );
      }
      if (expression && errorExpression) {
        const retainedObjectVerb = findDebatableRetainedObjectPassiveMutation(
          expression,
          errorExpression,
        );
        if (retainedObjectVerb) {
          add(
            "error",
            "grammar-debatable-retained-object-passive",
            `Do not use active→passive voice as the answer with "${retainedObjectVerb}": English can license a retained-object passive (for example, "be permitted something" or "be given something"), so the displayed form may remain grammatical under another parse. Choose an invariant structural error instead.`,
          );
        }
      }
      if (
        requestedDifficulty !== "BASIC" &&
        expression &&
        errorExpression &&
        isShallowParticipleAdjectiveMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-shallow-participle-adjective-answer",
          `INTERMEDIATE/KILLER GRAMMAR_ERROR should not use a shallow participle adjective swap such as "${expression}" -> "${errorExpression}" before a noun; require deeper structure.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        (
          /\bbeing\s+[a-z]+ing\b/i.test(errorExpression) ||
          (
            /^[a-z]+ing$/i.test(errorExpression) &&
            /\bbeing\s+[a-z]+(?:ed|en)\b/i.test(normalizeText(markedExpression.surroundingText))
          )
        )
      ) {
        add(
          "error",
          "grammar-obvious-double-ing",
          `GRAMMAR_ERROR should not use a visibly broken double -ing form such as "${errorExpression}". Use a real participle voice or complement-form contrast.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^(?:is|are|was|were|has|have)$/.test(normalizeComparableText(errorExpression)) &&
        /\b(?:the|this|that|a|an)\s+[a-z][a-z'-]*\s+(?:is|are|was|were|has|have)\b/i.test(
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-local-agreement",
          `GRAMMAR_ERROR answer "${errorExpression}" is an adjacent determiner+noun+verb agreement flip; choose an agreement target with an intervening modifier or clause.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        hasAdjacentSimpleSubjectVerbAgreement(
          normalizeComparableText(expression),
          normalizeComparableText(errorExpression),
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-adjacent-sv-agreement",
          `GRAMMAR_ERROR answer "${errorExpression}" is a directly adjacent subject-verb -s flip; choose an agreement target with an intervening modifier, relative clause, or attractor noun.`,
        );
      }
      const answerPointCode = extractGrammarPointCode(markedExpression.pointCode);
      if (
        requestedDifficulty === "KILLER" &&
        answerPointCode &&
        /^(?:a|m)$/.test(answerPointCode)
      ) {
        add(
          "error",
          "grammar-killer-generic-answer-point",
          `KILLER GRAMMAR_ERROR answer is tagged with generic pointCode (${answerPointCode}); use a precise structural frame such as agreement with modifier, participle clause, relative/nominal clause, voice, complement, dummy it, inversion, or nonfinite pattern.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^(?:[a-z]+|to\s+[a-z]+)$/.test(normalizeComparableText(expression)) &&
        /^[a-z]+ing$/.test(normalizeComparableText(errorExpression)) &&
        /\b(?:afford|agree|decide|expect|hope|learn|manage|offer|plan|promise|refuse|want|wish)\s+to\s+[a-z]+\b/i.test(
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-to-gerund-after-verb",
          `GRAMMAR_ERROR should not use a visibly broken to-infinitive complement such as "to ${errorExpression}". Use a less local nonfinite/complement trap.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^(?:even if|although|though|while|because|since|unless)$/i.test(normalizeComparableText(expression)) &&
        /^what$/i.test(normalizeComparableText(errorExpression))
      ) {
        add(
          "error",
          "grammar-obvious-connector-to-what",
          `GRAMMAR_ERROR should not mutate a clause connector such as "${expression}" into "what"; it is a visibly broken complete/incomplete-clause swap.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^more$/i.test(normalizeComparableText(expression)) &&
        /^most$/i.test(normalizeComparableText(errorExpression)) &&
        /\blooks?\s+more\s+like\b/i.test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-debatable-more-most-like",
          "Do not use 'looks more like' -> 'looks most like' as a grammar-error answer; it is a lexical/semantic degree choice, not an airtight grammar violation.",
        );
      }
      if (
        expression &&
        errorExpression &&
        /^looks?\s+more\s+like$/i.test(normalizeComparableText(expression)) &&
        /^looks?\s+(?:more\s+likely|most\s+like|more\s+like|like\s+more)$/i.test(normalizeComparableText(errorExpression))
      ) {
        add(
          "error",
          "grammar-lexical-look-like-answer",
          "Do not use 'look(s) more like' -> a lexical/collocation variant such as 'look(s) more likely/most like' as a grammar-error answer.",
        );
      }
      if (
        expression &&
        errorExpression &&
        /^(?:why|how)$/i.test(normalizeComparableText(expression)) &&
        /^(?:why|how)$/i.test(normalizeComparableText(errorExpression)) &&
        normalizeComparableText(expression) !== normalizeComparableText(errorExpression) &&
        /\b(?:why|how)\b[^.;!?]{0,120}\bthe\s+way\b/i.test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-semantic-how-why-answer",
          "Do not use how/why near 'the way ...' as a GRAMMAR_ERROR answer; this is semantic/collocational, not an airtight grammar violation.",
        );
      }
      if (
        expression &&
        errorExpression &&
        /\bsinking\b/i.test(normalizeText(expression)) &&
        /\bsunk\b/i.test(normalizeText(errorExpression))
      ) {
        add(
          "error",
          "grammar-debatable-sink-passive",
          "Do not use sinking -> sunk/passive as the grammar-error answer; 'sink' has transitive/passive uses and can make the item debatable.",
        );
      }
      if (
        expression &&
        errorExpression &&
        /^because$/i.test(normalizeComparableText(expression)) &&
        /^despite$/i.test(normalizeComparableText(errorExpression)) &&
        /\bbecause\s+(?:the|a|an|this|that|it|they|he|she|we|you|[a-z][a-z'-]*)\s+(?:is|are|was|were|has|have|had|can|could|will|would|should|may|might|must|[a-z]+s)\b/i.test(
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-shallow-because-despite-clause",
          "Do not use because -> despite before a finite clause as the answer; it is a heavily drilled local preposition/conjunction swap, not a high-quality trap.",
        );
      }
      if (
        requestedDifficulty === "KILLER" &&
        expression &&
        errorExpression &&
        isThinKillerConnectorMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-killer-thin-connector",
          `KILLER GRAMMAR_ERROR should not use a single connector/preposition swap such as "${expression}" -> "${errorExpression}" as the answer; require a deeper cross-clause dependency.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^being$/i.test(normalizeComparableText(expression)) &&
        /^to be$/i.test(normalizeComparableText(errorExpression)) &&
        /\bdespite\s+it\s+being\b/i.test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-obvious-despite-being-to-be",
          "Do not mutate 'despite it being' into 'despite it to be'; the preposition + to-infinitive error is too visibly broken.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isShallowDespiteAlthoughGerundMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-shallow-despite-although-gerund",
          "Do not use despite -> although before 'it being' as the answer; it is an overdrilled preposition/conjunction swap.",
        );
      }
      if (
        expression &&
        errorExpression &&
        /^to\s+[a-z]+$/i.test(normalizeComparableText(expression)) &&
        /^[a-z]+ing$/i.test(normalizeComparableText(errorExpression)) &&
        new RegExp(
          `\\bseems?\\s+${escapeRegex(normalizeComparableText(expression))}\\b`,
          "i",
        ).test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-obvious-seem-to-gerund",
          `GRAMMAR_ERROR should not mutate "seems ${expression}" into "seems ${errorExpression}"; it is too visibly broken.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^[a-z]+$/i.test(normalizeComparableText(expression)) &&
        normalizeComparableText(errorExpression) === `${normalizeComparableText(expression)}ing` &&
        new RegExp(
          `\\bseems?\\s+to\\s+${escapeRegex(normalizeComparableText(expression))}\\b`,
          "i",
        ).test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-obvious-seem-to-gerund",
          `GRAMMAR_ERROR should not mutate "seems to ${expression}" into "seems to ${errorExpression}"; it is too visibly broken.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^seems?\s+to\s+[a-z]+$/i.test(normalizeComparableText(expression)) &&
        /^seems?\s+[a-z]+ing$/i.test(normalizeComparableText(errorExpression))
      ) {
        add(
          "error",
          "grammar-obvious-seem-to-gerund",
          `GRAMMAR_ERROR should not mutate "${expression}" into "${errorExpression}"; it is too visibly broken.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^[a-z]+ed$/i.test(normalizeComparableText(expression)) &&
        normalizeComparableText(errorExpression) === pastEdToIng(normalizeComparableText(expression)) &&
        new RegExp(
          `\\bwere\\s+(?:[a-z]+(?:ed|en)|blown|known|made|seen|found|given|left|built|told|shown|used)\\s+and\\s+${escapeRegex(normalizeComparableText(expression))}\\b`,
          "i",
        ).test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-shallow-local-participle-parallel",
          `Do not use a same-clause participle parallel swap such as "${expression}" -> "${errorExpression}" after "were ... and"; it is too local and mechanical.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^[a-z]+$/.test(normalizeComparableText(expression)) &&
        normalizeComparableText(errorExpression) === `${normalizeComparableText(expression)}ing` &&
        new RegExp(
          `\\battention\\b[\\s\\S]{0,180}\\bto\\s+${escapeRegex(normalizeComparableText(expression))}\\b`,
          "i",
        ).test(normalizeText(`${passageWithMarkers ?? ""} ${passage ?? ""}`))
      ) {
        add(
          "error",
          "grammar-debatable-attention-to-gerund",
          `Do not use "${expression}" -> "${errorExpression}" after an attention-to/purpose-to sequence; it can be read as the legitimate collocation "attention to ${errorExpression}".`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /\bbeing\s+[a-z]+(?:ed|en)\b/i.test(expression) &&
        /\b(?:are|is|was|were|be|been)?\s*[a-z]+ing\b/i.test(errorExpression)
      ) {
        add(
          "error",
          "grammar-obvious-passive-to-gap-ing",
          `GRAMMAR_ERROR should not turn a passive participle phrase "${expression}" into the visibly incomplete active -ing form "${errorExpression}".`,
        );
      }
      if (
        requestedDifficulty !== "BASIC" &&
        expression &&
        errorExpression &&
        isSemanticWhoWhatAskingTrap(
          normalizeComparableText(expression),
          normalizeComparableText(errorExpression),
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-semantic-who-what-answer",
          "INTERMEDIATE/KILLER GRAMMAR_ERROR should not use who/what with 'asking' as the answer; that is mainly semantic/reading disambiguation, not a structural grammar trap.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousAdverbAdjectiveMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-adverb-adjective",
          `GRAMMAR_ERROR should not use a bare adverb-to-adjective modifier swap such as "${expression}" -> "${errorExpression}" before another adjective; it is too local and shallow.`,
        );
      }
      if (
        expression &&
        errorExpression &&
        /^is$/i.test(expression) &&
        /^being$/i.test(errorExpression) &&
        /\bthat\s+is\s*,/i.test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-fixed-that-is-idiom",
          "Do not mutate the fixed parenthetical idiom 'that is,' into 'that being'; it is an idiom/meaning issue and is often misexplained.",
        );
      }
      if (
        expression &&
        errorExpression &&
        /^living$/i.test(expression) &&
        /^(?:live|lives|lived)$/i.test(errorExpression) &&
        /\bpeople\s+living\s+in\b/i.test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-obvious-living-finite",
          "Do not use 'people living in' -> a finite live/lives/lived form as the answer; the postmodifier error is too visibly broken.",
        );
      }
      if (
        expression &&
        errorExpression &&
        normalizeComparableText(errorExpression) === `what ${normalizeComparableText(expression)}` &&
        /\bwhat\s+(?:the|a|an|this|that|these|those|[a-z][a-z'-]*\s+[a-z][a-z'-]*)\b/i.test(errorExpression)
      ) {
        add(
          "error",
          "grammar-obvious-what-noun-prefix",
          `GRAMMAR_ERROR should not create a random "what + noun phrase" insertion such as "${errorExpression}". Use a real complete/incomplete-clause contrast.`,
        );
      }
      if (
        requestedDifficulty === "KILLER" &&
        expression &&
        errorExpression &&
        /\b(?:has|have|had|is|are|was|were|be|been)\s+(?:been\s+)?[a-z]+(?:ed|en)\b/i.test(expression) &&
        /^[a-z]+(?:ed|en)$/i.test(errorExpression)
      ) {
        add(
          "error",
          "grammar-killer-thin-missing-aux",
          "KILLER GRAMMAR_ERROR should not be a simple missing auxiliary before a participle; require deeper cross-clause structure.",
        );
      }
      if (requestedDifficulty === "KILLER" && isThinKillerGrammarErrorTarget(markedExpression, passage)) {
        add(
          "error",
          "grammar-killer-thin-answer",
          "KILLER GRAMMAR_ERROR answer looks like a local one-token change without a long-distance clause, modifier, relation, or parallel-structure check.",
        );
      }
      // 26-07-06 검수 패널 MAJOR 최다축(11건) — KILLER 정답이 과훈련 전형 패턴
      // (one-of 수일치 / 형↔부(-ly) 맞교환 / that↔what / 인접 수일치)이면 craft 거절.
      // INT/BASIC 에서는 정당한 포인트라 함수 자체가 KILLER 한정 자기게이트.
      {
        const overdrilled = findGrammarKillerOverdrilledAnswer(
          markedExpression,
          passage,
          requestedDifficulty,
        );
        if (overdrilled) {
          add("error", "grammar-killer-overdrilled-answer", overdrilled);
        }
      }
      if (
        requestedDifficulty === "KILLER" &&
        expression &&
        errorExpression &&
        /^(?:who|which|that)$/.test(normalizeComparableText(expression)) &&
        /^(?:who|which|that)$/.test(normalizeComparableText(errorExpression)) &&
        !/\b(?:in|at|on|for|from|through|by|with)\s+(?:which|whom)\b/i.test(normalizeText(markedExpression.surroundingText))
      ) {
        add(
          "error",
          "grammar-killer-thin-relative-animacy",
          "KILLER GRAMMAR_ERROR should not use a simple who/which/that animacy swap as the answer; use a relation requiring clause-gap or preposition/relative-adverb analysis.",
        );
      }
      if (
        requestedDifficulty === "KILLER" &&
        expression &&
        errorExpression &&
        isThinKillerConcessiveAsMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-killer-thin-concessive-as",
          "KILLER GRAMMAR_ERROR should not use a single concessive as/though -> how idiom check as the answer; require a deeper long-distance or cross-clause structure.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isGibberishInversionFragment(errorExpression)
      ) {
        add(
          "error",
          "grammar-gibberish-inversion-fragment",
          "Do not create fake inversion/subjunctive fragments such as 'had some church endured'; wrong options must remain plausible exam grammar.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousEndurePassiveWithObject(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-endure-passive-object",
          "Do not create a transparent passive-with-object error such as 'has been endured temperatures'; use a subtler voice target.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousFiniteToIngBeforeColon(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-finite-to-ing-colon",
          "Do not turn a required finite verb before a colon into a bare -ing participle; the missing predicate is too transparent.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousLocalPronounAgreementMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-local-pronoun-agreement",
          "Do not create a locally visible pronoun-auxiliary clash such as 'it are' or 'they is'; pronoun-reference errors must stay locally plausible and require antecedent tracking.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousObjectPronounSubjectMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-object-pronoun-subject",
          "Do not create object-case pronouns in finite subject position, such as 'them pushes'; that tests case at a glance rather than a real pronoun-reference trap.",
        );
      }
      if (
        expression &&
        errorExpression &&
        isObviousBeforeAfterToInfinitiveMutation(
          expression,
          errorExpression,
          normalizeText(markedExpression.surroundingText),
        )
      ) {
        add(
          "error",
          "grammar-obvious-before-after-to-infinitive",
          "Do not mutate before/after + V-ing into before/after + to-V; the error is too visibly broken for exam-quality grammar.",
        );
      }
      if (requestedDifficulty !== "BASIC" && expression && errorExpression) {
        const sourceForm = normalizeComparableText(expression);
        const displayedForm = normalizeComparableText(errorExpression);
        const surroundingText = normalizeText(markedExpression.surroundingText);
        if (
          /^(?:is|are|was|were|has|have|do|does)$/.test(sourceForm) &&
          /^(?:is|are|was|were|has|have|do|does)$/.test(displayedForm) &&
          /\b(?:it|this|that|he|she)\s+(?:is|was|has|does)\b/i.test(surroundingText)
        ) {
          add(
            "error",
            "grammar-obvious-pronoun-agreement",
            `INTERMEDIATE/KILLER GRAMMAR_ERROR should not use a visibly broken pronoun agreement flip such as "${displayedForm}"; choose a less local structural agreement target.`,
          );
        }
        if (
          sourceForm === "that" &&
          displayedForm === "what" &&
          // 선행어가 계사·전치사·접속사(닫힌 목록)면 명사 선행사가 아니라 명사절/
          // 강조구문 자리 — 이 게이트가 스스로 권장하는 출제 방향이므로 발화 금지
          // (26-07-06 RCA: "The paradox is that"에 오발화해 교정 경로를 봉쇄,
          // 반려 빈도 1위의 절반이 이 오탐).
          /\b(?!(?:is|are|was|were|am|be|been|being|seems?|seemed|remains?|remained|in|with|of|to|for|at|on|by|from|about|than|except|and|or|but|so|such|not|only)\s+that\b)[A-Za-z][A-Za-z'-]*s?\s+that\b/i.test(
            surroundingText,
          )
        ) {
          add(
            "error",
            "grammar-obvious-noun-what-relative",
            "INTERMEDIATE/KILLER GRAMMAR_ERROR should not mutate a post-nominal relative 'that' into the visibly ungrammatical 'N what ...'. Test that/what in a nominal-clause slot instead.",
          );
        }
        if (
          /^to\s+[a-z]/.test(sourceForm) &&
          /^[a-z]+ing$/.test(displayedForm) &&
          /\bseems?\s+to\b/i.test(surroundingText)
        ) {
          add(
            "error",
            "grammar-obvious-seem-gerund",
            "INTERMEDIATE/KILLER GRAMMAR_ERROR should not use a visibly broken simple seem + V-ing mutation; use a less local complement or nonfinite trap.",
          );
        }
      }
    }
    // 밑줄 span 길이 + pointCode 진실성 — 모든 밑줄(정답·디코이) 검사.
    // 화면 밑줄 표면 = 오류는 errorExpression, 디코이는 expression
    // (getMarkedSurfaceExpression 와 동일). 절/문장 통째 밑줄(프리미엄 실측 결함)을
    // egregious(relaxed에서도 차단) / wide(strict 전용) 2단으로 막는다.
    for (const markedExpression of markedExpressions) {
      if (markedExpression.isError === true) continue;
      const expression = normalizeText(markedExpression.expression);
      const surroundingText = normalizeText(markedExpression.surroundingText);
      // 필러 미끼 스팬 게이트 (round-2 감독관 판정 ②): 단독 전치사·조동사/to 뒤
      // 원형 1토큰·의문사+to-V 프레임·통짜 NP·문두 등위접속사 — 지우고 읽어도
      // 판단이 없는 장식 필러. decoy-only 부분수리(repairQuestionCandidate)가
      // 이 미끼 1개만 교체하도록 라벨을 메시지에 싣는다(하드 반려 아님).
      {
        const fillerReason = findGrammarDecoyFillerSpan(expression, surroundingText);
        if (fillerReason) {
          const fillerLabel = normalizeText(markedExpression.label) || "(?)";
          add(
            "error",
            "grammar-decoy-filler-span",
            `Decoy underline ${fillerLabel} is a decorative filler span — ${fillerReason} Replace only this decoy with a structural grammar judgment site (a different pointCode from the answer) where students genuinely weigh whether the form is correct.`,
          );
        }
      }
      if (isDebatableWhoObjectTarget(expression, surroundingText)) {
        add(
          "error",
          "grammar-debatable-who-object-decoy",
          "Do not use colloquial object 'who' as a correct decoy in a formal grammar-error item; who/whom can invite disputes.",
        );
      }
      if (/^though$/i.test(expression) && /\bthough\s*,/i.test(surroundingText)) {
        add(
          "error",
          "grammar-debatable-discourse-though-decoy",
          "Do not mark discourse-adverb 'though,' as a connector decoy; it is easy to misexplain and invites syntax disputes.",
        );
      }
      if (isDemonstrativeThatWayDecoy(expression, surroundingText)) {
        add(
          "error",
          "grammar-demonstrative-that-way-decoy",
          "Do not mark the demonstrative 'that' in \"that's the way\" as a grammar decoy; it is easily misexplained as a relative word.",
        );
      }
      if (isDebatableAccusativeGerundDecoy(expression, surroundingText)) {
        add(
          "error",
          "grammar-debatable-it-being-decoy",
          "Do not use 'it being' after a preposition as a correct grammar decoy; it can invite a formal 'its being' dispute.",
        );
      }
      if (isShallowDependsOnDecoy(expression, surroundingText)) {
        add(
          "error",
          "grammar-shallow-depends-decoy",
          "Do not use a simple 'depends on' subject-verb match as a grammar decoy; it offers little trap value.",
        );
      }
      if (isShallowNearbyPassiveDecoy(expression, surroundingText)) {
        add(
          "error",
          "grammar-shallow-nearby-passive-decoy",
          "Do not use a nearby pronoun + be p.p. phrase as a passive-voice decoy; it is too local and shallow.",
        );
      }
      if (isShallowThanDecoy(expression, surroundingText)) {
        add(
          "error",
          "grammar-shallow-than-decoy",
          "Do not use a standalone comparative 'than' as a correct decoy; it is a low-value filler unless the whole comparative structure is genuinely tested.",
        );
      }
      if (isMixedAsItGrammarSpan(expression)) {
        add(
          "error",
          "grammar-mixed-as-it-span",
          "Do not underline 'as it' as one grammar target; it mixes a concessive conjunction with a pronoun and is easily misexplained.",
        );
      }
      if (requestedDifficulty !== "BASIC" && isTooBasicHigherTierDecoy(expression)) {
        add(
          "error",
          "grammar-too-basic-decoys",
          `INTERMEDIATE/KILLER GRAMMAR_ERROR uses too-basic decoy surface "${expression}"; use a structurally meaningful distractor.`,
        );
      }
    }
    const shallowChecklistLabels = markedExpressions
      .filter((markedExpression) => markedExpression.isError !== true)
      .filter((markedExpression) =>
        isShallowChecklistGrammarDecoy(
          normalizeText(markedExpression.expression),
          normalizeText(markedExpression.surroundingText),
        ),
      )
      .map((markedExpression) => normalizeText(markedExpression.label))
      .filter(Boolean);
    if (shallowChecklistLabels.length >= 3) {
      add(
        "error",
        "grammar-shallow-checklist-decoys",
        `GRAMMAR_ERROR decoys (${shallowChecklistLabels.join(", ")}) are mostly shallow checklist targets; include more structurally tempting distractors.`,
      );
    }

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
      if (surfaceWords > 1 && /[:,;]/.test(surface)) {
        add(
          "error",
          "grammar-underline-punctuated-fragment",
          `Underline ${markerLabel} includes punctuation inside a multi-word fragment ("${surface.slice(0, 60)}"). Underline the minimal grammar token or phrase, not a clause fragment.`,
        );
      }
      const surfacePointCode = extractGrammarPointCode(markedExpression.pointCode);
      if (
        surfacePointCode === "e" &&
        /^appear(?:s|ed)?$/i.test(normalizeText(markedExpression.expression))
      ) {
        add(
          "error",
          "grammar-appear-pointcode-voice-mismatch",
          "The linking/intransitive verb 'appear' should not be tagged as a passive/voice pointCode; use the appropriate linking-verb/complement code or a different target.",
        );
      }
      if (surfacePointCode && grammarPointCodeSurfaceMismatch(surfacePointCode, surface)) {
        // 26-07-14 round-2: warning→error 승격 — 재태깅 전용 repair(문항 본체 무변경)
        // 라우팅. 수리가 실패하면 모든 품질 모드에서 차단한다.
        add(
          "error",
          "grammar-pointcode-span-mismatch",
          `Underline ${markerLabel} is tagged pointCode (${surfacePointCode}) but its surface "${surface.slice(0, 50)}" has no token matching that grammar point — the label looks fabricated. Move the underline onto the real ${surfacePointCode}-token or fix the code.`,
        );
      }
    }
    const weakFillerLabels = markedExpressions
      .filter((markedExpression) => markedExpression.isError !== true)
      .filter((markedExpression) =>
        isDecorativeGrammarDecoy(
          normalizeText(markedExpression.expression),
          normalizeText(markedExpression.surroundingText),
        ),
      )
      .map((markedExpression) => normalizeText(markedExpression.label))
      .filter(Boolean);
    if (weakFillerLabels.length > 0) {
      add(
        "error",
        "grammar-weak-filler-decoys",
        `GRAMMAR_ERROR uses weak filler decoy(s) (${weakFillerLabels.join(", ")}). Replace them with structurally meaningful grammar targets.`,
      );
    }
    // 26-07-06 검수 실측 2건 — ① keyPoints 가 실제 밑줄과 연동되지 않는 일반론
    // 필러(3번째 항목이 규칙적으로 이 문항에 없는 문법 주제) 차단 ② 정답 포인트
    // CORE-10 표적 강제(희귀 코드 j/l/m 은 디코이로만).
    {
      const nonexistentKeypointLabel = findGrammarKeypointNonexistentLabel(
        question.keyPoints,
        markedExpressions,
      );
      if (nonexistentKeypointLabel) {
        add(
          "error",
          "grammar-keypoint-nonexistent-label",
          nonexistentKeypointLabel,
        );
      }
      const keypointMismatch = findGrammarKeypointChoiceMismatch(
        question.keyPoints,
        markedExpressions,
        question.correctAnswer,
      );
      if (keypointMismatch) {
        add("error", "grammar-keypoint-choice-mismatch", keypointMismatch);
      }
      const nonCoreAnswer = findGrammarAnswerPointNotCore(markedExpressions);
      if (nonCoreAnswer) {
        add("error", "grammar-answer-point-not-core", nonCoreAnswer);
      }
    }
    const grammarExplanationText = [
      question.keyPoints,
      question.tags,
      question.explanation,
      question.wrongOptionExplanations,
    ]
      .map((value) => JSON.stringify(value ?? ""))
      .join(" ");
    if (isSelfContradictoryGrammarExplanation(normalizeText(question.explanation))) {
      add(
        "error",
        "grammar-explanation-self-contradictory",
        "Grammar explanation contains self-correction/scratchpad-like phrasing instead of a clean student-facing rationale.",
      );
    }
    if (mislabelsAppearAsAdverb(grammarExplanationText)) {
      add(
        "error",
        "grammar-appear-adverb-mislabel",
        "Grammar metadata/explanation mislabels 'appear' as an adverb; explain it as a linking/intransitive verb taking a complement.",
      );
    }
    if (mislabelsThatWayAsAdverb(grammarExplanationText)) {
      add(
        "error",
        "grammar-that-way-adverb-mislabel",
        "Grammar metadata/explanation mislabels 'that' in 'that way' as an adverb; it is a demonstrative determiner modifying way.",
      );
    }
    if (mislabelsSeemToVAsObject(grammarExplanationText)) {
      add(
        "error",
        "grammar-seem-to-object-mislabel",
        "Grammar metadata/explanation mislabels seem + to-V as taking an object; treat the to-infinitive as a complement clause.",
      );
    }
    if (mislabelsHumanMadeAsPostmodifier(grammarExplanationText)) {
      add(
        "error",
        "grammar-human-made-postmodifier-mislabel",
        "Grammar metadata/explanation mislabels human-made as a post-nominal past participle; it is a pre-nominal compound adjective in this context.",
      );
    }
    // 실제 오용("전사구")과 정확하지만 지나치게 전문적인 register("계사",
    // "보문 명사" 등)를 분리한다. 전자는 설명 사실성 결함이라 어느 salvage에서도
    // 통과시키지 않고, 후자는 학생 친화성 craft로 좁게 수리/구제할 수 있다.
    {
      const terminologyError = findGrammarTerminologyError(grammarExplanationText);
      if (terminologyError) {
        add("error", "grammar-terminology-error", terminologyError);
      }
      const terminologyRegister = findGrammarTerminologyRegister(grammarExplanationText);
      if (terminologyRegister) {
        add("error", "grammar-terminology-register", terminologyRegister);
      }
    }
    const grammarExplanationTypo = findGrammarExplanationTypo(grammarExplanationText);
    if (grammarExplanationTypo) {
      add(
        "error",
        "grammar-explanation-typo",
        `Grammar explanation/keyPoints contains a spelling typo ("${grammarExplanationTypo}"). Publication-grade items must be spellchecked.`,
      );
    }
    if (hasNounClausePronounMislabel(grammarExplanationText)) {
      add(
        "error",
        "grammar-noun-clause-pronoun-mislabel",
        "Grammar keyPoints/explanation labels a pronoun-reference check as a noun-clause issue; use accurate school grammar terminology for the actual structure.",
      );
    }
    if (hasPhrasalVerbMislabel(grammarExplanationText)) {
      add(
        "error",
        "grammar-phrasal-verb-mislabel",
        "Grammar keyPoints/explanation mislabels passive participles or a parallel participle phrase as a phrasal verb.",
      );
    }
    if (hasVagueGrammarMetadataTag(grammarExplanationText)) {
      add(
        "error",
        "grammar-vague-metadata-tag",
        "Grammar metadata includes a vague/padded tag that does not name a real tested grammar frame.",
      );
    }
    if (mislabelsLookMoreLikeAsAdjectiveComplement(grammarExplanationText)) {
      add(
        "error",
        "grammar-look-like-complement-mislabel",
        "Grammar keyPoints/explanation mislabels 'look(s) more like + noun phrase' as an adjective-complement test.",
      );
    }
    if (mislabelsSeemToVAsComplement(grammarExplanationText)) {
      add(
        "error",
        "grammar-seem-to-complement-mislabel",
        "Grammar keyPoints/explanation mislabels 'seem(s) to V' as an adjective-complement or copular-complement test.",
      );
    }
    if (requestedDifficulty === "BASIC" && hasBasicOverloadedGrammarDesign(grammarExplanationText)) {
      add(
        "error",
        "grammar-basic-overloaded-design",
        "BASIC GRAMMAR_ERROR metadata piles up multiple advanced frames; keep BASIC items one-step and reserve layered structures for higher difficulty.",
      );
    }
    const unsupportedKeyPointToken = hasUnsupportedGrammarKeyPointToken(question, passage ?? "");
    if (unsupportedKeyPointToken) {
      add(
        "error",
        "grammar-keypoint-token-not-source-backed",
        `Grammar explanation/keyPoints mention "${unsupportedKeyPointToken}", but that token is not present in the source or rendered question; this looks like hallucinated grammar analysis.`,
      );
    }
    const untestedKeyPointToken = hasUntestedGrammarKeyPointToken(question, markedExpressions);
    if (untestedKeyPointToken) {
      add(
        "error",
        "grammar-keypoint-untested-token",
        `Grammar keyPoints/explanation mention "${untestedKeyPointToken}", but no marked option tests that token.`,
      );
    }
    if (
      /전치사(?:\s*\/\s*준동사|\s*\([^)]{0,40}\)|\s*(?:혹은|또는)\s*[^\s'"]{1,20})?\s*['"]?\s*(?:ask|asking|require|requires|spend|spent|developing)\b/i.test(grammarExplanationText) ||
      /\b(?:ask|asking|require|requires|spend|spent|developing)\b\s*(?:은|는|이|가|을|를|도)?\s*전치사/i.test(grammarExplanationText)
    ) {
      add("error", "grammar-category-mislabel", "Grammar explanation mislabels a verb form as a preposition.");
    }
    if (/\bafford\b[\s\S]{0,140}(?:조동사|준조동사|quasi-modal|modal-like)/i.test(grammarExplanationText)) {
      add(
        "error",
        "grammar-afford-modal-mislabel",
        "Grammar explanation mislabels 'afford' as a modal/quasi-modal; explain it as a main verb taking a to-infinitive complement.",
      );
    }
    // 메타 누출: 해설이 출제 과정/생성 지침을 학생에게 노출(실측 u6:
    // "지시문 가이드라인의 1순위 포인트인 ...를 활용하여 ... 함정으로 X를 Y로
    // 잘못 변형하였습니다"). 학생 해설은 왜 그 형태가 어법상 틀린지만 설명해야 함.
    if (grammarExplanationLeaksMeta(grammarExplanationText)) {
      // error 로 승격(2026-06-15): warning 은 strict 재시도를 안 시켜 그대로 출하됨.
      // focus/최소대립쌍이 준 내부 framing(1순위·출제 포인트·변형 방향)을 모델이
      // 해설에 베끼는 누출이 잦아(R2 3/10), strict 재시도로 강제 회피한다.
      // 학생용 해설에 생성 지침이 남는 오류라 RELAXED/salvage 에서도 차단한다.
      add(
        "error",
        "grammar-explanation-meta-leak",
        "Grammar explanation narrates the generation process or instruction (지시문/가이드라인/출제 포인트/1순위/함정으로/X를 Y로 변형) instead of explaining the grammar from the student's view.",
      );
    }
    // CoT 덤프 백스톱: 정상 어법 해설은 300~500자. 900자 초과는 사고과정
    // 덤프(정답 번복·무관 내용 나열) 의심 (실측 focus u7: 1012자 자기모순).
    const grammarAnswerLabels = collectCorrectAnswerLabels(question);
    const explanationRangeLeak = findGrammarExplanationAnswerRangeLeak(
      question.explanation,
      grammarAnswerLabels,
    );
    if (explanationRangeLeak) {
      add(
        "error",
        "grammar-explanation-answer-range-leak",
        `Grammar explanation uses a remaining-option range that includes an answer label: "${explanationRangeLeak}". Enumerate only the actual non-answer labels instead.`,
      );
    }
    const explanationRangeShorthand = findGrammarExplanationRangeShorthand(
      question.explanation,
    );
    if (explanationRangeShorthand) {
      add(
        "error",
        "grammar-explanation-range-shorthand",
        `Grammar explanation uses a shorthand remaining-option range: "${explanationRangeShorthand}". Enumerate the non-answer labels individually to survive label reordering.`,
      );
    }
    const wrongExplanationLabels = collectWrongOptionExplanations(
      question.wrongOptionExplanations,
    );
    for (const answerLabel of grammarAnswerLabels) {
      if (wrongExplanationLabels.has(answerLabel)) {
        add(
          "error",
          "grammar-answer-in-wrong-explanations",
          `Grammar wrongOptionExplanations includes answer label (${answerLabel}); answer labels must be explained only in the main explanation.`,
        );
      }
    }
    const surfaceOrderIssue = findGrammarErrorExplanationSurfaceOrderIssue(
      question,
      markedExpressions,
    );
    if (surfaceOrderIssue) {
      add(
        "error",
        "grammar-error-explanation-surface-order",
        `Grammar explanation for (${surfaceOrderIssue.label.toUpperCase()}) cites the corrected form "${surfaceOrderIssue.correction}" before the displayed wrong form "${surfaceOrderIssue.surface}". Start from the student-visible wrong expression, then give the correction.`,
      );
    }
    const normalizedGrammarExplanation = normalizeText(question.explanation);
    const thinAgreementExplanation = markedExpressions.find((markedExpression) =>
      markedExpression.isError === true &&
      isLongDistanceAgreementTarget(
        normalizeText(markedExpression.expression),
        normalizeText(markedExpression.errorExpression),
        normalizeText(markedExpression.surroundingText),
      ) &&
      hasThinLongDistanceAgreementExplanation(normalizedGrammarExplanation),
    );
    if (thinAgreementExplanation) {
      add(
        "error",
        "grammar-agreement-explanation-too-thin",
        "Long-distance subject-verb agreement answer needs an explanation naming the intervening modifier/relative/appositive phrase and the true subject head.",
      );
    }
    // 프롬프트 계약(4단 구조, 200~450자)의 상한 + 복수정답 여유. 기존 코드는
    // >650 error 뒤 >900 warning 분기가 도달 불가(dead code)였다 — 경고 밴드를
    // error 문턱 아래(500~650)로 옮겨 살렸다.
    if (normalizedGrammarExplanation.length > 650) {
      add(
        "error",
        "grammar-explanation-too-long-hard",
        "Grammar explanation is too long for a polished student-facing grammar item; explain the answer only and keep other labels in wrongOptionExplanations.",
      );
    } else if (normalizedGrammarExplanation.length > 500) {
      add(
        "warning",
        "grammar-explanation-too-long",
        "Grammar explanation exceeds the 200-450 character contract; tighten it to the 4-step structure (sentence skeleton, verdict, correction, trap).",
      );
    }
    // round-2 ④ 해설 결정론 린트 — 어투 혼용(해라체 첫문장+합니다체 혼재)·수 모순
    // ("복수 명사인 a child"류)·keyPoints 라벨 중복·한글-영단어 붙임 오타
    // ("동사encouraged가"류). 26-07-14 승격: error 로 발행해야 해설 전용 repair
    // 분기(explanationOnlyGrammarRepair — 문항 본체 무변경, 해설만 재작성)가 발동한다.
    // 26-07-15: 사실·표현 오류가 남은 해설은 salvage 에서도 차단한다.
    for (const lintFinding of collectGrammarExplanationLintFindings(question)) {
      add("error", "grammar-explanation-lint", lintFinding);
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

  // 조건 기계 강제 게이트 (wave1) — conditions 가 명시한 기계 검증 가능한 제약
  // (정확 단어 수·인용 필수/금지 토큰)을 modelAnswer 가 지키는지 보수적으로 검사.
  if (typeId === "CONDITIONAL_WRITING") {
    validateConditionalWritingConditions(question, add);
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
