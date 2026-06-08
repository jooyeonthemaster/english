import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";
import { splitPassageSentences as splitSharedPassageSentences } from "@/lib/passage-sentence-utils";
import { sentenceInsertOptionMarkerIndex } from "@/lib/sentence-insert-options";

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
  grammarMarkerCount?: number;
  grammarAnswerCount?: number;
  grammarCorrectionErrorCount?: number;
  /** Legacy name; interpreted as grammarMarkerCount. */
  grammarErrorCount?: number;
}

const IRRELEVANT_SLOT_MIN = 5;
const GRAMMAR_MARKER_COUNT_MIN = 5;
const GRAMMAR_MARKER_COUNT_MAX = 10;
const GRAMMAR_CORRECTION_ERROR_COUNT_MIN = 1;
const GRAMMAR_CORRECTION_ERROR_COUNT_MAX = 5;
const VOCAB_CHOICE_MARKER_COUNT = 5;
const VOCAB_CHOICE_KEYS = ["a", "b", "c", "d", "e"] as const;
const ANTONYM_MARKER_COUNT = 5;
const ANTONYM_KEYS = ["A", "B", "C", "D", "E"] as const;

function normalizeGrammarMarkedCount(markedCount: unknown): number {
  const n = typeof markedCount === "number" ? markedCount : Number(markedCount);
  if (!Number.isFinite(n)) return GRAMMAR_MARKER_COUNT_MIN;
  return Math.min(
    GRAMMAR_MARKER_COUNT_MAX,
    Math.max(GRAMMAR_MARKER_COUNT_MIN, Math.round(n)),
  );
}

function normalizeGrammarAnswerCount(answerCount: unknown, markedCount: number): number {
  const n = typeof answerCount === "number" ? answerCount : Number(answerCount);
  const max = Math.max(1, markedCount);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, Math.round(n)));
}

const MC_TYPE_IDS = new Set([
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
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
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IMPLIED_MEANING",
  "REFERENCE",
]);

