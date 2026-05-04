import { createHash } from "node:crypto";
import { Prisma as PrismaNS } from "@prisma/client";
import type { JobLike, PassageInput, TxClient } from "./types";
import { CommitPayloadError, ERR_CROSS_TENANT } from "./types";

/** commit-time content hash for Passage duplicate detection. */
export function sha1(input: string): string {
  return createHash("sha1")
    .update(input.replace(/\s+/g, " ").trim(), "utf8")
    .digest("hex");
}

/**
 * Promote a Passage payload into a Passage row — re-commit safe.
 *
 * On re-commit the same ExtractionItem may have already been promoted in a
 * prior commit; Passage.sourceExtractionItemId is @unique, so a naive
 * tx.passage.create() would trip P2002 and roll back the whole transaction.
 *
 * Strategy:
 *   1. If `input.sourceItemId` is supplied AND a Passage already exists
 *      against it (academy-scoped), reuse that row. When `overwriteExisting`
 *      is true we update with the latest payload; otherwise we return the
 *      existing row unchanged and mark it as `skipped` so the caller can
 *      report "kept your edits" to the UI.
 *   2. Otherwise, create a fresh Passage. On P2002 we:
 *        a. Look up a same-academy row with that sourceExtractionItemId.
 *           If found, reuse it (same overwrite rules).
 *        b. If no same-academy row exists, the unique collision is from a
 *           DIFFERENT academy owning that ExtractionItem id. That's a cross-
 *           tenant violation — raise a clear 403 instead of leaking through
 *           as a generic 500.
 */
export async function createOrReusePassage(
  tx: TxClient,
  args: {
    academyId: string;
    sourceMaterialId: string;
    /**
     * School FK resolved by `ensureSourceMaterial`. When present, cascades
     * to `Passage.schoolId` so downstream queries (school-scoped filter,
     * ranking, report) keep the linkage even for bulk-imported passages.
     */
    schoolId?: string;
    job: JobLike;
    input: PassageInput;
    /** When true, overwrite teacher-edited fields on re-commit (opt-in). */
    overwriteExisting: boolean;
  },
): Promise<{ row: { id: string }; skipped: boolean }> {
  const {
    academyId,
    sourceMaterialId,
    schoolId,
    job,
    input,
    overwriteExisting,
  } = args;
  const contentHash = sha1(input.content);

  const data = {
    academyId,
    schoolId: schoolId ?? undefined,
    title: input.title,
    content: input.content,
    source: job.originalFileName
      ? `bulk-extract:${job.originalFileName}`
      : `bulk-extract:${job.id}`,
    grade: input.grade,
    semester: input.semester,
    unit: input.unit,
    publisher: input.publisher,
    difficulty: input.difficulty,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    sourceMaterialId,
    sourceExtractionItemId: input.sourceItemId,
    contentHash,
  };

  // Fast path: look up an existing Passage for this ExtractionItem.
  if (input.sourceItemId) {
    const existing = await tx.passage.findFirst({
      where: {
        academyId,
        sourceExtractionItemId: input.sourceItemId,
      },
      select: { id: true },
    });
    if (existing) {
      if (overwriteExisting) {
        const updated = await tx.passage.update({
          where: { id: existing.id },
          data,
        });
        return { row: updated, skipped: false };
      }
      // Reuse as-is — teacher edits are preserved.
      return { row: existing, skipped: true };
    }
  }

  try {
    const created = await tx.passage.create({ data });
    return { row: created, skipped: false };
  } catch (err) {
    if (
      err instanceof PrismaNS.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      input.sourceItemId
    ) {
      const winner = await tx.passage.findFirst({
        where: {
          academyId,
          sourceExtractionItemId: input.sourceItemId,
        },
        select: { id: true },
      });
      if (winner) {
        if (overwriteExisting) {
          const updated = await tx.passage.update({
            where: { id: winner.id },
            data,
          });
          return { row: updated, skipped: false };
        }
        return { row: winner, skipped: true };
      }
      // No same-academy row owns this sourceExtractionItemId → the unique
      // collision is from a Passage previously promoted by a DIFFERENT
      // academy. This is a cross-tenant leak attempt — raise a clear 403
      // instead of bubbling as a generic 500.
      throw new CommitPayloadError(
        ERR_CROSS_TENANT,
        "다른 학원에서 이미 사용된 추출 데이터입니다.",
        { sourceItemId: input.sourceItemId },
      );
    }
    throw err;
  }
}
