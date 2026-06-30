// 이 폴더는 question-type-generation-settings.ts(2859줄)를 도메인 모듈로 분리한 것이다.
// 각 선언은 원본에서 verbatim 이동됐고, 외부 진입점은 index.ts 배럴(경로 @/lib/question-type-generation-settings)이다.

import { copyRecordOrEmpty, isRecord } from "./shared";
import { type QuestionGenerationLanguage, type QuestionLanguageGenerationSettings, type QuestionLanguageToggleScope } from "./types";

const DEFAULT_QUESTION_LANGUAGE_SETTINGS: Record<
  string,
  Required<QuestionLanguageGenerationSettings>
> = {
  BLANK_INFERENCE: { stemLanguage: "ko", optionLanguage: "en" },
  GRAMMAR_ERROR: { stemLanguage: "ko", optionLanguage: "ko" },
  // 네모 어법 보기는 영어 후보 조합(구조적) — 보기 언어 토글 대상 아님.
  GRAMMAR_CHOICE_COMBO: { stemLanguage: "ko", optionLanguage: "ko" },
  VOCAB_CHOICE: { stemLanguage: "ko", optionLanguage: "en" },
  SENTENCE_ORDER: { stemLanguage: "ko", optionLanguage: "en" },
  SENTENCE_INSERT: { stemLanguage: "ko", optionLanguage: "ko" },
  TOPIC: { stemLanguage: "ko", optionLanguage: "en" },
  MAIN_IDEA: { stemLanguage: "ko", optionLanguage: "ko" },
  TOPIC_MAIN_IDEA: { stemLanguage: "ko", optionLanguage: "ko" },
  TITLE: { stemLanguage: "ko", optionLanguage: "en" },
  IMPLIED_MEANING: { stemLanguage: "ko", optionLanguage: "en" },
  REFERENCE: { stemLanguage: "ko", optionLanguage: "ko" },
  // 내용일치 보기 기본 = 영문 (2026-06-10 강사 피드백: 학생들이 영문 보기 선호.
  // 한국어 보기는 유형 상세 설정의 언어 토글로 선택).
  CONTENT_MATCH: { stemLanguage: "ko", optionLanguage: "en" },
  SUMMARY_COMPLETE_MC: { stemLanguage: "ko", optionLanguage: "en" },
  IRRELEVANT: { stemLanguage: "ko", optionLanguage: "ko" },
  GRAMMAR_CORRECTION: { stemLanguage: "ko", optionLanguage: "ko" },
  SUMMARY_COMPLETE: { stemLanguage: "ko", optionLanguage: "en" },
  // 요약문 영작 — 서술형(options=null). 발문은 한국어, 보기·요약문은 영어 고정.
  // getQuestionLanguageToggleScope 가 'stem' 을 반환하므로 optionLanguage 는 노출 안 됨.
  SUMMARY_WRITING: { stemLanguage: "ko", optionLanguage: "en" },
  // 주제문 영작 — 서술형(options=null). 발문 한국어, 제시어/주제문 영어 고정. toggle scope='stem'.
  TOPIC_SENTENCE_WRITING: { stemLanguage: "ko", optionLanguage: "en" },
  CONDITIONAL_WRITING: { stemLanguage: "ko", optionLanguage: "ko" },
  SENTENCE_TRANSFORM: { stemLanguage: "ko", optionLanguage: "ko" },
  FILL_BLANK_KEY: { stemLanguage: "ko", optionLanguage: "ko" },
  WORD_ORDER: { stemLanguage: "ko", optionLanguage: "ko" },
  CONTEXT_MEANING: { stemLanguage: "ko", optionLanguage: "en" },
  SYNONYM: { stemLanguage: "ko", optionLanguage: "en" },
  ANTONYM: { stemLanguage: "ko", optionLanguage: "en" },
};

/**
 * Types whose visible option text is free-language (Korean or English both make
 * a valid question). Everywhere else the option surface is structurally fixed:
 * label/number-only options (SENTENCE_ORDER/INSERT, IRRELEVANT, GRAMMAR_ERROR,
 * REFERENCE), English blank/summary fillers (BLANK_INFERENCE,
 * SUMMARY_COMPLETE_MC), English word lists (VOCAB_CHOICE, SYNONYM, ANTONYM),
 * or no options at all (서술형).
 */
const OPTION_LANGUAGE_FREE_TYPE_IDS = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "CONTEXT_MEANING",
  "CONTENT_MATCH",
]);

/** Which visible-language toggles make sense for a type. Stem applies to every type. */
export function getQuestionLanguageToggleScope(
  typeId: string,
): QuestionLanguageToggleScope {
  return OPTION_LANGUAGE_FREE_TYPE_IDS.has(typeId) ? "stem-option" : "stem";
}

