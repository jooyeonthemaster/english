export type QuestionQualitySeverity = "error" | "warning";

export interface QuestionQualityIssue {
  severity: QuestionQualitySeverity;
  code: string;
  message: string;
}

interface ValidateQuestionQualityInput {
  typeId: string;
  question: Record<string, unknown>;
  passage?: string;
  requestedDifficulty?: string;
}

const MC_TYPE_IDS = new Set([
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "REFERENCE",
  "CONTENT_MATCH",
  "IRRELEVANT",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);

const SHORT_TARGET_TYPES = new Set([
  "REFERENCE",
  "CONTEXT_MEANING",
  "ANTONYM",
]);

const OPTION_HEAVY_TYPES = new Set([
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "REFERENCE",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);

const TYPE_QUALITY_RUBRICS: Record<string, string[]> = {
  BLANK_INFERENCE: [
    "Choose a blank that controls the paragraph logic, not a removable adjective or a local detail.",
    "All five options must fit the same grammatical slot; distractors should be plausible but fail the author's logic.",
    "For KILLER, the answer should require connecting at least two sentences or a concession/cause-effect relation.",
  ],
  GRAMMAR_ERROR: [
    "Mark five real expressions from the original passage and create exactly one error by changing only the marked expression.",
    "The error must test a meaningful grammar point such as agreement, parallelism, modification, tense/aspect, reference, or verb form.",
    "For KILLER, avoid an obvious spelling-level error; the wrong expression should look natural until the sentence structure is checked.",
  ],
  VOCAB_CHOICE: [
    "Mark five context-bearing words from the passage. Do not use tiny function words or words whose meaning is obvious without context.",
    "Only one marked word should be contextually inappropriate; its substitute must be close enough to look tempting.",
    "For KILLER, test register, collocation, stance, causality, or discourse role, not a simple dictionary antonym.",
  ],
  SENTENCE_ORDER: [
    "The three reordered paragraphs must have explicit discourse clues such as pronoun reference, chronology, contrast, or cause-effect.",
    "All options should be plausible permutations; avoid an answer that is forced by a single first-word connector only.",
    "For KILLER, the correct order should require checking both local cohesion and the whole paragraph argument.",
  ],
  SENTENCE_INSERT: [
    "The inserted sentence must contain a referent, transition, or logical bridge that uniquely fits one gap.",
    "Place five markers at natural sentence boundaries and keep the given sentence stylistically consistent with the passage.",
    "For KILLER, distractor locations should each have one tempting clue but fail because of reference, flow, or logic.",
  ],
  TOPIC_MAIN_IDEA: [
    "The correct option must paraphrase the whole passage, not repeat a surface keyword.",
    "Distractors should be partial, too broad, too narrow, reversed, or unsupported versions of the passage.",
    "For KILLER, options should be close in wording and differ by scope, causal direction, or author stance.",
  ],
  TITLE: [
    "The title must capture the central tension or outcome of the passage, not only name the topic.",
    "Distractors should sound like valid titles but miss the passage's controlling idea.",
    "For KILLER, avoid giveaway wording; make the title choice depend on the full development of the text.",
  ],
  REFERENCE: [
    "Underline a standalone pronoun or demonstrative that appears as its own token in the passage.",
    "The surroundingText must be the exact sentence window that contains that pronoun; the explanation must discuss that same sentence, not a different sentence or the passage conclusion.",
    "Before finalizing, verify that surroundingText contains the standalone underlinedPronoun with token boundaries. If it does not, choose another pronoun occurrence.",
    "Options must include several grammatically or semantically plausible antecedents from the nearby context.",
    "For KILLER, the answer should require resolving grammar, number, discourse role, and meaning; never underline inside another word.",
  ],
  CONTENT_MATCH: [
    "Every option must be traceable to a specific passage claim.",
    "The incorrect option should be subtly distorted by degree, cause-effect, comparison, time, or condition.",
    "For KILLER, avoid invented statements that are obviously absent from the passage.",
  ],
  IRRELEVANT: [
    "The irrelevant sentence should share the general topic but break the paragraph's logic or focus.",
    "Number five sentences cleanly and keep the inserted sentence stylistically compatible.",
    "For KILLER, make the sentence tempting by vocabulary overlap but wrong by discourse function.",
  ],
  CONDITIONAL_WRITING: [
    "Require an answer that combines passage meaning with at least one explicit grammatical or lexical condition.",
    "The model answer must be a natural English sentence and satisfy every condition exactly.",
    "For KILLER, include two or more constraints that interact, such as a required structure plus a specific meaning relation.",
  ],
  SENTENCE_TRANSFORM: [
    "Transform a meaningful sentence from the passage without changing the intended meaning.",
    "Conditions must be specific enough to make one answer shape clearly preferable.",
    "For KILLER, require multiple transformations while preserving tense, reference, and logical emphasis.",
  ],
  FILL_BLANK_KEY: [
    "Blank a key phrase whose recovery depends on passage logic, not a generic word.",
    "The answer should be exact, concise, and naturally fit the sentence.",
    "For KILLER, the blank should test a central inference or collocation that cannot be guessed from grammar alone.",
  ],
  SUMMARY_COMPLETE: [
    "The summary must be faithful to the whole passage and use natural English collocations.",
    "Each blank should correspond to a distinct core idea, not repeated wording.",
    "For KILLER, make blanks require abstraction and relation mapping; avoid awkward phrases or redundant word pairs.",
  ],
  WORD_ORDER: [
    "Use meaningful chunks that form one natural English sentence from the passage idea.",
    "Keep punctuation attached to a neighboring word/chunk and never create punctuation-only pieces.",
    "For KILLER, the order should require grammar plus meaning; the scrambledWords order must not already equal the model answer.",
  ],
  GRAMMAR_CORRECTION: [
    "Create exactly one grammar error in a sentence that otherwise reads naturally.",
    "The correction must fix only the target error and preserve the original meaning.",
    "For KILLER, test a higher-value grammar point such as modifier attachment, parallelism, tense logic, or agreement across distance.",
  ],
  CONTEXT_MEANING: [
    "Underline a context-rich word or phrase, not a trivial word whose meaning is obvious in isolation.",
    "Options must be close semantic alternatives; the correct meaning should depend on the sentence's role in the passage.",
    "For KILLER, test nuance, stance, register, collocation, or metaphorical use rather than a dictionary synonym.",
  ],
  SYNONYM: [
    "Choose a target word with enough semantic weight to test context-sensitive synonymy.",
    "Distractors should be the same part of speech and close in meaning but wrong in context or register.",
    "For KILLER, avoid elementary pairs; the answer should require discriminating fine semantic nuance.",
  ],
  ANTONYM: [
    "Mark words with clear contextual meaning and provide antonyms that match the part of speech and sense.",
    "Distractors should be plausible opposite-related words, not random vocabulary.",
    "For KILLER, test contextual opposition, stance, or scale rather than a simple memorized opposite.",
  ],
};

export function getTypeQualityRubric(typeId: string, difficulty?: string): string {
  const rules = TYPE_QUALITY_RUBRICS[typeId];
  if (!rules?.length) return "";

  const difficultyRule =
    difficulty === "KILLER"
      ? "- Treat KILLER as an actual top-tier exam item: subtle, evidence-based, and resistant to shortcut guessing."
      : difficulty === "BASIC"
        ? "- Keep the item direct and clearly grounded in the passage, without artificial trickiness."
        : "- Require a real passage-based inference while keeping the evidence reasonably accessible.";

  return [
    "## Type-specific quality bar",
    difficultyRule,
    ...rules.map((rule) => `- ${rule}`),
  ].join("\n");
}

export function buildQuestionTargetCandidateBlock(typeId: string, passage: string): string {
  if (typeId !== "REFERENCE") return "";

  const candidates = findReferenceCandidates(passage).slice(0, 12);
  if (candidates.length === 0) {
    return [
      "## Valid REFERENCE target candidates",
      "- No safe standalone pronoun candidates were detected. Do not invent a pronoun location.",
    ].join("\n");
  }

  return [
    "## Valid REFERENCE target candidates",
    "- You must choose exactly one candidate from this list.",
    "- Copy underlinedPronoun and surroundingText verbatim from the chosen candidate.",
    "- The explanation and options must refer to the same sentence/window as the chosen candidate.",
    ...candidates.map((candidate, index) => (
      `${index + 1}. underlinedPronoun="${candidate.pronoun}" | surroundingText="${candidate.surroundingText}"`
    )),
  ].join("\n");
}

export function validateQuestionQuality({
  typeId,
  question,
  passage,
  requestedDifficulty,
}: ValidateQuestionQualityInput): QuestionQualityIssue[] {
  const issues: QuestionQualityIssue[] = [];
  const add = (severity: QuestionQualitySeverity, code: string, message: string) => {
    issues.push({ severity, code, message });
  };

  if (requestedDifficulty && question.difficulty && question.difficulty !== requestedDifficulty) {
    add("warning", "difficulty-mismatch", `Expected ${requestedDifficulty}, got ${question.difficulty}.`);
  }

  validateOptions(question, typeId, add);
  validateMarkedText(question, add);
  validateTypeSpecific(question, typeId, passage, add);

  if (requestedDifficulty === "KILLER") {
    validateKillerBar(question, typeId, add);
  }

  return issues;
}

function findReferenceCandidates(passage: string): Array<{ pronoun: string; surroundingText: string }> {
  const candidates: Array<{ pronoun: string; surroundingText: string }> = [];
  const pronounRegex = /\b(it|its|they|them|their|this|that|these|those|he|him|his|she|her|we|us|our|one|ones)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = pronounRegex.exec(passage))) {
    const pronoun = match[0];
    const surroundingText = buildSurroundingWindow(passage, match.index, pronoun.length);
    if (surroundingText) {
      candidates.push({ pronoun, surroundingText });
    }
  }

  return candidates;
}

