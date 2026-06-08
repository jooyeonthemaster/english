import type { GenerationSubType } from "../schemas";
import type { QuestionAnalysis } from "./schema";

export type SimilarGenerationRoute =
  | {
      kind: "standard";
      subType: GenerationSubType;
    }
  | {
      kind: "custom";
      nearestType: GenerationSubType | null;
      reason: string;
    };

const FIVE_OPTION_SINGLE_ANSWER_TYPES = new Set<GenerationSubType>([
  "BLANK_INFERENCE",
  "VOCAB_CHOICE",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
]);

const WRITING_TYPES = new Set<GenerationSubType>([
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
]);

const WORD_ORDER_CUE_RE =
  /word\s*order|arrang|reorder|scrambled|sequence|\uC5B4\uC21C|\uBC30\uC5F4|\uBAA8\uB450\s*\uC774\uC6A9|\uC8FC\uC5B4\uC9C4\s*\uB2E8\uC5B4/i;

function sourceOptionCount(analysis: QuestionAnalysis): number {
  return analysis.source.optionCount || analysis.source.options.length;
}

function explicitCorrectAnswerCount(analysis: QuestionAnalysis): number | null {
  const labelCount = analysis.source.correctAnswerLabels.filter((label) => label.trim()).length;
  if (labelCount > 0) return labelCount;

  const flaggedCount = analysis.source.options.filter((option) => option.isCorrect).length;
  return flaggedCount > 0 ? flaggedCount : null;
}

function analysisText(analysis: QuestionAnalysis): string {
  return [
    analysis.source.direction,
    analysis.source.passage ?? "",
    analysis.reproductionSpec.stemFormat,
    analysis.reproductionSpec.optionFormat,
    analysis.reproductionSpec.answerFormat,
    analysis.reproductionSpec.structureNotes,
    analysis.classification.noveltyNote,
  ].join("\n");
}

function inferSummaryBlankCount(analysis: QuestionAnalysis): number | null {
  const direct = analysis.classification.typeSettings.summaryBlankCount;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  const markers = new Set<string>();
  for (const match of analysisText(analysis).matchAll(/\(([A-Da-d])\)/g)) {
    markers.add(match[1].toUpperCase());
  }
  return markers.size > 0 ? markers.size : null;
}

function grammarMarkerCount(analysis: QuestionAnalysis): number | null {
  const direct = analysis.classification.typeSettings.grammarMarkerCount;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const count = sourceOptionCount(analysis);
  return count > 0 ? count : null;
}

function grammarAnswerCount(analysis: QuestionAnalysis): number | null {
  const direct = analysis.classification.typeSettings.grammarAnswerCount;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  return explicitCorrectAnswerCount(analysis);
}

function grammarCorrectionErrorCount(analysis: QuestionAnalysis): number | null {
  const direct = analysis.classification.typeSettings.grammarCorrectionErrorCount;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  return explicitCorrectAnswerCount(analysis);
}

function irrelevantSlotCount(analysis: QuestionAnalysis): number | null {
  const direct = analysis.classification.typeSettings.irrelevantSlotCount;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const count = sourceOptionCount(analysis);
  return count > 0 ? count : null;
}

function isSectionMarkerGrammarCombination(analysis: QuestionAnalysis): boolean {
  const text = analysisText(analysis).toLowerCase();
  return (
    /\[i\].*\[v\]|\[i\]~\[v\]/i.test(text) &&
    /\(a\).*\(c\)|\(a\)~\(c\)/i.test(text) &&
    (text.includes("row") ||
      text.includes("combination") ||
      text.includes("\uC904") ||
      text.includes("\uD589"))
  );
}

function rejectFiveOptionSingleAnswer(analysis: QuestionAnalysis): string | null {
  const optionCount = sourceOptionCount(analysis);
  const answerCount = explicitCorrectAnswerCount(analysis);

  if (analysis.classification.answerShape !== "MULTIPLE_CHOICE") {
    return `expected MULTIPLE_CHOICE answer shape, got ${analysis.classification.answerShape}`;
  }
  if (optionCount !== 5) return `expected exactly 5 options, got ${optionCount}`;
  if (answerCount !== 1) {
    return answerCount == null
      ? "missing explicit correct answer label"
      : `expected exactly 1 correct answer, got ${answerCount}`;
  }
  if (analysis.source.multipleAnswers) return "source is marked as multiple-answer";
  return null;
}

