export interface BlankInferenceGenerationSettings {
  doubleNegative?: boolean;
}

export interface IrrelevantGenerationSettings {
  /** Number of displayed slots. One slot is an inserted irrelevant sentence. Default 5. */
  slotCount?: number;
}

export interface GrammarErrorGenerationSettings {
  /** Number of grammar judgment positions to mark. Range 5~10. Default 5. */
  markerCount?: number;
  /** Number of actually incorrect marked expressions. Range 1~markerCount. Default 1. */
  answerCount?: number;
  /** Legacy field name kept for already-saved configs; interpreted as markerCount. */
  errorCount?: number;
}

export interface GrammarCorrectionGenerationSettings {
  /** Number of wrong underlined sentence/clause segments. Range 1~5. Default 1. */
  errorCount?: number;
}

export interface SummaryCompleteMcGenerationSettings {
  /** Number of summary blanks. Range 2~4. Default 2. */
  blankCount?: number;
}

export interface ContentMatchGenerationSettings {
  /** Number of displayed statement options. Range 5~12. Default 5. */
  optionCount?: number;
  /** Number of correct statements. Range 1~optionCount. Default 1. */
  answerCount?: number;
  /** Legacy analysis field name; interpreted as answerCount. */
  correctAnswerCount?: number;
}

export interface SummaryCompleteGenerationSettings {
  /** Number of short-answer summary blanks. Range 1~5. Default 2. */
  blankCount?: number;
  /** Legacy analysis field name; interpreted as blankCount. */
  summaryBlankCount?: number;
}

export const IRRELEVANT_SLOT_COUNT_MIN = 5;
export const IRRELEVANT_SLOT_COUNT_MAX = 10;
export const IRRELEVANT_SLOT_COUNT_DEFAULT = 5;
export const SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN = 2;
export const SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX = 4;
export const SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT = 2;
export const SUMMARY_COMPLETE_BLANK_COUNT_MIN = 1;
export const SUMMARY_COMPLETE_BLANK_COUNT_MAX = 5;
export const SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT = 2;
export const CONTENT_MATCH_OPTION_COUNT_MIN = 5;
export const CONTENT_MATCH_OPTION_COUNT_MAX = 12;
export const CONTENT_MATCH_OPTION_COUNT_DEFAULT = 5;
export const CONTENT_MATCH_ANSWER_COUNT_MIN = 1;
export const CONTENT_MATCH_ANSWER_COUNT_DEFAULT = 1;
export const GRAMMAR_MARKER_COUNT_MIN = 5;
export const GRAMMAR_MARKER_COUNT_MAX = 10;
export const GRAMMAR_MARKER_COUNT_DEFAULT = 5;
export const GRAMMAR_ANSWER_COUNT_MIN = 1;
export const GRAMMAR_ANSWER_COUNT_MAX = GRAMMAR_MARKER_COUNT_MAX;
export const GRAMMAR_ANSWER_COUNT_DEFAULT = 1;
export const GRAMMAR_ERROR_COUNT_MIN = GRAMMAR_ANSWER_COUNT_MIN;
export const GRAMMAR_ERROR_COUNT_MAX = GRAMMAR_ANSWER_COUNT_MAX;
export const GRAMMAR_ERROR_COUNT_DEFAULT = GRAMMAR_ANSWER_COUNT_DEFAULT;
export const GRAMMAR_CORRECTION_ERROR_COUNT_MIN = 1;
export const GRAMMAR_CORRECTION_ERROR_COUNT_MAX = 5;
export const GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT = 1;

const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"] as const;

function getIrrelevantLabel(index: number): string {
  if (index >= 0 && index < 20) return String.fromCodePoint(0x2460 + index);
  if (index >= 20 && index < 35) return String.fromCodePoint(0x3251 + (index - 20));
  if (index >= 35 && index < 50) return String.fromCodePoint(0x32b1 + (index - 35));
  return `(${index + 1})`;
}

export function normalizeIrrelevantSlotCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return IRRELEVANT_SLOT_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(
    IRRELEVANT_SLOT_COUNT_MAX,
    Math.max(IRRELEVANT_SLOT_COUNT_MIN, rounded),
  );
}