function buildSurroundingWindow(passage: string, index: number, length: number): string {
  const targetLength = 70;
  let start = Math.max(0, index - Math.floor((targetLength - length) / 2));
  let end = Math.min(passage.length, start + targetLength);

  if (end - start < targetLength) {
    start = Math.max(0, end - targetLength);
  }

  while (start > 0 && /\S/.test(passage[start - 1] ?? "") && /\S/.test(passage[start] ?? "")) {
    start++;
  }
  while (end < passage.length && /\S/.test(passage[end - 1] ?? "") && /\S/.test(passage[end] ?? "")) {
    end--;
  }

  const window = passage.slice(start, end).replace(/\s+/g, " ").trim();
  return window.length >= 35 ? window : passage.slice(Math.max(0, index - 20), Math.min(passage.length, index + length + 20)).trim();
}

function validateOptions(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (!options.length) return;

  if (MC_TYPE_IDS.has(typeId) && options.length !== 5) {
    add("error", "option-count", `Expected 5 options, got ${options.length}.`);
  }

  const normalizedLabels = options.map((opt) => normalizeLabel(opt?.label));
  const duplicateLabel = findDuplicate(normalizedLabels.filter(Boolean));
  if (duplicateLabel) {
    add("error", "duplicate-option-label", `Duplicate option label: ${duplicateLabel}.`);
  }

  const normalizedTexts = options.map((opt) => normalizeText(opt?.text));
  const duplicateText = findDuplicate(normalizedTexts.filter(Boolean));
  if (duplicateText) {
    add("error", "duplicate-option-text", "Two or more options have the same text.");
  }

  if (options.some((opt) => !normalizeText(opt?.text))) {
    add("error", "empty-option-text", "One or more options are empty.");
  }

  const correctAnswer = normalizeText(question.correctAnswer);
  if (correctAnswer) {
    const matchesOption = options.some((opt) => {
      const label = normalizeLabel(opt?.label);
      const text = normalizeText(opt?.text);
      return correctAnswer === label || correctAnswer === text || normalizeLabel(correctAnswer) === label;
    });
    if (!matchesOption) {
      add("error", "correct-answer-mismatch", "correctAnswer does not match any option label or text.");
    }
  }

  const wrongExplanations = question.wrongOptionExplanations;
  if (question.difficulty === "KILLER" && wrongExplanations && typeof wrongExplanations === "object") {
    const explanationCount = Object.values(wrongExplanations as Record<string, unknown>).filter((value) => normalizeText(value)).length;
    if (explanationCount < Math.max(0, options.length - 1)) {
      add("warning", "thin-wrong-option-explanations", "KILLER item should explain every wrong option.");
    }
  }
}

