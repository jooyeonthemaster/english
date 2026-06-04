import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

/**
 * Resolve a display title for a draft card / modal header.
 *
 * Priority:
 *   1. `draft.title` (teacher-set, trimmed)
 *   2. First sentence of `teacherText` (or `rawText` fallback) — stripped of
 *      common problem-stem noise (numbering "1. ", points "[3.0점]"). Returns
 *      the full sentence so callers can rely on CSS `truncate` to ellipsize
 *      responsively against the container width.
 *   3. "지문 N" final fallback (1-based passage order).
 */
export function getDraftDisplayTitle(draft: M1PassageDraftSnapshot): string {
  const explicit = draft.title?.trim();
  if (explicit) return explicit;

  const source = (draft.teacherText?.trim() || draft.rawText?.trim() || "").trim();
  if (source) {
    const cleaned = source
      .replace(/^\d+\.\s*/, "")
      .replace(/\[[\d.]+점\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 0) {
      return firstSentence;
    }
  }

  return `지문 ${draft.passageOrder + 1}`;
}

/** True iff the title is teacher-set (not the auto-generated fallback). */
export function hasExplicitTitle(draft: M1PassageDraftSnapshot): boolean {
  return Boolean(draft.title && draft.title.trim().length > 0);
}