const TYPE_QUALITY_RUBRICS: Record<string, string[]> = {
  BLANK_INFERENCE: [
    "Choose a blank that controls the paragraph logic, not a removable adjective or a local detail.",
    "All five options must fit the same grammatical slot; distractors should be plausible but fail the author's logic.",
    "If the sentence after the blank begins with a conclusion signal such as therefore, thus, for this reason, or by adopting this strategy, the correct answer must directly support that adjacent conclusion.",
    "Avoid result-declaration or over-absolute answers such as no disruption, unlimited imports, complete independence, or guarantee major crops unless the passage explicitly warrants that strength.",
    "For KILLER, the answer should require connecting at least two sentences or a concession/cause-effect relation.",
  ],
  GRAMMAR_ERROR: [
    "Mark 5-10 real expressions from the original passage. Detailed settings control both marked-position count and the exact answer count, including the case where every label is an answer.",
    "The error must test a meaningful grammar point such as agreement, parallelism, modification, tense/aspect, reference, or verb form.",
    "Every non-error marked expression must still be a defensible grammar judgment point with a clear explanation, not padding.",
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
    "The given sentence must carry at least one explicit cohesive cue (demonstrative/pronoun anaphora, definite-article old information, a directional connective, or a temporal/causal link). A self-contained 'neutral' sentence that fits anywhere yields multiple answers and must be rejected.",
    "The correct gap is decided by asymmetry: at the answer it closes BOTH the link to the preceding sentence and the link to the following sentence, while every other gap breaks at least one link (and inserting there splits two originally adjacent sentences).",
    "Referent uniqueness: the cue's antecedent must exist only just before the correct gap; if a demonstrative/the-noun could resolve at two or more gaps the item has multiple answers.",
    "Place the answer in the middle (②③④), not at the first or last gap, and keep the given sentence's length/register/abstraction homogeneous with the passage so position cannot be back-traced from style.",
    "Each of the four distractor gaps must have one tempting clue (e.g. shared keyword, connective surface form) yet fail for a DIFFERENT decisive reason (missing antecedent, broken back-link, mismatched connective logic, undefined the/this). Avoid gaps that are obviously wrong.",
    "For KILLER, weaken and spread surface cues so no single cue forces the answer; converge 2-3 cues on the correct gap while leaving only one cue at each distractor, and raise difficulty through abstract/argumentative passage logic, not through a missing cue.",
  ],
  TOPIC_MAIN_IDEA: [
    "The correct option must paraphrase the whole passage, not repeat a surface keyword.",
    "Distractors should be partial, too broad, too narrow, reversed, or unsupported versions of the passage.",
    "For KILLER, options should be close in wording and differ by scope, causal direction, or author stance.",
  ],
  TOPIC: [
    "The correct option must be an English topic phrase that states the passage's central topic plus controlling viewpoint, not only name the subject matter.",
    "Distractors should be topic-only, example-only, too broad, too narrow, reversed in stance, or focused on a side detail.",
    "For KILLER, every option should sound like a plausible topic until the full passage scope and author stance are checked.",
  ],
  MAIN_IDEA: [
    "The correct option must express the passage's overall point, claim, or conclusion as a complete Korean statement.",
    "Do not write a title-like noun phrase or a mere topic label for a main-idea item.",
    "Distractors should preserve real passage concepts while distorting conclusion, recommendation, cause-effect relation, scope, or stance.",
    "For KILLER, options should differ by subtle logical relation rather than by obvious factual absence.",
  ],
  TITLE: [
    "The title must capture the central tension or outcome of the passage, not only name the topic.",
    "Distractors should sound like valid titles but miss the passage's controlling idea.",
    "For KILLER, avoid giveaway wording; make the title choice depend on the full development of the text.",
  ],
  IMPLIED_MEANING: [
    "Underline a phrase, clause, or short sentence whose meaning is determined by the passage logic, not by dictionary translation.",
    "Treat implied meaning as a main-idea family item: the underline should be a paraphrased, metaphorical, compressed, or conclusion-like expression of the passage's central claim.",
    "Avoid underlining a peripheral local detail even if it has a surface-to-hidden gap; the answer should connect back to the passage's topic/gist/title-level meaning.",
    "Do not use a single vocabulary word, pronoun, or trivial phrase as the target; that belongs to CONTEXT_MEANING or REFERENCE.",
    "Do not underline a rhetorical question or a self-answering question whose answer is stated in the next sentence.",
    "Reject targets whose correct answer is directly paraphrased by the immediately following sentence; there must be a real surface-to-hidden meaning gap.",
    "The correct option must be written in English and paraphrase the implied meaning of the underlined expression, not merely translate its surface wording.",
    "Distractors must borrow real passage concepts and fail by scope, cause-effect, stance, example/generalization, or local-vs-global evidence; avoid absolute-word giveaway distractors.",
    "For KILLER, the answer should require connecting at least two clues before and after the underlined expression, and every distractor should be a near-miss.",
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
  SUMMARY_COMPLETE_MC: [
    "Use the CSAT-style frame: passage, down arrow/summary, then five paired options for (A) and (B).",
    "The summary must be one natural English sentence that abstracts the whole passage; it must not copy a single passage sentence.",
    "After filling the correct pair, the sentence must read as native English; reject awkward bridges such as question of equity to ensuring.",
    "The two blanks should carry distinct core ideas, such as cause/result, problem/solution, contrast/concession, or concept/effect.",
    "Every option must be an English pair with parallel grammar slots. Wrong pairs should be near-misses, not random vocabulary.",
    "Include at least one A-only-correct trap and one B-only-correct trap so students must verify both blanks.",
    "For KILLER, the half-correct traps must be genuinely competitive: pair the correct blankA with the strongest wrong blankB, and pair the correct blankB with the strongest wrong blankA.",
    "For KILLER, do not bury the best trap behind an instantly removable partner. For example, if evolutionarily is correct, genetically should be tested with the correct blankA, not paired with an obviously wrong blankA.",
    "For KILLER, make the correct pair depend on global relation mapping, and make every distractor passage-grounded.",
  ],
  IRRELEVANT: [
    "The irrelevant sentence must share the passage's central topic word, nearby keywords, and style while breaking only the paragraph's discourse function. It must bridge to the sentence right before it (echo a word or open with This/Such/These/However) so it looks connected on a skim.",
    "Every non-answer sentence must be copied verbatim from the source passage; spread the four chosen choices across the whole passage body (not bunched at the top) but keep them in original order.",
    "Apply the remove-and-reconnect test: deleting the answer must leave a seamless paragraph, and deleting any other choice must damage coherence (unique answer). Bias the answer to ②/③/④ and vary it; never ① or ⑤.",
    "Do not use a random outside fact as the intruder; make it fail by discourse function such as evaluation reversal, scope/actor shift, cause-effect swap, example/advice jump, sub-topic drift, or over-generalization.",
    "For BASIC, the intruder may be a clear but still passage-related focus shift; do not make it a completely unrelated topic.",
    "For INTERMEDIATE, prefer a same-topic sentence that shifts the local role, evidence target, or practical focus without using an obvious counterclaim cue.",
    "For KILLER, make the sentence locally cohesive and vocabulary-rich, but wrong only after checking how the surrounding sentences build the claim. Do not use explicit opposition markers, regulation-backlash claims, blunt advice, or a simple direct contradiction of the thesis.",
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
    "Underline a sentence-level or clause-level segment from the source passage; the exact wrong word/form must be hidden inside that wider underline.",
    "Do not underline only the wrong expression itself. The underlined segment must be meaningfully wider than errorPart.",
    "Use underlinedSegments: sourceText is the original correct source segment, displayedText is the same segment with one grammar mutation, and every underlined segment has isError=true.",
    "passageWithUnderline must contain the full passage with the wider underlined segment(s), not a separate error sentence below the passage.",
    "Avoid controversial style edits and low-value targets such as articles, tiny prepositions, spelling, punctuation, or preference-only active/passive infinitives.",
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
    "Use this as a 'wrong antonym pair' item: exactly one word-pair must be incorrectly matched, and the other four must be clean contextual antonym pairs.",
    "Every pair must match part of speech, inflection, and semantic axis; avoid form mismatches such as forces-restrain.",
    "Reject contestable pairs such as force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, or unproductive-passive.",
    "For the incorrect pair, provide correctAntonym so the decisive fix is explicit and not merely a vague explanation.",
    "For KILLER, make the wrong pair a subtle but unambiguous semantic-axis error, not a pair that could be defended as an opposite in another sense.",
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

export function buildQuestionTargetCandidateBlock(
  typeId: string,
  passage: string,
  options: {
    irrelevantSlotCount?: number;
    grammarMarkerCount?: number;
    grammarAnswerCount?: number;
    grammarCorrectionErrorCount?: number;
    /** Legacy name; interpreted as grammarMarkerCount. */
    grammarErrorCount?: number;
    requestedDifficulty?: string;
  } = {},
): string {
  switch (typeId) {
    case "GRAMMAR_ERROR":
      return buildGrammarErrorCandidateBlock(
        passage,
        options.grammarMarkerCount ?? options.grammarErrorCount,
        options.grammarAnswerCount,
        options.requestedDifficulty,
      );
    case "GRAMMAR_CORRECTION":
      return buildGrammarCorrectionCandidateBlock(
        passage,
        options.grammarCorrectionErrorCount,
        options.requestedDifficulty,
      );
    case "IRRELEVANT":
      return buildIrrelevantCandidateBlock(
        passage,
        options.irrelevantSlotCount,
        options.requestedDifficulty,
      );
    case "BLANK_INFERENCE":
      return buildBlankInferenceCandidateBlock(passage);
    case "REFERENCE":
      return buildReferenceCandidateBlock(passage);
    case "IMPLIED_MEANING":
      return buildImpliedMeaningCandidateBlock(
        passage,
        options.requestedDifficulty,
      );
    case "ANTONYM":
      return buildAntonymCandidateBlock(passage, options.requestedDifficulty);
    default:
      return "";
  }
}

type AntonymLexiconEntry = {
  word: string;
  correctAntonym: string;
  suggestedWrongPair: string;
  pos: "adjective" | "adverb" | "noun" | "verb";
  note: string;
  avoidPairs?: string[];
  priority?: number;
};

type AntonymCandidate = AntonymLexiconEntry & {
  sourceWord: string;
  surroundingText: string;
  index: number;
};

const ANTONYM_SAFE_LEXICON: AntonymLexiconEntry[] = [
  { word: "common", correctAntonym: "rare", suggestedWrongPair: "ordinary", pos: "adjective", note: "frequency scale", priority: 9 },
  { word: "rare", correctAntonym: "common", suggestedWrongPair: "unusual", pos: "adjective", note: "frequency scale", priority: 8 },
  { word: "good", correctAntonym: "bad", suggestedWrongPair: "beneficial", pos: "adjective", note: "evaluation scale", priority: 6 },
  { word: "bad", correctAntonym: "good", suggestedWrongPair: "poor", pos: "adjective", note: "evaluation scale", priority: 6 },
  { word: "past", correctAntonym: "future", suggestedWrongPair: "previous", pos: "adjective", note: "time direction", priority: 8 },
  { word: "future", correctAntonym: "past", suggestedWrongPair: "coming", pos: "adjective", note: "time direction", priority: 8 },
  { word: "dim", correctAntonym: "bright", suggestedWrongPair: "dark", pos: "adjective", note: "outlook/brightness scale", avoidPairs: ["clear"], priority: 9 },
  { word: "bright", correctAntonym: "dim", suggestedWrongPair: "clear", pos: "adjective", note: "outlook/brightness scale", priority: 7 },
  { word: "doomed", correctAntonym: "promising", suggestedWrongPair: "fated", pos: "adjective", note: "prospect scale", priority: 7 },
  { word: "everyday", correctAntonym: "extraordinary", suggestedWrongPair: "ordinary", pos: "adjective", note: "ordinariness scale", priority: 6 },
  { word: "unproductive", correctAntonym: "productive", suggestedWrongPair: "ineffective", pos: "adjective", note: "output/effectiveness scale", avoidPairs: ["passive", "uninterested"], priority: 10 },
  { word: "productive", correctAntonym: "unproductive", suggestedWrongPair: "effective", pos: "adjective", note: "output/effectiveness scale", priority: 8 },
  { word: "failing", correctAntonym: "succeeding", suggestedWrongPair: "struggling", pos: "adjective", note: "success/failure scale in matching -ing form", priority: 9 },
  { word: "rational", correctAntonym: "irrational", suggestedWrongPair: "logical", pos: "adjective", note: "reasonableness scale", avoidPairs: ["emotional"], priority: 10 },
  { word: "new", correctAntonym: "old", suggestedWrongPair: "recent", pos: "adjective", note: "age/time scale", priority: 6 },
  { word: "hardest", correctAntonym: "easiest", suggestedWrongPair: "toughest", pos: "adjective", note: "superlative difficulty scale", priority: 9 },
  { word: "easiest", correctAntonym: "hardest", suggestedWrongPair: "simplest", pos: "adjective", note: "superlative difficulty scale", priority: 8 },
  { word: "significant", correctAntonym: "insignificant", suggestedWrongPair: "important", pos: "adjective", note: "importance scale", priority: 7 },
  { word: "easier", correctAntonym: "harder", suggestedWrongPair: "simpler", pos: "adjective", note: "comparative difficulty scale", priority: 8 },
  { word: "harder", correctAntonym: "easier", suggestedWrongPair: "tougher", pos: "adjective", note: "comparative difficulty scale", priority: 8 },
  { word: "present", correctAntonym: "absent", suggestedWrongPair: "available", pos: "adjective", note: "presence/absence scale", priority: 8 },
  { word: "internal", correctAntonym: "external", suggestedWrongPair: "inner", pos: "adjective", note: "inside/outside scale", priority: 7 },
  { word: "true", correctAntonym: "false", suggestedWrongPair: "real", pos: "adjective", note: "truth-value scale", priority: 6 },
  { word: "specific", correctAntonym: "general", suggestedWrongPair: "particular", pos: "adjective", note: "specificity scale", priority: 7 },
  { word: "multiple", correctAntonym: "single", suggestedWrongPair: "several", pos: "adjective", note: "number scale", priority: 6 },
  { word: "heavy", correctAntonym: "light", suggestedWrongPair: "weighty", pos: "adjective", note: "weight scale", priority: 6 },
  { word: "full", correctAntonym: "empty", suggestedWrongPair: "complete", pos: "adjective", note: "capacity scale", priority: 7 },
  { word: "empty", correctAntonym: "full", suggestedWrongPair: "blank", pos: "adjective", note: "capacity scale", priority: 7 },
  { word: "simple", correctAntonym: "complex", suggestedWrongPair: "easy", pos: "adjective", note: "complexity scale", priority: 7 },
  { word: "complex", correctAntonym: "simple", suggestedWrongPair: "complicated", pos: "adjective", note: "complexity scale", priority: 7 },
  { word: "visible", correctAntonym: "invisible", suggestedWrongPair: "noticeable", pos: "adjective", note: "visibility scale", priority: 7 },
  { word: "strong", correctAntonym: "weak", suggestedWrongPair: "powerful", pos: "adjective", note: "strength scale", priority: 7 },
  { word: "weak", correctAntonym: "strong", suggestedWrongPair: "fragile", pos: "adjective", note: "strength scale", priority: 7 },
  { word: "increase", correctAntonym: "decrease", suggestedWrongPair: "raise", pos: "verb", note: "quantity-change scale", priority: 8 },
  { word: "increased", correctAntonym: "decreased", suggestedWrongPair: "raised", pos: "verb", note: "quantity-change scale in matching past form", priority: 8 },
  { word: "increases", correctAntonym: "decreases", suggestedWrongPair: "raises", pos: "verb", note: "quantity-change scale in matching -s form", priority: 8 },
  { word: "expanded", correctAntonym: "contracted", suggestedWrongPair: "enlarged", pos: "verb", note: "size-change scale in matching past form", priority: 8 },
  { word: "strengthened", correctAntonym: "weakened", suggestedWrongPair: "reinforced", pos: "verb", note: "strength-change scale in matching past form", priority: 8 },
  { word: "accepted", correctAntonym: "rejected", suggestedWrongPair: "approved", pos: "verb", note: "acceptance scale in matching past form", priority: 8 },
  { word: "protected", correctAntonym: "exposed", suggestedWrongPair: "guarded", pos: "verb", note: "protection/exposure scale in matching past form", priority: 8 },
  { word: "spent", correctAntonym: "saved", suggestedWrongPair: "paid", pos: "verb", note: "resource-use scale in matching past form", priority: 7 },
  { word: "stay", correctAntonym: "leave", suggestedWrongPair: "remain", pos: "verb", note: "location/continuation scale", priority: 7 },
  { word: "persist", correctAntonym: "quit", suggestedWrongPair: "continue", pos: "verb", note: "continuation scale", priority: 7 },
  { word: "gain", correctAntonym: "lose", suggestedWrongPair: "obtain", pos: "verb", note: "gain/loss scale", priority: 7 },
  { word: "loss", correctAntonym: "gain", suggestedWrongPair: "defeat", pos: "noun", note: "gain/loss noun scale", priority: 6 },
  { word: "defeat", correctAntonym: "victory", suggestedWrongPair: "failure", pos: "noun", note: "outcome scale", priority: 8 },
  { word: "admission", correctAntonym: "denial", suggestedWrongPair: "confession", pos: "noun", note: "acknowledgment scale", priority: 6 },
  { word: "contrast", correctAntonym: "similarity", suggestedWrongPair: "comparison", pos: "noun", note: "relation scale", priority: 6 },
  { word: "often", correctAntonym: "rarely", suggestedWrongPair: "frequently", pos: "adverb", note: "frequency scale", priority: 8 },
];

function buildAntonymCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
): string {
  const candidates = findAntonymCandidates(passage, requestedDifficulty).slice(0, 12);
  const safeCountRule =
    candidates.length >= ANTONYM_MARKER_COUNT
      ? "- Use five marked source words from this safe list whenever possible. At minimum, four of the five markedWords should come from this list."
      : "- Use every relevant safe candidate below first. If fewer than five are available, add your own only when the pair is equally clean and source-backed.";

  const candidateLines = candidates.length
    ? candidates.map((candidate, index) => {
        const avoidPairs = candidate.avoidPairs?.length
          ? ` | forbiddenPairs="${candidate.avoidPairs.join(", ")}"`
          : "";
        return `${index + 1}. sourceWord="${candidate.sourceWord}" | correctAntonym="${candidate.correctAntonym}" | suggestedWrongPair="${candidate.suggestedWrongPair}" | pos="${candidate.pos}" | note="${candidate.note}"${avoidPairs} | surroundingText="${candidate.surroundingText}"`;
      })
    : ["- No high-confidence automatic pair was found. Use only same-POS, same-form, same-axis pairs; do not use relation-only pairs."];

  return [
    "## ANTONYM target planning guardrail",
    safeCountRule,
    "- For the four non-answer options, use correctAntonym exactly as the displayed antonym.",
    "- For the single answer option, choose one safe sourceWord and display its suggestedWrongPair as antonym; still fill correctAntonym with the real correctAntonym.",
    "- Do not invent near-miss pairs when a suggestedWrongPair is available. This prevents vague pairs such as force-restrain or unproductive-passive from appearing.",
    "- Never use both directions of the same pair as separate options, such as good-bad and bad-good in one item.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: make the incorrect pair a close synonym/neighbor on the same semantic field, not a second debatable antonym axis."
      : requestedDifficulty === "BASIC"
        ? "- BASIC calibration: use the clearest pairs from the list and avoid obscure vocabulary."
        : "- INTERMEDIATE calibration: use clean pairs, but make the wrong pair tempting by collocation or nearby meaning.",
    "### Safe source-backed ANTONYM pairs",
    ...candidateLines,
    "### Global forbidden ANTONYM pairs",
    "- force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, unproductive-passive, unproductive-uninterested, paid-refunded",
  ].filter(Boolean).join("\n");
}

function findAntonymCandidates(
  passage: string,
  requestedDifficulty?: string,
): AntonymCandidate[] {
  const seenWords = new Set<string>();
  const seenAxes = new Set<string>();
  const candidates: AntonymCandidate[] = [];

  for (const entry of ANTONYM_SAFE_LEXICON) {
    const match = findStandaloneTokenMatch(passage, entry.word);
    if (!match) continue;

    const wordKey = normalizeComparableText(entry.word);
    const axisKey = [antonymPairKey(entry.word), antonymPairKey(entry.correctAntonym)]
      .filter(Boolean)
      .sort()
      .join("|");
    if (seenWords.has(wordKey) || (axisKey && seenAxes.has(axisKey))) continue;
    seenWords.add(wordKey);
    if (axisKey) seenAxes.add(axisKey);

    candidates.push({
      ...entry,
      sourceWord: match.word,
      surroundingText: buildSurroundingWindow(passage, match.index, match.word.length),
      index: match.index,
    });
  }

  return candidates.sort((a, b) => (
    antonymCandidateScore(b, requestedDifficulty) -
    antonymCandidateScore(a, requestedDifficulty)
  ));
}

function antonymCandidateScore(
  candidate: AntonymCandidate,
  requestedDifficulty?: string,
): number {
  const base = candidate.priority ?? 5;
  const lengthBonus = Math.min(3, Math.floor(candidate.sourceWord.length / 4));
  const killerBonus =
    requestedDifficulty === "KILLER" && /scale|superlative|matching|outlook|reasonableness/i.test(candidate.note)
      ? 2
      : 0;
  const basicPenalty =
    requestedDifficulty === "BASIC" && candidate.sourceWord.length > 12
      ? 2
      : 0;
  return base + lengthBonus + killerBonus - basicPenalty;
}

function findStandaloneTokenMatch(
  text: string,
  token: string,
): { word: string; index: number } | null {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  const match = regex.exec(text);
  if (!match) return null;
  return { word: match[0], index: match.index };
}

function buildGrammarErrorCandidateBlock(
  passage: string,
  requestedMarkerCount = 5,
  requestedAnswerCount = 1,
  requestedDifficulty?: string,
): string {
  const sentences = splitPassageSentences(passage);
  const markedCount = normalizeGrammarMarkedCount(requestedMarkerCount);
  const answerCount = normalizeGrammarAnswerCount(requestedAnswerCount, markedCount);
  const labels = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"]
    .slice(0, markedCount)
    .join(" ");

  return [
    "## GRAMMAR_ERROR target planning guardrail",
    `- The final item must contain ${markedCount} marked expression(s) labeled ${labels}.`,
    `- Exactly ${answerCount} marked expression(s) must be grammatically incorrect.`,
    answerCount >= 2
      ? "- In the direction, do not disclose the answer count; ask students to choose all grammatically incorrect parts using '모두'."
      : "- In the direction, use single-answer wording for one grammatically incorrect part.",
    "- If the requested answer count is lower than the marked count, keep the remaining labels grammatically correct as non-answer decoys. If it equals the marked count, every label must be intentionally incorrect and 오답 분석 can be empty.",
    "- Use the original passage as correct source text. For every answer, mutate only the marked expression and keep the original expression/correction verbatim.",
    "- Prefer high-value grammar decisions: finite vs non-finite verb, subject-verb agreement, modifier active/passive, parallelism, relative/nominal clause choice, pronoun agreement, complement form, comparison structure, and preposition vs conjunction.",
    "- Avoid padding with articles, tiny prepositions, fixed verb-complement patterns, or expressions whose correctness can be judged without reading the sentence.",
    "- If the passage has fewer source sentences than requested marked expressions, you may mark more than one expression in a sentence only when they test clearly different clauses or grammar relations.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: make the wrong forms look locally natural until the full sentence structure is checked; avoid spelling-level or one-word giveaway errors."
      : "",
    sentences.length
      ? "Detected passage sentences for target distribution:"
      : "No reliable sentence split was detected; still choose exact source expressions from the passage.",
    ...sentences.slice(0, 14).map((sentence, index) => `${index + 1}. ${sentence}`),
  ].filter(Boolean).join("\n");
}

function normalizeGrammarCorrectionErrorCount(errorCount: unknown): number {
  const n = typeof errorCount === "number" ? errorCount : Number(errorCount);
  if (!Number.isFinite(n)) return GRAMMAR_CORRECTION_ERROR_COUNT_MIN;
  return Math.min(
    GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
    Math.max(GRAMMAR_CORRECTION_ERROR_COUNT_MIN, Math.round(n)),
  );
}

function buildGrammarCorrectionCandidateBlock(
  passage: string,
  requestedErrorCount?: number,
  requestedDifficulty?: string,
): string {
  const sentences = splitPassageSentences(passage);
  const errorCount = normalizeGrammarCorrectionErrorCount(requestedErrorCount);

  return [
    "## GRAMMAR_CORRECTION target planning guardrail",
    `- Underline exactly ${errorCount} sentence-level or clause-level segment(s) from the original passage. A full sentence is ideal.`,
    `- Every underlined segment must contain a hidden grammar error. The underline count and error count are both ${errorCount}.`,
    "- Do not include grammatically correct extra underlined segments for GRAMMAR_CORRECTION.",
    "- Do NOT underline only the wrong word/form. The underlined sourceText must be wider than errorPart by at least several words.",
    "- sourceText must be an original passage segment. displayedText is sourceText after changing correctedPart into errorPart inside that segment.",
    "- correctAnswer must list every label and correctedPart in order, joined with comma + space. It must not be the full underlined segment.",
    "- correctedParts should list every corrected expression in the same order as underlinedSegments.",
    "- Do NOT print a separate error sentence below the passage. The visible question must show the original passage with the wider underlined segment(s).",
    "- Use wording like \"다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.\"",
    "- Prefer high-value grammar decisions: subject-verb agreement, finite vs non-finite verb, parallelism, modifier active/passive, relative/nominal clause choice, pronoun agreement, complement form, comparison structure, and preposition vs conjunction.",
    "- Avoid padding with articles, tiny prepositions, punctuation, spelling-only changes, optional style improvements, or debatable active/passive infinitive preferences such as to gain vs to be gained.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: use a long enough underlined clause/sentence that students must inspect structure, not just spot a visibly odd token."
      : "",
    sentences.length
      ? "Detected source sentences. Prefer one of these as sourceText:"
      : "No reliable sentence split was detected; still choose an exact sentence/clause segment from the passage.",
    ...sentences.slice(0, 14).map((sentence, index) => `${index + 1}. ${sentence}`),
  ].filter(Boolean).join("\n");
}

function buildReferenceCandidateBlock(passage: string): string {
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

function buildImpliedMeaningCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
): string {
  const sentences = splitPassageSentences(passage);
  const candidates = findImpliedMeaningCandidates(passage).slice(0, 10);

  if (candidates.length === 0) {
    return [
      "## IMPLIED_MEANING target planning guardrail",
      "- No strong automatic candidate was detected, but you may still generate a valid item.",
      "- Choose an exact phrase, clause, or short sentence from the passage whose meaning depends on surrounding logic.",
      "- Do not underline a single vocabulary word, pronoun, function word, or dictionary idiom.",
      "- The answer option must be an English paraphrase of the implied meaning, not a literal translation.",
    ].join("\n");
  }

  return [
    "## IMPLIED_MEANING target candidates",
    "- Prefer one candidate from this list, or choose another exact source span with the same quality.",
    "- Copy underlinedExpression verbatim from the passage and provide surroundingText that contains it.",
    "- The underlinedExpression should be a phrase, clause, or short sentence, not one word.",
    "- Treat this type as TOPIC/TITLE/SUMMARY family: prefer a target that restates the passage's central claim in metaphorical, compressed, unfamiliar, or conclusion-like wording.",
    "- Avoid peripheral local details. A good target should be reducible to the passage's topic/gist/title-level meaning.",
    "- Do not choose a rhetorical question or a sentence whose answer is stated in the immediately following sentence.",
    "- Prefer targets with a visible surface-to-hidden meaning gap: metaphor, conceptual compression, contrast, or a conclusion that must be unpacked.",
    "- The correct option must synthesize the expression's implied meaning from surrounding evidence.",
    "- Distractors must be near-misses anchored in real passage concepts.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: choose a target whose answer requires connecting at least two clues before/after the underline."
      : "",
    ...candidates.map((candidate, index) => (
      `${index + 1}. sentence ${candidate.sentenceIndex + 1}: ${candidate.sentence}\n   Suggested underlinedExpression="${candidate.expression}" | surroundingText="${candidate.surroundingText}"`
    )),
    sentences.length
      ? "Passage sentence map:\n" + sentences.slice(0, 12).map((sentence, index) => `${index + 1}. ${sentence}`).join("\n")
      : "",
  ].filter(Boolean).join("\n");
}

function buildBlankInferenceCandidateBlock(passage: string): string {
  const sentences = splitPassageSentences(passage);
  const candidateSentences = sentences
    .map((sentence, index) => ({ sentence, index }))
    .filter(({ sentence }) => isUsefulNegativeParaphraseSourceSentence(sentence));
  const strongCandidates = candidateSentences
    .filter(({ sentence }) => getNegativeParaphraseSuggestedTargets(sentence).length > 0)
    .slice(0, 8);
  const secondaryCandidates = candidateSentences
    .filter(({ sentence }) => getNegativeParaphraseSuggestedTargets(sentence).length === 0)
    .slice(0, 4);

  if (candidateSentences.length === 0) {
    return [
      "## BLANK_INFERENCE negative-paraphrase target note",
      "- No strong automatic target candidate was detected.",
      "- If the negative-paraphrase detail setting is active, still produce a valid item by choosing a compact central phrase with a logical action or relation.",
      "- The source sentence does not need to contain a negation cue. The correct option must carry the negative/privative paraphrase.",
    ].join("\n");
  }

  return [
    "## BLANK_INFERENCE negative-paraphrase candidates",
    "- If the negative-paraphrase detail setting is active, choose a compact phrase with a real logical action or relation.",
    "- The source sentence does not need an existing negation cue; the correct option must be a non-verbatim negative/privative paraphrase.",
    "- Do not blank a single abstract noun, a colon/comma list, or an example-list slot.",
    "- Every option must fit the same grammatical slot as the originalExpression.",
    strongCandidates.length ? "Strong candidates:" : "Strong candidates: none detected.",
    ...strongCandidates.map(({ sentence, index }) => {
      const suggestedTargets = getNegativeParaphraseSuggestedTargets(sentence).slice(0, 2);
      return suggestedTargets.length
        ? `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${suggestedTargets.map((target) => `"${target}"`).join(", ")}`
        : `${index + 1}. ${sentence}`;
    }),
    secondaryCandidates.length ? "Secondary candidates, use only if you can choose a compact logical phrase:" : "",
    ...secondaryCandidates.map(({ sentence, index }) => {
      const suggestedTargets = getNegativeParaphraseSuggestedTargets(sentence).slice(0, 2);
      return suggestedTargets.length
        ? `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${suggestedTargets.map((target) => `"${target}"`).join(", ")}`
        : `${index + 1}. ${sentence}`;
    }),
  ].filter(Boolean).join("\n");
}

function buildIrrelevantCandidateBlock(
  passage: string,
  requestedSlotCount = 5,
  requestedDifficulty?: string,
): string {
  const sentences = splitPassageSentences(passage, { includeShort: true });
  const slotCount = Math.max(IRRELEVANT_SLOT_MIN, Math.round(requestedSlotCount));
  const minimumSourceSentenceCount = IRRELEVANT_SLOT_MIN - 1;
  const eligibleSentences = sentences.slice(1);
  if (eligibleSentences.length < minimumSourceSentenceCount) {
    return [
      "## Valid IRRELEVANT source candidates",
      `- Fewer than ${minimumSourceSentenceCount} usable source sentences were detected after excluding the original first passage sentence. Do not invent source sentences.`,
    ].join("\n");
  }

  const sourceCount = slotCount - 1; // verbatim originals among the choices
  // Force the answer position to vary across items (the model otherwise always
  // lands on the middle → answer ③/ⓒ every time). Bias toward the center per
  // exam convention but genuinely rotate among ②③④.
  const targetIndex = (() => {
    const r = Math.random();
    return r < 0.34 ? 1 : r < 0.67 ? 2 : 3;
  })();
  const numberedEligible = eligibleSentences.map(
    (sentence, index) => `  [sentence ${index + 2}] ${sentence}`,
  );
  const lastSentenceNumber = eligibleSentences.length + 1;

  return [
    "## IRRELEVANT source sentences — pick the marked choices from here",
    "- Sentence 1 (the very first passage sentence) is the unmarked TOPIC sentence: it defines 소재 and thesis and is the reference point for relevance. Never put it in sentences[]; it stays before the choices as context.",
    `- Choose exactly ${sourceCount} sentences from the list below to be the non-answer choices. Copy each one VERBATIM (no paraphrase, merge, or split) and keep them in their original passage order.`,
    `- DISTRIBUTE the ${sourceCount} chosen sentences across the WHOLE passage body — one near the start, one or two in the middle, and one near the end (e.g. sentences like 2, ${Math.max(3, Math.round(lastSentenceNumber * 0.4))}, ${Math.max(4, Math.round(lastSentenceNumber * 0.7))}, ${lastSentenceNumber}) — so the marked choices are NOT bunched at the top. This matters most for long passages; in a short passage adjacent choices are fine.`,
    "- Write ONE new irrelevant sentence and place it BETWEEN two consecutive original sentences. The remove-and-reconnect test must pass: deleting your sentence must leave those two originals reading as one seamless, logical flow.",
    `- Output sentences[${slotCount}] in passage order: the ${sourceCount} chosen originals plus the inserted sentence at irrelevantIndex (the inserted sentence's two immediate neighbors in sentences[] are the two consecutive originals it was placed between).`,
    `- ⭐ 이번 문항의 정답 위치(고정): irrelevantIndex = ${targetIndex}. 무관문을 정확히 sentences[${targetIndex}]에 넣어 정답이 ${getCircledNumber(targetIndex)}(=${targetIndex + 1}번 선지)가 되게 하세요. 다른 위치를 쓰지 말고, 특히 항상 가운데(③)로 두지 마세요. 첫·마지막 표시 문장은 절대 금지.`,
    `- wrongOptionExplanations must include exactly ${sourceCount} entries, one for every non-answer choice.`,
    "- The inserted sentence must reuse at least two meaningful English content words from its neighbors and stay in the passage's semantic field; do not import a new setting, field, or many new concrete nouns.",
    "- It must be wrong by DISCOURSE FUNCTION (관점/평가 역전, 인과 방향 뒤집기, 범위/주어 이동, 예시→처방 전환, 하위 주제 드리프트, 과잉 일반화), not by an obviously new topic. Keep it native, neutral, and the same length/register as the source sentences; no extreme words, no blunt advice markers, no awkward grammar as the giveaway.",
    ...buildIrrelevantDifficultyGuidance(requestedDifficulty),
    `### Passage sentences (choose ${sourceCount} of these, spread out):`,
    ...numberedEligible,
  ].join("\n");
}

function buildIrrelevantDifficultyGuidance(requestedDifficulty?: string): string[] {
  if (requestedDifficulty === "KILLER") {
    return [
      "## IRRELEVANT difficulty calibration: KILLER",
      "- Treat the current 'clear counterclaim' style as too easy. The inserted sentence must look locally acceptable on a skim.",
      "- Do NOT use giveaway opposition cues such as however, instead, rather than, might hinder, limiting academic freedom, aggressive regulations, or a simple anti-thesis statement.",
      "- Do NOT use prescriptive research-policy sentences such as researchers should prioritize their own interests, secure intellectual property rights, build sponsor partnerships, or protect academic freedom unless that exact focus already exists in the source window.",
      "- Do NOT make the intruder a recommendation to encourage researchers, build sponsor relationships, or develop stable relationships with sponsors. That is an easy advice/policy detour, not a KILLER trap.",
      "- Build the trap as ONE of these subtle shifts: an evaluation/stance reversal (positively reframe what the passage criticizes, or criticize what it praises), an actor/scope shift (this case → people in general, or this subject → a different one), a cause/effect-target swap, or a local example reframed as a general claim.",
      "- ⛔ Do NOT drift into how to MEASURE / optimize / calculate / quantify / standardize / build / develop / study the topic (procedure, evidence method, laboratory, equipment, tooling, data). Such sentences are auto-rejected. Stay a descriptive sentence about the same idea whose logic direction is wrong.",
      "- Reuse at least three meaningful content words from the chosen window, including at least one from the immediately previous or next sentence.",
      "- Keep sentence length, modality, abstraction level, and explanatory tone close to neighboring source sentences.",
      "- The sentence should become clearly removable only when the reader checks both adjacent sentences and the paragraph's conclusion.",
    ];
  }

  if (requestedDifficulty === "INTERMEDIATE") {
    return [
      "## IRRELEVANT difficulty calibration: INTERMEDIATE",
      "- This should be the default usable exam level: same topic and keywords, but a clear local focus shift.",
      "- Avoid random outside topics and avoid overly blunt advice. A mild counter-direction is acceptable only if it is not exposed by one giveaway word.",
      "- Prefer traps that borrow the passage's terms but reverse its evaluation/stance or shift its scope/actor. Do NOT drift into a measurement/procedure/administrative/tooling detail (those are auto-rejected).",
    ];
  }

  return [
    "## IRRELEVANT difficulty calibration: BASIC",
    "- Keep it readable and fair: the sentence should be passage-related but clearly off-flow after one careful read.",
    "- It may be easier than INTERMEDIATE, but it must still share the source topic and at least two meaningful keywords.",
  ];
}

export function validateQuestionQuality({
  typeId,
  question,
  passage,
  requestedDifficulty,
  grammarMarkerCount,
  grammarAnswerCount,
  grammarCorrectionErrorCount,
  grammarErrorCount,
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
  validateTypeSpecific(
    question,
    typeId,
    passage,
    requestedDifficulty,
    grammarMarkerCount ?? grammarErrorCount,
    grammarAnswerCount,
    grammarCorrectionErrorCount,
    add,
  );

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

function findImpliedMeaningCandidates(
  passage: string,
): Array<{ expression: string; sentence: string; sentenceIndex: number; surroundingText: string }> {
  const sentences = splitPassageSentences(passage);
  const candidates: Array<{ expression: string; sentence: string; sentenceIndex: number; surroundingText: string }> = [];
  const seen = new Set<string>();

  for (const [sentenceIndex, sentence] of sentences.entries()) {
    const expressions = suggestImpliedMeaningExpressions(sentence);
    for (const expression of expressions) {
      const normalized = normalizeComparableText(expression);
      if (
        seen.has(normalized) ||
        countContentTokens(expression) < 2 ||
        isSingleEnglishToken(expression) ||
        isTinyFunctionWord(expression)
      ) {
        continue;
      }
      const index = passage.indexOf(expression);
      if (index === -1) continue;
      seen.add(normalized);
      candidates.push({
        expression,
        sentence,
        sentenceIndex,
        surroundingText: buildSurroundingWindow(
          passage,
          index,
          expression.length,
        ),
      });
    }
  }

  return candidates.sort((a, b) =>
    impliedMeaningCandidateScore(b.expression, b.sentence, b.sentenceIndex, sentences.length) -
    impliedMeaningCandidateScore(a.expression, a.sentence, a.sentenceIndex, sentences.length),
  );
}

function suggestImpliedMeaningExpressions(sentence: string): string[] {
  const normalizedSentence = sentence.replace(/\s+/g, " ").trim();
  const candidates: string[] = [];
  const patterns = [
    /\b(not\s+(?:merely|simply|only|just)\s+[^.;:!?]{8,100}?\s+but\s+[^.;:!?]{8,120})/gi,
    /\b(rather than\s+[^.;:!?]{8,100})/gi,
    /\b(not\s+whether\s+[^.;:!?]{8,120}?\s+but\s+[^.;:!?]{8,120})/gi,
    /\b(instead of\s+[^.;:!?]{8,100})/gi,
    /\b(no longer\s+[^.;:!?]{8,100})/gi,
    /\b(cannot\s+be\s+[^.;:!?]{8,100})/gi,
    /\b(serves?\s+as\s+[^.;:!?]{8,100})/gi,
    /\b(functions?\s+as\s+[^.;:!?]{8,100})/gi,
    /\b(represents?\s+[^.;:!?]{8,100})/gi,
    /\b(reflects?\s+[^.;:!?]{8,100})/gi,
    /\b(demonstrates?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(suggests?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(reveals?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(means?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(points?\s+to\s+[^.;:!?]{8,100})/gi,
    /\b(lies?\s+between\s+[^.;:!?]{8,120})/gi,
    /\b(move\s+upstream\s+as\s+well\s+as\s+downstream)/gi,
    /\b(changed\s+what\s+counted\s+as\s+valuable\s+[^.;:!?]{4,80})/gi,
    /\b(we\s+are\s+creatures?\s+of\s+[^.;:!?]{8,120})/gi,
    /\b(tool\s+that\s+helps\s+[^.;:!?]{8,80})/gi,
    /\b(how\s+human\s+responsibility\s+is\s+reorganized\s+around\s+them)/gi,
    /\b(reasons?\s+have\s+to\s+be\s+based\s+on\s+something)/gi,
    /\b(we\s+begin\s+to\s+reason\s+long\s+before\s+[^.;:!?]{8,120})/gi,
    /\b(the\s+(?:point|problem|challenge|risk|value|result|lesson|implication)\s+[^.;:!?]{8,100})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedSentence))) {
      const expression = normalizeSuggestedImpliedExpression(match[1] ?? "");
      if (isUsableImpliedMeaningExpression(expression)) {
        candidates.push(expression);
      }
    }
  }

  if (candidates.length === 0 && isImpliedMeaningSourceSentence(normalizedSentence)) {
    candidates.push(...extractCentralSentenceSpans(normalizedSentence));
  }

  return [...new Set(candidates)].slice(0, 3);
}

function normalizeSuggestedImpliedExpression(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-\s]+/g, "")
    .replace(/[;:]+$/g, "")
    .trim();
}

function isUsableImpliedMeaningExpression(value: string): boolean {
  const text = normalizeText(value);
  const tokenCount = countContentTokens(text);
  return (
    text.length >= 12 &&
    text.length <= 170 &&
    tokenCount >= 2 &&
    !/[?？]\s*$/.test(text) &&
    !/^(?:what|why|how|when|where|which|who|whom|whose)\b/i.test(text) &&
    !isSingleEnglishToken(text) &&
    !isTinyFunctionWord(text) &&
    !/^(?:such as|including|for example)\b/i.test(text)
  );
}

function isImpliedMeaningSourceSentence(sentence: string): boolean {
  if (sentence.length < 45 || sentence.length > 260) return false;
  return /\b(?:although|while|whereas|but|yet|therefore|thus|consequently|in this way|as a result|not merely|not simply|rather than|instead of|means?|suggests?|implies?|reveals?|reflects?|demonstrates?|represents?|serves?|functions?|challenge|risk|value|lesson|implication|creatures?|reason|emotion|effectively)\b/i.test(sentence);
}

function extractCentralSentenceSpans(sentence: string): string[] {
  const spans: string[] = [];
  const clauses = sentence
    .split(/[,;:]\s+/)
    .map(normalizeSuggestedImpliedExpression)
    .filter(isUsableImpliedMeaningExpression);

  spans.push(...clauses.filter((clause) =>
    /\b(?:because|therefore|thus|but|yet|while|although|rather|instead|means?|suggests?|reveals?|reflects?|demonstrates?|represents?|serves?|functions?)\b/i.test(clause),
  ));

  if (spans.length === 0 && isUsableImpliedMeaningExpression(sentence)) {
    spans.push(sentence);
  }

  return spans.slice(0, 2);
}

function impliedMeaningCandidateScore(
  expression: string,
  sentence: string,
  sentenceIndex = 0,
  sentenceCount = 1,
): number {
  let score = countContentTokens(expression);
  if (/\b(?:creatures?|beggar|grave|mirror|lens|map|upstream|downstream|weight|carry|sculpt|sculpting|craft|discipline)\b/i.test(expression)) score += 5;
  if (/\b(?:long before|based on something|reason and emotion|changed what counted|human responsibility is reorganized|tool that helps learning happen)\b/i.test(expression)) score += 4;
  if (/\b(?:not merely|not simply|rather than|instead of|while|although|whereas|but|yet)\b/i.test(expression)) score += 4;
  if (/\b(?:means?|suggests?|implies?|reveals?|reflects?|demonstrates?|represents?|serves?|functions?)\b/i.test(expression)) score += 3;
  if (/\b(?:therefore|thus|consequently|as a result|in this way)\b/i.test(sentence)) score += 2;
  score += impliedMeaningCentralityScore(sentence, sentenceIndex, sentenceCount);
  if (expression.length > 150) score -= 2;
  return score;
}

function impliedMeaningCentralityScore(
  sentence: string,
  sentenceIndex: number,
  sentenceCount: number,
): number {
  let score = 0;
  if (sentenceIndex >= Math.max(0, sentenceCount - 2)) score += 4;
  if (sentenceIndex === 0 && sentenceCount <= 4) score += 1;
  if (/\b(?:central issue|in the end|for that reason|therefore|thus|consequently|as a result|this is why|the point|the lesson|a durable solution|a serious .* must|must therefore|not whether|not merely|rather than|instead of|does not mean|it shows that|ultimately)\b/i.test(sentence)) {
    score += 5;
  }
  if (/\b(?:topic|gist|claim|conclusion|responsibility|value|equality|opportunity|solution|policy|learning|evidence)\b/i.test(sentence)) {
    score += 1;
  }
  return score;
}

function getExpectedOptionCount(question: Record<string, unknown>, typeId: string): number {
  if (typeId === "GRAMMAR_ERROR") {
    const markedCount = Array.isArray(question.markedExpressions)
      ? question.markedExpressions.length
      : 0;
    if (markedCount >= 5 && markedCount <= 10) {
      return markedCount;
    }
    return 5;
  }

  if (typeId !== "IRRELEVANT") return 5;

  const sentenceCount = Array.isArray(question.sentences)
    ? question.sentences.length
    : 0;
  if (sentenceCount >= IRRELEVANT_SLOT_MIN) {
    return sentenceCount;
  }

  return 5;
}

function validateOptions(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (!options.length) return;

  const expectedOptionCount = getExpectedOptionCount(question, typeId);
  if (MC_TYPE_IDS.has(typeId) && options.length !== expectedOptionCount) {
    add("error", "option-count", `Expected ${expectedOptionCount} options, got ${options.length}.`);
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

  if (typeId === "SENTENCE_INSERT") {
    const badOption = options.find((opt, index) => {
      const markerIndex = sentenceInsertOptionMarkerIndex(opt?.text);
      return markerIndex !== index;
    });
    if (badOption) {
      add(
        "error",
        "sentence-insert-option-marker",
        "SENTENCE_INSERT options must be canonical gap markers in order: ①, ②, ③, ④, ⑤.",
      );
    }
  }

  const correctAnswerLabels = collectCorrectAnswerLabels(question);
  const correctAnswer = normalizeText(question.correctAnswer);
  if (correctAnswer) {
    const missingCorrectLabels = correctAnswerLabels.filter(
      (answerLabel) => !normalizedLabels.includes(answerLabel),
    );
    const matchesOption =
      correctAnswerLabels.length > 0
        ? missingCorrectLabels.length === 0
        : options.some((opt) => {
            const label = normalizeLabel(opt?.label);
            const text = normalizeText(opt?.text);
            return correctAnswer === label || correctAnswer === text || normalizeLabel(correctAnswer) === label;
          });
    if (!matchesOption) {
      add(
        "error",
        "correct-answer-mismatch",
        missingCorrectLabels.length
          ? `correctAnswer labels do not match options: ${missingCorrectLabels.join(", ")}.`
          : "correctAnswer does not match any option label or text.",
      );
    }
  }

  const wrongExplanations = question.wrongOptionExplanations;
  const correctAnswerLabelSet = new Set(correctAnswerLabels);
  const wrongOptionLabels = normalizedLabels.filter(
    (label) => label && !correctAnswerLabelSet.has(label),
  );
  const expectedWrongExplanationCount =
    correctAnswerLabelSet.size > 0
      ? wrongOptionLabels.length
      : Math.max(0, options.length - 1);
  if (typeId === "IRRELEVANT" || typeId === "GRAMMAR_ERROR" || typeId === "IMPLIED_MEANING" || typeId === "ANTONYM") {
    const explanationMap = collectWrongOptionExplanations(wrongExplanations);
    const missingLabels = wrongOptionLabels.filter((label) => !explanationMap.get(label));
    if (missingLabels.length > 0 || explanationMap.size < expectedWrongExplanationCount) {
      add(
        "error",
        "wrong-option-explanation-count",
        `Expected explanations for ${expectedWrongExplanationCount} wrong options, got ${explanationMap.size}. Missing: ${missingLabels.join(", ") || "unknown"}.`,
      );
    }
  }

  if (question.difficulty === "KILLER" && wrongExplanations && typeof wrongExplanations === "object") {
    const explanationCount = collectWrongOptionExplanations(wrongExplanations).size;
    if (explanationCount < expectedWrongExplanationCount) {
      add("warning", "thin-wrong-option-explanations", "KILLER item should explain every wrong option.");
    }
  }
}

function collectWrongOptionExplanations(value: unknown): Map<string, string> {
  const explanations = new Map<string, string>();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const label = normalizeLabel(item.label);
      const explanation = normalizeText(item.explanation);
      if (label && explanation) explanations.set(label, explanation);
    }
    return explanations;
  }

  if (!isRecord(value)) return explanations;
  for (const [rawLabel, rawExplanation] of Object.entries(value)) {
    const label = normalizeLabel(rawLabel);
    const explanation = normalizeText(rawExplanation);
    if (label && explanation) explanations.set(label, explanation);
  }
  return explanations;
}

function collectCorrectAnswerLabels(question: Record<string, unknown>): string[] {
  const labels: string[] = [];
  const push = (value: unknown) => {
    const label = normalizeLabelOnly(value);
    if (label && !labels.includes(label)) labels.push(label);
  };

  if (Array.isArray(question.correctAnswers)) {
    for (const value of question.correctAnswers) push(value);
  }

  const correctAnswerText = normalizeText(question.correctAnswer);
  if (correctAnswerText) {
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[A-Ja-j]|\d{1,3}|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) {
      for (const match of matches) push(match);
    } else {
      push(correctAnswerText);
    }
  }

  return labels;
}

function normalizeVocabChoiceKey(value: unknown, fallbackIndex?: number): string {
  const text = normalizeText(value);
  const fallback =
    typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < VOCAB_CHOICE_KEYS.length
      ? VOCAB_CHOICE_KEYS[fallbackIndex]
      : "";

  if (!text) return fallback;

  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0 && circledIndex < VOCAB_CHOICE_KEYS.length) {
    return VOCAB_CHOICE_KEYS[circledIndex];
  }

  const alphaMatch = text.match(/^[\(\[]?\s*([a-eA-E])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toLowerCase();

  const numberMatch = text.match(/^[\(\[]?\s*([1-5])\s*[\)\].:]?$/);
  if (numberMatch) return VOCAB_CHOICE_KEYS[Number(numberMatch[1]) - 1];

  return fallback;
}

function collectVocabChoiceAnswerKeys(question: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const push = (value: unknown) => {
    const key = normalizeVocabChoiceKey(value);
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (Array.isArray(question.correctAnswers)) {
    question.correctAnswers.forEach(push);
  }

  const correctAnswerText = normalizeText(question.correctAnswer);
  if (correctAnswerText) {
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[a-eA-E]|[1-5]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) matches.forEach(push);
    else push(correctAnswerText);
  }

  return keys;
}

function normalizeAntonymKey(value: unknown, fallbackIndex?: number): string {
  const text = normalizeText(value);
  const fallback =
    typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < ANTONYM_KEYS.length
      ? ANTONYM_KEYS[fallbackIndex]
      : "";

  if (!text) return fallback;

  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0 && circledIndex < ANTONYM_KEYS.length) {
    return ANTONYM_KEYS[circledIndex];
  }

  const alphaMatch = text.match(/^[\(\[]?\s*([A-Ea-e])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toUpperCase();

  const numberMatch = text.match(/^[\(\[]?\s*([1-5])\s*[\)\].:]?$/);
  if (numberMatch) return ANTONYM_KEYS[Number(numberMatch[1]) - 1];

  return fallback;
}

function collectAntonymAnswerIndices(question: Record<string, unknown>): number[] {
  const indices: number[] = [];
  const push = (value: unknown) => {
    const key = normalizeAntonymKey(value);
    const index = ANTONYM_KEYS.indexOf(key as (typeof ANTONYM_KEYS)[number]);
    if (index >= 0 && !indices.includes(index)) indices.push(index);
  };

  if (Array.isArray(question.correctAnswers)) {
    question.correctAnswers.forEach(push);
  }

  const correctAnswerText = normalizeText(question.correctAnswer);
  if (correctAnswerText) {
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[A-Ea-e]|[1-5]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) matches.forEach(push);
    else push(correctAnswerText);
  }

  return indices;
}

function normalizeLabelOnly(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  if (getCircledNumbers(50).includes(text)) {
    return normalizeLabel(text);
  }
  if (/^[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?\s*$/.test(text)) {
    return normalizeLabel(text);
  }
  return "";
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
  grammarMarkerCount: number | undefined,
  grammarAnswerCount: number | undefined,
  grammarCorrectionErrorCount: number | undefined,
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

  if (typeId === "IMPLIED_MEANING") {
    validateImpliedMeaningQuestion(question, passage, requestedDifficulty, add);
  }

  if (typeId === "TOPIC" || typeId === "MAIN_IDEA" || typeId === "TOPIC_MAIN_IDEA") {
    validateTopicMainIdeaQuestion(question, typeId, add);
  }

  if (typeId === "SUMMARY_COMPLETE_MC") {
    validateSummaryCompleteMcQuestion(question, requestedDifficulty, add);
  }

  if (typeId === "IRRELEVANT") {
    validateIrrelevantQuestion(question, passage, requestedDifficulty, add);
  }

  if (typeId === "SENTENCE_INSERT") {
    validateSentenceInsertQuestion(question, passage, add);
  }

  if (typeId === "VOCAB_CHOICE") {
    validateVocabChoiceQuestion(question, passage, add);
  }

  if (typeId === "ANTONYM") {
    validateAntonymQuestion(question, passage, add);
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
    const expectedMarkedCount = normalizeGrammarMarkedCount(grammarMarkerCount);
    const expectedAnswerCount = normalizeGrammarAnswerCount(
      grammarAnswerCount,
      expectedMarkedCount,
    );
    if (markedExpressions.length !== expectedMarkedCount) {
      add("error", "grammar-marker-count", `Expected ${expectedMarkedCount} grammar marked expressions, got ${markedExpressions.length}.`);
    }
    if (passageWithMarkers && markerCount !== expectedMarkedCount) {
      add("error", "grammar-render-marker-count", `Expected ${expectedMarkedCount} rendered grammar markers, got ${markerCount}.`);
    }

    const errorLabels = markedExpressions
      .filter((markedExpression) => markedExpression.isError === true)
      .map((markedExpression) => normalizeLabel(markedExpression.label))
      .filter(Boolean);
    if (errorLabels.length !== expectedAnswerCount) {
      add("error", "grammar-error-count", `Expected exactly ${expectedAnswerCount} grammar error answer(s) for ${expectedMarkedCount} marked expressions, got ${errorLabels.length}.`);
    }
    const answerLabels = collectCorrectAnswerLabels(question);
    const missingAnswerLabels = errorLabels.filter((label) => !answerLabels.includes(label));
    const extraAnswerLabels = answerLabels.filter((label) => !errorLabels.includes(label));
    if (missingAnswerLabels.length > 0 || extraAnswerLabels.length > 0) {
      add(
        "error",
        "grammar-correct-answer-labels",
        `correctAnswer/correctAnswers must match isError labels. Missing: ${missingAnswerLabels.join(", ") || "none"}; extra: ${extraAnswerLabels.join(", ") || "none"}.`,
      );
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

  if (typeId === "GRAMMAR_CORRECTION") {
    validateGrammarCorrectionQuestion(
      question,
      passage,
      grammarCorrectionErrorCount,
      add,
    );
  }

  if ((typeId === "CONDITIONAL_WRITING" || typeId === "SENTENCE_TRANSFORM") && Array.isArray(question.conditions)) {
    if (question.difficulty === "KILLER" && question.conditions.length < 2) {
      add("warning", "killer-needs-multiple-conditions", `${typeId} KILLER should require at least two conditions.`);
    }
  }

  if ((typeId === "SUMMARY_COMPLETE" || typeId === "SUMMARY_COMPLETE_MC") && Array.isArray(question.blanks)) {
    const answers = question.blanks.filter(isRecord).map((blank) => normalizeText(blank.answer)).filter(Boolean);
    if (findDuplicate(answers)) {
      add("warning", "duplicate-summary-answer", `${typeId} repeats the same blank answer.`);
    }
  }
}

// SENTENCE_INSERT: 응집 단서(지시어/대명사/연결사) 존재 여부를 표면 검사한다.
// 정관사 'the' 단독은 너무 흔해 신호로 쓰지 않는다(중립 문장 오탐 방지).
function validateAntonymQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markedWords = Array.isArray(question.markedWords)
    ? question.markedWords.filter(isRecord)
    : [];
  const passageWithMarkers = normalizeText(question.passageWithMarkers);

  if (markedWords.length !== ANTONYM_MARKER_COUNT) {
    add(
      "error",
      "antonym-marker-count",
      `ANTONYM must have exactly ${ANTONYM_MARKER_COUNT} marked words, got ${markedWords.length}.`,
    );
  }

  if (!passageWithMarkers) {
    add("error", "antonym-missing-passage-markers", "ANTONYM is missing passageWithMarkers.");
    return;
  }

  const renderedMarkers = findMarkers(passageWithMarkers)
    .map((marker) => {
      const match = marker.inner.match(/^\(([A-Ea-e])\)\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1].toUpperCase(),
        word: normalizeText(match[2]),
      };
    })
    .filter((marker): marker is { key: string; word: string } => !!marker);
  const renderedByKey = new Map(renderedMarkers.map((marker) => [marker.key, marker.word]));

  if (countUnderlineMarkers(passageWithMarkers) !== ANTONYM_MARKER_COUNT) {
    add(
      "error",
      "antonym-render-marker-count",
      `ANTONYM passageWithMarkers must render exactly ${ANTONYM_MARKER_COUNT} underlined markers.`,
    );
  }

  if (renderedMarkers.length !== ANTONYM_MARKER_COUNT) {
    add(
      "error",
      "antonym-render-label-format",
      "ANTONYM rendered markers must use __(A) word__ through __(E) word__ format.",
    );
  }

  const labels = markedWords.map((word, index) => normalizeAntonymKey(word.label, index));
  const duplicateLabel = findDuplicate(labels.filter(Boolean));
  if (duplicateLabel) {
    add("error", "antonym-duplicate-label", `Duplicate ANTONYM marked label: (${duplicateLabel}).`);
  }

  const incorrectPairs = markedWords.filter((word) => word.isIncorrectPair === true);
  if (incorrectPairs.length !== 1) {
    add(
      "error",
      "antonym-incorrect-pair-count",
      `ANTONYM must have exactly one isIncorrectPair=true item, got ${incorrectPairs.length}.`,
    );
  }

  const answerIndices = collectAntonymAnswerIndices(question);
  if (answerIndices.length !== 1) {
    add(
      "error",
      "antonym-answer-count",
      `ANTONYM correctAnswer must point to exactly one option/label, got ${answerIndices.length}.`,
    );
  }

  const incorrectIndex = incorrectPairs[0]
    ? markedWords.indexOf(incorrectPairs[0])
    : -1;
  if (incorrectIndex >= 0 && answerIndices.length === 1 && answerIndices[0] !== incorrectIndex) {
    add(
      "error",
      "antonym-answer-label-mismatch",
      `ANTONYM correctAnswer must match the only incorrectly paired option (${incorrectIndex + 1}).`,
    );
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionByIndex = new Map<number, Record<string, unknown>>();
  options.forEach((option, index) => {
    const normalized = normalizeLabel(option.label);
    const numericIndex = /^[1-5]$/.test(normalized)
      ? Number(normalized) - 1
      : index;
    optionByIndex.set(numericIndex, option);
  });

  for (const [index, markedWord] of markedWords.entries()) {
    const key = normalizeAntonymKey(markedWord.label, index);
    const renderedWord = renderedByKey.get(key);
    const word = normalizeText(markedWord.word);
    const pairedWord = normalizeText(markedWord.antonym);
    const correctAntonym = normalizeText(markedWord.correctAntonym);
    const isIncorrectPair = markedWord.isIncorrectPair === true;

    if (!key) {
      add("error", "antonym-label-format", "ANTONYM markedWords labels must be (A) through (E).");
      continue;
    }

    if (!word || !pairedWord) {
      add("error", "antonym-empty-pair", `ANTONYM label (${key}) is missing word or paired word.`);
      continue;
    }

    if (!renderedWord) {
      add("error", "antonym-render-missing-label", `ANTONYM passageWithMarkers is missing label (${key}).`);
    } else if (normalizeComparableText(renderedWord) !== normalizeComparableText(word)) {
      add(
        "error",
        "antonym-render-word-mismatch",
        `ANTONYM label (${key}) renders "${renderedWord}" but markedWords says "${word}".`,
      );
    }

    const option = optionByIndex.get(index);
    const optionText = normalizeText(option?.text);
    if (optionText) {
      if (!containsLoose(optionText, word) || !containsLoose(optionText, pairedWord)) {
        add(
          "error",
          "antonym-option-pair-mismatch",
          `ANTONYM option ${index + 1} must display the same word-pair as markedWords (${word} - ${pairedWord}).`,
        );
      }
    }

    if (passage && isSingleEnglishToken(word) && !containsStandaloneToken(passage, word)) {
      add("error", "antonym-word-not-source-backed", `ANTONYM word (${key}) must exist as a standalone source token.`);
    }

    if (normalizeComparableText(word) === normalizeComparableText(pairedWord)) {
      add("error", "antonym-same-word", `ANTONYM pair (${key}) repeats the same word.`);
    }

    const formIssue = findAntonymSurfaceFormIssue(word, pairedWord);
    if (formIssue) {
      add("error", "antonym-surface-form-mismatch", `ANTONYM pair (${key}) has mismatched surface forms: ${formIssue}.`);
    }

    const contestablePair = findContestableAntonymPair(word, pairedWord);
    if (contestablePair) {
      add(
        "error",
        "antonym-contestable-pair",
        `ANTONYM pair (${key}) is contestable or on the wrong semantic axis: ${contestablePair}.`,
      );
    }

    if (isIncorrectPair) {
      if (!correctAntonym) {
        add("error", "antonym-missing-correct-antonym", `Incorrect ANTONYM pair (${key}) must include correctAntonym.`);
      } else {
        if (normalizeComparableText(correctAntonym) === normalizeComparableText(pairedWord)) {
          add(
            "error",
            "antonym-incorrect-pair-not-mutated",
            `Incorrect ANTONYM pair (${key}) has the same antonym and correctAntonym.`,
          );
        }
        const correctFormIssue = findAntonymSurfaceFormIssue(word, correctAntonym);
        if (correctFormIssue) {
          add(
            "error",
            "antonym-correct-antonym-form-mismatch",
            `correctAntonym for (${key}) should match the source word form: ${correctFormIssue}.`,
          );
        }
        const badCorrectPair = findContestableAntonymPair(word, correctAntonym);
        if (badCorrectPair) {
          add(
            "error",
            "antonym-correct-antonym-contestable",
            `correctAntonym for (${key}) is still contestable: ${badCorrectPair}.`,
          );
        }
      }
    } else if (correctAntonym) {
      add("error", "antonym-nonanswer-has-correct-antonym", `Non-answer ANTONYM pair (${key}) must not include correctAntonym.`);
    }
  }
}

function findAntonymSurfaceFormIssue(word: string, pairedWord: string): string | null {
  const source = normalizeText(word);
  const pair = normalizeText(pairedWord);
  if (!isSingleEnglishToken(source) || !isSingleEnglishToken(pair)) return null;
  const sourceLower = source.toLowerCase();
  const pairLower = pair.toLowerCase();

  const sourceS = hasInflectionalS(sourceLower);
  const pairS = hasInflectionalS(pairLower);
  if (sourceS !== pairS) {
    return `"${source}" and "${pairedWord}" do not share third-person/plural -s form`;
  }

  for (const suffix of ["ing", "ly"] as const) {
    const sourceHas = sourceLower.endsWith(suffix);
    const pairHas = pairLower.endsWith(suffix);
    if (sourceHas !== pairHas) {
      return `"${source}" and "${pairedWord}" do not share -${suffix} form`;
    }
  }

  const sourceRegularPast = sourceLower.endsWith("ed");
  const pairRegularPast = pairLower.endsWith("ed");
  const sourcePast = sourceRegularPast || IRREGULAR_PAST_FORMS.has(sourceLower);
  const pairPast = pairRegularPast || IRREGULAR_PAST_FORMS.has(pairLower);
  if ((sourceRegularPast && !pairPast) || (pairRegularPast && !sourcePast)) {
    return `"${source}" and "${pairedWord}" do not share past/participle form`;
  }

  const sourceComparative = isLikelyComparativeForm(sourceLower);
  const pairComparative = isLikelyComparativeForm(pairLower);
  if (sourceComparative !== pairComparative) {
    return `"${source}" and "${pairedWord}" do not share comparative form`;
  }

  const sourceSuperlative = isLikelySuperlativeForm(sourceLower);
  const pairSuperlative = isLikelySuperlativeForm(pairLower);
  if (sourceSuperlative !== pairSuperlative) {
    return `"${source}" and "${pairedWord}" do not share superlative form`;
  }

  return null;
}

function isLikelyComparativeForm(word: string): boolean {
  return /^(?:easier|harder|larger|smaller|bigger|longer|shorter|higher|lower|greater|lesser|better|worse|faster|slower|stronger|weaker|brighter|darker|earlier|later|older|newer)$/.test(word);
}

function isLikelySuperlativeForm(word: string): boolean {
  return /^(?:easiest|hardest|largest|smallest|biggest|longest|shortest|highest|lowest|greatest|least|most|best|worst|fastest|slowest|strongest|weakest|brightest|darkest|earliest|latest|oldest|newest)$/.test(word);
}

const IRREGULAR_PAST_FORMS = new Set([
  "bought",
  "brought",
  "built",
  "caught",
  "chose",
  "chosen",
  "felt",
  "found",
  "gave",
  "given",
  "held",
  "kept",
  "known",
  "led",
  "left",
  "lost",
  "made",
  "paid",
  "put",
  "read",
  "ran",
  "said",
  "saw",
  "seen",
  "sent",
  "set",
  "spent",
  "stood",
  "taken",
  "taught",
  "thought",
  "told",
  "went",
  "won",
  "wrote",
  "written",
]);

function hasInflectionalS(word: string): boolean {
  return (
    word.length > 3 &&
    word.endsWith("s") &&
    !/(?:ss|us|is|ous|less|ness)$/.test(word)
  );
}

function findContestableAntonymPair(word: string, pairedWord: string): string | null {
  const rawKey = [normalizeComparableText(word), normalizeComparableText(pairedWord)].sort().join("|");
  const rawBlocked: Record<string, string> = {
    "paid|refunded": "paid and refunded are transaction-related reversals, not a clean lexical antonym pair. Prefer paid-received or spent-saved depending on context.",
    "uninterested|unproductive": "unproductive is an output/effectiveness scale; uninterested is an attitude/interest scale.",
  };
  if (rawBlocked[rawKey]) return rawBlocked[rawKey];

  const a = antonymPairKey(word);
  const b = antonymPairKey(pairedWord);
  if (!a || !b) return null;
  const key = [a, b].sort().join("|");
  const blocked: Record<string, string> = {
    "force|restrain": "force in this passage means compel; restrain can mean hold back/block, so the relation is contestable rather than a clean antonym. Prefer allow/permit/release in matching form.",
    "ignorance|mastery": "mastery is an ability/competence scale; ignorance is a knowledge-state scale. Prefer incompetence, inability, or lack of mastery.",
    "emotional|rational": "emotional contrasts with unemotional/dispassionate; rational contrasts more cleanly with irrational.",
    "clear|dim": "dim as future outlook contrasts more cleanly with bright/promising, not clear.",
    "excuse|justify": "excuse is a near-related act of explanation/defense, not a clean opposite of justify.",
    "passive|unproductive": "passive is an activity/agency scale; unproductive is an output/effectiveness scale. Prefer productive/fruitful.",
  };
  return blocked[key] ?? null;
}

function antonymPairKey(value: string): string {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || !isSingleEnglishToken(normalized)) return "";
  if (normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("ing") && normalized.length > 6) return normalized.slice(0, -3);
  if (normalized.endsWith("ed") && normalized.length > 5) return normalized.slice(0, -2);
  if (hasInflectionalS(normalized)) return normalized.slice(0, -1);
  return normalized;
}

function validateVocabChoiceQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markedWords = Array.isArray(question.markedWords)
    ? question.markedWords.filter(isRecord)
    : [];
  const passageWithMarkers = normalizeText(question.passageWithMarkers);

  if (markedWords.length !== VOCAB_CHOICE_MARKER_COUNT) {
    add(
      "error",
      "vocab-marker-count",
      `VOCAB_CHOICE must have exactly ${VOCAB_CHOICE_MARKER_COUNT} marked words, got ${markedWords.length}.`,
    );
  }

  if (!passageWithMarkers) {
    add("error", "vocab-missing-passage-markers", "VOCAB_CHOICE is missing passageWithMarkers.");
    return;
  }

  const renderedMarkers = findMarkers(passageWithMarkers)
    .map((marker) => {
      const match = marker.inner.match(/^\(([a-eA-E])\)\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1].toLowerCase(),
        word: normalizeText(match[2]),
      };
    })
    .filter((marker): marker is { key: string; word: string } => !!marker);
  const renderedByKey = new Map(renderedMarkers.map((marker) => [marker.key, marker.word]));

  if (countUnderlineMarkers(passageWithMarkers) !== VOCAB_CHOICE_MARKER_COUNT) {
    add(
      "error",
      "vocab-render-marker-count",
      `VOCAB_CHOICE passageWithMarkers must render exactly ${VOCAB_CHOICE_MARKER_COUNT} underlined markers.`,
    );
  }

  if (renderedMarkers.length !== VOCAB_CHOICE_MARKER_COUNT) {
    add(
      "error",
      "vocab-render-label-format",
      "VOCAB_CHOICE rendered markers must use __(a) word__ through __(e) word__ format.",
    );
  }

  const labels = markedWords.map((word, index) => normalizeVocabChoiceKey(word.label, index));
  const duplicateLabel = findDuplicate(labels.filter(Boolean));
  if (duplicateLabel) {
    add("error", "vocab-duplicate-label", `Duplicate VOCAB_CHOICE marked label: (${duplicateLabel}).`);
  }

  const inappropriateWords = markedWords.filter((word) => word.isInappropriate === true);
  if (inappropriateWords.length !== 1) {
    add(
      "error",
      "vocab-inappropriate-count",
      `VOCAB_CHOICE must have exactly one isInappropriate=true item, got ${inappropriateWords.length}.`,
    );
  }

  const answerKeys = collectVocabChoiceAnswerKeys(question);
  if (answerKeys.length !== 1) {
    add(
      "error",
      "vocab-answer-count",
      `VOCAB_CHOICE correctAnswer must point to exactly one label, got ${answerKeys.length}.`,
    );
  }

  const inappropriate = inappropriateWords[0];
  const inappropriateKey = inappropriate ? normalizeVocabChoiceKey(inappropriate.label) : "";
  if (inappropriateKey && answerKeys.length === 1 && answerKeys[0] !== inappropriateKey) {
    add(
      "error",
      "vocab-answer-label-mismatch",
      `VOCAB_CHOICE correctAnswer must match the only inappropriate label (${inappropriateKey}).`,
    );
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionByKey = new Map<string, Record<string, unknown>>();
  options.forEach((option, index) => {
    const key = normalizeVocabChoiceKey(option.label, index);
    if (key) optionByKey.set(key, option);
  });

  for (const [index, markedWord] of markedWords.entries()) {
    const key = normalizeVocabChoiceKey(markedWord.label, index);
    const renderedWord = renderedByKey.get(key);
    const isInappropriate = markedWord.isInappropriate === true;
    const originalWord = normalizeText(markedWord.originalWord);
    const substituteWord = normalizeText(markedWord.substituteWord);
    const displayedWord =
      normalizeText(markedWord.word) ||
      (isInappropriate ? substituteWord : originalWord);
    const betterWord = normalizeText(markedWord.betterWord);

    if (!key) {
      add("error", "vocab-label-format", "VOCAB_CHOICE markedWords labels must be (a) through (e).");
      continue;
    }

    if (!renderedWord) {
      add("error", "vocab-render-missing-label", `VOCAB_CHOICE passageWithMarkers is missing label (${key}).`);
    } else if (
      displayedWord &&
      normalizeComparableText(renderedWord) !== normalizeComparableText(displayedWord)
    ) {
      add(
        "error",
        "vocab-render-word-mismatch",
        `VOCAB_CHOICE label (${key}) renders "${renderedWord}" but markedWords says "${displayedWord}".`,
      );
    }

    const option = optionByKey.get(key);
    const optionText = normalizeText(option?.text);
    if (
      optionText &&
      displayedWord &&
      normalizeComparableText(optionText) !== normalizeComparableText(displayedWord)
    ) {
      add(
        "error",
        "vocab-option-word-mismatch",
        `VOCAB_CHOICE option (${key}) must show the same word as the passage marker.`,
      );
    }

    if (isInappropriate) {
      const visibleWrongWord = substituteWord || displayedWord;
      const sourceCorrectWord = betterWord || originalWord;
      if (!visibleWrongWord) {
        add("error", "vocab-missing-substitute", `VOCAB_CHOICE answer (${key}) is missing the displayed wrong word.`);
      }
      if (!sourceCorrectWord) {
        add("error", "vocab-missing-better-word", `VOCAB_CHOICE answer (${key}) is missing the source-correct betterWord.`);
      }
      if (
        visibleWrongWord &&
        sourceCorrectWord &&
        normalizeComparableText(visibleWrongWord) === normalizeComparableText(sourceCorrectWord)
      ) {
        add("error", "vocab-not-mutated", `VOCAB_CHOICE answer (${key}) did not replace the source word.`);
      }
      if (
        originalWord &&
        betterWord &&
        normalizeComparableText(originalWord) !== normalizeComparableText(betterWord)
      ) {
        add("error", "vocab-better-word-mismatch", `VOCAB_CHOICE betterWord for (${key}) must equal originalWord.`);
      }
      if (
        renderedWord &&
        visibleWrongWord &&
        normalizeComparableText(renderedWord) !== normalizeComparableText(visibleWrongWord)
      ) {
        add("error", "vocab-answer-not-rendered", `VOCAB_CHOICE answer (${key}) must render the wrong substitute word.`);
      }
      if (passage && sourceCorrectWord && !containsLoose(passage, sourceCorrectWord)) {
        add(
          "error",
          "vocab-better-word-not-source-backed",
          `VOCAB_CHOICE betterWord for (${key}) must exist in the original passage.`,
        );
      }
    } else {
      if (betterWord) {
        add("error", "vocab-nonanswer-has-better-word", `VOCAB_CHOICE non-answer (${key}) must not have betterWord.`);
      }
      if (
        originalWord &&
        displayedWord &&
        normalizeComparableText(originalWord) !== normalizeComparableText(displayedWord)
      ) {
        add(
          "error",
          "vocab-nonanswer-not-source-word",
          `VOCAB_CHOICE non-answer (${key}) must display the original source word.`,
        );
      }
      if (passage && displayedWord && !containsLoose(passage, displayedWord)) {
        add(
          "error",
          "vocab-nonanswer-not-source-backed",
          `VOCAB_CHOICE non-answer (${key}) must exist in the original passage.`,
        );
      }
    }
  }
}

function sentenceInsertHasCohesiveCue(sentence: string): boolean {
  const s = ` ${sentence.toLowerCase()} `;
  if (/\b(this|that|these|those|such|it|its|they|them|their|he|she|his|her|him)\b/.test(s)) {
    return true;
  }
  if (
    /\b(however|yet|instead|nevertheless|nonetheless|therefore|thus|hence|consequently|for example|for instance|moreover|furthermore|in addition|besides|also|then|later|subsequently|afterwards?|meanwhile|on the contrary|in contrast|by contrast|similarly|likewise|as a result)\b/.test(
      s,
    )
  ) {
    return true;
  }
  return false;
}

function normalizeSentenceInsertGapLabel(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  const match = text.match(/(\d{1,2})/);
  return match ? match[1] : text;
}

function countSentenceInsertGapMarkers(text: string): number {
  const circled = getCircledNumbers(5);
  return circled.filter((marker) => text.includes(marker)).length;
}

function findSentenceInsertVisibleSourceLeak(
  sourceSentence: string,
  passageWithMarkers: string,
): { sentence: string; score: number } | null {
  const source = normalizeText(sourceSentence);
  if (!source) return null;

  const visiblePassage = stripSentenceInsertMarkers(passageWithMarkers);
  const visibleSentences = splitPassageSentences(visiblePassage, { includeShort: true });
  let best: { sentence: string; score: number } | null = null;
  for (const sentence of visibleSentences) {
    const score = sentenceInsertSentenceSimilarity(source, sentence);
    if (!best || score > best.score) best = { sentence, score };
  }

  if (!best) return null;
  if (normalizeComparableText(best.sentence) === normalizeComparableText(source)) return best;
  return best.score >= 0.72 ? best : null;
}

function stripSentenceInsertMarkers(text: string): string {
  return text
    .replace(/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceInsertSentenceSimilarity(a: string, b: string): number {
  const normalizedA = normalizeComparableText(a).replace(/[.,!?;:]+$/g, "");
  const normalizedB = normalizeComparableText(b).replace(/[.,!?;:]+$/g, "");
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.length >= 45 && normalizedB.includes(normalizedA)) return 0.95;
  if (normalizedB.length >= 45 && normalizedA.includes(normalizedB)) return 0.95;

  const tokensA = [...contentTokens(normalizedA)];
  const tokensB = [...contentTokens(normalizedB)];
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  const overlap = tokensA.filter((token) => setB.has(token)).length;
  const containment = overlap / Math.max(1, Math.min(tokensA.length, tokensB.length));
  const jaccard = overlap / Math.max(1, new Set([...tokensA, ...tokensB]).size);
  const sequence = longestCommonTokenRun(tokensA, tokensB) / Math.max(1, Math.min(tokensA.length, tokensB.length));
  return Math.max(containment, jaccard * 1.25, sequence);
}

function longestCommonTokenRun(a: string[], b: string[]): number {
  let best = 0;
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        best = Math.max(best, dp[i][j]);
      }
    }
  }
  return best;
}

function validateSentenceInsertQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  // 1) 마커 인덱스: 5개 · 오름차순
  const indices = Array.isArray(question.markerAfterSentenceIndices)
    ? question.markerAfterSentenceIndices.filter((n): n is number => typeof n === "number")
    : [];
  if (indices.length !== 5) {
    add(
      "warning",
      "sentence-insert-marker-count",
      `Expected 5 marker indices for SENTENCE_INSERT, got ${indices.length}.`,
    );
  } else if (!indices.every((n, i) => i === 0 || n > indices[i - 1])) {
    add(
      "warning",
      "sentence-insert-marker-order",
      "markerAfterSentenceIndices must be strictly ascending.",
    );
  }

  // 2) 주어진 문장: 존재 + 응집 단서(중립 문장 → 복수정답 위험)
  const given = normalizeText(question.givenSentence);
  if (!given) {
    add("error", "sentence-insert-missing-given", "SENTENCE_INSERT is missing givenSentence.");
  } else if (!sentenceInsertHasCohesiveCue(given)) {
    add(
      "warning",
      "sentence-insert-neutral-given",
      "The given sentence has no explicit cohesive cue (demonstrative/pronoun/connective); it may fit multiple gaps (복수정답 위험).",
    );
  }

  // 3) 정답 위치: 양끝(①·⑤) 회피 → 가운데(②③④) 권장
  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  if (!passageWithMarkers) {
    add("error", "sentence-insert-missing-passage", "SENTENCE_INSERT is missing passageWithMarkers.");
  } else {
    const markerCount = countSentenceInsertGapMarkers(passageWithMarkers);
    if (markerCount !== 5) {
      add(
        "error",
        "sentence-insert-gap-marker-count",
        `SENTENCE_INSERT passageWithMarkers must contain exactly 5 gap markers, got ${markerCount}.`,
      );
    }
  }

  const omittedSource =
    normalizeText(question.omittedSourceSentence) ||
    normalizeText(question.sourceSentenceToOmit);
  if (omittedSource) {
    if (passage && !containsComparableSentence(passage, omittedSource)) {
      add(
        "error",
        "sentence-insert-omitted-source-not-backed",
        "sourceSentenceToOmit/omittedSourceSentence must be an original passage sentence.",
      );
    }
    if (passageWithMarkers) {
      const leak = findSentenceInsertVisibleSourceLeak(omittedSource, passageWithMarkers);
      if (leak) {
        add(
          "error",
          "sentence-insert-omitted-source-visible",
          `The omitted source sentence is still visible in passageWithMarkers: "${leak.sentence.slice(0, 100)}"`,
        );
      }
    }
  } else if (given && passageWithMarkers) {
    const leak = findSentenceInsertVisibleSourceLeak(given, passageWithMarkers);
    if (leak && leak.score >= 0.72) {
      add(
        "error",
        "sentence-insert-given-leaks-in-passage",
        `The given sentence is still visible, or nearly visible, in passageWithMarkers: "${leak.sentence.slice(0, 100)}"`,
      );
    }
  }

  const answer = normalizeSentenceInsertGapLabel(question.correctAnswer);
  if (answer === "1" || answer === "5") {
    add(
      "warning",
      "sentence-insert-edge-answer",
      `Correct gap is at an edge (${answer}); 가운데(②③④)가 변별력에 유리합니다.`,
    );
  }

  // 4) 함정 게이트: distractorTraps 가 있으면 각 결함이 비어있지 않고 서로 달라야 함
  const traps = Array.isArray(question.distractorTraps)
    ? question.distractorTraps.filter(isRecord)
    : [];
  if (traps.length > 0) {
    const flaws = traps.map((t) => normalizeText(t.fatalFlaw)).filter(Boolean);
    if (flaws.length < traps.length) {
      add(
        "warning",
        "sentence-insert-trap-empty-flaw",
        "Some distractorTraps have an empty fatalFlaw; each wrong gap needs a decisive reason.",
      );
    }
    if (findDuplicate(flaws)) {
      add(
        "warning",
        "sentence-insert-trap-duplicate-flaw",
        "distractorTraps repeat the same fatalFlaw; each trap should fail for a different reason.",
      );
    }
    if (answer && traps.some((t) => normalizeSentenceInsertGapLabel(t.gapLabel) === answer)) {
      add(
        "warning",
        "sentence-insert-trap-on-answer",
        "A distractorTrap points at the correct gap.",
      );
    }
  }
}

function validateGrammarCorrectionQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedErrorCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const expectedErrorCount = normalizeGrammarCorrectionErrorCount(requestedErrorCount);
  const underlinedSegments = Array.isArray(question.underlinedSegments)
    ? (question.underlinedSegments as Record<string, unknown>[])
    : [];
  const passageWithUnderline = normalizeText(question.passageWithUnderline);
  const primaryErrorPart = normalizeText(question.errorPart);
  const primaryCorrectedPart = normalizeText(question.correctedPart);
  const errorParts = Array.isArray(question.errorParts)
    ? question.errorParts.map((item) => normalizeText(item))
    : [];
  const correctedParts = Array.isArray(question.correctedParts)
    ? question.correctedParts.map((item) => normalizeText(item))
    : [];
  const correctedSentence = normalizeText(question.correctedSentence);
  const correctAnswer = normalizeText(question.correctAnswer);

  if (underlinedSegments.length < 1) {
    add("error", "grammar-correction-missing-underlined-segments", "GRAMMAR_CORRECTION must underline at least one sentence/clause segment.");
    return;
  }
  if (underlinedSegments.length !== expectedErrorCount) {
    add("error", "grammar-correction-underline-count", `Expected exactly ${expectedErrorCount} wrong underlined segment(s), got ${underlinedSegments.length}.`);
  }
  if (!passageWithUnderline) {
    add("error", "grammar-correction-missing-passage-underline", "GRAMMAR_CORRECTION must render the source passage with wider underlined segment(s).");
    return;
  }

  const markerCount = (passageWithUnderline.match(/__[^_]+__/g) ?? []).length;
  if (markerCount !== expectedErrorCount) {
    add("error", "grammar-correction-underline-count-mismatch", `passageWithUnderline must render exactly ${expectedErrorCount} underlined segment(s).`);
  }

  const errorItems = underlinedSegments.filter((item) => item.isError === true);
  if (errorItems.length !== expectedErrorCount || errorItems.length !== underlinedSegments.length) {
    add("error", "grammar-correction-error-count", `GRAMMAR_CORRECTION must have exactly ${expectedErrorCount} wrong underline(s), and every underlined segment must have isError=true.`);
    return;
  }

  const collectedCorrectedParts: string[] = [];
  for (const [index, errorItem] of errorItems.entries()) {
    const sourceText = normalizeText(errorItem.sourceText);
    const displayedText = normalizeText(errorItem.displayedText);
    const displayedError =
      normalizeText(errorItem.errorPart) ||
      errorParts[index] ||
      (index === 0 ? primaryErrorPart : "");
    const sourceCorrection =
      normalizeText(errorItem.correctedPart) ||
      correctedParts[index] ||
      (index === 0 ? primaryCorrectedPart : "");

    if (sourceCorrection) collectedCorrectedParts.push(sourceCorrection);

    if (!sourceCorrection) {
      add("error", "grammar-correction-missing-corrected-part", `Error underlined segment ${index + 1} is missing correctedPart.`);
      continue;
    }
    if (!sourceText) {
      add("error", "grammar-correction-missing-source-text", `Error underlined segment ${index + 1} is missing sourceText.`);
      continue;
    }
    if (!displayedText) {
      add("error", "grammar-correction-missing-displayed-text", `Error underlined segment ${index + 1} is missing displayedText.`);
      continue;
    }
    if (!displayedError) {
      add("error", "grammar-correction-missing-error-part", `Error underlined segment ${index + 1} must include the wrong expression hidden inside the underline.`);
      continue;
    }

    if (normalizeComparableText(displayedError) === normalizeComparableText(sourceCorrection)) {
      add("error", "grammar-correction-not-mutated", `Error underlined segment ${index + 1} has the same errorPart and correctedPart.`);
    }
    if (correctedParts[index] && normalizeComparableText(correctedParts[index]) !== normalizeComparableText(sourceCorrection)) {
      add("error", "grammar-correction-correction-mismatch", `correctedParts[${index}] must match the segment correctedPart.`);
    }
    if (!containsLoose(sourceText, sourceCorrection)) {
      add("error", "grammar-correction-corrected-part-not-in-source-text", `correctedPart for error segment ${index + 1} must appear inside the original underlined sourceText.`);
    }
    if (!containsLoose(displayedText, displayedError)) {
      add("error", "grammar-correction-error-part-not-in-displayed-text", `errorPart for error segment ${index + 1} must appear inside the displayed underlined segment.`);
    }
    if (normalizeComparableText(sourceText) === normalizeComparableText(displayedText)) {
      add("error", "grammar-correction-displayed-not-mutated", `displayedText for error segment ${index + 1} must differ from sourceText.`);
    }
    if (normalizeComparableText(sourceText) === normalizeComparableText(sourceCorrection)) {
      add("error", "grammar-correction-underline-too-narrow", `Do not underline only the exact corrected expression for error segment ${index + 1}; underline a wider sentence or clause.`);
    }
    if (countWordsForQuality(displayedText) < Math.max(5, countWordsForQuality(displayedError) + 3)) {
      add("error", "grammar-correction-underlined-segment-short", `Error underlined segment ${index + 1} is too short; underline a wider sentence/clause so the exact error is hidden.`);
    }
    if (!containsLoose(passageWithUnderline, displayedText)) {
      add("error", "grammar-correction-displayed-text-not-rendered", `Displayed underlined segment ${index + 1} must appear in passageWithUnderline.`);
    }
    if (passage && sourceText && !containsLoose(passage, sourceText)) {
      add("error", "grammar-correction-source-text-not-source-backed", `sourceText for error segment ${index + 1} must exist in the original passage.`);
    }

    const combined = `${displayedError} ${sourceCorrection}`.toLowerCase();
    if (/\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/.test(combined)) {
      add("error", "grammar-correction-debatable-infinitive", "Do not use active/passive infinitive preference as the grammar-correction target.");
    }
  }

  if (collectedCorrectedParts.length === expectedErrorCount) {
    const expectedAnswer = collectedCorrectedParts
      .map((part, index) => `(${String.fromCharCode(65 + index)}) ${part}`)
      .join(", ");
    if (correctAnswer && normalizeComparableText(correctAnswer) !== normalizeComparableText(expectedAnswer)) {
      add("error", "grammar-correction-answer-mismatch", "correctAnswer must equal every label and correctedPart joined by comma + space.");
    }
  }

  if (passage && correctedSentence && !containsComparableSentence(passage, correctedSentence)) {
    add("error", "grammar-correction-sentence-not-source-backed", "correctedSentence must be an original source-passage sentence when provided.");
  }
}