function validateMarkedText(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markerFields = [
    "passageWithUnderline",
    "passageWithMarkers",
    "passageWithBlank",
    "passageWithNumbers",
  ];

  for (const field of markerFields) {
    const value = question[field];
    if (typeof value !== "string") continue;

    for (const marker of findMarkers(value)) {
      if (!hasMarkerTokenBoundaries(value, marker.start, marker.end)) {
        add("error", "mid-word-marker", `${field} contains a marker inside a word: ${marker.inner}`);
      }
    }
  }
}

function validateTypeSpecific(
  question: Record<string, unknown>,
  typeId: string,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  if (SHORT_TARGET_TYPES.has(typeId)) {
    const targets = getTargetExpressions(question, typeId);
    for (const target of targets) {
      if (typeId !== "REFERENCE" && isTinyFunctionWord(target)) {
        add("warning", "weak-target-word", `${typeId} uses a very short target word: ${target}.`);
      }
      if (passage && isSingleEnglishToken(target) && !containsStandaloneToken(passage, target)) {
        add("error", "target-not-standalone", `Target is not a standalone token in the passage: ${target}.`);
      }
    }
  }

  if (typeId === "WORD_ORDER" && Array.isArray(question.scrambledWords)) {
    if (question.scrambledWords.some((part: unknown) => typeof part === "string" && /^[^\wA-Za-z]+$/.test(part.trim()))) {
      add("error", "punctuation-only-chunk", "WORD_ORDER has a punctuation-only chunk.");
    }

    const scrambled = question.scrambledWords.map((part: unknown) => normalizeText(part)).join(" ");
    if (normalizeText(question.modelAnswer) && scrambled === normalizeText(question.modelAnswer)) {
      add("error", "scrambled-already-solved", "scrambledWords are already in answer order.");
    }
  }

  if ((typeId === "CONDITIONAL_WRITING" || typeId === "SENTENCE_TRANSFORM") && Array.isArray(question.conditions)) {
    if (question.difficulty === "KILLER" && question.conditions.length < 2) {
      add("warning", "killer-needs-multiple-conditions", `${typeId} KILLER should require at least two conditions.`);
    }
  }

  if (typeId === "SUMMARY_COMPLETE" && Array.isArray(question.blanks)) {
    const answers = question.blanks.filter(isRecord).map((blank) => normalizeText(blank.answer)).filter(Boolean);
    if (findDuplicate(answers)) {
      add("warning", "duplicate-summary-answer", "SUMMARY_COMPLETE repeats the same blank answer.");
    }
  }
}

