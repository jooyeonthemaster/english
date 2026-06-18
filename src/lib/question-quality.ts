import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";
import {
  normalizeDiversityComparable,
  pickSteeredPositions,
} from "@/lib/question-diversity";
import {
  buildGrammarPointGuidance,
  GRAMMAR_POINT_CATALOG,
  type GrammarPointCode,
} from "@/lib/grammar-point-catalog";
import { buildBlankPointGuidance } from "@/lib/blank-point-catalog";
import { buildSentenceInsertPointGuidance } from "@/lib/sentence-insert-point-catalog";
import { buildIrrelevantPointGuidance } from "@/lib/irrelevant-point-catalog";
import { splitPassageSentences as splitSharedPassageSentences } from "@/lib/passage-sentence-utils";
import { sentenceInsertOptionMarkerIndex } from "@/lib/sentence-insert-options";

export type QuestionQualitySeverity = "error" | "warning";

export interface QuestionQualityIssue {
  severity: QuestionQualitySeverity;
  code: string;
  message: string;
}

/**
 * SHIP-FIRST 정책: 강사가 고른 지문+유형+난이도는 확정된 의도다. 아래 코드들은
 * "정답 무효/노출/형식 깨짐" 같은 명백한 결함이 아니라 **난이도·취향**(KILLER치고
 * 쉬움·이상적 타깃 아님·미관·학생 비노출 메타 완성도)만 가리킨다. 151개 차단코드
 * 전수 감사(적대검증 0 flip)에서 B로 분류된 36개 — `validateQuestionQuality` 반환
 * 직전에 severity:'error'→'warning' 으로 강등해 strict/relaxed 양쪽에서 비차단으로
 * 만든다(삭제 아님 — 검수 UI 가시성은 _qualityWarnings 로 보존). 정답 유효성/명료성을
 * 해치는 인접 코드(implied-meaning-direct-answer-leak, irrelevant-too-many-new-terms,
 * grammar-debatable-infinitive 등)는 의도적으로 제외 — 정확한 문자열 집합으로만 강등한다.
 * 근거: docs/GENERATION-ENGINE-REDESIGN-ROADMAP.md §4 WS1.
 */
export const SHIP_FIRST_WARNING_CODES = new Set<string>([
  "wrong-option-explanation-count",
  "grammar-decoy-point-diversity",
  "grammar-killer-thin-answer",
  "grammar-correction-killer-thin-segment",
  "grammar-correction-underline-too-narrow",
  "grammar-correction-underlined-segment-short",
  "blank-killer-target-too-easy",
  "blank-target-too-small",
  "blank-target-list-like",
  "blank-awkward-correct-option",
  "blank-awkward-option",
  "blank-paraphrase-correct-too-thin",
  "blank-paraphrase-difficulty-mismatch",
  "blank-paraphrase-killer-giveaway-distractors",
  "blank-paraphrase-killer-too-easy",
  "blank-paraphrase-missing-answer-logic",
  "blank-paraphrase-option-imbalance",
  "blank-paraphrase-option-source-copy",
  "blank-paraphrase-subject-slot-mismatch",
  "blank-paraphrase-target-too-wide",
  "blank-paraphrase-target-trailing-function",
  "irrelevant-too-unrelated",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  "sentence-order-given-too-long",
  "sentence-order-given-too-long-relative",
  "sentence-order-paragraph-imbalance",
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-thin-reasoning-gap",
  "summary-mc-awkward-collocation",
  "summary-mc-missing-half-correct-traps",
]);

type VisibleQuestionLanguage = "ko" | "en";

interface ValidateQuestionQualityInput {
  typeId: string;
  question: Record<string, unknown>;
  passage?: string;
  requestedDifficulty?: string;
  irrelevantSlotCount?: number;
  grammarMarkerCount?: number;
  grammarAnswerCount?: number;
  grammarCorrectionErrorCount?: number;
  /** Legacy name; interpreted as grammarMarkerCount. */
  grammarErrorCount?: number;
  /** Requested visible direction/stem language. Omitted = type default (Korean). */
  stemLanguage?: VisibleQuestionLanguage;
  /** Requested visible option-text language. Omitted = type default. */
  optionLanguage?: VisibleQuestionLanguage;
  /** Requested VOCAB_CHOICE underlined word count (5~10). Omitted = infer/default 5. */
  vocabChoiceMarkerCount?: number;
  /** Requested VOCAB_CHOICE inappropriate word count. Omitted = 1. */
  vocabChoiceAnswerCount?: number;
  /** Requested SENTENCE_INSERT insertion-marker count (5~8). Omitted = infer/default 5. */
  sentenceInsertSlotCount?: number;
  /** Requested ANTONYM word-pair count (5~10). Omitted = infer/default 5. */
  antonymPairCount?: number;
  /** Requested BLANK_INFERENCE blank count. 2~3 routes to the multi-blank validator. */
  blankInferenceBlankCount?: number;
  /** Requested BLANK_INFERENCE paraphrased answer mode. */
  blankInferenceParaphraseAnswer?: boolean;
  /** Requested option count for free-text option types (TOPIC/TITLE/...). */
  genericOptionCount?: number;
  /** Requested correct-answer count for free-text option types. Omitted = 1. */
  genericAnswerCount?: number;
  /**
   * 내용 일치 강제 정답 극성("일치"/"불일치"). 주어졌을 때만 극성 일관성 게이트가
   * 동작한다. Omitted = AUTO(모델 결정) — 게이트 미동작, 기존 동작과 동일.
   */
  contentMatchType?: "일치" | "불일치";
  /**
   * 대의파악 계열(제목/주제/요지) 강제 정답 극성. "NEGATIVE"일 때만 부정 극성
   * 게이트가 동작한다. Omitted/"POSITIVE" = 기존 동작과 동일.
   */
  answerPolarity?: "POSITIVE" | "NEGATIVE";
  /**
   * 다양성: 같은 지문에서 이미 사용된 타깃(원문 표현). 전달 시 동일 타깃 재사용을
   * error 로 표시해 strict 재시도를 유도한다 (RELAXED_BLOCKING 미포함 — relaxed
   * 폴백은 통과시키므로 타깃 풀이 고갈된 지문에서도 생성은 성공한다).
   */
  diversityUsedTargets?: string[];
}

