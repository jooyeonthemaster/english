import type { TxClient } from "./types";
import { CommitPayloadError, ERR_PROMOTE_ITEM_MISSING } from "./types";

/**
 * Mark an ExtractionItem as PROMOTED with the given URN — ACADEMY-SCOPED.
 *
 * SECURITY: The previous implementation used `where: { id }` only, which
 * allowed a crafted payload to overwrite the `promotedTo` field of another
 * academy's ExtractionItem. This version joins to `job.academyId` so the
 * update is a no-op for any foreign-academy id; when that happens we detect
 * the zero-row result and raise an explicit 400 so the client cannot
 * silently point an item it doesn't own at a freshly-created URN.
 */
export async function promoteItem(
  tx: TxClient,
  args: { itemId: string; academyId: string; urn: string },
): Promise<void> {
  const { itemId, academyId, urn } = args;
  const { count } = await tx.extractionItem.updateMany({
    where: { id: itemId, job: { academyId } },
    data: {
      promotedTo: urn,
      status: "PROMOTED",
    },
  });
  if (count === 0) {
    // Either the id does not exist or it belongs to another academy. Either
    // way the commit payload is referencing an item this staff cannot own;
    // bubble up as a clean 400 (via CommitPayloadError → outer catch).
    throw new CommitPayloadError(
      ERR_PROMOTE_ITEM_MISSING,
      "연결하려는 추출 블록을 찾을 수 없거나 접근 권한이 없습니다.",
      { itemId },
    );
  }
}

export async function markResultsSaved(tx: TxClient, jobId: string) {
  await tx.extractionResult.updateMany({
    where: { jobId, status: "DRAFT" },
    data: { status: "SAVED" },
  });
}
