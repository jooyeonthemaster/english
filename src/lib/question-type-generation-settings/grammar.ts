// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { normalizeNumericSetting, readNumericSetting } from "./shared";
import { type NumericSettingSpec } from "./types";

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

export const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"] as const;

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
