import { logger } from "@trigger.dev/sdk/v3";
import { PAGE_LEASE_DURATION_MS } from "@/lib/extraction/constants";
import { prisma } from "@/lib/prisma";

export type ClaimedPageRow = Awaited<ReturnType<typeof loadClaimedPageRow>>;

async function loadClaimedPageRow(idempotencyKey: string) {
  const row = await prisma.extractionPage.findUnique({
    where: { idempotencyKey },
    include: {
      job: {
        select: {
          academyId: true,
          createdById: true,
          mode: true,
          totalPages: true,
        },
      },
    },
  });
  if (!row) {
    throw new Error(`page row missing after claim: ${idempotencyKey}`);
  }
  return row;
}

/**
 * Phase A: Acquire lease + wipe retry crumbs in ONE transaction.
 *
 * Conditional UPDATE: only succeed if the row is PENDING, FAILED (for retries),
 * PROCESSING by this same Trigger run (attempt retry), or PROCESSING with an
 * expired lease (crashed worker).
 *
 * Returns the claimed page row + job snapshot, or `null` if the row was not
 * claimable. The caller should treat null as "skipped".
 *
 * Atomicity matters: any `ExtractionItem` rows from a prior attempt are wiped
 * INSIDE the same transaction so a retry cannot end up with duplicate blocks
 * when the original attempt wrote partial blocks between lease-claim and crash.
 */
export async function claimPageLease(params: {
  idempotencyKey: string;
  leaseOwner: string;
}) {
  const { idempotencyKey, leaseOwner } = params;
  const leaseExpiresAt = new Date(Date.now() + PAGE_LEASE_DURATION_MS);

  const pageAfterClaim = await prisma.$transaction(async (tx) => {
    const claimed = await tx.extractionPage.updateMany({
      where: {
        idempotencyKey,
        OR: [
          { status: "PENDING" },
          { status: "FAILED" },
          { status: "PROCESSING", leaseOwner },
          { status: "PROCESSING", leaseExpiresAt: { lt: new Date() } },
        ],
      },
      data: {
        status: "PROCESSING",
        leaseOwner,
        leaseExpiresAt,
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    if (claimed.count === 0) return null;

    const row = await tx.extractionPage.findUnique({
      where: { idempotencyKey },
      include: {
        job: {
          select: {
            academyId: true,
            createdById: true,
            mode: true,
            totalPages: true,
          },
        },
      },
    });
    if (!row) {
      throw new Error(`page row missing after claim: ${idempotencyKey}`);
    }

    // Retry-safety: wipe any ExtractionItem rows left over from an earlier
    // attempt on THIS page. Plain-text M1 never writes items so this is a
    // no-op for M1 jobs; for M2/M4 it's what prevents duplicate blocks on
    // retry. Atomic with the lease claim → zero-gap.
    await tx.extractionItem.deleteMany({ where: { pageId: row.id } });

    return row as ClaimedPageRow;
  });

  if (!pageAfterClaim) {
    const current = await prisma.extractionPage.findUnique({
      where: { idempotencyKey },
      select: { status: true },
    });
    logger.info("page skipped (not claimable)", {
      idempotencyKey,
      currentStatus: current?.status,
    });
    return { skipped: true as const, currentStatus: current?.status };
  }

  return { skipped: false as const, page: pageAfterClaim };
}
