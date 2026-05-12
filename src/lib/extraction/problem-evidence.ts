import { z } from "zod";
import type { RestorationQuestionInput } from "./m2-restoration";

export const RESTORATION_ACTION_TYPES = [
  "REMOVE_PROBLEM_MARKER",
  "RESTORE_BLANK",
  "RESTORE_GRAMMAR",
  "RESTORE_VOCAB",
  "REORDER_CHUNKS",
  "INSERT_SENTENCE",
  "REMOVE_IRRELEVANT_SENTENCE",
  "RESTORE_WORD_ORDER",
  "RESTORE_SUMMARY",
  "NORMALIZE_LAYOUT",
  "SOURCE_MATCH_ONLY",
  "TEACHER_REVIEW_REQUIRED",
] as const;

export const PASSAGE_QUESTION_TYPES = [
  "BLANK_INFERENCE",
  "BLANK_WORD",
  "BLANK_SENTENCE",
  "CONNECTOR",
  "SENTENCE_ORDER",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "VOCAB_CHOICE",
  "CONTEXT_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "PURPOSE",
  "MOOD_TONE",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
  "CONDITIONAL_WRITING",
  "TEXTBOOK_DETAIL",
  "DIALOGUE_ORDER",
  "DIALOGUE_RESPONSE",
  "KOREAN_TRANSLATION",
  "ENGLISH_DEFINITION",
  "UNKNOWN",
] as const;

