import type { QuestionDifficulty } from "@/lib/difficulty";
import {
  getQuestionGenerationCreditCost,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { buildMultiBlankPointGuidance } from "@/lib/blank-point-catalog";

export type QuestionGenerationLanguage = "ko" | "en";

export interface QuestionTypeQualityGenerationSettings {
  /** Optional per-type override. Falls back to the global generation difficulty. */
  difficulty?: QuestionDifficulty;
  /** Optional per-type quality plan override. Falls back to the global generation plan. */
  generationPlan?: QuestionGenerationPlan;
}

export interface QuestionLanguageGenerationSettings {
  /** Language for the visible stem/direction. Defaults are type-specific. */
  stemLanguage?: QuestionGenerationLanguage;
  /** Language for visible multiple-choice option text. Defaults are type-specific. */
  optionLanguage?: QuestionGenerationLanguage;
}

export interface BlankInferenceGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  doubleNegative?: boolean;
  /**
   * Use a non-verbatim paraphrase as the visible correct option while keeping
   * originalExpression verbatim for locating and blanking the source passage.
   */
  paraphraseAnswer?: boolean;
  /**
   * Number of passage blanks. 1 = the standard single-blank item (default,
   * untouched pipeline). 2~3 = combination-option variant: blanks (A)/(B)/(C)
   * with five blank-value combination options. doubleNegative applies only
   * to the single-blank mode.
   */
  blankCount?: number;
  /**
   * 핵심 집중 모드 — true 면 정답이 빈칸에서 완성하는 추론 논리를 기출 716문항 LLM
   * 검증 고빈출 코어(인과·개념명명·재진술·대조전환 + 보조 전체주제문)로 좁힌다.
   * false/미지정이면 기존 동작. 기본 false.
   */
  pointFocus?: boolean;
}

export interface IrrelevantGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of displayed slots. One slot is an inserted irrelevant sentence. Default 5. */
  slotCount?: number;
}

export interface GrammarErrorGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of grammar judgment positions to mark. Range 5~10. Default 5. */
  markerCount?: number;
  /** Number of actually incorrect marked expressions. Range 1~markerCount. Default 1. */
  answerCount?: number;
  /** Legacy field name kept for already-saved configs; interpreted as markerCount. */
  errorCount?: number;
  /**
   * 핵심 집중 모드 — true 면 정답 포인트를 기출 1000제 고빈출 톱셋(관계사·수일치·
   * to부정사/동명사·분사·대명사·형부)으로 좁혀 출제 포인트를 집중시킨다.
   * false/미지정이면 기존 다양성(코어 10개 순회). 기본 false.
   */
  pointFocus?: boolean;
}

export interface VocabChoiceGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of underlined vocabulary positions. Range 5~10. Default 5. */
  markerCount?: number;
  /** Number of contextually inappropriate words (= answers). Range 1~markerCount. Default 1. */
  answerCount?: number;
  /**
   * 동의어 변형 모드. true면 정답이 아닌 밑줄 단어도 원문 verbatim이 아니라 문맥상
   * 적절한 동의어로 표시해, 지문을 통째로 외운 학생도 표면 매칭으로는 못 풀게 한다.
   * 위치 식별용 originalWord는 항상 원문 그대로 유지되고, 정답(부적절 단어)의
   * originalWord/betterWord 계약도 그대로다. 기본 false.
   */
  synonymVariants?: boolean;
}

export interface SentenceInsertGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of insertion-position markers (①~). The answer is always one gap. Range 5~8. Default 5. */
  slotCount?: number;
  /**
   * 주어진(삽입) 문장의 앞부분을 같은 의미로 변형(패러프레이즈)한다. true면 도입 절/
   * 주어구의 표면 표현을 바꾸되, 정답 위치를 결정하는 응집 단서(지시어·연결어 등)의
   * 기능은 보존해 정답 칸은 그대로 유지된다. 지문 표현을 외워 표면 매칭하는 풀이를 막는다.
   * 기본 false.
   */
  paraphrasePrefix?: boolean;
  /**
   * 핵심 집중 모드 — true 면 정답 자리를 고정하는 응집장치를 기출 456문항 LLM 검증
   * 고빈출 코어(참조 해소·대조 전환 + 보조 인과)로 좁힌다. false/미지정이면 기존
   * 동작. 기본 false.
   */
  pointFocus?: boolean;
}

export interface SentenceOrderGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /**
   * (A)(B)(C) 문단 중 "앞 문장"을 같은 의미로 변형(패러프레이즈)할 문단 수.
   * 0 = 변형 없음(기본), 1~3 = 그만큼의 문단 첫 문장을 변형. 주어진 글은 항상 그대로
   * 두고, 정답 순서·문단 라벨은 변하지 않는다. 지문 암기 표면 매칭을 막는다.
   */
  prefixVariationCount?: number;
}

export interface AntonymGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of word-antonym pairs (A)~. Exactly one pair is wrong. Range 5~10. Default 5. */
  pairCount?: number;
}

export interface GenericOptionCountGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of free-text options. Range 4~8. Default 5. */
  optionCount?: number;
  /** Number of correct options ("모두 고르시오" variant). Range 1~optionCount-1. Default 1. */
  answerCount?: number;
}

export interface GrammarCorrectionGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of wrong underlined sentence/clause segments. Range 1~5. Default 1. */
  errorCount?: number;
  /**
   * 핵심 집중 모드 — true 면 정답 교정 포인트를 기출 1000제 고빈출 톱셋으로 좁힌다.
   * false/미지정이면 기존 다양성(코어 10개 순회). 기본 false.
   */
  pointFocus?: boolean;
}

export interface SummaryCompleteMcGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of summary blanks. Range 2~4. Default 2. */
  blankCount?: number;
}

/** 내용 일치 정답 극성. undefined = AUTO(모델 결정, 기존 동작). */
export type ContentMatchPolarity = "일치" | "불일치";

/** 대의파악 계열(제목/주제/요지) 정답 극성. undefined/POSITIVE = 기존 동작. */
export type GistAnswerPolarity = "POSITIVE" | "NEGATIVE";

export interface ContentMatchGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of displayed statement options. Range 5~12. Default 5. */
  optionCount?: number;
  /** Number of correct statements. Range 1~optionCount. Default 1. */
  answerCount?: number;
  /** Legacy analysis field name; interpreted as answerCount. */
  correctAnswerCount?: number;
  /**
   * 정답 극성 토글. "일치" = 일치하는 것 고르기, "불일치" = 일치하지 않는 것 고르기.
   * 미지정(undefined) = AUTO(모델이 결정) — 기존 동작과 100% 동일.
   */
  matchType?: ContentMatchPolarity;
}

export interface SummaryCompleteGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** Number of short-answer summary blanks. Range 1~5. Default 2. */
  blankCount?: number;
  /** Legacy analysis field name; interpreted as blankCount. */
  summaryBlankCount?: number;
}

/**
 * 요약문 영작(SUMMARY_WRITING) 세부옵션. 학생이 [보기]·해석·단서를 활용해 요약문
 * 빈칸을 영어로 직접 영작한다(SUMMARY_COMPLETE의 한 단계 상위). 여기 있는 값은
 * 전부 👁학생노출 출제 옵션 또는 결정론 발문/프롬프트 합성용이며, 정답계열
 * (modelAnswer/blanks[].answer/acceptableVariants/...)은 이 인터페이스에 없다.
 * v1 범위: sourceSpanHint는 항상 false 고정(렌더 복잡·KILLER off), 어법수정형 제외.
 */
export interface SummaryWritingGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /** 해석([해석] 박스) 제공 여부. 기본 true. */
  glossEnabled?: boolean;
  /** 해석 정밀도. KILLER에서 literal 금지(번역 역행). */
  glossLooseness?: "literal" | "natural" | "gist" | "partial";
  /** [보기] 칩 제공 여부. 기본 true. */
  wordBankEnabled?: boolean;
  /** 보기 사용 규칙. useAll=모두 사용, usePartial=필요한 것만(미끼 포함). */
  wordBankUsage?: "useAll" | "usePartial" | "freeCount";
  /** 미끼(정답에 안 쓰이는) 단어 수. 0~4. usePartial일 때만 유효. */
  boxDistractors?: number;
  /** 보기 어형 충실도. verbatim=원형 그대로, inflected=어형변형 필요(시제·수 한정). */
  wordBankFidelity?: "verbatim" | "inflected" | "mixed";
  /** 보기 배열 순서. */
  wordBankOrder?: "random" | "alphabetical" | "scrambleStrong";
  /** 보기 입도(단어 단위/구 단위). */
  wordBankChunking?: "word" | "chunk" | "mixed";
  /** 빈칸 개수. 1~3, 기본 1. */
  blankCount?: number;
  /** 보기 배분 방식. blankCount>=2일 때만 유효. separate=빈칸별 분리, shared=공유. */
  blankAssignment?: "separate" | "shared";
  /** 목표 단어수 표시. exact=정확히 N단어(useAll 금지), approx=약 N단어, hidden=미표시. */
  targetWordsMode?: "exact" | "approx" | "hidden";
  /** 빈칸당 목표 단어수. 3~17, 기본 7. 채점 메타·표시용(빈칸선 길이에 반영 금지). */
  targetWordsPerBlank?: number;
  /** 단서 방식. v1 실동작: none/firstLetter/skeleton/wordCount. */
  clueMode?:
    | "none"
    | "firstLetter"
    | "firstLetterDashes"
    | "skeleton"
    | "wordCount"
    | "koreanChunk";
  /** 빈칸 주변 프레임 제공 수준. */
  connectorFrame?: "full" | "partial" | "bare";
  /** 요약문 출처. paraphrase=환언, inference=상위명제 추론. */
  summarySourceMode?: "paraphrase" | "inference";
  /** 빈칸 밖 문장도 변형할지. 기본 false. */
  sourceSentenceParaphrase?: boolean;
  /** 채점 단위(메타). exact/keyword/rubric. */
  scoringGranularity?: "exact" | "keyword" | "rubric";
}

