// ============================================================================
// Resolve a passage selection (which may mix real passage ids with un-promoted
// draft pseudo-ids) into real Passage ids, just-in-time at generation.
//
// The generation engines (일반 워크스페이스, 동형문제, 커스텀) all key off real
// `Passage` ids. When the left list includes un-reviewed materials as pseudo-
// passages (see draft-passage-id.ts), selecting one for generation means we
// first have to materialize it into a Passage. We reuse the existing promote
// endpoint (POST /api/extraction/m1-passages/promote) which atomically turns a
// draft into a Passage and returns the new passage id. Promotion uses
// markReviewed=false: the material becomes a usable Passage but KEEPS its
// 검수필요 status (generating is not human review — red border stays until 검수).
//
// Shared by all three PassageCardGrid-based surfaces so the behavior stays
// identical (see [[feedback_new_type_same_structure]]).
// ============================================================================

import {
  draftIdFromPseudoId,
  isDraftPseudoId,
} from "@/lib/extraction/draft-passage-id";

export interface ResolvedDraftSelection {
  /** Real passage ids, original order preserved, drafts that failed to promote dropped. */
  passageIds: string[];
  /** originalSelectedId → real passageId (real ids map to themselves). Missing = failed. */
  resolvedById: Record<string, string>;
  /** Number of drafts newly materialized into passages. */
  promotedCount: number;
  /** Number of selected drafts that could not be resolved into a passage. */
  failedCount: number;
}

interface PromoteOutcome {
  draftId: string;
  status: "promoted" | "skipped" | "failed";
  passageId?: string;
}

/**
 * Promote any draft pseudo-ids in the selection and return real passage ids.
 * Real passage ids pass through untouched (no network call when none are drafts).
 */
export async function resolveSelectionToPassageIds(
  selectedIds: string[],
): Promise<ResolvedDraftSelection> {
  const resolvedById: Record<string, string> = {};
  const draftPseudoIds: string[] = [];

  for (const id of selectedIds) {
    if (isDraftPseudoId(id)) draftPseudoIds.push(id);
    else resolvedById[id] = id; // real passage id → itself
  }

  let promotedCount = 0;
  if (draftPseudoIds.length > 0) {
    const draftIds = draftPseudoIds.map(draftIdFromPseudoId);
    const passageIdByDraftId = new Map<string, string>();
    // 승격 엔드포인트는 한 번에 draftIds 200개 상한 → 청크로 나눠 보낸다
    // (전체 선택 + 생성처럼 많은 자료를 한꺼번에 쓰는 경우 대비).
    const CHUNK = 200;
    for (let i = 0; i < draftIds.length; i += CHUNK) {
      const chunk = draftIds.slice(i, i + CHUNK);
      const res = await fetch("/api/extraction/m1-passages/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ draftIds: chunk, markReviewed: false }),
      });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => ({}))) as {
        outcomes?: PromoteOutcome[];
      };
      for (const outcome of data.outcomes ?? []) {
        if (
          (outcome.status === "promoted" || outcome.status === "skipped") &&
          outcome.passageId
        ) {
          passageIdByDraftId.set(outcome.draftId, outcome.passageId);
          if (outcome.status === "promoted") promotedCount += 1;
        }
      }
    }
    for (const pseudoId of draftPseudoIds) {
      const realId = passageIdByDraftId.get(draftIdFromPseudoId(pseudoId));
      if (realId) resolvedById[pseudoId] = realId;
    }
  }

  // Preserve the caller's original order; drop anything that failed to resolve.
  const passageIds: string[] = [];
  for (const id of selectedIds) {
    const realId = resolvedById[id];
    if (realId) passageIds.push(realId);
  }
  // De-dup (a draft and a real passage could resolve to the same id in rare races).
  const uniquePassageIds = Array.from(new Set(passageIds));

  const failedCount = selectedIds.length - Object.keys(resolvedById).length;

  return {
    passageIds: uniquePassageIds,
    resolvedById,
    promotedCount,
    failedCount,
  };
}