function countWordsForQuality(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function containsLoose(text: string, fragment: string): boolean {
  return normalizeComparableText(text).includes(normalizeComparableText(fragment));
}

function validateBlankInferenceQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const isNegativeParaphraseMode = question.blankAnswerMode === "DOUBLE_NEGATIVE";
  const originalExpression = normalizeText(question.originalExpression);
  const passageWithBlank = normalizeText(question.passageWithBlank);
  const blankCarrierText = extractBlankCarrierText(passageWithBlank);
  const correctLabel = normalizeLabel(question.correctAnswer);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctOption = options.find((option) => normalizeLabel(option.label) === correctLabel);
  const correctText = normalizeText(correctOption?.text);
  const wrongOptions = options.filter((option) => normalizeLabel(option.label) !== correctLabel);
  const wrongNegationCount = wrongOptions.filter((option) =>
    hasNegationCue(normalizeText(option.text)),
  ).length;
  const totalNegationCount = options.filter((option) =>
    hasNegationCue(normalizeText(option.text)),
  ).length;

  if (!correctText) {
    add("error", "blank-missing-answer", "BLANK_INFERENCE item is missing a correct option text.");
    return;
  }

  if (crossesStrongContrastBoundary(originalExpression)) {
    add(
      isNegativeParaphraseMode ? "error" : "warning",
      "blank-crosses-contrast",
      "BLANK_INFERENCE blank must not swallow a contrast marker; keep but/rather/instead structure visible.",
    );
  }

  if (requestedDifficulty === "KILLER" && countContentTokens(originalExpression) < 2) {
    add(
      isNegativeParaphraseMode ? "error" : "warning",
      "blank-target-too-small",
      "KILLER BLANK_INFERENCE should target a meaningful phrase or relation, not a single obvious keyword.",
    );
  }

  if (isSingleAbstractNounTarget(originalExpression)) {
    add(
      isNegativeParaphraseMode ? "error" : "warning",
      "blank-single-abstract-noun",
      "BLANK_INFERENCE should avoid targeting a single abstract noun when a logical phrase is available.",
    );
  }

  if (isListLikeBlankTarget(originalExpression)) {
    add(
      "error",
      "blank-target-list-like",
      "BLANK_INFERENCE should not target a long, punctuated, or list-like span.",
    );
  }

  const adjacentConclusionIssue = findAdjacentBlankConclusionIssue(
    passageWithBlank,
    correctText,
  );
  if (adjacentConclusionIssue) {
    add("error", adjacentConclusionIssue.code, adjacentConclusionIssue.message);
  }

  const awkwardCorrectPhrase = findAwkwardBlankOptionPhrase(correctText);
  if (awkwardCorrectPhrase) {
    add(
      "error",
      "blank-awkward-correct-option",
      `BLANK_INFERENCE correct option contains an awkward or non-CSAT-like phrase: ${awkwardCorrectPhrase}.`,
    );
  }

  for (const option of options) {
    const optionText = normalizeText(option.text);
    const awkwardOptionPhrase = findAwkwardBlankOptionPhrase(optionText);
    if (awkwardOptionPhrase) {
      add(
        "error",
        "blank-awkward-option",
        `BLANK_INFERENCE option contains an awkward or non-CSAT-like phrase: ${awkwardOptionPhrase}.`,
      );
      break;
    }
    const contextualAwkwardOptionPhrase = findContextualAwkwardBlankOptionPhrase(
      blankCarrierText,
      optionText,
    );
    if (contextualAwkwardOptionPhrase) {
      add(
        "error",
        "blank-awkward-option",
        `BLANK_INFERENCE option is awkward in the blank sentence: ${contextualAwkwardOptionPhrase}.`,
      );
      break;
    }
  }

  if (/\b(?:such as|including|for example)\s+_____/.test(blankCarrierText)) {
    add(
      isNegativeParaphraseMode ? "error" : "warning",
      "blank-example-list-slot",
      "Avoid example-list blanks; choose a logical clause, predicate, or relation where passage reasoning decides the answer.",
    );
  }

  if (passage) {
    const attractiveWrongCount = countAttractiveBlankWrongOptions(
      options,
      correctLabel,
      passage,
      correctText,
    );
    if (attractiveWrongCount === 0) {
      add(
        isNegativeParaphraseMode ? "error" : "warning",
        "blank-weak-distractors",
        "BLANK_INFERENCE has no wrong options with passage-keyword, semantic, or polarity overlap.",
      );
    } else if (attractiveWrongCount < 2) {
      add(
        "warning",
        "blank-weak-distractors",
        "BLANK_INFERENCE should have more wrong options with passage-keyword, semantic, or polarity overlap.",
      );
    }
  }

  if (!isNegativeParaphraseMode) return;

  if (originalExpression && normalizeComparableText(correctText) === normalizeComparableText(originalExpression)) {
    add(
      "error",
      "double-negative-answer-not-transformed",
      "DOUBLE_NEGATIVE blank must use a transformed correct option, not the verbatim originalExpression.",
    );
  }

  if (!hasNegationCue(correctText)) {
    add(
      "error",
      "double-negative-no-option-negation",
      "DOUBLE_NEGATIVE blank correct option must contain a negation cue or negative expression.",
    );
  }

  if (wrongNegationCount < 1) {
    add(
      "error",
      "negative-paraphrase-not-enough-negative-distractors",
      `Correct option must not be the only negative-looking option; expected at least 1 negative-looking wrong option, got ${wrongNegationCount}.`,
    );
  } else if (wrongNegationCount < 2) {
    add(
      "warning",
      "negative-paraphrase-thin-negative-distractors",
      `Negative-paraphrase blank should include at least 2 negative-looking wrong options; got ${wrongNegationCount}.`,
    );
  }

  if (totalNegationCount < 2) {
    add(
      "error",
      "negative-paraphrase-negative-option-shortcut",
      `Negative-paraphrase blank needs at least 2 negative-looking options total, got ${totalNegationCount}.`,
    );
  } else if (totalNegationCount < 3) {
    add(
      "warning",
      "negative-paraphrase-negative-option-shortcut",
      `Negative-paraphrase blank is stronger with at least 3 negative-looking options total; got ${totalNegationCount}.`,
    );
  }

  const slotIssue = findNegativeParaphraseSlotIssue(blankCarrierText, correctText);
  if (slotIssue) {
    add("error", slotIssue.code, slotIssue.message);
  }

  const noSubjectDoubleNegationIssue = findNoSubjectDoubleNegationIssue(
    blankCarrierText,
    correctText,
  );
  if (noSubjectDoubleNegationIssue) {
    add("error", noSubjectDoubleNegationIssue.code, noSubjectDoubleNegationIssue.message);
  }

  const tangledNegationIssue = findTangledNegativeParaphraseIssue(correctText);
  if (tangledNegationIssue) {
    add("error", tangledNegationIssue.code, tangledNegationIssue.message);
  }

  for (const option of options) {
    const optionText = normalizeText(option.text);
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

  const answerLogic = normalizeText(question.answerLogic);
  if (answerLogic.length < 20) {
    add(
      "warning",
      "double-negative-thin-logic",
      "DOUBLE_NEGATIVE blank should include answerLogic explaining the negation trap.",
    );
  }
}

function validateTopicMainIdeaQuestion(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionTexts = options.map((option) => normalizeText(option.text)).filter(Boolean);

  if (typeId === "TOPIC" && !/주제/.test(direction)) {
    add("error", "topic-direction-mismatch", "TOPIC direction must ask for the passage topic.");
  }
  if (typeId === "MAIN_IDEA" && !/(요지|주장)/.test(direction)) {
    add("error", "main-idea-direction-mismatch", "MAIN_IDEA direction must ask for the passage gist or author's claim.");
  }

  if (typeId === "TOPIC") {
    for (const optionText of optionTexts) {
      if (containsHangul(optionText) || !containsLatinLetter(optionText)) {
        add(
          "error",
          "topic-option-language",
          "TOPIC options should be English topic phrases.",
        );
        break;
      }
    }
  } else {
    for (const optionText of optionTexts) {
      if (!containsHangul(optionText)) {
        add(
          "warning",
          "topic-main-idea-option-language",
          `${typeId} options should be Korean statements unless the direction is explicitly a TOPIC item.`,
        );
        break;
      }
    }
  }

  if (typeId === "MAIN_IDEA") {
    const nounPhraseLikeCount = optionTexts.filter((text) =>
      text.length > 0 && !/(다|음|함|됨|해야|필요|중요|가능|있다|없다|된다|준다)[.!?。]?$/.test(text),
    ).length;
    if (nounPhraseLikeCount >= Math.max(3, optionTexts.length - 1)) {
      add(
        "warning",
        "main-idea-title-like-options",
        "MAIN_IDEA options look like topic/title noun phrases; use complete Korean claim statements.",
      );
    }
  }
}

function validateSummaryCompleteMcQuestion(
  question: Record<string, unknown>,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const summary = normalizeText(question.summaryWithBlanks);
  const blanks = Array.isArray(question.blanks) ? question.blanks.filter(isRecord) : [];
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctLabel = normalizeLabel(question.correctAnswer);
  const blankA = findSummaryBlankAnswer(blanks, "(A)");
  const blankB = findSummaryBlankAnswer(blanks, "(B)");

  if (!/요약/.test(direction) || !direction.includes("(A)") || !direction.includes("(B)")) {
    add(
      "error",
      "summary-mc-direction-frame",
      "SUMMARY_COMPLETE_MC direction must ask for the best words for summary blanks (A) and (B).",
    );
  }

  if (!summary) {
    add("error", "summary-mc-missing-summary", "SUMMARY_COMPLETE_MC is missing summaryWithBlanks.");
  }

  if (countLiteral(summary, "(A)") !== 1 || countLiteral(summary, "(B)") !== 1) {
    add(
      "error",
      "summary-mc-blank-marker-count",
      "summaryWithBlanks must contain (A) and (B) exactly once each.",
    );
  }

  if (summary && containsHangul(summary)) {
    add(
      "error",
      "summary-mc-summary-language",
      "SUMMARY_COMPLETE_MC summaryWithBlanks must be an English summary sentence.",
    );
  }

  if (countSentenceEndings(summary.replace(/\([AB]\)/g, "")) > 1) {
    add(
      "warning",
      "summary-mc-summary-too-many-sentences",
      "SUMMARY_COMPLETE_MC summary should be one sentence, not multiple sentences.",
    );
  }

  if (!blankA || !blankB) {
    add(
      "error",
      "summary-mc-missing-blank-answer",
      "SUMMARY_COMPLETE_MC blanks must include answers for both (A) and (B).",
    );
  }

  for (const [label, answer] of [["(A)", blankA], ["(B)", blankB]] as const) {
    if (!answer) continue;
    if (containsHangul(answer) || !containsLatinLetter(answer)) {
      add(
        "error",
        "summary-mc-answer-language",
        `${label} answer must be an English word or phrase.`,
      );
      break;
    }
    const normalizedAnswer = normalizeComparableText(answer);
    if (
      normalizedAnswer.length >= 4 &&
      normalizeComparableText(summary).includes(normalizedAnswer)
    ) {
      add(
        "error",
        "summary-mc-answer-leaks-in-summary",
        `${label} answer appears in summaryWithBlanks; the student-facing summary must hide the answer behind the blank marker.`,
      );
      break;
    }
  }

  if (summary && blankA && blankB) {
    const filledSummary = summary
      .replace("(A)", blankA)
      .replace("(B)", blankB);
    const awkwardCollocation = findAwkwardSummaryMcCollocation(filledSummary);
    if (awkwardCollocation) {
      add(
        "error",
        "summary-mc-awkward-collocation",
        `SUMMARY_COMPLETE_MC filled summary has an awkward English collocation: ${awkwardCollocation}.`,
      );
    }
  }

  if (!correctLabel) {
    add("error", "summary-mc-correct-answer-mismatch", "SUMMARY_COMPLETE_MC correctAnswer must be an option label.");
  }

  const optionPairs = options.map((option) => ({
    label: normalizeLabel(option.label),
    ...readSummaryPairOption(option),
  }));
  const correctPair = optionPairs.find((option) => option.label === correctLabel);

  if (!correctPair) {
    add(
      "error",
      "summary-mc-correct-answer-mismatch",
      "SUMMARY_COMPLETE_MC correctAnswer does not point to an existing option pair.",
    );
  } else if (
    blankA &&
    blankB &&
    (normalizeComparableText(correctPair.blankA) !== normalizeComparableText(blankA) ||
      normalizeComparableText(correctPair.blankB) !== normalizeComparableText(blankB))
  ) {
    add(
      "error",
      "summary-mc-correct-pair-mismatch",
      "SUMMARY_COMPLETE_MC correct option pair must match the blanks answers exactly.",
    );
  }

  let hasAOnlyTrap = false;
  let hasBOnlyTrap = false;
  let malformedPairFound = false;
  let nonEnglishPairFound = false;

  for (const pair of optionPairs) {
    if (!pair.blankA || !pair.blankB) {
      malformedPairFound = true;
      continue;
    }
    const pairText = `${pair.blankA} ${pair.blankB}`;
    if (containsHangul(pairText) || !containsLatinLetter(pairText)) {
      nonEnglishPairFound = true;
    }
    if (pair.label !== correctLabel && blankA && blankB) {
      const aMatches = normalizeComparableText(pair.blankA) === normalizeComparableText(blankA);
      const bMatches = normalizeComparableText(pair.blankB) === normalizeComparableText(blankB);
      if (aMatches && !bMatches) hasAOnlyTrap = true;
      if (!aMatches && bMatches) hasBOnlyTrap = true;
    }
  }

  if (malformedPairFound) {
    add(
      "error",
      "summary-mc-option-pair-shape",
      "Every SUMMARY_COMPLETE_MC option must provide both blankA and blankB, or a clearly paired text value.",
    );
  }

  if (nonEnglishPairFound) {
    add(
      "error",
      "summary-mc-option-language",
      "SUMMARY_COMPLETE_MC options must be English-only paired expressions.",
    );
  }

  if (!hasAOnlyTrap || !hasBOnlyTrap) {
    add(
      "error",
      "summary-mc-missing-half-correct-traps",
      "SUMMARY_COMPLETE_MC should include at least one A-only-correct trap and one B-only-correct trap.",
    );
  }

  if (requestedDifficulty === "KILLER" && blankA && blankB && correctLabel) {
    validateKillerSummaryTrapStrength(optionPairs, correctLabel, blankA, blankB, add);
  }

  const wrongExplanations =
    question.wrongOptionExplanations &&
    typeof question.wrongOptionExplanations === "object" &&
    !Array.isArray(question.wrongOptionExplanations)
      ? (question.wrongOptionExplanations as Record<string, unknown>)
      : {};
  if (
    Object.values(wrongExplanations).some(
      (explanation) =>
        typeof explanation === "string" &&
        /대조군\s*설계|control\s+group|control\s+design/i.test(explanation),
    )
  ) {
    add(
      "warning",
      "summary-mc-explanation-experimental-jargon",
      "Wrong-option explanations should say 선지 배열상/지문 논리상, not 대조군 설계 or experimental control-group jargon.",
    );
  }
}

function validateKillerSummaryTrapStrength(
  optionPairs: Array<{ label: string; blankA: string; blankB: string; text: string }>,
  correctLabel: string,
  blankA: string,
  blankB: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const correctA = normalizeComparableText(blankA);
  const correctB = normalizeComparableText(blankB);
  const wrongPairs = optionPairs.filter((pair) => pair.label !== correctLabel);
  const aOnlyPairs = wrongPairs.filter(
    (pair) => normalizeComparableText(pair.blankA) === correctA && normalizeComparableText(pair.blankB) !== correctB,
  );
  const bOnlyPairs = wrongPairs.filter(
    (pair) => normalizeComparableText(pair.blankA) !== correctA && normalizeComparableText(pair.blankB) === correctB,
  );

  const blankAFamily = summarySemanticFamily(blankA);
  const blankBFamily = summarySemanticFamily(blankB);
  const hasCompetitiveBWithCorrectA = aOnlyPairs.some((pair) =>
    sameSummarySemanticField(pair.blankB, blankB),
  );
  const hasCompetitiveAWithCorrectB = bOnlyPairs.some((pair) =>
    sameSummarySemanticField(pair.blankA, blankA),
  );

  const strongBTrapBuriedBehindWrongA = wrongPairs.some(
    (pair) =>
      normalizeComparableText(pair.blankA) !== correctA &&
      normalizeComparableText(pair.blankB) !== correctB &&
      sameSummarySemanticField(pair.blankB, blankB),
  );
  const strongATrapBuriedBehindWrongB = wrongPairs.some(
    (pair) =>
      normalizeComparableText(pair.blankA) !== correctA &&
      normalizeComparableText(pair.blankB) !== correctB &&
      sameSummarySemanticField(pair.blankA, blankA),
  );

  if (blankBFamily && !hasCompetitiveBWithCorrectA) {
    add(
      "error",
      "summary-mc-killer-weak-b-trap",
      "KILLER SUMMARY_COMPLETE_MC needs a genuinely tempting wrong blankB paired with the correct blankA.",
    );
  }
  if (blankAFamily && !hasCompetitiveAWithCorrectB) {
    add(
      "error",
      "summary-mc-killer-weak-a-trap",
      "KILLER SUMMARY_COMPLETE_MC needs a genuinely tempting wrong blankA paired with the correct blankB.",
    );
  }
  if (blankBFamily && strongBTrapBuriedBehindWrongA && !hasCompetitiveBWithCorrectA) {
    add(
      "error",
      "summary-mc-killer-buried-b-trap",
      "A strong blankB trap is paired with an easily removable blankA; pair it with the correct blankA instead.",
    );
  }
  if (blankAFamily && strongATrapBuriedBehindWrongB && !hasCompetitiveAWithCorrectB) {
    add(
      "error",
      "summary-mc-killer-buried-a-trap",
      "A strong blankA trap is paired with an easily removable blankB; pair it with the correct blankB instead.",
    );
  }

  const plausibleWrongACount = new Set(
    wrongPairs
      .map((pair) => pair.blankA)
      .filter((value) => sameSummarySemanticField(value, blankA))
      .map(normalizeComparableText),
  ).size;
  const plausibleWrongBCount = new Set(
    wrongPairs
      .map((pair) => pair.blankB)
      .filter((value) => sameSummarySemanticField(value, blankB))
      .map(normalizeComparableText),
  ).size;

  if (blankAFamily && plausibleWrongACount < 1) {
    add(
      "error",
      "summary-mc-killer-too-easy-a-column",
      "KILLER SUMMARY_COMPLETE_MC blankA column is too easy; include at least one same-field wrong blankA.",
    );
  }
  if (blankBFamily && plausibleWrongBCount < 1) {
    add(
      "error",
      "summary-mc-killer-too-easy-b-column",
      "KILLER SUMMARY_COMPLETE_MC blankB column is too easy; include at least one same-field wrong blankB.",
    );
  }
}

const SUMMARY_SEMANTIC_FAMILIES: Record<string, string[]> = {
  altruistic: [
    "altruistic",
    "cooperative",
    "supportive",
    "prosocial",
    "communal",
    "collaborative",
    "helpful",
    "helping",
    "caregiving",
    "nurturing",
    "selfless",
    "family-oriented",
    "intergenerational",
  ],
  evolutionary: [
    "evolutionary",
    "evolutionarily",
    "evolved",
    "adaptive",
    "adaptively",
    "biological",
    "biologically",
    "genetic",
    "genetically",
    "hereditary",
    "hereditarily",
    "inherited",
    "heritable",
    "generational",
    "generationally",
    "reproductive",
    "reproductively",
    "selected",
    "selective",
  ],
  responsibility: [
    "responsibility",
    "responsible",
    "accountability",
    "accountable",
    "judgment",
    "judgement",
    "ethical",
    "moral",
    "value-based",
    "human",
    "decision-making",
  ],
  technology: [
    "technological",
    "technology",
    "technical",
    "digital",
    "algorithmic",
    "automated",
    "mechanical",
    "computational",
  ],
  equality: [
    "equality",
    "equity",
    "equitable",
    "opportunity",
    "inclusive",
    "access",
    "accessible",
    "participation",
    "social",
  ],
  environmental: [
    "environmental",
    "ecological",
    "sustainable",
    "green",
    "local",
    "urban",
    "community",
    "communal",
    "social",
  ],
};

function summarySemanticFamily(value: string): string | null {
  const normalized = normalizeComparableText(value);
  if (!normalized) return null;
  for (const [family, words] of Object.entries(SUMMARY_SEMANTIC_FAMILIES)) {
    if (words.some((word) => normalized.includes(normalizeComparableText(word)))) {
      return family;
    }
  }
  return null;
}

function sameSummarySemanticField(candidate: string, correct: string): boolean {
  const candidateComparable = normalizeComparableText(candidate);
  const correctComparable = normalizeComparableText(correct);
  if (!candidateComparable || !correctComparable || candidateComparable === correctComparable) {
    return false;
  }

  const candidateFamily = summarySemanticFamily(candidate);
  const correctFamily = summarySemanticFamily(correct);
  if (candidateFamily && correctFamily && candidateFamily === correctFamily) {
    return true;
  }

  const candidateTokens = contentTokens(candidate);
  const correctTokens = contentTokens(correct);
  if (candidateTokens.size > 0 && correctTokens.size > 0) {
    return countTokenOverlap(candidateTokens, correctTokens) > 0;
  }

  return (
    candidateComparable.length >= 6 &&
    correctComparable.length >= 6 &&
    (candidateComparable.includes(correctComparable.slice(0, 6)) ||
      correctComparable.includes(candidateComparable.slice(0, 6)))
  );
}

function findSummaryBlankAnswer(
  blanks: Record<string, unknown>[],
  expectedLabel: "(A)" | "(B)",
): string {
  const normalizedExpected = expectedLabel.replace(/[()]/g, "").toLowerCase();
  const blank = blanks.find((item) => {
    const label = normalizeText(item.label).replace(/[()]/g, "").toLowerCase();
    return label === normalizedExpected;
  });
  return normalizeText(blank?.answer);
}

function readSummaryPairOption(option: Record<string, unknown>): {
  blankA: string;
  blankB: string;
  text: string;
} {
  const text = normalizeText(option.text);
  const explicitA = normalizeText(option.blankA);
  const explicitB = normalizeText(option.blankB);
  if (explicitA || explicitB) {
    return { blankA: explicitA, blankB: explicitB, text };
  }

  const stripped = stripSummaryOptionPrefix(text);
  const parts = stripped
    .split(/\s*(?:……|\.{3,}|…|\/|\||;|,|\s[-–—]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return { blankA: parts[0], blankB: parts.slice(1).join(" "), text };
  }

  return { blankA: "", blankB: "", text };
}

function stripSummaryOptionPrefix(text: string): string {
  return text
    .replace(
      /^\s*(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\((?:[A-Ja-j]|\d{1,3})\)|(?:[A-Ja-j]|\d{1,3})[.)])\s*/,
      "",
    )
    .trim();
}

function countLiteral(text: string, literal: string): number {
  if (!text || !literal) return 0;
  return text.split(literal).length - 1;
}

function countSentenceEndings(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches?.length ?? 0;
}

function findAwkwardSummaryMcCollocation(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const patterns: RegExp[] = [
    /\b(?:question|matter|issue|problem)\s+of\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\s+to\s+[a-z]+ing\b/i,
    /\b(?:equity|equality|opportunity|responsibility)\s+to\s+[a-z]+ing\b/i,
    /\b(?:a|the)\s+(?:question|matter|issue|problem)\s+of\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}\s+for\s+[a-z]+ing\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
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

function validateImpliedMeaningQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const underlinedExpression = normalizeText(question.underlinedExpression);
  const passageWithUnderline = normalizeText(question.passageWithUnderline);
  const surfaceMeaning = normalizeText(question.surfaceMeaning);
  const impliedMeaning = normalizeText(question.impliedMeaning);
  const reasoningGap = normalizeText(question.reasoningGap);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctLabel = normalizeLabel(question.correctAnswer);
  const correctOption = options.find((option) => normalizeLabel(option.label) === correctLabel);
  const correctText = normalizeText(correctOption?.text);
  const expressionTokenCount = countContentTokens(underlinedExpression);
  const optionTexts = options.map((option) => normalizeText(option.text)).filter(Boolean);

  if (!underlinedExpression) {
    add("error", "implied-meaning-missing-expression", "IMPLIED_MEANING is missing underlinedExpression.");
    return;
  }

  for (const optionText of optionTexts) {
    if (containsHangul(optionText)) {
      add(
        "error",
        "implied-meaning-option-language",
        "IMPLIED_MEANING options must be English-only; Korean text was found in an option.",
      );
      break;
    }
    if (!containsLatinLetter(optionText)) {
      add(
        "error",
        "implied-meaning-option-not-english",
        `IMPLIED_MEANING option is not a usable English phrase: ${optionText.slice(0, 80)}.`,
      );
      break;
    }
    if (englishWordCount(optionText) < 3) {
      add(
        "warning",
        "implied-meaning-option-too-short",
        "IMPLIED_MEANING options should be meaningful English phrases or clauses, not one- or two-word labels.",
      );
      break;
    }
  }

  if (!passageWithUnderline.includes("__")) {
    add("error", "implied-meaning-missing-underline", "IMPLIED_MEANING passageWithUnderline must include one underlined expression.");
  }

  if (countUnderlineMarkers(passageWithUnderline) !== 1) {
    add("error", "implied-meaning-underline-count", "IMPLIED_MEANING must contain exactly one underline marker.");
  }

  if (isSingleEnglishToken(underlinedExpression)) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-single-word-target",
      "IMPLIED_MEANING should underline a phrase, clause, or short sentence, not a single word.",
    );
  }

  if (isTinyFunctionWord(underlinedExpression) || expressionTokenCount < 2) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-target-too-short",
      "IMPLIED_MEANING target is too small to support real implied-meaning inference.",
    );
  }

  if (underlinedExpression.length > 190 || expressionTokenCount > 18) {
    add(
      "warning",
      "implied-meaning-target-too-long",
      "IMPLIED_MEANING target is very long and may become a main-idea item rather than a focused underline item.",
    );
  }

  if (isQuestionLikeImpliedMeaningTarget(underlinedExpression)) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-rhetorical-question-target",
      "IMPLIED_MEANING should not use a rhetorical/self-answering question as the underline target.",
    );
  }

  if (requestedDifficulty === "KILLER") {
    if (surfaceMeaning.length < 12) {
      add(
        "error",
        "implied-meaning-missing-surface-meaning",
        "KILLER IMPLIED_MEANING must include surfaceMeaning so the surface-to-hidden gap can be audited.",
      );
    }
    if (reasoningGap.length < 28) {
      add(
        "error",
        "implied-meaning-thin-reasoning-gap",
        "KILLER IMPLIED_MEANING must explain the real surface-to-hidden meaning gap, not just restate the answer.",
      );
    }
  }

  if (passage && !normalizeComparableText(passage).includes(normalizeComparableText(underlinedExpression))) {
    add(
      "error",
      "implied-meaning-target-not-in-passage",
      `underlinedExpression is not found in the original passage: ${underlinedExpression.slice(0, 80)}.`,
    );
  }

  if (passage) {
    const sentenceContext = findExpressionSentenceContext(
      passage,
      underlinedExpression,
    );
    const targetSentenceInfo = findExpressionSentenceContextWithIndex(
      passage,
      underlinedExpression,
    );
    if (
      targetSentenceInfo &&
      !isCentralImpliedMeaningTarget(
        targetSentenceInfo.sentence,
        targetSentenceInfo.index,
        targetSentenceInfo.total,
        underlinedExpression,
      )
    ) {
      add(
        requestedDifficulty === "KILLER" ? "error" : "warning",
        "implied-meaning-noncentral-target",
        "IMPLIED_MEANING underline should be a central-claim paraphrase, metaphor, compressed conclusion, or topic/gist-level expression, not a peripheral detail.",
      );
    }
    const directLeak = sentenceContext
      ? findDirectAnswerLeakage(underlinedExpression, sentenceContext.next)
      : null;
    if (directLeak) {
      add(
        requestedDifficulty === "KILLER" ? "error" : "warning",
        "implied-meaning-direct-answer-leak",
        `The underline is too directly answered by the next sentence: ${directLeak}.`,
      );
    }

    if (
      requestedDifficulty === "KILLER" &&
      sentenceContext?.next &&
      hasDirectExplanationCue(sentenceContext.next) &&
      !hasSurfaceHiddenGapSignal(underlinedExpression, reasoningGap)
    ) {
      add(
        "warning",
        "implied-meaning-low-surface-gap",
        "The target looks like a direct main-idea paraphrase rather than a high-gap implied-meaning target.",
      );
    }
  }

  if (
    correctText &&
    impliedMeaning &&
    containsHangul(correctText) === containsHangul(impliedMeaning) &&
    normalizeComparableText(correctText) !== normalizeComparableText(impliedMeaning) &&
    countMeaningTokenOverlap(meaningTokens(correctText), meaningTokens(impliedMeaning)) < 2
  ) {
    add(
      "warning",
      "implied-meaning-answer-summary-mismatch",
      "impliedMeaning should match the correct option's core meaning closely enough to audit the answer.",
    );
  }

  if (correctText.length > 0 && correctText.length < 8) {
    add(
      "warning",
      "implied-meaning-shallow-correct-option",
      "IMPLIED_MEANING correct option is too short to express a real implied meaning.",
    );
  }

  const evidenceChain = Array.isArray(question.evidenceChain)
    ? question.evidenceChain.map((item: unknown) => normalizeText(item)).filter(Boolean)
    : [];
  if (evidenceChain.length < 2) {
    add(
      requestedDifficulty === "KILLER" ? "error" : "warning",
      "implied-meaning-thin-evidence-chain",
      "IMPLIED_MEANING should include at least two evidenceChain steps.",
    );
  }

  if (!passage || !correctText) return;

  const attractiveWrongCount = countAttractiveImpliedMeaningWrongOptions(
    options,
    correctLabel,
    passage,
    correctText,
    underlinedExpression,
    impliedMeaning,
  );
  if (requestedDifficulty === "KILLER" && attractiveWrongCount < 2) {
    add(
      "warning",
      "implied-meaning-weak-distractors",
      "KILLER IMPLIED_MEANING should have at least two near-miss wrong options anchored in passage concepts.",
    );
  }

  if (requestedDifficulty === "KILLER") {
    const absoluteCue = findImpliedMeaningAbsoluteGiveawayOption(
      options,
      correctLabel,
      passage,
    );
    if (absoluteCue) {
      add(
        "error",
        "implied-meaning-absolute-giveaway-option",
        `KILLER IMPLIED_MEANING has an easily eliminated absolute-word distractor: ${absoluteCue}.`,
      );
    }
  }
}