export function readIrrelevantSlotCountSetting(rawSettings: unknown): number {
  if (!isRecord(rawSettings)) return IRRELEVANT_SLOT_COUNT_DEFAULT;

  if (rawSettings.slotCount !== undefined) {
    return normalizeIrrelevantSlotCount(rawSettings.slotCount);
  }

  const nested = rawSettings.IRRELEVANT;
  if (isRecord(nested)) {
    return normalizeIrrelevantSlotCount(nested.slotCount);
  }

  return IRRELEVANT_SLOT_COUNT_DEFAULT;
}

export function normalizeSummaryCompleteMcBlankCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(
    SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
    Math.max(SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN, rounded),
  );
}

export function readSummaryCompleteMcBlankCountSetting(rawSettings: unknown): number {
  if (!isRecord(rawSettings)) return SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT;

  if (rawSettings.blankCount !== undefined) {
    return normalizeSummaryCompleteMcBlankCount(rawSettings.blankCount);
  }

  if (rawSettings.summaryBlankCount !== undefined) {
    return normalizeSummaryCompleteMcBlankCount(rawSettings.summaryBlankCount);
  }

  const nested = rawSettings.SUMMARY_COMPLETE_MC;
  if (isRecord(nested)) {
    return normalizeSummaryCompleteMcBlankCount(
      nested.blankCount ?? nested.summaryBlankCount,
    );
  }

  return SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT;
}

export function normalizeSummaryCompleteBlankCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(
    SUMMARY_COMPLETE_BLANK_COUNT_MAX,
    Math.max(SUMMARY_COMPLETE_BLANK_COUNT_MIN, rounded),
  );
}

export function readSummaryCompleteBlankCountSetting(rawSettings: unknown): number {
  if (!isRecord(rawSettings)) return SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT;

  if (rawSettings.blankCount !== undefined) {
    return normalizeSummaryCompleteBlankCount(rawSettings.blankCount);
  }

  if (rawSettings.summaryBlankCount !== undefined) {
    return normalizeSummaryCompleteBlankCount(rawSettings.summaryBlankCount);
  }

  const nested = rawSettings.SUMMARY_COMPLETE;
  if (isRecord(nested)) {
    return normalizeSummaryCompleteBlankCount(
      nested.blankCount ?? nested.summaryBlankCount,
    );
  }

  return SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT;
}

export function normalizeContentMatchOptionCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return CONTENT_MATCH_OPTION_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(
    CONTENT_MATCH_OPTION_COUNT_MAX,
    Math.max(CONTENT_MATCH_OPTION_COUNT_MIN, rounded),
  );
}

export function normalizeContentMatchAnswerCount(
  value: unknown,
  optionCount: number = CONTENT_MATCH_OPTION_COUNT_DEFAULT,
): number {
  const optionMax = normalizeContentMatchOptionCount(optionCount);
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return Math.min(CONTENT_MATCH_ANSWER_COUNT_DEFAULT, optionMax);
  }
  const rounded = Math.round(n);
  return Math.min(
    optionMax,
    Math.max(CONTENT_MATCH_ANSWER_COUNT_MIN, rounded),
  );
}

export function readContentMatchOptionCountSetting(rawSettings: unknown): number {
  if (!isRecord(rawSettings)) return CONTENT_MATCH_OPTION_COUNT_DEFAULT;

  if (rawSettings.optionCount !== undefined) {
    return normalizeContentMatchOptionCount(rawSettings.optionCount);
  }

  const nested = rawSettings.CONTENT_MATCH;
  if (isRecord(nested)) {
    return normalizeContentMatchOptionCount(nested.optionCount);
  }

  return CONTENT_MATCH_OPTION_COUNT_DEFAULT;
}

export function readContentMatchAnswerCountSetting(
  rawSettings: unknown,
  optionCount: number = readContentMatchOptionCountSetting(rawSettings),
): number {
  if (!isRecord(rawSettings)) {
    return normalizeContentMatchAnswerCount(undefined, optionCount);
  }

  if (rawSettings.answerCount !== undefined) {
    return normalizeContentMatchAnswerCount(rawSettings.answerCount, optionCount);
  }

  if (rawSettings.correctAnswerCount !== undefined) {
    return normalizeContentMatchAnswerCount(rawSettings.correctAnswerCount, optionCount);
  }

  const nested = rawSettings.CONTENT_MATCH;
  if (isRecord(nested)) {
    return normalizeContentMatchAnswerCount(
      nested.answerCount ?? nested.correctAnswerCount,
      optionCount,
    );
  }

  return normalizeContentMatchAnswerCount(undefined, optionCount);
}

export function normalizeGrammarMarkerCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return GRAMMAR_MARKER_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(GRAMMAR_MARKER_COUNT_MAX, Math.max(GRAMMAR_MARKER_COUNT_MIN, rounded));
}

export function normalizeGrammarErrorCount(value: unknown): number {
  return normalizeGrammarAnswerCount(value);
}

export function normalizeGrammarAnswerCount(
  value: unknown,
  markerCount: number = GRAMMAR_MARKER_COUNT_DEFAULT,
): number {
  const n = typeof value === "number" ? value : Number(value);
  const marker = normalizeGrammarMarkerCount(markerCount);
  const max = Math.max(GRAMMAR_ANSWER_COUNT_MIN, marker);
  if (!Number.isFinite(n)) return Math.min(GRAMMAR_ANSWER_COUNT_DEFAULT, max);
  const rounded = Math.round(n);
  return Math.min(max, Math.max(GRAMMAR_ANSWER_COUNT_MIN, rounded));
}

export function readGrammarMarkerCountSetting(rawSettings: unknown): number {
  if (!isRecord(rawSettings)) return GRAMMAR_MARKER_COUNT_DEFAULT;

  if (rawSettings.markerCount !== undefined) {
    return normalizeGrammarMarkerCount(rawSettings.markerCount);
  }

  if (rawSettings.errorCount !== undefined) {
    return normalizeGrammarMarkerCount(rawSettings.errorCount);
  }

  const nested = rawSettings.GRAMMAR_ERROR;
  if (isRecord(nested)) {
    return normalizeGrammarMarkerCount(nested.markerCount ?? nested.errorCount);
  }

  return GRAMMAR_MARKER_COUNT_DEFAULT;
}

export function readGrammarErrorCountSetting(rawSettings: unknown): number {
  const markerCount = readGrammarMarkerCountSetting(rawSettings);
  return readGrammarAnswerCountSetting(rawSettings, markerCount);
}

export function readGrammarAnswerCountSetting(
  rawSettings: unknown,
  markerCount: number = readGrammarMarkerCountSetting(rawSettings),
): number {
  if (!isRecord(rawSettings)) {
    return normalizeGrammarAnswerCount(undefined, markerCount);
  }

  if (rawSettings.answerCount !== undefined) {
    return normalizeGrammarAnswerCount(rawSettings.answerCount, markerCount);
  }

  if (rawSettings.correctAnswerCount !== undefined) {
    return normalizeGrammarAnswerCount(rawSettings.correctAnswerCount, markerCount);
  }

  const nested = rawSettings.GRAMMAR_ERROR;
  if (isRecord(nested)) {
    return normalizeGrammarAnswerCount(
      nested.answerCount ?? nested.correctAnswerCount,
      markerCount,
    );
  }

  return normalizeGrammarAnswerCount(undefined, markerCount);
}

export function normalizeGrammarCorrectionErrorCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(
    GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
    Math.max(GRAMMAR_CORRECTION_ERROR_COUNT_MIN, rounded),
  );
}

export function readGrammarCorrectionErrorCountSetting(rawSettings: unknown): number {
  if (!isRecord(rawSettings)) return GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT;

  if (rawSettings.errorCount !== undefined) {
    return normalizeGrammarCorrectionErrorCount(rawSettings.errorCount);
  }

  if (rawSettings.answerCount !== undefined) {
    return normalizeGrammarCorrectionErrorCount(rawSettings.answerCount);
  }

  const nested = rawSettings.GRAMMAR_CORRECTION;
  if (isRecord(nested)) {
    return normalizeGrammarCorrectionErrorCount(nested.errorCount ?? nested.answerCount);
  }

  return GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT;
}

