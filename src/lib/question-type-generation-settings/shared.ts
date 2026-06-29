// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { type QuestionDifficulty } from "@/lib/difficulty";
import { normalizeQuestionGenerationPlan, type QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { type BlankInferenceGranularity, type GistAnswerPolarity, type NumericSettingSpec } from "./types";

export const BLANK_INFERENCE_GRANULARITY_DEFAULT: BlankInferenceGranularity = "auto";

export const CONTENT_MATCH_OPTION_COUNT_MIN = 5;

export const CONTENT_MATCH_OPTION_COUNT_MAX = 12;

export const CONTENT_MATCH_OPTION_COUNT_DEFAULT = 5;

export const CONTENT_MATCH_ANSWER_COUNT_MIN = 1;

export const CONTENT_MATCH_ANSWER_COUNT_DEFAULT = 1;

export const SENTENCE_INSERT_SLOT_COUNT_MIN = 5;

export const SENTENCE_INSERT_SLOT_COUNT_MAX = 8;

export const SENTENCE_INSERT_SLOT_COUNT_DEFAULT = 5;

export const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN = 0;

export const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX = 3;

export const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT = 0;

export const BLANK_INFERENCE_BLANK_COUNT_MIN = 1;

export const BLANK_INFERENCE_BLANK_COUNT_MAX = 3;

export const BLANK_INFERENCE_BLANK_COUNT_DEFAULT = 1;

/**
 * 대의파악 계열 — "적절한 것 ↔ 적절하지 않은 것" 정답 극성 토글 지원 유형.
 * (IMPLIED_MEANING/CONTEXT_MEANING/SYNONYM은 generic 옵션수는 쓰지만 극성 토글
 *  대상 아님 — 이번 작업 범위에서 제외.)
 */
const GIST_POLARITY_TYPE_IDS = new Set<string>([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
]);

export function supportsGistAnswerPolarity(typeId: string): boolean {
  return GIST_POLARITY_TYPE_IDS.has(typeId);
}

function numericSettingKeys(spec: NumericSettingSpec): string[] {
  return [spec.key, ...(spec.aliases ?? [])];
}

function numericSettingMax(
  spec: NumericSettingSpec,
  resolved: Record<string, number>,
) {
  return typeof spec.max === "function" ? spec.max(resolved) : spec.max;
}

export function normalizeNumericSetting(
  value: unknown,
  spec: NumericSettingSpec,
  resolved: Record<string, number> = {},
): number {
  const n = typeof value === "number" ? value : Number(value);
  const max = numericSettingMax(spec, resolved);
  if (!Number.isFinite(n)) return Math.min(spec.defaultValue, max);
  const rounded = Math.round(n);
  return Math.min(max, Math.max(spec.min, rounded));
}

function readNumericSettingValue(
  source: unknown,
  spec: NumericSettingSpec,
): unknown {
  if (!isRecord(source)) return undefined;
  for (const key of numericSettingKeys(spec)) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

export function readNumericSetting(
  rawSettings: unknown,
  typeId: string,
  spec: NumericSettingSpec,
  resolved: Record<string, number> = {},
): number {
  const directValue = readNumericSettingValue(rawSettings, spec);
  if (directValue !== undefined) {
    return normalizeNumericSetting(directValue, spec, resolved);
  }

  const nested = isRecord(rawSettings) ? rawSettings[typeId] : undefined;
  const nestedValue = readNumericSettingValue(nested, spec);
  return normalizeNumericSetting(nestedValue, spec, resolved);
}

export function readBooleanSetting(
  rawSettings: unknown,
  typeId: string,
  key: string,
): boolean {
  if (isRecord(rawSettings) && rawSettings[key] !== undefined) {
    return rawSettings[key] === true;
  }

  const nested = isRecord(rawSettings) ? rawSettings[typeId] : undefined;
  return isRecord(nested) && nested[key] === true;
}

/**
 * 대의파악 계열 정답 극성 설정 읽기. flat 우선 → nested(typeId) 폴백.
 * "NEGATIVE"일 때만 반환, 그 외(POSITIVE/미설정/타유형) = undefined(기존 동작).
 */
export function readGistAnswerPolaritySetting(
  rawSettings: unknown,
  typeId: string,
): GistAnswerPolarity | undefined {
  if (!supportsGistAnswerPolarity(typeId)) return undefined;
  if (!isRecord(rawSettings)) return undefined;
  const direct = rawSettings.answerPolarity;
  const nestedRecord = isRecord(rawSettings[typeId])
    ? (rawSettings[typeId] as Record<string, unknown>)
    : undefined;
  const value = direct !== undefined ? direct : nestedRecord?.answerPolarity;
  return value === "NEGATIVE" ? "NEGATIVE" : undefined;
}

export const CONTENT_MATCH_OPTION_COUNT_SETTING: NumericSettingSpec = {
  key: "optionCount",
  min: CONTENT_MATCH_OPTION_COUNT_MIN,
  max: CONTENT_MATCH_OPTION_COUNT_MAX,
  defaultValue: CONTENT_MATCH_OPTION_COUNT_DEFAULT,
};

export const CONTENT_MATCH_ANSWER_COUNT_SETTING: NumericSettingSpec = {
  key: "answerCount",
  aliases: ["correctAnswerCount"],
  min: CONTENT_MATCH_ANSWER_COUNT_MIN,
  max: (resolved) => resolved.optionCount ?? CONTENT_MATCH_OPTION_COUNT_DEFAULT,
  defaultValue: CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
};

export const SENTENCE_INSERT_SLOT_COUNT_SETTING: NumericSettingSpec = {
  key: "slotCount",
  aliases: ["optionCount"],
  min: SENTENCE_INSERT_SLOT_COUNT_MIN,
  max: SENTENCE_INSERT_SLOT_COUNT_MAX,
  defaultValue: SENTENCE_INSERT_SLOT_COUNT_DEFAULT,
};

export const SENTENCE_ORDER_PREFIX_VARIATION_COUNT_SETTING: NumericSettingSpec = {
  key: "prefixVariationCount",
  min: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MIN,
  max: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_MAX,
  defaultValue: SENTENCE_ORDER_PREFIX_VARIATION_COUNT_DEFAULT,
};

export const BLANK_INFERENCE_BLANK_COUNT_SETTING: NumericSettingSpec = {
  key: "blankCount",
  min: BLANK_INFERENCE_BLANK_COUNT_MIN,
  max: BLANK_INFERENCE_BLANK_COUNT_MAX,
  defaultValue: BLANK_INFERENCE_BLANK_COUNT_DEFAULT,
};

export function normalizeQuestionDifficulty(
  value: unknown,
  fallback: string | null | undefined = "INTERMEDIATE",
): QuestionDifficulty {
  const normalized = String(value ?? fallback ?? "INTERMEDIATE")
    .trim()
    .toUpperCase();
  return normalized === "BASIC" ||
    normalized === "INTERMEDIATE" ||
    normalized === "KILLER"
    ? normalized
    : "INTERMEDIATE";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function copyRecordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

export const MULTI_BLANK_LABELS = ["(A)", "(B)", "(C)"] as const;

export function combinePromptSections(...sections: Array<string | undefined>): string {
  return sections.map((section) => section?.trim()).filter(Boolean).join("\n\n");
}

export function getQuestionTypeSettingsForType(
  settings: unknown,
  typeId: string,
): unknown {
  if (!isRecord(settings)) return undefined;
  if (Object.prototype.hasOwnProperty.call(settings, typeId)) {
    return settings[typeId];
  }
  return settings;
}

export function readQuestionTypeDifficultySetting(
  rawSettings: unknown,
  fallback: string | null | undefined = "INTERMEDIATE",
): QuestionDifficulty {
  if (isRecord(rawSettings) && rawSettings.difficulty !== undefined) {
    return normalizeQuestionDifficulty(rawSettings.difficulty, fallback);
  }
  return normalizeQuestionDifficulty(fallback);
}

export function readQuestionTypeGenerationPlanSetting(
  rawSettings: unknown,
  fallback: QuestionGenerationPlan = "STANDARD",
): QuestionGenerationPlan {
  if (isRecord(rawSettings) && rawSettings.generationPlan !== undefined) {
    return normalizeQuestionGenerationPlan(rawSettings.generationPlan);
  }
  return normalizeQuestionGenerationPlan(fallback);
}
