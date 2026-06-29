// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { SENTENCE_ORDER_PREFIX_VARIATION_COUNT_SETTING, normalizeNumericSetting, readNumericSetting } from "./shared";

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