export interface IrrelevantSlotValidation {
  ok: boolean;
  /** The slot count actually usable for generation (capped to passage length). */
  effective: number;
  /** Passage sentence count detected. */
  passageSentenceCount: number;
  /** Human-readable Korean error if !ok, else undefined. */
  error?: string;
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

export interface QuestionTypeGenerationSettings {
  BLANK_INFERENCE?: BlankInferenceGenerationSettings;
  CONTENT_MATCH?: ContentMatchGenerationSettings;
  GRAMMAR_ERROR?: GrammarErrorGenerationSettings;
  GRAMMAR_CORRECTION?: GrammarCorrectionGenerationSettings;
  SUMMARY_COMPLETE?: SummaryCompleteGenerationSettings;
  SUMMARY_COMPLETE_MC?: SummaryCompleteMcGenerationSettings;
  IRRELEVANT?: IrrelevantGenerationSettings;
  [typeId: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getDefaultQuestionTypeGenerationSettings(): QuestionTypeGenerationSettings {
  return {
    BLANK_INFERENCE: {
      doubleNegative: false,
    },
    CONTENT_MATCH: {
      optionCount: CONTENT_MATCH_OPTION_COUNT_DEFAULT,
      answerCount: CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
    },
    GRAMMAR_ERROR: {
      markerCount: GRAMMAR_MARKER_COUNT_DEFAULT,
      answerCount: GRAMMAR_ANSWER_COUNT_DEFAULT,
    },
    GRAMMAR_CORRECTION: {
      errorCount: GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT,
    },
    SUMMARY_COMPLETE: {
      blankCount: SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT,
    },
    SUMMARY_COMPLETE_MC: {
      blankCount: SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
    },
    IRRELEVANT: {
      slotCount: IRRELEVANT_SLOT_COUNT_DEFAULT,
    },
  };
}

export function buildQuestionTypeSettingsPrompt(
  typeId: string,
  rawSettings: unknown,
): string {
  if (typeId === "GRAMMAR_ERROR") {
    if (!isRecord(rawSettings)) return "";
    const markerCount = readGrammarMarkerCountSetting(rawSettings);
    const answerCount = readGrammarAnswerCountSetting(rawSettings, markerCount);
    if (
      markerCount === GRAMMAR_MARKER_COUNT_DEFAULT &&
      answerCount === GRAMMAR_ANSWER_COUNT_DEFAULT
    ) {
      return "";
    }
    const labels = GRAMMAR_LABELS.slice(0, markerCount).join(" ");
    return [
      "## Type detail setting: GRAMMAR_ERROR / grammar judgment positions and answer count",
      `- The teacher requested exactly ${markerCount} marked grammar judgment positions and exactly ${answerCount} answer label(s).`,
      `- Output exactly ${markerCount} markedExpressions and ${markerCount} options labeled ${labels}.`,
      `- Exactly ${answerCount} markedExpression item(s) must have isError=true. If fewer than ${markerCount} are answers, every other markedExpression must remain grammatically correct source wording. If all ${markerCount} are answers, every marked expression is intentionally incorrect.`,
      "- correctAnswers must list every isError=true label. correctAnswer must be the same labels joined by comma + space, for example \"(A), (C)\".",
      answerCount >= 2
        ? "- The direction must ask students to choose all grammatically incorrect parts using '모두', without saying how many answers there are."
        : "- The direction must ask students to choose the grammatically incorrect part as a single-answer item.",
      "- Every marked expression, including non-error choices, must be a real exam-worthy grammar judgment point from the passage. Do not pad with weak function words, simple articles, or obvious fixed patterns.",
      "- For each isError=true item: expression/correction must be the original correct passage wording, errorExpression must be the displayed wrong form, and the explanation must name why that displayed form is wrong.",
      "- wrongOptionExplanations must cover every grammatically correct non-answer label. If every label is an answer, return an empty wrongOptionExplanations array/object according to the schema.",
      "- keyPoints and explanation must cover every error label and the most important non-error decoy points, not only the first few labels.",
    ].join("\n");
  }

  if (typeId === "IRRELEVANT") {
    if (!isRecord(rawSettings)) return "";
    const slotCount = readIrrelevantSlotCountSetting(rawSettings);
    if (slotCount === IRRELEVANT_SLOT_COUNT_DEFAULT) return "";
    return [
      "## Type detail setting: IRRELEVANT / custom slot count",
      `- The teacher requested exactly ${slotCount} slots labeled ①~${getIrrelevantLabel(slotCount - 1)}.`,
      `- Output sentences array of length ${slotCount}, irrelevantIndex in range 1..${slotCount - 2}, options array of length ${slotCount}.`,
      `- Use the unbroken ${slotCount - 1}-sentence source window starting at original passage sentence 2, then insert exactly one AI-generated irrelevant sentence into that flow.`,
      `- The ${slotCount - 1} source sentences must all remain present, verbatim, and in the original order. Do not replace, delete, paraphrase, merge, or split any source sentence.`,
      "- Never include the original first passage sentence in sentences or options. It must be shown only as unnumbered context in passageWithNumbers.",
      "- The first numbered choice ① must be the original second passage sentence unless the inserted irrelevant sentence is placed before it.",
      "- Never put the inserted irrelevant sentence in the first or last slot. The answer must be an inner numbered sentence.",
      "- The sentence at irrelevantIndex must be the only non-verbatim inserted sentence; every other slot must be one of the original source-window sentences.",
    ].join("\n");
  }

  if (typeId === "GRAMMAR_CORRECTION") {
    if (!isRecord(rawSettings)) return "";
    const errorCount = readGrammarCorrectionErrorCountSetting(rawSettings);
    if (errorCount === GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT) return "";
    return [
      "## Type detail setting: GRAMMAR_CORRECTION / wrong underline count",
      `- The teacher requested exactly ${errorCount} wrong underlined sentence/clause segment(s).`,
      `- Output exactly ${errorCount} underlinedSegments item(s), and every item must have isError=true.`,
      "- Each underlined segment must be a wider sentence/clause from the original passage, not only the exact wrong word/form.",
      "- Each displayedText must hide one grammar mutation inside that wider underline.",
      "- correctAnswer must list every label and correctedPart in order, for example \"(A) are, (B) have\".",
      "- correctedParts should list the corrected expression for every wrong underline in the same order as underlinedSegments.",
      "- Each underlinedSegments item must include label values starting from \"(A)\" in order.",
      "- Do not add extra grammatically correct underlined segments for this setting; underline count and error count are the same.",
    ].join("\n");
  }

  if (typeId === "CONTENT_MATCH") {
    if (!isRecord(rawSettings)) return "";
    const optionCount = readContentMatchOptionCountSetting(rawSettings);
    const answerCount = readContentMatchAnswerCountSetting(rawSettings, optionCount);
    if (
      optionCount === CONTENT_MATCH_OPTION_COUNT_DEFAULT &&
      answerCount === CONTENT_MATCH_ANSWER_COUNT_DEFAULT
    ) {
      return "";
    }
    const labels = Array.from({ length: optionCount }, (_, index) => String(index + 1));
    const labelsText = labels.join(", ");
    return [
      "## Type detail setting: CONTENT_MATCH / statement option count and answer count",
      `- The teacher requested exactly ${optionCount} numbered statement option(s), labeled ${labelsText}.`,
      `- The teacher requested exactly ${answerCount} correct statement label(s).`,
      `- options must contain exactly ${optionCount} Korean statement options. Each option label must be one of ${labelsText}.`,
      answerCount >= 2
        ? "- The direction must ask students to choose all matching or all non-matching statements using '모두'. Do not reveal the answer count in the direction."
        : "- The direction must ask for one best matching or non-matching statement.",
      answerCount >= 2
        ? `- correctAnswers must contain exactly ${answerCount} labels, and correctAnswer must be the same labels joined by comma + space.`
        : "- correctAnswer must be the single correct option label.",
      "- Keep matchType polarity consistent: if the direction asks for non-matching statements, every correct label must be false against the passage; if it asks for matching statements, every correct label must be true.",
      "- Every option must be independently checkable from the passage and should be similar in length and specificity.",
      "- wrongOptionExplanations must explain every non-answer label by citing the decisive passage clue.",
    ].join("\n");
  }

  if (typeId === "SUMMARY_COMPLETE") {
    if (!isRecord(rawSettings)) return "";
    const blankCount = readSummaryCompleteBlankCountSetting(rawSettings);
    if (blankCount === SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT) return "";
    const labels = Array.from({ length: blankCount }, (_, index) =>
      `(${String.fromCharCode(65 + index)})`
    );
    const labelsText = labels.join(", ");
    return [
      "## Type detail setting: SUMMARY_COMPLETE / short-answer summary blank count",
      `- The teacher requested exactly ${blankCount} short-answer summary blank(s): ${labelsText}.`,
      `- summaryWithBlanks must contain each marker ${labelsText} exactly once.`,
      `- blanks must contain exactly ${blankCount} entries with labels ${labelsText}, in order.`,
      "- Each blank answer must be an English word or natural English phrase grounded in the passage.",
      "- correctAnswer must list every blank answer in label order.",
      "- Do not create multiple-choice options for this type.",
    ].join("\n");
  }

  if (typeId === "SUMMARY_COMPLETE_MC") {
    if (!isRecord(rawSettings)) return "";
    const blankCount = readSummaryCompleteMcBlankCountSetting(rawSettings);
    if (blankCount === SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT) return "";
    const labels = Array.from({ length: blankCount }, (_, index) =>
      `(${String.fromCharCode(65 + index)})`
    );
    const labelsText = labels.join(", ");
    return [
      "## Type detail setting: SUMMARY_COMPLETE_MC / summary blank count",
      "- This block overrides any default two-blank SUMMARY_COMPLETE_MC instruction elsewhere in the prompt.",
      `- The teacher requested exactly ${blankCount} summary blank(s): ${labelsText}.`,
      `- direction must ask for the best words for blanks ${labelsText}.`,
      `- summaryWithBlanks must be one natural English summary sentence and must contain each marker ${labelsText} exactly once.`,
      `- blanks must contain exactly ${blankCount} entries with labels ${labelsText}, in order, and each answer must be an English word or natural English phrase.`,
      "- options must contain exactly 5 answer choices.",
      `- Each option must provide a blankValues array with exactly ${blankCount} entries, one for each label ${labelsText}, plus a readable text value joining the values with \" …… \".`,
      "- The correct option's blankValues must match the blanks answers exactly.",
      "- Wrong options must be passage-grounded near-misses. Include at least one option that is correct for all but one blank so students must verify every blank.",
      "- Keep grammar slots parallel column by column: every value for the same blank label should fit the same part of speech and sentence position.",
    ].join("\n");
  }

  if (typeId !== "BLANK_INFERENCE" || !isRecord(rawSettings)) return "";
  if (rawSettings.doubleNegative !== true) return "";

  return [
    "## Type detail setting: BLANK_INFERENCE / negative paraphrase blank",
    "- Apply the teacher-selected negative-paraphrase blank mode. The passage itself does NOT need to contain a negative cue.",
    "- The difficulty comes from the answer option: choose a central source expression from the passage, blank that exact expression, and make the correct option a semantically equivalent negative or privative paraphrase.",
    "- This is not a simple antonym or vocabulary item. Students should have to recognize that a negative-looking expression preserves the passage's original meaning.",
    "- Good correct-answer patterns include not + opposite, without + required element, lack/lacking, fail to, cannot ... without, prevent/keep ... from, not beyond, not distorted by, not independent of, free from, and non-/un-/in-/im- when natural.",
    "- The correct option should normally use one clear negative or privative mechanism. Avoid tangled chains such as 'not ... without', 'without ... not', 'fail ... without', repeated 'fail', 'unable ... without', or 'not ... excluding' unless the sentence remains unquestionably natural and equivalent.",
    "- Never create a no-subject + negative-predicate double negation such as 'No effort does not...', 'No strategy cannot...', or 'No reason is not...'. If the answer begins with no/lack/absence, the rest of the completed sentence should stay affirmative and logically clear.",
    "- originalExpression must be copied verbatim from the passage, but the correct option must not be verbatim and must not be a same-polarity near-synonym.",
    "- Choose a phrase with a real logical action or relation: a verb phrase, gerund phrase, participial phrase, or compact modified noun phrase. Do not blank a single abstract noun such as variation, diversity, complexity, trust, confidence, progress, reason, emotion, or memory.",
    "- Prefer originalExpression with no punctuation. Never choose a span containing a colon, semicolon, a comma-list, or a list of three or more items.",
    "- Avoid example-list slots such as 'such as ____', 'including ____', or 'for example ____'; those usually test vocabulary categories rather than reading logic.",
    "- The correct option must occupy the same grammatical slot as originalExpression. If the blank follows a preposition such as by, of, to, for, with, from, in, or on, the answer must not start with another preposition such as without/by/of/with.",
    "- If the blank comes after a form of be or a linking verb, the correct option must be a complement phrase. Never create broken sentences like 'reasons are cannot...'.",
    "- If the source sentence says 'can/could certainly be influenced by X', blank the whole modal passive span, for example 'can certainly be influenced by reasoning', not only 'influenced by reasoning'. This lets natural answers such as 'are not immune to rational modification' fit the sentence.",
    "- Before finalizing, silently read the original completed sentence and the answer completed sentence. If the answer version is ungrammatical or changes, narrows, exaggerates, or reverses the claim, rewrite it.",
    "- If the source means helps, guides, protects, strengthens, or supports, the negative paraphrase should preserve that function; do not overstate it as 'impossible without' or make the object helpless/dependent unless the passage actually says so.",
    "- Avoid 'impossible ... without' when it turns a helpful function into a strict necessity. Prefer a clean functional paraphrase such as 'preventing X from becoming Y' or 'not allowing X to be damaged'.",
    "- Avoid result-declaration answers such as 'not allow any disruption'. A policy answer should name the relation or mechanism in natural exam English, such as diversifying import sources, preserving a domestic base, securing stable supplies, or preventing excessive dependence when those ideas are in the passage.",
    "- Check the sentence immediately after the blank. If it says the strategy will reduce excessive dependence on foreign sources or create a balanced/resilient system, the correct option must not merely intensify import dependence; it must either choose a higher-level source expression or include the balancing/diversification relation.",
    "- In not only X but also Y structures, blank only the compact Y phrase, not the whole contrast. For example, use 'the protection of civic trust' rather than a comma-crossing span.",
    "- Use native, exam-grade collocations. Avoid awkward phrases such as 'prevent your achievement from failing', 'achievement failing', 'achieved success', 'capacity to lack', 'events cannot survive', 'guarantee major crops', 'not allow any disruption', or 'can be not entirely immune'. Prefer 'prevent success from eroding/collapsing', 'keep current success from eroding', 'freedom from dependence on...', 'secure stable supplies of major crops', 'events fail to matter', or 'are not immune to...'.",
    "- The correct option must contain a clear negative or privative cue: not, no, never, without, lack, fail/failure, prevent/keep from, cannot, unable, impossible, free from, non-, un-, in-/im-, exclude, undermine, compromise, erosion, or a close contextual equivalent.",
    "- The correct option must NOT be the only negative-looking option. At least two wrong options must also contain negative/privative language.",
    "- Build attractive wrong options in the current 2026 CSAT style: use the same semantic field and passage keywords, but make each one fail by subtle polarity, scope, causal-role, target, discourse-role, or thesis-direction shift.",
    "- Keep all options parallel in grammar, register, length, and abstraction level so the negative expression itself is not an answer giveaway.",
    "- Set blankAnswerMode to \"DOUBLE_NEGATIVE\".",
    "- Add answerLogic in Korean explaining how the negative/privative paraphrase preserves the original passage meaning and why each tempting wrong option fails.",
    "- Use the tag '부정 패러프레이즈' for this setting. Use '이중 부정' only when the correct option truly combines two negative mechanisms such as not + independent/immune/free or cannot + trivial; do not tag simple not + negative noun as double negative.",
    "- Wrong-option explanations must cite the decisive passage clue or blank-sentence logic, not merely say the option is positive/negative or close to the author's ideal. For conclusion blanks, explicitly connect the rejection to the conclusion signal such as 'remain in that position for long', 'when viewed at the timescales...', or the sentence immediately before/after the blank.",
  ].join("\n");
}

export function getQuestionTypeSettingsForType(
  settings: QuestionTypeGenerationSettings | undefined,
  typeId: string,
): unknown {
  return settings?.[typeId];
}
