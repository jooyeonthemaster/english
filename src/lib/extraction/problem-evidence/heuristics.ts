import { mergeUniqueStrings } from "../_shared/string-utils";
import { RESTORATION_ACTION_TYPES } from "./constants";
import {
  CHUNK_LABEL_PATTERN,
  CIRCLED_SENTENCE_PATTERN,
  GRAMMAR_VOCAB_PATTERN,
  LONG_BLANK_PATTERN,
  POSITION_MARKER_PATTERN,
  WORD_BANK_PATTERN,
} from "./patterns";
import type {
  ProblemEvidenceAction,
  ProblemEvidenceQuestion,
  ProblemEvidenceResponse,
} from "./schemas";

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
  return /[ㄱ-ㆎ가-힣]/.test(text);
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
