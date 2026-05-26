import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import type { RestorationQuestionInput } from "@/lib/extraction/restoration";
import type { ProblemEvidenceResponse } from "@/lib/extraction/problem-evidence";
import { buildRestorationActions } from "../../m1-restoration-actions";
import { normalizeAnalysisQuestionType } from "./constants";

/**
 * Build RestorationQuestionInput[] from a single STEM-led bucket's items.
 *
 * Caller passes the items that belong to ONE chunk (or one merged group of
 * chunks) — every item is therefore in scope for choice matching. We do NOT
 * fall back to the legacy `groupId` matching because the PASSAGE-led
 * `assignGroupIds` ids do not align with STEM-led buckets.
 */
export function buildRestorationQuestions(
  groupItems: ExtractionItemSnapshot[],
): RestorationQuestionInput[] {
  const questionItems = groupItems
    .filter((item) => item.blockType === "QUESTION_STEM")
    .sort((a, b) => a.order - b.order);

  return questionItems.map((question, index) => {
    const questionNumber =
      typeof question.questionMeta?.number === "number"
        ? question.questionMeta.number
        : null;
    const nextStemOrder =
      questionItems[index + 1]?.order ?? Number.POSITIVE_INFINITY;
    const choices = groupItems
      .filter((item) => {
        if (item.blockType !== "CHOICE") return false;
        if (item.parentItemId === question.id) return true;
        return item.order > question.order && item.order < nextStemOrder;
      })
      .sort((a, b) => a.order - b.order)
      .map((choice, choiceIndex) => ({
        label:
          typeof choice.choiceMeta?.label === "string"
            ? choice.choiceMeta.label
            : String(choiceIndex + 1),
        content: choice.content,
        isAnswer: choice.choiceMeta?.isAnswer === true,
      }));

    return {
      questionNumber,
      stem: question.content,
      choices,
      explanation: null,
    };
  });
}

/**
 * Convert 1st-pass `questionMeta.analysis` payloads into the
 * `ProblemEvidenceResponse` shape that 2nd-pass `restoreM1Passage` expects.
 *
 * The 1st OCR call now performs question-type classification + answer
 * inference inline, so the 2nd-pass call no longer needs a separate Gemini
 * round-trip to compute problem evidence. We just shape the existing analysis
 * data into the response type the restoration pipeline already consumes.
 */
export function buildProblemEvidenceFromItems(
  groupItems: ExtractionItemSnapshot[],
): ProblemEvidenceResponse | null {
  const questionItems = groupItems
    .filter((item) => item.blockType === "QUESTION_STEM")
    .sort((a, b) => a.order - b.order);
  if (questionItems.length === 0) return null;

  const questions = questionItems.map((q, qIndex) => {
    const meta =
      q.questionMeta && typeof q.questionMeta === "object"
        ? (q.questionMeta as Record<string, unknown>)
        : null;
    const analysis =
      meta?.analysis && typeof meta.analysis === "object"
        ? (meta.analysis as Record<string, unknown>)
        : null;
    const questionNumber = typeof meta?.number === "number" ? meta.number : null;
    const questionType = normalizeAnalysisQuestionType(analysis?.questionType);
    const typeLabel =
      typeof analysis?.typeLabel === "string" && analysis.typeLabel.trim()
        ? analysis.typeLabel
        : questionType;
    const answer =
      typeof analysis?.answer === "string" && analysis.answer.trim()
        ? analysis.answer
        : null;
    const answerConfidence =
      typeof analysis?.answerConfidence === "number"
        ? analysis.answerConfidence
        : null;
    const evidence = Array.isArray(analysis?.evidence)
      ? analysis.evidence.filter((e): e is string => typeof e === "string")
      : [];
    const warnings = Array.isArray(analysis?.warnings)
      ? analysis.warnings.filter((w): w is string => typeof w === "string")
      : [];

    // Map each STEM to its CHOICE blocks (same logic as
    // buildRestorationQuestions) so we can synthesize concrete
    // restoration actions from the classify answer.
    const nextStemOrder =
      questionItems[qIndex + 1]?.order ?? Number.POSITIVE_INFINITY;
    const stemChoices = groupItems
      .filter((item) => {
        if (item.blockType !== "CHOICE") return false;
        if (item.parentItemId === q.id) return true;
        return item.order > q.order && item.order < nextStemOrder;
      })
      .sort((a, b) => a.order - b.order)
      .map((choice, choiceIndex) => {
        const choiceMeta =
          choice.choiceMeta && typeof choice.choiceMeta === "object"
            ? (choice.choiceMeta as Record<string, unknown>)
            : null;
        return {
          label:
            typeof choiceMeta?.label === "string"
              ? choiceMeta.label
              : String(choiceIndex + 1),
          content: choice.content,
          isAnswer: choiceMeta?.isAnswer === true,
        };
      });
    const restorationActions = buildRestorationActions(
      {
        questionType,
        answer,
        answerConfidence,
        evidence,
      },
      stemChoices,
    );

    return {
      questionNumber,
      questionType: questionType as
        | "BLANK_INFERENCE"
        | "BLANK_WORD"
        | "BLANK_SENTENCE"
        | "CONNECTOR"
        | "SENTENCE_ORDER"
        | "PARAGRAPH_ORDER"
        | "SENTENCE_INSERT"
        | "IRRELEVANT"
        | "GRAMMAR_ERROR"
        | "GRAMMAR_CORRECTION"
        | "VOCAB_CHOICE"
        | "CONTEXT_MEANING"
        | "IMPLIED_MEANING"
        | "REFERENCE"
        | "CONTENT_MATCH"
        | "TOPIC_MAIN_IDEA"
        | "TITLE"
        | "PURPOSE"
        | "MOOD_TONE"
        | "SUMMARY_COMPLETE"
        | "WORD_ORDER"
        | "SENTENCE_TRANSFORM"
        | "CONDITIONAL_WRITING"
        | "TEXTBOOK_DETAIL"
        | "DIALOGUE_ORDER"
        | "DIALOGUE_RESPONSE"
        | "KOREAN_TRANSLATION"
        | "ENGLISH_DEFINITION"
        | "UNKNOWN",
      typeLabel,
      confidence: answerConfidence ?? 0.5,
      stem: q.content,
      answer,
      answerConfidence,
      evidence,
      restorationActions,
      warnings,
    };
  });

  const solvedCount = questions.filter((q) => q.answer != null).length;
  const status: "SOLVED" | "PARTIAL" | "NO_QUESTIONS" =
    solvedCount === questions.length
      ? "SOLVED"
      : solvedCount > 0
        ? "PARTIAL"
        : "NO_QUESTIONS";
  const confidence =
    questions.length > 0
      ? questions.reduce((sum, q) => sum + q.confidence, 0) / questions.length
      : 0;
  return {
    status,
    confidence,
    sourceHints: [],
    questions,
    globalActions: [],
    unresolved: [],
    warnings: [],
  };
}
