import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { getCircledNumbers } from "@/lib/question-postprocess/types";
import { CIRCLED_MARKER_REGEX, MARKERS } from "./question-card-constants";
// ─── Helpers ─────────────────────────────────────────────

export function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object" && str !== null) {
    return (Array.isArray(fallback) ? fallback : str) as T;
  }
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function parseCorrectAnswerLabels(correctAnswer: string): Set<string> {
  const labels = new Set<string>();
  const matches = correctAnswer?.match(
    /[\(\[]?\s*(?:[A-Ja-j]|\d{1,3}|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g,
  );
  if (matches?.length) {
    matches.forEach((match) => {
      const label = normalizeAnswerLabel(match);
      if (label) labels.add(label);
    });
  } else {
    const label = normalizeAnswerLabel(correctAnswer);
    if (label) labels.add(label);
  }
  return labels;
}

export function normalizeAnswerLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text
    .replace(/^[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?\s*$/, "$1")
    .toLowerCase();
}

export function pushStructuredTextPart(parts: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) parts.push(value);
}

export function structuredQuestionTextForCard(
  structuredData: Record<string, unknown> | null,
  fallback: string,
  preferStructured: boolean,
): string {
  if (!structuredData || !preferStructured) return fallback;

  const parts: string[] = [];
  pushStructuredTextPart(parts, structuredData.direction);
  if (structuredData.givenSentence)
    parts.push(`[given] ${String(structuredData.givenSentence)}`);
  pushStructuredTextPart(parts, structuredData.passageWithBlank);
  pushStructuredTextPart(parts, structuredData.passageWithMarkers);
  pushStructuredTextPart(parts, structuredData.passageWithUnderline);
  pushStructuredTextPart(parts, structuredData.passageWithNumbers);

  if (Array.isArray(structuredData.paragraphs)) {
    const paragraphText = structuredData.paragraphs
      .map((paragraph) => {
        if (!paragraph || typeof paragraph !== "object") return "";
        const row = paragraph as Record<string, unknown>;
        return `${String(row.label ?? "")} ${String(row.text ?? "")}`.trim();
      })
      .filter(Boolean)
      .join("\n");
    pushStructuredTextPart(parts, paragraphText);
  }

  pushStructuredTextPart(parts, structuredData.sentenceWithBlank);
  pushStructuredTextPart(parts, structuredData.summaryWithBlanks);
  return parts.length > 0 ? parts.join("\n\n") : fallback;
}

// Detect what marking pattern the passage uses: (a)(b)(c), (A)(B)(C), circled numbers, or none
export function readGenerationPlanFromStructuredData(
  value: unknown,
): QuestionGenerationPlan | null {
  if (!value || typeof value !== "object" || !("_generationPlan" in value))
    return null;
  const plan = (value as { _generationPlan?: unknown })._generationPlan;
  return plan === "PREMIUM" || plan === "STANDARD" ? plan : null;
}

export function detectPassageMarking(
  passageContent?: string,
): "lowercase" | "uppercase" | "circled" | "none" {
  if (!passageContent) return "none";
  if (/\(a\)/.test(passageContent)) return "lowercase";
  if (/\(A\)/.test(passageContent)) return "uppercase";
  if (/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/.test(passageContent))
    return "circled";
  return "none";
}

// Format option: always use index-based number label, adapt text based on passage marking
export function formatOption(
  label: string,
  text: string,
  index: number,
  passageMarking: "lowercase" | "uppercase" | "circled" | "none",
): { displayLabel: string; displayText: string } {
  const displayLabel = `${index + 1}`;
  const trimmed = text.trim();

  // If text is just a marker (circled number, number, or empty) — use passage marking pattern
  const isTextOnlyMarker =
    !trimmed || CIRCLED_MARKER_REGEX.test(trimmed) || /^\d{1,3}$/.test(trimmed);
  if (isTextOnlyMarker) {
    return {
      displayLabel,
      displayText: MARKERS[passageMarking][index] || label,
    };
  }

  // If label is a plain number or circled number, just show text
  const num = parseInt(label);
  if ((!isNaN(num) && num >= 1) || CIRCLED_MARKER_REGEX.test(label)) {
    return { displayLabel, displayText: text };
  }
  // Otherwise prepend label to text (e.g. "(A) that", "(a) advantages")
  return { displayLabel, displayText: `${label} ${text}` };
}