export const IRRELEVANT_SLOT_COUNT_MIN = 5;
export const IRRELEVANT_SLOT_COUNT_MAX = 10;
export const IRRELEVANT_SLOT_COUNT_DEFAULT = 5;
export const SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN = 2;
export const SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX = 4;
export const SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT = 2;
export const SUMMARY_COMPLETE_BLANK_COUNT_MIN = 1;
export const SUMMARY_COMPLETE_BLANK_COUNT_MAX = 5;
export const SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT = 2;
export const CONTENT_MATCH_OPTION_COUNT_MIN = 5;
export const CONTENT_MATCH_OPTION_COUNT_MAX = 12;
export const CONTENT_MATCH_OPTION_COUNT_DEFAULT = 5;
export const CONTENT_MATCH_ANSWER_COUNT_MIN = 1;
export const CONTENT_MATCH_ANSWER_COUNT_DEFAULT = 1;
export const GRAMMAR_MARKER_COUNT_MIN = 5;
export const GRAMMAR_MARKER_COUNT_MAX = 10;
export const GRAMMAR_MARKER_COUNT_DEFAULT = 5;
export const GRAMMAR_ANSWER_COUNT_MIN = 1;
export const GRAMMAR_ANSWER_COUNT_MAX = GRAMMAR_MARKER_COUNT_MAX;
export const GRAMMAR_ANSWER_COUNT_DEFAULT = 1;
export const GRAMMAR_ERROR_COUNT_MIN = GRAMMAR_ANSWER_COUNT_MIN;
export const GRAMMAR_ERROR_COUNT_MAX = GRAMMAR_ANSWER_COUNT_MAX;
export const GRAMMAR_ERROR_COUNT_DEFAULT = GRAMMAR_ANSWER_COUNT_DEFAULT;
export const GRAMMAR_CORRECTION_ERROR_COUNT_MIN = 1;
export const GRAMMAR_CORRECTION_ERROR_COUNT_MAX = 5;
export const GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT = 1;
export const VOCAB_CHOICE_MARKER_COUNT_MIN = 5;
export const VOCAB_CHOICE_MARKER_COUNT_MAX = 10;
export const VOCAB_CHOICE_MARKER_COUNT_DEFAULT = 5;
export const VOCAB_CHOICE_ANSWER_COUNT_MIN = 1;
export const VOCAB_CHOICE_ANSWER_COUNT_MAX = VOCAB_CHOICE_MARKER_COUNT_MAX;
export const VOCAB_CHOICE_ANSWER_COUNT_DEFAULT = 1;
export const GENERIC_OPTION_COUNT_MIN = 4;
export const GENERIC_OPTION_COUNT_MAX = 8;
export const GENERIC_OPTION_COUNT_DEFAULT = 5;
export const GENERIC_ANSWER_COUNT_MIN = 1;
export const GENERIC_ANSWER_COUNT_DEFAULT = 1;
export const SENTENCE_INSERT_SLOT_COUNT_MIN = 5;
export const SENTENCE_INSERT_SLOT_COUNT_MAX = 8;
export const SENTENCE_INSERT_SLOT_COUNT_DEFAULT = 5;
export const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN = 0;
export const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX = 3;
export const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT = 0;
export const ANTONYM_PAIR_COUNT_MIN = 5;
export const ANTONYM_PAIR_COUNT_MAX = 10;
export const ANTONYM_PAIR_COUNT_DEFAULT = 5;
export const BLANK_INFERENCE_BLANK_COUNT_MIN = 1;
export const BLANK_INFERENCE_BLANK_COUNT_MAX = 3;
export const BLANK_INFERENCE_BLANK_COUNT_DEFAULT = 1;
export const SUMMARY_WRITING_BLANK_COUNT_MIN = 1;
export const SUMMARY_WRITING_BLANK_COUNT_MAX = 3;
export const SUMMARY_WRITING_BLANK_COUNT_DEFAULT = 1;
export const SUMMARY_WRITING_DISTRACTOR_COUNT_MIN = 0;
export const SUMMARY_WRITING_DISTRACTOR_COUNT_MAX = 4;
export const SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT = 0;
export const SUMMARY_WRITING_TARGET_WORDS_MIN = 3;
export const SUMMARY_WRITING_TARGET_WORDS_MAX = 17;
export const SUMMARY_WRITING_TARGET_WORDS_DEFAULT = 7;

const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"] as const;
const VOCAB_CHOICE_LABELS = ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)", "(i)", "(j)"] as const;

/**
 * Types whose options are interchangeable free-text statements, so the visible
 * option count is a tunable parameter (4~8). Structural option surfaces
 * (passage-anchored markers, order combinations, blank fillers) are excluded.
 */
const GENERIC_OPTION_COUNT_TYPE_ID_LIST = [
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "CONTEXT_MEANING",
  "SYNONYM",
] as const;
const GENERIC_OPTION_COUNT_TYPE_IDS = new Set<string>(GENERIC_OPTION_COUNT_TYPE_ID_LIST);

export function supportsGenericOptionCount(typeId: string): boolean {
  return GENERIC_OPTION_COUNT_TYPE_IDS.has(typeId);
}

/**
 * 대의파악 계열 — "적절한 것 ↔ 적절하지 않은 것" 정답 극성 토글 지원 유형.
 * (IMPLIED_MEANING/CONTEXT_MEANING/SYNONYM은 generic 옵션수는 쓰지만 극성 토글
 *  대상 아님 — 이번 작업 범위에서 제외.)
 */
const GIST_POLARITY_TYPE_IDS = new Set<string>([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
]);

export function supportsGistAnswerPolarity(typeId: string): boolean {
  return GIST_POLARITY_TYPE_IDS.has(typeId);
}

const DEFAULT_QUESTION_LANGUAGE_SETTINGS: Record<
  string,
  Required<QuestionLanguageGenerationSettings>
> = {
  BLANK_INFERENCE: { stemLanguage: "ko", optionLanguage: "en" },
  GRAMMAR_ERROR: { stemLanguage: "ko", optionLanguage: "ko" },
  // 네모 어법 보기는 영어 후보 조합(구조적) — 보기 언어 토글 대상 아님.
  GRAMMAR_CHOICE_COMBO: { stemLanguage: "ko", optionLanguage: "ko" },
  VOCAB_CHOICE: { stemLanguage: "ko", optionLanguage: "en" },
  SENTENCE_ORDER: { stemLanguage: "ko", optionLanguage: "en" },
  SENTENCE_INSERT: { stemLanguage: "ko", optionLanguage: "ko" },
  TOPIC: { stemLanguage: "ko", optionLanguage: "en" },
  MAIN_IDEA: { stemLanguage: "ko", optionLanguage: "ko" },
  TOPIC_MAIN_IDEA: { stemLanguage: "ko", optionLanguage: "ko" },
  TITLE: { stemLanguage: "ko", optionLanguage: "en" },
  IMPLIED_MEANING: { stemLanguage: "ko", optionLanguage: "en" },
  REFERENCE: { stemLanguage: "ko", optionLanguage: "ko" },
  // 내용일치 보기 기본 = 영문 (2026-06-10 강사 피드백: 학생들이 영문 보기 선호.
  // 한국어 보기는 유형 상세 설정의 언어 토글로 선택).
  CONTENT_MATCH: { stemLanguage: "ko", optionLanguage: "en" },
  SUMMARY_COMPLETE_MC: { stemLanguage: "ko", optionLanguage: "en" },
  IRRELEVANT: { stemLanguage: "ko", optionLanguage: "ko" },
  GRAMMAR_CORRECTION: { stemLanguage: "ko", optionLanguage: "ko" },
  SUMMARY_COMPLETE: { stemLanguage: "ko", optionLanguage: "en" },
  // 요약문 영작 — 서술형(options=null). 발문은 한국어, 보기·요약문은 영어 고정.
  // getQuestionLanguageToggleScope 가 'stem' 을 반환하므로 optionLanguage 는 노출 안 됨.
  SUMMARY_WRITING: { stemLanguage: "ko", optionLanguage: "en" },
  CONDITIONAL_WRITING: { stemLanguage: "ko", optionLanguage: "ko" },
  SENTENCE_TRANSFORM: { stemLanguage: "ko", optionLanguage: "ko" },
  FILL_BLANK_KEY: { stemLanguage: "ko", optionLanguage: "ko" },
  WORD_ORDER: { stemLanguage: "ko", optionLanguage: "ko" },
  CONTEXT_MEANING: { stemLanguage: "ko", optionLanguage: "en" },
  SYNONYM: { stemLanguage: "ko", optionLanguage: "en" },
  ANTONYM: { stemLanguage: "ko", optionLanguage: "en" },
};

