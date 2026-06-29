// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { type QuestionDifficulty } from "@/lib/difficulty";
import { getQuestionTypeSettingsForType, isRecord, normalizeNumericSetting, readNumericSetting, readQuestionTypeDifficultySetting } from "./shared";
import { SUMMARY_WRITING_BLANK_COUNT_SETTING, SUMMARY_WRITING_DISTRACTOR_COUNT_SETTING, SUMMARY_WRITING_TARGET_WORDS_DEFAULT, SUMMARY_WRITING_TARGET_WORDS_SETTING } from "./summary";
import { type ResolvedSummaryWritingSettings } from "./types";

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
export function summaryWritingBlankLabels(blankCount: number): string[] {
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
