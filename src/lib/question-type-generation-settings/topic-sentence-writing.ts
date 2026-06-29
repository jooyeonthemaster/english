// 주제문 영작(TOPIC_SENTENCE_WRITING) 세부옵션 — 상수·해석·발문 합성.
// SUMMARY_WRITING(summary-writing.ts) 패턴을 그대로 따른다: 난이도 프리셋 + 호환성
// 매트릭스(F=강제) + 결정론 발문(같은 입력 → 같은 출력). 정답계열은 여기 없다.

import { type QuestionDifficulty } from "@/lib/difficulty";
import {
  getQuestionTypeSettingsForType,
  isRecord,
  normalizeNumericSetting,
  readNumericSetting,
  readQuestionTypeDifficultySetting,
} from "./shared";
import {
  type NumericSettingSpec,
  type ResolvedTopicSentenceWritingSettings,
} from "./types";

// ── 상수 ──
export const TOPIC_SENTENCE_WRITING_BLANK_COUNT_MIN = 1;
export const TOPIC_SENTENCE_WRITING_BLANK_COUNT_MAX = 2;
export const TOPIC_SENTENCE_WRITING_BLANK_COUNT_DEFAULT = 1;

export const TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MIN = 0;
export const TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MAX = 3;
export const TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_DEFAULT = 0;

export const TOPIC_SENTENCE_WRITING_BLANK_COUNT_SETTING: NumericSettingSpec = {
  key: "blankCount",
  min: TOPIC_SENTENCE_WRITING_BLANK_COUNT_MIN,
  max: TOPIC_SENTENCE_WRITING_BLANK_COUNT_MAX,
  defaultValue: TOPIC_SENTENCE_WRITING_BLANK_COUNT_DEFAULT,
};

export const TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_SETTING: NumericSettingSpec = {
  key: "distractors",
  aliases: ["boxDistractors", "distractorCount"],
  min: TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MIN,
  max: TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_MAX,
  defaultValue: TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_DEFAULT,
};

export function normalizeTopicSentenceWritingBlankCount(value: unknown): number {
  return normalizeNumericSetting(value, TOPIC_SENTENCE_WRITING_BLANK_COUNT_SETTING);
}

/** 생성 오케스트레이터(run-question-generation)가 import. 절대 변경 금지. */
export function readTopicSentenceWritingBlankCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "TOPIC_SENTENCE_WRITING",
    TOPIC_SENTENCE_WRITING_BLANK_COUNT_SETTING,
  );
}

export function normalizeTopicSentenceWritingDistractorCount(value: unknown): number {
  return normalizeNumericSetting(value, TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_SETTING);
}

export function readTopicSentenceWritingDistractorCountSetting(rawSettings: unknown): number {
  return readNumericSetting(
    rawSettings,
    "TOPIC_SENTENCE_WRITING",
    TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_SETTING,
  );
}

// ── 열거형/불리언 읽기(flat 우선 → nested(typeId) 폴백) ──
function readEnumSetting<T extends string>(
  rawSettings: unknown,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const allow = (v: unknown): v is T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v);
  if (isRecord(rawSettings) && allow(rawSettings[key])) {
    return rawSettings[key] as T;
  }
  const nested = isRecord(rawSettings)
    ? rawSettings.TOPIC_SENTENCE_WRITING
    : undefined;
  if (isRecord(nested) && allow(nested[key])) {
    return nested[key] as T;
  }
  return fallback;
}

function readBooleanSetting(
  rawSettings: unknown,
  key: string,
  fallback: boolean,
): boolean {
  if (isRecord(rawSettings) && typeof rawSettings[key] === "boolean") {
    return rawSettings[key] as boolean;
  }
  const nested = isRecord(rawSettings)
    ? rawSettings.TOPIC_SENTENCE_WRITING
    : undefined;
  if (isRecord(nested) && typeof nested[key] === "boolean") {
    return nested[key] as boolean;
  }
  return fallback;
}

/**
 * 강사가 이 숫자 옵션을 명시적으로 설정했는지(flat 또는 nested 어느 키든) 검사한다.
 * SUMMARY_WRITING 과 달리 미설정 숫자 옵션은 spec 기본값이 아니라 난이도 프리셋을 따르게 해,
 * 기본/중급/킬러의 빈칸수·미끼수 차이가 실제 생성에 반영되도록 한다(차이가 확실).
 */
function hasNumericSetting(rawSettings: unknown, keys: readonly string[]): boolean {
  if (isRecord(rawSettings) && keys.some((k) => rawSettings[k] !== undefined)) {
    return true;
  }
  const nested = isRecord(rawSettings)
    ? rawSettings.TOPIC_SENTENCE_WRITING
    : undefined;
  return isRecord(nested) && keys.some((k) => nested[k] !== undefined);
}