const IRRELEVANT_SLOT_MIN = 5;
const GRAMMAR_MARKER_COUNT_MIN = 5;
const GRAMMAR_MARKER_COUNT_MAX = 10;
const GRAMMAR_CORRECTION_ERROR_COUNT_MIN = 1;
const GRAMMAR_CORRECTION_ERROR_COUNT_MAX = 5;
// 객관식 어법(GRAMMAR_ERROR) 밑줄 span 길이 한도. 수능 어법 밑줄은 최소 문법
// 단위(보통 1~4단어)다. HARD 초과 = 절/문장 통째 밑줄(예: 프리미엄 실측
// "these digital platforms create a trusting environment" 7단어/53자) → relaxed
// 폴백에서도 차단. SOFT 초과 = 다소 넓음 → strict에서만 차단(relaxed에선 경고).
const GRAMMAR_UNDERLINE_HARD_MAX_WORDS = 7;
const GRAMMAR_UNDERLINE_HARD_MAX_CHARS = 48;
const GRAMMAR_UNDERLINE_SOFT_MAX_WORDS = 5;
const GRAMMAR_UNDERLINE_SOFT_MAX_CHARS = 34;
const VOCAB_CHOICE_MARKER_COUNT_DEFAULT = 5;
const VOCAB_CHOICE_MARKER_COUNT_MIN = 5;
const VOCAB_CHOICE_MARKER_COUNT_MAX = 10;
const VOCAB_CHOICE_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
const GENERIC_OPTION_COUNT_MIN = 4;
const GENERIC_OPTION_COUNT_MAX = 8;
const SENTENCE_INSERT_SLOT_MIN = 5;
const SENTENCE_INSERT_SLOT_MAX = 8;
const ANTONYM_MARKER_COUNT_DEFAULT = 5;
const ANTONYM_MARKER_COUNT_MIN = 5;
const ANTONYM_MARKER_COUNT_MAX = 10;
const ANTONYM_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
const SENTENCE_ORDER_PARAGRAPH_LABELS = ["(A)", "(B)", "(C)"] as const;
const SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES = 2;
const SENTENCE_ORDER_MIN_PARAGRAPH_WORDS = 24;
const SENTENCE_ORDER_MAX_GIVEN_SENTENCES = 2;
const SENTENCE_ORDER_MAX_GIVEN_WORDS = 70;
const SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO = 1.9;
const SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO = 1.3;

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
  "GRAMMAR_CHOICE_COMBO",
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
    "If blankAnswerMode is PARAPHRASE, originalExpression is still the exact source span, but the correct option must be a non-verbatim paraphrase calibrated to the requested difficulty.",
  ],
  GRAMMAR_ERROR: [
    "Mark 5-10 real expressions from the original passage. Detailed settings control both marked-position count and the exact answer count, including the case where every label is an answer.",
    "The error must test a meaningful grammar point such as agreement, parallelism, modification, tense/aspect, reference, or verb form.",
    "Every non-error marked expression must still be a defensible grammar judgment point with a clear explanation, not padding.",
    "For KILLER, avoid an obvious spelling-level error; the wrong expression should look natural until the sentence structure is checked.",
  ],
  GRAMMAR_CHOICE_COMBO: [
    "Create exactly three boxed slots (A)/(B)/(C) in three different sentences, each testing a different grammar point code.",
    "Each slot's correctExpression must be verbatim passage text; the wrongExpression must be clearly ungrammatical in that position, not a debatable stylistic preference or a tense-only change.",
    "Exactly one option combines all three correct expressions. Wrong options must mix single-slot and multi-slot traps, and every slot's wrong candidate must appear in at least one wrong option.",
    "One slot's judgment must not reveal another slot's answer (keep the three grammar decisions independent).",
    "For KILLER, use hard points (relatives, participles, parallelism) on at least two slots and include at least two options that are wrong in two or more slots.",
  ],
  VOCAB_CHOICE: [
    "Mark five context-bearing words from the passage. Do not use tiny function words or words whose meaning is obvious without context.",
    "Only one marked word should be contextually inappropriate; its substitute must be close enough to look tempting.",
    "For KILLER, test register, collocation, stance, causality, or discourse role, not a simple dictionary antonym.",
  ],
  SENTENCE_ORDER: [
    "The givenSentence must be only the opening 1-2 sentences and should stay under 65 words; if two opening sentences are too long, use only the first.",
    "Never put a whole introductory paragraph in givenSentence. Do not create a given part with 3+ sentences.",
    "Each of (A), (B), and (C) must be a real chunk with at least two sentences; avoid one-line or one-sentence chunks.",
    "Keep (A)/(B)/(C) balanced in length; no chunk should be roughly twice as long as another.",
    "The three reordered paragraphs must have explicit discourse clues such as pronoun reference, chronology, contrast, or cause-effect.",
    "Shuffle paragraph labels so the correct order is not simply (A)-(B)-(C).",
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
    antonymPairCount?: number;
    /** 2~3 = multi-blank BLANK_INFERENCE; the single-blank candidate block is suppressed. */
    blankInferenceBlankCount?: number;
    /** Single-blank BLANK_INFERENCE should use paraphrased visible answers. */
    blankInferenceParaphraseAnswer?: boolean;
    /** Single-blank BLANK_INFERENCE should use double-negative transformed answers. */
    blankInferenceDoubleNegative?: boolean;
    /** Legacy name; interpreted as grammarMarkerCount. */
    grammarErrorCount?: number;
    requestedDifficulty?: string;
    /** 다양성: 같은 지문에서 이미 사용된 타깃(유형별 원문 표현) — 후보 필터링용 */
    usedTargets?: string[];
    /** 다양성: 기존 문항의 정규화된 정답 라벨 — 정답 위치 분산용 */
    usedAnswerLabels?: string[];
    /** 다양성: 어법류에서 이미 정답으로 쓰인 출제 포인트 코드(a~m) — 포인트 분산용 */
    usedPointCodes?: string[];
    /** 다양성: 배치 내 변형 인덱스 — 후보 로테이션/위치 분산의 결정형 오프셋 */
    variantIndex?: number;
    /** 다양성 모드 활성 여부 (미지정 시 기존 동작 그대로) */
    diversityEnabled?: boolean;
    /** 핵심 집중(focus) 모드 — 어법 정답 포인트를 고빈출 톱셋으로 좁힘 */
    pointFocus?: boolean;
  } = {},
): string {
  const diversity: CandidateDiversityOptions = {
    usedTargets: options.usedTargets,
    usedAnswerLabels: options.usedAnswerLabels,
    usedPointCodes: options.usedPointCodes,
    variantIndex: options.variantIndex,
    diversityEnabled: options.diversityEnabled,
    pointFocus: options.pointFocus,
  };
  switch (typeId) {
    case "GRAMMAR_ERROR":
      return buildGrammarErrorCandidateBlock(
        passage,
        options.grammarMarkerCount ?? options.grammarErrorCount,
        options.grammarAnswerCount,
        options.requestedDifficulty,
        diversity,
      );
    case "GRAMMAR_CHOICE_COMBO":
      return buildGrammarChoiceComboCandidateBlock(
        passage,
        options.requestedDifficulty,
        diversity,
      );
    case "GRAMMAR_CORRECTION":
      return buildGrammarCorrectionCandidateBlock(
        passage,
        options.grammarCorrectionErrorCount,
        options.requestedDifficulty,
        diversity,
      );
    case "IRRELEVANT": {
      // 후보(문장) 블록 + (pointFocus 일 때) 무관성 유형 focus 가이드 주입.
      // pointFocus 미지정이면 guidance="" → 기존(비-focus) 동작 불변.
      const irrelevantBlock = buildIrrelevantCandidateBlock(
        passage,
        options.irrelevantSlotCount,
        options.requestedDifficulty,
        diversity,
      );
      const irrelevantFocus = buildIrrelevantPointGuidance({
        variantIndex: diversity.variantIndex,
        pointFocus: diversity.pointFocus,
        diversityEnabled: diversity.diversityEnabled,
      });
      return [irrelevantBlock, irrelevantFocus].filter(Boolean).join("\n\n");
    }
    case "BLANK_INFERENCE":
      // The candidate block proposes single-blank targets; the multi-blank
      // variant carries its own instructions in the type-settings prompt.
      if ((options.blankInferenceBlankCount ?? 1) >= 2) return "";
      return buildBlankInferenceCandidateBlock(passage, diversity, {
        paraphraseAnswer: options.blankInferenceParaphraseAnswer,
        doubleNegative: options.blankInferenceDoubleNegative,
        requestedDifficulty: options.requestedDifficulty,
      });
    case "REFERENCE":
      return buildReferenceCandidateBlock(passage, diversity);
    case "IMPLIED_MEANING":
      return buildImpliedMeaningCandidateBlock(
        passage,
        options.requestedDifficulty,
        diversity,
      );
    case "ANTONYM":
      return buildAntonymCandidateBlock(
        passage,
        options.requestedDifficulty,
        options.antonymPairCount,
        diversity,
      );
    case "SENTENCE_INSERT":
      // 문장삽입은 후보 스팬을 열거하지 않으므로(다중빈칸과 동일) focus 가이드만 주입.
      // pointFocus 미지정이면 "" 반환 → 기존(비-focus) 동작 불변.
      return buildSentenceInsertPointGuidance({
        variantIndex: diversity.variantIndex,
        pointFocus: diversity.pointFocus,
        diversityEnabled: diversity.diversityEnabled,
      });
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// 다양성 보조: 후보 목록 필터링/로테이션 (반복 생성 시 타깃 수렴 방지)
// ---------------------------------------------------------------------------

interface CandidateDiversityOptions {
  usedTargets?: string[];
  usedAnswerLabels?: string[];
  usedPointCodes?: string[];
  variantIndex?: number;
  diversityEnabled?: boolean;
  /** 핵심 집중 모드 — 어법 정답 포인트를 고빈출 톱셋(1000제 상위 6)으로 좁힘. */
  pointFocus?: boolean;
}

/** variantIndex 만큼 배열을 회전시켜 병렬 배치의 각 호출이 다른 후보를 먼저 보게 한다. */
function rotateByVariantIndex<T>(items: T[], variantIndex?: number): T[] {
  if (
    items.length < 2 ||
    typeof variantIndex !== "number" ||
    !Number.isFinite(variantIndex)
  ) {
    return items;
  }
  const offset = Math.max(0, Math.floor(variantIndex)) % items.length;
  if (offset === 0) return items;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * 기사용 타깃과 겹치는 후보를 제외한다. 전부 걸러지면 원본을 그대로 반환해
 * 후보 고갈로 생성 자체가 약해지는 것을 막는다 (소프트 강등 — exhausted 로 표시).
 */
function filterUsedCandidates<T>(
  items: T[],
  usedTargets: string[] | undefined,
  candidateText: (item: T) => string,
): { items: T[]; exhausted: boolean } {
  if (!usedTargets?.length || items.length === 0) {
    return { items, exhausted: false };
  }
  // 문장부호를 무시하는 다양성 정규화 사용 — "common – rare" 같은 쌍 표기와
  // 후보 텍스트("common rare")가 안전하게 비교된다.
  const usedNorms = usedTargets
    .map((target) => normalizeDiversityComparable(target))
    .filter(Boolean);
  if (!usedNorms.length) return { items, exhausted: false };
  const filtered = items.filter((item) => {
    const norm = normalizeDiversityComparable(candidateText(item));
    if (!norm) return true;
    // 공백 패딩으로 토큰 경계를 강제 — 짧은 used 스팬("art")이 무관 후보
    // ("started")를 부분 문자열로 과잉 제외하지 않게 한다.
    const paddedNorm = ` ${norm} `;
    return !usedNorms.some((used) => {
      if (used === norm) return true;
      const paddedUsed = ` ${used} `;
      return paddedUsed.includes(paddedNorm) || paddedNorm.includes(paddedUsed);
    });
  });
  return filtered.length > 0
    ? { items: filtered, exhausted: false }
    : { items, exhausted: true };
}

/**
 * 다양성: 생성물이 기사용 타깃 스팬을 그대로 재사용했는지 검사.
 * diversityUsedTargets 미전달 호출자는 no-op. RELAXED_BLOCKING 미포함 코드라
 * strict 재시도 동안만 다른 타깃을 찾도록 압력을 주고, 타깃 풀이 고갈된
 * 지문에서는 relaxed 폴백이 재사용을 허용한다 (생성 실패로 끝나지 않음).
 */
function validateDiversityTargetReuse(
  question: Record<string, unknown>,
  typeId: string,
  usedTargets: string[] | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  if (!usedTargets?.length) return;
  const targetText =
    typeId === "BLANK_INFERENCE"
      ? normalizeText(question.originalExpression)
      : typeId === "IMPLIED_MEANING"
        ? normalizeText(question.underlinedExpression)
        : "";
  if (!targetText) return;
  const norm = normalizeDiversityComparable(targetText);
  if (!norm) return;
  const reused = usedTargets.some((used) => {
    const usedNorm = normalizeDiversityComparable(used);
    if (!usedNorm) return false;
    return usedNorm === norm || usedNorm.includes(norm) || norm.includes(usedNorm);
  });
  if (reused) {
    add(
      "error",
      "diversity-duplicate-target",
      `Target "${targetText.slice(0, 60)}" duplicates a previously used target for this passage; choose a different span.`,
    );
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
  pairCount?: number,
  diversity?: CandidateDiversityOptions,
): string {
  const markerCount =
    typeof pairCount === "number" &&
    pairCount >= ANTONYM_MARKER_COUNT_MIN &&
    pairCount <= ANTONYM_MARKER_COUNT_MAX
      ? Math.round(pairCount)
      : ANTONYM_MARKER_COUNT_DEFAULT;
  const allCandidates = findAntonymCandidates(passage, requestedDifficulty);
  const { items: usableCandidates, exhausted: usedExhausted } = filterUsedCandidates(
    allCandidates,
    diversity?.usedTargets,
    (candidate) => `${candidate.sourceWord} ${candidate.correctAntonym}`,
  );
  const candidates = rotateByVariantIndex(
    usableCandidates,
    diversity?.variantIndex,
  ).slice(0, 12);
  const safeCountRule =
    candidates.length >= markerCount
      ? `- Use ${markerCount} marked source words from this safe list whenever possible. At minimum, ${markerCount - 1} of the ${markerCount} markedWords should come from this list.`
      : `- Use every relevant safe candidate below first. If fewer than ${markerCount} are available, add your own only when the pair is equally clean and source-backed.`;

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
    // 안전 쌍이 전부 기사용이면 "회피 + 목록 강제"가 동시에 성립 불가 —
    // 재사용을 명시적으로 허용해 모순 지시를 해소한다.
    usedExhausted
      ? "- 이 지문의 안전 쌍은 모두 이전 문항에서 사용되었습니다. 재사용을 허용하되, 잘못된 쌍의 위치와 오답 설계를 이전 문항과 다르게 구성하세요."
      : "",
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

type GrammarCandidateTier = "basic" | "intermediate" | "killer";

type GrammarCandidateRule = {
  code: GrammarPointCode;
  pattern: RegExp;
  note: string;
  trap: string;
  mutationHint: string;
  tier: GrammarCandidateTier;
  priority: number;
};

type GrammarGenerationCandidate = {
  code: GrammarPointCode;
  expression: string;
  surroundingText: string;
  note: string;
  trap: string;
  mutationHint: string;
  tier: GrammarCandidateTier;
  priority: number;
  index: number;
};

const GRAMMAR_GENERATION_CANDIDATE_RULES: GrammarCandidateRule[] = [
  {
    code: "b",
    pattern: /\b(?:in|at|on|for|from|through|by|with)\s+which\b|\b(?:what|that|which|who|whom|whose|where|when)\b/gi,
    note: "관계사/명사절 접속사",
    trap: "선행사 유무, 뒤 절의 완전/불완전, 전치사+관계대명사 여부를 확인하게 함",
    mutationHint: "what <-> that/which, where <-> which, who/whom 격 오류",
    tier: "killer",
    priority: 10,
  },
  {
    code: "c",
    pattern: /\bwith\s+(?:the\s+)?[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,5}\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|made|seen|found)\b|\b(?:when|while|if|unless|once|although)\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|asked|seen)\b/gi,
    note: "with+O+분사 / 축약 부사절 분사",
    trap: "의미상 주어와 분사의 능동/수동 관계를 확인하게 함",
    mutationHint: "v-ing <-> p.p., being p.p. <-> p.p.",
    tier: "killer",
    priority: 10,
  },
  {
    code: "c",
    pattern: /\b[A-Za-z][A-Za-z'-]*(?:s)?\s+(?:called|known|based|made|used|given|left|seen|found|created|built|designed|involving|requiring|including|containing|leading|causing)\b/gi,
    note: "명사 뒤 분사 수식",
    trap: "수식받는 명사가 행위자인지 대상인지 확인하게 함",
    mutationHint: "p.p. <-> v-ing, reduced relative clause 오류",
    tier: "intermediate",
    priority: 8,
  },
  {
    code: "d",
    pattern: /\b(?:the number of|a number of|one of|each of|neither of|either of|percent of|half of|most of|the rest of)\b[^.;!?]{0,90}\b(?:is|are|was|were|has|have|do|does|seem|seems|require|requires|depend|depends|make|makes)\b/gi,
    note: "수량 표현/부분 표현 수일치",
    trap: "가까운 명사가 아니라 진짜 주어와 동사의 수를 확인하게 함",
    mutationHint: "singular verb <-> plural verb",
    tier: "intermediate",
    priority: 8,
  },
  {
    code: "d",
    pattern: /\b(?:[A-Za-z]+ing|What|That|Whether)\b[^.;!?]{10,110}\b(?:is|are|was|were|has|have|requires?|depends?|seems?)\b/gi,
    note: "긴 주어/절 주어 수일치",
    trap: "삽입구와 수식어를 걷어내고 주어 핵을 찾게 함",
    mutationHint: "verb+s <-> bare/plural verb, is <-> are",
    tier: "killer",
    priority: 9,
  },
  {
    code: "e",
    pattern: /\b(?:is|are|was|were|be|been|being|get|gets|got)\s+(?:[A-Za-z]+ed|known|made|seen|found|given|left|built|told|shown|used)\b|\b(?:occur|occurs|happen|happens|appear|appears|disappear|disappears|consist|consists|belong|belongs)\b/gi,
    note: "능동태/수동태 및 자동사 수동 불가",
    trap: "목적어 유무와 주어가 행위자인지 대상인지 확인하게 함",
    mutationHint: "active <-> passive, 자동사에 be p.p. 금지",
    tier: "intermediate",
    priority: 7,
  },
  {
    code: "f",
    pattern: /\b(?:seem|seems|look|looks|sound|sounds|feel|feels|remain|remains|keep|keeps|stay|stays|become|becomes|get|gets|grow|grows|make|makes|find|finds|leave|leaves|render|renders)\b[^.;!?]{0,55}\b[A-Za-z]+(?:ly)?\b|\b(?:hard|hardly|late|lately|high|highly|near|nearly|close|closely|most|mostly|costly|friendly|likely|lively)\b/gi,
    note: "형용사/부사 자리",
    trap: "보어 자리와 부사 수식 자리를 구분하게 함",
    mutationHint: "adjective <-> adverb, hard/hardly류 의미 차이",
    tier: "intermediate",
    priority: 8,
  },
  {
    code: "g",
    pattern: /\b(?:it|its|itself|they|them|their|theirs|themselves|one|ones|that|those|this|these)\b/gi,
    note: "대명사/지시어 일치",
    trap: "지시 대상의 수와 동일 대상 여부를 앞뒤 문맥에서 확인하게 함",
    mutationHint: "it <-> they, that <-> those, one <-> it",
    tier: "intermediate",
    priority: 6,
  },
  {
    code: "h",
    pattern: /\b(?:make|makes|made|have|has|had|let|lets|see|sees|hear|hears|watch|watches|notice|notices|enable|enables|allow|allows|cause|causes|force|forces|encourage|encourages|expect|expects)\b[^.;!?]{1,90}\b(?:to\s+)?[A-Za-z]+(?:ing|ed)?\b/gi,
    note: "목적격보어 형태",
    trap: "사역/지각/준사역 동사의 목적격보어 형태와 O-OC 관계를 확인하게 함",
    mutationHint: "bare infinitive <-> to-v, v-ing/p.p. 보어",
    tier: "intermediate",
    priority: 7,
  },
  {
    code: "i",
    pattern: /\b(?:both\s+[^.;!?]{1,80}\s+and|not only\s+[^.;!?]{1,100}\s+but(?:\s+also)?|either\s+[^.;!?]{1,80}\s+or|neither\s+[^.;!?]{1,80}\s+nor|from\s+[^.;!?]{1,60}\s+to|between\s+[^.;!?]{1,60}\s+and|rather than)\b/gi,
    note: "병렬/상관접속 구조",
    trap: "A와 B의 품사·구·절 형태를 멀리 떨어진 자리까지 맞춰 보게 함",
    mutationHint: "parallel form mismatch, omitted repeated to 오판 방지",
    tier: "killer",
    priority: 9,
  },
  {
    code: "k",
    pattern: /\b(?:spend|spends|spent)\b[^.;!?]{0,70}\b[A-Za-z]+ing\b|\b(?:look forward to|be used to|object to|contribute to|when it comes to|devoted to|committed to)\s+[A-Za-z]+ing\b|\b(?:remember|remembers|forget|forgets|regret|regrets|try|tries|stop|stops)\s+(?:to\s+)?[A-Za-z]+ing?\b/gi,
    note: "to부정사/동명사 선택",
    trap: "to가 전치사인지 부정사 표지인지, 동사별 의미 차이를 확인하게 함",
    mutationHint: "to-v <-> v-ing",
    tier: "intermediate",
    priority: 9,
  },
  {
    code: "l",
    pattern: /\b(?:because of|due to|despite|in spite of|although|though|even though|while|during)\b/gi,
    note: "전치사/접속사 선택",
    trap: "뒤에 명사구가 오는지 S+V 절이 오는지 확인하게 함",
    mutationHint: "because <-> because of, although <-> despite, while <-> during",
    tier: "basic",
    priority: 5,
  },
  {
    code: "m",
    pattern: /\b(?:as\s+[A-Za-z]+(?:\s+as)?|more\s+[A-Za-z]+|less\s+[A-Za-z]+|[A-Za-z]+er\s+than|the\s+more|the\s+less|than)\b/gi,
    note: "비교구문",
    trap: "as-as 어순, 비교급 수식어, 병렬 비교 대상을 확인하게 함",
    mutationHint: "as 형용사 as, than 비교 대상 병렬",
    tier: "intermediate",
    priority: 4,
  },
];

function findGrammarGenerationCandidates(
  passage: string,
  requestedDifficulty?: string,
): GrammarGenerationCandidate[] {
  const candidates: GrammarGenerationCandidate[] = [];
  const seen = new Set<string>();

  for (const rule of GRAMMAR_GENERATION_CANDIDATE_RULES) {
    for (const match of passage.matchAll(rule.pattern)) {
      const rawExpression = normalizeText(match[0]);
      if (!rawExpression || rawExpression.length < 2) continue;
      // 후보 expression은 모델이 밑줄로 그대로 복사할 수 있으므로 짧게 유지한다
      // (긴 후보 → 긴 밑줄 유도). 최소 문법 단위 원칙과 일치.
      const expression =
        rawExpression.length > 60
          ? `${rawExpression.slice(0, 57).trim()}...`
          : rawExpression;
      const index = match.index ?? passage.indexOf(match[0]);
      if (index < 0) continue;
      const key = `${rule.code}:${normalizeComparableText(expression).slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        code: rule.code,
        expression,
        surroundingText: buildSurroundingWindow(passage, index, match[0].length),
        note: rule.note,
        trap: rule.trap,
        mutationHint: rule.mutationHint,
        tier: rule.tier,
        priority: rule.priority,
        index,
      });
    }
  }

  return candidates.sort((a, b) => (
    grammarCandidateScore(b, requestedDifficulty) -
    grammarCandidateScore(a, requestedDifficulty)
  ));
}

function grammarCandidateScore(
  candidate: GrammarGenerationCandidate,
  requestedDifficulty?: string,
): number {
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();
  const tierBonus =
    difficulty === "KILLER"
      ? candidate.tier === "killer" ? 5 : candidate.tier === "intermediate" ? 2 : -2
      : difficulty === "BASIC"
        ? candidate.tier === "basic" ? 4 : candidate.tier === "intermediate" ? 1 : -2
        : candidate.tier === "intermediate" ? 3 : candidate.tier === "killer" ? 1 : 0;
  const spanBonus = Math.min(3, Math.floor(countWordsForQuality(candidate.surroundingText) / 8));
  return candidate.priority + tierBonus + spanBonus;
}

function buildGrammarSourceCandidateBlock(
  passage: string,
  requestedDifficulty: string | undefined,
  mode: "judgment" | "correction",
  limit = 14,
): string {
  const candidates = findGrammarGenerationCandidates(passage, requestedDifficulty).slice(0, limit);
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();
  if (candidates.length === 0) {
    return [
      "## Source-backed grammar target candidates",
      "- No high-confidence grammar candidate was detected by heuristics. Still choose only exact expressions from the passage, and avoid article/spelling/tiny-preposition errors.",
    ].join("\n");
  }

  return [
    "## Source-backed grammar target candidates",
    "- Prefer answer and decoy targets from this list before inventing another location. Copy the expression from the original passage exactly; mutate only the answer expression.",
    mode === "correction"
      ? "- For GRAMMAR_CORRECTION, underline a wider clause/sentence containing the chosen candidate, not just the expression itself."
      : "- For GRAMMAR_ERROR, use these as marked expressions or nearby marked spans, keeping non-answer decoys grammatically correct.",
    difficulty === "KILLER"
      ? "- KILLER priority: first try candidates tagged tier=killer. Single-token finite/nonfinite flips, adjacent subject-verb agreement, or obvious verb+s changes are rejected unless the surrounding span also contains a long-distance clause, modifier, relation, or parallel-structure check."
      : difficulty === "BASIC"
        ? "- BASIC priority: choose a visible but still meaningful one-step grammar relation; avoid exotic reduced clauses as the answer."
        : "- INTERMEDIATE priority: choose at least one candidate whose trap requires checking clause boundary, semantic subject, or collocation.",
    ...candidates.map((candidate, index) => {
      const info = GRAMMAR_POINT_CATALOG[candidate.code];
      const preferredUse =
        difficulty === "KILLER" && candidate.tier === "killer"
          ? "answer-preferred"
          : candidate.tier === "basic" && difficulty !== "BASIC"
            ? "decoy-preferred"
            : "answer-or-decoy";
      return [
        `${index + 1}. code=(${candidate.code}) ${info.label}`,
        `tier=${candidate.tier}`,
        `use=${preferredUse}`,
        `expression="${escapePromptSnippet(candidate.expression)}"`,
        `trap="${escapePromptSnippet(candidate.trap)}"`,
        `mutation="${escapePromptSnippet(candidate.mutationHint)}"`,
        `context="${escapePromptSnippet(candidate.surroundingText)}"`,
      ].join(" | ");
    }),
  ].join("\n");
}

function escapePromptSnippet(value: string): string {
  return normalizeText(value).replace(/"/g, "'");
}

function extractGrammarPointCode(value: unknown): GrammarPointCode | null {
  const code = normalizeText(value).toLowerCase().replace(/[^a-m]/g, "");
  return /^[a-m]$/.test(code) ? (code as GrammarPointCode) : null;
}

// 무접미 불규칙 과거분사(형태 변화 없음/특수형) — -ing/-ed/-en 정규식으로는
// 못 잡는 분사들. pointCode (c) 진실성 판정 보강용.
const ZERO_OR_IRREGULAR_PARTICIPLE =
  /\b(?:cut|put|set|hit|let|shut|spread|cost|read|bet|burst|cast|hurt|quit|split|thrust|made|held|left|found|told|kept|brought|thought|caught|taught|sought|spent|sent|lost|won|met|led|paid|laid|said|built|bound|done|gone|seen|known|grown|thrown|blown|flown|shown|drawn|worn|torn|born|sworn|driven|risen|fallen|chosen|frozen|broken|spoken|stolen|woken|written|hidden|bitten|beaten|forgotten|gotten|begun|sung|swum|run|come|become)\b/i;

// 품사 변경 변형 검출: 형용사/동사 → 명사('likely'→'likelihood', 'important'→
// 'importance')는 "어간 유지·형태만 변형" 위반(실측: 프리미엄). 명사화 접미사로
// 한쪽만 갈리고 어간을 공유하는 쌍을 잡는다. 형/부(adj↔adv)는 정상 f 변형이라
// 둘 다 명사 접미사가 아니므로 걸리지 않는다.
const NOUN_FORMING_SUFFIX = /(?:hood|ness|ity|ment|tion|sion|ance|ence|ship|dom|cy)$/;
function isGrammarPosChangeMutation(expression: string, errorExpression: string): boolean {
  const a = normalizeText(expression).toLowerCase();
  const b = normalizeText(errorExpression).toLowerCase();
  if (!a || !b || a === b) return false;
  // 단일 토큰 쌍만 — 구/절은 다른 게이트가 처리
  if (/\s/.test(a) || /\s/.test(b)) return false;
  const aNoun = NOUN_FORMING_SUFFIX.test(a);
  const bNoun = NOUN_FORMING_SUFFIX.test(b);
  if (aNoun === bNoun) return false;
  // 어간 공유(앞 4글자 일치)일 때만 — 무관한 단어 오탐 방지
  return a.slice(0, 4) === b.slice(0, 4);
}

/**
 * pointCode 진실성(휴리스틱): 그 코드가 가리키는 문법은 밑줄 표면에 해당 토큰이
 * 실제로 있어야 한다. 토큰셋이 닫혀 판정이 안전한 코드(b 관계사, c 분사, k
 * to-v/v-ing, l 전치사·접속사)만 검사하고, 모호한 코드는 검사하지 않아 오탐을
 * 피한다. true = 라벨이 표면 토큰과 불일치(가짜 디코이 라벨 의심).
 */
function grammarPointCodeSurfaceMismatch(
  code: GrammarPointCode,
  surface: string,
): boolean {
  const text = normalizeText(surface);
  if (!text) return false;
  switch (code) {
    case "b": // 관계사 — 관계사/명사절 유도어가 표면에 있어야 함
      return !/\b(?:that|what|which|who|whom|whose|where|when|why)\b/i.test(text);
    case "c": // 분사 능/수동 — -ing/-ed/-en 또는 무접미 불규칙 분사
      return (
        !/\b[A-Za-z]+(?:ing|ed|en)\b/i.test(text) &&
        !ZERO_OR_IRREGULAR_PARTICIPLE.test(text)
      );
    case "g": // 대명사 — 닫힌 대명사 토큰셋
      return !/\b(?:it|its|they|them|their|theirs|themselves|itself|that|those|this|these|one|ones|he|him|his|she|her|hers|herself|himself|we|us|our|ours|you|your|yours)\b/i.test(text);
    case "k": // to-v vs v-ing — 'to + 단어' 또는 동명사(-ing)
      return !/\bto\s+[A-Za-z]/i.test(text) && !/\b[A-Za-z]+ing\b/i.test(text);
    case "l": // 전치사 vs 접속사 — 닫힌 혼동쌍 어휘
      return !/\b(?:during|while|despite|although|though|because|since|as|if|unless|before|after|until|when|whereas|whilst)\b/i.test(text) &&
        !/\b(?:in spite of|due to|owing to|thanks to|because of|on account of)\b/i.test(text);
    case "m": // 비교·수량/정도 — 비교 표지 또는 기출(m) 수량·정도 한정사(much/many/few/little/very/almost 등)
      return !/\b(?:more|less|most|least|as|than)\b/i.test(text) &&
        !/\b[A-Za-z]+(?:er|est)\b/i.test(text) &&
        !/\b(?:much|many|few|little|fewer|enough|very|almost|so|too|quite)\b/i.test(text);
    default:
      return false;
  }
}

function hasKillerGrammarStructure(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return (
    /\b(?:what|which|whose|whom|where|when)\b[\s\S]{0,120}\b(?:is|are|was|were|has|have|do|does|can|could|should|would|may|might)\b/i.test(normalized) ||
    /\b(?:with|without)\s+(?:the\s+)?[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){1,6}\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|made|seen|found)\b/i.test(normalized) ||
    /\b(?:when|while|if|unless|once|although)\s+(?:[A-Za-z]+ing|[A-Za-z]+ed|known|left|given|asked|seen)\b/i.test(normalized) ||
    /\b(?:not only|both|either|neither|from|between)\b[\s\S]{10,140}\b(?:but|and|or|nor|to)\b/i.test(normalized) ||
    /\b(?:the number of|a number of|one of|each of|neither of|either of|most of|the rest of)\b[\s\S]{10,120}\b(?:is|are|was|were|has|have|requires?|depends?|seems?)\b/i.test(normalized) ||
    /\b(?:of|with|including|along with|as well as|who|which|that)\b[\s\S]{25,140}\b(?:is|are|was|were|has|have|requires?|depends?|seems?|make|makes)\b/i.test(normalized)
  );
}

function isSimpleAgreementFlip(
  expression: string,
  errorExpression: string,
  correction: string,
): boolean {
  const forms = [expression, errorExpression, correction]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);
  if (forms.length < 2) return false;
  if (!forms.every(isSingleEnglishToken)) return false;
  const stems = forms.map(stripAgreementSuffix);
  return new Set(stems).size === 1 || /^(?:is|are|was|were|has|have|do|does)$/.test(forms.join(" "));
}

function stripAgreementSuffix(value: string): string {
  const lower = value.toLowerCase();
  if (/ies$/.test(lower) && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(lower) && lower.length > 4) {
    return lower.slice(0, -2);
  }
  if (/s$/.test(lower) && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

/** be/have/do/조동사 — 시제 단독변경 게이트에서 제외(수일치·법조동사 변형은 합법). */
const TENSE_GATE_EXCLUDED = new Set([
  "is", "are", "was", "were", "be", "been", "being", "am",
  "has", "have", "had", "do", "does", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
]);

/** 동사 어간 후보 — 굴절형마다 가능한 원형 후보를 모은다(묵음 e·중복자음·-ies 대응). */
function verbStemCandidates(w: string): Set<string> {
  const c = new Set<string>([w]);
  if (/ied$/.test(w) && w.length > 3) c.add(`${w.slice(0, -3)}y`);
  if (/ed$/.test(w) && w.length > 3) {
    c.add(w.slice(0, -2)); // walked→walk
    c.add(w.slice(0, -1)); // outpaced→outpace (묵음 e 동사: base+d)
    c.add(w.slice(0, -2).replace(/([bdgklmnprt])\1$/, "$1")); // stopped→stop
  }
  if (/ies$/.test(w) && w.length > 4) c.add(`${w.slice(0, -3)}y`);
  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(w) && w.length > 4) c.add(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) {
    c.add(w.slice(0, -1)); // outpaces→outpace, walks→walk
    c.add(w.slice(0, -2)); // -es 흡수
  }
  return c;
}

/**
 * 시제 단독변경 감지 — 같은 동사 어간의 현재(3인칭 -s 또는 원형)↔과거(-ed).
 * 정답 시비를 만드는 비검증 변형(realizes↔realized·outpaces↔outpaced).
 * 수일치(be/have/do)·법조동사는 제외. 불규칙 과거(spend↔spent)는 미커버.
 */
function isTenseOnlyMutation(expression: string, errorExpression: string): boolean {
  const a = normalizeText(expression).toLowerCase();
  const b = normalizeText(errorExpression).toLowerCase();
  if (!/^[a-z]+$/.test(a) || !/^[a-z]+$/.test(b) || a === b) return false;
  if (TENSE_GATE_EXCLUDED.has(a) || TENSE_GATE_EXCLUDED.has(b)) return false;
  // 한쪽은 과거(-ed), 다른쪽은 비과거(원형 또는 3인칭 -s)여야 시제 변형.
  if (/ed$/.test(a) === /ed$/.test(b)) return false;
  const ca = verbStemCandidates(a);
  const cb = verbStemCandidates(b);
  for (const stem of ca) {
    if (stem.length >= 3 && cb.has(stem)) return true;
  }
  return false;
}

function isThinKillerGrammarErrorTarget(markedExpression: Record<string, unknown>): boolean {
  const expression = normalizeText(markedExpression.expression);
  const errorExpression = normalizeText(markedExpression.errorExpression);
  const correction = normalizeText(markedExpression.correction);
  const surroundingText = normalizeText(markedExpression.surroundingText);
  const pointCode = extractGrammarPointCode(markedExpression.pointCode);
  const combined = `${expression} ${errorExpression} ${correction} ${surroundingText}`;
  if (hasKillerGrammarStructure(combined)) return false;
  if (pointCode === "d" && isSimpleAgreementFlip(expression, errorExpression, correction)) return true;
  return (
    countWordsForQuality(expression) <= 2 &&
    countWordsForQuality(errorExpression || expression) <= 2 &&
    countWordsForQuality(surroundingText) < 10
  );
}

function isThinKillerGrammarCorrectionTarget(args: {
  sourceText: string;
  displayedText: string;
  displayedError: string;
  sourceCorrection: string;
}): boolean {
  const combined = `${args.sourceText} ${args.displayedText} ${args.displayedError} ${args.sourceCorrection}`;
  if (hasKillerGrammarStructure(combined)) return false;
  if (countWordsForQuality(args.sourceText) < 10) return true;
  return (
    isSimpleAgreementFlip(args.sourceCorrection, args.displayedError, args.sourceCorrection) &&
    !/\b(?:of|which|that|who|with|including|along with|as well as|not only|both|between|from)\b/i.test(args.sourceText)
  );
}

function buildGrammarErrorCandidateBlock(
  passage: string,
  requestedMarkerCount = 5,
  requestedAnswerCount = 1,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  const markedCount = normalizeGrammarMarkedCount(requestedMarkerCount);
  const answerCount = normalizeGrammarAnswerCount(requestedAnswerCount, markedCount);
  const labels = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"]
    .slice(0, markedCount)
    .join(" ");

  // 지문에 규범 논쟁 자리(복수 등위 주어 + 동격 each + 단수동사)가 있으면 구체
  // 인용으로 금지한다 — 추상 규칙만으로는 모델이 이 자리를 고집해 재시도를
  // 소모한다 (실측: attempts 12→30). 게이트(grammar-disputed-usage-target)의
  // 프롬프트 측 짝.
  const disputedSourceMatch = passage.match(
    /\b(?:and|or)\b[^.;]{0,80}?\beach\s+[A-Za-z]+s(?=[\s.,;])/i,
  );
  const disputedBanLine = disputedSourceMatch
    ? `- 🚫 절대 밑줄 금지 자리: 지문의 "...${disputedSourceMatch[0].slice(-60)}..." 구간(복수 등위 주어 + each + 동사 — 표준 규범과 실사용이 갈리는 논쟁 자리)에는 정답으로도 디코이로도 어떤 라벨도 배치하지 마세요. 이 자리를 밑줄 치면 문항이 거부됩니다.`
    : "";

  return [
    "## GRAMMAR_ERROR target planning guardrail",
    disputedBanLine,
    "- ⭐ Underline span = the minimal grammatical unit only (usually 1-3 words, never more than 5). expression/errorExpression IS the exact underlined surface, so keep it to the single token that carries the grammar decision (the verb / participle / relative word / pronoun / adjective-adverb / to-V / connector). NEVER underline a full clause (subject + finite verb + object) or a whole sentence — e.g. 'create', not 'these digital platforms create a trusting environment'.",
    "- ⭐ pointCode must be true to the underlined surface: the code's required token must actually appear inside the underline (b→relative word, c→participle -ing/p.p., k→to-V or -ing, g→pronoun, l→during/while/despite/because, m→comparative marker). Never fabricate a code just to fill decoy diversity.",
    `- The final item must contain ${markedCount} marked expression(s) labeled ${labels}.`,
    `- Exactly ${answerCount} marked expression(s) must be grammatically incorrect.`,
    answerCount >= 2
      ? "- In the direction, do not disclose the answer count; ask students to choose all grammatically incorrect parts using '모두'."
      : "- In the direction, use single-answer wording for one grammatically incorrect part.",
    "- If the requested answer count is lower than the marked count, keep the remaining labels grammatically correct as non-answer decoys. If it equals the marked count, every label must be intentionally incorrect and 오답 분석 can be empty.",
    "- Use the original passage as correct source text. For every answer, mutate only the marked expression and keep the original expression/correction verbatim.",
    "- If the passage has fewer source sentences than requested marked expressions, you may mark more than one expression in a sentence only when they test clearly different clauses or grammar relations.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: make the wrong forms look locally natural until the full sentence structure is checked. Do not use a lone main-verb/subject-verb/local -s error as the answer; it must require checking a relation, reduced clause, semantic subject, long modifier, complement pattern, or parallel range."
      : "",
    // 어법끝 28년 빈도 증류 가이드 — 정답 포인트 코어 풀 + 함정 디코이 카드 +
    // (다양성 모드) variantIndex 로테이션 정답 포인트 지정.
    // 핵심 집중 모드면 정답 포인트를 고빈출 톱셋(1000제 상위 6)으로 좁힌다.
    buildGrammarPointGuidance({
      variantIndex: diversity?.variantIndex,
      usedPointCodes: diversity?.usedPointCodes,
      diversityEnabled: diversity?.diversityEnabled,
      pointFocus: diversity?.pointFocus,
      answerCount,
      requestedDifficulty,
      mode: "judgment",
    }),
    buildGrammarSourceCandidateBlock(
      passage,
      requestedDifficulty,
      "judgment",
      Math.max(12, markedCount + 5),
    ),
    // 다양성 모드: 정답 밑줄의 호스트 문장도 로테이션 힌트로 지정 — 포인트만
    // 지정하면 같은 포인트를 받은 병렬 유닛들이 지문의 같은 '손쉬운 자리'로
    // 수렴한다 (실측: 고유 정답 표현 후퇴). 포인트 지시가 우선인 소프트 힌트.
    diversity?.diversityEnabled && sentences.length > 1
      ? (() => {
          const sentencePool = Math.min(sentences.length, 14);
          const vi =
            typeof diversity.variantIndex === "number" &&
            Number.isFinite(diversity.variantIndex)
              ? Math.max(0, Math.floor(diversity.variantIndex))
              : Math.floor(Math.random() * sentencePool);
          const target = (vi % sentencePool) + 1;
          return `⭐ 다양성 보조 지시: 정답(오류) 밑줄은 되도록 아래 문장 목록의 문장 ${target}에 배치하세요. 지정 포인트의 문법 구조가 그 문장에 없으면 이 문장 힌트는 무시하고 포인트 지시를 따르되, 매번 같은 표현을 오류로 만들지 마세요.`;
        })()
      : "",
    sentences.length
      ? "Detected passage sentences for target distribution:"
      : "No reliable sentence split was detected; still choose exact source expressions from the passage.",
    ...sentences.slice(0, 14).map((sentence, index) => `${index + 1}. ${sentence}`),
  ].filter(Boolean).join("\n");
}

/**
 * 네모 어법 후보 블록 — GRAMMAR_ERROR 가드레일 골격 + 기출 768문항 역설계
 * 조합 규칙(오답 믹스 single 1~2 / multi 1~3 / all 0~1, 슬롯 커버리지).
 */
function buildGrammarChoiceComboCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);

  // GRAMMAR_ERROR 와 동일한 규범 논쟁 자리 구체 금지 — 콤보는 두 후보를 나란히
  // 보여줘 정답 시비 가능성이 더 크다.
  const disputedSourceMatch = passage.match(
    /\b(?:and|or)\b[^.;]{0,80}?\beach\s+[A-Za-z]+s(?=[\s.,;])/i,
  );
  const disputedBanLine = disputedSourceMatch
    ? `- 🚫 절대 네모 금지 자리: 지문의 "...${disputedSourceMatch[0].slice(-60)}..." 구간(복수 등위 주어 + each + 동사 — 표준 규범과 실사용이 갈리는 논쟁 자리)에는 네모를 만들지 마세요.`
    : "";

  // KILLER 는 하드 포인트(b/c/i) 2슬롯이 핵심 변별 장치 — 공유 가이드의 코어 풀
  // 로테이션 지정이 a/d/f 를 가리키면 캘리브레이션 라인과 충돌해 모델이 지정을
  // 따른다 (실측: killer1 에서 point-mix 경고 4/6). KILLER 는 지정을 여기서
  // 하드 우선으로 직접 발행하고, 공유 가이드는 카탈로그/함정 카드만 쓴다.
  const isKiller = requestedDifficulty === "KILLER";
  const killerDesignation = (() => {
    if (!isKiller) return "";
    const hardPool = ["b", "c", "i"];
    const vi =
      typeof diversity?.variantIndex === "number" && Number.isFinite(diversity.variantIndex)
        ? Math.max(0, Math.floor(diversity.variantIndex))
        : 0;
    const first = hardPool[vi % hardPool.length];
    const second = hardPool[(vi + 1) % hardPool.length];
    const third = hardPool[(vi + 2) % hardPool.length];
    return `- ⭐ KILLER 네모 포인트 지정: 두 네모는 하드 포인트 (${first}) ${GRAMMAR_POINT_CATALOG[first as keyof typeof GRAMMAR_POINT_CATALOG].label}, (${second}) ${GRAMMAR_POINT_CATALOG[second as keyof typeof GRAMMAR_POINT_CATALOG].label} 에 배치하세요. 지문에 그 구조가 정말 없으면 (${third}) ${GRAMMAR_POINT_CATALOG[third as keyof typeof GRAMMAR_POINT_CATALOG].label} 로 대체하되, 하드 포인트(b/c/i)가 두 네모 미만이면 안 됩니다. 남은 한 네모는 코어 풀의 다른 포인트를 사용하세요.`;
  })();

  return [
    "## GRAMMAR_CHOICE_COMBO target planning guardrail",
    disputedBanLine,
    "- The final item must contain exactly 3 boxed slots labeled (A) (B) (C), in three different sentences, each testing a different pointCode.",
    "- Each slot's correctExpression must be verbatim source text. The wrongExpression must be clearly ungrammatical in that exact position — never a tense-only change or a debatable stylistic preference.",
    "- 🚫 누설 금지: 네모로 만들 표현(올바른 후보든 틀린 후보든)과 동일한 단어/연어가 지문의 다른 곳에 무마킹으로 그대로 남아 있는 자리는 선택 금지 — 같은 문장의 평행구(예: 동일한 'composed of' 구조 반복)가 있으면 학생이 베껴 풉니다. 그런 자리는 피하고 다른 위치를 고르세요. 위반 시 문항이 거부됩니다.",
    "- Option mix: exactly one all-correct option; among the four wrong options use 1~2 options wrong in one slot, 1~3 options wrong in two slots, and at most 1 option wrong in all three slots. Every slot's wrongExpression must appear in at least one wrong option.",
    isKiller
      ? "- KILLER calibration: at least two slots must test hard points (관계사 b, 분사 능/수동 c, 병렬 i), prefer long-distance dependencies (수식어구 건너 수일치, 절 경계 너머 병렬), and include at least two options wrong in two or more slots."
      : "",
    killerDesignation,
    // 어법끝 빈도 가이드 — 세 슬롯 포인트 지정(answerCount=3 은 폴백 없는
    // 3포인트 지정) + 다양성 회피. KILLER 는 위의 하드 우선 지정이 대신한다.
    buildGrammarPointGuidance({
      variantIndex: diversity?.variantIndex,
      usedPointCodes: diversity?.usedPointCodes,
      diversityEnabled: isKiller ? false : diversity?.diversityEnabled,
      pointFocus: diversity?.pointFocus,
      answerCount: 3,
    }),
    sentences.length
      ? "Detected passage sentences for slot distribution (pick three different sentences):"
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
  diversity?: CandidateDiversityOptions,
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
    // 다양성(반복 생성) 모드 한정 품질 가드 — 지문의 깨끗한 오류 자리가
    // 고갈되는 천장 부근에서 모델이 '깨진 새 문항'(정답시비·조작된 교정)을
    // 양산하는 것을 막는다. 캡 없이 꼬리를 '유효한 반복'으로 흡수. baseline
    // 경로는 이 가드를 받지 않아 동작 불변. (E2E 검증 short-dedup 회귀 대응)
    diversity?.diversityEnabled
      ? [
          "- ⭐ 다양성 한계 가드(반복 생성 시 품질 우선): 변별의 핵심은 '새로운 오류 자리'가 아니라 '명백한 단일 오류'다. 지문에 더 이상 명백하고 논쟁 없는 오류 자리가 남지 않았으면, 모호한 새 자리를 억지로 만들지 말고 앞서 쓴 명백한 오류 자리를 다른 문장·다른 밑줄 범위·다른 해설로 재사용하라. 깨진 새 문항보다 유효한 반복이 낫다.",
          "- 🚫 다음 자리는 정답시비를 유발하므로 새 오류 타깃으로 쓰지 마라: (1) 'and + 동사'가 동명사 병렬로도 정동사 병렬로도 읽히는 자리(예: tried wearing X and turning↔turned Y), (2) one/it/that 등으로 바꿔도 양쪽이 자연스러운 대명사 자리, (3) 능동/수동·시제가 문맥상 양쪽 다 허용되는 자리.",
          "- 🚫 correctedPart 무결성: correctedPart 는 네가 errorPart 로 바꾸기 전 sourceText 원문에 실제로 있던 바로 그 단어(들)여야 한다. 원문에도 errorPart 에도 없는 제3의 단어를 정답으로 만들지 마라 — displayedText 에 correctedPart 를 도로 넣으면 정확히 sourceText 가 되어야 한다.",
        ].join("\n")
      : "",
    buildGrammarPointGuidance({
      variantIndex: diversity?.variantIndex,
      usedPointCodes: diversity?.usedPointCodes,
      diversityEnabled: diversity?.diversityEnabled,
      pointFocus: diversity?.pointFocus,
      answerCount: errorCount,
      requestedDifficulty,
      mode: "correction",
    }),
    buildGrammarSourceCandidateBlock(
      passage,
      requestedDifficulty,
      "correction",
      Math.max(12, errorCount + 6),
    ),
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

function buildReferenceCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
): string {
  // "반드시 목록에서 선택" 하드 지시가 있는 유형이라, 기사용 발생(주변 문맥)을
  // 목록에서 직접 제외해 회피 지시와의 모순을 없앤다 (전부 기사용이면 원본 유지).
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      findReferenceCandidates(passage),
      diversity?.usedTargets,
      (candidate) => candidate.surroundingText,
    ).items,
    diversity?.variantIndex,
  ).slice(0, 12);
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
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      findImpliedMeaningCandidates(passage),
      diversity?.usedTargets,
      (candidate) => candidate.expression,
    ).items,
    diversity?.variantIndex,
  ).slice(0, 10);

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
    // 다양성 모드: 로테이션 후 첫 후보를 명시 지정 (병렬 배치 수렴 방지, 소프트).
    diversity?.diversityEnabled && candidates.length > 0
      ? `- ⭐ 다양성 지시: 이번 문항은 되도록 아래 후보 1번을 underlinedExpression 으로 사용하세요. 그 표현이 함축 출제에 부적합할 때만 다른 후보를 사용하고, 매번 같은 표현으로 수렴하지 마세요.`
      : "",
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

/**
 * 지문에 2회 이상 등장하는 구(3~6단어 n-gram, 최장 우선)를 수집한다.
 * 다중 빈칸에서 반복 구를 빈칸으로 잡으면 남은 출현이 정답을 누설하므로,
 * 소프트 규칙 대신 구체 목록으로 금지한다 (어법 논쟁 자리 금지 라인과 동일 패턴).
 */
const REPEATED_PHRASE_STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "with", "and", "or",
  "but", "is", "are", "was", "were", "be", "been", "being", "that", "this",
  "these", "those", "it", "its", "they", "their", "them", "he", "she", "his",
  "her", "we", "our", "us", "you", "your", "i", "my", "as", "by", "from",
  "not", "no", "do", "does", "did", "have", "has", "had", "will", "would",
  "can", "could", "should", "may", "might", "more", "most", "less", "than",
  "so", "if", "when", "who", "whom", "which", "what", "there", "here", "all",
  "also", "into", "about", "such", "one", "two", "very", "much", "many",
]);

function countContentWords(tokens: string[]): number {
  return tokens.filter(
    (t) => !REPEATED_PHRASE_STOPWORDS.has(t.toLowerCase()) && t.length >= 3,
  ).length;
}

function toLowerTokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z'-]+/).filter(Boolean);
}

/**
 * 의미가 비어 있는 placeholder 명사 + 경동사 — 이들만으로 이뤄진 빈칸은
 * 학생이 내용 이해 없이 관용 표현 감으로 채운다 (예: "doing things").
 */
const SEMANTICALLY_LIGHT_WORDS = new Set([
  "thing", "things", "stuff", "way", "ways", "something", "anything", "everything",
  "someone", "somebody", "one", "ones", "kind", "kinds", "sort", "sorts",
  "do", "doing", "does", "done", "make", "making", "makes", "made",
  "get", "getting", "gets", "got", "have", "having", "has", "had",
  "go", "going", "goes", "gone", "take", "taking", "takes", "taken",
]);

/**
 * 빈칸 표현이 placeholder 명사/경동사만으로 이뤄진 의미 빈약 연어인지 검출한다
 * ("doing things", "get things done"). 내용어가 1개뿐인 단일 표현은 별개라 제외한다.
 */
function isSemanticallyLightExpression(expression: string): boolean {
  const tokens = toLowerTokens(expression).filter(
    (t) => t.length >= 3 && !REPEATED_PHRASE_STOPWORDS.has(t),
  );
  if (tokens.length < 2) return false;
  return tokens.every((t) => SEMANTICALLY_LIGHT_WORDS.has(t));
}

/**
 * 해설이 출제 변형 과정("원문의 X를 Y로 (잘못) 변형/바꿈")을 학생에게 노출하는지
 * 검출한다. 정답 단어를 정상 인용하는 해설은 통과시키고, 변형 동사가 동반될 때만 잡는다.
 */
const EXPLANATION_META_LEAK_PATTERN =
  /['"]?[A-Za-z][A-Za-z'-]*['"]?\s*(?:을|를)\s*['"]?[A-Za-z][A-Za-z'-]*['"]?\s*(?:로|으로)\s*(?:잘못\s*)?(?:변형|바꾸|바꿔|바꾼|치환|교체)/;

function explanationLeaksMutationProcess(explanation: string): boolean {
  if (!explanation) return false;
  return EXPLANATION_META_LEAK_PATTERN.test(explanation) || /잘못\s*변형(?:한|된|하여|해서)/.test(explanation);
}

/**
 * 어법 해설의 메타 누출 — 출제 과정 서술 또는 생성 지침 어휘.
 * 어휘용보다 넓게: 다중어 타깃("to interact")·과거형 어미(변형하였습니다)·
 * 생성 지침 어휘(지시문/가이드라인/함정으로/유도하는 함정/포인트를 활용/출제 의도).
 */
function grammarExplanationLeaksMeta(text: string): boolean {
  if (!text) return false;
  // 생성 지침 어휘 — 학생 해설에 절대 등장하면 안 됨.
  if (/지시문|가이드라인|출제\s*의도|출제\s*포인트|어법\s*포인트\s*(?:관점|측면|차원)|포인트\s*관점에서|유도하는\s*함정|함정으로\s*(?:만들|변형|유도|구성)|포인트를\s*활용|타깃\s*포인트|타고전/.test(text)) {
    return true;
  }
  // 출제 과정 서술: "X(를) Y(로) (잘못) 변형/바꾸/치환/교체 + 하였/했/한/된/하여/해서/시켰/시킨".
  // 타깃 Y 는 다중어(to interact 등)도 허용.
  if (/['"]?[A-Za-z][A-Za-z'\- ]*['"]?\s*(?:을|를)\s*['"]?[A-Za-z][A-Za-z'\- ]*['"]?\s*(?:로|으로)\s*(?:잘못\s*)?(?:변형|바꾸|바꿔|바꾼|치환|교체|변경)(?:하였|했|한|된|하여|해서|시켰|시킨)/.test(text)) {
    return true;
  }
  // 한국어 변형 서술 — 주어/대상이 한국어("이를 ~로 변형하였으므로")라 위 영어
  // 패턴이 놓친 누출. 과거시제 변형 동사(변형하였/했/시켰)는 *이미 변형한* 산출물
  // 임을 노출 — 클린 해설은 "변형하면"(조건)이지 "변형하였"(완료)을 안 쓴다.
  if (/(?:로|으로)\s*(?:잘못\s*)?(?:변형|치환|교체|변경)(?:하였|했(?!\s*을\s*때)|시켰|시킨|한\s*것|하므로|하였으므로|하여|해서)/.test(text)) {
    return true;
  }
  // 생성 설계 어휘 + "틀린/잘못된 변형" 명시. (포인트 설정/이번 문항에서는 = 출제 메타)
  if (/정답\s*설계|출제\s*설계|설계에\s*따라|(?:정답\s*)?포인트\s*설정|이번\s*문항에서는|(?:틀린|잘못된|오답)\s*변형/.test(text)) {
    return true;
  }
  // 내부 생성 필드명 노출 (errorExpression/pointCode 등) — 학생 해설에 절대 금지.
  if (/\b(errorExpression|correctExpression|wrongExpression|pointCode|_?typeId|slotValues?)\b/i.test(text)) {
    return true;
  }
  // 원형(변형 전) 누설·변형 형태·출제 설계 포인트 — 후처리 청소기와 동일 표면형.
  if (/원문은|원(?:문|래)\s*표현|정답형(?:인|을|이|은)|변형(?:된|한|인)?\s*형태|(?:정답으로|정답형으로|오답으로)\s*변형|포인트로\s*설계|(?:의도된|의도한)\s*(?:정답\s*)?포인트|변형(?:한|된|인)\s*(?:것|부분|결과|표현|단어)/.test(text)) {
    return true;
  }
  // 출제 프레이밍·원본 노출·수동 변형 서사 (라운드2~3).
  if (/문제에서(?:는|의)|문제를?\s*설계(?:했|하였|한)|(?:실제\s*)?본문에서(?:의)?\s*올바른|올바른\s*표현은\s*['"]?[A-Za-z]|정답으로\s*지정|(?:정답\s*)?포인트\s*설계|설계\s*지시|(?:정답\s*)?포인트인\b|지정된\s*\d\s*순위|\d\s*순위[^.]*?어법\s*포인트|어법\s*포인트의\s*검토|고친\s*형태|변형(?:되어|되었|됨)|변형하게\s*되면/.test(text)) {
    return true;
  }
  // 조건형 변형 서사 ("…으로 변형하면/바꾸면 … 틀리/비문/오답").
  // 주의: "틀립니다/틀린"은 음절이 달라 "틀리"로 안 잡힘 → 음절 집합으로.
  if (/(?:로|으로)\s*(?:잘못\s*)?(?:변형|바꾸|바꿔|치환|고치)(?:하면|면|하여|해서|한|게\s*되면)[^.]*?(?:틀[린립려리렸림]|비문|오류|오답|어긋|없[어이]|사라)/.test(text)) {
    return true;
  }
  return false;
}

/**
 * 빈칸 값의 의미 핵심부(연속한 내용어 2개 이상 부분구)가 빈칸 처리 후 본문에
 * 그대로 남아 정답을 부분 누설하는지 검출한다. 전체 일치는 별도 게이트가 잡으므로
 * 여기서는 부분구만 본다. 잔존 부분구를 찾으면 반환, 없으면 null.
 */
function findVisibleContentSubphrase(answer: string, blankedPassage: string): string | null {
  const tokens = toLowerTokens(answer);
  if (tokens.length < 2) return null;
  // 구두점을 제거하고 토큰 단위로 비교 (구두점이 붙은 "situations," 같은 잔존을 놓치지 않도록).
  const haystack = ` ${toLowerTokens(blankedPassage).join(" ")} `;
  for (let len = tokens.length - 1; len >= 2; len -= 1) {
    for (let i = 0; i + len <= tokens.length; i += 1) {
      const window = tokens.slice(i, i + len);
      if (countContentWords(window) < 2) continue;
      const phrase = window.join(" ");
      if (haystack.includes(` ${phrase} `)) return phrase;
    }
  }
  return null;
}

/**
 * 어휘 적절성 정답의 원단어(치환 전 단어)가 본문 마커 밖에 또 등장하면 학생이
 * 정답을 즉답할 수 있다. 단일 내용어(길이 4+, 기능어 제외)만 검사한다.
 */
function sourceWordVisibleOutsideMarkers(
  passageWithMarkers: string,
  sourceWord: string,
): boolean {
  const lower = sourceWord.toLowerCase();
  if (lower.length < 4 || REPEATED_PHRASE_STOPWORDS.has(lower) || !isSingleEnglishToken(lower)) {
    return false;
  }
  const stripped = passageWithMarkers.replace(/__\([a-jA-J]\)[^_]*__/g, " ");
  return toLowerTokens(stripped).includes(lower);
}

function findRepeatedPassagePhrases(passage: string, cap = 10): string[] {
  const words = passage
    .replace(/[^\p{L}\p{N}'\- ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 6) return [];
  const lower = words.map((w) => w.toLowerCase());

  // 내용어 시작 위치별 출현 인덱스. 초고빈도 토큰은 비용·노이즈 가드로 제외.
  const positionsByWord = new Map<string, number[]>();
  for (const [index, token] of lower.entries()) {
    if (REPEATED_PHRASE_STOPWORDS.has(token) || token.length < 3) continue;
    const list = positionsByWord.get(token);
    if (list) list.push(index);
    else positionsByWord.set(token, [index]);
  }

  // 같은 내용어에서 시작하는 출현 쌍을 최대 길이까지 확장해, 겹치는 n-gram
  // 조각이 아니라 반복 구간 전체를 하나의 후보로 수집한다.
  const sampleByNorm = new Map<string, string>();
  for (const positions of positionsByWord.values()) {
    if (positions.length < 2 || positions.length > 25) continue;
    for (let a = 0; a < positions.length - 1; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        const start = positions[a];
        const other = positions[b];
        let len = 0;
        while (
          other + len < lower.length &&
          start + len < other &&
          lower[start + len] === lower[other + len]
        ) {
          len += 1;
        }
        // 꼬리의 기능어는 잘라 구절을 자연스럽게 만든다.
        while (len > 0 && REPEATED_PHRASE_STOPWORDS.has(lower[start + len - 1])) {
          len -= 1;
        }
        if (len < 2) continue;
        const tokens = words.slice(start, start + len);
        if (countContentWords(tokens) < 2) continue;
        const norm = lower.slice(start, start + len).join(" ");
        if (!sampleByNorm.has(norm)) sampleByNorm.set(norm, tokens.join(" "));
      }
    }
  }

  // 더 긴 반복 구간에 포함되는 부분 구절은 제거하고 최대 구간만 남긴다.
  const norms = [...sampleByNorm.keys()].sort((x, y) => y.length - x.length);
  const collected: string[] = [];
  const collectedNorm: string[] = [];
  for (const norm of norms) {
    if (collectedNorm.some((longer) => longer.includes(norm))) continue;
    collected.push(sampleByNorm.get(norm)!);
    collectedNorm.push(norm);
    if (collected.length >= cap) break;
  }
  return collected;
}

/**
 * 다중 빈칸 전용 후보 제약 블록 — 단일 빈칸 후보 블록 대신 주입된다.
 */
function buildMultiBlankAvoidBlock(passage: string): string {
  const repeated = findRepeatedPassagePhrases(passage);
  if (repeated.length === 0) return "";
  return [
    "## 다중 빈칸 후보 제약 (지문 자동 스캔)",
    "다음 표현은 지문에 2회 이상 등장하므로 빈칸(blanks[].originalExpression)으로 선택 금지 — 빈칸을 뚫어도 남은 출현이 정답을 그대로 누설해 문항이 거부됩니다:",
    ...repeated.map((p) => `- "${p}"`),
    "위 표현과 그 일부를 포함한 구절도 피하고, 지문에 정확히 1회만 등장하는 표현을 선택하세요.",
  ].join("\n");
}

/** 결론/주장 담화 표지 — KILLER 빈칸 위치(핵심 논지부) 후보 점수에 사용. */
const THESIS_DISCOURSE_MARKERS =
  /\b(?:therefore|thus|hence|consequently|as a result|in short|in sum|in essence|in other words|in conclusion|ultimately|overall|this means|the point is|what matters|the key|crucially|in fact)\b/i;

function scoreThesisSentence(sentence: string, index: number, total: number): number {
  let score = 0;
  if (THESIS_DISCOURSE_MARKERS.test(sentence)) score += 3;
  if (index >= total - 2) score += 2; // 결론부(마지막 두 문장)
  if (index === 0) score += 1; // 주제문(첫 문장)
  // 나열 위주 문장은 간결한 스팬을 잡기 어려워 list-like 거부를 유발한다 — 후순위.
  if ((sentence.match(/,/g) ?? []).length >= 2) score -= 2;
  return score;
}

/**
 * KILLER 단일 빈칸 전용 설계 블록 — 빈칸을 글의 핵심 논지(주제문·결론·인과의
 * 귀결)에 두고 정답을 추상 패러프레이즈로 요구한다. 검수 실측(평균 4.0/10)에서
 * KILLER 빈칸이 지엽 세부 + 원문 verbatim 정답 + 무간섭 오답으로 일관되게
 * 미달했던 것의 직접 대응. 후보 문장은 thesis 점수순으로 제시·지정한다.
 */
function buildKillerBlankCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  const total = sentences.length;
  const candidates = filterUsedCandidates(
    sentences
      .map((sentence, index) => ({ sentence, index }))
      .filter(({ sentence }) => countContentTokens(sentence) >= 4),
    diversity?.usedTargets,
    ({ sentence }) => sentence,
  ).items;
  const ranked = [...candidates].sort(
    (a, b) =>
      scoreThesisSentence(b.sentence, b.index, total) -
      scoreThesisSentence(a.sentence, a.index, total),
  );
  // thesis 신호(점수>0)가 있는 문장만 우선 — 설정부/서사 문장이 풀에 섞이면
  // 결론 명제를 설정부 빈칸에 박는 극성 전도가 발생한다(검수 실측 critical).
  // 신호 문장이 너무 적으면 0점 문장으로 보충해 다양성 회전은 유지한다.
  const scored = ranked.filter(
    ({ sentence, index }) => scoreThesisSentence(sentence, index, total) > 0,
  );
  const pool = (scored.length >= 3 ? scored : ranked).slice(0, 8);

  let designated: { sentence: string; index: number } | undefined;
  if (diversity?.diversityEnabled && pool.length > 0) {
    const vi =
      typeof diversity.variantIndex === "number" && Number.isFinite(diversity.variantIndex)
        ? Math.max(0, Math.floor(diversity.variantIndex))
        : Math.floor(Math.random() * pool.length);
    // 재시도 오프셋(attempt×variantCount)이 pool 크기와 배수 관계면 mod 에서
    // 소거돼 같은 문장이 계속 지정된다(실측: list-like 문장 7연속 거부 → 미생성).
    // tier(풀을 몇 바퀴 돌았나)를 더해 재시도마다 다음 후보로 이동시킨다.
    const tier = Math.floor(vi / pool.length);
    designated = pool[(vi + tier) % pool.length];
  }

  return [
    designated
      ? `⭐ 다양성 지시 (항상 적용): 이번 문항은 되도록 다음 문장에서 빈칸 타깃(originalExpression)을 선택하세요: "${designated.sentence}" 그 문장에 간결한 핵심 술부가 없으면(콤마 나열 구간뿐이면) 주저 없이 아래 다른 후보 문장으로 넘어가고, 매번 같은 표현으로 수렴하지 마세요.`
      : "",
    "## KILLER 빈칸 설계 (필수)",
    "이 문항은 KILLER 난이도입니다. 다음 세 가지를 모두 지키지 않으면 거부됩니다:",
    "1. 빈칸 위치: 글의 핵심 논지가 담긴 자리 — 주제문, 결론, 인과의 귀결부, 필자 주장의 핵심 술부. 예시·나열·수치·부수적 세부사항(비용, 시간 같은 지엽)을 빈칸으로 만들지 마세요. originalExpression 은 2~7단어의 간결한 술부/구여야 하며 콤마·콜론·세 항목 이상 나열을 포함하면 거부됩니다 — 문장이 길면 핵심 술부만 잘라 선택하세요.",
    "2. 정답 보기: blankAnswerMode 를 \"PARAPHRASE\" 로 출력하고, 정답 선지는 originalExpression 의 verbatim 복사가 아니라 같은 의미의 **추상적 재진술**이어야 합니다. originalExpression 자체는 여전히 원문 그대로(한 글자도 바꾸지 않고) 출력하세요 — 빈칸 위치 식별용입니다.",
    "2a. 의미 보존: 정답은 그 스팬이 그 자리에서 말하는 명제를 보존해야 합니다. 스팬이 긍정 외양 진술이면 정답도 같은 명제의 재진술이어야 하며, 글 전체의 결론(반대 극성)을 대신 넣으면 담화가 붕괴되어 거부됩니다.",
    "2b. 슬롯 문법: 정답을 빈칸에 넣은 문장이 완전한 정문이어야 합니다 — 스팬이 주어로 시작하면 정답도 주어를 포함하고, 'to ___' 자리면 동사원형으로 시작하고(동명사 금지), 스팬의 동사가 3인칭 단수형이면 정답 동사도 수일치를 유지하고, 스팬 뒤에 관계절(, where/, which)이 남으면 그 선행사가 되는 명사로 끝나야 합니다.",
    "3. 오답 설계 — 두 가지 균형을 모두 지키세요 (위반 시 거부):",
    "   3a. 극성 균형: 정답이 부정 극성(상실·제약·실패류)이면 오답 중 최소 2개도 부정 극성이어야 합니다. 'Unfortunately' 같은 전환 뒤 빈칸에서 정답만 부정이고 오답이 전부 긍정이면 극성 스캔만으로 즉답됩니다.",
    "   3b. 추상도 균형: 오답 중 최소 2개는 정답과 같은 추상 수준(논제급 일반 진술)이어야 합니다. 정답만 추상이고 오답이 전부 구체 사실 나열이면 '가장 추상적인 선지 고르기'로 즉답됩니다.",
    "   매력 오답은 인과 역전, 범위 과장(절대어 purely/entirely 함정), 절반-진실(본문 개념을 빌리되 결론을 비틀기)로 틀리게 만들고, 최소 2개는 본문 어휘·개념을 재활용하세요.",
    pool.length ? "핵심 논지 후보 문장 (우선순위순):" : "",
    ...pool.map(
      ({ sentence, index }) => `${index + 1}. ${sentence}`,
    ),
  ].filter(Boolean).join("\n");
}

function buildBlankInferenceCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
  options: {
    paraphraseAnswer?: boolean;
    doubleNegative?: boolean;
    requestedDifficulty?: string;
  } = {},
): string {
  // 출제 포인트 집중(focus) 가이드 — 정답 형태(환언/이중부정/표준)와 직교하는
  // "정답논리 축"이라 모드 무관하게 후보 블록 앞에 1회 주입한다. pointFocus 미지정
  // 이면 "" 반환이라 기존(비-focus) 동작 불변.
  const pointGuidance = buildBlankPointGuidance({
    variantIndex: diversity?.variantIndex,
    pointFocus: diversity?.pointFocus,
    diversityEnabled: diversity?.diversityEnabled,
  });

  const block = options.paraphraseAnswer
    ? buildBlankParaphraseCandidateBlock(
        passage,
        options.requestedDifficulty,
        diversity,
      )
    : options.doubleNegative
      ? buildNegativeBlankInferenceCandidateBlock(passage, diversity)
      : buildStandardBlankInferenceCandidateBlock(
          passage,
          options.requestedDifficulty,
          diversity,
        );

  return [pointGuidance, block].filter(Boolean).join("\n\n");
}

function buildNegativeBlankInferenceCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  // 기사용 빈칸 스팬을 담고 있는 문장은 후보에서 제외 (전부 걸러지면 원본 유지).
  const candidateSentences = filterUsedCandidates(
    sentences
      .map((sentence, index) => ({ sentence, index }))
      .filter(({ sentence }) => isUsefulNegativeParaphraseSourceSentence(sentence)),
    diversity?.usedTargets,
    ({ sentence }) => sentence,
  ).items;
  const strongCandidates = rotateByVariantIndex(
    candidateSentences.filter(
      ({ sentence }) => getNegativeParaphraseSuggestedTargets(sentence).length > 0,
    ),
    diversity?.variantIndex,
  ).slice(0, 8);
  const secondaryCandidates = candidateSentences
    .filter(({ sentence }) => getNegativeParaphraseSuggestedTargets(sentence).length === 0)
    .slice(0, 4);
  // 다양성 모드: 후보 문장 하나를 명시 지정해 병렬 배치의 각 호출이 실제로 다른
  // 문장을 타깃하게 한다 (제안 순서만으로는 모델이 같은 '최적' 문장으로 수렴).
  // 지정 풀은 강한 후보만이 아니라 사용 가능한 후보 전체 — 짧은 지문에서 강한
  // 후보가 2~3개뿐이면 variantIndex mod 충돌로 같은 문장이 반복 지정되기 때문.
  // 풀을 한 바퀴 돈 변형(spanTier>0)은 같은 문장 안에서 다른 스팬을 우선하게 한다.
  // 소프트 지시 — 부적합하면 다른 후보 허용이라 신규 reject 압력 없음.
  let designatedBlankTarget: { sentence: string; index: number } | undefined;
  let designatedSpanHint = "";
  let designatedSpanTier = 0;
  if (diversity?.diversityEnabled && candidateSentences.length > 0) {
    const designationPool = candidateSentences.slice(0, 12);
    const vi =
      typeof diversity.variantIndex === "number" &&
      Number.isFinite(diversity.variantIndex)
        ? Math.max(0, Math.floor(diversity.variantIndex))
        : Math.floor(Math.random() * designationPool.length);
    designatedBlankTarget = designationPool[vi % designationPool.length];
    designatedSpanTier = Math.floor(vi / designationPool.length);
    const suggestedSpans = getNegativeParaphraseSuggestedTargets(
      designatedBlankTarget.sentence,
    );
    if (suggestedSpans.length > 0) {
      designatedSpanHint = suggestedSpans[designatedSpanTier % suggestedSpans.length];
    }
  }

  if (candidateSentences.length === 0) {
    return [
      "## BLANK_INFERENCE negative-paraphrase target note",
      "- No strong automatic target candidate was detected.",
      "- If the negative-paraphrase detail setting is active, still produce a valid item by choosing a compact central phrase with a logical action or relation.",
      "- The source sentence does not need to contain a negation cue. The correct option must carry the negative/privative paraphrase.",
    ].join("\n");
  }

  return [
    // 지정 라인은 DN 조건부 블록 제목보다 앞에 — "negative-paraphrase 설정일 때만"
    // 으로 읽혀 통째로 무시되지 않게 한다 (다양성 지시는 무조건 적용 대상).
    designatedBlankTarget
      ? `⭐ 다양성 지시 (항상 적용): 이번 문항은 되도록 다음 문장에서 빈칸 타깃(originalExpression)을 선택하세요: "${designatedBlankTarget.sentence}"${
          designatedSpanHint
            ? ` 그 문장 안에서는 "${designatedSpanHint}" 구간을 우선 고려하세요.`
            : designatedSpanTier > 0
              ? " 이 문장은 다른 문항에서도 쓰일 수 있으니 문장의 앞부분이 아닌 다른 구간을 빈칸으로 잡으세요."
              : ""
        } 그 문장이 빈칸 출제에 부적합할 때만 다른 후보를 사용하고, 매번 같은 표현으로 수렴하지 마세요.`
      : "",
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

function buildStandardBlankInferenceCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const minWords =
    requestedDifficulty === "KILLER"
      ? 6
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 3
        : 2;
  const sentences = splitPassageSentences(passage);
  const candidateRows = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      targets: getStandardBlankInferenceSuggestedTargets(
        sentence,
        requestedDifficulty,
      ),
    }))
    .filter((item) => item.targets.length > 0);
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      candidateRows,
      diversity?.usedTargets,
      ({ sentence }) => sentence,
    ).items.sort(
      (a, b) =>
        Math.max(...b.targets.map(scoreStandardBlankInferenceTarget)) -
        Math.max(...a.targets.map(scoreStandardBlankInferenceTarget)),
    ),
    diversity?.variantIndex,
  ).slice(0, 8);

  if (candidates.length === 0) {
    return [
      "## BLANK_INFERENCE source-exact target note",
      "- Standard blank mode is active: the correct option may match originalExpression, so the source span itself must carry the inference difficulty.",
      `- For ${requestedDifficulty || "the requested difficulty"}, choose originalExpression as a compact central relation with at least ${minWords} words and ${minContent} meaningful content words when possible.`,
    "- Avoid tiny local tails, reciprocal filler such as 'both parties review each other', long punctuation spans, comma-separated lists, example lists, and isolated abstract nouns.",
      "- KILLER items should blank a claim, causal relation, evaluative turn, or contrast that requires checking the surrounding passage logic.",
    ].join("\n");
  }

  return [
    "## BLANK_INFERENCE source-exact target candidates",
    "- Standard blank mode is active: the correct option may copy originalExpression, so the blank target must be intrinsically inference-worthy.",
    `- For ${requestedDifficulty || "the requested difficulty"}, prefer a clean semantic unit with at least ${minWords} words and ${minContent} meaningful content words, while staying within 13 words and 95 characters.`,
    "- Do not blank a tiny local tail, reciprocal filler such as 'both parties review each other', a colon/semicolon span, a comma-separated list, or an example-list slot.",
    "- For KILLER, choose a passage-central claim/relation/contrast; do not make the answer recoverable from one nearby collocation alone.",
    "- Every option must fit the exact same grammatical slot as originalExpression and include at least two passage-grounded near misses.",
    "Suggested candidates:",
    ...candidates.map(({ sentence, index, targets }) => (
      `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${targets
        .slice(0, 3)
        .map((target) => `"${target}"`)
        .join(", ")}`
    )),
  ].join("\n");
}

function getStandardBlankInferenceSuggestedTargets(
  sentence: string,
  requestedDifficulty?: string,
): string[] {
  const targets: string[] = [];
  const add = (value: string | undefined) => {
    const target = normalizeSuggestedTarget(value ?? "");
    if (isValidStandardBlankInferenceTarget(target, requestedDifficulty)) {
      targets.push(target);
    }
  };

  const patterns = [
    /\b((?:is|are|was|were|becomes?|became|remains?)\s+(?:driven|shaped|defined|constrained|guided|grounded|organized|supported|limited)\s+by\s+[^.;:!?]{18,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:these|those|such|this|that|the|a|an|most|many|some|users|people|companies|platforms|systems|policy|policies|technology|technologies|models|choices|decisions|problem|issue|challenge|capacity|ability|process|world|economy)\s+[^.;:!?]{0,35}?\b(?:creates?|takes? advantage of|utilizes?|benefits?|requires?|depends?|allows?|enables?|prevents?|fosters?|illuminates?|reveals?|demonstrates?|suggests?|shows?|reflects?|transforms?|reorganizes?|preserves?|maintains?|weakens?|strengthens?|distinguishes?|addresses?|reduces?|increases?|changes?)\b[^.;:!?]{10,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:not\s+(?:because|whether|only|merely)|rather than|instead of)\b[^.;:!?]{20,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:selling|creating|maintaining|preserving|cultivating|developing|protecting|reducing|reorganizing|distinguishing|balancing|challenging|supporting|strengthening|weakening|sharing|utilizing)\b[^.;:!?]{12,95}?)(?=\.|,|;|:|$)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence))) {
      add(match[1]);
    }
  }

  return [...new Set(targets)]
    .sort((a, b) => scoreStandardBlankInferenceTarget(b) - scoreStandardBlankInferenceTarget(a))
    .slice(0, 4);
}

function isValidStandardBlankInferenceTarget(
  target: string,
  requestedDifficulty?: string,
): boolean {
  if (!target) return false;
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const minWords =
    requestedDifficulty === "KILLER"
      ? 6
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 3
        : 2;

  return (
    wordCount >= minWords &&
    wordCount <= 13 &&
    contentCount >= minContent &&
    target.length <= 95 &&
    !hasTrailingFunctionWordBlankTarget(target) &&
    !isListLikeBlankTarget(target) &&
    !isSingleAbstractNounTarget(target) &&
    !isLowValueKillerBlankTarget(target)
  );
}

function scoreStandardBlankInferenceTarget(target: string): number {
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const relationBonus = /\b(?:not|but|because|therefore|requires?|depends?|allows?|enables?|prevents?|fosters?|illuminates?|reveals?|suggests?|creates?|takes? advantage|selling|benefit|driven|trusting|capacity|transaction|product|traditional)\b/i.test(target)
    ? 4
    : 0;
  const widthPenalty = wordCount > 12 ? 1 : 0;
  return contentCount * 2 + relationBonus - widthPenalty;
}

function buildBlankParaphraseCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const minWords =
    requestedDifficulty === "KILLER"
      ? 7
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 2;
  const sentences = splitPassageSentences(passage);
  const candidateRows = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      targets: getBlankParaphraseSuggestedTargets(
        sentence,
        requestedDifficulty,
      ),
    }))
    .filter((item) => item.targets.length > 0);
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      candidateRows,
      diversity?.usedTargets,
      ({ sentence }) => sentence,
    ).items.sort(
      (a, b) =>
        Math.max(...b.targets.map(scoreBlankParaphraseTarget)) -
        Math.max(...a.targets.map(scoreBlankParaphraseTarget)),
    ),
    diversity?.variantIndex,
  ).slice(0, 8);

  if (candidates.length === 0) {
    return [
      "## BLANK_INFERENCE paraphrase-answer target note",
      "- The blank paraphrase setting is active, but no strong automatic source target was detected.",
      `- For ${requestedDifficulty || "the requested difficulty"}, choose originalExpression as a clean semantic unit with at least ${minWords} words and ${minContent} meaningful content words when possible.`,
      "- Avoid tiny local tails, long clauses, punctuation/list spans, and dangling modal/auxiliary/function-word endings.",
      "- The visible correct option must be a non-verbatim paraphrase that fits the exact same grammatical slot.",
    ].join("\n");
  }

  return [
    "## BLANK_INFERENCE paraphrase-answer target candidates",
    "- The blank paraphrase setting is active. Prefer one of these source-backed originalExpression candidates instead of a tiny local tail.",
    `- For ${requestedDifficulty || "the requested difficulty"}, originalExpression should have at least ${minWords} words and ${minContent} meaningful content words when possible, while staying within 12 words and 90 characters.`,
    "- Use a suggested originalExpression exactly when it fits the item; otherwise choose the same kind of compact semantic relation from the listed sentence.",
    "- Do not choose a whole clause, comma-separated list span, or a 2-3 word tail such as 'making subsequent judgments' for INTERMEDIATE/KILLER.",
    "- The visible correct option must paraphrase the selected source span, preserve polarity and grammar slot, and avoid copying source wording.",
    "Suggested candidates:",
    ...candidates.map(({ sentence, index, targets }) => (
      `${index + 1}. ${sentence}\n   Suggested originalExpression options: ${targets
        .slice(0, 3)
        .map((target) => `"${target}"`)
        .join(", ")}`
    )),
  ].join("\n");
}

function getBlankParaphraseSuggestedTargets(
  sentence: string,
  requestedDifficulty?: string,
): string[] {
  const targets: string[] = [];
  const add = (value: string | undefined) => {
    const target = normalizeSuggestedTarget(value ?? "");
    if (isValidBlankParaphraseSuggestedTarget(target, requestedDifficulty)) {
      targets.push(target);
    }
  };

  const patterns = [
    /\b(?:tendency|tendencies)\s+to\s+([^.;:!?]{20,95}?)(?=\s+when\b|,|\.|;|:|$)/gi,
    /\b(?:ability|capacity)\s+to\s+([^.;:!?]{20,95}?)(?=\s+(?:depend(?:ed|s)?|was|is|are|were)\b|,|\.|;|:|$)/gi,
    /\b((?:ability|capacity)\s+to\s+[^.;:!?]{20,95}?)(?=,|\.|;|:|$)/gi,
    /\b((?:does|do|did|is|are|was|were)\s+not\s+(?:simply|merely|only)?\s*[^.;:!?]{10,80}?\s+but\s+[^.;:!?]{10,80}?)(?=\.|,|;|:|$)/gi,
    /\b((?:not\s+because|not\s+whether|not\s+only|not\s+merely)\b[^.;:!?]{20,95}?)(?=\.|,|;|:|$)/gi,
    /\b((?:requires?|depends?|allows?|enables?|helps?|prevents?|fosters?|illuminates?|reveals?|demonstrates?|suggests?|shows?)\b[^.;:!?]{15,90}?)(?=\.|,|;|:|$)/gi,
    /\b((?:bridge|bridging|maintain|maintaining|preserve|preserving|cultivate|cultivating|engage|engaging|recognize|recognizing|interpret|interpreting|reconcile|reconciling|construct|constructing|shape|shaping|adapt|adapting)\b[^.;:!?]{12,90}?)(?=\.|,|;|:|$)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence))) {
      add(match[1]);
    }
  }

  return [...new Set(targets)]
    .sort((a, b) => scoreBlankParaphraseTarget(b) - scoreBlankParaphraseTarget(a))
    .slice(0, 4);
}

function isValidBlankParaphraseSuggestedTarget(
  target: string,
  requestedDifficulty?: string,
): boolean {
  if (!target) return false;
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const minWords =
    requestedDifficulty === "KILLER"
      ? 7
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 3;
  const minContent =
    requestedDifficulty === "KILLER"
      ? 5
      : requestedDifficulty === "INTERMEDIATE"
        ? 4
        : 2;

  return (
    wordCount >= minWords &&
    wordCount <= 12 &&
    contentCount >= minContent &&
    target.length <= 90 &&
    !hasTrailingFunctionWordBlankTarget(target) &&
    !isListLikeBlankTarget(target) &&
    !isSingleAbstractNounTarget(target)
  );
}

function scoreBlankParaphraseTarget(target: string): number {
  const wordCount = countWordsForQuality(target);
  const contentCount = countContentTokens(target);
  const relationBonus = /\b(?:not|but|because|therefore|requires?|depends?|allows?|enables?|prevents?|fosters?|illuminates?|constructs?|shapes?|bridge|maintain|preserve|critical|selective)\b/i.test(target)
    ? 3
    : 0;
  const widthPenalty = wordCount > 11 ? 1 : 0;
  return contentCount * 2 + relationBonus - widthPenalty;
}

function buildIrrelevantCandidateBlock(
  passage: string,
  requestedSlotCount = 5,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
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
  // 다양성 모드에서는 같은 지문의 기존 정답 위치를 피해 최소 사용 위치를 고른다.
  const targetIndex = diversity?.diversityEnabled
    ? Number(
        pickSteeredPositions(
          ["2", "3", "4"],
          diversity.usedAnswerLabels ?? [],
          diversity.variantIndex,
          1,
        )[0] ?? "3",
      ) - 1
    : (() => {
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
  irrelevantSlotCount,
  grammarMarkerCount,
  grammarAnswerCount,
  grammarCorrectionErrorCount,
  grammarErrorCount,
  stemLanguage,
  optionLanguage,
  vocabChoiceMarkerCount,
  vocabChoiceAnswerCount,
  sentenceInsertSlotCount,
  antonymPairCount,
  blankInferenceBlankCount,
  blankInferenceParaphraseAnswer,
  genericOptionCount,
  genericAnswerCount,
  contentMatchType,
  answerPolarity,
  diversityUsedTargets,
}: ValidateQuestionQualityInput): QuestionQualityIssue[] {
  const issues: QuestionQualityIssue[] = [];
  const add = (severity: QuestionQualitySeverity, code: string, message: string) => {
    issues.push({ severity, code, message });
  };

  if (requestedDifficulty && question.difficulty && question.difficulty !== requestedDifficulty) {
    add("warning", "difficulty-mismatch", `Expected ${requestedDifficulty}, got ${question.difficulty}.`);
  }

  validateDiversityTargetReuse(question, typeId, diversityUsedTargets, add);

  validateOptions(question, typeId, genericOptionCount, add);

  // Teacher-requested multi-answer for free-text option types: enforce the
  // exact answer-label count. Single-answer (default) keeps the legacy
  // behavior with no additional gate.
  if (
    typeof genericAnswerCount === "number" &&
    Number.isFinite(genericAnswerCount) &&
    genericAnswerCount >= 2
  ) {
    const expectedAnswers = Math.round(genericAnswerCount);
    const answerLabels = collectCorrectAnswerLabels(question);
    if (answerLabels.length !== expectedAnswers) {
      add(
        "error",
        "generic-answer-count",
        `Expected exactly ${expectedAnswers} correct answer label(s), got ${answerLabels.length}.`,
      );
    }
  }
  validateMarkedText(question, add);
  validateTypeSpecific(
    question,
    typeId,
    passage,
    requestedDifficulty,
    irrelevantSlotCount,
    grammarMarkerCount ?? grammarErrorCount,
    grammarAnswerCount,
    grammarCorrectionErrorCount,
    stemLanguage,
    optionLanguage,
    vocabChoiceMarkerCount,
    vocabChoiceAnswerCount,
    sentenceInsertSlotCount,
    antonymPairCount,
    blankInferenceBlankCount,
    blankInferenceParaphraseAnswer,
    add,
  );

  // ── 정답 극성 토글 게이트 (강제 설정일 때만 동작 — 미설정/기본 경로 불변) ──
  if (
    typeId === "CONTENT_MATCH" &&
    (contentMatchType === "일치" || contentMatchType === "불일치")
  ) {
    validateContentMatchPolarity(question, contentMatchType, add);
  }
  if (
    answerPolarity === "NEGATIVE" &&
    (typeId === "TOPIC" ||
      typeId === "MAIN_IDEA" ||
      typeId === "TOPIC_MAIN_IDEA" ||
      typeId === "TITLE")
  ) {
    validateGistNegativePolarity(question, typeId, add);
  }

  if (requestedDifficulty === "KILLER") {
    validateKillerBar(question, typeId, add);
  }

  // SHIP-FIRST 강등: 취향/난이도 게이트(B 36종)는 차단(error)이 아니라 경고로만
  // 남긴다 — 강사 의도 우선, 명백한 오류만 차단. 단일 진실원(개별 emit 사이트 무수정).
  return issues.map((issue) =>
    issue.severity === "error" && SHIP_FIRST_WARNING_CODES.has(issue.code)
      ? { ...issue, severity: "warning" as const }
      : issue,
  );
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

  if (typeId === "VOCAB_CHOICE") {
    const markedCount = Array.isArray(question.markedWords)
      ? question.markedWords.length
      : 0;
    if (
      markedCount >= VOCAB_CHOICE_MARKER_COUNT_MIN &&
      markedCount <= VOCAB_CHOICE_MARKER_COUNT_MAX
    ) {
      return markedCount;
    }
    return 5;
  }

  if (typeId === "CONTENT_MATCH") {
    const optionCount = Array.isArray(question.options) ? question.options.length : 0;
    if (optionCount >= 5 && optionCount <= 12) return optionCount;
    return 5;
  }

  if (typeId === "SENTENCE_INSERT") {
    const markerIndexCount = Array.isArray(question.markerAfterSentenceIndices)
      ? question.markerAfterSentenceIndices.length
      : 0;
    if (
      markerIndexCount >= SENTENCE_INSERT_SLOT_MIN &&
      markerIndexCount <= SENTENCE_INSERT_SLOT_MAX
    ) {
      return markerIndexCount;
    }
    return 5;
  }

  if (typeId === "ANTONYM") {
    const pairCount = Array.isArray(question.markedWords)
      ? question.markedWords.length
      : 0;
    if (pairCount >= ANTONYM_MARKER_COUNT_MIN && pairCount <= ANTONYM_MARKER_COUNT_MAX) {
      return pairCount;
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
  genericOptionCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (!options.length) return;

  // A teacher-requested option count (free-text option types) overrides the
  // per-type default; clamp defensively to the supported range.
  const expectedOptionCount =
    typeof genericOptionCount === "number" && Number.isFinite(genericOptionCount)
      ? Math.min(
          GENERIC_OPTION_COUNT_MAX,
          Math.max(GENERIC_OPTION_COUNT_MIN, Math.round(genericOptionCount)),
        )
      : getExpectedOptionCount(question, typeId);
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

  const alphaMatch = text.match(/^[\(\[]?\s*([a-jA-J])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toLowerCase();

  const numberMatch = text.match(/^[\(\[]?\s*(10|[1-9])\s*[\)\].:]?$/);
  if (numberMatch) return VOCAB_CHOICE_KEYS[Number(numberMatch[1]) - 1];

  return fallback;
}

function vocabChoiceAnswerLabelFromKey(key: string): string {
  const index = (VOCAB_CHOICE_KEYS as readonly string[]).indexOf(key);
  return index >= 0 ? String(index + 1) : key;
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
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[a-jA-J]|10|[1-9]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
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

  const alphaMatch = text.match(/^[\(\[]?\s*([A-Ja-j])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toUpperCase();

  const numberMatch = text.match(/^[\(\[]?\s*(10|[1-9])\s*[\)\].:]?$/);
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
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[A-Ja-j]|10|[1-9]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
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
    const rawValue = question[field];
    if (typeof rawValue !== "string") continue;

    // Blank runs (___, _____) are blank placeholders, not underline markers.
    // With two or more blanks in one passage, the trailing/leading double
    // underscores would otherwise pair up as a fake __marker__ span.
    const value = rawValue.replace(/_{3,}/g, (run) => " ".repeat(run.length));

    for (const marker of findMarkers(value)) {
      if (!hasMarkerTokenBoundaries(value, marker.start, marker.end)) {
        add("error", "mid-word-marker", `${field} contains a marker inside a word: ${marker.inner}`);
      }
    }
  }
}

/** 네모 어법 — 렌더된 "(A) [x / y]" 네모 카운트용. */
const COMBO_SLOT_RENDER_REGEX = /\([A-C]\)\s*\[[^\[\]]*\/[^\[\]]*\]/g;
const COMBO_HARD_POINT_CODES = new Set(["b", "c", "i"]);
// that/what 슬롯의 패턴 누설 검출용 — 명사절 that 보문을 취하는 인지·단언 동사.
// 관계절·지시사 that 위양성을 막기 위해 동사를 화이트리스트로 한정한다.
const COGNITION_VERB_THAT_REGEX =
  /\b(?:know|knows|knew|known|think|thinks|thought|believe|believes|believed|assume|assumes|assumed|realize|realizes|realized|suggest|suggests|suggested|show|shows|showed|shown|find|finds|found|argue|argues|argued|claim|claims|claimed|say|says|said|hope|hopes|hoped|feel|feels|felt|notice|notices|noticed|understand|understands|understood|mean|means|meant|prove|proves|proved|conclude|concludes|concluded|recognize|recognizes|recognized)\s+that\b/i;

/**
 * 네모 어법 검증 — 모델 메타데이터(slots/options)와 렌더된 지문을 각각 세고
 * 상호 대조한다. 세 슬롯 전부가 정답 키를 구성하므로 슬롯/조합 결함은 error
 * (RELAXED 차단 대상), 오답 믹스·포인트 구성은 warning (strict 압력).
 */
function validateGrammarChoiceComboQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const slots = Array.isArray(question.slots)
    ? question.slots.filter(isRecord)
    : [];
  if (slots.length !== 3) {
    add("error", "combo-slot-count", `Expected exactly 3 combo slots, got ${slots.length}.`);
  }

  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  if (passageWithMarkers) {
    const rendered = passageWithMarkers.match(COMBO_SLOT_RENDER_REGEX) ?? [];
    if (rendered.length !== 3) {
      add("error", "combo-render-slot-count", `Expected 3 rendered combo slots "(A) [x / y]", got ${rendered.length}.`);
    }
  }

  const slotCandidates: Array<{ correct: string; wrong: string; label: string }> = [];
  for (const [slotIndex, slot] of slots.entries()) {
    const correct = normalizeText(slot.correctExpression);
    const wrong = normalizeText(slot.wrongExpression);
    if (!correct || !wrong) {
      add("error", "combo-slot-missing-candidate", `Combo slot ${slotIndex + 1} is missing correctExpression/wrongExpression.`);
      continue;
    }
    slotCandidates.push({
      correct,
      wrong,
      label: normalizeText(slot.label) || `slot ${slotIndex + 1}`,
    });
    if (normalizeComparableText(correct) === normalizeComparableText(wrong)) {
      add("error", "combo-slot-not-mutated", `Combo slot ${slotIndex + 1} candidates are identical: "${correct}".`);
    }
    // 원문 실재 검사 — 지문에 오류가 인쇄된 추출/재현 흐름은 passage 를 넘기지
    // 않으므로 가드 필수 (grammar-error-not-mutated 와 동일 관례).
    if (passage && !containsLoose(passage, correct)) {
      add("error", "combo-correct-not-in-source", `Combo slot correctExpression not found in the passage: "${correct.slice(0, 60)}".`);
    }
  }

  // 정답 후보 누설 — 네모 밖 지문에 후보와 동일한 내용어 표현이 무마킹으로
  // 남아 있으면 학생이 평행구를 베껴 푼다 (실측: 'composed of' 평행구 5/8).
  // wrong 후보의 잔존도 같은 코드로 잡는다 — 오답형이 지문 다른 곳에서 합법
  // 표현으로 등장하면 "둘 다 가능" 시비의 신호다.
  // 기능어 후보(that/be 등)는 단독 잔존이 불가피해 면제하되, 직전 단어까지
  // 같은 연어("know that"·"assume that")가 잔존하면 실질 누설로 잡는다
  // (실측 라운드2: 기능어 연어 평행 3/8).
  if (passageWithMarkers) {
    const outsideSlots = passageWithMarkers.replace(COMBO_SLOT_RENDER_REGEX, " ");
    const isLeakTarget = (expr: string) =>
      expr.length >= 4 &&
      !isTinyFunctionWord(expr) &&
      !/^(that|what|which|this|these|those|than|then|when|where|while|there|their|they|them|have|has|had|will|would|could|should|must|does|did|not|with|from|into|been|being)$/i.test(expr);
    const appearsOutside = (expr: string) =>
      isSingleEnglishToken(expr)
        ? containsStandaloneToken(outsideSlots, expr)
        : containsLoose(outsideSlots, expr);
    const precedingWordByLabel = new Map<string, string>();
    for (const match of passageWithMarkers.matchAll(/([A-Za-z][A-Za-z'-]*)\s*\(([A-C])\)\s*\[/g)) {
      precedingWordByLabel.set(`(${match[2]})`, match[1]);
    }
    for (const candidate of slotCandidates) {
      if (isLeakTarget(candidate.correct) && appearsOutside(candidate.correct)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} correct candidate "${candidate.correct}" also appears unmarked elsewhere in the passage (answer leak).`);
        continue;
      }
      if (isLeakTarget(candidate.wrong) && appearsOutside(candidate.wrong)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} wrong candidate "${candidate.wrong}" appears as legitimate text elsewhere in the passage (dispute risk).`);
        continue;
      }
      const preceding = precedingWordByLabel.get(candidate.label);
      if (preceding && appearsOutside(`${preceding} ${candidate.correct}`)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} collocation "${preceding} ${candidate.correct}" also appears unmarked elsewhere in the passage (answer leak).`);
        continue;
      }
      // that/what 슬롯 전용 패턴 누설: 슬롯 동사와 누설 동사가 달라도(know vs
      // assume) "인지·단언 동사 + that + 완전절" 패턴이 네모 밖에 남아 있으면
      // 학생이 그 패턴을 (A)에 전이한다 (실측 R3: 'assume that' 평행 2/8).
      // 인지동사 화이트리스트로 한정해 관계절·지시사 that 위양성을 배제한다.
      const pair = new Set([
        candidate.correct.toLowerCase(),
        candidate.wrong.toLowerCase(),
      ]);
      if (pair.has("that") && pair.has("what") && COGNITION_VERB_THAT_REGEX.test(outsideSlots)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} (that/what) is modeled by an unmarked "동사 + that + clause" elsewhere in the passage (pattern leak).`);
      }
    }
  }

  const pointCodes = slots
    .map((slot) => normalizeText(slot.pointCode).toLowerCase())
    .filter(Boolean);
  if (pointCodes.length === slots.length && new Set(pointCodes).size < pointCodes.length) {
    add("warning", "combo-duplicate-point-code", `Combo slots repeat a pointCode: ${pointCodes.join(", ")}.`);
  }

  // 조합 선지 검증 — slotValues 가 각 슬롯의 두 후보 중 하나인지, 전부-옳은
  // 조합이 유일하고 correctAnswer 와 일치하는지.
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord)
    : [];
  if (slotCandidates.length !== 3 || options.length !== 5) return;

  const comboKeys: string[] = [];
  const wrongnessCounts: number[] = [];
  const wrongCandidateUsed = [false, false, false];
  let valuesValid = true;
  for (const [optionIndex, option] of options.entries()) {
    const values = Array.isArray(option.slotValues)
      ? option.slotValues.map((value) => normalizeText(value))
      : [];
    if (values.length !== 3 || values.some((value) => !value)) {
      add("error", "combo-option-value-mismatch", `Combo option ${optionIndex + 1} must provide 3 slotValues.`);
      valuesValid = false;
      continue;
    }
    let wrongness = 0;
    for (const [slotIndex, value] of values.entries()) {
      const candidate = slotCandidates[slotIndex];
      const comparable = normalizeComparableText(value);
      if (comparable === normalizeComparableText(candidate.wrong)) {
        wrongness += 1;
        wrongCandidateUsed[slotIndex] = true;
      } else if (comparable !== normalizeComparableText(candidate.correct)) {
        add("error", "combo-option-value-mismatch", `Combo option ${optionIndex + 1} value "${value}" matches neither candidate of slot ${slotIndex + 1}.`);
        valuesValid = false;
      }
    }
    comboKeys.push(values.map((value) => normalizeComparableText(value)).join("|"));
    wrongnessCounts.push(wrongness);
  }
  if (!valuesValid) return;

  const duplicateCombo = findDuplicate(comboKeys);
  if (duplicateCombo) {
    add("error", "combo-duplicate-option", "Combo options repeat the same slotValues combination.");
  }

  const allCorrectIndices = wrongnessCounts
    .map((wrongness, index) => ({ wrongness, index }))
    .filter((entry) => entry.wrongness === 0)
    .map((entry) => entry.index);
  const correctLabel = normalizeLabel(question.correctAnswer);
  if (allCorrectIndices.length !== 1) {
    add("error", "combo-answer-combo-mismatch", `Expected exactly 1 all-correct combo option, got ${allCorrectIndices.length}.`);
  } else {
    const answerOptionLabel = normalizeLabel(options[allCorrectIndices[0]].label);
    if (answerOptionLabel !== correctLabel) {
      add("error", "combo-answer-combo-mismatch", `correctAnswer "${normalizeText(question.correctAnswer)}" does not point at the all-correct combination.`);
    }
  }

  if (!wrongCandidateUsed.every(Boolean)) {
    add("warning", "combo-wrong-candidate-unused", "Some slot's wrongExpression never appears in any wrong option.");
  }
  if (!wrongnessCounts.some((wrongness) => wrongness === 1)) {
    add("warning", "combo-missing-single-slot-trap", "No option is wrong in exactly one slot; include at least one near-miss option.");
  }

  if (requestedDifficulty === "KILLER") {
    const multiSlotTraps = wrongnessCounts.filter((wrongness) => wrongness >= 2).length;
    if (multiSlotTraps < 2) {
      add("warning", "combo-killer-trap-mix", `KILLER combo should include at least 2 options wrong in two or more slots, got ${multiSlotTraps}.`);
    }
    const hardPoints = pointCodes.filter((code) => COMBO_HARD_POINT_CODES.has(code)).length;
    if (pointCodes.length === 3 && hardPoints < 2) {
      add("warning", "combo-killer-point-mix", `KILLER combo should test hard points (b/c/i) on at least 2 slots, got ${hardPoints}.`);
    }
  }
}

function validateTypeSpecific(
  question: Record<string, unknown>,
  typeId: string,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  irrelevantSlotCount: number | undefined,
  grammarMarkerCount: number | undefined,
  grammarAnswerCount: number | undefined,
  grammarCorrectionErrorCount: number | undefined,
  stemLanguage: VisibleQuestionLanguage | undefined,
  optionLanguage: VisibleQuestionLanguage | undefined,
  vocabChoiceMarkerCount: number | undefined,
  vocabChoiceAnswerCount: number | undefined,
  sentenceInsertSlotCount: number | undefined,
  antonymPairCount: number | undefined,
  blankInferenceBlankCount: number | undefined,
  blankInferenceParaphraseAnswer: boolean | undefined,
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
    const multiBlanks = Array.isArray(question.blanks)
      ? question.blanks.filter(isRecord)
      : [];
    if ((blankInferenceBlankCount ?? 1) >= 2 || multiBlanks.length >= 2) {
      // Multi-blank combination variant; the single-blank validator (and its
      // distractor/double-negative machinery) is single-blank-only.
      validateMultiBlankInferenceQuestion(
        question,
        passage,
        blankInferenceBlankCount,
        blankInferenceParaphraseAnswer,
        add,
      );
    } else {
      validateBlankInferenceQuestion(
        question,
        passage,
        requestedDifficulty,
        blankInferenceParaphraseAnswer,
        add,
      );
    }
  }

  if (typeId === "IMPLIED_MEANING") {
    validateImpliedMeaningQuestion(
      question,
      passage,
      requestedDifficulty,
      optionLanguage,
      add,
    );
  }

  if (typeId === "TOPIC" || typeId === "MAIN_IDEA" || typeId === "TOPIC_MAIN_IDEA") {
    validateTopicMainIdeaQuestion(question, typeId, stemLanguage, optionLanguage, add);
  }

  if (typeId === "SUMMARY_COMPLETE_MC") {
    validateSummaryCompleteMcQuestion(question, requestedDifficulty, add);
  }

  if (typeId === "IRRELEVANT") {
    validateIrrelevantQuestion(
      question,
      passage,
      requestedDifficulty,
      irrelevantSlotCount,
      add,
    );
  }

  if (typeId === "SENTENCE_INSERT") {
    validateSentenceInsertQuestion(question, passage, sentenceInsertSlotCount, add);
  }

  if (typeId === "SENTENCE_ORDER") {
    validateSentenceOrderQuestion(question, add);
  }

  if (typeId === "VOCAB_CHOICE") {
    validateVocabChoiceQuestion(
      question,
      passage,
      vocabChoiceMarkerCount,
      vocabChoiceAnswerCount,
      add,
    );
  }

  if (typeId === "ANTONYM") {
    validateAntonymQuestion(question, passage, antonymPairCount, add);
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

  if (typeId === "GRAMMAR_CHOICE_COMBO") {
    validateGrammarChoiceComboQuestion(question, passage, requestedDifficulty, add);
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
    const markedPointCodes = markedExpressions
      .map((markedExpression) => extractGrammarPointCode(markedExpression.pointCode))
      .filter((code): code is GrammarPointCode => !!code);
    if (
      expectedMarkedCount >= 5 &&
      markedPointCodes.length >= 4 &&
      new Set(markedPointCodes).size < 3
    ) {
      add(
        "error",
        "grammar-decoy-point-diversity",
        "GRAMMAR_ERROR should distribute marked expressions across at least three real grammar point codes; repeated pointCode decoys make the item feel padded.",
      );
    }
    // 단조 방지: distinct 코드가 3개여도 한 코드가 3회 이상 쓰이면(예: 관계사 b
    // 4개 — 프리미엄 실측) 한 가지 문법만 반복 검사하는 꼴이라 변별력이 떨어진다.
    // 코드당 최대 2회. strict 전용(RELAXED 미포함)이라 완전 실패는 유발하지 않는다.
    if (markedPointCodes.length >= 5) {
      const codeCounts = new Map<GrammarPointCode, number>();
      for (const code of markedPointCodes) {
        codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
      }
      const worst = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (worst && worst[1] >= 3) {
        add(
          "error",
          "grammar-decoy-point-monotony",
          `pointCode (${worst[0]}) is used ${worst[1]} times across the marks — decoys are monotonous (one grammar point repeated). Use at most 2 marks per code and spread across more grammar points.`,
        );
      }
    }
    // 규범 논쟁 자리 검출: "복수 등위 주어 + 동격 each + 단수동사"(예: A and B
    // each assumes)는 표준 규범과 실사용이 갈리는 자리 — 여기 밑줄(정답·디코이
    // 불문)을 그으면 복수정답 시비가 생긴다 (실측 critical, 프롬프트 소프트
    // 금지로는 불충분). surroundingText 는 모델이 잘라먹거나 조작해 우회할 수
    // 있으므로(attempt 2 우회 실측) 렌더링된 passageWithMarkers 에서 실제 밑줄
    // 위치 기준으로 판정한다. 좁은 패턴만 정확 타격해 과잉 reject 를 피한다.
    if (passageWithMarkers) {
      // 주의: 마커의 밑줄(_)도 \w 라서 "assumes__" 에는 \b 가 성립하지 않는다 —
      // 동사 끝 경계는 (?=\s|_) 룩어헤드로 판정한다.
      const disputedMarkerPatterns = [
        // "and/or ... each __(X) <동사>s__" — each 바로 뒤 단수동사가 밑줄
        /\b(?:and|or)\b[^.;]{0,80}?\beach\s+__\([A-Ja-j]\)\s*[A-Za-z]+s(?=\s|_)[^_]*__/i,
        // 밑줄 안에 "each + 단수동사"가 통째로 포함
        /\b(?:and|or)\b[^.;]{0,80}?__\([A-Ja-j]\)[^_]*\beach\s+[A-Za-z]+s(?=\s|_)[^_]*__/i,
      ];
      if (disputedMarkerPatterns.some((pattern) => pattern.test(passageWithMarkers))) {
        add(
          "error",
          "grammar-disputed-usage-target",
          'A marker underlines a usage-disputed spot ("compound subject + each + singular verb"). Standard and actual usage diverge here — do not underline it as answer or decoy; test a different location.',
        );
      }
    }
    // 마커 인접 토큰 중복 검출: 모델 errorExpression이 앞/뒤 문맥 단어를 포함해
    // "which is __(F) is costed__"(앞 'is' 중복) 같은 깨진 텍스트가 렌더된다 —
    // 후처리는 위치만 맞추고 토큰 중복은 못 막는다(실측 critical). +RELAXED.
    if (passageWithMarkers) {
      const dup = findGrammarMarkerAdjacentDuplicate(passageWithMarkers);
      if (dup) {
        add(
          "error",
          "grammar-marker-adjacent-duplicate",
          `A grammar marker repeats an adjacent word ("${dup}"), producing broken text; the underlined span likely swallowed a neighboring word.`,
        );
      }
    }
    // surroundingText 무효 검출: 정상 마커의 surroundingText는 그 마커 단어를
    // 반드시 포함한다. isError 마커의 surroundingText에 expression/errorExpression/
    // correction 토큰이 하나도 없으면 모델이 다른 문장을 가리킨 것 — 전역 폴백
    // 오배치와 해설-오류 불일치의 근원이다(실측: surround가 'maintenance...costly'를
    // 가리키나 마커는 'realizes that→those'에 박혀 해설이 엉뚱한 오류를 설명). +RELAXED.
    {
      const badSurround = findGrammarSurroundingMissingMarker(markedExpressions);
      if (badSurround) {
        add(
          "error",
          "grammar-surrounding-missing-marker",
          `Marker ${badSurround}'s surroundingText does not contain its own expression — the position cue points at a different sentence, risking misplacement and a mismatched explanation.`,
        );
      }
    }
    // 마커 오배치 검출: 모델 surroundingText가 오류 버전이라 윈도우 탐색이 실패하면
    // 후처리가 전역 폴백으로 엉뚱한 동형 단어에 마커를 박는다(예: 의도 'which is
    // costly' → 실제 'she is'에 → "she are"). 렌더 위치 주변이 surroundingText와
    // 전혀 겹치지 않으면 거부한다(실측: 해설과 밑줄이 다른 문장). +RELAXED.
    if (passageWithMarkers) {
      const misplaced = findGrammarMisplacedMarker(passageWithMarkers, markedExpressions);
      if (misplaced) {
        add(
          "error",
          "grammar-marker-context-mismatch",
          `Marker ${misplaced} is rendered in a context that does not match its surroundingText — it is likely placed on a wrong same-form word.`,
        );
      }
    }
    // 생성 플로우 전용 '오류 미도입' 검출: 마커를 벗긴 지문이 원문과 동일하면
    // 모든 isError 자리가 원문 그대로라는 뜻 — 원문을 오류로 판정했거나 치환이
    // 빗나간 문항(정답 무효/복수정답 실측 critical). 지문에 오류가 인쇄된
    // 추출/원본 재현 흐름은 이 게이트를 타지 않으므로 영향 없다.
    if (passage && passageWithMarkers && errorLabels.length > 0) {
      const stripped = passageWithMarkers.replace(
        /__\([A-Ja-j]\)\s*([^_]+)__/g,
        "$1",
      );
      if (normalizeText(stripped) === normalizeText(passage)) {
        add(
          "error",
          "grammar-error-not-mutated",
          "Stripping the markers reproduces the original passage unchanged — no grammar error was introduced; the answer flags unmutated source text.",
        );
      }
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
      if (expression && errorExpression && isGrammarPosChangeMutation(expression, errorExpression)) {
        add(
          "error",
          "grammar-error-pos-change",
          `The grammar error mutates a word across part of speech (adjective/verb → noun: "${expression}" → "${errorExpression}"). Keep the same part of speech and mutate form only (e.g. adjective↔adverb, verb agreement, finite↔nonfinite).`,
        );
      }
      // 시제 단독변경(현재 3인칭↔과거, 같은 어간)은 기출 검증 변형이 아니며
      // 문맥상 두 시제가 모두 가능해 정답 시비가 된다 (실측: outpaces→outpaced).
      // 수일치(is/are·has/have)는 별도로 제외 — 그건 합법 변형(d).
      if (expression && errorExpression && isTenseOnlyMutation(expression, errorExpression)) {
        add(
          "error",
          "grammar-tense-only-error",
          `The grammar error is a tense-only change ("${expression}" ↔ "${errorExpression}"), which is contextually disputable; use a proven mutation type instead.`,
        );
      }
      if (correction && expression && correction !== expression) {
        add("warning", "grammar-correction-differs-from-source", "The correction differs from the original expression; verify the model did not rewrite acceptable source text.");
      }
      if (/\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/.test(combined)) {
        add("error", "grammar-debatable-infinitive", "Do not use active/passive infinitive preference as the grammar-error target.");
      }
      if (requestedDifficulty === "KILLER" && isThinKillerGrammarErrorTarget(markedExpression)) {
        add(
          "error",
          "grammar-killer-thin-answer",
          "KILLER GRAMMAR_ERROR answer looks like a local one-token change without a long-distance clause, modifier, relation, or parallel-structure check.",
        );
      }
    }
    // 밑줄 span 길이 + pointCode 진실성 — 모든 밑줄(정답·디코이) 검사.
    // 화면 밑줄 표면 = 오류는 errorExpression, 디코이는 expression
    // (getMarkedSurfaceExpression 와 동일). 절/문장 통째 밑줄(프리미엄 실측 결함)을
    // egregious(relaxed에서도 차단) / wide(strict 전용) 2단으로 막는다.
    for (const markedExpression of markedExpressions) {
      const surface = normalizeText(
        markedExpression.isError === true
          ? normalizeText(markedExpression.errorExpression) ||
              normalizeText(markedExpression.expression)
          : markedExpression.expression,
      );
      if (!surface) continue;
      const markerLabel = normalizeText(markedExpression.label) || "(?)";
      const surfaceWords = countWordsForQuality(surface);
      const surfaceChars = surface.length;
      if (
        surfaceWords > GRAMMAR_UNDERLINE_HARD_MAX_WORDS ||
        surfaceChars > GRAMMAR_UNDERLINE_HARD_MAX_CHARS
      ) {
        add(
          "error",
          "grammar-underline-too-long",
          `Underline ${markerLabel} spans ${surfaceWords} words / ${surfaceChars} chars ("${surface.slice(0, 60)}") — a full clause or sentence was underlined. Underline only the minimal grammatical unit (usually 1-4 words).`,
        );
      } else if (
        surfaceWords > GRAMMAR_UNDERLINE_SOFT_MAX_WORDS ||
        surfaceChars > GRAMMAR_UNDERLINE_SOFT_MAX_CHARS
      ) {
        add(
          "error",
          "grammar-underline-wide",
          `Underline ${markerLabel} is too wide (${surfaceWords} words / ${surfaceChars} chars: "${surface.slice(0, 60)}"). Tighten it to the core grammar token (usually 1-4 words, max 5).`,
        );
      }
      const surfacePointCode = extractGrammarPointCode(markedExpression.pointCode);
      if (surfacePointCode && grammarPointCodeSurfaceMismatch(surfacePointCode, surface)) {
        add(
          "warning",
          "grammar-pointcode-span-mismatch",
          `Underline ${markerLabel} is tagged pointCode (${surfacePointCode}) but its surface "${surface.slice(0, 50)}" has no token matching that grammar point — the label looks fabricated. Move the underline onto the real ${surfacePointCode}-token or fix the code.`,
        );
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
    // 메타 누출: 해설이 출제 과정/생성 지침을 학생에게 노출(실측 u6:
    // "지시문 가이드라인의 1순위 포인트인 ...를 활용하여 ... 함정으로 X를 Y로
    // 잘못 변형하였습니다"). 학생 해설은 왜 그 형태가 어법상 틀린지만 설명해야 함.
    if (grammarExplanationLeaksMeta(grammarExplanationText)) {
      // error 로 승격(2026-06-15): warning 은 strict 재시도를 안 시켜 그대로 출하됨.
      // focus/최소대립쌍이 준 내부 framing(1순위·출제 포인트·변형 방향)을 모델이
      // 해설에 베끼는 누출이 잦아(R2 3/10), strict 재시도로 강제 회피한다.
      // RELAXED 미등록 — 끈질기면 relaxed 폴백이 출하(0수율 방지).
      add(
        "error",
        "grammar-explanation-meta-leak",
        "Grammar explanation narrates the generation process or instruction (지시문/가이드라인/출제 포인트/1순위/함정으로/X를 Y로 변형) instead of explaining the grammar from the student's view.",
      );
    }
    // CoT 덤프 백스톱: 정상 어법 해설은 300~500자. 900자 초과는 사고과정
    // 덤프(정답 번복·무관 내용 나열) 의심 (실측 focus u7: 1012자 자기모순).
    if (normalizeText(question.explanation).length > 900) {
      add(
        "warning",
        "grammar-explanation-too-long",
        "Grammar explanation is excessively long (>900 chars), suggesting a chain-of-thought dump rather than a concise student-facing rationale.",
      );
    }
  }

  if (typeId === "GRAMMAR_CORRECTION") {
    validateGrammarCorrectionQuestion(
      question,
      passage,
      grammarCorrectionErrorCount,
      requestedDifficulty,
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
  requestedPairCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markedWords = Array.isArray(question.markedWords)
    ? question.markedWords.filter(isRecord)
    : [];
  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  const expectedPairCount =
    requestedPairCount ??
    (markedWords.length >= ANTONYM_MARKER_COUNT_MIN &&
    markedWords.length <= ANTONYM_MARKER_COUNT_MAX
      ? markedWords.length
      : ANTONYM_MARKER_COUNT_DEFAULT);

  if (markedWords.length !== expectedPairCount) {
    add(
      "error",
      "antonym-marker-count",
      `ANTONYM must have exactly ${expectedPairCount} marked words, got ${markedWords.length}.`,
    );
  }

  if (!passageWithMarkers) {
    add("error", "antonym-missing-passage-markers", "ANTONYM is missing passageWithMarkers.");
    return;
  }

  const renderedMarkers = findMarkers(passageWithMarkers)
    .map((marker) => {
      const match = marker.inner.match(/^\(([A-Ja-j])\)\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1].toUpperCase(),
        word: normalizeText(match[2]),
      };
    })
    .filter((marker): marker is { key: string; word: string } => !!marker);
  const renderedByKey = new Map(renderedMarkers.map((marker) => [marker.key, marker.word]));

  if (countUnderlineMarkers(passageWithMarkers) !== expectedPairCount) {
    add(
      "error",
      "antonym-render-marker-count",
      `ANTONYM passageWithMarkers must render exactly ${expectedPairCount} underlined markers.`,
    );
  }

  if (renderedMarkers.length !== expectedPairCount) {
    add(
      "error",
      "antonym-render-label-format",
      `ANTONYM rendered markers must use __(A) word__ through __(${ANTONYM_KEYS[expectedPairCount - 1]}) word__ format.`,
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
    const numericIndex = /^(10|[1-9])$/.test(normalized)
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
  requestedMarkerCount: number | undefined,
  requestedAnswerCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markedWords = Array.isArray(question.markedWords)
    ? question.markedWords.filter(isRecord)
    : [];
  const passageWithMarkers = normalizeText(question.passageWithMarkers);

  // 동의어 변형 모드: 정답이 아닌 단어도 의도적으로 원문과 다른 동의어로 표시되므로
  // "정답 외 단어는 원문 그대로" 검사를 완화한다(위치 앵커 originalWord만 본문에 존재 요구).
  const vocabVariantMode =
    normalizeText(question.vocabDisplayMode).toUpperCase() === "SYNONYM_VARIANT";

  // Expected counts: teacher-requested when provided, otherwise infer a valid
  // 5~10 count from the question itself (legacy default 5).
  const expectedMarkerCount =
    requestedMarkerCount ??
    (markedWords.length >= VOCAB_CHOICE_MARKER_COUNT_MIN &&
    markedWords.length <= VOCAB_CHOICE_MARKER_COUNT_MAX
      ? markedWords.length
      : VOCAB_CHOICE_MARKER_COUNT_DEFAULT);
  const expectedAnswerCount = requestedAnswerCount ?? 1;

  if (markedWords.length !== expectedMarkerCount) {
    add(
      "error",
      "vocab-marker-count",
      `VOCAB_CHOICE must have exactly ${expectedMarkerCount} marked words, got ${markedWords.length}.`,
    );
  }

  if (!passageWithMarkers) {
    add("error", "vocab-missing-passage-markers", "VOCAB_CHOICE is missing passageWithMarkers.");
    return;
  }

  const renderedMarkers = findMarkers(passageWithMarkers)
    .map((marker) => {
      const match = marker.inner.match(/^\(([a-jA-J])\)\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1].toLowerCase(),
        word: normalizeText(match[2]),
      };
    })
    .filter((marker): marker is { key: string; word: string } => !!marker);
  const renderedByKey = new Map(renderedMarkers.map((marker) => [marker.key, marker.word]));

  if (countUnderlineMarkers(passageWithMarkers) !== expectedMarkerCount) {
    add(
      "error",
      "vocab-render-marker-count",
      `VOCAB_CHOICE passageWithMarkers must render exactly ${expectedMarkerCount} underlined markers.`,
    );
  }

  if (renderedMarkers.length !== expectedMarkerCount) {
    add(
      "error",
      "vocab-render-label-format",
      `VOCAB_CHOICE rendered markers must use __(a) word__ through __(${VOCAB_CHOICE_KEYS[expectedMarkerCount - 1]}) word__ format.`,
    );
  }

  const labels = markedWords.map((word, index) => normalizeVocabChoiceKey(word.label, index));
  const duplicateLabel = findDuplicate(labels.filter(Boolean));
  if (duplicateLabel) {
    add("error", "vocab-duplicate-label", `Duplicate VOCAB_CHOICE marked label: (${duplicateLabel}).`);
  }

  const inappropriateWords = markedWords.filter((word) => word.isInappropriate === true);
  if (inappropriateWords.length !== expectedAnswerCount) {
    add(
      "error",
      "vocab-inappropriate-count",
      `VOCAB_CHOICE must have exactly ${expectedAnswerCount} isInappropriate=true item(s), got ${inappropriateWords.length}.`,
    );
  }

  const answerKeys = collectVocabChoiceAnswerKeys(question);
  if (answerKeys.length !== expectedAnswerCount) {
    add(
      "error",
      "vocab-answer-count",
      `VOCAB_CHOICE correctAnswer must point to exactly ${expectedAnswerCount} label(s), got ${answerKeys.length}.`,
    );
  }

  const inappropriateKeys = inappropriateWords
    .map((word) => normalizeVocabChoiceKey(word.label))
    .filter(Boolean);
  const answerSetMatches =
    inappropriateKeys.length === answerKeys.length &&
    inappropriateKeys.every((key) => answerKeys.includes(key));
  if (inappropriateKeys.length > 0 && answerKeys.length > 0 && !answerSetMatches) {
    add(
      "error",
      "vocab-answer-label-mismatch",
      `VOCAB_CHOICE correctAnswer must match the inappropriate label set (${inappropriateKeys
        .map(vocabChoiceAnswerLabelFromKey)
        .join(", ")}).`,
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
      // (g) 원단어 잔존 누설: 치환 전 단어가 본문 마커 밖에 또 보이면 즉답 가능.
      if (sourceCorrectWord && sourceWordVisibleOutsideMarkers(passageWithMarkers, sourceCorrectWord)) {
        add(
          "error",
          "vocab-source-word-visible",
          `VOCAB_CHOICE answer (${key}) source word "${sourceCorrectWord}" still appears elsewhere in the passage, revealing the answer.`,
        );
      }
    } else if (vocabVariantMode) {
      // 변형 모드: 표시 단어는 의도된 동의어(비-verbatim)이므로 원문 일치/본문 존재
      // 검사를 건너뛰고, 위치 앵커인 originalWord만 본문에 존재하면 된다.
      if (betterWord) {
        add("error", "vocab-nonanswer-has-better-word", `VOCAB_CHOICE non-answer (${key}) must not have betterWord.`);
      }
      if (passage && originalWord && !containsLoose(passage, originalWord)) {
        add(
          "error",
          "vocab-nonanswer-source-anchor-missing",
          `VOCAB_CHOICE non-answer (${key}) source word "${originalWord}" must exist in the original passage.`,
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

  if (vocabVariantMode) {
    // 누설 가드: 정답의 정답 단어(source-correct)가 다른 밑줄칸의 "표시 단어"(동의어)로
    // 우연히 노출되면 학생이 정답을 역추론할 수 있다. 기존 vocab-source-word-visible은
    // 마커 밖 본문만 검사하므로, 변형 모드에서 새로 생긴 이 벡터를 여기서 막는다.
    const answerSourceWords = markedWords
      .filter((markedWord) => markedWord.isInappropriate === true)
      .map(
        (markedWord) =>
          normalizeText(markedWord.betterWord) ||
          normalizeText(markedWord.originalWord),
      )
      .filter(Boolean);
    markedWords.forEach((markedWord, index) => {
      if (markedWord.isInappropriate === true) return;
      const shown =
        normalizeText(markedWord.word) ||
        normalizeText(markedWord.substituteWord) ||
        normalizeText(markedWord.originalWord);
      if (
        shown &&
        answerSourceWords.some(
          (answerWord) =>
            normalizeComparableText(answerWord) ===
            normalizeComparableText(shown),
        )
      ) {
        add(
          "error",
          "vocab-variant-answer-word-exposed",
          `VOCAB_CHOICE 변형 모드: 밑줄 (${normalizeVocabChoiceKey(markedWord.label, index)})의 표시 단어가 정답의 정답 단어와 같아 정답이 노출됩니다.`,
        );
      }
    });

    // 정답 외 단어가 하나도 동의어로 바뀌지 않았으면 암기 무력화 효과가 없으므로 경고한다
    // (생성 차단은 아님 — 일부 단어는 좋은 동의어가 없을 수 있음).
    const anyDisguised = markedWords.some((markedWord) => {
      if (markedWord.isInappropriate === true) return false;
      const original = normalizeText(markedWord.originalWord);
      const shown =
        normalizeText(markedWord.word) ||
        normalizeText(markedWord.substituteWord) ||
        original;
      return (
        original &&
        shown &&
        normalizeComparableText(original) !== normalizeComparableText(shown)
      );
    });
    if (!anyDisguised) {
      add(
        "warning",
        "vocab-variant-not-applied",
        "VOCAB_CHOICE 동의어 변형 모드인데 정답 외 단어가 모두 원문 그대로입니다. 암기 무력화 효과가 없습니다.",
      );
    }
  }

  // (f) 해설 메타 누출: 출제 변형 과정을 학생용 해설에 노출하지 않는다.
  if (explanationLeaksMutationProcess(normalizeText(question.explanation))) {
    add(
      "warning",
      "vocab-explanation-meta-leak",
      "VOCAB_CHOICE explanation should not narrate the mutation process (e.g. \"changed X to Y\"); explain why the word is contextually wrong instead.",
    );
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
  // Slot count is configurable (5~8); count up to the supported maximum.
  const circled = getCircledNumbers(SENTENCE_INSERT_SLOT_MAX);
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
  requestedSlotCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  // 1) 마커 인덱스: 요청 개수(기본 5) · 오름차순
  const indices = Array.isArray(question.markerAfterSentenceIndices)
    ? question.markerAfterSentenceIndices.filter((n): n is number => typeof n === "number")
    : [];
  const expectedSlotCount =
    requestedSlotCount ??
    (indices.length >= SENTENCE_INSERT_SLOT_MIN && indices.length <= SENTENCE_INSERT_SLOT_MAX
      ? indices.length
      : 5);
  if (indices.length !== expectedSlotCount) {
    add(
      "warning",
      "sentence-insert-marker-count",
      `Expected ${expectedSlotCount} marker indices for SENTENCE_INSERT, got ${indices.length}.`,
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
    if (markerCount !== expectedSlotCount) {
      add(
        "error",
        "sentence-insert-gap-marker-count",
        `SENTENCE_INSERT passageWithMarkers must contain exactly ${expectedSlotCount} gap markers, got ${markerCount}.`,
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
  if (answer === "1" || answer === String(expectedSlotCount)) {
    add(
      "warning",
      "sentence-insert-edge-answer",
      `Correct gap is at an edge (${answer}); 가운데 위치가 변별력에 유리합니다.`,
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
  requestedDifficulty: string | undefined,
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
    if (
      requestedDifficulty === "KILLER" &&
      isThinKillerGrammarCorrectionTarget({
        sourceText,
        displayedText,
        displayedError,
        sourceCorrection,
      })
    ) {
      add(
        "error",
        "grammar-correction-killer-thin-segment",
        `KILLER GRAMMAR_CORRECTION segment ${index + 1} hides a local short-form change without enough structural load; prefer a relation, participle, parallel, long subject-verb, or complement pattern.`,
      );
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
  blankInferenceParaphraseAnswer: boolean | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const isNegativeParaphraseMode = question.blankAnswerMode === "DOUBLE_NEGATIVE";
  const isParaphraseMode = question.blankAnswerMode === "PARAPHRASE";
  // 변형 정답 모드(DN·패러프레이즈)는 빈칸 설계 결함(슬롯 문법)을 error 로 승격한다.
  const isTransformedMode = isNegativeParaphraseMode || isParaphraseMode;
  // jooyeon 변형 빈칸 토글 경로 — 정답 패러프레이즈 게이트(not-transformed 등)용.
  const isAnswerParaphraseMode =
    question.blankAnswerMode === "PARAPHRASE" ||
    (blankInferenceParaphraseAnswer === true && !isNegativeParaphraseMode);
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

  if (isAnswerParaphraseMode) {
    validateBlankAnswerParaphraseMode(
      question,
      options,
      originalExpression,
      blankCarrierText,
      correctText,
      correctLabel,
      passage,
      requestedDifficulty,
      add,
    );
  }

  if (crossesStrongContrastBoundary(originalExpression)) {
    add(
      isTransformedMode ? "error" : "warning",
      "blank-crosses-contrast",
      "BLANK_INFERENCE blank must not swallow a contrast marker; keep but/rather/instead structure visible.",
    );
  }

  if (requestedDifficulty === "KILLER" && countContentTokens(originalExpression) < 2) {
    add(
      isTransformedMode ? "error" : "warning",
      "blank-target-too-small",
      "KILLER BLANK_INFERENCE should target a meaningful phrase or relation, not a single obvious keyword.",
    );
  }

  if (
    requestedDifficulty === "KILLER" &&
    !isNegativeParaphraseMode &&
    !isAnswerParaphraseMode
  ) {
    const killerSourceIssue = findStandardBlankKillerIssue(originalExpression);
    if (killerSourceIssue) {
      add("error", killerSourceIssue.code, killerSourceIssue.message);
    }
  }

  if (isSingleAbstractNounTarget(originalExpression)) {
    add(
      isTransformedMode ? "error" : "warning",
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

  // 등위 명사열 중간절단 누설: 빈칸이 "_____, X, Y, and Z" 형태로 등위 나열의 첫
  // 항목 자리에 carve되면, 정답의 꼬리 단어가 뒤따르는 명사열을 문법적으로 헤드한다
  // → 학생이 의미 추론 없이 "명사로 끝나는 보기"를 문법만으로 고를 수 있다(실측
  // BLANK_INFERENCE 누설). 정답 무효급 → 차단(repair/재시도가 다른 자리를 고르게).
  if (
    /_____,\s+(?!(?:which|who|whom|whose|that|where|when|while|and|or|but|so|because|although|though|since|if|unless|as|to)\b)[A-Za-z][^.!?]{1,80}?,\s+(?:and|or)\s+[A-Za-z]/i.test(
      blankCarrierText,
    )
  ) {
    add(
      "error",
      "blank-mid-coordinated-list-carve",
      'The blank is carved at the head of a coordinated list ("_____, X, Y, and Z"); the answer tail completes the list grammatically and is selectable without comprehension. Blank a logical clause/predicate/relation instead.',
    );
  }

  if (/\b(?:such as|including|for example)\s+_____/.test(blankCarrierText)) {
    add(
      isTransformedMode ? "error" : "warning",
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
        // KILLER 는 간섭 오답이 핵심 변별 장치 — 무간섭이면 모드 무관 error.
        isTransformedMode || requestedDifficulty === "KILLER" ? "error" : "warning",
        "blank-weak-distractors",
        "BLANK_INFERENCE has no wrong options with passage-keyword, semantic, or polarity overlap.",
      );
    } else if (attractiveWrongCount < 2) {
      // KILLER 도 warning 유지 — 추상 패러프레이즈 오답은 본문 키워드 재활용이
      // 적어 검출기가 과소평가한다. error 승격 시 재시도 폭증 실측(iter2 52회).
      add(
        "warning",
        "blank-weak-distractors",
        "BLANK_INFERENCE should have more wrong options with passage-keyword, semantic, or polarity overlap.",
      );
    }
  }

  if (isParaphraseMode) {
    // 슬롯 문법 가드 (검수 실측 critical 2종):
    // ① 스팬이 주격 대명사로 시작하는 절인데 정답이 무주어 동사로 시작 →
    //    "As a result, is deprived of..." 비문.
    if (
      /^(?:she|he|it|they|we|i|you)\b/i.test(originalExpression) &&
      // be/조동사/-ing 시작만 — 복수 명사 주어("systems ...")를 오탐하지 않게
      // 일반 3단수 동사(-s)는 제외하고 프롬프트(2b)에 맡긴다.
      /^(?:is|are|was|were|has|have|had|[a-z]+ing)\b/.test(correctText)
    ) {
      add(
        "error",
        "blank-paraphrase-slot-missing-subject",
        "The blanked span starts with a subject pronoun, so the correct option must also contain a subject; a bare predicate produces a broken sentence.",
      );
    }
    // ② "to ___" 슬롯에 동명사 정답 → "is to sacrificing..." 비문.
    if (/\bto\s+_____/.test(blankCarrierText) && /^[a-z]+ing\b/.test(correctText)) {
      add(
        "error",
        "blank-paraphrase-slot-to-infinitive",
        "A to-infinitive blank needs the correct option to start with a base verb, not a gerund.",
      );
    }
    // ③ be 동사가 빈칸 밖에 남았는데 정답이 정동사로 시작 → "is turns out" 비문
    //    (스팬이 보어인데 패러프레이즈가 술부 전체를 재진술한 스팬 불일치).
    if (
      /\b(?:is|are|was|were)\s+_____/.test(blankCarrierText) &&
      /^(?:turns?|seems?|appears?|becomes?|proves?|remains?|looks?|sounds?|feels?|gets?|grows?|stays?|is|are|was|were|has|have|had)\b/.test(
        correctText,
      )
    ) {
      add(
        "error",
        "blank-paraphrase-slot-double-verb",
        "The blank follows a be-verb, so the correct option must be a complement phrase, not start with another finite verb.",
      );
    }
    // 극성 지름길 차단: 정답이 부정 극성인데 오답에 부정 극성이 하나도 없으면
    // 'Unfortunately' 같은 전환 단서 + 극성 스캔만으로 즉답된다 (검수 실측 —
    // KILLER 미달의 최다 원인). DN 의 negative-distractor 게이트와 동일 패턴.
    if (hasNegationCue(correctText) && wrongNegationCount < 1) {
      add(
        "error",
        "blank-killer-polarity-shortcut",
        "PARAPHRASE blank with a negative-polarity answer needs at least 1 negative-polarity wrong option; otherwise polarity scanning alone solves the item.",
      );
    } else if (hasNegationCue(correctText) && wrongNegationCount < 2) {
      add(
        "warning",
        "blank-killer-polarity-shortcut",
        "PARAPHRASE blank should include at least 2 negative-polarity wrong options to block polarity scanning.",
      );
    }
    // KILLER 패러프레이즈 정답 검증 — 원문 verbatim 이면 추론 없이 풀린다.
    if (
      originalExpression &&
      normalizeComparableText(correctText) === normalizeComparableText(originalExpression)
    ) {
      add(
        "error",
        "blank-paraphrase-answer-not-transformed",
        "PARAPHRASE blank must use an abstract restatement as the correct option, not the verbatim originalExpression.",
      );
    } else if (originalExpression) {
      const sourceTokens = toLowerTokens(originalExpression).filter(
        (t) => t.length >= 3 && !REPEATED_PHRASE_STOPWORDS.has(t),
      );
      const answerTokens = new Set(toLowerTokens(correctText));
      const sharedCount = sourceTokens.filter((t) => answerTokens.has(t)).length;
      if (sourceTokens.length >= 2 && sharedCount / sourceTokens.length > 0.6) {
        add(
          "warning",
          "blank-paraphrase-too-similar",
          "PARAPHRASE blank correct option reuses most of the source span's content words; restate it more abstractly.",
        );
      }
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

const BASIC_PARAPHRASE_ADVANCED_WORDS = new Set([
  "abstraction",
  "ambiguous",
  "conceptual",
  "consequential",
  "constitute",
  "cultivation",
  "epistemic",
  "framework",
  "fundamental",
  "heterogeneous",
  "intrinsic",
  "manifestation",
  "mechanism",
  "metacognitive",
  "normative",
  "paradigm",
  "phenomenon",
  "prerequisite",
  "reciprocal",
  "synthesize",
  "transcend",
]);

const INTERMEDIATE_PARAPHRASE_OVERLY_ORNATE_WORDS = new Set([
  "acumen",
  "influx",
  "influxes",
  "sovereignly",
  "terrain",
  "terrains",
]);

function validateBlankAnswerParaphraseMode(
  question: Record<string, unknown>,
  options: Record<string, unknown>[],
  originalExpression: string,
  blankCarrierText: string,
  correctText: string,
  correctLabel: string,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  if (originalExpression && normalizeComparableText(correctText) === normalizeComparableText(originalExpression)) {
    add(
      "error",
      "blank-paraphrase-answer-not-transformed",
      "PARAPHRASE blank correct option must not copy originalExpression verbatim.",
    );
  } else if (originalExpression && isNearVerbatimBlankParaphrase(correctText, originalExpression)) {
    add(
      "error",
      "blank-paraphrase-answer-too-verbatim",
      "PARAPHRASE blank correct option is too close to originalExpression; rewrite it as a real paraphrase.",
    );
  }

  const difficultyIssue = findBlankParaphraseDifficultyIssue(
    correctText,
    originalExpression,
    requestedDifficulty,
  );
  if (difficultyIssue) {
    add("error", difficultyIssue.code, difficultyIssue.message);
  }

  const slotIssue = findBlankParaphraseSlotIssue(
    blankCarrierText,
    originalExpression,
    correctText,
  );
  if (slotIssue) {
    add("error", slotIssue.code, slotIssue.message);
  }

  const killerIssue = findBlankParaphraseKillerIssue(
    options,
    correctLabel,
    originalExpression,
    correctText,
    requestedDifficulty,
  );
  if (killerIssue) {
    add("error", killerIssue.code, killerIssue.message);
  }

  const polarityIssue = findBlankParaphrasePolarityIssue(
    originalExpression,
    correctText,
  );
  if (polarityIssue) {
    add("error", polarityIssue.code, polarityIssue.message);
  }

  if (hasTrailingFunctionWordBlankTarget(originalExpression)) {
    add(
      "error",
      "blank-paraphrase-target-trailing-function",
      "PARAPHRASE blank originalExpression ends with a modal/auxiliary/function tail; choose a cleaner semantic unit so options do not become grammar-tail variants.",
    );
  }

  if (
    countWordsForQuality(originalExpression) > 12 ||
    originalExpression.length > 90
  ) {
    add(
      "error",
      "blank-paraphrase-target-too-wide",
      "PARAPHRASE blank originalExpression is too broad; choose a compact semantic unit instead of a long clause.",
    );
  }

  const answerLogic = normalizeText(question.answerLogic);
  if (answerLogic.length < 30) {
    add(
      "error",
      "blank-paraphrase-missing-answer-logic",
      "PARAPHRASE blank should include answerLogic explaining the source meaning and paraphrased correct option.",
    );
  }

  const optionTexts = options.map((option) => normalizeText(option.text)).filter(Boolean);
  const wordCounts = optionTexts.map(countWordsForQuality).filter((count) => count > 0);
  if (wordCounts.length >= 4) {
    const minWords = Math.min(...wordCounts);
    const maxWords = Math.max(...wordCounts);
    if (maxWords >= 8 && maxWords / Math.max(1, minWords) > 2.4) {
      add(
        "error",
        "blank-paraphrase-option-imbalance",
        `PARAPHRASE blank options are too uneven in length (${minWords}-${maxWords} words).`,
      );
    }
  }

  if (passage) {
    for (const option of options) {
      const optionText = normalizeText(option.text);
      if (!optionText || normalizeLabel(option.label) === correctLabel) continue;
      if (
        countContentTokens(optionText) >= 3 &&
        normalizeComparableText(passage).includes(normalizeComparableText(optionText))
      ) {
        add(
          "error",
          "blank-paraphrase-option-source-copy",
          `PARAPHRASE blank wrong option copies a source passage phrase verbatim: "${optionText.slice(0, 80)}".`,
        );
        break;
      }
    }
  }
}

function findBlankParaphraseSlotIssue(
  blankCarrierText: string,
  originalExpression: string,
  correctText: string,
): { code: string; message: string } | null {
  const carrier = normalizeText(blankCarrierText);
  if (!carrier.includes("_____")) return null;

  const sourceIsTaskLikeSubject =
    /\b(?:challenge|task|problem|question|issue|matter)\b/i.test(originalExpression);
  const isWhetherHowSubjectFrame =
    /^_____\s+(?:is|are|was|were)\s+not\s+(?:whether|if)\b/i.test(carrier) ||
    /^_____\s+(?:is|are|was|were)\s+not\s+(?:a\s+)?(?:question|matter|issue)\s+of\s+(?:whether|if)\b/i.test(carrier);

  if (
    sourceIsTaskLikeSubject &&
    isWhetherHowSubjectFrame &&
    startsWithGerundProcessPhrase(correctText)
  ) {
    return {
      code: "blank-paraphrase-subject-slot-mismatch",
      message:
        "PARAPHRASE blank uses a process-like gerund phrase in a task/challenge subject slot; use a compact noun phrase such as the central challenge/task.",
    };
  }

  const blankIndex = carrier.indexOf("_____");
  const leftOfBlank = blankIndex >= 0 ? carrier.slice(0, blankIndex).trim() : "";
  if (
    /\bto\s*$/i.test(leftOfBlank) &&
    startsWithGerundProcessPhrase(correctText)
  ) {
    return {
      code: "blank-paraphrase-verb-form-slot-mismatch",
      message:
        "PARAPHRASE blank uses a gerund phrase after an infinitive marker; use a base verb phrase that fits the blank sentence.",
    };
  }

  if (
    startsLikeFiniteClause(originalExpression) &&
    startsWithGerundProcessPhrase(correctText) &&
    /(?:^|[.;:!?])$/.test(leftOfBlank)
  ) {
    return {
      code: "blank-paraphrase-clause-slot-mismatch",
      message:
        "PARAPHRASE blank turns a finite source clause into a gerund phrase in an independent-clause slot.",
    };
  }

  return null;
}

function findBlankParaphraseKillerIssue(
  options: Record<string, unknown>[],
  correctLabel: string,
  originalExpression: string,
  correctText: string,
  requestedDifficulty: string | undefined,
): { code: string; message: string } | null {
  if (requestedDifficulty !== "KILLER") return null;

  const sourceContentCount = countContentTokens(originalExpression);
  const sourceWordCount = countWordsForQuality(originalExpression);
  const correctContentCount = countContentTokens(correctText);
  const correctWordCount = countWordsForQuality(correctText);
  if (
    sourceWordCount < 7 ||
    sourceContentCount < 5 ||
    correctContentCount < 6 ||
    correctWordCount < 8
  ) {
    return {
      code: "blank-paraphrase-killer-too-easy",
      message:
        "KILLER PARAPHRASE blank is too surface-level; use a richer central relation and a correct option with enough conceptual load.",
    };
  }

  const wrongOptions = options.filter(
    (option) => normalizeLabel(option.label) !== correctLabel,
  );
  const giveawayCount = wrongOptions.filter((option) =>
    hasKillerBlankGiveawayCue(normalizeText(option.text)),
  ).length;
  if (giveawayCount >= 2) {
    return {
      code: "blank-paraphrase-killer-giveaway-distractors",
      message:
        "KILLER PARAPHRASE blank has too many obviously eliminable distractors; replace extreme/opposite options with passage-grounded near misses.",
    };
  }

  return null;
}

function findStandardBlankKillerIssue(
  originalExpression: string,
): { code: string; message: string } | null {
  const sourceContentCount = countContentTokens(originalExpression);
  const sourceWordCount = countWordsForQuality(originalExpression);
  if (
    sourceWordCount < 6 ||
    sourceContentCount < 5 ||
    isLowValueKillerBlankTarget(originalExpression)
  ) {
    return {
      code: "blank-killer-target-too-easy",
      message:
        "KILLER BLANK_INFERENCE target is too local or surface-level; choose a central claim, relation, contrast, or evaluative turn with enough conceptual load.",
    };
  }

  return null;
}

function hasKillerBlankGiveawayCue(text: string): boolean {
  const normalized = normalizeText(text);
  return /\b(?:unconditionally|completely|passive(?:ly)?|strict(?:ly)?|inevitably|naturally|whatever|successfully|always|never|solely|entirely|exclusively|fully|merely|simply|all|every|only|must|cannot|guarantee(?:s|d)?|definitive|flawless|seamless|error-free|automatically|altogether|indefinitely|immediate(?:ly)?|eliminate(?:s|d|ing)?|bound\s+to|any\s+form\s+of|(?:from|without|against)\s+any|without\s+\w+\s+any|fail(?:s|ed|ing)?\s+to|prevent(?:s|ed|ing)?\s+all|avoid(?:s|ed|ing)?\s+all)\b/i.test(
    normalized,
  );
}

function findBlankParaphrasePolarityIssue(
  originalExpression: string,
  correctText: string,
): { code: string; message: string } | null {
  const original = normalizeText(originalExpression);
  const answer = normalizeText(correctText);

  const originalResistsReduction =
    /\bresist\w*\s+(?:the\s+)?temptation\s+to\s+(?:reduce|simplify|limit|narrow)\b/i.test(original);
  const answerPerformsReduction =
    /\b(?:reduce|reducing|simplify|simplifying|limit|limiting|narrow|narrowing)\b/i.test(answer);
  const answerKeepsResistance =
    /\b(?:resist\w*|avoid\w*|refus\w*|reject\w*|guard(?:ing)?\s+against|prevent\w*|keep\w*\s+from|not|never|without|rather\s+than|instead\s+of)\b/i.test(answer);

  if (originalResistsReduction && answerPerformsReduction && !answerKeepsResistance) {
    return {
      code: "blank-paraphrase-polarity-loss",
      message:
        "PARAPHRASE blank loses the source resistance/negation relation; it turns resisting reduction into performing reduction.",
    };
  }

  return null;
}

function startsWithGerundProcessPhrase(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  const match = normalized.match(
    /^(?:(?:the|a|an)\s+)?(?:(?:act|process|practice)\s+of\s+)?(?:[a-z][a-z'-]*ly\s+){0,2}([a-z][a-z'-]*ing)\b/,
  );
  if (!match) return false;
  return !new Set(["anything", "everything", "nothing", "something", "thing"]).has(match[1] ?? "");
}

function startsLikeFiniteClause(text: string): boolean {
  return /^(?:it|this|that|these|those|they|we|one|people|students|readers|leaders|scientists|researchers|individuals|societies|communities)\s+(?:requires?|demands?|allows?|enables?|helps?|makes?|does|is|are|was|were|can|could|will|would|should|must|may|might)\b/i.test(
    normalizeText(text),
  );
}

function hasTrailingFunctionWordBlankTarget(text: string): boolean {
  return /\b(?:will|shall|can|could|would|should|must|may|might|do|does|did|is|are|was|were|be|being|been|to)$/i.test(
    normalizeText(text),
  );
}

function isNearVerbatimBlankParaphrase(candidate: string, source: string): boolean {
  const candidateComparable = normalizeComparableText(candidate);
  const sourceComparable = normalizeComparableText(source);
  if (!candidateComparable || !sourceComparable) return false;
  if (candidateComparable === sourceComparable) return true;
  if (
    sourceComparable.length >= 16 &&
    (candidateComparable.includes(sourceComparable) ||
      sourceComparable.includes(candidateComparable))
  ) {
    return true;
  }

  const sourceTokens = contentTokens(source);
  const candidateTokens = contentTokens(candidate);
  const smallerTokenCount = Math.min(sourceTokens.size, candidateTokens.size);
  if (smallerTokenCount < 3) return false;
  const overlapRatio = countTokenOverlap(sourceTokens, candidateTokens) / smallerTokenCount;
  const sourceWords = countWordsForQuality(source);
  const candidateWords = countWordsForQuality(candidate);
  return overlapRatio >= 0.8 && Math.abs(sourceWords - candidateWords) <= 2;
}

function findBlankParaphraseDifficultyIssue(
  correctText: string,
  originalExpression: string,
  requestedDifficulty: string | undefined,
): { code: string; message: string } | null {
  const wordCount = countWordsForQuality(correctText);
  const contentCount = countContentTokens(correctText);
  const originalWordCount = countWordsForQuality(originalExpression);
  const originalContentCount = countContentTokens(originalExpression);

  if (requestedDifficulty === "BASIC") {
    const advancedCount = [...contentTokens(correctText)].filter((token) =>
      BASIC_PARAPHRASE_ADVANCED_WORDS.has(token),
    ).length;
    if (wordCount > 12 || advancedCount > 1 || /[;:]/.test(correctText)) {
      return {
        code: "blank-paraphrase-difficulty-mismatch",
        message:
          "BASIC PARAPHRASE blank should use short high-frequency wording, not dense academic phrasing.",
      };
    }
  }

  if (requestedDifficulty === "INTERMEDIATE") {
    const ornateCount = [...contentTokens(correctText)].filter((token) =>
      INTERMEDIATE_PARAPHRASE_OVERLY_ORNATE_WORDS.has(token),
    ).length;
    if (
      originalWordCount < 4 ||
      originalContentCount < 4 ||
      wordCount < 4 ||
      contentCount < 4
    ) {
      return {
        code: "blank-paraphrase-difficulty-mismatch",
        message:
          "INTERMEDIATE PARAPHRASE blank should be more than a short local synonym swap; choose a fuller source relation and paraphrase.",
      };
    }
    if (wordCount > 16 || ornateCount > 0) {
      return {
        code: "blank-paraphrase-difficulty-mismatch",
        message:
          "INTERMEDIATE PARAPHRASE blank should stay natural and readable, not drift into ornate KILLER-level diction.",
      };
    }
  }

  if (
    requestedDifficulty === "KILLER" &&
    originalContentCount >= 4 &&
    contentCount < 3
  ) {
    return {
      code: "blank-paraphrase-correct-too-thin",
      message:
        "KILLER PARAPHRASE blank should preserve a multi-part source idea, not collapse it into a thin generic phrase.",
    };
  }

  return null;
}

const MULTI_BLANK_INFERENCE_LABELS = ["(A)", "(B)", "(C)"] as const;

function validateMultiBlankInferenceQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedBlankCount: number | undefined,
  blankInferenceParaphraseAnswer: boolean | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const isParaphraseMode =
    question.blankAnswerMode === "PARAPHRASE" ||
    blankInferenceParaphraseAnswer === true;
  const blanks = Array.isArray(question.blanks) ? question.blanks.filter(isRecord) : [];
  const expectedBlankCount =
    requestedBlankCount && requestedBlankCount >= 2 && requestedBlankCount <= 3
      ? requestedBlankCount
      : blanks.length >= 2 && blanks.length <= 3
        ? blanks.length
        : 2;

  if (blanks.length !== expectedBlankCount) {
    add(
      "error",
      "multi-blank-count",
      `Multi-blank BLANK_INFERENCE must have exactly ${expectedBlankCount} blanks, got ${blanks.length}.`,
    );
    return;
  }

  const expectedLabels = MULTI_BLANK_INFERENCE_LABELS.slice(0, expectedBlankCount);
  const blankAnswers: string[] = [];
  for (const [index, blank] of blanks.entries()) {
    const label = normalizeText(blank.label);
    const expression = normalizeText(blank.originalExpression);
    if (label !== expectedLabels[index]) {
      add(
        "error",
        "multi-blank-label",
        `Multi-blank labels must be ${expectedLabels.join(", ")} in passage order; blank ${index + 1} has "${label}".`,
      );
    }
    if (!expression) {
      add("error", "multi-blank-missing-expression", `Blank ${expectedLabels[index]} is missing originalExpression.`);
      continue;
    }
    blankAnswers.push(expression);
    if (passage && !normalizeComparableText(passage).includes(normalizeComparableText(expression))) {
      add(
        "error",
        "multi-blank-expression-not-in-passage",
        `Blank ${expectedLabels[index]} expression is not found verbatim in the passage: "${expression.slice(0, 80)}".`,
      );
    }
    if (
      countContentTokens(expression) < 1 ||
      isTinyFunctionWord(expression) ||
      isSemanticallyLightExpression(expression)
    ) {
      add(
        "warning",
        "multi-blank-weak-expression",
        `Blank ${expectedLabels[index]} should blank a meaningful content expression, not a bare function word or an empty light phrase like "doing things".`,
      );
    }
  }

  const passageWithBlank = normalizeText(question.passageWithBlank);
  if (!passageWithBlank) {
    add("error", "multi-blank-missing-passage", "Multi-blank BLANK_INFERENCE is missing passageWithBlank.");
    return;
  }
  for (const label of expectedLabels) {
    const markerCount = countLiteral(passageWithBlank, `${label} _____`);
    if (markerCount !== 1) {
      add(
        "error",
        "multi-blank-marker-count",
        `passageWithBlank must contain the marker "${label} _____" exactly once, found ${markerCount}.`,
      );
    }
  }
  for (const answer of blankAnswers) {
    if (!answer) continue;
    if (normalizeComparableText(passageWithBlank).includes(normalizeComparableText(answer))) {
      add(
        "error",
        "multi-blank-answer-visible",
        `A blanked expression is still visible in passageWithBlank: "${answer.slice(0, 60)}".`,
      );
      continue;
    }
    const leakedSubphrase = findVisibleContentSubphrase(answer, passageWithBlank);
    if (leakedSubphrase) {
      add(
        "error",
        "multi-blank-answer-partial-visible",
        `A blanked expression's meaningful core "${leakedSubphrase}" still appears in passageWithBlank, partially revealing the answer.`,
      );
    }
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctLabel = normalizeLabel(question.correctAnswer);
  let correctValues: string[] | null = null;
  const comboKeys: string[] = [];
  for (const [index, option] of options.entries()) {
    const values = Array.isArray(option.blankValues)
      ? option.blankValues.map((value: unknown) => normalizeText(value))
      : [];
    if (values.length !== expectedBlankCount || values.some((value: string) => !value)) {
      add(
        "error",
        "multi-blank-option-values",
        `Option ${index + 1} must provide exactly ${expectedBlankCount} non-empty blankValues.`,
      );
      continue;
    }
    comboKeys.push(values.map(normalizeComparableText).join(" | "));
    if (normalizeLabel(option.label) === correctLabel) {
      correctValues = values;
    }
  }
  const duplicateCombo = findDuplicate(comboKeys);
  if (duplicateCombo) {
    add("error", "multi-blank-duplicate-option", "Two or more options share the same blank-value combination.");
  }

  if (!correctValues) {
    add("error", "multi-blank-missing-correct-option", "correctAnswer does not match any option label.");
    return;
  }
  if (
    blankAnswers.length === expectedBlankCount &&
    !isParaphraseMode &&
    !correctValues.every(
      (value, index) => normalizeComparableText(value) === normalizeComparableText(blankAnswers[index]),
    )
  ) {
    add(
      "error",
      "multi-blank-correct-option-mismatch",
      "The correct option's blankValues must be exactly the original passage expressions, in blank order.",
    );
  }
  if (
    blankAnswers.length === expectedBlankCount &&
    isParaphraseMode &&
    correctValues.every(
      (value, index) => normalizeComparableText(value) === normalizeComparableText(blankAnswers[index]),
    )
  ) {
    add(
      "error",
      "multi-blank-paraphrase-correct-source-exact",
      "PARAPHRASE multi-blank correct option must not copy the original passage expressions verbatim.",
    );
  } else if (
    blankAnswers.length === expectedBlankCount &&
    isParaphraseMode &&
    correctValues.some((value, index) => isNearVerbatimBlankParaphrase(value, blankAnswers[index]))
  ) {
    add(
      "error",
      "blank-paraphrase-answer-too-verbatim",
      "PARAPHRASE multi-blank correct option has a blank value too close to the original passage expression.",
    );
  }

  // 변별 보조(권장): 한 빈칸만 틀린 근접 오답이 최소 1개는 있어야 모든 빈칸 검증을 강제한다.
  if (correctValues) {
    const nearMissCount = options.filter((option) => {
      if (normalizeLabel(option.label) === correctLabel) return false;
      const values = Array.isArray(option.blankValues)
        ? option.blankValues.map((value: unknown) => normalizeText(value))
        : [];
      if (values.length !== expectedBlankCount) return false;
      const matches = values.filter(
        (value: string, index: number) =>
          normalizeComparableText(value) === normalizeComparableText(correctValues![index]),
      ).length;
      return matches === expectedBlankCount - 1;
    }).length;
    if (nearMissCount < 1) {
      add(
        "warning",
        "multi-blank-weak-near-miss",
        "Include at least one wrong option that is correct for all but one blank so students must verify every blank.",
      );
    }
  }
}

/**
 * 내용 일치 강제 극성 검증 — matchType 설정이 주어졌을 때만 호출(AUTO=미호출).
 * 발문/저장 matchType이 강제 극성과 어긋나면 정답 무효급이므로 error.
 */
function validateContentMatchPolarity(
  question: Record<string, unknown>,
  matchType: "일치" | "불일치",
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  // 부정(불일치) 패턴을 먼저 본다 — "일치"는 "일치하지 않는"의 부분문자열이므로.
  const asksNonMatch =
    /일치하지\s*않|불일치|않는\s*것|do(?:es)?\s*not\s*match|not\s*match/i.test(direction);
  const asksMatch =
    !asksNonMatch && /일치하는|that\s*match|matches\b/i.test(direction);

  if (matchType === "불일치" && !asksNonMatch) {
    add(
      "error",
      "content-match-direction-polarity",
      "불일치 설정이지만 발문이 '일치하지 않는 것'을 묻지 않습니다.",
    );
  }
  if (matchType === "일치" && !asksMatch) {
    add(
      "error",
      "content-match-direction-polarity",
      "일치 설정이지만 발문이 '일치하는 것'을 묻지 않습니다.",
    );
  }

  const storedMatchType = normalizeText(question.matchType);
  if (storedMatchType && storedMatchType !== matchType) {
    add(
      "error",
      "content-match-type-mismatch",
      `matchType(${storedMatchType})가 강제 설정(${matchType})과 다릅니다.`,
    );
  }
}

/**
 * 대의파악 계열(제목/주제/요지) 부정 극성("적절하지 않은 것") 검증 —
 * answerPolarity=NEGATIVE일 때만 호출(POSITIVE/미설정=미호출, 기존 동작 불변).
 * 발문이 부정형이 아니면 정답 극성이 어긋난 것이므로 error.
 * (오답 4개의 "적절성"은 의미 판단이라 결정형 검증 불가 → 프롬프트+품질루프로 보강.)
 */
function validateGistNegativePolarity(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const asksNegative =
    /적절하지\s*않|알맞지\s*않|옳지\s*않|않은\s*것|아닌\s*것|\bNOT\b/i.test(direction);
  if (!asksNegative) {
    add(
      "error",
      "gist-polarity-direction-mismatch",
      `${typeId} 부정 극성 설정이지만 발문이 '적절하지 않은 것'을 묻지 않습니다.`,
    );
  }
  const storedPolarity = normalizeText(question.answerPolarity).toUpperCase();
  if (storedPolarity && storedPolarity !== "NEGATIVE") {
    add(
      "error",
      "gist-polarity-field-mismatch",
      `answerPolarity(${storedPolarity})가 강제 설정(NEGATIVE)과 다릅니다.`,
    );
  }
}

function validateTopicMainIdeaQuestion(
  question: Record<string, unknown>,
  typeId: string,
  stemLanguage: VisibleQuestionLanguage | undefined,
  optionLanguage: VisibleQuestionLanguage | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionTexts = options.map((option) => normalizeText(option.text)).filter(Boolean);
  const expectedStem = stemLanguage ?? "ko";
  const expectedOption = optionLanguage ?? (typeId === "TOPIC" ? "en" : "ko");

  if (typeId === "TOPIC") {
    if (expectedStem === "ko" && !/주제/.test(direction)) {
      add("error", "topic-direction-mismatch", "TOPIC direction must ask for the passage topic.");
    }
    // English stems vary in wording, so misses are advisory rather than blocking.
    if (expectedStem === "en" && !/topic|main\s+(subject|theme)/i.test(direction)) {
      add("warning", "topic-direction-mismatch", "English TOPIC direction should ask for the passage topic.");
    }
  }
  if (typeId === "MAIN_IDEA") {
    if (expectedStem === "ko" && !/(요지|주장)/.test(direction)) {
      add("error", "main-idea-direction-mismatch", "MAIN_IDEA direction must ask for the passage gist or author's claim.");
    }
    if (
      expectedStem === "en" &&
      !/main\s+(idea|point)|gist|claim|argu|assert|writer|author/i.test(direction)
    ) {
      add("warning", "main-idea-direction-mismatch", "English MAIN_IDEA direction should ask for the passage gist or author's claim.");
    }
  }

  if (expectedOption === "en") {
    for (const optionText of optionTexts) {
      if (containsHangul(optionText) || !containsLatinLetter(optionText)) {
        add(
          "error",
          "topic-option-language",
          `${typeId} options should be English phrases for this language setting.`,
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
          `${typeId} options should be Korean statements for this language setting.`,
        );
        break;
      }
    }
  }

  if (typeId === "MAIN_IDEA" && expectedOption === "ko") {
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
  const labelsFromBlanks = blanks
    .map((blank) => normalizeText(blank.label))
    .filter((label) => /^\([A-Z]\)$/.test(label));
  const labelsFromSummary = Array.from(summary.matchAll(/\(([A-Z])\)/g))
    .map((match) => `(${match[1]})`);
  const blankLabels = [...new Set(
    (labelsFromBlanks.length > 0
      ? labelsFromBlanks
      : labelsFromSummary.length > 0
        ? labelsFromSummary
        : ["(A)", "(B)"]).slice(0, 4),
  )].sort();
  const blankAnswers = new Map(
    blankLabels.map((label) => [label, findSummaryBlankAnswer(blanks, label)]),
  );
  const blankA = blankAnswers.get("(A)") || "";
  const blankB = blankAnswers.get("(B)") || "";

  const directionNamesSummaryTask = /summary/i.test(direction) || blankLabels.length > 0;
  const directionNamesAllBlanks = blankLabels.every((label) => direction.includes(label));
  if (!directionNamesSummaryTask || !directionNamesAllBlanks) {
    add(
      "error",
      "summary-mc-direction-frame",
      `SUMMARY_COMPLETE_MC direction must ask for the best words for summary blanks ${blankLabels.join(", ")}.`,
    );
  }

  if (!summary) {
    add("error", "summary-mc-missing-summary", "SUMMARY_COMPLETE_MC is missing summaryWithBlanks.");
  }

  if (blankLabels.some((label) => countLiteral(summary, label) !== 1)) {
    add(
      "error",
      "summary-mc-blank-marker-count",
      `summaryWithBlanks must contain ${blankLabels.join(", ")} exactly once each.`,
    );
  }

  if (summary && containsHangul(summary)) {
    add(
      "error",
      "summary-mc-summary-language",
      "SUMMARY_COMPLETE_MC summaryWithBlanks must be an English summary sentence.",
    );
  }

  const summaryForSentenceCount = summary.replace(
    /\([A-Z]\)\s*(?:_{3,}|(?:\.|\u2026|\?){2,}|[-\u2013\u2014]{2,})?/g,
    " ",
  );
  if (countSentenceEndings(summaryForSentenceCount) > 1) {
    add(
      "warning",
      "summary-mc-summary-too-many-sentences",
      "SUMMARY_COMPLETE_MC summary should be one sentence, not multiple sentences.",
    );
  }

  if (blankLabels.some((label) => !blankAnswers.get(label))) {
    add(
      "error",
      "summary-mc-missing-blank-answer",
      `SUMMARY_COMPLETE_MC blanks must include answers for ${blankLabels.join(", ")}.`,
    );
  }

  for (const label of blankLabels) {
    const answer = blankAnswers.get(label) || "";
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

  if (summary && blankLabels.every((label) => blankAnswers.get(label))) {
    const filledSummary = blankLabels.reduce(
      (next, label) => next.replace(label, blankAnswers.get(label) || ""),
      summary,
    );
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
    blankLabels.some((label) => {
      const key = summaryBlankKey(label);
      return normalizeComparableText(correctPair.values[key] || "") !==
        normalizeComparableText(blankAnswers.get(label) || "");
    })
  ) {
    add(
      "error",
      "summary-mc-correct-pair-mismatch",
      "SUMMARY_COMPLETE_MC correct option pair must match the blanks answers exactly.",
    );
  }

  let hasAOnlyTrap = false;
  let hasBOnlyTrap = false;
  let hasAllButOneTrap = false;
  let malformedPairFound = false;
  let nonEnglishPairFound = false;
  let duplicateCorrectFound = false;

  for (const pair of optionPairs) {
    const missingBlankValue = blankLabels.some((label) => {
      const key = summaryBlankKey(label);
      return !pair.values[key];
    });
    if (missingBlankValue) {
      malformedPairFound = true;
      continue;
    }
    const pairText = blankLabels.map((label) => pair.values[summaryBlankKey(label)] || "").join(" ");
    if (containsHangul(pairText) || !containsLatinLetter(pairText)) {
      nonEnglishPairFound = true;
    }
    if (pair.label !== correctLabel) {
      const matchCount = blankLabels.filter((label) => {
        const key = summaryBlankKey(label);
        return normalizeComparableText(pair.values[key] || "") ===
          normalizeComparableText(blankAnswers.get(label) || "");
      }).length;
      if (matchCount === blankLabels.length) duplicateCorrectFound = true;
      if (matchCount === blankLabels.length - 1) hasAllButOneTrap = true;
    }
    if (pair.label !== correctLabel && blankA && blankB) {
      const aMatches = normalizeComparableText(pair.values.blankA || pair.blankA) === normalizeComparableText(blankA);
      const bMatches = normalizeComparableText(pair.values.blankB || pair.blankB) === normalizeComparableText(blankB);
      if (aMatches && !bMatches) hasAOnlyTrap = true;
      if (!aMatches && bMatches) hasBOnlyTrap = true;
    }
  }

  if (malformedPairFound) {
    add(
      "error",
      "summary-mc-option-pair-shape",
      `Every SUMMARY_COMPLETE_MC option must provide values for ${blankLabels.join(", ")}, or a clearly paired text value.`,
    );
  }

  if (nonEnglishPairFound) {
    add(
      "error",
      "summary-mc-option-language",
      "SUMMARY_COMPLETE_MC options must be English-only paired expressions.",
    );
  }

  if (duplicateCorrectFound) {
    add(
      "error",
      "summary-mc-duplicate-correct-option",
      "Only the correct SUMMARY_COMPLETE_MC option may match every blank answer.",
    );
  }

  if (blankLabels.length === 2 && (!hasAOnlyTrap || !hasBOnlyTrap)) {
    add(
      "error",
      "summary-mc-missing-half-correct-traps",
      "SUMMARY_COMPLETE_MC should include at least one A-only-correct trap and one B-only-correct trap.",
    );
  }

  if (blankLabels.length > 2 && !hasAllButOneTrap) {
    add(
      "warning",
      "summary-mc-missing-all-but-one-trap",
      "SUMMARY_COMPLETE_MC with three or more blanks should include at least one all-but-one-correct trap.",
    );
  }

  if (requestedDifficulty === "KILLER" && blankLabels.length === 2 && blankA && blankB && correctLabel) {
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
  expectedLabel: string,
): string {
  const normalizedExpected = expectedLabel.replace(/[()]/g, "").toLowerCase();
  const blank = blanks.find((item) => {
    const label = normalizeText(item.label).replace(/[()]/g, "").toLowerCase();
    return label === normalizedExpected;
  });
  return normalizeText(blank?.answer);
}

function summaryBlankKey(label: unknown): string {
  const normalized = normalizeText(label).replace(/[()]/g, "").toUpperCase();
  if (!/^[A-Z]$/.test(normalized)) return "";
  return `blank${normalized}`;
}

function readSummaryPairOption(option: Record<string, unknown>): {
  blankA: string;
  blankB: string;
  text: string;
  values: Record<string, string>;
} {
  const text = normalizeText(option.text);
  const values: Record<string, string> = {};
  const textValues = readSummaryValuesFromOptionText(text);

  if (Array.isArray(option.blankValues)) {
    for (const item of option.blankValues) {
      if (!isRecord(item)) continue;
      const key = summaryBlankKey(item.label);
      const value = normalizeText(item.value ?? item.answer);
      if (key && value) values[key] = value;
    }
  }

  for (const [key, value] of Object.entries(option)) {
    if (!/^blank[A-Z]$/i.test(key)) continue;
    const normalizedKey = `blank${key.slice(5).toUpperCase()}`;
    const normalizedValue = normalizeText(value);
    if (normalizedValue) values[normalizedKey] = normalizedValue;
  }

  for (const [key, value] of Object.entries(textValues)) {
    if (value && !values[key]) values[key] = value;
  }

  const explicitA = values.blankA || normalizeText(option.blankA);
  const explicitB = values.blankB || normalizeText(option.blankB);
  if (Object.keys(values).length > 0 || explicitA || explicitB) {
    if (explicitA) values.blankA = explicitA;
    if (explicitB) values.blankB = explicitB;
    return { blankA: explicitA, blankB: explicitB, text, values };
  }

  const stripped = stripSummaryOptionPrefix(text);
  const parts = stripped
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|(?:\?\s*){2,}|\/|\||;|,|\s[-\u2013\u2014]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    parts.forEach((part, index) => {
      values[`blank${String.fromCharCode(65 + index)}`] = part;
    });
    return { blankA: parts[0], blankB: parts[1] || "", text, values };
  }

  return { blankA: "", blankB: "", text, values };
}

function readSummaryValuesFromOptionText(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!text) return values;

  const stripped = stripSummaryOptionPrefix(text);
  stripped
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|(?:\?\s*){2,}|\/|\||;|,|\s[-\u2013\u2014]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part, index) => {
      values[`blank${String.fromCharCode(65 + index)}`] = part;
    });
  return values;
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
  optionLanguage: VisibleQuestionLanguage | undefined,
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

  const expectedOptionLanguage = optionLanguage ?? "en";
  if (expectedOptionLanguage === "en") {
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
  } else {
    for (const optionText of optionTexts) {
      if (!containsHangul(optionText)) {
        add(
          "warning",
          "implied-meaning-option-language",
          "IMPLIED_MEANING options should be Korean statements for this language setting.",
        );
        break;
      }
      if (optionText.length < 6) {
        add(
          "warning",
          "implied-meaning-option-too-short",
          "IMPLIED_MEANING options should be meaningful Korean statements, not short labels.",
        );
        break;
      }
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
  requestedSlotCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.map((sentence: unknown) => normalizeText(sentence))
    : [];
  const slotCount = sentences.length;
  const expectedSlotCount =
    typeof requestedSlotCount === "number" && Number.isFinite(requestedSlotCount)
      ? Math.max(IRRELEVANT_SLOT_MIN, Math.round(requestedSlotCount))
      : IRRELEVANT_SLOT_MIN;
  if (slotCount !== expectedSlotCount) {
    add("error", "irrelevant-sentence-count", `IRRELEVANT must have exactly ${expectedSlotCount} marked sentences, got ${slotCount}.`);
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

function validateSentenceOrderQuestion(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const givenSentence = normalizeText(question.givenSentence);
  if (!givenSentence) {
    add("error", "sentence-order-missing-given", "SENTENCE_ORDER is missing givenSentence.");
  }

  const givenSentenceCount = countDisplaySentences(givenSentence);
  const givenWordCount = countWords(givenSentence);
  if (
    givenSentence &&
    (givenSentenceCount < 1 || givenSentenceCount > SENTENCE_ORDER_MAX_GIVEN_SENTENCES)
  ) {
    add(
      "error",
      "sentence-order-given-too-long",
      `SENTENCE_ORDER givenSentence must be 1-2 sentences, got ${givenSentenceCount}.`,
    );
  }
  if (givenWordCount > SENTENCE_ORDER_MAX_GIVEN_WORDS) {
    add(
      "error",
      "sentence-order-given-too-long",
      `SENTENCE_ORDER givenSentence is too long (${givenWordCount} words). Use only the first 1-2 sentences.`,
    );
  }
  if (/[（(]\s*[ABC]\s*[）)]/.test(givenSentence)) {
    add(
      "error",
      "sentence-order-given-too-long",
      "SENTENCE_ORDER givenSentence appears to contain paragraph labels; split given and (A)/(B)/(C) separately.",
    );
  }

  const paragraphs = Array.isArray(question.paragraphs)
    ? question.paragraphs.filter(isRecord)
    : [];
  if (paragraphs.length !== 3) {
    add(
      "error",
      "sentence-order-paragraph-count",
      `SENTENCE_ORDER must have exactly 3 paragraphs, got ${paragraphs.length}.`,
    );
  }

  const paragraphWordCounts: number[] = [];
  const normalizedLabels: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const expectedLabel = SENTENCE_ORDER_PARAGRAPH_LABELS[index] ?? `(${index + 1})`;
    const label = normalizeSentenceOrderParagraphLabel(paragraph.label);
    normalizedLabels.push(label);
    const text = normalizeText(paragraph.text);
    const sentenceCount = countDisplaySentences(text);
    const wordCount = countWords(text);
    paragraphWordCounts.push(wordCount);

    if (label !== expectedLabel) {
      add(
        "error",
        "sentence-order-paragraph-labels",
        `SENTENCE_ORDER paragraph labels must be (A), (B), (C) in order; got ${normalizedLabels.join(", ")}.`,
      );
    }
    if (sentenceCount < SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES) {
      add(
        "error",
        "sentence-order-paragraph-too-short",
        `SENTENCE_ORDER paragraph ${expectedLabel} must contain at least ${SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES} sentences, got ${sentenceCount}.`,
      );
    }
    if (wordCount < SENTENCE_ORDER_MIN_PARAGRAPH_WORDS) {
      add(
        "error",
        "sentence-order-paragraph-too-thin",
        `SENTENCE_ORDER paragraph ${expectedLabel} is too short (${wordCount} words).`,
      );
    }
  }

  const positiveParagraphCounts = paragraphWordCounts.filter((count) => count > 0);
  if (positiveParagraphCounts.length === 3) {
    const minWords = Math.min(...positiveParagraphCounts);
    const maxWords = Math.max(...positiveParagraphCounts);
    const avgWords =
      positiveParagraphCounts.reduce((sum, count) => sum + count, 0) /
      positiveParagraphCounts.length;

    if (minWords > 0 && maxWords / minWords > SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO) {
      add(
        "error",
        "sentence-order-paragraph-imbalance",
        `SENTENCE_ORDER (A)/(B)/(C) chunks are imbalanced (${positiveParagraphCounts.join("/")} words).`,
      );
    }

    if (
      givenWordCount > 0 &&
      avgWords > 0 &&
      givenWordCount / avgWords > SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO
    ) {
      add(
        "error",
        "sentence-order-given-too-long-relative",
        `SENTENCE_ORDER givenSentence (${givenWordCount} words) is longer than the balanced A/B/C chunk average (${Math.round(avgWords)} words).`,
      );
    }
  }

  validateSentenceOrderOptions(question, add);
}

function validateSentenceOrderOptions(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (!options.length) return;

  const optionOrders = options.map((option) =>
    parseSentenceOrderPermutation(option.text),
  );
  const invalidOptionIndex = optionOrders.findIndex((order) => !order);
  if (invalidOptionIndex >= 0) {
    add(
      "error",
      "sentence-order-option-permutation",
      `SENTENCE_ORDER option ${invalidOptionIndex + 1} is not a valid (A)/(B)/(C) permutation.`,
    );
  }

  const validOrderTexts = optionOrders
    .filter((order): order is string[] => Array.isArray(order))
    .map((order) => order.join("-"));
  const duplicateOrder = findDuplicate(validOrderTexts);
  if (duplicateOrder) {
    add(
      "error",
      "sentence-order-option-duplicates",
      `SENTENCE_ORDER has duplicate order option: ${duplicateOrder}.`,
    );
  }

  const answerLabels = collectCorrectAnswerLabels(question);
  const answerLabel = answerLabels[0];
  if (!answerLabel) return;
  const correctOption = options.find(
    (option) => normalizeLabel(option.label) === answerLabel,
  );
  if (!correctOption) return;

  const correctOrder = parseSentenceOrderPermutation(correctOption.text);
  if (!correctOrder) {
    add(
      "error",
      "sentence-order-correct-option-shape",
      "SENTENCE_ORDER correct option must be a valid (A)/(B)/(C) permutation.",
    );
    return;
  }
  if (correctOrder.join("-") === "(A)-(B)-(C)") {
    add(
      "error",
      "sentence-order-unscrambled-answer",
      "SENTENCE_ORDER correct order must not be the displayed (A)-(B)-(C) order; shuffle labels so students cannot pick the visible order.",
    );
  }
}

function normalizeSentenceOrderParagraphLabel(value: unknown): string {
  const text = normalizeText(value).toUpperCase();
  const match = text.match(/[ABC]/);
  return match ? `(${match[0]})` : text;
}

function parseSentenceOrderPermutation(value: unknown): string[] | null {
  const text = normalizeText(value).toUpperCase();
  const labels = [...text.matchAll(/[（(]\s*([ABC])\s*[）)]/g)].map(
    (match) => `(${match[1]})`,
  );
  if (labels.length !== 3) return null;
  const unique = new Set(labels);
  if (unique.size !== 3) return null;
  return SENTENCE_ORDER_PARAGRAPH_LABELS.every((label) => unique.has(label))
    ? labels
    : null;
}

function countDisplaySentences(value: string): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const splitSentences = splitSharedPassageSentences(text);
  if (splitSentences.length > 0) return splitSentences.length;
  const punctuationSentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(\[])/)
    .map((part) => part.trim())
    .filter(Boolean);
  return Math.max(1, punctuationSentences.length);
}

function countWords(value: string): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const words = text.match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\d+(?:[.,]\d+)*/g);
  return words?.length ?? 0;
}

export interface PassageFeasibility {
  ok: boolean;
  /** 기계적 불가 시 내부 게이트 코드(예: sentence-order-paragraph-too-short) */
  code?: string;
  /** 강사에게 보여줄 한국어 안내 */
  error?: string;
  detail?: Record<string, number>;
}

/**
 * SHIP-FIRST 사전 적합성 게이트 — 차감 전에 **기계적 불가능**만 빠르게 거른다.
 * ⚠️ 출제 포인트의 품질/적합성 판단은 절대 여기서 하지 않는다. 강사가 고른 지문+유형+
 * 난이도는 확정된 의도이며, "포인트가 약하다"는 결코 실패 사유가 아니다(= ship-first).
 * 오직 모델 출력과 무관하게 지문 기하가 그 유형의 형식을 물리적으로 못 만드는 경우만
 * 거른다. 현재 SENTENCE_ORDER 만 활성(3단락 A·B·C, 각 >=2문장/>=24단어가 필요 →
 * <6문장 또는 <72단어면 어떤 출력으로도 불가). 그 외 모든 유형/난이도는 ok(기본 개방).
 * 난이도는 시그니처에만 받아두고 게이트하지 않는다(KILLER를 불가로 취급 금지).
 * 근거: docs/GENERATION-ENGINE-REDESIGN-ROADMAP.md §4 WS6.
 */
export function preflightQuestionFeasibility(
  typeId: string | undefined,
  _difficulty: string | undefined,
  passage: string,
): PassageFeasibility {
  if (typeId === "SENTENCE_ORDER") {
    const minSentences = SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES * 3;
    const sentences = countDisplaySentences(passage);
    if (sentences < minSentences) {
      return {
        ok: false,
        code: "sentence-order-paragraph-too-short",
        error: `글의 순서 유형은 지문을 세 단락(A·B·C)으로 나눠야 하므로 최소 ${minSentences}문장 이상이 필요합니다. 현재 지문은 ${sentences}문장입니다. 더 긴 지문을 선택하거나 다른 유형을 사용해 주세요.`,
        detail: { sentences, minSentences },
      };
    }
    const minWords = SENTENCE_ORDER_MIN_PARAGRAPH_WORDS * 3;
    const words = countWords(passage);
    if (words < minWords) {
      return {
        ok: false,
        code: "sentence-order-paragraph-too-thin",
        error: `글의 순서 유형은 세 단락으로 나눌 만큼 충분한 분량이 필요합니다(최소 약 ${minWords}단어). 현재 지문은 ${words}단어입니다. 더 긴 지문을 선택하거나 다른 유형을 사용해 주세요.`,
        detail: { words, minWords },
      };
    }
  }
  return { ok: true };
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

/** 합법적으로 인접 반복될 수 있는 영어 단어(중복 게이트 예외). */
const GRAMMAR_LEGIT_ADJACENT_REPEATS = new Set(["had", "that", "ho"]);

/**
 * 어법 마커가 앞/뒤 단어를 그대로 중복하는지 검출한다 — "which is __(F) is
 * costed__"처럼 errorExpression이 이웃 단어를 삼켜 깨진 텍스트가 된 케이스.
 * 라벨 `(X)`를 제외한 첫/끝 내용 토큰을 마커 밖 이웃 토큰과 비교한다.
 */
function findGrammarMarkerAdjacentDuplicate(passageWithMarkers: string): string | null {
  const re = /([A-Za-z']+)\s+__\([A-Ja-j]\)\s*([^_]+?)__(?:\s+([A-Za-z']+))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(passageWithMarkers))) {
    const before = match[1].toLowerCase();
    const innerTokens = match[2].trim().split(/\s+/).filter(Boolean);
    const after = match[3]?.toLowerCase();
    const innerFirst = innerTokens[0]?.toLowerCase();
    const innerLast = innerTokens[innerTokens.length - 1]?.toLowerCase();
    if (innerFirst && before === innerFirst && !GRAMMAR_LEGIT_ADJACENT_REPEATS.has(before)) {
      return `${before} ${innerFirst}`;
    }
    if (after && innerLast && after === innerLast && !GRAMMAR_LEGIT_ADJACENT_REPEATS.has(after)) {
      return `${innerLast} ${after}`;
    }
  }
  return null;
}

/**
 * isError 마커의 surroundingText가 자신의 마커 단어(expression/errorExpression/
 * correction)를 하나도 포함하지 않으면 위치 단서가 무효다 — 모델이 다른 문장을
 * 가리킨 것으로, 전역 폴백 오배치와 해설-오류 불일치를 유발한다.
 */
function findGrammarSurroundingMissingMarker(
  markedExpressions: Record<string, unknown>[],
): string | null {
  for (const me of markedExpressions) {
    if (me.isError !== true) continue;
    const surrounding = normalizeText(me.surroundingText);
    if (!surrounding) continue;
    const surroundTokens = new Set(toLowerTokens(surrounding));
    const markerTokens = [
      normalizeText(me.expression),
      normalizeText(me.errorExpression),
      normalizeText(me.correction),
    ].flatMap((s) => toLowerTokens(s));
    if (markerTokens.length === 0) continue;
    if (!markerTokens.some((t) => surroundTokens.has(t))) {
      return normalizeLabel(me.label) || "(?)";
    }
  }
  return null;
}

/**
 * 어법 마커가 surroundingText와 동떨어진 위치에 배치됐는지 검출한다. 각 isError
 * 마커의 렌더 위치 주변 내용어와 모델 surroundingText의 내용어가 전혀 겹치지
 * 않으면 오배치로 본다(전역 폴백이 엉뚱한 동형 단어에 박은 케이스). surroundingText
 * 내용어가 2개 미만이면 신뢰할 수 없어 건너뛴다(위양성 방지).
 */
function findGrammarMisplacedMarker(
  passageWithMarkers: string,
  markedExpressions: Record<string, unknown>[],
): string | null {
  const markers = findMarkers(passageWithMarkers);
  const labelToMarker = new Map<string, { start: number; end: number }>();
  for (const marker of markers) {
    const label = marker.inner.match(/^\(([A-Ja-j])\)/)?.[1]?.toUpperCase();
    if (label && !labelToMarker.has(label)) labelToMarker.set(label, marker);
  }
  for (const me of markedExpressions) {
    if (me.isError !== true) continue;
    const label = normalizeLabel(me.label).replace(/[()]/g, "").toUpperCase();
    const marker = labelToMarker.get(label);
    const surrounding = normalizeText(me.surroundingText);
    if (!marker || !surrounding) continue;

    // 마커 단어(expression/errorExpression)는 surrounding 내용어에서 제외 —
    // 위치 단서가 되는 이웃 내용어만 남긴다.
    const markerWords = new Set(
      [normalizeText(me.expression), normalizeText(me.errorExpression)]
        .flatMap((s) => toLowerTokens(s)),
    );
    const surroundContent = toLowerTokens(surrounding).filter(
      (t) => t.length >= 3 && !REPEATED_PHRASE_STOPWORDS.has(t) && !markerWords.has(t),
    );
    if (surroundContent.length < 2) continue;

    const ctxStart = Math.max(0, marker.start - 45);
    const ctxEnd = Math.min(passageWithMarkers.length, marker.end + 45);
    const around = `${passageWithMarkers.slice(ctxStart, marker.start)} ${passageWithMarkers.slice(marker.end, ctxEnd)}`;
    const aroundTokens = new Set(toLowerTokens(around));
    const overlap = surroundContent.filter((t) => aroundTokens.has(t)).length;
    if (overlap === 0) return me.label ? normalizeLabel(me.label) : `(${label})`;
  }
  return null;
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
  const commaCount = (normalized.match(/,/g) ?? []).length;
  return (
    normalized.includes(":") ||
    normalized.includes(";") ||
    commaCount >= 2 ||
    normalized.length > 90 ||
    countContentTokens(normalized) > 11
  );
}

function isLowValueKillerBlankTarget(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return true;
  if (
    /\b(?:both|each|one another)\b.*\b(?:review|reviews|interact|interacts|communicate|communicates|share|shares)\b/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (
    /^(?:both parties|each party|users|people|students|companies|platforms)\s+\w+(?:\s+\w+){0,3}$/.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
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
    "following evaluations or estimations",
    "act as an active filter",
    "active filter amidst",
    "global cultural influxes",
    "external cultural influxes",
    "cultural influxes",
    "sovereignly filtering",
    "moral terrains",
    "environmental degraders",
    "degraders",
    "making degraders",
    "degraders internalize",
    "financial accountability of their ecological footprint",
    "property of shared choices",
    "synergistic channels",
    "collective boundaries",
    "compassionate comprehension",
    "compromising alternatives",
    "reality that envelopes us",
    "envelopes us",
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
  const blankIndex = blankCarrierText.indexOf("_____");
  const leftOfBlank =
    blankIndex >= 0 ? blankCarrierText.slice(0, blankIndex) : "";

  if (
    /\b(?:by|of|to|for|with|without|from|in|on|at|as|than|about|toward|towards)\s+$/i.test(leftOfBlank) &&
    /^(?:by|of|to|for|with|without|from|in|on|at|as|than|about|toward|towards)\b/i.test(optionText)
  ) {
    return "stacked prepositions";
  }

  if (
    /\bways?\s+in\s+which\s+$/i.test(leftOfBlank) &&
    /\bways?\s+in\s+which\b/i.test(optionText)
  ) {
    return "duplicated ways in which";
  }

  if (
    /\bprocess\s+by\s+which\s+$/i.test(leftOfBlank) &&
    /\bprocess\s+by\s+which\b/i.test(optionText)
  ) {
    return "duplicated process by which";
  }

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
