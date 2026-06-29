// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { normalizeNumericSetting, readNumericSetting } from "./shared";
import { type NumericSettingSpec } from "./types";

export const ANTONYM_PAIR_COUNT_MIN = 5;

export const ANTONYM_PAIR_COUNT_MAX = 10;

export const ANTONYM_PAIR_COUNT_DEFAULT = 5;

const ANTONYM_PAIR_COUNT_SETTING: NumericSettingSpec = {
  key: "pairCount",
  aliases: ["optionCount", "markerCount"],
  min: ANTONYM_PAIR_COUNT_MIN,
  max: ANTONYM_PAIR_COUNT_MAX,
  defaultValue: ANTONYM_PAIR_COUNT_DEFAULT,
};

export function normalizeAntonymPairCount(value: unknown): number {
  return normalizeNumericSetting(value, ANTONYM_PAIR_COUNT_SETTING);
}

export function readAntonymPairCountSetting(rawSettings: unknown): number {
  return readNumericSetting(rawSettings, "ANTONYM", ANTONYM_PAIR_COUNT_SETTING);
}