function validateKillerBar(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const explanation = normalizeText(question.explanation);
  if (explanation.length < 80) {
    add("warning", "thin-killer-explanation", "KILLER explanation is too short to justify a high-difficulty item.");
  }

  const keyPoints = Array.isArray(question.keyPoints)
    ? question.keyPoints.map((point: unknown) => normalizeText(point)).filter(Boolean)
    : [];
  if (keyPoints.length < 3) {
    add("warning", "few-key-points", "KILLER item should include at least three keyPoints.");
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (OPTION_HEAVY_TYPES.has(typeId) && options.length === 5) {
    const optionLengths = options.map((opt) => normalizeText(opt?.text).length).filter((len) => len > 0);
    const averageLength = optionLengths.reduce((sum, len) => sum + len, 0) / optionLengths.length;
    const shortest = Math.min(...optionLengths);
    const longest = Math.max(...optionLengths);

    if (averageLength < 8) {
      add("warning", "shallow-killer-options", `${typeId} options are very short for a KILLER item.`);
    }
    if (longest >= shortest * 3 && longest - shortest > 18) {
      add("warning", "option-length-giveaway", `${typeId} option lengths are imbalanced enough to create a test-taking shortcut.`);
    }
  }
}

function getTargetExpressions(question: Record<string, unknown>, typeId: string): string[] {
  if (typeId === "REFERENCE") return [normalizeText(question.underlinedPronoun)].filter(Boolean);
  if (typeId === "CONTEXT_MEANING") return [normalizeText(question.underlinedWord)].filter(Boolean);
  if (typeId === "VOCAB_CHOICE" || typeId === "ANTONYM") {
    const marked = Array.isArray(question.markedWords) ? question.markedWords.filter(isRecord) : [];
    return marked
      .map((word) => normalizeText(word.word) || normalizeText(word.originalWord) || normalizeText(word.substituteWord))
      .filter(Boolean);
  }
  return [];
}

function findMarkers(text: string): Array<{ start: number; end: number; inner: string }> {
  const markers: Array<{ start: number; end: number; inner: string }> = [];
  const regex = /__([^_]+)__/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    markers.push({
      start: match.index,
      end: match.index + match[0].length,
      inner: match[1],
    });
  }
  return markers;
}

function hasMarkerTokenBoundaries(text: string, start: number, end: number): boolean {
  return !isWordChar(text[start - 1]) && !isWordChar(text[end]);
}

function containsStandaloneToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function isTinyFunctionWord(value: string): boolean {
  return /^(a|an|the|it|its|is|are|was|were|be|been|in|on|at|to|of|for|as|by|or|and|but)$/i.test(value.trim());
}

function isSingleEnglishToken(value: string): boolean {
  return /^[A-Za-z][A-Za-z'-]*$/.test(value.trim());
}

function isWordChar(value: string | undefined): boolean {
  return !!value && /[A-Za-z0-9_]/.test(value);
}

function normalizeLabel(value: unknown): string {
  const text = normalizeText(value);
  const circledMap: Record<string, string> = {
    "①": "1",
    "②": "2",
    "③": "3",
    "④": "4",
    "⑤": "5",
  };
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?([A-Ea-e1-5])[\)\].]?\s*$/, "$1")
    .toLowerCase();
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}