/** 난이도별 기본 프리셋. 옵션 미설정 시 이 값으로 채운다(차이가 확실하도록 설계). */
function topicSentenceWritingDifficultyPreset(
  difficulty: QuestionDifficulty,
): ResolvedTopicSentenceWritingSettings {
  if (difficulty === "BASIC") {
    // 기본 — "구 배열": 의미·재료 다 주고 어순 조립만.
    return {
      difficulty,
      mode: "scrambled",
      topicForm: "nounPhrase",
      hintEnabled: true,
      hintLooseness: "literal",
      chunking: "chunk",
      distractors: 0,
      fidelity: "verbatim",
      scrambleOrder: "random",
      blankCount: 1,
      blankAssignment: "separate",
      clueMode: "none",
      sourceMode: "explicit",
      sourceSentenceParaphrase: false,
      scoringGranularity: "keyword",
    };
  }
  if (difficulty === "KILLER") {
    // 킬러 — "빈칸완성 + 어형변형 + 미끼 + 추론".
    return {
      difficulty,
      mode: "cloze",
      topicForm: "sentence",
      hintEnabled: false,
      hintLooseness: "natural",
      chunking: "word",
      distractors: 2,
      fidelity: "inflected",
      scrambleOrder: "scrambleStrong",
      blankCount: 2,
      blankAssignment: "separate",
      clueMode: "none",
      sourceMode: "inference",
      sourceSentenceParaphrase: true,
      scoringGranularity: "rubric",
    };
  }
  // 중급 INTERMEDIATE — "단어 배열 + 미끼".
  return {
    difficulty,
    mode: "scrambled",
    topicForm: "sentence",
    hintEnabled: true,
    hintLooseness: "natural",
    chunking: "word",
    distractors: 1,
    fidelity: "verbatim",
    scrambleOrder: "scrambleStrong",
    blankCount: 1,
    blankAssignment: "separate",
    clueMode: "none",
    sourceMode: "paraphrase",
    sourceSentenceParaphrase: false,
    scoringGranularity: "keyword",
  };
}

/**
 * TOPIC_SENTENCE_WRITING 세부옵션을 호환성 매트릭스대로 해석한다.
 * 강사 설정값 우선, 미설정은 난이도 프리셋, 그 위에 모순 제거(F=강제) 규칙.
 * 결정론적이라 같은 입력 → 같은 출력(발문 합성·프롬프트 양쪽에서 동일).
 */
export function resolveTopicSentenceWritingSettings(
  rawSettings: unknown,
  fallbackDifficulty: string | null | undefined = "INTERMEDIATE",
): ResolvedTopicSentenceWritingSettings {
  const difficulty = readQuestionTypeDifficultySetting(
    getQuestionTypeSettingsForType(rawSettings, "TOPIC_SENTENCE_WRITING"),
    fallbackDifficulty,
  );
  const preset = topicSentenceWritingDifficultyPreset(difficulty);

  const mode = readEnumSetting(
    rawSettings,
    "mode",
    ["scrambled", "cloze"] as const,
    preset.mode,
  );
  const topicForm = readEnumSetting(
    rawSettings,
    "topicForm",
    ["sentence", "nounPhrase"] as const,
    preset.topicForm,
  );
  const hintEnabled = readBooleanSetting(rawSettings, "hintEnabled", preset.hintEnabled);
  const hintLooseness = readEnumSetting(
    rawSettings,
    "hintLooseness",
    ["literal", "natural", "gist"] as const,
    preset.hintLooseness,
  );
  const chunking = readEnumSetting(
    rawSettings,
    "chunking",
    ["word", "chunk", "mixed"] as const,
    preset.chunking,
  );
  const fidelity = readEnumSetting(
    rawSettings,
    "fidelity",
    ["verbatim", "inflected", "mixed"] as const,
    preset.fidelity,
  );
  const scrambleOrder = readEnumSetting(
    rawSettings,
    "scrambleOrder",
    ["random", "scrambleStrong"] as const,
    preset.scrambleOrder,
  );
  // 미설정 시 난이도 프리셋 값(킬러=2 등)을 따른다 — spec 기본값(1)이 아니라.
  const blankCount = hasNumericSetting(rawSettings, ["blankCount"])
    ? readNumericSetting(
        rawSettings,
        "TOPIC_SENTENCE_WRITING",
        TOPIC_SENTENCE_WRITING_BLANK_COUNT_SETTING,
      )
    : normalizeNumericSetting(preset.blankCount, TOPIC_SENTENCE_WRITING_BLANK_COUNT_SETTING);
  const blankAssignment = readEnumSetting(
    rawSettings,
    "blankAssignment",
    ["separate", "shared"] as const,
    preset.blankAssignment,
  );
  const clueMode = readEnumSetting(
    rawSettings,
    "clueMode",
    ["none", "firstLetter", "wordCount"] as const,
    preset.clueMode,
  );
  const sourceMode = readEnumSetting(
    rawSettings,
    "sourceMode",
    ["explicit", "paraphrase", "inference"] as const,
    preset.sourceMode,
  );
  const sourceSentenceParaphrase = readBooleanSetting(
    rawSettings,
    "sourceSentenceParaphrase",
    preset.sourceSentenceParaphrase,
  );
  const scoringGranularity = readEnumSetting(
    rawSettings,
    "scoringGranularity",
    ["exact", "keyword", "rubric"] as const,
    preset.scoringGranularity,
  );

  // 미설정 시 난이도 프리셋 값(중급=1, 킬러=2)을 따른다.
  const distractors = hasNumericSetting(rawSettings, [
    "distractors",
    "boxDistractors",
    "distractorCount",
  ])
    ? readNumericSetting(
        rawSettings,
        "TOPIC_SENTENCE_WRITING",
        TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_SETTING,
      )
    : normalizeNumericSetting(
        preset.distractors,
        TOPIC_SENTENCE_WRITING_DISTRACTOR_COUNT_SETTING,
      );

  // ── 호환성 매트릭스 강제(F) ──
  // 명사구는 1개 빈칸으로 충분 — cloze nounPhrase 면 blankCount 1 강제(다중 빈칸은 문장형만).
  const effectiveBlankCount =
    mode === "cloze" && topicForm === "nounPhrase" ? 1 : blankCount;
  // 단일 빈칸(또는 scrambled)이면 blankAssignment 무의미 → separate 고정.
  const effectiveBlankAssignment =
    mode === "cloze" && effectiveBlankCount >= 2 ? blankAssignment : "separate";

  return {
    difficulty,
    mode,
    topicForm,
    hintEnabled,
    hintLooseness,
    chunking,
    distractors,
    fidelity,
    scrambleOrder,
    blankCount: effectiveBlankCount,
    blankAssignment: effectiveBlankAssignment,
    clueMode,
    sourceMode,
    sourceSentenceParaphrase,
    scoringGranularity,
  };
}

