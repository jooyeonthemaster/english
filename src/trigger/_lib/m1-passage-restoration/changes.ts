import type {
  GroundedRestorationResponse,
  SourceMatchInput,
} from "@/lib/extraction/restoration";
import type { M1RestorationChangeInput } from "@/lib/extraction/m1-restoration";
import { prisma } from "@/lib/prisma";
import { LOCAL_DB_EXACT_THRESHOLD } from "./types";
import { normalizeComparableText } from "./text-utils";

/**
 * Copy the change rows from a previously-committed M1 draft into the
 * current restoration result. Used by the LOCAL_DB hit path: when the new
 * draft matches a committed draft raw-vs-raw, we inherit the prior draft's
 * restoration evidence (sentence-level changes) so the review side-panel
 * shows the same cards as the original. Returns [] when the source draft
 * had no inline change rows (e.g. a NO_RESTORATION_NEEDED type) — caller
 * still adds a "source-match" whole-passage card on top so the teacher
 * sees *something*.
 *
 * `sourcePageIndex` is intentionally omitted — it points at the OLD draft's
 * page indices, not the current job's. The persist layer fills in the
 * current draft's `sourcePageIndex` for newly-created changes.
 */
export async function copyCommittedDraftChanges(
  sourceDraftId: string,
): Promise<M1RestorationChangeInput[]> {
  const rows = await prisma.extractionM1PassageDraftChange.findMany({
    where: { passageDraftId: sourceDraftId },
    select: {
      sentenceOrder: true,
      before: true,
      after: true,
      changeType: true,
      reason: true,
      confidence: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    sentenceOrder: row.sentenceOrder,
    before: row.before,
    after: row.after,
    changeType: row.changeType,
    reason: row.reason,
    confidence: row.confidence,
  }));
}

export function createWholePassageChange(input: {
  rawText: string;
  restoredText: string;
  changeType: string;
  reason: string;
  confidence: number | null;
}): M1RestorationChangeInput[] {
  if (
    normalizeComparableText(input.rawText) ===
    normalizeComparableText(input.restoredText)
  ) {
    return [];
  }
  return [
    {
      sentenceOrder: null,
      before: input.rawText,
      after: input.restoredText,
      changeType: input.changeType,
      reason: input.reason,
      confidence: input.confidence,
    },
  ];
}

export function readSelectedSourceMatch(
  matches: SourceMatchInput[],
): SourceMatchInput | null {
  const top = matches[0];
  if (!top?.content || top.confidence < LOCAL_DB_EXACT_THRESHOLD) return null;
  return top;
}

export function buildSourceMatchInputFromGrounded(
  match: GroundedRestorationResponse["sourceMatch"],
): SourceMatchInput | null {
  if (!match || !match.content?.trim()) return null;
  return {
    title: match.title || match.url || "출처 후보",
    sourceType: "WEB_PAGE",
    confidence: match.confidence,
    reason: match.reason || "Gemini grounded source match",
    content: match.content,
    sourceRef: match.url ?? undefined,
    publisher: match.publisher ?? undefined,
    year: match.year ?? undefined,
    metadata: {
      provider: "GEMINI_GROUNDED_RESTORATION",
      url: match.url ?? null,
    },
  };
}