function rejectContentMatch(analysis: QuestionAnalysis): string | null {
  const optionCount = sourceOptionCount(analysis);
  const answerCount = explicitCorrectAnswerCount(analysis);

  if (analysis.classification.answerShape !== "MULTIPLE_CHOICE") {
    return `CONTENT_MATCH standard path requires MULTIPLE_CHOICE, got ${analysis.classification.answerShape}`;
  }
  if (optionCount < 5 || optionCount > 12) {
    return `CONTENT_MATCH option count must be 5..12, got ${optionCount}`;
  }
  if (answerCount == null) return "CONTENT_MATCH is missing explicit correct answer labels";
  if (answerCount < 1 || answerCount > optionCount) {
    return `CONTENT_MATCH answer count ${answerCount} is outside 1..${optionCount}`;
  }
  return null;
}

function rejectSummaryCompleteMc(analysis: QuestionAnalysis): string | null {
  const base = rejectFiveOptionSingleAnswer(analysis);
  if (base) return base;

  const blankCount = inferSummaryBlankCount(analysis);
  if (blankCount == null) return "SUMMARY_COMPLETE_MC is missing summary blank count";
  if (blankCount < 2 || blankCount > 4) {
    return `SUMMARY_COMPLETE_MC blank count must be 2..4, got ${blankCount}`;
  }
  return null;
}

function rejectSummaryComplete(analysis: QuestionAnalysis): string | null {
  const optionCount = sourceOptionCount(analysis);
  const blankCount = inferSummaryBlankCount(analysis);

  if (analysis.classification.answerShape !== "SHORT_ANSWER") {
    return `SUMMARY_COMPLETE standard path requires SHORT_ANSWER, got ${analysis.classification.answerShape}`;
  }
  if (optionCount > 0) return `SUMMARY_COMPLETE should not have options, got ${optionCount}`;
  if (blankCount == null) return "SUMMARY_COMPLETE is missing summary blank count";
  if (blankCount < 1 || blankCount > 5) {
    return `SUMMARY_COMPLETE blank count must be 1..5, got ${blankCount}`;
  }
  return null;
}

function rejectGrammarError(analysis: QuestionAnalysis): string | null {
  if (isSectionMarkerGrammarCombination(analysis)) {
    return "section-marker grammar combination is not a standard GRAMMAR_ERROR item";
  }
  if (analysis.classification.answerShape !== "MULTIPLE_CHOICE") {
    return `GRAMMAR_ERROR standard path requires MULTIPLE_CHOICE, got ${analysis.classification.answerShape}`;
  }

  const markerCount = grammarMarkerCount(analysis);
  const answerCount = grammarAnswerCount(analysis);
  if (markerCount == null) return "GRAMMAR_ERROR is missing marker count";
  if (markerCount < 5 || markerCount > 10) {
    return `GRAMMAR_ERROR marker count must be 5..10, got ${markerCount}`;
  }
  if (answerCount == null) return "GRAMMAR_ERROR is missing explicit answer count";
  if (answerCount < 1 || answerCount > markerCount) {
    return `GRAMMAR_ERROR answer count ${answerCount} is outside 1..${markerCount}`;
  }
  return null;
}

function rejectGrammarCorrection(analysis: QuestionAnalysis): string | null {
  const optionCount = sourceOptionCount(analysis);
  const errorCount = grammarCorrectionErrorCount(analysis);

  if (analysis.classification.answerShape === "MULTIPLE_CHOICE") {
    return "GRAMMAR_CORRECTION standard path should be constructed response, not MULTIPLE_CHOICE";
  }
  if (optionCount > 0) return `GRAMMAR_CORRECTION should not have choice options, got ${optionCount}`;
  if (errorCount == null) return "GRAMMAR_CORRECTION is missing error count";
  if (errorCount < 1 || errorCount > 5) {
    return `GRAMMAR_CORRECTION error count must be 1..5, got ${errorCount}`;
  }
  return null;
}