export const problemEvidenceActionSchema = z.object({
  type: z.enum(RESTORATION_ACTION_TYPES),
  target: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
  reason: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const problemEvidenceQuestionSchema = z.object({
  questionNumber: z.number().int().min(1).nullable().optional(),
  questionType: z.enum(PASSAGE_QUESTION_TYPES).default("UNKNOWN"),
  typeLabel: z.string().default("Unknown"),
  confidence: z.number().min(0).max(1).default(0.5),
  stem: z.string().default(""),
  answer: z.string().nullable().optional(),
  answerConfidence: z.number().min(0).max(1).nullable().optional(),
  evidence: z.array(z.string()).default([]),
  restorationActions: z.array(problemEvidenceActionSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export const problemEvidenceResponseSchema = z.preprocess(
  normalizeProblemEvidenceResponse,
  z.object({
    status: z.enum(["SOLVED", "PARTIAL", "NO_QUESTIONS", "FAILED"]).default("PARTIAL"),
    confidence: z.number().min(0).max(1).default(0.5),
    sourceHints: z.array(z.string()).default([]),
    questions: z.array(problemEvidenceQuestionSchema).default([]),
    globalActions: z.array(problemEvidenceActionSchema).default([]),
    unresolved: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }),
);

export type ProblemEvidenceResponse = z.infer<typeof problemEvidenceResponseSchema>;
export type ProblemEvidenceQuestion = z.infer<typeof problemEvidenceQuestionSchema>;
export type ProblemEvidenceAction = z.infer<typeof problemEvidenceActionSchema>;

const POSITION_MARKER_PATTERN = /\(\s*(?:[\u2460-\u24681-5]|\?|[^\x00-\x7F]{1,3})\s*\)/g;
const CHUNK_LABEL_PATTERN = /(?:^|\n)\s*\([A-E]\)\s+/g;
const CIRCLED_SENTENCE_PATTERN = /[\u2460-\u2464]\s*[A-Z][^\u2460-\u2464\n]{20,}/g;
const LONG_BLANK_PATTERN = /_{3,}|blank/i;
const WORD_BANK_PATTERN = /\[[^\]\n]+,\s*[^\]\n]+]/;
const GRAMMAR_VOCAB_PATTERN = /underlined|grammatically|context|vocabulary|grammar/i;

function firstEnglishSentence(text: string): string | null {
  const cleaned = text
    .replace(/^\s*\d{1,3}\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/[A-Z][^.!?]{30,}?[.!?](?=\s|$)/);
  return match?.[0].trim() ?? null;
}

function countMatches(pattern: RegExp, text: string): number {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].length;
}

function hasQuestionLikeKorean(text: string): boolean {
  return /[\u3131-\u318e\uac00-\ud7a3]/.test(text);
}

function hasQuestionLikeEnglish(text: string): boolean {
  return /choose|which of the following|insert|blank|order|irrelevant|grammar|vocabulary|summary/i.test(
    text,
  );
}

function action(
  type: (typeof RESTORATION_ACTION_TYPES)[number],
  input: {
    target?: string | null;
    value?: string | null;
    reason: string;
    confidence: number;
  },
): ProblemEvidenceAction {
  return {
    type,
    target: input.target ?? null,
    value: input.value ?? null,
    reason: input.reason,
    confidence: input.confidence,
  };
}

function question(
  input: Omit<ProblemEvidenceQuestion, "restorationActions" | "evidence" | "warnings"> & {
    restorationActions?: ProblemEvidenceAction[];
    evidence?: string[];
    warnings?: string[];
  },
): ProblemEvidenceQuestion {
  return {
    questionNumber: input.questionNumber ?? null,
    questionType: input.questionType,
    typeLabel: input.typeLabel,
    confidence: input.confidence,
    stem: input.stem,
    answer: input.answer ?? null,
    answerConfidence: input.answerConfidence ?? null,
    evidence: input.evidence ?? [],
    restorationActions: input.restorationActions ?? [],
    warnings: input.warnings ?? [],
  };
}

function mergeUniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function actionKey(item: ProblemEvidenceAction): string {
  return `${item.type}:${item.target ?? ""}:${item.value ?? ""}`;
}

function mergeEvidenceQuestions(
  base: ProblemEvidenceQuestion[],
  additions: ProblemEvidenceQuestion[],
): ProblemEvidenceQuestion[] {
  const result = [...base];
  for (const addition of additions) {
    const duplicateIndex = result.findIndex((item) => {
      if (
        item.questionType !== "UNKNOWN" &&
        item.questionType === addition.questionType
      ) {
        return true;
      }
      return (
        item.questionNumber != null &&
        item.questionNumber === addition.questionNumber
      );
    });
    if (duplicateIndex < 0) {
      result.push(addition);
      continue;
    }

    const current = result[duplicateIndex];
    const actions = new Map(
      [...current.restorationActions, ...addition.restorationActions].map(
        (item) => [actionKey(item), item],
      ),
    );
    result[duplicateIndex] = {
      ...current,
      questionType:
        current.questionType === "UNKNOWN"
          ? addition.questionType
          : current.questionType,
      typeLabel:
        current.typeLabel === "Unknown" ? addition.typeLabel : current.typeLabel,
      confidence: Math.max(current.confidence, addition.confidence),
      answer: current.answer ?? addition.answer ?? null,
      answerConfidence:
        current.answerConfidence ?? addition.answerConfidence ?? null,
      evidence: mergeUniqueStrings([...current.evidence, ...addition.evidence]),
      restorationActions: [...actions.values()],
      warnings: mergeUniqueStrings([...current.warnings, ...addition.warnings]),
    };
  }
  return result;
}

export function buildHeuristicProblemEvidence(
  rawText: string,
): ProblemEvidenceResponse | null {
  const additions: ProblemEvidenceQuestion[] = [];
  const globalActions: ProblemEvidenceAction[] = [];
  const sourceHints: string[] = [];
  const warnings: string[] = [];
  const markerCount = countMatches(POSITION_MARKER_PATTERN, rawText);
  const firstSentence = firstEnglishSentence(rawText);

  if (firstSentence) sourceHints.push(firstSentence);

  if (markerCount >= 3) {
    additions.push(
      question({
        questionNumber: null,
        questionType: "SENTENCE_INSERT",
        typeLabel: "문장 삽입",
        confidence: 0.78,
        stem: "Detected a boxed/given sentence with multiple insertion position markers.",
        answer: null,
        answerConfidence: null,
        evidence: [
          `${markerCount} insertion position markers detected.`,
          firstSentence ? `Given sentence candidate: ${firstSentence}` : "",
        ].filter(Boolean),
        restorationActions: [
          action("INSERT_SENTENCE", {
            target: "BEST_SUPPORTED_POSITION_MARKER",
            value: firstSentence,
            reason:
              "The passage has empty position markers; solve the insertion point and remove the markers.",
            confidence: 0.78,
          }),
          action("REMOVE_PROBLEM_MARKER", {
            target: "position markers",
            reason: "Remove insertion position markers after restoring the passage.",
            confidence: 0.95,
          }),
        ],
      }),
    );
  }

  const chunkCount = countMatches(CHUNK_LABEL_PATTERN, rawText);
  if (chunkCount >= 2) {
    additions.push(
      question({
        questionNumber: null,
        questionType: "SENTENCE_ORDER",
        typeLabel: "글의 순서",
        confidence: 0.72,
        stem: "Detected labeled chunks such as (A), (B), (C).",
        answer: null,
        answerConfidence: null,
        evidence: [`${chunkCount} labeled chunks detected.`],
        restorationActions: [
          action("REORDER_CHUNKS", {
            target: "labeled chunks",
            reason:
              "Solve the chunk order from the stem/choices and remove chunk labels.",
            confidence: 0.72,
          }),
        ],
      }),
    );
  }

  const numberedSentences = countMatches(CIRCLED_SENTENCE_PATTERN, rawText);
  if (numberedSentences >= 4 && /무관|흐름|irrelevant|does not belong/i.test(rawText)) {
    additions.push(
      question({
        questionNumber: null,
        questionType: "IRRELEVANT",
        typeLabel: "무관한 문장",
        confidence: 0.7,
        stem: "Detected numbered sentences and irrelevant-flow wording.",
        answer: null,
        answerConfidence: null,
        evidence: [`${numberedSentences} numbered sentence candidates detected.`],
        restorationActions: [
          action("REMOVE_IRRELEVANT_SENTENCE", {
            target: "numbered sentence",
            reason:
              "Solve which numbered sentence breaks coherence, then remove only that sentence marker/content if it is not part of the source.",
            confidence: 0.7,
          }),
          action("REMOVE_PROBLEM_MARKER", {
            target: "circled sentence numbers",
            reason: "Remove sentence numbering after restoration.",
            confidence: 0.9,
          }),
        ],
      }),
    );
  }

  if (LONG_BLANK_PATTERN.test(rawText)) {
    additions.push(
      question({
        questionNumber: null,
        questionType: "BLANK_INFERENCE",
        typeLabel: "빈칸",
        confidence: 0.66,
        stem: "Detected blank markers or blank-question wording.",
        answer: null,
        answerConfidence: null,
        evidence: ["Blank marker/question wording detected."],
        restorationActions: [
          action("RESTORE_BLANK", {
            target: "blank",
            reason:
              "Fill the blank only from choices, source match, or strong local context.",
            confidence: 0.66,
          }),
        ],
      }),
    );
  }

  if (WORD_BANK_PATTERN.test(rawText)) {
    additions.push(
      question({
        questionNumber: null,
        questionType: "WORD_ORDER",
        typeLabel: "배열 영작",
        confidence: 0.68,
        stem: "Detected bracketed word-bank fragments.",
        answer: null,
        answerConfidence: null,
        evidence: ["Word-bank fragment detected."],
        restorationActions: [
          action("RESTORE_WORD_ORDER", {
            target: "word bank",
            reason:
              "Recover the complete sentence only when the word bank and context support it.",
            confidence: 0.68,
          }),
        ],
      }),
    );
  }

  if (GRAMMAR_VOCAB_PATTERN.test(rawText)) {
    globalActions.push(
      action("TEACHER_REVIEW_REQUIRED", {
        target: "grammar/vocabulary markers",
        reason:
          "Grammar or vocabulary mutation may require solving before the passage can be trusted.",
        confidence: 0.58,
      }),
    );
  }

  if (
    additions.length === 0 &&
    globalActions.length === 0 &&
    !hasQuestionLikeKorean(rawText) &&
    !hasQuestionLikeEnglish(rawText)
  ) {
    return null;
  }

  if (additions.length === 0 && globalActions.length === 0) {
    warnings.push("Question wording detected, but no deterministic restoration action matched.");
  }

  return {
    status: additions.length > 0 ? "PARTIAL" : "NO_QUESTIONS",
    confidence: additions.length > 0 ? 0.68 : 0.45,
    sourceHints: mergeUniqueStrings(sourceHints).slice(0, 6),
    questions: additions,
    globalActions,
    unresolved: [],
    warnings,
  };
}

export function mergeProblemEvidence(
  aiEvidence: ProblemEvidenceResponse | null,
  heuristicEvidence: ProblemEvidenceResponse | null,
): ProblemEvidenceResponse | null {
  if (!aiEvidence) return heuristicEvidence;
  if (!heuristicEvidence) return aiEvidence;
  const actions = new Map(
    [...aiEvidence.globalActions, ...heuristicEvidence.globalActions].map(
      (item) => [actionKey(item), item],
    ),
  );
  return {
    status:
      aiEvidence.status === "SOLVED"
        ? "SOLVED"
        : heuristicEvidence.status === "PARTIAL"
          ? "PARTIAL"
          : aiEvidence.status,
    confidence: Math.max(aiEvidence.confidence, heuristicEvidence.confidence),
    sourceHints: mergeUniqueStrings([
      ...aiEvidence.sourceHints,
      ...heuristicEvidence.sourceHints,
    ]).slice(0, 8),
    questions: mergeEvidenceQuestions(
      aiEvidence.questions,
      heuristicEvidence.questions,
    ),
    globalActions: [...actions.values()],
    unresolved: mergeUniqueStrings([
      ...aiEvidence.unresolved,
      ...heuristicEvidence.unresolved,
    ]),
    warnings: mergeUniqueStrings([
      ...aiEvidence.warnings,
      ...heuristicEvidence.warnings,
    ]),
  };
}

function normalizeProblemEvidenceResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    status: normalizeStatus(row.status),
    sourceHints: normalizeStringArray(row.sourceHints),
    unresolved: normalizeStringArray(row.unresolved),
    warnings: normalizeStringArray(row.warnings),
    questions: Array.isArray(row.questions)
      ? row.questions.map(normalizeQuestion)
      : [],
    globalActions: normalizeActions(row.globalActions),
  };
}

