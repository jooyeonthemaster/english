export interface BlankInferenceGenerationSettings {
  doubleNegative?: boolean;
}

export interface IrrelevantGenerationSettings {
  /** Number of slots (①~⑩). Range 5~10. Default 5. */
  slotCount?: number;
}

export interface GrammarErrorGenerationSettings {
  /** Number of grammar judgment positions to mark. Range 5~10. Default 5. */
  markerCount?: number;
  /** Legacy field name kept for already-saved configs; interpreted as markerCount. */
  errorCount?: number;
}

export const IRRELEVANT_SLOT_COUNT_MIN = 5;
export const IRRELEVANT_SLOT_COUNT_MAX = 10;
export const IRRELEVANT_SLOT_COUNT_DEFAULT = 5;
export const GRAMMAR_MARKER_COUNT_MIN = 5;
export const GRAMMAR_MARKER_COUNT_MAX = 10;
export const GRAMMAR_MARKER_COUNT_DEFAULT = 5;
export const GRAMMAR_ERROR_COUNT_MIN = GRAMMAR_MARKER_COUNT_MIN;
export const GRAMMAR_ERROR_COUNT_MAX = GRAMMAR_MARKER_COUNT_MAX;
export const GRAMMAR_ERROR_COUNT_DEFAULT = GRAMMAR_MARKER_COUNT_DEFAULT;

const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"] as const;

export function normalizeIrrelevantSlotCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return IRRELEVANT_SLOT_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(IRRELEVANT_SLOT_COUNT_MAX, Math.max(IRRELEVANT_SLOT_COUNT_MIN, rounded));
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

export function normalizeGrammarMarkerCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return GRAMMAR_MARKER_COUNT_DEFAULT;
  const rounded = Math.round(n);
  return Math.min(GRAMMAR_MARKER_COUNT_MAX, Math.max(GRAMMAR_MARKER_COUNT_MIN, rounded));
}

export function normalizeGrammarErrorCount(value: unknown): number {
  return normalizeGrammarMarkerCount(value);
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
  return readGrammarMarkerCountSetting(rawSettings);
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
 * - passage < 5 sentences → not generatable (IRRELEVANT structurally needs ≥5)
 * - passage < requested → reject so user can lower the count or pick another passage
 */
export function validateIrrelevantAgainstPassage(
  requestedSlotCount: number,
  passageSentenceCount: number,
): IrrelevantSlotValidation {
  const requested = Math.min(
    IRRELEVANT_SLOT_COUNT_MAX,
    Math.max(IRRELEVANT_SLOT_COUNT_MIN, Math.round(requestedSlotCount)),
  );
  if (passageSentenceCount < IRRELEVANT_SLOT_COUNT_MIN) {
    return {
      ok: false,
      effective: passageSentenceCount,
      passageSentenceCount,
      error: `무관한 문장 유형은 지문이 최소 ${IRRELEVANT_SLOT_COUNT_MIN}문장 이상이어야 합니다. 현재 지문은 ${passageSentenceCount}문장입니다.`,
    };
  }
  if (passageSentenceCount < requested) {
    return {
      ok: false,
      effective: passageSentenceCount,
      passageSentenceCount,
      error: `이 지문은 ${passageSentenceCount}문장이라 선지 ${requested}개로 만들 수 없습니다. 선지를 ${passageSentenceCount}개 이하로 줄이거나 더 긴 지문을 선택하세요.`,
    };
  }
  return { ok: true, effective: requested, passageSentenceCount };
}

export interface QuestionTypeGenerationSettings {
  BLANK_INFERENCE?: BlankInferenceGenerationSettings;
  GRAMMAR_ERROR?: GrammarErrorGenerationSettings;
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
    GRAMMAR_ERROR: {
      markerCount: GRAMMAR_MARKER_COUNT_DEFAULT,
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
    if (markerCount === GRAMMAR_MARKER_COUNT_DEFAULT) return "";
    const labels = GRAMMAR_LABELS.slice(0, markerCount).join(" ");
    const answerMin = markerCount >= 6 ? 2 : 1;
    const answerMax = Math.min(markerCount - 1, Math.max(answerMin, Math.ceil(markerCount / 2)));
    return [
      "## Type detail setting: GRAMMAR_ERROR / expanded grammar judgment positions",
      `- The teacher requested exactly ${markerCount} marked grammar judgment positions, not ${markerCount} answers.`,
      `- Output exactly ${markerCount} markedExpressions and ${markerCount} options labeled ${labels}.`,
      `- Randomly choose a natural answer count from ${answerMin} to ${answerMax}; do not reveal this count in the direction, and never make every marked expression incorrect.`,
      `- Exactly the chosen answer count must have isError=true. Every other markedExpression must remain grammatically correct source wording.`,
      "- correctAnswers must list every isError=true label. correctAnswer must be the same labels joined by comma + space, for example \"(A), (C)\".",
      "- The direction must ask students to choose all grammatically incorrect parts, without saying how many there are.",
      "- Every marked expression, including non-error choices, must be a real exam-worthy grammar judgment point from the passage. Do not pad with weak function words, simple articles, or obvious fixed patterns.",
      "- For each isError=true item: expression/correction must be the original correct passage wording, errorExpression must be the displayed wrong form, and the explanation must name why that displayed form is wrong.",
      "- wrongOptionExplanations must cover every grammatically correct non-answer label, so the 오답 분석 section is never empty for expanded grammar items.",
      "- keyPoints and explanation must cover every error label and the most important non-error decoy points, not only the first few labels.",
    ].join("\n");
  }

  if (typeId === "IRRELEVANT") {
    if (!isRecord(rawSettings)) return "";
    const slotCount = readIrrelevantSlotCountSetting(rawSettings);
    if (slotCount === IRRELEVANT_SLOT_COUNT_DEFAULT) return "";
    return [
      "## Type detail setting: IRRELEVANT / custom slot count",
      `- The teacher requested exactly ${slotCount} slots labeled ①~${["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"][slotCount - 1]}.`,
      `- Output sentences array of length ${slotCount}, irrelevantIndex in range 0..${slotCount - 1}, options array of length ${slotCount}.`,
      `- Choose an unbroken ${slotCount}-sentence window from the passage and replace exactly one of those sentences with the AI-generated irrelevant sentence.`,
      `- The remaining ${slotCount - 1} slots must each contain exactly one verbatim original sentence from that window.`,
      "- The sentence at irrelevantIndex must be the only non-verbatim inserted sentence; never point irrelevantIndex to an original passage sentence.",
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
