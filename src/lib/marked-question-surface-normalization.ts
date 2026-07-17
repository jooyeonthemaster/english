import { normalizeStructuredQuestionForDisplay } from "@/components/exams/paper-builder/render-model";

const MARKED_SURFACE_TYPES = new Set(["GRAMMAR_ERROR", "VOCAB_CHOICE", "ANTONYM"]);

export function isMarkedQuestionSurfaceType(
  subType: string | null | undefined,
): boolean {
  return typeof subType === "string" && MARKED_SURFACE_TYPES.has(subType);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Canonicalize marker order and the answer ordinal together before a marked
 * question crosses a display or scoring boundary.
 *
 * Workbench and paper rendering already use this canonicalizer. Tablet-safe
 * payloads and AnswerSpec must consume the same result instead of grading a
 * stale stored ordinal after the renderer reorders markers by occurrence.
 */
export function normalizeMarkedQuestionSurface(
  subType: string | null | undefined,
  structuredData: Record<string, unknown> | null,
  sourcePassageContent?: string | null,
): Record<string, unknown> | null {
  if (!structuredData || !isMarkedQuestionSurfaceType(subType)) {
    return structuredData;
  }
  const input =
    typeof structuredData._typeId === "string"
      ? structuredData
      : { ...structuredData, _typeId: subType };
  try {
    return (
      asRecord(
        normalizeStructuredQuestionForDisplay(input, sourcePassageContent ?? undefined),
      ) ?? structuredData
    );
  } catch {
    // Exam construction is fail-safe: retain the previous surface if legacy
    // data cannot be normalized instead of taking down the whole session.
    return structuredData;
  }
}
