// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { BLANK_INFERENCE_BLANK_COUNT_SETTING, isRecord, normalizeNumericSetting, readBooleanSetting, readNumericSetting } from "./shared";
import { type BlankInferenceGranularity } from "./types";

export function readBlankInferenceParaphraseAnswerSetting(
  rawSettings: unknown,
): boolean {
  return readBooleanSetting(rawSettings, "BLANK_INFERENCE", "paraphraseAnswer");
}

/**
 * 빈칸 단위(단어/구/절) 설정 읽기. flat(rawSettings.blankGranularity) 우선 →
 * nested(rawSettings.BLANK_INFERENCE.blankGranularity) 폴백. 미설정/비정상값은
 * "auto"(기존 자유 선택 동작) — 무회귀 기본값.
 */
export function readBlankInferenceGranularitySetting(
  rawSettings: unknown,
): BlankInferenceGranularity {
  const direct = isRecord(rawSettings) ? rawSettings.blankGranularity : undefined;
  const nested =
    isRecord(rawSettings) && isRecord(rawSettings.BLANK_INFERENCE)
      ? rawSettings.BLANK_INFERENCE.blankGranularity
      : undefined;
  const value = direct !== undefined ? direct : nested;
  return value === "word" || value === "phrase" || value === "clause"
    ? value
    : "auto";
}

/**
 * 빈칸 단위(단어/구/절) 프롬프트 블록. "auto"면 빈 문자열(기존 경로, 무회귀).
 * originalExpression(빈칸으로 잡는 표현)의 "크기"와 선지 단위만 강제하고
 * 추론 논리·정답 규칙은 바꾸지 않는다.
 */
export function buildBlankGranularityPromptBlock(
  granularity: BlankInferenceGranularity,
): string {
  if (granularity === "auto") return "";
  const header = "## Type detail setting: BLANK_INFERENCE / blank unit (teacher-selected)";
  const common =
    "- This setting controls ONLY the SIZE of the blanked span (originalExpression) and the option unit. It OVERRIDES any earlier length guidance about how long the blank should be. Keep every other blank rule (verbatim originalExpression, single-occurrence in the passage, passage-grounded near-miss distractors, identical grammatical slot for all options).";
  if (granularity === "word") {
    return [
      header,
      "- 빈칸 단위 = 단어(WORD). Blank exactly ONE key content word (a noun, verb, adjective, or adverb) — never a multi-word phrase, never a function word.",
      "- originalExpression must be a single word copied verbatim from the passage.",
      "- All five options must be single words of the SAME part of speech as the answer, similar in length/register; distractors are passage-plausible but logically wrong content words.",
      common,
    ].join("\n");
  }
  if (granularity === "phrase") {
    return [
      header,
      "- 빈칸 단위 = 구(PHRASE). Blank a short phrase of 2~4 words (noun phrase, verb phrase, or prepositional phrase) with NO finite subject+verb — not a single word, not a full clause.",
      "- originalExpression must be a 2~4 word phrase copied verbatim from the passage.",
      "- All five options must be 2~4 word phrases in the same grammatical slot and register.",
      common,
    ].join("\n");
  }
  // clause
  return [
    header,
    "- 빈칸 단위 = 절(CLAUSE). Blank a clause that contains its own subject and verb (about 5~10 words) and states a full proposition — not a single word, not a bare 2~4 word phrase.",
    "- originalExpression must be a clause copied verbatim from the passage (subject + finite or relative verb).",
    "- All five options must be clause-shaped (subject + verb), similar in length/register, fitting the same slot.",
    common,
  ].join("\n");
}

export function normalizeBlankInferenceBlankCount(value: unknown): number {
  return normalizeNumericSetting(value, BLANK_INFERENCE_BLANK_COUNT_SETTING);
}

export function readBlankInferenceBlankCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "BLANK_INFERENCE",
    BLANK_INFERENCE_BLANK_COUNT_SETTING,
  );
}