function rejectIrrelevant(analysis: QuestionAnalysis): string | null {
  const slotCount = irrelevantSlotCount(analysis);
  const answerCount = explicitCorrectAnswerCount(analysis);

  if (analysis.classification.answerShape !== "MULTIPLE_CHOICE") {
    return `IRRELEVANT standard path requires MULTIPLE_CHOICE, got ${analysis.classification.answerShape}`;
  }
  if (slotCount == null) return "IRRELEVANT is missing slot count";
  if (slotCount < 5 || slotCount > 10) return `IRRELEVANT slot count must be 5..10, got ${slotCount}`;
  if (answerCount !== 1) {
    return answerCount == null
      ? "IRRELEVANT is missing explicit correct answer label"
      : `IRRELEVANT expects 1 inserted sentence answer, got ${answerCount}`;
  }
  return null;
}

function rejectWordOrder(analysis: QuestionAnalysis): string | null {
  if (analysis.classification.answerShape === "MULTIPLE_CHOICE") {
    return "WORD_ORDER standard path should be constructed response, not MULTIPLE_CHOICE";
  }
  if (!WORD_ORDER_CUE_RE.test(analysisText(analysis))) {
    return "WORD_ORDER lacks a clear word-order/arrangement cue";
  }
  return null;
}

function rejectWritingType(analysis: QuestionAnalysis): string | null {
  const optionCount = sourceOptionCount(analysis);
  if (analysis.classification.answerShape === "MULTIPLE_CHOICE") {
    return "writing type standard path should be constructed response, not MULTIPLE_CHOICE";
  }
  if (optionCount > 0) return `writing type should not have choice options, got ${optionCount}`;
  return null;
}

function standardRejectionReason(
  analysis: QuestionAnalysis,
  subType: GenerationSubType,
): string | null {
  if (FIVE_OPTION_SINGLE_ANSWER_TYPES.has(subType)) {
    return rejectFiveOptionSingleAnswer(analysis);
  }

  if (subType === "CONTENT_MATCH") return rejectContentMatch(analysis);
  if (subType === "SUMMARY_COMPLETE_MC") return rejectSummaryCompleteMc(analysis);
  if (subType === "SUMMARY_COMPLETE") return rejectSummaryComplete(analysis);
  if (subType === "GRAMMAR_ERROR") return rejectGrammarError(analysis);
  if (subType === "GRAMMAR_CORRECTION") return rejectGrammarCorrection(analysis);
  if (subType === "IRRELEVANT") return rejectIrrelevant(analysis);
  if (subType === "WORD_ORDER") return rejectWordOrder(analysis);
  if (WRITING_TYPES.has(subType)) return rejectWritingType(analysis);

  return `no conservative standard-route rule for ${subType}`;
}

export function resolveSimilarGenerationRoute(
  analysis: QuestionAnalysis,
): SimilarGenerationRoute {
  const subType = analysis.classification.matchedType ?? null;
  const custom = (reason: string): SimilarGenerationRoute => ({
    kind: "custom",
    nearestType: subType,
    reason,
  });

  if (!subType) return custom("analysis did not select a builtin matchedType");
  if (analysis.classification.isNovelType) {
    return custom(`analysis marked the source as novel despite nearest builtin ${subType}`);
  }
  if (analysis.classification.matchConfidence !== "high") {
    return custom(
      `matchConfidence is ${analysis.classification.matchConfidence}; standard path requires high`,
    );
  }
  if (analysis.classification.stimulusKind === "OTHER") {
    return custom("stimulusKind OTHER is too broad for the standard engine");
  }
  if (analysis.source.completeness && !analysis.source.completeness.isComplete) {
    return custom("source question is incomplete");
  }

  const rejection = standardRejectionReason(analysis, subType);
  if (rejection) return custom(`${subType}: ${rejection}`);
  return { kind: "standard", subType };
}