/** 빈칸 라벨 목록 "(A)" "(B)" ... blankCount개. */
export function topicSentenceWritingBlankLabels(blankCount: number): string[] {
  const n = normalizeTopicSentenceWritingBlankCount(blankCount);
  return Array.from({ length: n }, (_, i) => `(${String.fromCharCode(65 + i)})`);
}

function topicSentenceWritingDifficultyPoints(difficulty: QuestionDifficulty): string {
  if (difficulty === "BASIC") return "[2점]";
  if (difficulty === "KILLER") return "[4점]";
  return "[3점]";
}

/**
 * 결정론 발문 합성. 옵션 조합 → 한국어 발문. AI 자유문구 금지(같은 입력 → 같은 출력).
 * 모순 가드: 미끼/어형변형이 있으면 "변형 없이 한 번씩 모두 사용" 문구를 붙이지 않는다.
 */
export function buildTopicSentenceWritingDirection(
  settings: ResolvedTopicSentenceWritingSettings,
): string {
  const points = topicSentenceWritingDifficultyPoints(settings.difficulty);
  // 주격 보어 자리 조사(이/가) — "주제"(모음 끝)=가, "주제문"(받침 ㄴ)=이.
  const becomeClause = settings.topicForm === "nounPhrase" ? "주제가 되도록" : "주제문이 되도록";
  const topicWord = settings.topicForm === "nounPhrase" ? "주제" : "주제문";
  const prefix = settings.hintEnabled ? "[주제 힌트]를 참고하여 " : "";
  const distractorTail = settings.distractors > 0 ? " (쓰지 않는 단어가 포함됨)" : "";
  const inflectNote = settings.fidelity !== "verbatim" ? " (필요시 어형을 바꿔)" : "";

  let body: string;
  if (settings.mode === "scrambled") {
    // 배열: 주어진 단어를 올바른 순서로 배열.
    const verbatimAll = settings.distractors === 0 && settings.fidelity === "verbatim";
    const action = verbatimAll
      ? "주어진 단어를 모두 한 번씩 사용하여 올바른 순서로 배열하시오"
      : `주어진 단어를${inflectNote} 올바른 순서로 배열하시오`;
    body = `다음 글의 ${becomeClause} ${prefix}${action}.${distractorTail}`;
  } else {
    // cloze: 주제문 빈칸을 영작.
    const labels = topicSentenceWritingBlankLabels(settings.blankCount).join(", ");
    const pick = settings.distractors > 0 ? "[보기]에서 필요한 단어만 골라" : "[보기]의 단어를 활용하여";
    body = `다음 글의 ${topicWord} 빈칸 ${labels}에 들어갈 말을 ${prefix}${pick}${inflectNote} 영작하시오.${distractorTail}`;
  }

  return `${body} ${points}`.replace(/\s{2,}/g, " ").trim();
}