/**
 * Types whose visible option text is free-language (Korean or English both make
 * a valid question). Everywhere else the option surface is structurally fixed:
 * label/number-only options (SENTENCE_ORDER/INSERT, IRRELEVANT, GRAMMAR_ERROR,
 * REFERENCE), English blank/summary fillers (BLANK_INFERENCE,
 * SUMMARY_COMPLETE_MC), English word lists (VOCAB_CHOICE, SYNONYM, ANTONYM),
 * or no options at all (서술형).
 */
const OPTION_LANGUAGE_FREE_TYPE_IDS = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "CONTEXT_MEANING",
  "CONTENT_MATCH",
]);

export type QuestionLanguageToggleScope = "stem" | "stem-option";

/** Which visible-language toggles make sense for a type. Stem applies to every type. */
export function getQuestionLanguageToggleScope(
  typeId: string,
): QuestionLanguageToggleScope {
  return OPTION_LANGUAGE_FREE_TYPE_IDS.has(typeId) ? "stem-option" : "stem";
}

type NumericSettingMax =
  | number
  | ((resolved: Record<string, number>) => number);

interface NumericSettingSpec {
  key: string;
  aliases?: string[];
  min: number;
  max: NumericSettingMax;
  defaultValue: number;
}

function numericSettingKeys(spec: NumericSettingSpec): string[] {
  return [spec.key, ...(spec.aliases ?? [])];
}

function numericSettingMax(
  spec: NumericSettingSpec,
  resolved: Record<string, number>,
) {
  return typeof spec.max === "function" ? spec.max(resolved) : spec.max;
}

function normalizeNumericSetting(
  value: unknown,
  spec: NumericSettingSpec,
  resolved: Record<string, number> = {},
): number {
  const n = typeof value === "number" ? value : Number(value);
  const max = numericSettingMax(spec, resolved);
  if (!Number.isFinite(n)) return Math.min(spec.defaultValue, max);
  const rounded = Math.round(n);
  return Math.min(max, Math.max(spec.min, rounded));
}

