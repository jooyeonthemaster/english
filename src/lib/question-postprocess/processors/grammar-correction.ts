import {
  applyReplacementsRTL,
  findExpressionInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import type { PostProcessResult, QuestionPostProcessData, Replacement } from "../types";
import { grammarCorrectionLabel } from "@/lib/grammar-correction-display";

type GrammarCorrectionSegment = {
  label?: unknown;
  sourceText?: unknown;
  displayedText?: unknown;
  isError?: unknown;
  errorPart?: unknown;
  correctedPart?: unknown;
  surroundingText?: unknown;
};

const DEFAULT_GRAMMAR_CORRECTION_DIRECTION =
  "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.";

export function processGrammarCorrection(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];
  const segments = readSegments(ai);

  if (segments.length === 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "GRAMMAR_CORRECTION requires at least one underlined segment",
    };
  }

  const errorSegments = segments.filter((segment) => segment.isError === true);
  if (errorSegments.length !== segments.length || errorSegments.length > 5) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "GRAMMAR_CORRECTION must have 1-5 underlined segments and every underlined segment must have isError=true",
    };
  }

  const processedSegments: Array<Required<Pick<GrammarCorrectionSegment, "sourceText" | "displayedText">> & GrammarCorrectionSegment> = [];
  const replacements: Replacement[] = [];

  for (const [index, segment] of segments.entries()) {
    const label = normalizeGrammarCorrectionLabel(segment.label, index);
    const sourceText = normalizeString(segment.sourceText);
    if (!sourceText) {
      return {
        success: false,
        data: ai,
        warnings,
        error: "Every underlined segment must include sourceText",
      };
    }

    const correctedPart = normalizeString(segment.correctedPart);
    const errorPart = normalizeString(segment.errorPart);
    const displayedText =
      normalizeString(segment.displayedText) ||
      (segment.isError === true && correctedPart && errorPart
        ? replaceFirstLoose(sourceText, correctedPart, errorPart)
        : sourceText);

    if (!displayedText) {
      return {
        success: false,
        data: ai,
        warnings,
        error: "Could not build displayedText for an underlined segment",
      };
    }

    const found = findExpressionInPassage(
      passage,
      sourceText,
      normalizeString(segment.surroundingText),
    );
    if (!found) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `Could not locate underlined sourceText in the passage: "${sourceText}"`,
      };
    }

    if (segment.isError === true) {
      validateErrorSegment(sourceText, displayedText, errorPart, correctedPart, warnings);
    }

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText: `__${label} ${sanitizeExpressionForMarker(displayedText)}__`,
    });
    processedSegments.push({
      ...segment,
      label,
      sourceText,
      displayedText,
    });
  }

  const passageWithUnderline = applyReplacementsRTL(passage, replacements);
  const processedErrorSegments = processedSegments.filter((segment) => segment.isError === true);
  const errorParts = processedErrorSegments
    .map((segment) => normalizeString(segment.errorPart))
    .filter(Boolean);
  const correctedParts = processedErrorSegments
    .map((segment) => normalizeString(segment.correctedPart))
    .filter(Boolean);
  const errorPart = errorParts[0] || normalizeString(ai.errorPart);
  const correctedPart = correctedParts[0] || normalizeString(ai.correctedPart);

  if (
    errorParts.length !== processedErrorSegments.length ||
    correctedParts.length !== processedErrorSegments.length
  ) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Every error underlined segment must include errorPart and correctedPart",
    };
  }

  const correctAnswer = correctedParts
    .map((part, index) => `${grammarCorrectionLabel(index)} ${part}`)
    .join(", ");

  return {
    success: true,
    data: {
      ...ai,
      direction: normalizeGrammarCorrectionDirection(ai.direction, processedSegments.length),
      passageWithUnderline,
      underlinedSegments: processedSegments,
      errorPart,
      errorParts,
      correctedPart,
      correctedParts,
      correctAnswer,
      passageWithMarkers: undefined,
      markedExpressions: undefined,
      errorLabel: undefined,
      sentenceWithError: undefined,
      sentenceWithErrorMarked: undefined,
      errorSentenceForQuestionText: undefined,
    },
    warnings,
  };
}