function countAttractiveImpliedMeaningWrongOptions(
  options: Record<string, unknown>[],
  correctLabel: string,
  passage: string,
  correctText: string,
  underlinedExpression: string,
  impliedMeaning: string,
): number {
  const passageTokens = contentTokens(passage);
  const correctTokens = meaningTokens(correctText);
  const impliedTokens = meaningTokens(impliedMeaning || underlinedExpression);

  return options
    .filter((option) => normalizeLabel(option.label) !== correctLabel)
    .filter((option) => {
      const text = normalizeText(option.text);
      const tokens = meaningTokens(text);
      return (
        text.length >= 18 ||
        countTokenOverlap(contentTokens(text), passageTokens) >= 1 ||
        countMeaningTokenOverlap(tokens, correctTokens) >= 1 ||
        countMeaningTokenOverlap(tokens, impliedTokens) >= 1
      );
    }).length;
}

function isQuestionLikeImpliedMeaningTarget(expression: string): boolean {
  const text = expression.trim();
  return (
    /[?？]\s*$/.test(text) ||
    /^(?:what|why|how|when|where|which|who|whom|whose)\b/i.test(text)
  );
}

function findExpressionSentenceContext(
  passage: string,
  expression: string,
): { previous: string; sentence: string; next: string } | null {
  const sentences = splitPassageSentences(passage, { includeShort: true });
  const comparableExpression = normalizeComparableText(expression).replace(/[.!?]+$/, "");
  if (!comparableExpression) return null;

  const index = sentences.findIndex((sentence) =>
    normalizeComparableText(sentence).includes(comparableExpression),
  );
  if (index === -1) return null;

  return {
    previous: sentences[index - 1] ?? "",
    sentence: sentences[index],
    next: sentences[index + 1] ?? "",
  };
}

