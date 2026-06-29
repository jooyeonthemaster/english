// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { CONTENT_MATCH_ANSWER_COUNT_SETTING, CONTENT_MATCH_OPTION_COUNT_DEFAULT, CONTENT_MATCH_OPTION_COUNT_SETTING, isRecord, normalizeNumericSetting, readNumericSetting } from "./shared";
import { type ContentMatchPolarity } from "./types";

/**
 * 내용 일치 정답 극성 설정 읽기. flat(rawSettings.matchType) 우선, nested
 * (rawSettings.CONTENT_MATCH.matchType) 폴백 — 다른 read 헬퍼와 동일 규약.
 * 강사 선택은 "일치"/"불일치" 둘 중 하나이며, 미지정 시 기본값은 "불일치"
 * (수능 표준형이자 기존 모델의 사실상 기본 동작). "자동" 개념은 없음.
 */
export function readContentMatchTypeSetting(
  rawSettings: unknown,
): ContentMatchPolarity {
  if (!isRecord(rawSettings)) return "불일치";
  const direct = rawSettings.matchType;
  const nested = isRecord(rawSettings.CONTENT_MATCH)
    ? rawSettings.CONTENT_MATCH.matchType
    : undefined;
  const value = direct !== undefined ? direct : nested;
  return value === "일치" ? "일치" : "불일치";
}

export function normalizeContentMatchOptionCount(value: unknown): number {
  return normalizeNumericSetting(value, CONTENT_MATCH_OPTION_COUNT_SETTING);
}

export function normalizeContentMatchAnswerCount(
  value: unknown,
  optionCount: number = CONTENT_MATCH_OPTION_COUNT_DEFAULT,
): number {
  const optionMax = normalizeContentMatchOptionCount(optionCount);
  return normalizeNumericSetting(
    value,
    CONTENT_MATCH_ANSWER_COUNT_SETTING,
    { optionCount: optionMax },
  );
}

export function readContentMatchOptionCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "CONTENT_MATCH",
    CONTENT_MATCH_OPTION_COUNT_SETTING,
  );
}

export function readContentMatchAnswerCountSetting(
  rawSettings: unknown,
  optionCount: number = readContentMatchOptionCountSetting(rawSettings),
): number {
  return readNumericSetting(
    rawSettings,
    "CONTENT_MATCH",
    CONTENT_MATCH_ANSWER_COUNT_SETTING,
    { optionCount: normalizeContentMatchOptionCount(optionCount) },
  );
}
