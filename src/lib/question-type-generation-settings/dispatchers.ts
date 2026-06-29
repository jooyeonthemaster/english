// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { buildMultiBlankPointGuidance } from "@/lib/blank-point-catalog";
import { type QuestionDifficulty } from "@/lib/difficulty";
import { getQuestionGenerationCreditCost, type QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { ANTONYM_PAIR_COUNT_DEFAULT, readAntonymPairCountSetting } from "./antonym";
import { buildBlankGranularityPromptBlock, readBlankInferenceBlankCountSetting, readBlankInferenceGranularitySetting, readBlankInferenceParaphraseAnswerSetting } from "./blank-inference";
import { readContentMatchAnswerCountSetting, readContentMatchOptionCountSetting, readContentMatchTypeSetting } from "./content-match";
import { GENERIC_ANSWER_COUNT_DEFAULT, GENERIC_OPTION_COUNT_DEFAULT, readGenericAnswerCountSetting, readGenericOptionCountSetting, supportsGenericOptionCount } from "./generic";
import { GRAMMAR_ANSWER_COUNT_DEFAULT, GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT, GRAMMAR_LABELS, GRAMMAR_MARKER_COUNT_DEFAULT, readGrammarAnswerCountSetting, readGrammarCorrectionErrorCountSetting, readGrammarMarkerCountSetting } from "./grammar";
import { IRRELEVANT_SLOT_COUNT_DEFAULT, getIrrelevantLabel, readIrrelevantSlotCountSetting } from "./irrelevant";
import { buildQuestionLanguageSettingsPrompt, defaultLanguageSettingsForType, effectiveSettingsWithLanguage, languageName, languageSettingsForType, readOptionLanguageSetting, readStemLanguageSetting } from "./language";
import { readSentenceInsertParaphrasePrefixSetting, readSentenceInsertSlotCountSetting } from "./sentence-insert";
import { readSentenceOrderPrefixVariationCountSetting } from "./sentence-order";
import { BLANK_INFERENCE_BLANK_COUNT_DEFAULT, CONTENT_MATCH_ANSWER_COUNT_DEFAULT, CONTENT_MATCH_OPTION_COUNT_DEFAULT, MULTI_BLANK_LABELS, SENTENCE_INSERT_SLOT_COUNT_DEFAULT, SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT, combinePromptSections, getQuestionTypeSettingsForType, isRecord, readBooleanSetting, readGistAnswerPolaritySetting, readQuestionTypeDifficultySetting, readQuestionTypeGenerationPlanSetting } from "./shared";
import { SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT, SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT, SUMMARY_WRITING_BLANK_COUNT_DEFAULT, SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT, SUMMARY_WRITING_TARGET_WORDS_DEFAULT, readSummaryCompleteBlankCountSetting, readSummaryCompleteMcBlankCountSetting } from "./summary";
import { buildSummaryWritingDirection, resolveSummaryWritingSettings, summaryWritingBlankLabels } from "./summary-writing";
import { TOPIC_SENTENCE_WRITING_BLANK_COUNT_DEFAULT, TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_DEFAULT, buildTopicSentenceWritingDirection, resolveTopicSentenceWritingSettings, topicSentenceWritingBlankLabels } from "./topic-sentence-writing";
import { type QuestionTypeGenerationSettings, type ResolvedQuestionTypeGenerationSettings } from "./types";
import { VOCAB_CHOICE_ANSWER_COUNT_DEFAULT, VOCAB_CHOICE_LABELS, VOCAB_CHOICE_MARKER_COUNT_DEFAULT, readVocabChoiceAnswerCountSetting, readVocabChoiceMarkerCountSetting, readVocabChoiceSynonymVariantsSetting } from "./vocab";

export function resolveQuestionTypeGenerationSettings(
  typeId: string,
  rawSettings: unknown,
  // 전역(GLOBAL) 난이도 폴백. 유형별 난이도 오버라이드(rawSettings.difficulty)가 없으면
  // 이 값을 쓴다. SUMMARY_WRITING 프리셋(gloss/distractors/blankCount/...)과 배점이
  // 모델 지시(effectiveDiffLabel)·question.difficulty 와 동일 난이도로 정렬되게 한다.
  fallbackDifficulty: string | null | undefined = "INTERMEDIATE",
): ResolvedQuestionTypeGenerationSettings {
  const languageSettings = languageSettingsForType(typeId, rawSettings);

  if (typeId === "SUMMARY_WRITING") {
    const sw = resolveSummaryWritingSettings(rawSettings, fallbackDifficulty);
    const summaryWritingDirection = buildSummaryWritingDirection(sw);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        // 해석된 난이도를 effectiveTypeSettings 에 박아 둔다 — 이 객체를 받는
        // buildQuestionTypeSettingsPrompt 가 (fallback 인자와 무관하게) 같은 난이도로
        // 재해석해 EXACT-direction 프롬프트가 발문·배점·프리셋과 어긋나지 않게 한다.
        difficulty: sw.difficulty,
        glossEnabled: sw.glossEnabled,
        glossLooseness: sw.glossLooseness,
        wordBankEnabled: sw.wordBankEnabled,
        wordBankUsage: sw.wordBankUsage,
        boxDistractors: sw.boxDistractors,
        wordBankFidelity: sw.wordBankFidelity,
        wordBankOrder: sw.wordBankOrder,
        wordBankChunking: sw.wordBankChunking,
        blankCount: sw.blankCount,
        blankAssignment: sw.blankAssignment,
        targetWordsMode: sw.targetWordsMode,
        targetWordsPerBlank: sw.targetWordsPerBlank,
        clueMode: sw.clueMode,
        connectorFrame: sw.connectorFrame,
        summarySourceMode: sw.summarySourceMode,
        sourceSentenceParaphrase: sw.sourceSentenceParaphrase,
        scoringGranularity: sw.scoringGranularity,
        directionAutoText: summaryWritingDirection,
      }),
      ...languageSettings,
      summaryWritingBlankCount: sw.blankCount,
      summaryWritingDistractorCount: sw.boxDistractors,
      summaryWritingTargetWords: sw.targetWordsPerBlank,
      summaryWritingDirection,
    };
  }

  if (typeId === "TOPIC_SENTENCE_WRITING") {
    const tsw = resolveTopicSentenceWritingSettings(rawSettings, fallbackDifficulty);
    const topicSentenceWritingDirection = buildTopicSentenceWritingDirection(tsw);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        difficulty: tsw.difficulty,
        mode: tsw.mode,
        topicForm: tsw.topicForm,
        hintEnabled: tsw.hintEnabled,
        hintLooseness: tsw.hintLooseness,
        chunking: tsw.chunking,
        distractors: tsw.distractors,
        fidelity: tsw.fidelity,
        scrambleOrder: tsw.scrambleOrder,
        blankCount: tsw.blankCount,
        blankAssignment: tsw.blankAssignment,
        clueMode: tsw.clueMode,
        sourceMode: tsw.sourceMode,
        sourceSentenceParaphrase: tsw.sourceSentenceParaphrase,
        scoringGranularity: tsw.scoringGranularity,
        directionAutoText: topicSentenceWritingDirection,
      }),
      ...languageSettings,
      topicSentenceWritingMode: tsw.mode,
      topicSentenceWritingBlankCount: tsw.blankCount,
      topicSentenceWritingDistractorCount: tsw.distractors,
      topicSentenceWritingDirection,
    };
  }

  if (typeId === "GRAMMAR_ERROR") {
    const grammarMarkerCount = readGrammarMarkerCountSetting(rawSettings);
    const grammarAnswerCount = readGrammarAnswerCountSetting(
      rawSettings,
      grammarMarkerCount,
    );
    const grammarPointFocus = readBooleanSetting(rawSettings, "GRAMMAR_ERROR", "pointFocus");
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        markerCount: grammarMarkerCount,
        answerCount: grammarAnswerCount,
        pointFocus: grammarPointFocus,
      }),
      ...languageSettings,
      grammarMarkerCount,
      grammarAnswerCount,
      grammarPointFocus,
    };
  }

  if (typeId === "GRAMMAR_CHOICE_COMBO") {
    // 네모 어법도 어법 판단과 동일한 grammarPointFocus 신호를 사용한다 — 후보 블록의
    // buildGrammarPointGuidance({ pointFocus: diversity?.pointFocus }) 가 이미 소비한다.
    const grammarPointFocus = readBooleanSetting(
      rawSettings,
      "GRAMMAR_CHOICE_COMBO",
      "pointFocus",
    );
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        pointFocus: grammarPointFocus,
      }),
      ...languageSettings,
      grammarPointFocus,
    };
  }

  if (typeId === "GRAMMAR_CORRECTION") {
    const grammarCorrectionErrorCount =
      readGrammarCorrectionErrorCountSetting(rawSettings);
    const grammarPointFocus = readBooleanSetting(
      rawSettings,
      "GRAMMAR_CORRECTION",
      "pointFocus",
    );
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        errorCount: grammarCorrectionErrorCount,
        pointFocus: grammarPointFocus,
      }),
      ...languageSettings,
      grammarCorrectionErrorCount,
      grammarPointFocus,
    };
  }

  if (typeId === "IRRELEVANT") {
    const irrelevantSlotCount = readIrrelevantSlotCountSetting(rawSettings);
    const irrelevantPointFocus = readBooleanSetting(
      rawSettings,
      "IRRELEVANT",
      "pointFocus",
    );
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        slotCount: irrelevantSlotCount,
        pointFocus: irrelevantPointFocus,
      }),
      ...languageSettings,
      irrelevantSlotCount,
      irrelevantPointFocus,
    };
  }

  if (typeId === "CONTENT_MATCH") {
    const contentMatchOptionCount = readContentMatchOptionCountSetting(rawSettings);
    const contentMatchAnswerCount = readContentMatchAnswerCountSetting(
      rawSettings,
      contentMatchOptionCount,
    );
    const contentMatchType = readContentMatchTypeSetting(rawSettings);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        optionCount: contentMatchOptionCount,
        answerCount: contentMatchAnswerCount,
        // 미지정(AUTO)이면 키를 넣지 않아 프롬프트/스키마 기존 경로 그대로.
        ...(contentMatchType ? { matchType: contentMatchType } : {}),
      }),
      ...languageSettings,
      contentMatchOptionCount,
      contentMatchAnswerCount,
      contentMatchType,
    };
  }

  if (typeId === "SUMMARY_COMPLETE") {
    const summaryCompleteBlankCount =
      readSummaryCompleteBlankCountSetting(rawSettings);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        blankCount: summaryCompleteBlankCount,
      }),
      ...languageSettings,
      summaryCompleteBlankCount,
    };
  }

  if (typeId === "SUMMARY_COMPLETE_MC") {
    const summaryCompleteMcBlankCount =
      readSummaryCompleteMcBlankCountSetting(rawSettings);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        blankCount: summaryCompleteMcBlankCount,
      }),
      ...languageSettings,
      summaryCompleteMcBlankCount,
    };
  }

  if (typeId === "VOCAB_CHOICE") {
    const vocabChoiceMarkerCount = readVocabChoiceMarkerCountSetting(rawSettings);
    const vocabChoiceAnswerCount = readVocabChoiceAnswerCountSetting(
      rawSettings,
      vocabChoiceMarkerCount,
    );
    const vocabChoiceSynonymVariants =
      readVocabChoiceSynonymVariantsSetting(rawSettings);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        markerCount: vocabChoiceMarkerCount,
        answerCount: vocabChoiceAnswerCount,
        synonymVariants: vocabChoiceSynonymVariants,
      }),
      ...languageSettings,
      vocabChoiceMarkerCount,
      vocabChoiceAnswerCount,
      vocabChoiceSynonymVariants,
    };
  }

  if (typeId === "SENTENCE_INSERT") {
    const sentenceInsertSlotCount = readSentenceInsertSlotCountSetting(rawSettings);
    const sentenceInsertParaphrasePrefix =
      readSentenceInsertParaphrasePrefixSetting(rawSettings);
    const sentenceInsertPointFocus = readBooleanSetting(
      rawSettings,
      "SENTENCE_INSERT",
      "pointFocus",
    );
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        slotCount: sentenceInsertSlotCount,
        paraphrasePrefix: sentenceInsertParaphrasePrefix,
        pointFocus: sentenceInsertPointFocus,
      }),
      ...languageSettings,
      sentenceInsertSlotCount,
      sentenceInsertParaphrasePrefix,
      sentenceInsertPointFocus,
    };
  }

  if (typeId === "SENTENCE_ORDER") {
    const sentenceOrderPrefixVariationCount =
      readSentenceOrderPrefixVariationCountSetting(rawSettings);
    const sentenceOrderPointFocus = readBooleanSetting(
      rawSettings,
      "SENTENCE_ORDER",
      "pointFocus",
    );
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        prefixVariationCount: sentenceOrderPrefixVariationCount,
        pointFocus: sentenceOrderPointFocus,
      }),
      ...languageSettings,
      sentenceOrderPrefixVariationCount,
      sentenceOrderPointFocus,
    };
  }

  if (typeId === "ANTONYM") {
    const antonymPairCount = readAntonymPairCountSetting(rawSettings);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        pairCount: antonymPairCount,
      }),
      ...languageSettings,
      antonymPairCount,
    };
  }

  if (typeId === "BLANK_INFERENCE") {
    const blankInferenceBlankCount = readBlankInferenceBlankCountSetting(rawSettings);
    const blankInferenceParaphraseAnswer =
      readBlankInferenceParaphraseAnswerSetting(rawSettings);
    const blankInferenceDoubleNegative =
      blankInferenceBlankCount === 1 &&
      isRecord(rawSettings) &&
      rawSettings.doubleNegative === true;
    const blankPointFocus = readBooleanSetting(
      rawSettings,
      "BLANK_INFERENCE",
      "pointFocus",
    );
    const blankInferenceGranularity =
      readBlankInferenceGranularitySetting(rawSettings);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        blankCount: blankInferenceBlankCount,
        paraphraseAnswer: blankInferenceParaphraseAnswer,
        pointFocus: blankPointFocus,
        // "auto"는 기존 경로(키 미주입). word/phrase/clause 만 프롬프트에 신호.
        ...(blankInferenceGranularity !== "auto"
          ? { blankGranularity: blankInferenceGranularity }
          : {}),
      }),
      ...languageSettings,
      blankInferenceBlankCount,
      // 부정-부정 모드는 단일 빈칸 전용. "typeSettings 프롬프트가 있으면 DN" 식의
      // 프록시 판정은 언어/다중빈칸 블록 추가로 더 이상 성립하지 않으므로 여기서 확정한다.
      blankInferenceDoubleNegative,
      blankInferenceParaphraseAnswer:
        blankInferenceParaphraseAnswer && !blankInferenceDoubleNegative,
      blankPointFocus,
      blankInferenceGranularity,
    };
  }

  if (supportsGenericOptionCount(typeId)) {
    const genericOptionCount = readGenericOptionCountSetting(rawSettings, typeId);
    const genericAnswerCount = readGenericAnswerCountSetting(
      rawSettings,
      typeId,
      genericOptionCount,
    );
    // 대의파악 계열만 극성 토글 대상. 그 외(IMPLIED/CONTEXT/SYNONYM)는 undefined.
    const answerPolarity = readGistAnswerPolaritySetting(rawSettings, typeId);
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        optionCount: genericOptionCount,
        answerCount: genericAnswerCount,
        // 미설정(POSITIVE)이면 키 미주입 → 프롬프트/스키마 기존 경로 그대로.
        ...(answerPolarity ? { answerPolarity } : {}),
      }),
      ...languageSettings,
      genericOptionCount,
      genericAnswerCount,
      answerPolarity,
    };
  }

  if (isRecord(rawSettings)) {
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings),
      ...languageSettings,
    };
  }

  return { effectiveTypeSettings: rawSettings, ...languageSettings };
}