function readNumericSettingValue(
  source: unknown,
  spec: NumericSettingSpec,
): unknown {
  if (!isRecord(source)) return undefined;
  for (const key of numericSettingKeys(spec)) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function readNumericSetting(
  rawSettings: unknown,
  typeId: string,
  spec: NumericSettingSpec,
  resolved: Record<string, number> = {},
): number {
  const directValue = readNumericSettingValue(rawSettings, spec);
  if (directValue !== undefined) {
    return normalizeNumericSetting(directValue, spec, resolved);
  }

  const nested = isRecord(rawSettings) ? rawSettings[typeId] : undefined;
  const nestedValue = readNumericSettingValue(nested, spec);
  return normalizeNumericSetting(nestedValue, spec, resolved);
}

function defaultLanguageSettingsForType(
  typeId: string,
): Required<QuestionLanguageGenerationSettings> {
  return (
    DEFAULT_QUESTION_LANGUAGE_SETTINGS[typeId] ?? {
      stemLanguage: "ko",
      optionLanguage: "ko",
    }
  );
}

function normalizeGenerationLanguage(
  value: unknown,
  fallback: QuestionGenerationLanguage,
): QuestionGenerationLanguage {
  return value === "en" || value === "ko" ? value : fallback;
}

function readLanguageSettingValue(
  source: unknown,
  key: keyof QuestionLanguageGenerationSettings,
): unknown {
  if (!isRecord(source)) return undefined;
  return source[key];
}

function readLanguageSetting(
  rawSettings: unknown,
  typeId: string,
  key: keyof QuestionLanguageGenerationSettings,
): QuestionGenerationLanguage {
  const defaults = defaultLanguageSettingsForType(typeId);
  const fallback = defaults[key] ?? "ko";
  const directValue = readLanguageSettingValue(rawSettings, key);
  if (directValue !== undefined) {
    return normalizeGenerationLanguage(directValue, fallback);
  }

  const nested = isRecord(rawSettings) ? rawSettings[typeId] : undefined;
  const nestedValue = readLanguageSettingValue(nested, key);
  return normalizeGenerationLanguage(nestedValue, fallback);
}

function readBooleanSetting(
  rawSettings: unknown,
  typeId: string,
  key: string,
): boolean {
  if (isRecord(rawSettings) && rawSettings[key] !== undefined) {
    return rawSettings[key] === true;
  }

  const nested = isRecord(rawSettings) ? rawSettings[typeId] : undefined;
  return isRecord(nested) && nested[key] === true;
}

export function readStemLanguageSetting(
  rawSettings: unknown,
  typeId: string,
): QuestionGenerationLanguage {
  return readLanguageSetting(rawSettings, typeId, "stemLanguage");
}

export function readOptionLanguageSetting(
  rawSettings: unknown,
  typeId: string,
): QuestionGenerationLanguage {
  return readLanguageSetting(rawSettings, typeId, "optionLanguage");
}

export function readBlankInferenceParaphraseAnswerSetting(
  rawSettings: unknown,
): boolean {
  return readBooleanSetting(rawSettings, "BLANK_INFERENCE", "paraphraseAnswer");
}

export function readVocabChoiceSynonymVariantsSetting(
  rawSettings: unknown,
): boolean {
  return readBooleanSetting(rawSettings, "VOCAB_CHOICE", "synonymVariants");
}

/**
 * 내용 일치 정답 극성 설정 읽기. flat(rawSettings.matchType) 우선, nested
 * (rawSettings.CONTENT_MATCH.matchType) 폴백 — 다른 read 헬퍼와 동일 규약.
 * 강사 선택은 "일치"/"불일치" 둘 중 하나이며, 미지정 시 기본값은 "불일치"
 * (수능 표준형이자 기존 모델의 사실상 기본 동작). "자동" 개념은 없음.
 */
export function readContentMatchTypeSetting(
  rawSettings: unknown,
): ContentMatchPolarity {
  if (!isRecord(rawSettings)) return "불일치";
  const direct = rawSettings.matchType;
  const nested = isRecord(rawSettings.CONTENT_MATCH)
    ? rawSettings.CONTENT_MATCH.matchType
    : undefined;
  const value = direct !== undefined ? direct : nested;
  return value === "일치" ? "일치" : "불일치";
}

/**
 * 대의파악 계열 정답 극성 설정 읽기. flat 우선 → nested(typeId) 폴백.
 * "NEGATIVE"일 때만 반환, 그 외(POSITIVE/미설정/타유형) = undefined(기존 동작).
 */
export function readGistAnswerPolaritySetting(
  rawSettings: unknown,
  typeId: string,
): GistAnswerPolarity | undefined {
  if (!supportsGistAnswerPolarity(typeId)) return undefined;
  if (!isRecord(rawSettings)) return undefined;
  const direct = rawSettings.answerPolarity;
  const nestedRecord = isRecord(rawSettings[typeId])
    ? (rawSettings[typeId] as Record<string, unknown>)
    : undefined;
  const value = direct !== undefined ? direct : nestedRecord?.answerPolarity;
  return value === "NEGATIVE" ? "NEGATIVE" : undefined;
}

export function readSentenceInsertParaphrasePrefixSetting(
  rawSettings: unknown,
): boolean {
  return readBooleanSetting(rawSettings, "SENTENCE_INSERT", "paraphrasePrefix");
}

const IRRELEVANT_SLOT_COUNT_SETTING: NumericSettingSpec = {
  key: "slotCount",
  min: IRRELEVANT_SLOT_COUNT_MIN,
  max: IRRELEVANT_SLOT_COUNT_MAX,
  defaultValue: IRRELEVANT_SLOT_COUNT_DEFAULT,
};

const SUMMARY_COMPLETE_MC_BLANK_COUNT_SETTING: NumericSettingSpec = {
  key: "blankCount",
  aliases: ["summaryBlankCount"],
  min: SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN,
  max: SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
  defaultValue: SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
};

const SUMMARY_COMPLETE_BLANK_COUNT_SETTING: NumericSettingSpec = {
  key: "blankCount",
  aliases: ["summaryBlankCount"],
  min: SUMMARY_COMPLETE_BLANK_COUNT_MIN,
  max: SUMMARY_COMPLETE_BLANK_COUNT_MAX,
  defaultValue: SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT,
};

const CONTENT_MATCH_OPTION_COUNT_SETTING: NumericSettingSpec = {
  key: "optionCount",
  min: CONTENT_MATCH_OPTION_COUNT_MIN,
  max: CONTENT_MATCH_OPTION_COUNT_MAX,
  defaultValue: CONTENT_MATCH_OPTION_COUNT_DEFAULT,
};

const CONTENT_MATCH_ANSWER_COUNT_SETTING: NumericSettingSpec = {
  key: "answerCount",
  aliases: ["correctAnswerCount"],
  min: CONTENT_MATCH_ANSWER_COUNT_MIN,
  max: (resolved) => resolved.optionCount ?? CONTENT_MATCH_OPTION_COUNT_DEFAULT,
  defaultValue: CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
};

const GRAMMAR_MARKER_COUNT_SETTING: NumericSettingSpec = {
  key: "markerCount",
  aliases: ["errorCount"],
  min: GRAMMAR_MARKER_COUNT_MIN,
  max: GRAMMAR_MARKER_COUNT_MAX,
  defaultValue: GRAMMAR_MARKER_COUNT_DEFAULT,
};

const GRAMMAR_ANSWER_COUNT_SETTING: NumericSettingSpec = {
  key: "answerCount",
  aliases: ["correctAnswerCount"],
  min: GRAMMAR_ANSWER_COUNT_MIN,
  max: (resolved) => resolved.markerCount ?? GRAMMAR_MARKER_COUNT_DEFAULT,
  defaultValue: GRAMMAR_ANSWER_COUNT_DEFAULT,
};

const GRAMMAR_CORRECTION_ERROR_COUNT_SETTING: NumericSettingSpec = {
  key: "errorCount",
  aliases: ["answerCount"],
  min: GRAMMAR_CORRECTION_ERROR_COUNT_MIN,
  max: GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
  defaultValue: GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT,
};

const VOCAB_CHOICE_MARKER_COUNT_SETTING: NumericSettingSpec = {
  key: "markerCount",
  min: VOCAB_CHOICE_MARKER_COUNT_MIN,
  max: VOCAB_CHOICE_MARKER_COUNT_MAX,
  defaultValue: VOCAB_CHOICE_MARKER_COUNT_DEFAULT,
};

const VOCAB_CHOICE_ANSWER_COUNT_SETTING: NumericSettingSpec = {
  key: "answerCount",
  aliases: ["correctAnswerCount"],
  min: VOCAB_CHOICE_ANSWER_COUNT_MIN,
  max: (resolved) => resolved.markerCount ?? VOCAB_CHOICE_MARKER_COUNT_DEFAULT,
  defaultValue: VOCAB_CHOICE_ANSWER_COUNT_DEFAULT,
};

const GENERIC_OPTION_COUNT_SETTING: NumericSettingSpec = {
  key: "optionCount",
  min: GENERIC_OPTION_COUNT_MIN,
  max: GENERIC_OPTION_COUNT_MAX,
  defaultValue: GENERIC_OPTION_COUNT_DEFAULT,
};

// At least one wrong option must remain, so the cap is optionCount - 1.
const GENERIC_ANSWER_COUNT_SETTING: NumericSettingSpec = {
  key: "answerCount",
  aliases: ["correctAnswerCount"],
  min: GENERIC_ANSWER_COUNT_MIN,
  max: (resolved) =>
    Math.max(
      GENERIC_ANSWER_COUNT_MIN,
      (resolved.optionCount ?? GENERIC_OPTION_COUNT_DEFAULT) - 1,
    ),
  defaultValue: GENERIC_ANSWER_COUNT_DEFAULT,
};

const SENTENCE_INSERT_SLOT_COUNT_SETTING: NumericSettingSpec = {
  key: "slotCount",
  aliases: ["optionCount"],
  min: SENTENCE_INSERT_SLOT_COUNT_MIN,
  max: SENTENCE_INSERT_SLOT_COUNT_MAX,
  defaultValue: SENTENCE_INSERT_SLOT_COUNT_DEFAULT,
};

const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_SETTING: NumericSettingSpec = {
  key: "prefixVariationCount",
  min: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN,
  max: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX,
  defaultValue: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT,
};

const ANTONYM_PAIR_COUNT_SETTING: NumericSettingSpec = {
  key: "pairCount",
  aliases: ["optionCount", "markerCount"],
  min: ANTONYM_PAIR_COUNT_MIN,
  max: ANTONYM_PAIR_COUNT_MAX,
  defaultValue: ANTONYM_PAIR_COUNT_DEFAULT,
};

const BLANK_INFERENCE_BLANK_COUNT_SETTING: NumericSettingSpec = {
  key: "blankCount",
  min: BLANK_INFERENCE_BLANK_COUNT_MIN,
  max: BLANK_INFERENCE_BLANK_COUNT_MAX,
  defaultValue: BLANK_INFERENCE_BLANK_COUNT_DEFAULT,
};

const SUMMARY_WRITING_BLANK_COUNT_SETTING: NumericSettingSpec = {
  key: "blankCount",
  aliases: ["summaryBlankCount"],
  min: SUMMARY_WRITING_BLANK_COUNT_MIN,
  max: SUMMARY_WRITING_BLANK_COUNT_MAX,
  defaultValue: SUMMARY_WRITING_BLANK_COUNT_DEFAULT,
};

const SUMMARY_WRITING_DISTRACTOR_COUNT_SETTING: NumericSettingSpec = {
  key: "boxDistractors",
  min: SUMMARY_WRITING_DISTRACTOR_COUNT_MIN,
  max: SUMMARY_WRITING_DISTRACTOR_COUNT_MAX,
  defaultValue: SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT,
};

const SUMMARY_WRITING_TARGET_WORDS_SETTING: NumericSettingSpec = {
  key: "targetWordsPerBlank",
  min: SUMMARY_WRITING_TARGET_WORDS_MIN,
  max: SUMMARY_WRITING_TARGET_WORDS_MAX,
  defaultValue: SUMMARY_WRITING_TARGET_WORDS_DEFAULT,
};

function getIrrelevantLabel(index: number): string {
  if (index >= 0 && index < 20) return String.fromCodePoint(0x2460 + index);
  if (index >= 20 && index < 35) return String.fromCodePoint(0x3251 + (index - 20));
  if (index >= 35 && index < 50) return String.fromCodePoint(0x32b1 + (index - 35));
  return `(${index + 1})`;
}

export function normalizeIrrelevantSlotCount(value: unknown): number {
  return normalizeNumericSetting(value, IRRELEVANT_SLOT_COUNT_SETTING);
}

export function readIrrelevantSlotCountSetting(rawSettings: unknown): number {
  return readNumericSetting(rawSettings, "IRRELEVANT", IRRELEVANT_SLOT_COUNT_SETTING);
}

export function normalizeSummaryCompleteMcBlankCount(value: unknown): number {
  return normalizeNumericSetting(value, SUMMARY_COMPLETE_MC_BLANK_COUNT_SETTING);
}

export function readSummaryCompleteMcBlankCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "SUMMARY_COMPLETE_MC",
    SUMMARY_COMPLETE_MC_BLANK_COUNT_SETTING,
  );
}

export function normalizeSummaryCompleteBlankCount(value: unknown): number {
  return normalizeNumericSetting(value, SUMMARY_COMPLETE_BLANK_COUNT_SETTING);
}

export function readSummaryCompleteBlankCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "SUMMARY_COMPLETE",
    SUMMARY_COMPLETE_BLANK_COUNT_SETTING,
  );
}

export function normalizeContentMatchOptionCount(value: unknown): number {
  return normalizeNumericSetting(value, CONTENT_MATCH_OPTION_COUNT_SETTING);
}

export function normalizeContentMatchAnswerCount(
  value: unknown,
  optionCount: number = CONTENT_MATCH_OPTION_COUNT_DEFAULT,
): number {
  const optionMax = normalizeContentMatchOptionCount(optionCount);
  return normalizeNumericSetting(
    value,
    CONTENT_MATCH_ANSWER_COUNT_SETTING,
    { optionCount: optionMax },
  );
}

export function readContentMatchOptionCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "CONTENT_MATCH",
    CONTENT_MATCH_OPTION_COUNT_SETTING,
  );
}

export function readContentMatchAnswerCountSetting(
  rawSettings: unknown,
  optionCount: number = readContentMatchOptionCountSetting(rawSettings),
): number {
  return readNumericSetting(
    rawSettings,
    "CONTENT_MATCH",
    CONTENT_MATCH_ANSWER_COUNT_SETTING,
    { optionCount: normalizeContentMatchOptionCount(optionCount) },
  );
}

