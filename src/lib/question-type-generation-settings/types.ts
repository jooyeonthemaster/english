// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { type QuestionDifficulty } from "@/lib/difficulty";
import { type QuestionGenerationPlan } from "@/lib/question-generation-plans";

export type QuestionGenerationLanguage = "ko" | "en";

/**
 * 빈칸 추론 빈칸 단위. "auto" = 모델이 지문 논리에 맞춰 자유 선택(기존 동작, 무회귀 기본값).
 * "word" = 단일 핵심 단어, "phrase" = 2~4단어 구, "clause" = 주어+동사 절(5~10단어).
 */
export type BlankInferenceGranularity = "auto" | "word" | "phrase" | "clause";

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
  /**
   * 빈칸 단위 — 빈칸으로 잡는 표현의 크기를 단어/구/절로 강제한다.
   * "auto"(기본)면 모델이 자유 선택(기존 동작, 무회귀). word/phrase/clause 는
   * originalExpression 의 길이를 해당 단위로 유도하고 선지도 그 단위에 맞춘다.
   */
  blankGranularity?: BlankInferenceGranularity;
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

export interface GrammarChoiceComboGenerationSettings
  extends QuestionLanguageGenerationSettings,
    QuestionTypeQualityGenerationSettings {
  /**
   * 핵심 집중 모드 — true 면 세 네모의 정답(올바른 표현) 어법 포인트를 기출 최빈출
   * 톱셋(관계사·수일치·분사·to/-ing 등)에 집중시킨다. false/미지정이면 기존 동작
   * (코어 a~m 순회). 기본 true(어법 판단과 동일).
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

export type QuestionLanguageToggleScope = "stem" | "stem-option";

type NumericSettingMax =
  | number
  | ((resolved: Record<string, number>) => number);

export interface NumericSettingSpec {
  key: string;
  aliases?: string[];
  min: number;
  max: NumericSettingMax;
  defaultValue: number;
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

export interface QuestionTypeGenerationSettings {
  BLANK_INFERENCE?: BlankInferenceGenerationSettings;
  CONTENT_MATCH?: ContentMatchGenerationSettings;
  GRAMMAR_ERROR?: GrammarErrorGenerationSettings;
  GRAMMAR_CHOICE_COMBO?: GrammarChoiceComboGenerationSettings;
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
  /** 빈칸 단위(단어/구/절). "auto" = 기존 자유 선택. */
  blankInferenceGranularity?: BlankInferenceGranularity;
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
