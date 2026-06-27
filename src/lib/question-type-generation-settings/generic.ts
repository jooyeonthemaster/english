// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { normalizeNumericSetting, readNumericSetting } from "./shared";
import { type NumericSettingSpec } from "./types";

export const GENERIC_OPTION_COUNT_MIN = 4;

export const GENERIC_OPTION_COUNT_MAX = 8;

export const GENERIC_OPTION_COUNT_DEFAULT = 5;

export const GENERIC_ANSWER_COUNT_MIN = 1;

export const GENERIC_ANSWER_COUNT_DEFAULT = 1;

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

export function normalizeGenericOptionCount(value: unknown): number {
  return normalizeNumericSetting(value, GENERIC_OPTION_COUNT_SETTING);
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