export function normalizeGrammarMarkerCount(value: unknown): number {
  return normalizeNumericSetting(value, GRAMMAR_MARKER_COUNT_SETTING);
}

export function normalizeGrammarErrorCount(value: unknown): number {
  return normalizeGrammarAnswerCount(value);
}

export function normalizeGrammarAnswerCount(
  value: unknown,
  markerCount: number = GRAMMAR_MARKER_COUNT_DEFAULT,
): number {
  const marker = normalizeGrammarMarkerCount(markerCount);
  return normalizeNumericSetting(
    value,
    GRAMMAR_ANSWER_COUNT_SETTING,
    { markerCount: marker },
  );
}

export function readGrammarMarkerCountSetting(rawSettings: unknown): number {
  return readNumericSetting(rawSettings, "GRAMMAR_ERROR", GRAMMAR_MARKER_COUNT_SETTING);
}

export function readGrammarErrorCountSetting(rawSettings: unknown): number {
  const markerCount = readGrammarMarkerCountSetting(rawSettings);
  return readGrammarAnswerCountSetting(rawSettings, markerCount);
}

export function readGrammarAnswerCountSetting(
  rawSettings: unknown,
  markerCount: number = readGrammarMarkerCountSetting(rawSettings),
): number {
  return readNumericSetting(
    rawSettings,
    "GRAMMAR_ERROR",
    GRAMMAR_ANSWER_COUNT_SETTING,
    { markerCount: normalizeGrammarMarkerCount(markerCount) },
  );
}

export function normalizeGrammarCorrectionErrorCount(value: unknown): number {
  return normalizeNumericSetting(value, GRAMMAR_CORRECTION_ERROR_COUNT_SETTING);
}

export function readGrammarCorrectionErrorCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "GRAMMAR_CORRECTION",
    GRAMMAR_CORRECTION_ERROR_COUNT_SETTING,
  );
}

export function normalizeVocabChoiceMarkerCount(value: unknown): number {
  return normalizeNumericSetting(value, VOCAB_CHOICE_MARKER_COUNT_SETTING);
}

export function normalizeVocabChoiceAnswerCount(
  value: unknown,
  markerCount: number = VOCAB_CHOICE_MARKER_COUNT_DEFAULT,
): number {
  const marker = normalizeVocabChoiceMarkerCount(markerCount);
  return normalizeNumericSetting(
    value,
    VOCAB_CHOICE_ANSWER_COUNT_SETTING,
    { markerCount: marker },
  );
}

export function readVocabChoiceMarkerCountSetting(rawSettings: unknown): number {
  return readNumericSetting(rawSettings, "VOCAB_CHOICE", VOCAB_CHOICE_MARKER_COUNT_SETTING);
}

export function readVocabChoiceAnswerCountSetting(
  rawSettings: unknown,
  markerCount: number = readVocabChoiceMarkerCountSetting(rawSettings),
): number {
  return readNumericSetting(
    rawSettings,
    "VOCAB_CHOICE",
    VOCAB_CHOICE_ANSWER_COUNT_SETTING,
    { markerCount: normalizeVocabChoiceMarkerCount(markerCount) },
  );
}

export function normalizeGenericOptionCount(value: unknown): number {
  return normalizeNumericSetting(value, GENERIC_OPTION_COUNT_SETTING);
}

export function normalizeSentenceInsertSlotCount(value: unknown): number {
  return normalizeNumericSetting(value, SENTENCE_INSERT_SLOT_COUNT_SETTING);
}

export function readSentenceInsertSlotCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "SENTENCE_INSERT",
    SENTENCE_INSERT_SLOT_COUNT_SETTING,
  );
}

export function normalizeSentenceOrderPrefixVariationCount(value: unknown): number {
  return normalizeNumericSetting(
    value,
    SENTENCE_ORDER_PREFIX_VARIATION_COUNT_SETTING,
  );
}

export function readSentenceOrderPrefixVariationCountSetting(
  rawSettings: unknown,
): number {
  return readNumericSetting(
    rawSettings,
    "SENTENCE_ORDER",
    SENTENCE_ORDER_PREFIX_VARIATION_COUNT_SETTING,
  );
}

export function normalizeAntonymPairCount(value: unknown): number {
  return normalizeNumericSetting(value, ANTONYM_PAIR_COUNT_SETTING);
}

export function readAntonymPairCountSetting(rawSettings: unknown): number {
  return readNumericSetting(rawSettings, "ANTONYM", ANTONYM_PAIR_COUNT_SETTING);
}

export function normalizeBlankInferenceBlankCount(value: unknown): number {
  return normalizeNumericSetting(value, BLANK_INFERENCE_BLANK_COUNT_SETTING);
}

export function readBlankInferenceBlankCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "BLANK_INFERENCE",
    BLANK_INFERENCE_BLANK_COUNT_SETTING,
  );
}

export function normalizeSummaryWritingBlankCount(value: unknown): number {
  return normalizeNumericSetting(value, SUMMARY_WRITING_BLANK_COUNT_SETTING);
}

/** U2가 import하는 정식 이름 — 절대 변경 금지. */
export function readSummaryWritingBlankCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "SUMMARY_WRITING",
    SUMMARY_WRITING_BLANK_COUNT_SETTING,
  );
}

export function normalizeSummaryWritingDistractorCount(value: unknown): number {
  return normalizeNumericSetting(value, SUMMARY_WRITING_DISTRACTOR_COUNT_SETTING);
}

export function readSummaryWritingDistractorCountSetting(
  rawSettings: unknown,
): number {
  return readNumericSetting(
    rawSettings,
    "SUMMARY_WRITING",
    SUMMARY_WRITING_DISTRACTOR_COUNT_SETTING,
  );
}

export function normalizeSummaryWritingTargetWords(value: unknown): number {
  return normalizeNumericSetting(value, SUMMARY_WRITING_TARGET_WORDS_SETTING);
}

export function readSummaryWritingTargetWordsSetting(
  rawSettings: unknown,
): number {
  return readNumericSetting(
    rawSettings,
    "SUMMARY_WRITING",
    SUMMARY_WRITING_TARGET_WORDS_SETTING,
  );
}

/**
 * SUMMARY_WRITING 열거형/불리언 옵션을 안전하게 읽는다(flat 우선 → nested(typeId) 폴백,
 * 다른 read 헬퍼와 동일 규약). 허용값 밖이면 fallback 반환.
 */
function readSummaryWritingEnumSetting<T extends string>(
  rawSettings: unknown,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const allow = (v: unknown): v is T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v);
  if (isRecord(rawSettings) && allow(rawSettings[key])) {
    return rawSettings[key] as T;
  }
  const nested = isRecord(rawSettings) ? rawSettings.SUMMARY_WRITING : undefined;
  if (isRecord(nested) && allow(nested[key])) {
    return nested[key] as T;
  }
  return fallback;
}

/**
 * SUMMARY_WRITING boolean 읽기. 기본값(미설정 시)을 호출자가 지정한다(해석/보기 토글은
 * 기본 ON 이므로 기존 readBooleanSetting(기본 false 고정)을 그대로 쓰지 못한다).
 */
function readSummaryWritingBooleanSetting(
  rawSettings: unknown,
  key: string,
  fallback: boolean,
): boolean {
  if (isRecord(rawSettings) && typeof rawSettings[key] === "boolean") {
    return rawSettings[key] as boolean;
  }
  const nested = isRecord(rawSettings) ? rawSettings.SUMMARY_WRITING : undefined;
  if (isRecord(nested) && typeof nested[key] === "boolean") {
    return nested[key] as boolean;
  }
  return fallback;
}

export function readGenericOptionCountSetting(
  rawSettings: unknown,
  typeId: string,
): number {
  return readNumericSetting(rawSettings, typeId, GENERIC_OPTION_COUNT_SETTING);
}

export function normalizeGenericAnswerCount(
  value: unknown,
  optionCount: number = GENERIC_OPTION_COUNT_DEFAULT,
): number {
  return normalizeNumericSetting(value, GENERIC_ANSWER_COUNT_SETTING, {
    optionCount: normalizeGenericOptionCount(optionCount),
  });
}

export function readGenericAnswerCountSetting(
  rawSettings: unknown,
  typeId: string,
  optionCount: number = readGenericOptionCountSetting(rawSettings, typeId),
): number {
  return readNumericSetting(rawSettings, typeId, GENERIC_ANSWER_COUNT_SETTING, {
    optionCount: normalizeGenericOptionCount(optionCount),
  });
}

export interface IrrelevantSlotValidation {
  ok: boolean;
  /** The slot count actually usable for generation (capped to passage length). */
  effective: number;
  /** Passage sentence count detected. */
  passageSentenceCount: number;
  /** Human-readable Korean error if !ok, else undefined. */
  error?: string;
}