function normalizeQuestion(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    questionType: normalizeQuestionType(row.questionType),
    typeLabel:
      typeof row.typeLabel === "string" && row.typeLabel.trim()
        ? row.typeLabel
        : normalizeQuestionType(row.questionType),
    evidence: normalizeStringArray(row.evidence),
    restorationActions: normalizeActions(row.restorationActions),
    warnings: normalizeStringArray(row.warnings),
  };
}

function normalizeActions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") {
      return {
        type: normalizeActionType(item),
        reason: item,
        confidence: 0.5,
      };
    }
    if (!item || typeof item !== "object") return item;
    const row = item as Record<string, unknown>;
    return {
      ...row,
      type: normalizeActionType(row.type),
    };
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return typeof value === "string" && value.trim() ? [value] : [];
  }
  return value
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .filter((item) => item.trim().length > 0);
}

function normalizeStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (status === "OK" || status === "SUCCESS" || status === "SOLVED_FULL") {
    return "SOLVED";
  }
  if (status === "NONE" || status === "CLEAN_PASSAGE") return "NO_QUESTIONS";
  if (status === "ERROR") return "FAILED";
  return status || "PARTIAL";
}

function normalizeQuestionType(value: unknown): string {
  const type = String(value ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    ORDERING: "SENTENCE_ORDER",
    INSERTION: "SENTENCE_INSERT",
    INSERT_SENTENCE: "SENTENCE_INSERT",
    UNRELATED: "IRRELEVANT",
    ODD_SENTENCE: "IRRELEVANT",
    VOCAB: "VOCAB_CHOICE",
    GRAMMAR: "GRAMMAR_ERROR",
    BLANK: "BLANK_INFERENCE",
    MAIN_IDEA: "TOPIC_MAIN_IDEA",
    TOPIC: "TOPIC_MAIN_IDEA",
    SUMMARY: "SUMMARY_COMPLETE",
    WRITING: "CONDITIONAL_WRITING",
  };
  const normalized = aliases[type] ?? type;
  return PASSAGE_QUESTION_TYPES.includes(
    normalized as (typeof PASSAGE_QUESTION_TYPES)[number],
  )
    ? normalized
    : "UNKNOWN";
}

