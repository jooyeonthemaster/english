// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { normalizeNumericSetting, readNumericSetting } from "./shared";
import { type IrrelevantSlotValidation, type NumericSettingSpec } from "./types";

export const IRRELEVANT_SLOT_COUNT_MIN = 5;

export const IRRELEVANT_SLOT_COUNT_MAX = 10;

export const IRRELEVANT_SLOT_COUNT_DEFAULT = 5;

const IRRELEVANT_SLOT_COUNT_SETTING: NumericSettingSpec = {
  key: "slotCount",
  min: IRRELEVANT_SLOT_COUNT_MIN,
  max: IRRELEVANT_SLOT_COUNT_MAX,
  defaultValue: IRRELEVANT_SLOT_COUNT_DEFAULT,
};

export function getIrrelevantLabel(index: number): string {
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