/**
 * Validate a requested IRRELEVANT slot count against the actual passage.
 * - requested < 5  → clamped to 5 (callers should pre-clamp via normalizeIrrelevantSlotCount)
 * - the original first passage sentence is excluded from numbered choices
 * - passage < 5 sentences → not generatable (5 slots need 4 non-intro source sentences + 1 inserted sentence)
 * - passage < requested → reject so user can lower the count or pick another passage
 */
export function validateIrrelevantAgainstPassage(
  requestedSlotCount: number,
  passageSentenceCount: number,
): IrrelevantSlotValidation {
  const requested = normalizeIrrelevantSlotCount(requestedSlotCount);
  const requiredSourceSentenceCount = requested - 1;
  const minimumSourceSentenceCount = IRRELEVANT_SLOT_COUNT_MIN - 1;
  const availableSourceSentenceCount = Math.max(0, passageSentenceCount - 1);

  if (availableSourceSentenceCount < minimumSourceSentenceCount) {
    return {
      ok: false,
      effective: Math.max(0, availableSourceSentenceCount + 1),
      passageSentenceCount,
      error: `무관한 문장 유형은 첫 문장을 선지에서 제외하므로, 원문 문장이 최소 ${minimumSourceSentenceCount + 1}개 이상이어야 합니다. 현재 지문은 ${passageSentenceCount}문장입니다.`,
    };
  }
  if (availableSourceSentenceCount < requiredSourceSentenceCount) {
    return {
      ok: false,
      effective: availableSourceSentenceCount + 1,
      passageSentenceCount,
      error: `이 지문은 첫 문장을 제외하면 원문 ${availableSourceSentenceCount}문장을 사용할 수 있어 선택지 ${requested}개로 만들 수 없습니다. 선택지 수를 ${availableSourceSentenceCount + 1}개 이하로 줄이거나 더 긴 지문을 선택해 주세요.`,
    };
  }
  return { ok: true, effective: requested, passageSentenceCount };
}

export interface QuestionTypeGenerationSettings {
  BLANK_INFERENCE?: BlankInferenceGenerationSettings;
  CONTENT_MATCH?: ContentMatchGenerationSettings;
  GRAMMAR_ERROR?: GrammarErrorGenerationSettings;
  GRAMMAR_CORRECTION?: GrammarCorrectionGenerationSettings;
  SUMMARY_COMPLETE?: SummaryCompleteGenerationSettings;
  SUMMARY_WRITING?: SummaryWritingGenerationSettings;
  SUMMARY_COMPLETE_MC?: SummaryCompleteMcGenerationSettings;
  IRRELEVANT?: IrrelevantGenerationSettings;
  VOCAB_CHOICE?: VocabChoiceGenerationSettings;
  SENTENCE_INSERT?: SentenceInsertGenerationSettings;
  SENTENCE_ORDER?: SentenceOrderGenerationSettings;
  ANTONYM?: AntonymGenerationSettings;
  [typeId: string]: unknown;
}

export interface ResolvedQuestionTypeGenerationSettings {
  effectiveTypeSettings: unknown;
  stemLanguage?: QuestionGenerationLanguage;
  optionLanguage?: QuestionGenerationLanguage;
  irrelevantSlotCount?: number;
  grammarMarkerCount?: number;
  grammarAnswerCount?: number;
  /** 어법 핵심 집중 모드 — 정답 포인트를 고빈출 톱셋으로 좁힘. */
  grammarPointFocus?: boolean;
  grammarCorrectionErrorCount?: number;
  summaryCompleteMcBlankCount?: number;
  summaryCompleteBlankCount?: number;
  /** SUMMARY_WRITING 빈칸 개수(1~3). U2 schema builder(options.summaryWritingBlankCount)가 사용. */
  summaryWritingBlankCount?: number;
  /** SUMMARY_WRITING 미끼 단어 수(0~4). usePartial일 때만 의미. */
  summaryWritingDistractorCount?: number;
  /** SUMMARY_WRITING 빈칸당 목표 단어수(3~17). 채점·표시 메타(빈칸선 길이 무관). */
  summaryWritingTargetWords?: number;
  /** SUMMARY_WRITING 결정론 합성 발문(directionAutoText). AI 자유문구 금지. */
  summaryWritingDirection?: string;
  contentMatchOptionCount?: number;
  contentMatchAnswerCount?: number;
  /** 내용 일치 강제 극성. undefined = AUTO(모델 결정, 기존 동작). */
  contentMatchType?: ContentMatchPolarity;
  vocabChoiceMarkerCount?: number;
  vocabChoiceAnswerCount?: number;
  /** True면 정답 외 밑줄 단어도 동의어로 변형 표시(지문 암기 무력화). */
  vocabChoiceSynonymVariants?: boolean;
  sentenceInsertSlotCount?: number;
  /** True면 주어진(삽입) 문장 앞부분을 같은 의미로 변형(지문 암기 무력화). */
  sentenceInsertParaphrasePrefix?: boolean;
  /** (A)(B)(C) 중 앞 문장을 변형할 문단 수(0=없음, 1~3). */
  sentenceOrderPrefixVariationCount?: number;
  antonymPairCount?: number;
  /** 1 = standard single blank (default pipeline); 2~3 = combination-option variant. */
  blankInferenceBlankCount?: number;
  /** True only for single-blank + teacher-enabled negative-paraphrase mode. */
  blankInferenceDoubleNegative?: boolean;
  /** True when the correct blank option must be a non-verbatim paraphrase. */
  blankInferenceParaphraseAnswer?: boolean;
  /** 빈칸 핵심 집중 모드 — 정답논리를 검증 고빈출 코어로 좁힘. */
  blankPointFocus?: boolean;
  /** 문장삽입 핵심 집중 모드 — 정답 응집장치를 검증 고빈출 코어로 좁힘. */
  sentenceInsertPointFocus?: boolean;
  /** 무관문장 핵심 집중 모드 — 무관성 유형을 검증 고빈출 코어로 좁힘. */
  irrelevantPointFocus?: boolean;
  /** 글의순서 핵심 집중 모드 — 순서 응집장치를 검증 고빈출 코어로 좁힘. */
  sentenceOrderPointFocus?: boolean;
  /** Resolved option count for free-text option types (TOPIC/TITLE/...). */
  genericOptionCount?: number;
  /** Resolved correct-answer count for free-text option types. */
  genericAnswerCount?: number;
  /**
   * 대의파악 계열(TOPIC/TITLE/MAIN_IDEA/TOPIC_MAIN_IDEA) 강제 정답 극성.
   * "NEGATIVE" = 적절하지 않은 것 고르기. undefined/"POSITIVE" = 기존 동작.
   */
  answerPolarity?: GistAnswerPolarity;
}

export function normalizeQuestionDifficulty(
  value: unknown,
  fallback: string | null | undefined = "INTERMEDIATE",
): QuestionDifficulty {
  const normalized = String(value ?? fallback ?? "INTERMEDIATE")
    .trim()
    .toUpperCase();
  return normalized === "BASIC" ||
    normalized === "INTERMEDIATE" ||
    normalized === "KILLER"
    ? normalized
    : "INTERMEDIATE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyRecordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function languageSettingsForType(
  typeId: string,
  rawSettings: unknown,
): Required<QuestionLanguageGenerationSettings> {
  return {
    stemLanguage: readStemLanguageSetting(rawSettings, typeId),
    // Stem-only types ignore stored option language; the option surface is structural.
    optionLanguage:
      getQuestionLanguageToggleScope(typeId) === "stem-option"
        ? readOptionLanguageSetting(rawSettings, typeId)
        : defaultLanguageSettingsForType(typeId).optionLanguage,
  };
}

function effectiveSettingsWithLanguage(
  typeId: string,
  rawSettings: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...copyRecordOrEmpty(rawSettings),
    ...extra,
    ...languageSettingsForType(typeId, rawSettings),
  };
}

// ── SUMMARY_WRITING(요약문 영작) 결정론 해석 + 발문 합성 ──

export type SummaryWritingGlossLooseness =
  SummaryWritingGenerationSettings["glossLooseness"];
export type SummaryWritingWordBankUsage =
  SummaryWritingGenerationSettings["wordBankUsage"];
export type SummaryWritingFidelity =
  SummaryWritingGenerationSettings["wordBankFidelity"];
export type SummaryWritingClueMode = SummaryWritingGenerationSettings["clueMode"];
export type SummaryWritingTargetWordsMode =
  SummaryWritingGenerationSettings["targetWordsMode"];

