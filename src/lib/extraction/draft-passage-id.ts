// ============================================================================
// Pseudo-passage id scheme for un-promoted M1 extraction drafts.
//
// The question/exam generation surfaces (일반·동형문제·커스텀 문제 생성) read
// their left "내 지문" list from /api/passages/list, which only returns real
// `Passage` rows. Materials that were extracted but not yet 검수완료(promote)
// have no Passage row — they live only as `ExtractionM1PassageDraft`. To let
// teachers see and generate from those un-reviewed materials too, the list API
// also emits each visible un-promoted draft as a *pseudo-passage* whose id is
// the draft id prefixed with `draft:`. The card grid renders it like any other
// passage (with the existing 검수필요 red border), and at generation time the
// selection is resolved back to real passages by promoting the drafts.
//
// Pure string helpers — no server deps — so both the API route and client
// components can import them. Real Passage ids are cuids (no colon), so the
// `draft:` prefix never collides with a genuine passage id.
// ============================================================================

export const DRAFT_PASSAGE_PREFIX = "draft:";

/** True when `id` is a pseudo-passage id standing in for an un-promoted draft. */
export function isDraftPseudoId(id: string): boolean {
  return id.startsWith(DRAFT_PASSAGE_PREFIX);
}

/** Real draft id behind a pseudo-passage id (`draft:abc` → `abc`). */
export function draftIdFromPseudoId(id: string): string {
  return id.slice(DRAFT_PASSAGE_PREFIX.length);
}

/** Pseudo-passage id for a draft (`abc` → `draft:abc`). */
export function pseudoIdForDraft(draftId: string): string {
  return `${DRAFT_PASSAGE_PREFIX}${draftId}`;
}