export function getQuestionTypeGenerationTokenFloor(
  typeId: string,
  resolved: ResolvedQuestionTypeGenerationSettings,
): number {
  if (
    typeId === "GRAMMAR_ERROR" &&
    ((resolved.grammarMarkerCount ?? GRAMMAR_MARKER_COUNT_DEFAULT) >
      GRAMMAR_MARKER_COUNT_DEFAULT ||
      (resolved.grammarAnswerCount ?? GRAMMAR_ANSWER_COUNT_DEFAULT) >
        GRAMMAR_ANSWER_COUNT_DEFAULT)
  ) {
    return 8_192;
  }

  if (
    typeId === "CONTENT_MATCH" &&
    ((resolved.contentMatchOptionCount ?? CONTENT_MATCH_OPTION_COUNT_DEFAULT) >
      CONTENT_MATCH_OPTION_COUNT_DEFAULT ||
      (resolved.contentMatchAnswerCount ?? CONTENT_MATCH_ANSWER_COUNT_DEFAULT) >
        CONTENT_MATCH_ANSWER_COUNT_DEFAULT)
  ) {
    return 8_192;
  }

  if (
    typeId === "SUMMARY_COMPLETE" &&
    (resolved.summaryCompleteBlankCount ?? SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT) >
      SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT
  ) {
    return 8_192;
  }

  if (
    typeId === "SUMMARY_WRITING" &&
    (resolved.summaryWritingBlankCount ?? SUMMARY_WRITING_BLANK_COUNT_DEFAULT) >
      SUMMARY_WRITING_BLANK_COUNT_DEFAULT
  ) {
    return 8_192;
  }

  if (
    typeId === "TOPIC_SENTENCE_WRITING" &&
    ((resolved.topicSentenceWritingBlankCount ?? TOPIC_SENTENCE_WRITING_BLANK_COUNT_DEFAULT) >
      TOPIC_SENTENCE_WRITING_BLANK_COUNT_DEFAULT ||
      (resolved.topicSentenceWritingDistractorCount ??
        TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_DEFAULT) >
        TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_DEFAULT)
  ) {
    return 8_192;
  }

  if (
    typeId === "IRRELEVANT" &&
    (resolved.irrelevantSlotCount ?? IRRELEVANT_SLOT_COUNT_DEFAULT) >
      IRRELEVANT_SLOT_COUNT_DEFAULT
  ) {
    return 8_192;
  }

  if (
    typeId === "SUMMARY_COMPLETE_MC" &&
    (resolved.summaryCompleteMcBlankCount ??
      SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT) >
      SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT
  ) {
    return 8_192;
  }

  if (
    typeId === "VOCAB_CHOICE" &&
    ((resolved.vocabChoiceMarkerCount ?? VOCAB_CHOICE_MARKER_COUNT_DEFAULT) >
      VOCAB_CHOICE_MARKER_COUNT_DEFAULT ||
      (resolved.vocabChoiceAnswerCount ?? VOCAB_CHOICE_ANSWER_COUNT_DEFAULT) >
        VOCAB_CHOICE_ANSWER_COUNT_DEFAULT ||
      resolved.vocabChoiceSynonymVariants === true)
  ) {
    return 8_192;
  }

  if (
    supportsGenericOptionCount(typeId) &&
    ((resolved.genericOptionCount ?? GENERIC_OPTION_COUNT_DEFAULT) >
      GENERIC_OPTION_COUNT_DEFAULT ||
      (resolved.genericAnswerCount ?? GENERIC_ANSWER_COUNT_DEFAULT) >
        GENERIC_ANSWER_COUNT_DEFAULT)
  ) {
    return 8_192;
  }

  if (
    typeId === "SENTENCE_INSERT" &&
    (resolved.sentenceInsertSlotCount ?? SENTENCE_INSERT_SLOT_COUNT_DEFAULT) >
      SENTENCE_INSERT_SLOT_COUNT_DEFAULT
  ) {
    return 8_192;
  }

  if (
    typeId === "ANTONYM" &&
    (resolved.antonymPairCount ?? ANTONYM_PAIR_COUNT_DEFAULT) >
      ANTONYM_PAIR_COUNT_DEFAULT
  ) {
    return 8_192;
  }

  if (
    typeId === "BLANK_INFERENCE" &&
    (resolved.blankInferenceBlankCount ?? BLANK_INFERENCE_BLANK_COUNT_DEFAULT) >
      BLANK_INFERENCE_BLANK_COUNT_DEFAULT
  ) {
    return 8_192;
  }

  return 4_096;
}