function findExpressionSentenceContextWithIndex(
  passage: string,
  expression: string,
): { previous: string; sentence: string; next: string; index: number; total: number } | null {
  const sentences = splitPassageSentences(passage, { includeShort: true });
  const comparableExpression = normalizeComparableText(expression).replace(/[.!?]+$/, "");
  if (!comparableExpression) return null;

  const index = sentences.findIndex((sentence) =>
    normalizeComparableText(sentence).includes(comparableExpression),
  );
  if (index === -1) return null;

  return {
    previous: sentences[index - 1] ?? "",
    sentence: sentences[index],
    next: sentences[index + 1] ?? "",
    index,
    total: sentences.length,
  };
}

function isCentralImpliedMeaningTarget(
  sentence: string,
  sentenceIndex: number,
  sentenceCount: number,
  expression: string,
): boolean {
  if (sentenceIndex >= Math.max(0, sentenceCount - 2)) return true;
  if (hasCentralClaimCue(sentence)) return true;
  if (hasFigurativeOrCompressedSignal(expression)) return true;
  return false;
}

function hasCentralClaimCue(sentence: string): boolean {
  return /\b(?:central issue|in the end|for that reason|therefore|thus|consequently|as a result|this is why|the point|the lesson|a durable solution|a serious .* must|must therefore|not whether|not merely|rather than|instead of|does not mean|it shows that|ultimately|the craft of|the result is|the consequence is)\b/i.test(sentence);
}

