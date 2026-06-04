import { normalizePassageText, normalizeQuestionText } from "./text-normalization";
import type { PaperItem } from "./types";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";

const SUMMARY_MARKER_RE = /\[(?:\uc694\uc57d\ubb38|summary)\]/i;
const BLANK_ANSWERS_RE = /\s*\[(?:\ube48\uce78\s*\uc815\ub2f5|blank answers)\][\s\S]*$/i;
const ARROW_RE = /([\s\S]*?)(?:\s*)(?:\u2193|\u2192|->|=>)(?:\s*)([\s\S]*)$/;

export function isSummaryCompleteMc(subType: string | null | undefined) {
  return subType === "SUMMARY_COMPLETE_MC";
}

export function isSummaryComplete(subType: string | null | undefined) {
  return subType === "SUMMARY_COMPLETE";
}

export function isSummaryCompleteSubtype(subType: string | null | undefined) {
  return isSummaryCompleteMc(subType) || isSummaryComplete(subType);
}

export function splitSummaryCompleteMcQuestionText(text: string) {
  const normalized = normalizeQuestionText((text || "").replace(BLANK_ANSWERS_RE, ""));
  if (!normalized) return { stem: "", summary: "" };

  const markerMatch = normalized.match(
    new RegExp(`([\\s\\S]*?)\\s*${SUMMARY_MARKER_RE.source}\\s*([\\s\\S]*)$`, "i"),
  );
  if (markerMatch) {
    return {
      stem: cleanupSummaryStem(markerMatch[1]),
      summary: cleanupSummaryText(markerMatch[2]),
    };
  }

  const bracketLabelMatch = normalized.match(/^([\s\S]*?\?)\s*\[[^\]\n]{1,24}\]\s*([A-Z][\s\S]*)$/);
  if (bracketLabelMatch) {
    return {
      stem: cleanupSummaryStem(bracketLabelMatch[1]),
      summary: cleanupSummaryText(bracketLabelMatch[2]),
    };
  }

  const arrowMatch = normalized.match(ARROW_RE);
  if (arrowMatch) {
    return {
      stem: cleanupSummaryStem(arrowMatch[1]),
      summary: cleanupSummaryText(arrowMatch[2]),
    };
  }

  const fallbackMatch = normalized.match(/^([\s\S]*?\?)(?:\s+)([A-Z][\s\S]*)$/);
  if (fallbackMatch) {
    return {
      stem: cleanupSummaryStem(fallbackMatch[1]),
      summary: cleanupSummaryText(fallbackMatch[2]),
    };
  }

  return { stem: cleanupSummaryStem(normalized), summary: "" };
}

export function summaryCompleteMcPassageForItem(item: PaperItem) {
  return normalizePassageText(item.passageContent || item.sourceQuestion.passage?.content || "");
}

export function summaryCompleteMcSummaryForItem(item: PaperItem, summary: string) {
  const answers = readSummaryBlankAnswersFromQuestionLike(
    item.sourceQuestion,
    item.options,
    item.correctAnswer || item.sourceQuestion.correctAnswer,
  );
  return formatSummaryCompleteMcSummaryForDisplay(summary, answers);
}

export function summaryCompleteMcDisplayTextForItem(item: PaperItem) {
  if (!isSummaryCompleteMc(item.sourceQuestion.subType)) return item.questionText;

  const { stem, summary } = splitSummaryCompleteMcQuestionText(item.questionText);
  const passage = summaryCompleteMcPassageForItem(item);
  const maskedSummary = summaryCompleteMcSummaryForItem(item, summary);
  return [stem, passage, "\u2193", maskedSummary].filter((part) => part.trim()).join("\n\n");
}

function cleanupSummaryStem(text: string) {
  return text.replace(SUMMARY_MARKER_RE, "").replace(/\s+/g, " ").trim();
}

function cleanupSummaryText(text: string) {
  return text.replace(SUMMARY_MARKER_RE, "").replace(/\s+/g, " ").trim();
}