/** 호환성 매트릭스(바이블 §3)를 적용한 SUMMARY_WRITING 옵션의 최종 확정본. */
export interface ResolvedSummaryWritingSettings {
  difficulty: QuestionDifficulty;
  glossEnabled: boolean;
  glossLooseness: NonNullable<SummaryWritingGlossLooseness>;
  wordBankEnabled: boolean;
  wordBankUsage: NonNullable<SummaryWritingWordBankUsage>;
  boxDistractors: number;
  wordBankFidelity: NonNullable<SummaryWritingFidelity>;
  wordBankOrder: NonNullable<SummaryWritingGenerationSettings["wordBankOrder"]>;
  wordBankChunking: NonNullable<
    SummaryWritingGenerationSettings["wordBankChunking"]
  >;
  blankCount: number;
  blankAssignment: NonNullable<SummaryWritingGenerationSettings["blankAssignment"]>;
  targetWordsMode: NonNullable<SummaryWritingTargetWordsMode>;
  targetWordsPerBlank: number;
  clueMode: NonNullable<SummaryWritingClueMode>;
  connectorFrame: NonNullable<SummaryWritingGenerationSettings["connectorFrame"]>;
  summarySourceMode: NonNullable<
    SummaryWritingGenerationSettings["summarySourceMode"]
  >;
  sourceSentenceParaphrase: boolean;
  scoringGranularity: NonNullable<
    SummaryWritingGenerationSettings["scoringGranularity"]
  >;
}

/** 난이도별 기본 프리셋(바이블 §0/§4). 옵션 미설정 시 이 값으로 채운다. */
function summaryWritingDifficultyPreset(
  difficulty: QuestionDifficulty,
): ResolvedSummaryWritingSettings {
  if (difficulty === "BASIC") {
    return {
      difficulty,
      glossEnabled: true,
      glossLooseness: "literal",
      wordBankEnabled: true,
      wordBankUsage: "useAll",
      boxDistractors: 0,
      wordBankFidelity: "verbatim",
      wordBankOrder: "random",
      wordBankChunking: "chunk",
      blankCount: 1,
      blankAssignment: "separate",
      targetWordsMode: "approx",
      targetWordsPerBlank: 4,
      clueMode: "none",
      connectorFrame: "full",
      summarySourceMode: "paraphrase",
      sourceSentenceParaphrase: false,
      scoringGranularity: "keyword",
    };
  }
  if (difficulty === "KILLER") {
    return {
      difficulty,
      glossEnabled: false,
      glossLooseness: "natural",
      wordBankEnabled: true,
      wordBankUsage: "usePartial",
      boxDistractors: 2,
      wordBankFidelity: "inflected",
      wordBankOrder: "scrambleStrong",
      wordBankChunking: "word",
      blankCount: 2,
      blankAssignment: "shared",
      targetWordsMode: "hidden",
      targetWordsPerBlank: SUMMARY_WRITING_TARGET_WORDS_DEFAULT,
      clueMode: "none",
      connectorFrame: "partial",
      summarySourceMode: "inference",
      sourceSentenceParaphrase: true,
      scoringGranularity: "rubric",
    };
  }
  // INTERMEDIATE (기본)
  return {
    difficulty,
    glossEnabled: true,
    glossLooseness: "natural",
    wordBankEnabled: true,
    wordBankUsage: "usePartial",
    boxDistractors: 1,
    wordBankFidelity: "verbatim",
    wordBankOrder: "scrambleStrong",
    wordBankChunking: "word",
    blankCount: 2,
    blankAssignment: "separate",
    targetWordsMode: "approx",
    targetWordsPerBlank: SUMMARY_WRITING_TARGET_WORDS_DEFAULT,
    clueMode: "none",
    connectorFrame: "partial",
    summarySourceMode: "paraphrase",
    sourceSentenceParaphrase: false,
    scoringGranularity: "keyword",
  };
}

/**
 * SUMMARY_WRITING 세부옵션을 호환성 매트릭스(바이블 §3)대로 해석한다.
 * 강사 설정값 우선, 미설정은 난이도 프리셋, 그 위에 모순 제거(F=강제) 규칙을 적용.
 * 결정론적이라 같은 입력 → 같은 출력(발문 합성·프롬프트 양쪽에서 동일하게 쓰임).
 */
export function resolveSummaryWritingSettings(
  rawSettings: unknown,
  fallbackDifficulty: string | null | undefined = "INTERMEDIATE",
): ResolvedSummaryWritingSettings {
  const difficulty = readQuestionTypeDifficultySetting(
    getQuestionTypeSettingsForType(rawSettings, "SUMMARY_WRITING"),
    fallbackDifficulty,
  );
  const preset = summaryWritingDifficultyPreset(difficulty);

  const glossEnabled = readSummaryWritingBooleanSetting(
    rawSettings,
    "glossEnabled",
    preset.glossEnabled,
  );
  const wordBankEnabled = readSummaryWritingBooleanSetting(
    rawSettings,
    "wordBankEnabled",
    preset.wordBankEnabled,
  );
  const glossLooseness = readSummaryWritingEnumSetting(
    rawSettings,
    "glossLooseness",
    ["literal", "natural", "gist", "partial"] as const,
    preset.glossLooseness,
  );
  let wordBankUsage = readSummaryWritingEnumSetting(
    rawSettings,
    "wordBankUsage",
    ["useAll", "usePartial", "freeCount"] as const,
    preset.wordBankUsage,
  );
  const wordBankFidelity = readSummaryWritingEnumSetting(
    rawSettings,
    "wordBankFidelity",
    ["verbatim", "inflected", "mixed"] as const,
    preset.wordBankFidelity,
  );
  const wordBankOrder = readSummaryWritingEnumSetting(
    rawSettings,
    "wordBankOrder",
    ["random", "alphabetical", "scrambleStrong"] as const,
    preset.wordBankOrder,
  );
  const wordBankChunking = readSummaryWritingEnumSetting(
    rawSettings,
    "wordBankChunking",
    ["word", "chunk", "mixed"] as const,
    preset.wordBankChunking,
  );
  const blankCount = readNumericSetting(
    rawSettings,
    "SUMMARY_WRITING",
    SUMMARY_WRITING_BLANK_COUNT_SETTING,
  );
  const blankAssignment = readSummaryWritingEnumSetting(
    rawSettings,
    "blankAssignment",
    ["separate", "shared"] as const,
    preset.blankAssignment,
  );
  let targetWordsMode = readSummaryWritingEnumSetting(
    rawSettings,
    "targetWordsMode",
    ["exact", "approx", "hidden"] as const,
    preset.targetWordsMode,
  );
  const targetWordsPerBlank = readNumericSetting(
    rawSettings,
    "SUMMARY_WRITING",
    SUMMARY_WRITING_TARGET_WORDS_SETTING,
  );
  const clueMode = readSummaryWritingEnumSetting(
    rawSettings,
    "clueMode",
    [
      "none",
      "firstLetter",
      "firstLetterDashes",
      "skeleton",
      "wordCount",
      "koreanChunk",
    ] as const,
    preset.clueMode,
  );
  const connectorFrame = readSummaryWritingEnumSetting(
    rawSettings,
    "connectorFrame",
    ["full", "partial", "bare"] as const,
    preset.connectorFrame,
  );
  const summarySourceMode = readSummaryWritingEnumSetting(
    rawSettings,
    "summarySourceMode",
    ["paraphrase", "inference"] as const,
    preset.summarySourceMode,
  );
  const sourceSentenceParaphrase = readSummaryWritingBooleanSetting(
    rawSettings,
    "sourceSentenceParaphrase",
    preset.sourceSentenceParaphrase,
  );
  const scoringGranularity = readSummaryWritingEnumSetting(
    rawSettings,
    "scoringGranularity",
    ["exact", "keyword", "rubric"] as const,
    preset.scoringGranularity,
  );

  let boxDistractors = readNumericSetting(
    rawSettings,
    "SUMMARY_WRITING",
    SUMMARY_WRITING_DISTRACTOR_COUNT_SETTING,
  );

  // ── 호환성 매트릭스 강제(F) 규칙 적용 ──
  // #1: 보기 off → 보기 하위옵션 무의미(미끼 0·배분 separate 등은 어차피 미사용).
  if (!wordBankEnabled) {
    wordBankUsage = "useAll";
    boxDistractors = 0;
  }
  // #6: useAll/freeCount엔 미끼 개념 없음 → 0 강제.
  if (wordBankUsage !== "usePartial") {
    boxDistractors = 0;
  }
  // #5: useAll → exact 표시 금지(칩 개수=정답 단어수 + 정확수 = 이중 누설) → approx 로 강등.
  if (wordBankEnabled && wordBankUsage === "useAll" && targetWordsMode === "exact") {
    targetWordsMode = "approx";
  }

  return {
    difficulty,
    glossEnabled,
    glossLooseness,
    wordBankEnabled,
    wordBankUsage,
    boxDistractors,
    wordBankFidelity,
    wordBankOrder,
    wordBankChunking,
    blankCount,
    blankAssignment,
    targetWordsMode,
    targetWordsPerBlank,
    clueMode,
    connectorFrame,
    summarySourceMode,
    sourceSentenceParaphrase,
    scoringGranularity,
  };
}