export function defaultLanguageSettingsForType(
  typeId: string,
): Required<QuestionLanguageGenerationSettings> {
  return (
    DEFAULT_QUESTION_LANGUAGE_SETTINGS[typeId] ?? {
      stemLanguage: "ko",
      optionLanguage: "ko",
    }
  );
}

function normalizeGenerationLanguage(
  value: unknown,
  fallback: QuestionGenerationLanguage,
): QuestionGenerationLanguage {
  return value === "en" || value === "ko" ? value : fallback;
}

function readLanguageSettingValue(
  source: unknown,
  key: keyof QuestionLanguageGenerationSettings,
): unknown {
  if (!isRecord(source)) return undefined;
  return source[key];
}

function readLanguageSetting(
  rawSettings: unknown,
  typeId: string,
  key: keyof QuestionLanguageGenerationSettings,
): QuestionGenerationLanguage {
  const defaults = defaultLanguageSettingsForType(typeId);
  const fallback = defaults[key] ?? "ko";
  const directValue = readLanguageSettingValue(rawSettings, key);
  if (directValue !== undefined) {
    return normalizeGenerationLanguage(directValue, fallback);
  }

  const nested = isRecord(rawSettings) ? rawSettings[typeId] : undefined;
  const nestedValue = readLanguageSettingValue(nested, key);
  return normalizeGenerationLanguage(nestedValue, fallback);
}

export function readStemLanguageSetting(
  rawSettings: unknown,
  typeId: string,
): QuestionGenerationLanguage {
  return readLanguageSetting(rawSettings, typeId, "stemLanguage");
}

export function readOptionLanguageSetting(
  rawSettings: unknown,
  typeId: string,
): QuestionGenerationLanguage {
  return readLanguageSetting(rawSettings, typeId, "optionLanguage");
}

export function languageSettingsForType(
  typeId: string,
  rawSettings: unknown,
): Required<QuestionLanguageGenerationSettings> {
  return {
    stemLanguage: readStemLanguageSetting(rawSettings, typeId),
    // Stem-only types ignore stored option language; the option surface is structural.
    optionLanguage:
      getQuestionLanguageToggleScope(typeId) === "stem-option"
        ? readOptionLanguageSetting(rawSettings, typeId)
        : defaultLanguageSettingsForType(typeId).optionLanguage,
  };
}

export function effectiveSettingsWithLanguage(
  typeId: string,
  rawSettings: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...copyRecordOrEmpty(rawSettings),
    ...extra,
    ...languageSettingsForType(typeId, rawSettings),
  };
}

export function languageName(language: QuestionGenerationLanguage): string {
  return language === "en" ? "English" : "Korean";
}

export function buildQuestionLanguageSettingsPrompt(
  typeId: string,
  rawSettings: unknown,
): string {
  if (!isRecord(rawSettings)) return "";
  const scope = getQuestionLanguageToggleScope(typeId);
  const defaults = defaultLanguageSettingsForType(typeId);
  const stemLanguage = readStemLanguageSetting(rawSettings, typeId);
  // Stem-only types keep their structural option language no matter what was stored.
  const optionLanguage =
    scope === "stem-option"
      ? readOptionLanguageSetting(rawSettings, typeId)
      : defaults.optionLanguage;

  if (
    stemLanguage === defaults.stemLanguage &&
    optionLanguage === defaults.optionLanguage
  ) {
    return "";
  }

  const lines = [
    `## Type detail setting: ${typeId} / visible language`,
    "- This language setting overrides any default language instruction in the base type prompt.",
    `- The teacher requested the visible direction/stem in ${languageName(stemLanguage)}.`,
  ];
  if (scope === "stem-option") {
    lines.push(
      `- The teacher requested visible multiple-choice option text in ${languageName(optionLanguage)}.`,
    );
  }

  if (stemLanguage === "en") {
    lines.push("- direction/questionText should be natural exam English. Do not write the stem in Korean unless a fixed Korean exam label is unavoidable.");
  } else {
    lines.push("- direction/questionText should be natural Korean exam wording.");
  }

  if (scope === "stem-option") {
    if (optionLanguage === "en") {
      lines.push("- options[].text must be English-only statements or phrases. Do not include Korean translation, Korean particles, or Korean explanatory wording in option text.");
    } else {
      lines.push("- options[].text must be Korean student-facing statements or phrases. English passage terms may appear only when they are natural evidence labels or quoted source terms.");
    }
  } else {
    lines.push("- This setting changes only the visible direction/stem language. Keep options, answers, and every other field in the standard format for this type.");
  }

  return lines.join("\n");
}