function hasFigurativeOrCompressedSignal(expression: string): boolean {
  return /\b(?:creatures?|beggar|grave|mirror|lens|map|upstream|downstream|weight|carry|sculpt|sculpting|craft|discipline|reorganized|shifted|tool that helps|changed what counted|lies between)\b/i.test(expression);
}

function findDirectAnswerLeakage(expression: string, nextSentence: string): string | null {
  if (!nextSentence) return null;

  const expressionText = normalizeComparableText(expression);
  const nextText = normalizeComparableText(nextSentence);
  const questionLike = isQuestionLikeImpliedMeaningTarget(expression);
  const placeholderLike = /\b(?:something|somewhere|someone|somebody|what|why|how)\b/i.test(expressionText);

  if ((questionLike || placeholderLike) && hasDirectExplanationCue(nextSentence)) {
    return nextSentence.slice(0, 120);
  }

  if (
    /\bbased on (?:something|what|why|which)\b/i.test(expressionText) &&
    /\bbased on\b/i.test(nextText)
  ) {
    return nextSentence.slice(0, 120);
  }

  if (
    /\breasons?\b/i.test(expressionText) &&
    /\breasons?\b[\s\S]{0,80}\b(?:ultimately|based on|come from|derive from)\b/i.test(nextSentence)
  ) {
    return nextSentence.slice(0, 120);
  }

  return null;
}