function normalizeActionType(value: unknown): string {
  const type = String(value ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    REMOVE_MARKER: "REMOVE_PROBLEM_MARKER",
    REMOVE_MARKERS: "REMOVE_PROBLEM_MARKER",
    BLANK: "RESTORE_BLANK",
    GRAMMAR: "RESTORE_GRAMMAR",
    VOCAB: "RESTORE_VOCAB",
    ORDERING: "REORDER_CHUNKS",
    INSERTION: "INSERT_SENTENCE",
    REMOVE_IRRELEVANT: "REMOVE_IRRELEVANT_SENTENCE",
    WORD_ORDER: "RESTORE_WORD_ORDER",
    REVIEW: "TEACHER_REVIEW_REQUIRED",
  };
  const normalized = aliases[type] ?? type;
  return RESTORATION_ACTION_TYPES.includes(
    normalized as (typeof RESTORATION_ACTION_TYPES)[number],
  )
    ? normalized
    : "TEACHER_REVIEW_REQUIRED";
}

function stringifyQuestions(questions: RestorationQuestionInput[]): string {
  if (questions.length === 0) {
    return "(no pre-segmented questions; infer any questions from raw text)";
  }
  return questions
    .map((q, idx) => {
      const choices = q.choices
        .map(
          (choice) =>
            `${choice.label}${choice.isAnswer ? " [ANSWER_MARK]" : ""}: ${choice.content}`,
        )
        .join("\n");
      return [
        `Question ${q.questionNumber ?? idx + 1}`,
        `Stem: ${q.stem}`,
        choices ? `Choices:\n${choices}` : "Choices: (none)",
        q.explanation ? `Explanation: ${q.explanation}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function buildProblemEvidencePrompts(input: {
  rawText: string;
  questions: RestorationQuestionInput[];
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      "You analyze Korean English exam and school worksheet passages. " +
      "Classify question types, solve only what is needed, and extract evidence for restoring a clean reusable passage. " +
      "Do not invent missing source text. Return strict JSON only.",
    userPrompt: [
      "Analyze this passage/problem bundle for restoration evidence.",
      "",
      "Question type coverage:",
      "- CSAT/mock: blank inference, ordering, insertion, irrelevant sentence, grammar, vocabulary, reference, content match, title, topic/main idea, purpose, mood/tone, summary.",
      "- School exams: word blank, sentence blank, connector, paragraph order, textbook detail, dialogue order/response, Korean translation, English definition, conditional writing, sentence transform, word order writing, grammar correction.",
      "- If the exact type is unclear, use UNKNOWN but still extract restorationActions from visible markers.",
      "",
      "Restoration action rules:",
      "- Ordering questions: solve the best chunk order and emit REORDER_CHUNKS. Put the order such as (B)-(A)-(C) in answer and action.value.",
      "- Insertion questions: solve the insertion point and emit INSERT_SENTENCE. Put the marker such as ⑤ or (⑤) in answer/action.target and the given sentence in action.value.",
      "- If a boxed/given sentence appears before a passage with (①)~(⑤), classify it as SENTENCE_INSERT even when the Korean instruction line is missing.",
      "- Irrelevant sentence questions: identify the removable sentence and emit REMOVE_IRRELEVANT_SENTENCE. Put the numbered sentence in action.target.",
      "- Blank questions: infer the filled expression only when supported by choices/context and emit RESTORE_BLANK. Put the restored expression in action.value.",
      "- Grammar/vocabulary questions: identify the corrected original expression and emit RESTORE_GRAMMAR or RESTORE_VOCAB. Put the mutated expression in action.target and corrected expression in action.value.",
      "- Word order/writing questions: recover the model sentence and emit RESTORE_WORD_ORDER. Put the model answer in action.value.",
      "- If no question evidence exists and the passage is clean, return NO_QUESTIONS with SOURCE_MATCH_ONLY or no actions.",
      "- Mark low-confidence or unsupported recovery with TEACHER_REVIEW_REQUIRED.",
      "",
      "Return JSON matching:",
      "{ status, confidence, sourceHints, questions, globalActions, unresolved, warnings }.",
      "",
      "Raw passage/problem text:",
      input.rawText,
      "",
      "Pre-segmented linked questions:",
      stringifyQuestions(input.questions),
    ].join("\n"),
  };
}
