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
    "The irrelevant sentence must share the passage's topic, nearby keywords, and style while breaking the paragraph's logic or focus.",
    "The four non-answer sentences must be copied verbatim from the source passage.",
    "Do not use a random outside fact as the intruder; make it fail by discourse function such as scope, actor, purpose, cause-effect, example/advice, or conclusion shift.",
    "For KILLER, make the sentence tempting by local vocabulary overlap but wrong only after checking its role in the surrounding flow.",
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
  if (typeId === "IRRELEVANT") {
    return buildIrrelevantCandidateBlock(passage);
  }

  if (typeId === "BLANK_INFERENCE") {
    return buildBlankInferenceCandidateBlock(passage);
  }

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

function buildBlankInferenceCandidateBlock(passage: string): string {
  const sentences = splitPassageSentences(passage);
  const negativeCandidates = sentences
    .map((sentence, index) => ({ sentence, index }))
    .filter(({ sentence }) => hasNegationCue(sentence));
  const strongCandidates = negativeCandidates
    .filter(({ sentence }) => isStrongDoubleNegativeSourceSentence(sentence))
    .slice(0, 6);
  const secondaryCandidates = negativeCandidates
    .filter(({ sentence }) => !isStrongDoubleNegativeSourceSentence(sentence))
    .slice(0, 4);

  if (negativeCandidates.length === 0) {
    return [
      "## BLANK_INFERENCE target note",
      "- No obvious source sentence with a negation cue was detected.",
      "- If a double-negative detail setting is active and no suitable sentence exists, prioritize producing a valid normal blank item rather than returning an invalid item.",
    ].join("\n");
  }

  return [
    "## BLANK_INFERENCE negation-aware candidates",
    "- If the double-negative detail setting is active, use Strong candidates before Secondary candidates.",
    "- Keep the visible negation cue outside the blank. Blank a full predicate, causal clause, or contrastive complement, not a single obvious keyword.",
    "- The correct option should itself contain a negative cue such as not, no, never, without, lack, failure, non-, anything but, other than, barrier, obstacle, or enemy.",
    "- Avoid a shallow 'rarely a result of ____' item if the answer is merely reasoning/logic/calculation under a new name.",
    strongCandidates.length ? "Strong candidates:" : "Strong candidates: none detected.",
    ...strongCandidates.map(({ sentence, index }) => {
      const suggestedTarget = getDoubleNegativeSuggestedTarget(sentence);
      return suggestedTarget
        ? `${index + 1}. ${sentence}\n   Suggested originalExpression: "${suggestedTarget}"`
        : `${index + 1}. ${sentence}`;
    }),
    secondaryCandidates.length ? "Secondary candidates, use only if you can still build a real double-negative trap:" : "",
    ...secondaryCandidates.map(({ sentence, index }) => {
      const suggestedTarget = getDoubleNegativeSuggestedTarget(sentence);
      return suggestedTarget
        ? `${index + 1}. ${sentence}\n   Suggested originalExpression: "${suggestedTarget}"`
        : `${index + 1}. ${sentence}`;
    }),
  ].filter(Boolean).join("\n");
}