export function getDefaultQuestionTypeGenerationSettings(): QuestionTypeGenerationSettings {
  return {
    BLANK_INFERENCE: {
      doubleNegative: false,
      paraphraseAnswer: false,
      blankCount: BLANK_INFERENCE_BLANK_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("BLANK_INFERENCE"),
    },
    CONTENT_MATCH: {
      optionCount: CONTENT_MATCH_OPTION_COUNT_DEFAULT,
      answerCount: CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("CONTENT_MATCH"),
    },
    GRAMMAR_ERROR: {
      markerCount: GRAMMAR_MARKER_COUNT_DEFAULT,
      answerCount: GRAMMAR_ANSWER_COUNT_DEFAULT,
      // 기본값 ON — 정답 오류 포인트를 기출 최빈출 톱셋(관계사·수일치·분사·to/-ing 등)에 집중.
      pointFocus: true,
      ...defaultLanguageSettingsForType("GRAMMAR_ERROR"),
    },
    GRAMMAR_CHOICE_COMBO: {
      // 네모 어법도 어법 판단과 동일하게 포인트 집중 기본 ON.
      pointFocus: true,
      ...defaultLanguageSettingsForType("GRAMMAR_CHOICE_COMBO"),
    },
    GRAMMAR_CORRECTION: {
      errorCount: GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("GRAMMAR_CORRECTION"),
    },
    SUMMARY_COMPLETE: {
      blankCount: SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("SUMMARY_COMPLETE"),
    },
    SUMMARY_WRITING: {
      // INTERMEDIATE 프리셋(전역 기본 난이도)을 기본값으로 노출. 강사가 모달에서
      // 바꾸지 않아도 resolveSummaryWritingSettings 가 난이도별로 재해석한다.
      glossEnabled: true,
      glossLooseness: "natural",
      wordBankEnabled: true,
      wordBankUsage: "usePartial",
      boxDistractors: SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT,
      wordBankFidelity: "verbatim",
      wordBankOrder: "scrambleStrong",
      wordBankChunking: "word",
      blankCount: SUMMARY_WRITING_BLANK_COUNT_DEFAULT,
      blankAssignment: "separate",
      targetWordsMode: "approx",
      targetWordsPerBlank: SUMMARY_WRITING_TARGET_WORDS_DEFAULT,
      clueMode: "none",
      connectorFrame: "partial",
      summarySourceMode: "paraphrase",
      sourceSentenceParaphrase: false,
      scoringGranularity: "keyword",
      ...defaultLanguageSettingsForType("SUMMARY_WRITING"),
    },
    TOPIC_SENTENCE_WRITING: {
      // ⚠️ 의도적으로 세부옵션을 비워 둔다(언어 설정만). 세부값을 여기 박으면 그 값이
      // 난이도 프리셋을 가려(shadow) 기본/중급/킬러 차이가 점수만 달라지는 SUMMARY_WRITING
      // 문제를 답습한다. 비워 두면 resolveTopicSentenceWritingSettings 가 선택 난이도의
      // 프리셋(배열↔빈칸·미끼·어형·빈칸수 등)을 그대로 적용해 "차이가 확실"해진다.
      // 강사가 상세 패널에서 만진 옵션만 명시 키로 저장되어 프리셋을 덮어쓴다.
      ...defaultLanguageSettingsForType("TOPIC_SENTENCE_WRITING"),
    },
    SUMMARY_COMPLETE_MC: {
      blankCount: SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("SUMMARY_COMPLETE_MC"),
    },
    IRRELEVANT: {
      slotCount: IRRELEVANT_SLOT_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("IRRELEVANT"),
    },
    VOCAB_CHOICE: {
      markerCount: VOCAB_CHOICE_MARKER_COUNT_DEFAULT,
      answerCount: VOCAB_CHOICE_ANSWER_COUNT_DEFAULT,
      synonymVariants: false,
      ...defaultLanguageSettingsForType("VOCAB_CHOICE"),
    },
    SENTENCE_INSERT: {
      slotCount: SENTENCE_INSERT_SLOT_COUNT_DEFAULT,
      paraphrasePrefix: false,
      ...defaultLanguageSettingsForType("SENTENCE_INSERT"),
    },
    SENTENCE_ORDER: {
      prefixVariationCount: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("SENTENCE_ORDER"),
    },
    ANTONYM: {
      pairCount: ANTONYM_PAIR_COUNT_DEFAULT,
      ...defaultLanguageSettingsForType("ANTONYM"),
    },
  };
}