/** 빈칸 라벨 목록 "(A)" "(B)" ... blankCount개. */
function summaryWritingBlankLabels(blankCount: number): string[] {
  const n = normalizeSummaryWritingBlankCount(blankCount);
  return Array.from({ length: n }, (_, i) => `(${String.fromCharCode(65 + i)})`);
}

function summaryWritingDifficultyPoints(difficulty: QuestionDifficulty): string {
  if (difficulty === "BASIC") return "[2점]";
  if (difficulty === "KILLER") return "[4점]";
  return "[3점]";
}

/**
 * 결정론 발문 합성(directionAutoText, 바이블 §5). 옵션 조합 → 한국어 발문 문자열.
 * AI 자유문구를 막기 위해 항상 같은 입력 → 같은 출력. U2 프롬프트가 이 결과를 참조.
 * 모순 가드(SW-LEAK-DIR): 미끼/어형변형이 있으면 "변형 없이 한 번씩 모두 사용" 문구를
 * 절대 붙이지 않는다(매트릭스 #4).
 */
export function buildSummaryWritingDirection(
  settings: ResolvedSummaryWritingSettings,
): string {
  const labels = summaryWritingBlankLabels(settings.blankCount).join(", ");
  const clauses: string[] = [];

  // 머리: 해석 참고 안내(해석 제공 시).
  if (settings.glossEnabled) {
    clauses.push("[해석]을 참고하여");
  }

  // 보기 활용 안내.
  if (settings.wordBankEnabled) {
    const verbatimAll =
      settings.wordBankUsage === "useAll" &&
      settings.wordBankFidelity === "verbatim" &&
      settings.boxDistractors === 0;
    if (verbatimAll) {
      // 모순 없음 — 모두 그대로 한 번씩.
      clauses.push("[보기]의 단어를 변형 없이 한 번씩 모두 사용하여");
    } else if (settings.wordBankUsage === "usePartial") {
      if (settings.boxDistractors > 0) {
        clauses.push("[보기]에서 필요한 단어만 골라(쓰지 않는 단어가 포함됨)");
      } else {
        clauses.push("[보기]에서 필요한 단어만 골라");
      }
      if (settings.wordBankFidelity !== "verbatim") {
        clauses.push("(필요시 어형을 바꿔)");
      }
    } else {
      // useAll/freeCount인데 어형변형이 섞인 경우 — "모두 그대로" 문구 금지.
      clauses.push("[보기]의 단어를 활용하여");
      if (settings.wordBankFidelity !== "verbatim") {
        clauses.push("(필요시 어형을 바꿔)");
      }
    }
  }

  // 목표 단어수 안내. 단/복수 분기(빈칸 1개면 "빈칸을", 여러 개면 "각 빈칸을").
  // 앞글자 단서(firstLetter)는 단어 수를 이미 노출하므로 단어수 문구를 붙이지 않는다(모순 방지).
  const blankWord = settings.blankCount >= 2 ? "각 빈칸을" : "빈칸을";
  const perWordClue = settings.clueMode === "firstLetter" || settings.clueMode === "firstLetterDashes";
  if (!perWordClue) {
    if (settings.targetWordsMode === "exact") {
      clauses.push(`${blankWord} ${settings.targetWordsPerBlank}단어로`);
    } else if (settings.targetWordsMode === "approx") {
      clauses.push(`${blankWord} 약 ${settings.targetWordsPerBlank}단어로`);
    }
  }

  const prefix = clauses.length ? `${clauses.join(" ")} ` : "";
  const points = summaryWritingDifficultyPoints(settings.difficulty);
  return `다음 글의 요약문 빈칸 ${labels}에 들어갈 말을 ${prefix}영작하시오. ${points}`;
}

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
    return {
      effectiveTypeSettings: effectiveSettingsWithLanguage(typeId, rawSettings, {
        blankCount: blankInferenceBlankCount,
        paraphraseAnswer: blankInferenceParaphraseAnswer,
        pointFocus: blankPointFocus,
      }),
      ...languageSettings,
      blankInferenceBlankCount,
      // 부정-부정 모드는 단일 빈칸 전용. "typeSettings 프롬프트가 있으면 DN" 식의
      // 프록시 판정은 언어/다중빈칸 블록 추가로 더 이상 성립하지 않으므로 여기서 확정한다.
      blankInferenceDoubleNegative,
      blankInferenceParaphraseAnswer:
        blankInferenceParaphraseAnswer && !blankInferenceDoubleNegative,
      blankPointFocus,
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
      ...defaultLanguageSettingsForType("GRAMMAR_ERROR"),
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

const MULTI_BLANK_LABELS = ["(A)", "(B)", "(C)"] as const;

function languageName(language: QuestionGenerationLanguage): string {
  return language === "en" ? "English" : "Korean";
}

function combinePromptSections(...sections: Array<string | undefined>): string {
  return sections.map((section) => section?.trim()).filter(Boolean).join("\n\n");
}

function buildQuestionLanguageSettingsPrompt(
  typeId: string,
  rawSettings: unknown,
): string {
  if (!isRecord(rawSettings)) return "";
  const scope = getQuestionLanguageToggleScope(typeId);
  const defaults = defaultLanguageSettingsForType(typeId);
  const stemLanguage = readStemLanguageSetting(rawSettings, typeId);
  // Stem-only types keep their structural option language no matter what was stored.
  const optionLanguage =
    scope === "stem-option"
      ? readOptionLanguageSetting(rawSettings, typeId)
      : defaults.optionLanguage;

  if (
    stemLanguage === defaults.stemLanguage &&
    optionLanguage === defaults.optionLanguage
  ) {
    return "";
  }

  const lines = [
    `## Type detail setting: ${typeId} / visible language`,
    "- This language setting overrides any default language instruction in the base type prompt.",
    `- The teacher requested the visible direction/stem in ${languageName(stemLanguage)}.`,
  ];
  if (scope === "stem-option") {
    lines.push(
      `- The teacher requested visible multiple-choice option text in ${languageName(optionLanguage)}.`,
    );
  }

  if (stemLanguage === "en") {
    lines.push("- direction/questionText should be natural exam English. Do not write the stem in Korean unless a fixed Korean exam label is unavoidable.");
  } else {
    lines.push("- direction/questionText should be natural Korean exam wording.");
  }

  if (scope === "stem-option") {
    if (optionLanguage === "en") {
      lines.push("- options[].text must be English-only statements or phrases. Do not include Korean translation, Korean particles, or Korean explanatory wording in option text.");
    } else {
      lines.push("- options[].text must be Korean student-facing statements or phrases. English passage terms may appear only when they are natural evidence labels or quoted source terms.");
    }
  } else {
    lines.push("- This setting changes only the visible direction/stem language. Keep options, answers, and every other field in the standard format for this type.");
  }

  return lines.join("\n");
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
  if (blankInferenceBlankCount >= 2) {
    // Multi-blank combination variant. The double-negative mode is a
    // single-blank-only feature and is intentionally ignored here.
    const labels = MULTI_BLANK_LABELS.slice(0, blankInferenceBlankCount);
    const labelsText = labels.join(", ");
    // 다중빈칸은 candidate block 이 suppress 되므로 focus(출제포인트 집중)를 이 프롬프트
    // 경로에 주입한다 — 빈칸별로 서로 다른 코어 논리축에 분산(A 분산형).
    const blankPointFocus = readBooleanSetting(rawSettings, "BLANK_INFERENCE", "pointFocus");
    return combinePromptSections(languagePrompt, [
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
    ].join("\n"));
  }

  if (useParaphraseAnswer) {
    return combinePromptSections(languagePrompt, [
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
    ].join("\n"));
  }

  if (rawSettings.doubleNegative !== true) return languagePrompt;

  return combinePromptSections(languagePrompt, [
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
    ].join("\n"));
  }

export function getQuestionTypeSettingsForType(
  settings: unknown,
  typeId: string,
): unknown {
  if (!isRecord(settings)) return undefined;
  if (Object.prototype.hasOwnProperty.call(settings, typeId)) {
    return settings[typeId];
  }
  return settings;
}

export function readQuestionTypeDifficultySetting(
  rawSettings: unknown,
  fallback: string | null | undefined = "INTERMEDIATE",
): QuestionDifficulty {
  if (isRecord(rawSettings) && rawSettings.difficulty !== undefined) {
    return normalizeQuestionDifficulty(rawSettings.difficulty, fallback);
  }
  return normalizeQuestionDifficulty(fallback);
}

export function readQuestionTypeGenerationPlanSetting(
  rawSettings: unknown,
  fallback: QuestionGenerationPlan = "STANDARD",
): QuestionGenerationPlan {
  if (isRecord(rawSettings) && rawSettings.generationPlan !== undefined) {
    return normalizeQuestionGenerationPlan(rawSettings.generationPlan);
  }
  return normalizeQuestionGenerationPlan(fallback);
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
