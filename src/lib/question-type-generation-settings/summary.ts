// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { normalizeNumericSetting, readNumericSetting } from "./shared";
import { type NumericSettingSpec } from "./types";

export const SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN = 2;

export const SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX = 4;

export const SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT = 2;

export const SUMMARY_COMPLETE_BLANK_COUNT_MIN = 1;

export const SUMMARY_COMPLETE_BLANK_COUNT_MAX = 5;

export const SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT = 2;

export const SUMMARY_WRITING_BLANK_COUNT_MIN = 1;

export const SUMMARY_WRITING_BLANK_COUNT_MAX = 3;

export const SUMMARY_WRITING_BLANK_COUNT_DEFAULT = 1;

export const SUMMARY_WRITING_DISTRACTOR_COUNT_MIN = 0;

export const SUMMARY_WRITING_DISTRACTOR_COUNT_MAX = 4;

export const SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT = 0;

export const SUMMARY_WRITING_TARGET_WORDS_MIN = 3;

export const SUMMARY_WRITING_TARGET_WORDS_MAX = 17;

export const SUMMARY_WRITING_TARGET_WORDS_DEFAULT = 7;

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

export const SUMMARY_WRITING_BLANK_COUNT_SETTING: NumericSettingSpec = {
  key: "blankCount",
  aliases: ["summaryBlankCount"],
  min: SUMMARY_WRITING_BLANK_COUNT_MIN,
  max: SUMMARY_WRITING_BLANK_COUNT_MAX,
  defaultValue: SUMMARY_WRITING_BLANK_COUNT_DEFAULT,
};

export const SUMMARY_WRITING_DISTRACTOR_COUNT_SETTING: NumericSettingSpec = {
  key: "boxDistractors",
  min: SUMMARY_WRITING_DISTRACTOR_COUNT_MIN,
  max: SUMMARY_WRITING_DISTRACTOR_COUNT_MAX,
  defaultValue: SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT,
};

export const SUMMARY_WRITING_TARGET_WORDS_SETTING: NumericSettingSpec = {
  key: "targetWordsPerBlank",
  min: SUMMARY_WRITING_TARGET_WORDS_MIN,
  max: SUMMARY_WRITING_TARGET_WORDS_MAX,
  defaultValue: SUMMARY_WRITING_TARGET_WORDS_DEFAULT,
};

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