function readSegments(ai: QuestionPostProcessData): GrammarCorrectionSegment[] {
  if (Array.isArray(ai.underlinedSegments)) {
    return ai.underlinedSegments as GrammarCorrectionSegment[];
  }

  const sourceText = normalizeString(ai.sourceText) || normalizeString(ai.correctedSentence);
  const errorPart = normalizeString(ai.errorPart);
  const correctedPart = normalizeString(ai.correctedPart);
  if (sourceText && errorPart && correctedPart) {
    return [{
      sourceText,
      isError: true,
      errorPart,
      correctedPart,
      surroundingText: ai.surroundingText,
    }];
  }

  return [];
}

function normalizeGrammarCorrectionLabel(value: unknown, index: number): string {
  const text = normalizeString(value);
  if (/^\([A-J]\)$/i.test(text)) return text.toUpperCase();
  if (/^[A-J]$/i.test(text)) return `(${text.toUpperCase()})`;
  return grammarCorrectionLabel(index);
}

function validateErrorSegment(
  sourceText: string,
  displayedText: string,
  errorPart: string,
  correctedPart: string,
  warnings: string[],
) {
  if (!errorPart || !correctedPart) {
    throw new Error("The error underlined segment must include errorPart and correctedPart");
  }
  if (normalizeComparable(errorPart) === normalizeComparable(correctedPart)) {
    throw new Error("errorPart and correctedPart must be different");
  }
  if (!containsLoose(sourceText, correctedPart)) {
    throw new Error("correctedPart must appear inside the original underlined sourceText");
  }
  if (!containsLoose(displayedText, errorPart)) {
    throw new Error("errorPart must appear inside the displayed underlined text");
  }
  if (normalizeComparable(sourceText) === normalizeComparable(displayedText)) {
    throw new Error("The displayed underlined text must contain a grammar mutation");
  }
  if (normalizeComparable(sourceText) === normalizeComparable(correctedPart)) {
    warnings.push("The underlined segment is exactly the correctedPart; underline a wider sentence or clause instead.");
  }
  if (countWords(displayedText) < Math.max(5, countWords(errorPart) + 3)) {
    warnings.push("The underlined segment is very short; prefer a sentence or clause so the exact error is not revealed.");
  }
}

function normalizeGrammarCorrectionDirection(value: unknown, segmentCount: number): string {
  const text = normalizeString(value);
  if (!text) return DEFAULT_GRAMMAR_CORRECTION_DIRECTION;
  if (!/밑줄/.test(text) || !/(고쳐|수정|바르게)/.test(text)) {
    return DEFAULT_GRAMMAR_CORRECTION_DIRECTION;
  }
  if (segmentCount <= 1 && /밑줄\s*친\s*부분\s*중/.test(text)) {
    return DEFAULT_GRAMMAR_CORRECTION_DIRECTION;
  }
  return text;
}

function replaceFirstLoose(text: string, target: string, replacement: string): string {
  const exactIndex = text.indexOf(target);
  if (exactIndex !== -1) {
    return `${text.slice(0, exactIndex)}${replacement}${text.slice(exactIndex + target.length)}`;
  }
  const lowerIndex = text.toLowerCase().indexOf(target.toLowerCase());
  if (lowerIndex === -1) return "";
  return `${text.slice(0, lowerIndex)}${replacement}${text.slice(lowerIndex + target.length)}`;
}

function containsLoose(text: string, fragment: string): boolean {
  return normalizeComparable(text).includes(normalizeComparable(fragment));
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeComparable(value: unknown): string {
  return normalizeString(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .toLowerCase();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
