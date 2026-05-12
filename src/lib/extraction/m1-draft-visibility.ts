// ============================================================================
// M1 passage draft visibility filter.
//
// Some M1 drafts produced by `persistM1PassageDrafts` are intentionally
// "stub" drafts that the review UI should hide:
//   - Listening problems (영어 1~17번): only QUESTION_STEM + CHOICE blocks,
//     no passage on the page (audio script only).
//   - Sub-questions of shared-passage sets (e.g. Q41 of a [41~42] set):
//     stem + choices stub; the actual passage lives in the shared-passage
//     draft.
// We persist them for audit but suppress them at the API boundary so the
// teacher only sees draft cards for entries that carry a real passage.
// ============================================================================

/** Length below which a passage-less draft is treated as a stub. Listening
 *  drafts run 68~352 chars, shared-passage sub-questions 78~273 chars, real
 *  blank-inference passages 1000+ chars. 400 cleanly separates them. */
const M1_DRAFT_HIDE_MAX_LENGTH = 400;

export interface M1DraftVisibilityInput {
  restorationStatus: string;
  rawText: string;
  metadata: unknown;
}

export function isM1DraftVisible(draft: M1DraftVisibilityInput): boolean {
  // Drafts that went through restoration are always visible.
  if (draft.restorationStatus !== "NO_RESTORATION_NEEDED") return true;
  // Finalize stamps `metadata.reason = "no_passage_body_*"` when it skipped
  // restoration because the group had no passage (or short content with no
  // passage body). Hide those.
  const meta = draft.metadata as Record<string, unknown> | null;
  const reason = typeof meta?.reason === "string" ? meta.reason : null;
  if (reason && reason.startsWith("no_passage_body")) return false;
  // Fallback for older rows without the reason marker: hide if it's both
  // short and not restored (same semantic).
  if (draft.rawText.length < M1_DRAFT_HIDE_MAX_LENGTH) return false;
  return true;
}
