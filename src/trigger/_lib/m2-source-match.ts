import { prisma } from "@/lib/prisma";
import type { SourceMatchInput } from "@/lib/extraction/restoration";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function exactContainmentScore(candidate: string, target: string): number {
  const c = normalizeText(candidate);
  const t = normalizeText(target);
  if (!c || !t) return 0;
  if (c === t) return 1;
  if (c.includes(t) || t.includes(c)) return 0.92;
  return 0;
}

function scoreCandidate(candidate: string, target: string): number {
  return Math.max(
    exactContainmentScore(candidate, target),
    jaccard(tokensOf(candidate), tokensOf(target)),
  );
}

/**
 * Find an already-extracted draft from the same academy whose raw OCR text
 * matches the current draft's raw OCR text. Used to short-circuit the AI
 * restoration call when the teacher has previously extracted (and committed)
 * the same problem-sheet — we return that draft's `teacherText` as the
 * restored content and let the caller copy across the original draft's
 * `changes` rows so the side-panel evidence cards are preserved verbatim.
 *
 * **Why match against drafts rather than the Passage table?** A `Passage`
 * row is normalized/clean content with no rawText — there's nothing to
 * compare against the current OCR output. Drafts keep both `rawText` (the
 * OCR snapshot — same OCR engine as the current job, so apples-to-apples)
 * and `teacherText` (the curated restoration, what we want to surface).
 * Raw-vs-raw matching is far more stable than raw-vs-clean-content.
 *
 * Filter: only consider drafts whose teacher review reached COMMITTED state
 * (i.e. promote into the Passage table happened), so we don't propagate
 * unverified content.
 */
export async function findPassageSourceMatches(input: {
  academyId: string;
  problemText: string;
  limit?: number;
}): Promise<SourceMatchInput[]> {
  const limit = input.limit ?? 5;
  const probe = normalizeText(input.problemText).slice(0, 400);
  const keywords = probe
    .split(" ")
    .filter((token) => token.length > 5)
    .slice(0, 8);

  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: {
      job: { academyId: input.academyId },
      savedPassageId: { not: null },
      reviewStatus: "COMMITTED",
      deletedAt: null,
      ...(keywords.length > 0
        ? {
            OR: keywords.map((keyword) => ({
              rawText: { contains: keyword, mode: "insensitive" as const },
            })),
          }
        : {}),
    },
    take: 40,
    select: {
      id: true,
      title: true,
      rawText: true,
      teacherText: true,
      savedPassageId: true,
    },
  });

  return drafts
    .map((draft) => {
      // Raw-vs-raw matching — both sides came out of the same OCR pipeline
      // so character-level noise is comparable. Compare against teacherText
      // additionally is unnecessary (and would weaken the score, since
      // teacher fixes diverge from raw deliberately).
      const confidence = scoreCandidate(draft.rawText, input.problemText);
      return {
        title: draft.title ?? "(committed draft)",
        sourceType: "M1_DRAFT" as const,
        confidence,
        reason:
          confidence >= 0.9
            ? "Raw text near-exact match against a previously committed draft."
            : "Raw text overlaps with a previously committed draft.",
        // The restored content surfaced to the caller is the curated
        // teacher text — that's what the AI restoration is approximating.
        content: draft.teacherText,
        // sourceId carries the draft id so the caller can fetch & copy
        // the original change rows for the side-panel evidence cards.
        sourceId: draft.id,
        sourceRef: draft.savedPassageId ?? undefined,
        metadata: {
          sourceDraftId: draft.id,
          savedPassageId: draft.savedPassageId,
        },
      };
    })
    .filter((match) => match.confidence >= 0.2)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
    .map((match) => ({
      title: match.title,
      sourceType: match.sourceType,
      confidence: Number(match.confidence.toFixed(3)),
      reason: match.reason,
      content: match.content,
      sourceId: match.sourceId,
      sourceRef: match.sourceRef,
      metadata: match.metadata,
    }));
}

export const findM2SourceMatches = findPassageSourceMatches;