function hasDirectExplanationCue(sentence: string): boolean {
  return /\b(?:the answer|this means|that means|in other words|that is|namely|ultimately|is based on|are based on|based on|is that|are that|because|since|therefore|thus|for this reason)\b/i.test(sentence);
}

function hasSurfaceHiddenGapSignal(expression: string, reasoningGap: string): boolean {
  const combined = `${expression} ${reasoningGap}`;
  return (
    /\b(?:not merely|not simply|rather than|instead of|while|although|whereas|but|yet|creatures?|beggar|currency|map|mirror|bridge|mask|lens|architecture|grave|shadow|tool|upstream|downstream|answerable|reorganized|surface|hidden|literal|metaphor|표면|직역|비유|압축|대조|역설|겉보기|실제|함축|간극)\b/i.test(combined) ||
    /[가-힣]*(?:표면|직역|비유|압축|대조|역설|겉보기|실제|함축|간극)[가-힣]*/.test(combined)
  );
}

function findImpliedMeaningAbsoluteGiveawayOption(
  options: Record<string, unknown>[],
  correctLabel: string,
  passage: string,
): string | null {
  const passageText = normalizeComparableText(passage);
  const cues: Array<[string, RegExp, RegExp?]> = [
    ["완전히", /완전(?:히|하게)/, /\b(?:completely|entirely|fully)\b/i],
    ["완전히 극복/해결", /완전(?:히|하게)\s*(?:극복|해소|해결|제거|사라지|대체)/, /\b(?:completely|entirely|fully)\s+(?:overcome|solve|eliminate|remove|replace)\b/i],
    ["전적으로", /전적(?:으로|인)/, /\b(?:entirely|solely|exclusively)\b/i],
    ["항상", /항상/, /\balways\b/i],
    ["언제나", /언제나/, /\balways\b/i],
    ["절대", /절대/, /\bnever\b/i],
    ["오직", /오직/, /\b(?:only|solely|exclusively)\b/i],
    ["무조건", /무조건/, /\bwithout exception\b/i],
    ["반드시", /반드시/, /\bmust\b/i],
    ["예외 없이", /예외\s*없이/, /\bwithout exception\b/i],
    ["해야만", /(?:해야만|하여야만|일\s*때만)/],
    ["만을/만이/만으로", /(?:만을|만이|만으로(?:는|도)?)/],
    ["배제", /배제/],
    ["완벽한/완벽하게", /완벽(?:한|히|하게)?/],
    ["완벽하게 이해/설명/해결", /완벽(?:히|하게)?\s*(?:이해|파악|분석|설명|해결|예측|통제|보장|대체)/, /\bperfect(?:ly)?\s+(?:understand|grasp|analyze|explain|solve|predict|control|guarantee|replace)\b/i],
    ["always", /\balways\b/i],
    ["never", /\bnever\b/i],
    ["completely", /\bcompletely\b/i],
    ["entirely", /\bentirely\b/i],
    ["solely", /\bsolely\b/i],
    ["exclusively", /\bexclusively\b/i],
    ["only", /\bonly\b/i],
  ];

  for (const option of options) {
    if (normalizeLabel(option.label) === correctLabel) continue;
    const text = normalizeText(option.text);
    for (const [label, pattern, passagePattern] of cues) {
      if (!pattern.test(text)) continue;
      if (passagePattern?.test(passage) || passageText.includes(label.toLowerCase())) {
        continue;
      }
      return `${normalizeText(option.label) || "wrong option"} contains "${label}"`;
    }
  }

  return null;
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
  const slotCount = sentences.length;
  if (slotCount !== IRRELEVANT_SLOT_MIN) {
    add("error", "irrelevant-sentence-count", `IRRELEVANT must have exactly ${IRRELEVANT_SLOT_MIN} marked sentences, got ${slotCount}.`);
    return;
  }

  if (sentences.some((sentence) => !sentence)) {
    add("error", "empty-irrelevant-sentence", "IRRELEVANT contains an empty numbered sentence.");
    return;
  }

  const irrelevantIndex = Number(question.irrelevantIndex);
  if (!Number.isInteger(irrelevantIndex) || irrelevantIndex < 0 || irrelevantIndex >= slotCount) {
    add("error", "irrelevant-index-range", `irrelevantIndex must be an integer from 0 to ${slotCount - 1}.`);
    return;
  }
  if (irrelevantIndex === 0 || irrelevantIndex === slotCount - 1) {
    add(
      "error",
      "irrelevant-index-edge",
      "IRRELEVANT answer cannot be the first or last numbered sentence.",
    );
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
  const expectedLabels = Array.from({ length: slotCount }, (_, index) => String(index + 1));
  if (optionLabels.length === slotCount && optionLabels.some((label, index) => label !== expectedLabels[index])) {
    add(
      "warning",
      "irrelevant-option-labels",
      `IRRELEVANT options should be ordered ①~${getCircledNumber(slotCount - 1)}.`,
    );
  }

  if (!passage) return;

  const sourceSlots = sentences
    .map((sentence, index) => ({ sentence, slotIndex: index }))
    .filter(({ slotIndex }) => slotIndex !== irrelevantIndex);
  const sourceSentences = sourceSlots.map(({ sentence }) => sentence);
  const passageSentences = splitPassageSentences(passage, { includeShort: true });
  const usedPassageSentenceIndices = new Set<number>();
  const matchedSourceSlots: Array<{ slotIndex: number; passageIndex: number }> = [];

  for (const { sentence: sourceSentence, slotIndex } of sourceSlots) {
    const passageIndex = findComparablePassageSentenceIndex(
      passageSentences,
      sourceSentence,
      usedPassageSentenceIndices,
    );
    if (passageIndex === -1) {
      add(
        "error",
        "irrelevant-source-not-verbatim",
        `A non-answer sentence is not copied verbatim from the passage: ${sourceSentence.slice(0, 80)}`,
      );
    } else {
      usedPassageSentenceIndices.add(passageIndex);
      matchedSourceSlots.push({ slotIndex, passageIndex });
      if (passageIndex === 0) {
        add(
          "error",
          "irrelevant-source-first-sentence",
          "The original first passage sentence must not appear as a numbered choice in IRRELEVANT questions.",
        );
      }
    }
  }

  if (matchedSourceSlots.length === slotCount - 1) {
    const orderedMatches = matchedSourceSlots
      .slice()
      .sort((a, b) => a.slotIndex - b.slotIndex);
    const passageIndices = orderedMatches.map((match) => match.passageIndex);
    const isOriginalOrder = passageIndices.every(
      (passageIndex, index) =>
        index === 0 || passageIndex > passageIndices[index - 1],
    );

    // The marked source sentences may be SPREAD across the passage (they no
    // longer have to be a contiguous early block), but they must keep their
    // original passage order so the inserted sentence sits between two real
    // consecutive neighbors and the remove-and-reconnect test stays valid.
    if (!isOriginalOrder) {
      add(
        "error",
        "irrelevant-source-order",
        "The non-answer sentences must appear in their original passage order.",
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

    const counterclaimCue = findNewCounterclaimCue(insertedSentence, passage);
    if (counterclaimCue) {
      add(
        "error",
        "irrelevant-obvious-counterclaim-cue",
        `KILLER IRRELEVANT should not be exposed by an explicit counterclaim cue: ${counterclaimCue}.`,
      );
    }

    const prescriptiveCue = findPrescriptiveGiveawayCue(insertedSentence);
    if (prescriptiveCue) {
      add(
        "error",
        "irrelevant-prescriptive-giveaway",
        `KILLER IRRELEVANT should not be exposed by a blunt advice/policy cue: ${prescriptiveCue}.`,
      );
    }

    // Generic "agent + must/should/need to" advice dropped into a purely
    // descriptive passage is a register tell — unless the passage itself already
    // gives advice in that modal register.
    const adviceCue =
      /\b(?:designers?|managers?|users?|students?|teachers?|people|companies|individuals?|readers?|scientists?|researchers?|one|we|you)\s+(?:must|should|need\s+to|have\s+to|ought\s+to)\b/i;
    const passageHasAdviceRegister = /\b(?:must|should|ought\s+to)\b/i.test(passage);
    if (adviceCue.test(insertedSentence) && !passageHasAdviceRegister) {
      add(
        "error",
        "irrelevant-prescriptive-advice",
        "The inserted sentence gives direct advice (agent + must/should/need to) that is out of register for the descriptive passage.",
      );
    }

    // Methodology / procedure / measurement drift — the most common Gemini tell:
    // the inserted sentence pivots from the passage's idea into "to measure/
    // optimize/calculate X you need a procedure/equipment/tool". Passage-gated.
    const methodologyDriftPatterns: Array<[string, RegExp]> = [
      ["procedure/process requires", /\b(?:the\s+)?(?:procedure|process|method|technique|protocol|system|approach)\s+(?:requires|involves|demands|entails|relies\s+on|depends\s+on)\b/i],
      ["it is essential/necessary to", /\bit\s+is\s+(?:essential|necessary|crucial|vital|important|imperative)\s+to\b/i],
      ["methodology gerund lead", /^(?:in\s+\w+,?\s+|while\s+[^,]+,\s+)?(?:measuring|optimi[sz]ing|calculating|quantifying|standardi[sz]ing|categori[sz]ing|catalogu?ing|indexing|monitoring|storing|organi[sz]ing|tracking)\b/i],
      ["to measure/optimize/...", /\bto\s+(?:measure|optimi[sz]e|calculate|quantify|standardi[sz]e|categori[sz]e|monitor|index|catalog|track)\b/i],
      ["measure/track the precise/exact", /\b(?:measure|track|calculate|monitor|quantify)\s+(?:the\s+)?(?:precise|exact|accurate)\b/i],
      ["requires precise/sufficient/advanced", /\brequires?\s+(?:the\s+)?(?:precise|exact|sufficient|accurate|advanced|specialized|highly|careful)\b/i],
      ["laboratory/equipment drift", /\b(?:laborator|lab)\w*\s+(?:equipment|procedures?|techniques?|settings?)\b/i],
      ["automated tracking/tooling", /\bautomat(?:ed|ically)\s+(?:track|monitor|catalog|index|record)\w*\b/i],
      ["develop/build tools/equipment", /\b(?:develop|building|build|design|implement|install)\w*\s+\w*\s*(?:tools?|equipment|software|systems?|infrastructure|mechanisms?|tutorials?|dashboards?|devices?)\b/i],
    ];
    const methodologyDrift = methodologyDriftPatterns.find(
      ([, re]) => re.test(insertedSentence) && !re.test(passage),
    );
    if (methodologyDrift) {
      add(
        "error",
        "irrelevant-methodology-drift",
        `The inserted sentence drifts into a methodology/procedure/measurement/tooling sub-topic, a recognizable AI-generator tell: ${methodologyDrift[0]}.`,
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
  if (/\b(?:cannot|can't|not|never|no|none|neither|nor|little|few|hardly|rarely|scarcely|seldom|without|fail|fails|failed|failing|failure|lack|lacks|lacking|absence|absent|devoid|barrier|obstacle|enemy|unable|impossible|irrational|prevent|prevents|preventing|keep|keeps|keeping|exclude|excludes|excluding|eliminate|eliminates|eliminating|reject|rejects|rejecting|neglect|neglects|neglecting|collapse|collapses|collapsing|erosion|erode|erodes|eroding|compromise|compromises|compromising|undermine|undermines|undermining|disconnect|disconnects|disconnected|isolate|isolates|isolated|drift|drifts|drifting)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:non-[a-z]+|nonreason|nonrational|unconnected|unchanged|unclear|uncertain|undefended|unprotected|uncontrolled|unfocused|unproductive|unresolved|unjustified|incapable|incomplete|inaccurate|inconsistent|insufficient|ineffective|imprecise|imbalanced|irrelevant|irregular|disordered|disorganized|misdirected|misleading)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:anything but|nothing but|other than|free from|not based on|not derived from|not a result of|not beyond|not independent of|not distorted by|not undermining|rather than)\b/i.test(text)) {
    return true;
  }
  return false;
}

function negationCueCount(text: string): number {
  if (!text) return 0;
  const patterns = [
    /\b(?:cannot|can't|not|never|no|none|neither|nor|little|few|hardly|rarely|scarcely|seldom|without|fail|fails|failed|failing|failure|lack|lacks|lacking|absence|absent|devoid|unable|impossible)\b/gi,
    /\b(?:prevent|prevents|preventing|keep|keeps|keeping|free from|anything but|nothing but|other than|exclude|excludes|excluding|undermine|undermines|undermining|compromise|compromises|compromising)\b/gi,
    /\b(?:non-[a-z]+|nonreason|nonrational|unconnected|unchanged|unclear|uncertain|undefended|unprotected|uncontrolled|unfocused|unproductive|unresolved|unjustified|incapable|incomplete|inaccurate|inconsistent|insufficient|ineffective|imprecise|imbalanced|irrelevant|irregular|disconnected|disordered|disorganized|misdirected|misleading)\b/gi,
  ];
  return patterns.reduce((sum, pattern) => sum + [...text.matchAll(pattern)].length, 0);
}

function isSingleAbstractNounTarget(text: string): boolean {
  return /^(?:variation|diversity|complexity|simplicity|trust|efficiency|confidence|comfort|progress|order|freedom|creativity|reason|emotion|memory|feedback|logic|reasoning|value|values|calculation)$/i.test(text.trim());
}

function isListLikeBlankTarget(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.includes(":") ||
    normalized.includes(";") ||
    normalized.includes(",") ||
    normalized.length > 90 ||
    countContentTokens(normalized) > 11
  );
}

function findNegativeParaphraseSlotIssue(
  blankCarrierText: string,
  correctText: string,
): { code: string; message: string } | null {
  const blankIndex = blankCarrierText.indexOf("_____");
  if (blankIndex < 0) return null;

  const leftOfBlank = blankCarrierText.slice(0, blankIndex);
  const followsCopula = /\b(?:is|are|was|were|be|being|been|become|becomes|became|remain|remains|seem|seems)\s+$/i.test(leftOfBlank);
  const followsPreposition = /\b(?:by|of|to|for|with|without|from|in|on|at|as|than|about|toward|towards)\s+$/i.test(leftOfBlank);
  const followsModal = /\b(?:can|could|should|would|will|must|may|might)\s+$/i.test(leftOfBlank);
  const followsModalBe = /\b(?:can|could|should|would|will|must|may|might)(?:\s+\w+ly)?\s+be\s+$/i.test(leftOfBlank);
  const followsInfinitiveTo = /\bto\s+$/i.test(leftOfBlank);
  const startsLikeFinitePredicate = /^(?:do|does|did|can(?:not)?|can't|could|couldn't|will|won't|would|wouldn't|should|shouldn't|must|might|may|prevent|prevents|keep|keeps|make|makes|allow|allows|refuse|refuses|fail|fails)\b/i.test(correctText);
  const startsLikeAuxiliaryPredicate = /^(?:do|does|did|cannot|can't|can|could|should|would|will|must|may|might|is|are|was|were|has|have|had)\b/i.test(correctText);
  const startsLikeNegatedComplement = /^(?:not|no|never)\b/i.test(correctText);
  const startsLikePrepositionalPhrase = /^(?:without|with|by|of|from|to|in|on|at|for|as|than|about|toward|towards)\b/i.test(correctText);

  if (followsCopula && startsLikeFinitePredicate) {
    return {
      code: "negative-paraphrase-copula-slot-mismatch",
      message: "Correct option does not fit a be/linking-verb complement slot.",
    };
  }

  if (followsPreposition && startsLikePrepositionalPhrase) {
    return {
      code: "negative-paraphrase-stacked-prepositions",
      message: "Correct option creates stacked prepositions in the blank sentence.",
    };
  }

  if ((followsModal || followsInfinitiveTo) && startsLikeAuxiliaryPredicate) {
    return {
      code: "negative-paraphrase-verb-slot-mismatch",
      message: "Correct option does not fit the verb phrase slot after a modal or infinitive marker.",
    };
  }

  if (followsModalBe && startsLikeNegatedComplement) {
    return {
      code: "negative-paraphrase-modal-be-negated-complement",
      message: "Correct option creates awkward modal-be + negated complement phrasing.",
    };
  }

  return null;
}

function findTangledNegativeParaphraseIssue(
  correctText: string,
): { code: string; message: string } | null {
  const normalized = normalizeText(correctText);
  const cueCount = negationCueCount(normalized);
  if (cueCount > 3) {
    return {
      code: "negative-paraphrase-too-many-negation-cues",
      message: `Correct option has too many negation cues (${cueCount}) and may become logically unstable.`,
    };
  }

  if (
    /\bnot\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bnot\b/i.test(normalized) ||
    /\bfail\w*\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bfail\w*\b/i.test(normalized) ||
    /\bfail\w*\b[\s\S]+\bfail\w*\b/i.test(normalized) ||
    /\bunable\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bunable\b/i.test(normalized) ||
    /\bimpossible\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bimpossible\b/i.test(normalized) ||
    /\b(?:excluding|exclude|excludes)\b[\s\S]+\b(?:past|previous|spent|investment|investments)\b/i.test(normalized) ||
    /\b(?:past|previous|spent|investment|investments)\b[\s\S]+\b(?:excluding|exclude|excludes)\b/i.test(normalized)
  ) {
    return {
      code: "negative-paraphrase-tangled-negation",
      message: "Correct option uses tangled or logically unstable negation.",
    };
  }

  return null;
}

function findNoSubjectDoubleNegationIssue(
  blankCarrierText: string,
  correctText: string,
): { code: string; message: string } | null {
  const option = normalizeText(correctText);
  const completedSentence = normalizeText(blankCarrierText.replace("_____", option));
  const offending =
    findNoSubjectPlusNegativePredicate(option) ||
    findNoSubjectPlusNegativePredicate(completedSentence);
  if (!offending) return null;

  return {
    code: "negative-paraphrase-no-subject-double-negation",
    message: `Avoid no-subject + negative predicate double negation in DOUBLE_NEGATIVE blanks: "${offending}".`,
  };
}

function findNoSubjectPlusNegativePredicate(text: string): string | null {
  const normalized = normalizeText(text);
  const patterns = [
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:do|does|did)\s+not\b[^.;:,]*/i,
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:is|are|was|were|be|being|been)\s+not\b[^.;:,]*/i,
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:can|could|should|would|will|must|may|might)\s+not\b[^.;:,]*/i,
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|wouldn't|shouldn't|couldn't)\b[^.;:,]*/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function crossesStrongContrastBoundary(text: string): boolean {
  return (
    /\b(?:but because|but whether)\b/i.test(text) ||
    /\bnot\s+whether\b[\s\S]+\bbut\b/i.test(text) ||
    /[,;]\s*(?:rather|instead)\b/i.test(text)
  );
}

function findAdjacentBlankConclusionIssue(
  passageWithBlank: string,
  correctText: string,
): { code: string; message: string } | null {
  const nextSentence = extractSentenceAfterBlank(passageWithBlank);
  if (!nextSentence || !hasConclusionSignal(nextSentence)) return null;

  if (
    mentionsReducedForeignDependence(nextSentence) &&
    stressesImportRelianceWithoutBalance(correctText)
  ) {
    return {
      code: "blank-adjacent-conclusion-conflict",
      message:
        "Correct option stresses import reliance but the adjacent conclusion says the strategy reduces excessive foreign dependence.",
    };
  }

  if (
    mentionsBalancedResilience(nextSentence) &&
    usesAbsoluteDisruptionClaim(correctText)
  ) {
    return {
      code: "blank-result-declaration",
      message:
        "Correct option declares an absolute no-disruption result instead of supporting the adjacent balanced/resilient strategy.",
    };
  }

  return null;
}

function extractSentenceAfterBlank(passageWithBlank: string): string {
  const blankIndex = passageWithBlank.indexOf("_____");
  if (blankIndex < 0) return "";

  const sentenceEndCandidates = [".", "!", "?"]
    .map((mark) => passageWithBlank.indexOf(mark, blankIndex))
    .filter((index) => index >= 0);
  if (!sentenceEndCandidates.length) return "";

  const currentSentenceEnd = Math.min(...sentenceEndCandidates);
  const rest = passageWithBlank.slice(currentSentenceEnd + 1).trim();
  if (!rest) return "";

  const nextEndCandidates = [".", "!", "?"]
    .map((mark) => rest.indexOf(mark))
    .filter((index) => index >= 0);
  const nextEnd = nextEndCandidates.length
    ? Math.min(...nextEndCandidates)
    : rest.length;

  return normalizeText(rest.slice(0, nextEnd + 1));
}

function hasConclusionSignal(text: string): boolean {
  return /\b(?:by adopting this strategy|therefore|thus|for this reason|as a result|in this way|consequently|accordingly)\b/i.test(text);
}

function mentionsReducedForeignDependence(text: string): boolean {
  return /\breduc\w*\s+(?:excessive\s+)?dependence\s+on\s+(?:foreign|external|overseas)\b/i.test(text) ||
    /\breduc\w*[\s\S]+\bforeign sources\b/i.test(text);
}

function mentionsBalancedResilience(text: string): boolean {
  return /\b(?:balanced|resilient|resilience|diversified|diversify)\b/i.test(text);
}

function stressesImportRelianceWithoutBalance(text: string): boolean {
  if (!/\b(?:imports?|imported|importing|foreign suppliers?|foreign sources?|foreign grain producers?|import supply chains?)\b/i.test(text)) {
    return false;
  }

  const hasBalanceCue = /\b(?:diversif\w*|domestic|balanced|resilien\w*|reduc\w*|excessive|less|limit\w*|avoid\w* overdependence|multiple|reserve|stockpile|long-term contracts?)\b/i.test(text);
  const hasImportEscalation = /\b(?:solely|only|entirely|exclusively|unlimited|complete|heavily|heavy|avoid domestic|replace domestic)\b/i.test(text);
  return hasImportEscalation && !hasBalanceCue;
}

function usesAbsoluteDisruptionClaim(text: string): boolean {
  return /\b(?:not|never|no|without)\s+(?:allow(?:ing)?|permit(?:ting)?|tolerat(?:e|ing))\s+(?:any|all)\s+disruption\b/i.test(text) ||
    /\bnot\s+allow\s+any\s+disruption\b/i.test(text);
}

function isUsefulNegativeParaphraseSourceSentence(sentence: string): boolean {
  if (sentence.length < 45) return false;
  if (/\b(?:such as|including|for example)\s*$/i.test(sentence)) return false;
  return /\b(?:because|therefore|rather|while|whereas|when|if|not only|not merely|by contrast|in that sense|this is why|requires?|depends?|allows?|allowing|guides?|guide|protects?|protecting|strengthens?|strengthening|prevents?|preventing|keeps?|keeping|evaluating|judging|making|ensuring|influenced|based on|contribute|recover|moving|focus|revision)\b/i.test(sentence);
}

function getNegativeParaphraseSuggestedTargets(sentence: string): string[] {
  const targets: string[] = [];
  const patterns = [
    /\b((?:guide|guides|guiding|protect|protects|protecting|strengthen|strengthens|strengthening|allow|allows|allowing|prevent|prevents|preventing|keep|keeps|keeping|evaluate|evaluates|evaluating|judge|judges|judging|make|makes|making|ensure|ensures|ensuring)\b[^.;:!?]{8,90})/gi,
    /\b((?:the\s+)?protection of [^.;:!?]{8,70})/gi,
    /\b((?:the\s+)?ability to [^.;:!?]{8,70})/gi,
    /\b((?:are|is|was|were|be|being|been)\s+(?:ultimately\s+)?based on [^.;:!?]{8,80})/gi,
    /\b((?:can|could|may|might|will|would|should|must)(?:\s+\w+ly)?\s+be\s+influenced by [^.;:!?]{8,80})/gi,
    /\b((?:influenced by|not beyond the reach of|points? to|contribute(?:s)? to)\b[^.;:!?]{8,80})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence))) {
      const target = normalizeSuggestedTarget(match[1] ?? "");
      if (
        target &&
        countContentTokens(target) >= 2 &&
        !isSingleAbstractNounTarget(target) &&
        !isListLikeBlankTarget(target)
      ) {
        targets.push(target);
      }
    }
  }

  return [...new Set(targets)].slice(0, 4);
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
  const listedPattern = patterns.find((pattern) => normalized.includes(pattern));
  if (listedPattern) return listedPattern;

  const regexPatterns: Array<{ pattern: RegExp; label: string }> = [
    {
      pattern: /\bachievements?\s+from\s+failing\b/i,
      label: "achievement(s) from failing",
    },
    {
      pattern: /\bachievements?\s+(?:can\s+|could\s+|will\s+|would\s+)?(?:fail|fails|failed|failing)\b/i,
      label: "achievement(s) failing",
    },
    {
      pattern: /\bachieved\s+success\b/i,
      label: "achieved success",
    },
    {
      pattern: /\bcapacity\s+to\s+lack\b/i,
      label: "capacity to lack",
    },
    {
      pattern: /\bguarantee\s+major\s+crops\b/i,
      label: "guarantee major crops",
    },
    {
      pattern: /\bnot\s+allow\s+any\s+disruption\b/i,
      label: "not allow any disruption",
    },
    {
      pattern: /\bevents?\s+(?:can\s+|could\s+|will\s+|would\s+)?(?:not\s+)?survive\b/i,
      label: "event(s) survive",
    },
    {
      pattern: /\bcan\s+(?:certainly\s+|clearly\s+|fully\s+|really\s+)?be\s+not\b/i,
      label: "can be not",
    },
  ];
  return regexPatterns.find(({ pattern }) => pattern.test(text))?.label ?? null;
}

function findContextualAwkwardBlankOptionPhrase(
  blankCarrierText: string,
  optionText: string,
): string | null {
  const blankSubjectSuggestsEvent =
    /\b(?:events?|phenomena|processes|consequences|effects|outcomes)\s+_____/.test(blankCarrierText);
  if (blankSubjectSuggestsEvent && /^(?:can(?:not)?|can't|could|will|would|do\s+not|does\s+not|cannot)\s+survive\b/i.test(optionText)) {
    return "event(s) survive";
  }

  return null;
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

function splitPassageSentences(
  passage: string,
  { includeShort = false }: { includeShort?: boolean } = {},
): string[] {
  const sentences = splitSharedPassageSentences(passage)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return includeShort
    ? sentences
    : sentences.filter((sentence) => sentence.length >= 20);
}

function containsComparableSentence(passage: string, sentence: string): boolean {
  const comparablePassage = normalizeComparableText(passage);
  const comparableSentence = normalizeComparableText(sentence).replace(/[.!?]+$/, "");
  return comparableSentence.length >= 20 && comparablePassage.includes(comparableSentence);
}

function findComparablePassageSentenceIndex(
  passageSentences: string[],
  sentence: string,
  usedIndices: Set<number>,
): number {
  const comparableSentence = normalizeComparableText(sentence).replace(/[.!?]+$/, "");
  if (comparableSentence.length < 2) return -1;

  for (let index = 0; index < passageSentences.length; index += 1) {
    if (usedIndices.has(index)) continue;
    const comparablePassageSentence = normalizeComparableText(
      passageSentences[index],
    ).replace(/[.!?]+$/, "");
    if (
      comparablePassageSentence === comparableSentence ||
      comparablePassageSentence.includes(comparableSentence) ||
      comparableSentence.includes(comparablePassageSentence)
    ) {
      return index;
    }
  }

  return -1;
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

function meaningTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}|[가-힣]{2,}/g) ?? [];
  const content = new Set<string>();
  for (const token of tokens) {
    if (IRRELEVANT_TOKEN_STOPWORDS.has(token)) continue;
    content.add(token);
    if (/^[a-z]/.test(token)) {
      const stem = lightStemContentToken(token);
      if (stem !== token && !IRRELEVANT_TOKEN_STOPWORDS.has(stem)) {
        content.add(stem);
      }
    }
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

const countMeaningTokenOverlap = countTokenOverlap;

function findNewExtremeCue(sentence: string, passage: string): string | null {
  const cues = [
    "always", "never", "everyone", "everybody", "completely", "entirely",
    "guarantees", "guarantee", "guaranteed", "ensures",
  ];
  for (const cue of cues) {
    if (containsStandaloneToken(sentence, cue) && !containsStandaloneToken(passage, cue)) {
      return cue;
    }
  }
  return null;
}

function findNewCounterclaimCue(sentence: string, passage: string): string | null {
  const cuePatterns: Array<[string, RegExp]> = [
    ["however", /\bhowever\b/i],
    ["instead", /\binstead\b/i],
    ["rather than", /\brather\s+than\b/i],
    ["by contrast", /\bby\s+contrast\b/i],
    ["on the contrary", /\bon\s+the\s+contrary\b/i],
    ["nevertheless", /\bnevertheless\b/i],
    ["nonetheless", /\bnonetheless\b/i],
  ];

  for (const [label, pattern] of cuePatterns) {
    if (pattern.test(sentence) && !pattern.test(passage)) return label;
  }

  const backlashPatterns: Array<[string, RegExp]> = [
    [
      "regulation backlash",
      /\b(?:aggressive|excessive|burdensome|strict)\s+(?:regulations?|rules?|requirements?|disclosures?)\b/i,
    ],
    [
      "hinder research",
      /\b(?:hinder|hinders|hindered|hindering|limit|limits|limited|limiting|restrict|restricts|restricted|restricting)\b[\s\S]{0,80}\b(?:research|science|scientific|progress|innovation|freedom)\b/i,
    ],
    [
      "academic freedom",
      /\bacademic\s+freedom\b/i,
    ],
    [
      "intellectual property",
      /\bintellectual\s+property(?:\s+rights?)?\b/i,
    ],
    [
      "own academic interests",
      /\bown\s+academic\s+interests\b/i,
    ],
    [
      "sponsor relationships",
      /\b(?:sponsor|sponsors|funding\s+sponsors)\b[\s\S]{0,60}\brelationships?\b|\brelationships?\b[\s\S]{0,60}\b(?:sponsor|sponsors|funding\s+sponsors)\b/i,
    ],
  ];

  for (const [label, pattern] of backlashPatterns) {
    if (pattern.test(sentence) && !pattern.test(passage)) return label;
  }

  return null;
}

function findPrescriptiveGiveawayCue(sentence: string): string | null {
  const patterns: Array<[string, RegExp]> = [
    ["to maximize", /^\s*to\s+maximize\b/i],
    ["should actively", /\bshould\s+actively\b/i],
    ["should prioritize", /\bshould\s+prioritize\b/i],
    ["should secure", /\bshould\s+secure\b/i],
    ["should protect", /\bshould\s+protect\b/i],
    ["should build", /\bshould\s+build\b/i],
    ["should focus on", /\bshould\s+(?:focus|concentrate|work)\s+on\b/i],
    ["encourage researchers", /\bencourage\s+researchers\b/i],
    ["develop sponsor relationships", /\bdevelop\s+[\s\S]{0,50}\brelationships?\s+with\s+[\s\S]{0,20}\bsponsors?\b/i],
    ["must avoid", /\bmust\s+avoid\b/i],
    ["ought to", /\bought\s+to\b/i],
  ];

  for (const [label, pattern] of patterns) {
    if (pattern.test(sentence)) return label;
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
  const circledMap: Record<string, string> = Object.fromEntries(
    getCircledNumbers(50).map((label, index) => [label, String(index + 1)]),
  );
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?([A-Ja-j]|\d{1,3})[\)\].]?\s*$/, "$1")
    .toLowerCase();
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function containsHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

function containsLatinLetter(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

function englishWordCount(text: string): number {
  return (text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).length;
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
