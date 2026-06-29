// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { normalizeNumericSetting, readBooleanSetting, readNumericSetting } from "./shared";
import { type NumericSettingSpec } from "./types";

export const VOCAB_CHOICE_MARKER_COUNT_MIN = 5;

export const VOCAB_CHOICE_MARKER_COUNT_MAX = 10;

export const VOCAB_CHOICE_MARKER_COUNT_DEFAULT = 5;

export const VOCAB_CHOICE_ANSWER_COUNT_MIN = 1;

export const VOCAB_CHOICE_ANSWER_COUNT_MAX = VOCAB_CHOICE_MARKER_COUNT_MAX;

export const VOCAB_CHOICE_ANSWER_COUNT_DEFAULT = 1;

export const VOCAB_CHOICE_LABELS = ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)", "(i)", "(j)"] as const;

export function readVocabChoiceSynonymVariantsSetting(
  rawSettings: unknown,
): boolean {
  return readBooleanSetting(rawSettings, "VOCAB_CHOICE", "synonymVariants");
}

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