function buildIrrelevantCandidateBlock(passage: string): string {
  const sentences = splitPassageSentences(passage);
  if (sentences.length < 4) {
    return [
      "## Valid IRRELEVANT source candidates",
      "- Fewer than four source sentences were detected. Do not invent source sentences; copy every non-answer sentence verbatim from the passage.",
    ].join("\n");
  }

  const windowSize = Math.min(5, sentences.length);
  const maxWindows = 4;
  const windowStarts = new Set<number>([0]);
  if (sentences.length > windowSize) {
    windowStarts.add(Math.max(0, sentences.length - windowSize));
    const middle = Math.floor((sentences.length - windowSize) / 2);
    windowStarts.add(Math.max(0, middle));
    windowStarts.add(Math.max(0, middle + 1));
  }

  const windows = [...windowStarts]
    .sort((a, b) => a - b)
    .slice(0, maxWindows)
    .map((start, index) => ({
      label: String.fromCharCode(65 + index),
      start,
      sentences: sentences.slice(start, start + windowSize),
    }));

  return [
    "## Valid IRRELEVANT source windows",
    "- Choose one window below as the source flow.",
    "- In sentences[5], copy exactly four sentences from that window verbatim and replace exactly one sentence with your inserted irrelevant sentence.",
    "- Prefer replacing an inner sentence (②~④) unless an edge sentence creates a stronger discourse trap.",
    "- The inserted sentence must reuse at least two meaningful English content words from the chosen window, including at least one from a neighboring sentence when possible.",
    "- A substantial share of the inserted sentence's meaningful words should come from the chosen window; avoid adding many new concrete nouns.",
    "- The inserted sentence must be wrong by discourse role, not by random topic. Good traps shift scope, actor, purpose, cause/effect, example/advice, or conclusion while keeping the same semantic field.",
    "- Do not import a new setting or field that is absent from the passage just to make the sentence unrelated.",
    "- Prefer a neutral explanatory sentence. Do not use awkward grammar, extreme words, or blunt advice markers as the giveaway.",
    ...windows.flatMap((window) => [
      `Window ${window.label} (source sentence indices ${window.start + 1}-${window.start + window.sentences.length}):`,
      ...window.sentences.map((sentence, sentenceIndex) => `  ${sentenceIndex + 1}. ${sentence}`),
    ]),
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
  validateTypeSpecific(question, typeId, passage, requestedDifficulty, add);

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
    const explanationValues = Array.isArray(wrongExplanations)
      ? wrongExplanations.map((value) =>
          isRecord(value) ? value.explanation : value,
        )
      : Object.values(wrongExplanations as Record<string, unknown>);
    const explanationCount = explanationValues.filter((value) => normalizeText(value)).length;
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
  requestedDifficulty: string | undefined,
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

  if (typeId === "BLANK_INFERENCE") {
    validateBlankInferenceQuestion(question, passage, requestedDifficulty, add);
  }

  if (typeId === "IRRELEVANT") {
    validateIrrelevantQuestion(question, passage, requestedDifficulty, add);
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

  if (typeId === "GRAMMAR_ERROR") {
    const markedExpressions = Array.isArray(question.markedExpressions)
      ? question.markedExpressions.filter(isRecord)
      : [];
    const passageWithMarkers = normalizeText(question.passageWithMarkers);
    const markerCount = countUnderlineMarkers(passageWithMarkers);
    if (markedExpressions.length !== 5) {
      add("error", "grammar-marker-count", `Expected 5 grammar marked expressions, got ${markedExpressions.length}.`);
    }
    if (passageWithMarkers && markerCount !== 5) {
      add("error", "grammar-render-marker-count", `Expected 5 rendered grammar markers, got ${markerCount}.`);
    }
    for (const markedExpression of markedExpressions) {
      if (markedExpression.isError !== true) continue;
      const expression = normalizeText(markedExpression.expression);
      const correction = normalizeText(markedExpression.correction);
      const errorExpression = normalizeText(markedExpression.errorExpression);
      const combined = `${expression} ${correction} ${errorExpression}`.toLowerCase();
      if (!errorExpression) {
        add("error", "grammar-missing-error-expression", "The grammar error item is missing errorExpression.");
      }
      if (errorExpression && expression && errorExpression === expression) {
        add("error", "grammar-error-not-mutated", "The grammar error surface matches the original expression.");
      }
      if (correction && expression && correction !== expression) {
        add("warning", "grammar-correction-differs-from-source", "The correction differs from the original expression; verify the model did not rewrite acceptable source text.");
      }
      if (/\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/.test(combined)) {
        add("error", "grammar-debatable-infinitive", "Do not use active/passive infinitive preference as the grammar-error target.");
      }
    }
    const grammarExplanationText = [
      question.explanation,
      question.wrongOptionExplanations,
    ]
      .map((value) => JSON.stringify(value ?? ""))
      .join(" ");
    if (
      /전치사(?:\s*\/\s*준동사|\s*\([^)]{0,40}\)|\s*(?:혹은|또는)\s*[^\s'"]{1,20})?\s*['"]?\s*(?:ask|asking|require|requires|spend|spent|developing)\b/i.test(grammarExplanationText) ||
      /\b(?:ask|asking|require|requires|spend|spent|developing)\b\s*(?:은|는|이|가|을|를|도)?\s*전치사/i.test(grammarExplanationText)
    ) {
      add("error", "grammar-category-mislabel", "Grammar explanation mislabels a verb form as a preposition.");
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

function validateBlankInferenceQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  if (question.blankAnswerMode !== "DOUBLE_NEGATIVE") return;

  const originalExpression = normalizeText(question.originalExpression);
  const passageWithBlank = normalizeText(question.passageWithBlank);
  const blankCarrierText = extractBlankCarrierText(passageWithBlank);
  const correctLabel = normalizeLabel(question.correctAnswer);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctOption = options.find((option) => normalizeLabel(option.label) === correctLabel);
  const correctText = normalizeText(correctOption?.text);

  if (!correctText) {
    add("error", "double-negative-missing-answer", "DOUBLE_NEGATIVE blank is missing a correct option text.");
    return;
  }

  if (originalExpression && normalizeComparableText(correctText) === normalizeComparableText(originalExpression)) {
    add(
      "error",
      "double-negative-answer-not-transformed",
      "DOUBLE_NEGATIVE blank must use a transformed correct option, not the verbatim originalExpression.",
    );
  }

  if (/\b(?:but because|but whether|rather|instead)\b/i.test(originalExpression)) {
    add(
      "error",
      "double-negative-crosses-contrast",
      "DOUBLE_NEGATIVE blank must not swallow the passage's contrast marker; keep but/rather/instead structure visible.",
    );
  }

  if (requestedDifficulty === "KILLER" && countContentTokens(originalExpression) < 2) {
    add(
      "error",
      "double-negative-target-too-small",
      "KILLER DOUBLE_NEGATIVE blank should target a meaningful phrase or clause, not a single obvious keyword.",
    );
  }

  if (!hasNegationCue(blankCarrierText)) {
    add(
      "error",
      "double-negative-no-sentence-negation",
      "DOUBLE_NEGATIVE blank must leave a visible negation cue in the blanked sentence.",
    );
  }

  if (!hasNegationCue(correctText)) {
    add(
      "error",
      "double-negative-no-option-negation",
      "DOUBLE_NEGATIVE blank correct option must contain a negation cue or negative expression.",
    );
  }

  const awkwardCorrectPhrase = findAwkwardBlankOptionPhrase(correctText);
  if (awkwardCorrectPhrase) {
    add(
      "error",
      "double-negative-awkward-correct-option",
      `DOUBLE_NEGATIVE correct option contains an awkward or non-CSAT-like phrase: ${awkwardCorrectPhrase}.`,
    );
  }

  for (const option of options) {
    const optionText = normalizeText(option.text);
    const awkwardOptionPhrase = findAwkwardBlankOptionPhrase(optionText);
    if (awkwardOptionPhrase) {
      add(
        "error",
        "double-negative-awkward-option",
        `DOUBLE_NEGATIVE option contains an awkward or non-CSAT-like phrase: ${awkwardOptionPhrase}.`,
      );
      break;
    }
    const oddCapital = findOddCapitalizedOptionToken(optionText);
    if (oddCapital) {
      add(
        "error",
        "double-negative-option-capitalization",
        `DOUBLE_NEGATIVE option contains unexpected capitalization: ${oddCapital}.`,
      );
      break;
    }
  }

  if (hasOnlyWeakNegationCue(blankCarrierText) && countContentTokens(originalExpression) < 3) {
    add(
      "error",
      "double-negative-weak-rarely-slot",
      "Avoid shallow weak-negation blanks such as rarely + a single positive concept; choose a stronger negation structure.",
    );
  }

  if (/\b(?:such as|including|for example)\s+_____/.test(blankCarrierText)) {
    add(
      "error",
      "double-negative-example-list-slot",
      "Avoid example-list blanks in DOUBLE_NEGATIVE mode; choose a logical clause or predicate where negation changes the inference.",
    );
  }

  if (requiresCompleteClauseAfterConnector(blankCarrierText) && startsWithoutClauseSubject(correctText)) {
    add(
      "error",
      "double-negative-clause-missing-subject",
      "Options after since/because/that must be complete clauses with an explicit subject.",
    );
  }

  if (/\bbecause\s+_____/.test(blankCarrierText) && /^(?:without|by|not by)\b/i.test(correctText)) {
    add(
      "error",
      "double-negative-because-phrase-slot",
      "A because-blank needs a clause, not a bare prepositional or without-phrase.",
    );
  }

  if (passage) {
    const attractiveWrongCount = countAttractiveBlankWrongOptions(options, correctLabel, passage, correctText);
    if (attractiveWrongCount < 3) {
      add(
        "error",
        "double-negative-weak-distractors",
        "DOUBLE_NEGATIVE blank should have at least three wrong options with passage-keyword, semantic, or polarity overlap.",
      );
    }
  }

  const answerLogic = normalizeText(question.answerLogic);
  if (answerLogic.length < 20) {
    add(
      "warning",
      "double-negative-thin-logic",
      "DOUBLE_NEGATIVE blank should include answerLogic explaining the negation trap.",
    );
  }
}

function countAttractiveBlankWrongOptions(
  options: Record<string, unknown>[],
  correctLabel: string,
  passage: string,
  correctText: string,
): number {
  const passageTokens = contentTokens(passage);
  const correctTokens = contentTokens(correctText);
  return options
    .filter((option) => normalizeLabel(option.label) !== correctLabel)
    .filter((option) => {
      const text = normalizeText(option.text);
      const tokens = contentTokens(text);
      const passageOverlap = countTokenOverlap(tokens, passageTokens);
      const correctOverlap = countTokenOverlap(tokens, correctTokens);
      return (
        passageOverlap >= 2 ||
        correctOverlap >= 1 ||
        (hasNegationCue(text) && passageOverlap >= 1)
      );
    }).length;
}

function validateIrrelevantQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.map((sentence: unknown) => normalizeText(sentence))
    : [];
  if (sentences.length !== 5) {
    add("error", "irrelevant-sentence-count", `Expected exactly 5 numbered sentences, got ${sentences.length}.`);
    return;
  }

  if (sentences.some((sentence) => !sentence)) {
    add("error", "empty-irrelevant-sentence", "IRRELEVANT contains an empty numbered sentence.");
    return;
  }

  const irrelevantIndex = Number(question.irrelevantIndex);
  if (!Number.isInteger(irrelevantIndex) || irrelevantIndex < 0 || irrelevantIndex > 4) {
    add("error", "irrelevant-index-range", "irrelevantIndex must be an integer from 0 to 4.");
    return;
  }

  const expectedAnswer = String(irrelevantIndex + 1);
  if (normalizeLabel(question.correctAnswer) !== expectedAnswer) {
    add(
      "error",
      "irrelevant-answer-index-mismatch",
      `correctAnswer must point to irrelevantIndex ${irrelevantIndex}; expected option ${expectedAnswer}.`,
    );
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionLabels = options.map((option) => normalizeLabel(option.label));
  const expectedLabels = ["1", "2", "3", "4", "5"];
  if (optionLabels.length === 5 && optionLabels.some((label, index) => label !== expectedLabels[index])) {
    add("warning", "irrelevant-option-labels", "IRRELEVANT options should be ordered ①~⑤.");
  }

  if (!passage) return;

  const sourceSentences = sentences.filter((_, index) => index !== irrelevantIndex);
  for (const sourceSentence of sourceSentences) {
    if (!containsComparableSentence(passage, sourceSentence)) {
      add(
        "error",
        "irrelevant-source-not-verbatim",
        `A non-answer sentence is not copied verbatim from the passage: ${sourceSentence.slice(0, 80)}`,
      );
    }
  }

  const insertedSentence = sentences[irrelevantIndex];
  if (containsComparableSentence(passage, insertedSentence)) {
    add(
      "error",
      "irrelevant-answer-from-source",
      "The answer sentence appears verbatim in the original passage; it should be the inserted sentence.",
    );
  }

  const insertedTokens = contentTokens(insertedSentence);
  const sourceTokens = contentTokens(sourceSentences.join(" "));
  const passageTokens = contentTokens(passage);
  const sourceOverlap = countTokenOverlap(insertedTokens, sourceTokens);
  const passageOverlap = countTokenOverlap(insertedTokens, passageTokens);
  const sourceOverlapRatio = sourceOverlap / Math.max(1, insertedTokens.size);
  const adjacentSentences = [
    sentences[irrelevantIndex - 1],
    sentences[irrelevantIndex + 1],
  ].filter((sentence): sentence is string => !!sentence);
  const adjacentOverlap = countTokenOverlap(
    insertedTokens,
    contentTokens(adjacentSentences.join(" ")),
  );

  if (passageOverlap < 2 || sourceOverlap < 2) {
    add(
      "error",
      "irrelevant-too-unrelated",
      "The inserted sentence has too little lexical overlap with the passage/source flow and will read as an obvious unrelated sentence.",
    );
  }

  if (requestedDifficulty === "KILLER" && sourceOverlapRatio < 0.18) {
    add(
      "error",
      "irrelevant-too-many-new-terms",
      "The inserted sentence introduces too many new meaningful terms instead of staying close to the source flow.",
    );
  } else if (requestedDifficulty === "KILLER" && sourceOverlapRatio < 0.25) {
    add(
      "warning",
      "irrelevant-new-term-heavy",
      "The inserted sentence is somewhat heavy on new terms; prefer more source-window vocabulary.",
    );
  }

  if (requestedDifficulty === "KILLER" && adjacentOverlap < 1) {
    add(
      "warning",
      "irrelevant-weak-local-trap",
      "KILLER IRRELEVANT should share at least one meaningful keyword with a neighboring sentence.",
    );
  }

  const averageSourceLength =
    sourceSentences.reduce((sum, sentence) => sum + sentence.length, 0) /
    Math.max(1, sourceSentences.length);
  if (
    averageSourceLength > 0 &&
    (insertedSentence.length < averageSourceLength * 0.45 ||
      insertedSentence.length > averageSourceLength * 1.8)
  ) {
    add(
      "warning",
      "irrelevant-style-length-mismatch",
      "The inserted sentence length is noticeably different from the source sentences.",
    );
  }

  if (requestedDifficulty === "KILLER") {
    if (/\ballow(?:s|ed|ing)?\s+\w+\s+to\s+active\b/i.test(insertedSentence)) {
      add(
        "error",
        "irrelevant-inserted-ungrammatical",
        "The inserted sentence contains awkward or ungrammatical English.",
      );
    }

    const extremeCue = findNewExtremeCue(insertedSentence, passage);
    if (extremeCue) {
      add(
        "error",
        "irrelevant-obvious-extreme-cue",
        `The inserted sentence uses an obvious extreme cue not present in the passage: ${extremeCue}.`,
      );
    }

    const externalCue = findAbsentExternalSettingCue(insertedSentence, passage);
    if (externalCue) {
      add(
        "error",
        "irrelevant-absent-external-setting",
        `The inserted sentence imports an external setting absent from the passage: ${externalCue}.`,
      );
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

function countUnderlineMarkers(text: string): number {
  return findMarkers(text).length;
}

function hasMarkerTokenBoundaries(text: string, start: number, end: number): boolean {
  return !isWordChar(text[start - 1]) && !isWordChar(text[end]);
}

function containsStandaloneToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function hasNegationCue(text: string): boolean {
  if (!text) return false;
  if (/\b(?:cannot|can't|not|never|no|none|neither|nor|little|few|hardly|rarely|scarcely|seldom|without|fail|fails|failed|failing|failure|lack|lacks|lacking|absence|absent|barrier|obstacle|enemy|unable|impossible|irrational|exclude|excludes|excluding|eliminate|eliminates|eliminating|reject|rejects|rejecting|neglect|neglects|neglecting|collapse|collapses|collapsing|erosion|erode|erodes|eroding|compromise|compromises|compromising|undermine|undermines|undermining)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:non-[a-z]+|nonreason|nonrational)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:anything but|nothing but|other than|free from|not based on|not derived from|not a result of|rather than)\b/i.test(text)) {
    return true;
  }
  return false;
}

function isStrongDoubleNegativeSourceSentence(text: string): boolean {
  if (!text) return false;
  const strongLexicalCue = /\b(?:cannot|can't|can\s+not|not|never|no|none|neither|nor|without|fail|fails|failed|failing|lack|lacks|lacking|not merely|not only)\b/i.test(text);
  if (!strongLexicalCue && /\b(?:such as|including|for example)\b/i.test(text)) {
    return false;
  }
  const hasStrongCue =
    strongLexicalCue ||
    /\b(?:non-[a-z]+|anything but|other than|free from)\b/i.test(text);
  const hasRelationalCue = /\b(?:since|because|that|as|but|rather|rather than|while|whereas|unless|if|when|means?|implies?|suggests?)\b/i.test(text);
  return hasStrongCue && hasRelationalCue;
}

function getDoubleNegativeSuggestedTarget(sentence: string): string | null {
  const patterns = [
    /\bdoes\s+not\s+mean\s+that\s+(.+?)(?:;|,\s*rather|[.!?]|$)/i,
    /\bdo\s+not\s+mean\s+that\s+(.+?)(?:;|,\s*rather|[.!?]|$)/i,
    /\bnot\s+because\s+(.+?),\s+but\s+because\b/i,
    /\bnot\s+whether\s+.+?,\s+but\s+(.+?)(?:[.!?]|$)/i,
    /\b(?:since|because|as)\s+(.+?)(?:,\s+but\b|;|[.!?]|$)/i,
    /\bnot\s+merely\s+(.+?)(?:;|,|[.!?]|$)/i,
    /\bnot\s+only\s+.+?,\s+but\s+also\s+(.+?)(?:[.!?]|$)/i,
    /\bwithout\s+(.+?)(?:[.!?]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    const target = normalizeSuggestedTarget(match?.[1] ?? "");
    if (target && countContentTokens(target) >= 2) return target;
  }

  return null;
}

function normalizeSuggestedTarget(value: string): string {
  return value
    .replace(/^that\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[;:,.!?]+$/g, "")
    .trim();
}

function hasOnlyWeakNegationCue(text: string): boolean {
  if (!hasNegationCue(text)) return false;
  return (
    /\b(?:little|few|hardly|rarely|scarcely)\b/i.test(text) &&
    !isStrongDoubleNegativeSourceSentence(text)
  );
}

function extractBlankCarrierText(passageWithBlank: string): string {
  const blankIndex = passageWithBlank.indexOf("_____");
  if (blankIndex < 0) return passageWithBlank;

  const leftBoundary = Math.max(
    passageWithBlank.lastIndexOf(".", blankIndex - 1),
    passageWithBlank.lastIndexOf("!", blankIndex - 1),
    passageWithBlank.lastIndexOf("?", blankIndex - 1),
  );
  const rightPeriod = passageWithBlank.indexOf(".", blankIndex);
  const rightExclamation = passageWithBlank.indexOf("!", blankIndex);
  const rightQuestion = passageWithBlank.indexOf("?", blankIndex);
  const rightCandidates = [rightPeriod, rightExclamation, rightQuestion]
    .filter((index) => index >= 0);
  const rightBoundary = rightCandidates.length
    ? Math.min(...rightCandidates)
    : passageWithBlank.length;

  return passageWithBlank
    .slice(leftBoundary + 1, rightBoundary + 1)
    .replace(/\s+/g, " ")
    .trim();
}

function requiresCompleteClauseAfterConnector(blankCarrierText: string): boolean {
  return /\b(?:since|because|that)\s+_____/.test(blankCarrierText);
}

function startsWithoutClauseSubject(text: string): boolean {
  return /^(?:cannot|can't|can\s+not|can|could|should|would|will|must|may|might|do|does|did|is|are|was|were|be|being|been|has|have|had|fail|fails|failed|failing)\b/i.test(text.trim());
}

function findAwkwardBlankOptionPhrase(text: string): string | null {
  const patterns = [
    "rational tool",
    "rational tools",
    "cognitive preference",
    "cognitive preferences",
    "impulsive desire",
    "impulsive desires",
    "ultimate emotional foundation",
    "emotional distractions",
    "intellectual choices",
    "lack of erosion",
    "absence of erosion",
    "that lack of",
    "which lack of",
  ];
  const normalized = text.toLowerCase();
  return patterns.find((pattern) => normalized.includes(pattern)) ?? null;
}

function findOddCapitalizedOptionToken(text: string): string | null {
  const matches = text.matchAll(/\b[A-Z][a-z]{2,}\b/g);
  for (const match of matches) {
    if (match.index === 0) continue;
    return match[0];
  }
  return null;
}

function countContentTokens(text: string): number {
  return contentTokens(text).size;
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

function splitPassageSentences(passage: string): string[] {
  return (passage.match(/[^.!?]+(?:[.!?]+["')\]]*)?/g) ?? [])
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 20);
}

function containsComparableSentence(passage: string, sentence: string): boolean {
  const comparablePassage = normalizeComparableText(passage);
  const comparableSentence = normalizeComparableText(sentence).replace(/[.!?]+$/, "");
  return comparableSentence.length >= 20 && comparablePassage.includes(comparableSentence);
}

function normalizeComparableText(value: string): string {
  return value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const IRRELEVANT_TOKEN_STOPWORDS = new Set([
  "about",
  "above",
  "across",
  "after",
  "again",
  "against",
  "also",
  "although",
  "among",
  "because",
  "before",
  "being",
  "between",
  "could",
  "during",
  "every",
  "from",
  "have",
  "into",
  "more",
  "most",
  "only",
  "other",
  "same",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "using",
  "when",
  "where",
  "which",
  "while",
  "with",
  "within",
  "without",
  "would",
]);

function contentTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g) ?? [];
  const content = new Set<string>();
  for (const token of tokens) {
    if (IRRELEVANT_TOKEN_STOPWORDS.has(token)) continue;
    content.add(token);
    for (const part of token.split("-")) {
      if (part.length > 3 && !IRRELEVANT_TOKEN_STOPWORDS.has(part)) content.add(part);
    }
    const stem = lightStemContentToken(token);
    if (stem !== token && !IRRELEVANT_TOKEN_STOPWORDS.has(stem)) content.add(stem);
  }
  return content;
}

function countTokenOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function findNewExtremeCue(sentence: string, passage: string): string | null {
  const cues = ["always", "never", "everyone", "everybody", "completely", "entirely"];
  for (const cue of cues) {
    if (containsStandaloneToken(sentence, cue) && !containsStandaloneToken(passage, cue)) {
      return cue;
    }
  }
  return null;
}

function findAbsentExternalSettingCue(sentence: string, passage: string): string | null {
  const cues = [
    "advertising",
    "advertisement",
    "application",
    "apps",
    "class",
    "classes",
    "device",
    "devices",
    "digital",
    "photo",
    "photos",
    "restaurant",
    "restaurants",
    "school",
    "shopping",
    "software",
    "sports",
    "technologies",
    "technology",
    "traffic",
    "vehicle",
    "vehicles",
    "weather",
  ];
  for (const cue of cues) {
    if (containsStandaloneToken(sentence, cue) && !containsStandaloneToken(passage, cue)) {
      return cue;
    }
  }
  return null;
}

function lightStemContentToken(token: string): string {
  if (token.length > 7 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 6 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 6 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 5 && token.endsWith("s")) return token.slice(0, -1);
  return token;
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