export function buildQuestionTypeSettingsPrompt(
  typeId: string,
  rawSettings: unknown,
  // 전역(GLOBAL) 난이도 폴백 — resolveQuestionTypeGenerationSettings 와 동일 의미.
  // SUMMARY_WRITING 의 EXACT-direction 프롬프트가 resolve 결과(발문·배점)와
  // 어긋나지 않도록 같은 난이도로 resolveSummaryWritingSettings 를 호출한다.
  fallbackDifficulty: string | null | undefined = "INTERMEDIATE",
): string {
  const languagePrompt = buildQuestionLanguageSettingsPrompt(typeId, rawSettings);

  if (typeId === "GRAMMAR_ERROR") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const markerCount = readGrammarMarkerCountSetting(rawSettings);
    const answerCount = readGrammarAnswerCountSetting(rawSettings, markerCount);
    const stemLanguage = readStemLanguageSetting(rawSettings, typeId);
    if (
      markerCount === GRAMMAR_MARKER_COUNT_DEFAULT &&
      answerCount === GRAMMAR_ANSWER_COUNT_DEFAULT
    ) {
      return languagePrompt;
    }
    const labels = GRAMMAR_LABELS.slice(0, markerCount).join(" ");
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: GRAMMAR_ERROR / grammar judgment positions and answer count",
      `- The teacher requested exactly ${markerCount} marked grammar judgment positions and exactly ${answerCount} answer label(s).`,
      `- Output exactly ${markerCount} markedExpressions and ${markerCount} options labeled ${labels}.`,
      `- Exactly ${answerCount} markedExpression item(s) must have isError=true. If fewer than ${markerCount} are answers, every other markedExpression must remain grammatically correct source wording. If all ${markerCount} are answers, every marked expression is intentionally incorrect.`,
      "- correctAnswers must list every isError=true label. correctAnswer must be the same labels joined by comma + space, for example \"(A), (C)\".",
      answerCount >= 2
        ? stemLanguage === "en"
          ? "- The direction must ask students to choose all grammatically incorrect parts (for example, 'Choose all the grammatically incorrect parts.'), without saying how many answers there are."
          : "- The direction must ask students to choose all grammatically incorrect parts using '모두', without saying how many answers there are."
        : "- The direction must ask students to choose the grammatically incorrect part as a single-answer item.",
      "- Every marked expression, including non-error choices, must be a real exam-worthy grammar judgment point from the passage. Do not pad with weak function words, simple articles, or obvious fixed patterns.",
      "- For each isError=true item: expression/correction must be the original correct passage wording, errorExpression must be the displayed wrong form, and the explanation must name why that displayed form is wrong.",
      "- wrongOptionExplanations must cover every grammatically correct non-answer label. If every label is an answer, return an empty wrongOptionExplanations array/object according to the schema.",
      "- keyPoints and explanation must cover every error label and the most important non-error decoy points, not only the first few labels.",
    ].join("\n"));
  }

  if (typeId === "VOCAB_CHOICE") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const markerCount = readVocabChoiceMarkerCountSetting(rawSettings);
    const answerCount = readVocabChoiceAnswerCountSetting(rawSettings, markerCount);
    const stemLanguage = readStemLanguageSetting(rawSettings, typeId);
    const synonymVariants = readVocabChoiceSynonymVariantsSetting(rawSettings);
    const labels = VOCAB_CHOICE_LABELS.slice(0, markerCount).join(" ");
    const countBlock =
      markerCount === VOCAB_CHOICE_MARKER_COUNT_DEFAULT &&
      answerCount === VOCAB_CHOICE_ANSWER_COUNT_DEFAULT
        ? ""
        : [
            "## Type detail setting: VOCAB_CHOICE / underlined word count and answer count",
            `- The teacher requested exactly ${markerCount} underlined vocabulary positions and exactly ${answerCount} inappropriate word(s).`,
            `- Output exactly ${markerCount} markedWords and exactly ${markerCount} options, labeled ${labels} in order.`,
            // 변형 모드면 비정답 단어의 표시 규칙은 아래 synonym-disguise 블록이 관장한다.
            synonymVariants
              ? `- Exactly ${answerCount} markedWords item(s) must have isInappropriate=true.`
              : `- Exactly ${answerCount} markedWords item(s) must have isInappropriate=true. Every other markedWords item must keep the original source word unchanged (substituteWord = originalWord).`,
            `- For every isInappropriate=true item: originalWord is the source word, substituteWord is the displayed wrong word (different from originalWord), and betterWord equals originalWord.`,
            answerCount >= 2
              ? `- correctAnswers must list every isInappropriate=true label (exactly ${answerCount} labels). correctAnswer must be the same labels joined by comma + space, for example "(a), (c)".`
              : "- correctAnswer must be the single isInappropriate=true label.",
            answerCount >= 2
              ? stemLanguage === "en"
                ? "- The direction must ask students to choose all contextually inappropriate words (for example, 'Choose all the words that are NOT appropriate in context.'), without saying how many answers there are."
                : "- The direction must ask students to choose all contextually inappropriate words using '모두', without saying how many answers there are."
              : "- The direction must ask for the single contextually inappropriate word.",
            "- Every marked word, including appropriate ones, must be a meaningful content word worth testing. Do not pad with articles, prepositions, or trivial function words.",
            "- wrongOptionExplanations must cover every appropriate (non-answer) label, citing why the source word fits the context.",
            "- explanation and keyPoints must cover every inappropriate label, naming the displayed wrong word and the source-correct word for each.",
          ].join("\n");
    const variantBlock = synonymVariants
      ? [
          "## Type detail setting: VOCAB_CHOICE / synonym-disguise (anti-memorization)",
          '- Set vocabDisplayMode to "SYNONYM_VARIANT". This block OVERRIDES the default rule that non-answer marked words keep the source word unchanged.',
          "- Goal: a student who has memorized the passage word-for-word must NOT be able to answer by surface matching. So NONE of the displayed marked words may be a verbatim copy of the passage word at that position — every appropriate marked word is shown as a synonym, and the answer word is shown as a contextually wrong word.",
          "- For every isInappropriate=false (appropriate) markedWord: keep originalWord as the EXACT passage word (verbatim — used only to locate the underline). Set substituteWord to a DIFFERENT, contextually-appropriate near-synonym that fits the sentence perfectly: same part of speech, same inflection/number/tense, natural collocation, and the same meaning, so the word stays unambiguously correct in context. Do NOT output betterWord for appropriate words.",
          "- For every isInappropriate=true (answer) markedWord: keep the standard contract — originalWord is the verbatim source word, substituteWord is the contextually WRONG word (different from originalWord), and betterWord equals originalWord.",
          "- options[].text for each label must be exactly the displayed word: the synonym for appropriate labels, the wrong word for answer labels — matching the underlined word in the passage.",
          "- Fairness is critical: the answer(s) must remain the ONLY contextually wrong choice(s). Every appropriate synonym must be clearly correct; never introduce a second word that could be judged inappropriate, and never pick a synonym so odd, archaic, or wrong-register that it reads as an error.",
          "- Per-synonym self-check: after choosing each appropriate word's synonym, silently re-read the sentence with it and confirm it is unambiguously correct, with no alternative reading that makes it wrong or that a student could debate as a better/worse fit. If unsure, choose a clearer synonym.",
          "- Never let an appropriate word's displayed synonym equal an answer word's source-correct word (its betterWord/originalWord); that would expose the answer.",
          "- Keep all displayed words in a similar difficulty/register band. Do not telegraph the answer by making only the wrong word unusual.",
          "- Do not narrate the substitution in explanation/keyPoints; explain why the answer word is contextually wrong using the passage logic.",
        ].join("\n")
      : "";
    return combinePromptSections(languagePrompt, countBlock, variantBlock);
  }

  if (typeId === "SENTENCE_INSERT") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const slotCount = readSentenceInsertSlotCountSetting(rawSettings);
    const paraphrasePrefix =
      readSentenceInsertParaphrasePrefixSetting(rawSettings);
    const lastMarker = String.fromCodePoint(0x2460 + slotCount - 1);
    const slotBlock =
      slotCount === SENTENCE_INSERT_SLOT_COUNT_DEFAULT
        ? ""
        : [
            "## Type detail setting: SENTENCE_INSERT / insertion-position marker count",
            `- The teacher requested exactly ${slotCount} insertion-position markers (①~${lastMarker}) instead of the default 5.`,
            `- markerAfterSentenceIndices must contain exactly ${slotCount} distinct 0-based sentence indices in strictly ascending order.`,
            `- The passage must have at least ${slotCount} sentences available after removing any omitted source sentence; spread the markers across the whole passage flow, not only the first half.`,
            `- options must contain exactly ${slotCount} entries: label "1"~"${slotCount}", text ①~${lastMarker} in order.`,
            "- Exactly one gap is correct. The given sentence must fit only that gap; every other gap must break cohesion for a distinct reason.",
            "- Do not place the correct gap at the first or last marker when an inner gap is possible.",
          ].join("\n");
    const prefixBlock = paraphrasePrefix
      ? [
          "## Type detail setting: SENTENCE_INSERT / paraphrased given-sentence prefix",
          "- Paraphrase the OPENING of the given sentence (its introductory phrase, leading clause, or subject phrase) into different surface wording, while keeping the rest of the sentence and its full meaning intact.",
          "- CRITICAL: preserve the cohesive function that fixes the gap. If the opening uses an anaphoric pronoun or demonstrative (it/they/this/these/that/those/such + noun), the paraphrase MUST keep a pronoun or demonstrative that resolves to the SAME referent — do not nominalize the reference away, because removing the pronoun deletes the cue and can make several gaps fit. If the opening uses a discourse connector (however/therefore/for example/in contrast/as a result), you may reword it (however → by contrast), but its logical direction (reversal vs. cause vs. example) must stay identical.",
          "- The point is that a student must not be able to locate the gap by surface-matching memorized passage words; they must follow the logical/referential connection.",
          "- Do NOT change which gap is correct. After paraphrasing, silently re-check that the given sentence still fits only that one gap and every other gap still breaks cohesion.",
          "- If you omit a source sentence, put its EXACT verbatim passage text in sourceSentenceToOmit (so the server can locate it). The paraphrase applies only to the displayed givenSentence.",
        ].join("\n")
      : "";
    return combinePromptSections(languagePrompt, slotBlock, prefixBlock);
  }

  if (typeId === "SENTENCE_ORDER") {
    const prefixVariationCount =
      readSentenceOrderPrefixVariationCountSetting(rawSettings);
    if (prefixVariationCount <= 0) return languagePrompt;
    const scope =
      prefixVariationCount >= 3
        ? "all three (A), (B) and (C)"
        : `the first ${prefixVariationCount} of the (A)/(B)/(C)`;
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: SENTENCE_ORDER / paraphrased paragraph-opening sentences",
      `- Paraphrase the FIRST sentence of ${scope} paragraph(s) into different surface wording while keeping the same meaning. Leave the given sentence (주어진 글) and every other sentence exactly as in the source.`,
      "- Apply it to paragraphs in label order (A first, then B, then C) so the selection is deterministic, not random.",
      "- CRITICAL: identify the single logical cue in each opening that controls its position (e.g. 'However' = reversal, 'Therefore' = cause/result, 'For example' = illustration, 'this/such + noun' or 'it/they' = back-reference to a specific prior idea). Paraphrase the surrounding wording, but keep that cue's TYPE and DIRECTION unchanged and keep any back-reference pointing to the same antecedent. The correct order and the (A)/(B)/(C) labels must NOT change.",
      "- The point is that a student must not be able to reassemble the order by surface-matching memorized wording; they must follow the logic.",
      "- Anti-aliasing check: after paraphrasing, silently test whether any OTHER ordering now also reads as coherent. If a paraphrased opening makes a paragraph fit more than one position, revert to a lighter paraphrase. The intended order must remain the unique answer.",
      "- Paraphrase only the opening sentence of each targeted paragraph; keep that paragraph's remaining sentences verbatim from the source.",
    ].join("\n"));
  }

  if (typeId === "ANTONYM") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const pairCount = readAntonymPairCountSetting(rawSettings);
    if (pairCount === ANTONYM_PAIR_COUNT_DEFAULT) return languagePrompt;
    const labels = GRAMMAR_LABELS.slice(0, pairCount).join(" ");
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: ANTONYM / word-pair count",
      `- The teacher requested exactly ${pairCount} word-antonym pairs instead of the default 5.`,
      `- markedWords must contain exactly ${pairCount} items labeled ${labels}, in order, and each word must exist in the passage.`,
      `- options must contain exactly ${pairCount} entries in the "(A) word - pair" format matching markedWords.`,
      `- Exactly one pair must have isIncorrectPair=true; every other pair must be a precise contextual antonym (same part of speech, same word form, same semantic axis).`,
      "- correctAnswer must be the single option number of the incorrect pair.",
      `- wrongOptionExplanations must cover every one of the ${pairCount - 1} correct pairs, naming why each pair is a valid contextual antonym.`,
      "- Do not pad with weak or ambiguous pairs; every added pair must be an unambiguous antonym worth testing.",
    ].join("\n"));
  }

  if (supportsGenericOptionCount(typeId)) {
    // 대의파악 부정 극성('적절하지 않은 것') — 고정 발문/선지 지시를 덮어쓰는
    // 전용 블록. (이 블록이 generic 카운트 블록보다 먼저 처리되어야 한다.)
    const gistAnswerPolarity = readGistAnswerPolaritySetting(rawSettings, typeId);
    if (gistAnswerPolarity === "NEGATIVE") {
      const kindKo =
        typeId === "TITLE" ? "제목" : typeId === "MAIN_IDEA" ? "요지" : "주제";
      const negDirection = `다음 글의 ${kindKo}로 가장 적절하지 않은 것은?`;
      return combinePromptSections(languagePrompt, [
        `## ⚠️ 최우선 지시(OVERRIDE) — ${typeId} 정답 극성: '적절하지 않은 것' 고르기`,
        `- 이 블록은 위에 있는 모든 발문/선지 지시를 덮어씁니다. 위에서 "가장 적절한 것은?"으로 쓰라는 고정 지시가 있어도 반드시 무시하세요.`,
        `- direction은 반드시 정확히 "${negDirection}" 로 작성하세요. '적절한'이 아니라 '적절하지 않은'입니다(부정형).`,
        `- 이것은 "${kindKo}로 적절한 선택지 4개 + 부적절한 선택지 1개" 구조이며, 일반 문제와 정답이 정반대입니다.`,
        `- correctAnswer는 ${kindKo}로 '명백히 부적절한' 단 하나의 선택지 label입니다.`,
        `- 나머지 4개 선택지는 모두 ${kindKo}로 충분히 타당해야 합니다(각각 다른 근거로 적절). 어느 하나도 정답(부적절)으로 오인될 여지가 없어야 합니다 — 복수정답을 절대 만들지 마세요.`,
        `- 정답(부적절) 선택지는 길이·추상도·문체를 나머지와 비슷하게 맞추되, 지문 범위를 벗어나거나 핵심 관점을 뒤집거나 지문에 없는 주장을 담아 '명백히' 부적절하게 만드세요. 단순히 덜 포괄적이거나 약간 약한 정도면 복수정답 시비이므로 금지합니다.`,
        `- wrongOptionExplanations에는 '적절한' 나머지 선택지가 각각 왜 ${kindKo}로 타당한지(=정답이 아닌지) 지문 근거로 설명하세요.`,
        `- 다시 강조: direction = "${negDirection}", 정답 = 부적절한 1개.`,
      ].join("\n"));
    }
    if (!isRecord(rawSettings)) return languagePrompt;
    const optionCount = readGenericOptionCountSetting(rawSettings, typeId);
    const answerCount = readGenericAnswerCountSetting(rawSettings, typeId, optionCount);
    const stemLanguage = readStemLanguageSetting(rawSettings, typeId);
    if (
      optionCount === GENERIC_OPTION_COUNT_DEFAULT &&
      answerCount === GENERIC_ANSWER_COUNT_DEFAULT
    ) {
      return languagePrompt;
    }
    const labels = Array.from({ length: optionCount }, (_, index) => String(index + 1));
    const labelsText = labels.join(", ");
    return combinePromptSections(languagePrompt, [
      `## Type detail setting: ${typeId} / option count and answer count`,
      `- The teacher requested exactly ${optionCount} options and exactly ${answerCount} correct option(s).`,
      `- options must contain exactly ${optionCount} entries with labels ${labelsText}, in order.`,
      answerCount >= 2
        ? `- Exactly ${answerCount} options must be correct, each independently defensible from the passage. Every other option must be a plausible same-format distractor with a distinct trap.`
        : "- Exactly one option is correct; every other option must be a plausible same-format distractor with a distinct trap.",
      answerCount >= 2
        ? `- correctAnswers must list exactly ${answerCount} labels, and correctAnswer must be the same labels joined by comma + space, for example "1, 3".`
        : "- correctAnswer must be the single correct option label.",
      answerCount >= 2
        ? stemLanguage === "en"
          ? "- The direction must ask students to choose all appropriate options (for example, 'Choose all that apply.'), without saying how many answers there are."
          : "- The direction must ask students to choose all appropriate options using '모두', without saying how many answers there are."
        : "",
      `- wrongOptionExplanations must cover every one of the ${optionCount - answerCount} wrong labels.`,
      "- Keep all options parallel in language, length, grammar, and abstraction level. Do not pad with throwaway options: every added option must be exam-worthy.",
    ].filter(Boolean).join("\n"));
  }

  if (typeId === "IRRELEVANT") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const slotCount = readIrrelevantSlotCountSetting(rawSettings);
    if (slotCount === IRRELEVANT_SLOT_COUNT_DEFAULT) return languagePrompt;
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: IRRELEVANT / custom slot count",
      `- The teacher requested exactly ${slotCount} slots labeled ①~${getIrrelevantLabel(slotCount - 1)}.`,
      `- Output sentences array of length ${slotCount}, irrelevantIndex in range 1..${slotCount - 2}, options array of length ${slotCount}.`,
      `- Use the unbroken ${slotCount - 1}-sentence source window starting at original passage sentence 2, then insert exactly one AI-generated irrelevant sentence into that flow.`,
      `- The ${slotCount - 1} source sentences must all remain present, verbatim, and in the original order. Do not replace, delete, paraphrase, merge, or split any source sentence.`,
      "- Never include the original first passage sentence in sentences or options. It must be shown only as unnumbered context in passageWithNumbers.",
      "- The first numbered choice ① must be the original second passage sentence unless the inserted irrelevant sentence is placed before it.",
      "- Never put the inserted irrelevant sentence in the first or last slot. The answer must be an inner numbered sentence.",
      "- The sentence at irrelevantIndex must be the only non-verbatim inserted sentence; every other slot must be one of the original source-window sentences.",
    ].join("\n"));
  }

  if (typeId === "GRAMMAR_CORRECTION") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const errorCount = readGrammarCorrectionErrorCountSetting(rawSettings);
    if (errorCount === GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT) return languagePrompt;
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: GRAMMAR_CORRECTION / wrong underline count",
      `- The teacher requested exactly ${errorCount} wrong underlined sentence/clause segment(s).`,
      `- Output exactly ${errorCount} underlinedSegments item(s), and every item must have isError=true.`,
      "- Each underlined segment must be a wider sentence/clause from the original passage, not only the exact wrong word/form.",
      "- Each displayedText must hide one grammar mutation inside that wider underline.",
      "- correctAnswer must list every label and correctedPart in order, for example \"(A) are, (B) have\".",
      "- correctedParts should list the corrected expression for every wrong underline in the same order as underlinedSegments.",
      "- Each underlinedSegments item must include label values starting from \"(A)\" in order.",
      "- Do not add extra grammatically correct underlined segments for this setting; underline count and error count are the same.",
    ].join("\n"));
  }

  if (typeId === "CONTENT_MATCH") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const optionCount = readContentMatchOptionCountSetting(rawSettings);
    const answerCount = readContentMatchAnswerCountSetting(rawSettings, optionCount);
    const optionLanguage = readOptionLanguageSetting(rawSettings, typeId);
    const stemLanguage = readStemLanguageSetting(rawSettings, typeId);
    // 정답 극성 강제(일치/불일치). undefined = AUTO → 아래 분기는 모두 기존 문구.
    const matchType = readContentMatchTypeSetting(rawSettings);
    if (
      optionCount === CONTENT_MATCH_OPTION_COUNT_DEFAULT &&
      answerCount === CONTENT_MATCH_ANSWER_COUNT_DEFAULT &&
      !languagePrompt &&
      !matchType
    ) {
      return languagePrompt;
    }
    const labels = Array.from({ length: optionCount }, (_, index) => String(index + 1));
    const labelsText = labels.join(", ");
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: CONTENT_MATCH / statement option count and answer count",
      `- The teacher requested exactly ${optionCount} numbered statement option(s), labeled ${labelsText}.`,
      `- The teacher requested exactly ${answerCount} correct statement label(s).`,
      `- options must contain exactly ${optionCount} ${languageName(optionLanguage)} statement options. Each option label must be one of ${labelsText}.`,
      // 발문 지시: 극성 강제 시 명시 방향, 미지정(AUTO)이면 기존 모호 지시 그대로.
      matchType
        ? answerCount >= 2
          ? stemLanguage === "en"
            ? `- The direction MUST ask students to choose ALL statements that ${matchType === "일치" ? "match" : "do NOT match"} the passage, without revealing the answer count.`
            : `- 발문은 반드시 지문과 ${matchType === "일치" ? "일치하는" : "일치하지 않는"} 진술을 '모두' 고르도록 작성하고, 정답 개수는 드러내지 마세요.`
          : stemLanguage === "en"
            ? `- The direction MUST ask for the one statement that ${matchType === "일치" ? "matches" : "does NOT match"} the passage.`
            : `- 발문은 반드시 지문과 ${matchType === "일치" ? "일치하는" : "일치하지 않는"} 것 하나를 고르도록 작성하세요 (예: "다음 글의 내용과 ${matchType === "일치" ? "일치하는" : "일치하지 않는"} 것은?").`
        : answerCount >= 2
          ? stemLanguage === "en"
            ? "- The direction must ask students to choose all matching or all non-matching statements (for example, 'Choose all the statements that match the passage.'). Do not reveal the answer count in the direction."
            : "- The direction must ask students to choose all matching or all non-matching statements using '모두'. Do not reveal the answer count in the direction."
          : "- The direction must ask for one best matching or non-matching statement.",
      answerCount >= 2
        ? `- correctAnswers must contain exactly ${answerCount} labels, and correctAnswer must be the same labels joined by comma + space.`
        : "- correctAnswer must be the single correct option label.",
      // matchType 강제 시 정답 의미를 명시, 아니면 기존 일관성 지시.
      matchType === "일치"
        ? `- Set matchType to "일치". Every correct option must be a statement that is TRUE according to the passage; every wrong option must be false or contradicted by the passage.`
        : matchType === "불일치"
          ? `- Set matchType to "불일치". Every correct option must be a statement that is FALSE or contradicted by the passage; every wrong option must be true according to the passage.`
          : "- Keep matchType polarity consistent: if the direction asks for non-matching statements, every correct label must be false against the passage; if it asks for matching statements, every correct label must be true.",
      "- Every option must be independently checkable from the passage and should be similar in length and specificity.",
      "- wrongOptionExplanations must explain every non-answer label by citing the decisive passage clue.",
    ].join("\n"));
  }

  if (typeId === "SUMMARY_WRITING") {
    const sw = resolveSummaryWritingSettings(rawSettings, fallbackDifficulty);
    const labels = summaryWritingBlankLabels(sw.blankCount);
    const labelsText = labels.join(", ");
    const direction = buildSummaryWritingDirection(sw);
    const lines: string[] = [
      "## Type detail setting: SUMMARY_WRITING / 요약문 영작 (English summary blank writing)",
      "- This is a short-answer English WRITING item. options must be null/empty; do NOT create multiple-choice options.",
      // 결정론 발문(SW-GATE-VERBATIM) — AI가 발문을 새로 쓰지 못하게 정확히 지정.
      `- direction must be EXACTLY: "${direction}". Do not paraphrase, translate, or change the score bracket.`,
      `- summaryWithBlanks must be one natural English summary sentence containing each marker ${labelsText} exactly once, and must NOT contain the answer phrases.`,
      `- blanks must contain exactly ${sw.blankCount} entries with labels ${labelsText}, in order. Each blanks[].answer is a multi-word English phrase that completes that blank (this is the secret model writing for that blank).`,
      "- modelAnswer must be the full summary sentence with every blank filled in (English), and correctAnswer must equal each label and its answer joined in order, for example \"(A) ..., (B) ...\".",
      // 요약문 출처.
      sw.summarySourceMode === "inference"
        ? "- summarySourceMode = inference: the summary must be a higher-level claim inferred from the passage, not a sentence copied or lightly reworded from it."
        : "- summarySourceMode = paraphrase: the summary must paraphrase the passage's core; never let the answer be recoverable by copying a passage span verbatim.",
    ];

    // 빈칸 밖 문장 변형.
    if (sw.sourceSentenceParaphrase) {
      lines.push(
        "- Reword the non-blank parts of the summary in different surface wording from the passage while keeping the meaning, so students cannot surface-match memorized text.",
      );
    }

    // 해석(gloss).
    if (sw.glossEnabled) {
      lines.push(
        `- Provide koreanGloss (Korean meaning for the [해석] box) as ONE natural Korean sentence conveying the whole summary's meaning (reference [해석] format). NEVER list the [보기] words 1:1 as a direct translation, never render the blank answer phrase word-for-word, and never reveal the English answer order.`,
      );
      // v1: blankGlosses(빈칸별 1:1 직역)는 [보기]와 결합 시 정답을 노출하므로 생성 금지.
      lines.push(
        "- Do NOT produce blankGlosses (leave it empty). Per-blank Korean fragments expose the answer when combined with [보기]; give meaning only via the whole-summary koreanGloss.",
      );
    } else {
      lines.push("- Do NOT provide koreanGloss/blankGlosses (no Korean meaning is given).");
    }

    // 보기(wordBank).
    if (sw.wordBankEnabled) {
      lines.push(
        "- Provide wordBank: the [보기] chips students may use, normalized lowercase and SHUFFLED. The shuffled order must NOT match the modelAnswer word order (an in-order list leaks the answer).",
      );
      lines.push(
        "- If the answer needs the same word twice, include that string twice in wordBank (×2 rule).",
      );
      if (sw.wordBankChunking === "chunk") {
        lines.push(
          "- wordBank entries may be short chunks, but never give a key phrase as one whole chip that solves the blank by arrangement alone.",
        );
      }
      if (sw.wordBankUsage === "useAll" && sw.boxDistractors === 0) {
        lines.push(
          "- wordBankUsage = useAll: the wordBank multiset must equal exactly the answer tokens (no distractors). wordBankDistractors must be empty.",
        );
      } else if (sw.wordBankUsage === "usePartial") {
        lines.push(
          `- wordBankUsage = usePartial: include exactly ${sw.boxDistractors} distractor word(s) in wordBank that are NOT used in any answer, and list them in wordBankDistractors. Each distractor must be a synonym, confusable, or inflected form of an answer word (never an unrelated word, which would be trivially eliminated).`,
        );
      }
      lines.push(
        sw.wordBankFidelity === "verbatim"
          ? "- wordBankFidelity = verbatim: students use the given word forms as-is; the answers must use those exact forms."
          : "- wordBankFidelity = inflected: students may need to change tense/number/agreement of a given base form to fit the blank. Do NOT give an incorrect form to be corrected (that is a separate grammar-correction task and is out of scope).",
      );
    } else {
      lines.push("- Do NOT provide wordBank/wordBankDistractors (no word bank is given).");
    }

    // 빈칸 배분.
    if (sw.blankCount >= 2) {
      lines.push(
        sw.blankAssignment === "shared"
          ? "- blankAssignment = shared: when a word bank is shared across blanks, ensure the distribution yields a SINGLE unambiguous correct assignment per blank."
          : "- blankAssignment = separate: each blank draws from its own portion of the word bank.",
      );
    }

    // 단서(clueMode).
    if (sw.clueMode === "firstLetter") {
      lines.push(
        "- clueMode = firstLetter: for each blank, provide firstLetterHint = the lowercase first letter of each answer word, space-separated, 1:1 aligned to the answer tokens (e.g. \"p s d\"). One letter per word only; never reveal more letters or word lengths.",
      );
    } else if (sw.clueMode === "skeleton") {
      lines.push(
        "- clueMode = skeleton: you may provide a light structural skeleton, but never reveal content words of the answer.",
      );
    } else if (sw.clueMode === "wordCount") {
      lines.push(
        "- clueMode = wordCount: students are told the number of words only (use targetWordCount); never reveal letters.",
      );
    }

    // 목표 단어수.
    if (sw.targetWordsMode === "hidden") {
      lines.push("- targetWordsMode = hidden: do NOT reveal a target word count to students; omit targetWordCount display.");
    } else {
      lines.push(
        `- targetWordsMode = ${sw.targetWordsMode}: each blank targets about ${sw.targetWordsPerBlank} word(s). Set blanks[].targetWordCount accordingly, but never make blank line length proportional to the answer.`,
      );
    }

    // 연결 프레임.
    if (sw.connectorFrame !== "bare") {
      lines.push(
        `- connectorFrame = ${sw.connectorFrame}: keep a fixed surrounding frame around each blank (e.g. \", which can lead to ...\") so the clause boundary is clear; put it in connectorFrameAfter when it follows a blank.`,
      );
    }

    lines.push(
      `- scoringGranularity = ${sw.scoringGranularity}: scoring is teacher/AI passthrough. Provide scoringCriteria (Korean rubric, teacher-only) and acceptableVariants (equivalent answers) so partial credit is possible. These are SECRET — never put them in student-facing text.`,
    );

    // 스키마 메타 필드 echo — 산문 지시(wordBankUsage 등)와 모델이 실제로 emit 해야 하는
    // 스키마 필드명(wordBankPolicy 등)을 1:1로 못박는다. 품질게이트(sw-distractor-semantic 등)가
    // 이 필드를 읽으므로 누락되면 검증이 무력화된다.
    lines.push(
      `- Echo these as structured metadata fields exactly: wordBankPolicy = "${sw.wordBankUsage}", wordBankFidelity = "${sw.wordBankFidelity}"${
        sw.blankCount >= 2 ? `, blankAssignment = "${sw.blankAssignment}"` : ""
      }, clueMode = "${sw.clueMode}", targetWordsMode = "${sw.targetWordsMode}", summarySourceMode = "${sw.summarySourceMode}". These record the constraints for grading and must match the instructions above.`,
    );

    return combinePromptSections(languagePrompt, lines.join("\n"));
  }

  if (typeId === "TOPIC_SENTENCE_WRITING") {
    const tsw = resolveTopicSentenceWritingSettings(rawSettings, fallbackDifficulty);
    const direction = buildTopicSentenceWritingDirection(tsw);
    const topicNoun = tsw.topicForm === "nounPhrase" ? "academic noun phrase (≤12 words, no main verb)" : "topic sentence (12–14 words)";
    const lines: string[] = [
      "## Type detail setting: TOPIC_SENTENCE_WRITING / 주제문 영작 (topic-statement writing)",
      "- First analyze the passage logically and determine the single main TOPIC of the whole passage.",
      `- topicForm = ${tsw.topicForm}: express the topic as ${topicNoun}. Set the topicForm field accordingly.`,
      tsw.sourceMode === "inference"
        ? "- sourceMode = inference: the topic must be a higher-level claim inferred from the passage, not a sentence copied or lightly reworded from it."
        : tsw.sourceMode === "paraphrase"
          ? "- sourceMode = paraphrase: the topic must paraphrase the passage's core; never let it be recoverable by copying a passage span verbatim."
          : "- sourceMode = explicit: the topic may restate the passage's stated main point in clean academic English.",
      "- This is a short-answer English WRITING item. options must be null/empty; do NOT create multiple-choice options.",
      `- direction must be EXACTLY: "${direction}". Do not paraphrase, translate, or change the score bracket.`,
      "- modelAnswer must be the full correct topic statement in English, and correctAnswer must equal modelAnswer.",
      `- Set mode = "${tsw.mode}".`,
    ];

    if (tsw.mode === "scrambled") {
      lines.push(
        "- Produce scrambledWords: the tokens of modelAnswer, broken into pieces and SHUFFLED. The shuffled order must NOT match modelAnswer's order (an in-order list leaks the answer).",
        tsw.chunking === "chunk"
          ? "- chunking = chunk: pieces may be short multi-word chunks, but never give one whole chunk that solves it by arrangement alone."
          : "- chunking = word: pieces are single words (function words separate).",
        "- Leave summaryWithBlanks empty and blanks empty for scrambled mode.",
      );
      if (tsw.distractors > 0) {
        lines.push(
          `- Include exactly ${tsw.distractors} distractor token(s) in scrambledWords that are NOT used in the answer, and list them in wordBankDistractors. Each distractor must be a synonym, confusable, or inflected form of an answer token (never an unrelated word).`,
        );
      } else {
        lines.push("- No distractors: scrambledWords must contain exactly the answer tokens (wordBankDistractors empty).");
      }
      if (tsw.fidelity !== "verbatim") {
        lines.push("- fidelity = inflected: give base forms; students change tense/number/agreement to fit. Never give an incorrect form to be corrected.");
      }
    } else {
      const labels = topicSentenceWritingBlankLabels(tsw.blankCount).join(", ");
      lines.push(
        `- summaryWithBlanks must be the topic ${tsw.topicForm === "nounPhrase" ? "noun phrase" : "sentence"} containing each marker ${labels} exactly once, and must NOT contain the answer phrases.`,
        `- blanks must contain exactly ${tsw.blankCount} entr${tsw.blankCount >= 2 ? "ies" : "y"} with labels ${labels}, in order. Each blanks[].answer is the secret model writing for that blank.`,
        "- Leave scrambledWords empty for cloze mode.",
        "- Provide wordBank: the [보기] chips students may use, lowercase and SHUFFLED. The shuffled order must NOT match the modelAnswer word order.",
        "- If the answer needs the same word twice, include that string twice in wordBank (×2 rule).",
      );
      if (tsw.distractors > 0) {
        lines.push(
          `- Include exactly ${tsw.distractors} distractor word(s) in wordBank that are NOT used in any answer, and list them in wordBankDistractors. Each distractor must be a synonym, confusable, or inflected form of an answer word.`,
        );
      } else {
        lines.push("- No distractors: wordBank must equal exactly the answer tokens (wordBankDistractors empty).");
      }
      if (tsw.fidelity !== "verbatim") {
        lines.push("- fidelity = inflected: students may change tense/number/agreement of a given base form. Never give an incorrect form to be corrected.");
      }
      if (tsw.blankCount >= 2) {
        lines.push(
          tsw.blankAssignment === "shared"
            ? "- blankAssignment = shared: ensure the word distribution yields a SINGLE unambiguous correct assignment per blank."
            : "- blankAssignment = separate: each blank draws from its own portion of the word bank.",
        );
      }
      if (tsw.clueMode === "firstLetter") {
        lines.push("- clueMode = firstLetter: for each blank, provide firstLetterHint = lowercase first letter of each answer word, space-separated, 1:1 to the answer tokens. One letter per word only.");
      } else if (tsw.clueMode === "wordCount") {
        lines.push("- clueMode = wordCount: tell the number of words only (use targetWordCount); never reveal letters.");
      }
    }

    if (tsw.hintEnabled) {
      lines.push(
        `- Provide koreanGloss for the [주제 힌트] box as ONE natural Korean sentence (looseness = ${tsw.hintLooseness}) conveying the topic's meaning. NEVER list the answer words 1:1 as a direct translation, and never reveal the English answer order.`,
      );
    } else {
      lines.push("- Do NOT provide koreanGloss (no Korean hint is given).");
    }

    if (tsw.sourceSentenceParaphrase) {
      lines.push("- Reword the non-answer surface wording so students cannot surface-match memorized passage text.");
    }

    lines.push(
      `- scoringGranularity = ${tsw.scoringGranularity}: provide scoringCriteria (Korean rubric, teacher-only) and acceptableVariants (equivalent answers — word-order/synonym variants) for partial credit. These are SECRET — never put them in student-facing text.`,
      `- Echo these as structured metadata fields exactly: mode = "${tsw.mode}", topicForm = "${tsw.topicForm}", wordBankFidelity = "${tsw.fidelity}", sourceMode = "${tsw.sourceMode}"${tsw.mode === "cloze" && tsw.blankCount >= 2 ? `, blankAssignment = "${tsw.blankAssignment}"` : ""}${tsw.mode === "cloze" ? `, clueMode = "${tsw.clueMode}"` : ""}.`,
    );

    return combinePromptSections(languagePrompt, lines.join("\n"));
  }

  if (typeId === "SUMMARY_COMPLETE") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const blankCount = readSummaryCompleteBlankCountSetting(rawSettings);
    if (blankCount === SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT) return languagePrompt;
    const labels = Array.from({ length: blankCount }, (_, index) =>
      `(${String.fromCharCode(65 + index)})`
    );
    const labelsText = labels.join(", ");
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: SUMMARY_COMPLETE / short-answer summary blank count",
      `- The teacher requested exactly ${blankCount} short-answer summary blank(s): ${labelsText}.`,
      `- summaryWithBlanks must contain each marker ${labelsText} exactly once.`,
      `- blanks must contain exactly ${blankCount} entries with labels ${labelsText}, in order.`,
      "- Each blank answer must be an English word or natural English phrase grounded in the passage.",
      "- correctAnswer must list every blank answer in label order.",
      "- Do not create multiple-choice options for this type.",
    ].join("\n"));
  }

  if (typeId === "SUMMARY_COMPLETE_MC") {
    if (!isRecord(rawSettings)) return languagePrompt;
    const blankCount = readSummaryCompleteMcBlankCountSetting(rawSettings);
    if (blankCount === SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT) return languagePrompt;
    const labels = Array.from({ length: blankCount }, (_, index) =>
      `(${String.fromCharCode(65 + index)})`
    );
    const labelsText = labels.join(", ");
    return combinePromptSections(languagePrompt, [
      "## Type detail setting: SUMMARY_COMPLETE_MC / summary blank count",
      "- This block overrides any default two-blank SUMMARY_COMPLETE_MC instruction elsewhere in the prompt.",
      `- The teacher requested exactly ${blankCount} summary blank(s): ${labelsText}.`,
      `- direction must ask for the best words for blanks ${labelsText}.`,
      `- summaryWithBlanks must be one natural English summary sentence and must contain each marker ${labelsText} exactly once.`,
      `- blanks must contain exactly ${blankCount} entries with labels ${labelsText}, in order, and each answer must be an English word or natural English phrase.`,
      "- options must contain exactly 5 answer choices.",
      `- Each option must provide a blankValues array with exactly ${blankCount} entries, one for each label ${labelsText}, plus a readable text value joining the values with \" …… \".`,
      "- The correct option's blankValues must match the blanks answers exactly.",
      "- Wrong options must be passage-grounded near-misses. Include at least one option that is correct for all but one blank so students must verify every blank.",
      "- Keep grammar slots parallel column by column: every value for the same blank label should fit the same part of speech and sentence position.",
    ].join("\n"));
  }

  if (typeId !== "BLANK_INFERENCE" || !isRecord(rawSettings)) return languagePrompt;

  const blankInferenceBlankCount = readBlankInferenceBlankCountSetting(rawSettings);
  const useParaphraseAnswer =
    readBlankInferenceParaphraseAnswerSetting(rawSettings) &&
    rawSettings.doubleNegative !== true;
  // 빈칸 단위(단어/구/절) — 모든 빈칸 모드(기본/변형/부정/다중)에 공통 적용. "auto"면 무주입.
  const blankGranularityBlock = buildBlankGranularityPromptBlock(
    readBlankInferenceGranularitySetting(rawSettings),
  );
  const withGranularity = (base: string): string =>
    blankGranularityBlock
      ? combinePromptSections(base, blankGranularityBlock)
      : base;
  if (blankInferenceBlankCount >= 2) {
    // Multi-blank combination variant. The double-negative mode is a
    // single-blank-only feature and is intentionally ignored here.
    const labels = MULTI_BLANK_LABELS.slice(0, blankInferenceBlankCount);
    const labelsText = labels.join(", ");
    // 다중빈칸은 candidate block 이 suppress 되므로 focus(출제포인트 집중)를 이 프롬프트
    // 경로에 주입한다 — 빈칸별로 서로 다른 코어 논리축에 분산(A 분산형).
    const blankPointFocus = readBooleanSetting(rawSettings, "BLANK_INFERENCE", "pointFocus");
    return withGranularity(combinePromptSections(languagePrompt, [
      "## Type detail setting: BLANK_INFERENCE / multi-blank combination item",
      `- The teacher requested a ${blankInferenceBlankCount}-blank combination item instead of the standard single-blank item. This block overrides the single-blank output rules.`,
      ...(blankPointFocus
        ? [buildMultiBlankPointGuidance(blankInferenceBlankCount, { pointFocus: true })]
        : []),
      `- Do NOT output originalExpression/surroundingText at the top level. Instead output a "blanks" array with exactly ${blankInferenceBlankCount} entries labeled ${labelsText}, in passage order.`,
      "- Each blanks[].originalExpression must be copied verbatim from the passage (not a paraphrase), must be a meaningful content expression (verb phrase, modified noun phrase, or compact clause-level phrase — never a bare function word), and the blanks must come from different sentences.",
      "- ⚠️ Never blank an expression whose exact wording also appears elsewhere in the passage (key phrases are often repeated): the remaining occurrence would reveal the answer and the item will be rejected. Before choosing, scan the passage and pick expressions that occur exactly once.",
      "- ⚠️ This also applies to any meaningful PART of the expression and to close synonyms: do not blank a span if its core content words (e.g. a key noun phrase inside it) or an obvious synonym/paraphrase of them still appears elsewhere in the passage. The blanked answer must not be recoverable by simple word matching against the remaining text.",
      "- ⚠️ Never blank a semantically empty light phrase such as \"doing things\", \"a way of doing things\", \"get things done\", or \"make something\" — placeholder nouns (thing/way/stuff) and light verbs (do/make/get/have) carry no testable meaning and students just fill them by idiom. Blank the contentful core of the sentence instead.",
      "- Each blanks[].surroundingText must copy 40~60 characters of the passage around that expression for position identification.",
      `- options must contain exactly 5 combination choices labeled "1"~"5". Each option must provide blankValues with exactly ${blankInferenceBlankCount} entries (one per blank, in ${labelsText} order) and text joining the values with " …… ".`,
      useParaphraseAnswer
        ? "- The correct option's blankValues must be semantically equivalent paraphrases of the original passage expressions, in blank order. They must NOT copy the original expressions verbatim."
        : "- The correct option's blankValues must be exactly the original passage expressions, verbatim and in order.",
      ...(useParaphraseAnswer
        ? [
            "- For BASIC, use short high-frequency paraphrases. For INTERMEDIATE, use moderately transformed but familiar academic phrasing, normally at least four words and four meaningful content words on both the source target and correct option. For KILLER, use abstract logical reformulations that preserve the passage claim without becoming vague or overgeneral.",
            "- For KILLER, do not make a short local synonym item. The source blank should normally be at least seven words with five meaningful content words, the correct option should be a natural 8-16 word reformulation with at least six meaningful content words, and students should need at least two passage evidence links to justify it.",
            "- For KILLER, at least three wrong values should be passage-grounded same-field near misses. Avoid giveaway extremes such as unconditionally, completely, passive/passively, strict/strictly, inevitably, naturally, whatever, successfully, solely, entirely, fully, only, always, never, must, cannot, guarantees, definitive, flawless, seamless, error-free, automatically, altogether, eliminate, any form of, from/without/against any, bound to, or indefinitely unless the passage itself requires that exact force.",
            "- Wrong combination values must be paraphrased too: same grammatical slot, similar length/register, and passage-grounded near-misses that fail by scope, polarity, causal role, target, or discourse role.",
            "- Choose clean semantic units for blanks, normally no longer than 12 words or 90 characters. Do not end a blank originalExpression with a dangling modal, auxiliary, or function word such as will, can, could, is, are, or to.",
            "- Preserve source polarity and resistance/avoidance relations. Do not turn 'resisting/avoiding/rejecting X' into 'doing X'.",
            "- Insert every option into the blank sentence. If the left context already says 'ways in which _____' or 'process by which _____', do not repeat 'ways in which' or 'process by which' inside the option.",
            "- If the left context already ends with a preposition such as by/of/to/for/with/from/in/on, do not start the option with another preposition.",
            "- If the left context ends with 'to _____', every option must begin with a base verb phrase, not a gerund phrase such as 'critically evaluating...'.",
            "- If a blanked originalExpression is a finite clause such as 'it requires...', the correct option must keep a finite-clause shape when the blank starts after a semicolon or sentence boundary. Do not replace it with a bare gerund phrase such as 'making...'.",
            "- Avoid stilted paraphrases such as 'carrying out following evaluations or estimations', 'act as an active filter', 'active filter amidst...', 'sovereignly filtering', 'cultural influxes', 'moral terrains', 'property of shared choices', 'synergistic channels', 'collective boundaries', 'compassionate comprehension', 'compromising alternatives', 'reality that envelopes us', 'degraders', or 'degraders internalize'.",
          ]
        : []),
      "- Wrong options must be same-part-of-speech, passage-grounded near-misses that fail by polarity, scope, causal-role, or thesis-direction shifts. Include at least one option that is correct for all but one blank so students must verify every blank.",
      "- Keep each blank column grammatically parallel: every value for the same label must fit the same slot in its sentence.",
      useParaphraseAnswer
        ? "- Set blankAnswerMode to \"PARAPHRASE\"."
        : "- blankAnswerMode must be omitted or \"SOURCE_EXACT\"; the double-negative mode does not apply to multi-blank items.",
      "- ⚠️ Do not generate passageWithBlank (the server builds it).",
      `- direction example: "다음 글의 빈칸 ${labelsText}에 들어갈 말로 가장 적절한 것은?"`,
    ].join("\n")));
  }

  if (useParaphraseAnswer) {
    return withGranularity(combinePromptSections(languagePrompt, [
      "## Type detail setting: BLANK_INFERENCE / paraphrased answer blank",
      "- Apply the teacher-selected blank paraphrase mode. Keep originalExpression copied verbatim from the passage only for locating the blank, but the visible correct option must be a non-verbatim paraphrase of that source expression.",
      "- Set blankAnswerMode to \"PARAPHRASE\".",
      "- Do NOT use the originalExpression itself as the correct option. Do not use a trivial same-word rearrangement. The correct option must preserve the full passage meaning, grammatical slot, polarity, scope, and causal/discourse relation.",
      "- Choose originalExpression as a compact semantic unit, normally 3-11 words and under 80 characters. Do not blank a whole sentence or a long clause containing multiple alternatives. In a frame like 'X requires more than A or B', blank A or B, not the whole 'X requires more than...' clause.",
      "- Difficulty calibration for the correct option: BASIC = shorter, high-frequency wording with minimal abstraction; INTERMEDIATE = natural academic paraphrase with one or two transformed content words, normally at least four words and four meaningful content words on both the source target and correct option; KILLER = compact abstract reformulation that requires connecting the blank sentence to surrounding evidence.",
      "- INTERMEDIATE calibration rejects 2-3 word local synonym swaps such as 'making judgments' -> 'forming evaluations'; choose a fuller source relation and write a fuller but still readable academic paraphrase.",
      "- originalExpression must stay compact. Never exceed about 12 words or 90 characters; if the intended idea is longer, blank the central relation phrase rather than the full clause.",
      "- KILLER calibration is strict: do not make a short local synonym item. The source blank should normally be at least seven words with five meaningful content words, the correct option should be a natural 8-16 word reformulation with at least six meaningful content words, and the answer must require at least two evidence links from the passage.",
      "- KILLER distractors must be genuinely competitive: at least three wrong options should be same-field near misses grounded in passage concepts. Avoid giveaway extremes or instant opposites such as unconditionally, completely, passive/passively, strict/strictly, inevitably, naturally, whatever, successfully, solely, entirely, fully, only, always, never, must, cannot, guarantees, definitive, flawless, seamless, error-free, automatically, altogether, eliminate, any form of, from/without/against any, bound to, or indefinitely unless the passage itself requires that exact force.",
      "- Wrong options must be paraphrased in the same register and length band as the correct option. They should borrow passage concepts but fail by subtle scope, polarity, cause/effect, target, concession, or thesis-direction shifts.",
      "- All five options must fit the exact same grammatical slot in the blank sentence. Silently substitute every option into the blank before finalizing.",
      "- Choose a clean semantic unit for originalExpression. Do not end originalExpression with a dangling modal, auxiliary, or function word such as will, can, could, is, are, or to.",
      "- If the blank is a sentence subject in a frame like '_____ is not whether ... but how ...', keep the correct option as a compact noun phrase such as 'the central challenge' or 'the main task'. Do not rewrite it as a gerund process phrase such as 'balancing ...' or 'choosing ...'.",
      "- Preserve source polarity and resistance/avoidance relations. Do not turn 'resisting/avoiding/rejecting X' into 'doing X'. For example, 'resisting the temptation to reduce...' should become a phrase such as 'avoiding a narrow reduction of...', not 'simplifying...'.",
      "- Insert every option into the blank sentence. If the left context already says 'ways in which _____' or 'process by which _____', do not repeat 'ways in which' or 'process by which' inside the option; start with the subject/action phrase that completes the frame.",
      "- If the left context already ends with a preposition such as by/of/to/for/with/from/in/on, do not start the option with another preposition. After 'by _____', write 'helping plants recover', not 'by helping plants recover'.",
      "- If the left context ends with 'to _____', every option must begin with a base verb phrase, not a gerund phrase such as 'critically evaluating...'.",
      "- If originalExpression is a finite clause such as 'it requires...', the correct option must keep a finite-clause shape when the blank starts after a semicolon or sentence boundary. Do not replace it with a bare gerund phrase such as 'making...'.",
      "- Use native, exam-grade paraphrases. Avoid stilted phrases such as 'carrying out following evaluations or estimations', 'act as an active filter', 'active filter amidst...', 'sovereignly filtering', 'cultural influxes', 'moral terrains', 'property of shared choices', 'synergistic channels', 'collective boundaries', 'compassionate comprehension', 'compromising alternatives', 'reality that envelopes us', 'degraders', or 'degraders internalize'.",
      "- Add answerLogic in Korean explaining the original source meaning, the paraphrased correct option, and the decisive trap in each wrong option.",
      "- Use the tag '빈칸 변형'.",
    ].join("\n")));
  }

  if (rawSettings.doubleNegative !== true) return withGranularity(languagePrompt);

  return withGranularity(combinePromptSections(languagePrompt, [
    "## Type detail setting: BLANK_INFERENCE / negative paraphrase blank",
    "- Apply the teacher-selected negative-paraphrase blank mode. The passage itself does NOT need to contain a negative cue.",
    "- The difficulty comes from the answer option: choose a central source expression from the passage, blank that exact expression, and make the correct option a semantically equivalent negative or privative paraphrase.",
    "- This is not a simple antonym or vocabulary item. Students should have to recognize that a negative-looking expression preserves the passage's original meaning.",
    "- Good correct-answer patterns include not + opposite, without + required element, lack/lacking, fail to, cannot ... without, prevent/keep ... from, not beyond, not distorted by, not independent of, free from, and non-/un-/in-/im- when natural.",
    "- The correct option should normally use one clear negative or privative mechanism. Avoid tangled chains such as 'not ... without', 'without ... not', 'fail ... without', repeated 'fail', 'unable ... without', or 'not ... excluding' unless the sentence remains unquestionably natural and equivalent.",
    "- Never create a no-subject + negative-predicate double negation such as 'No effort does not...', 'No strategy cannot...', or 'No reason is not...'. If the answer begins with no/lack/absence, the rest of the completed sentence should stay affirmative and logically clear.",
    "- originalExpression must be copied verbatim from the passage, but the correct option must not be verbatim and must not be a same-polarity near-synonym.",
    "- Choose a phrase with a real logical action or relation: a verb phrase, gerund phrase, participial phrase, or compact modified noun phrase. Do not blank a single abstract noun such as variation, diversity, complexity, trust, confidence, progress, reason, emotion, or memory.",
    "- Prefer originalExpression with no punctuation. Never choose a span containing a colon, semicolon, a comma-list, or a list of three or more items.",
    "- Avoid example-list slots such as 'such as ____', 'including ____', or 'for example ____'; those usually test vocabulary categories rather than reading logic.",
    "- The correct option must occupy the same grammatical slot as originalExpression. If the blank follows a preposition such as by, of, to, for, with, from, in, or on, the answer must not start with another preposition such as without/by/of/with.",
    "- If the blank comes after a form of be or a linking verb, the correct option must be a complement phrase. Never create broken sentences like 'reasons are cannot...'.",
    "- If the source sentence says 'can/could certainly be influenced by X', blank the whole modal passive span, for example 'can certainly be influenced by reasoning', not only 'influenced by reasoning'. This lets natural answers such as 'are not immune to rational modification' fit the sentence.",
    "- Before finalizing, silently read the original completed sentence and the answer completed sentence. If the answer version is ungrammatical or changes, narrows, exaggerates, or reverses the claim, rewrite it.",
    "- If the source means helps, guides, protects, strengthens, or supports, the negative paraphrase should preserve that function; do not overstate it as 'impossible without' or make the object helpless/dependent unless the passage actually says so.",
    "- Avoid 'impossible ... without' when it turns a helpful function into a strict necessity. Prefer a clean functional paraphrase such as 'preventing X from becoming Y' or 'not allowing X to be damaged'.",
    "- Avoid result-declaration answers such as 'not allow any disruption'. A policy answer should name the relation or mechanism in natural exam English, such as diversifying import sources, preserving a domestic base, securing stable supplies, or preventing excessive dependence when those ideas are in the passage.",
    "- Check the sentence immediately after the blank. If it says the strategy will reduce excessive dependence on foreign sources or create a balanced/resilient system, the correct option must not merely intensify import dependence; it must either choose a higher-level source expression or include the balancing/diversification relation.",
    "- In not only X but also Y structures, blank only the compact Y phrase, not the whole contrast. For example, use 'the protection of civic trust' rather than a comma-crossing span.",
    "- Use native, exam-grade collocations. Avoid awkward phrases such as 'prevent your achievement from failing', 'achievement failing', 'achieved success', 'capacity to lack', 'events cannot survive', 'guarantee major crops', 'not allow any disruption', or 'can be not entirely immune'. Prefer 'prevent success from eroding/collapsing', 'keep current success from eroding', 'freedom from dependence on...', 'secure stable supplies of major crops', 'events fail to matter', or 'are not immune to...'.",
    "- The correct option must contain a clear negative or privative cue: not, no, never, without, lack, fail/failure, prevent/keep from, cannot, unable, impossible, free from, non-, un-, in-/im-, exclude, undermine, compromise, erosion, or a close contextual equivalent.",
    "- The correct option must NOT be the only negative-looking option. At least two wrong options must also contain negative/privative language.",
    "- Build attractive wrong options in the current 2026 CSAT style: use the same semantic field and passage keywords, but make each one fail by subtle polarity, scope, causal-role, target, discourse-role, or thesis-direction shift.",
    "- Keep all options parallel in grammar, register, length, and abstraction level so the negative expression itself is not an answer giveaway.",
    "- Set blankAnswerMode to \"DOUBLE_NEGATIVE\".",
    "- Add answerLogic in Korean explaining how the negative/privative paraphrase preserves the original passage meaning and why each tempting wrong option fails.",
    "- Use the tag '부정 패러프레이즈' for this setting. Use '이중 부정' only when the correct option truly combines two negative mechanisms such as not + independent/immune/free or cannot + trivial; do not tag simple not + negative noun as double negative.",
    "- Wrong-option explanations must cite the decisive passage clue or blank-sentence logic, not merely say the option is positive/negative or close to the author's ideal. For conclusion blanks, explicitly connect the rejection to the conclusion signal such as 'remain in that position for long', 'when viewed at the timescales...', or the sentence immediately before/after the blank.",
    ].join("\n")));
  }

export function getEffectiveQuestionTypeDifficulty(
  settings: unknown,
  typeId: string,
  fallback: string | null | undefined = "INTERMEDIATE",
): QuestionDifficulty {
  return readQuestionTypeDifficultySetting(
    getQuestionTypeSettingsForType(settings, typeId),
    fallback,
  );
}

export function getEffectiveQuestionTypeGenerationPlan(
  settings: unknown,
  typeId: string,
  fallback: QuestionGenerationPlan = "STANDARD",
): QuestionGenerationPlan {
  return readQuestionTypeGenerationPlanSetting(
    getQuestionTypeSettingsForType(settings, typeId),
    fallback,
  );
}

export function getQuestionTypeGenerationCreditCost(
  baseCost: number,
  settings: unknown,
  typeId: string,
  fallback: QuestionGenerationPlan = "STANDARD",
): number {
  return getQuestionGenerationCreditCost(
    baseCost,
    getEffectiveQuestionTypeGenerationPlan(settings, typeId, fallback),
  );
}
