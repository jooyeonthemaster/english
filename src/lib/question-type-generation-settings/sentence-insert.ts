// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { SENTENCE_INSERT_SLOT_COUNT_SETTING, normalizeNumericSetting, readBooleanSetting, readNumericSetting } from "./shared";

export function readSentenceInsertParaphrasePrefixSetting(
  rawSettings: unknown,
): boolean {
  return readBooleanSetting(rawSettings, "SENTENCE_INSERT", "paraphrasePrefix");
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
