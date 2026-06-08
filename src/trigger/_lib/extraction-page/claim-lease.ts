import { logger } from "@trigger.dev/sdk/v3";
import type { Prisma } from "@prisma/client";
import { PAGE_LEASE_DURATION_MS } from "@/lib/extraction/constants";
import { prisma } from "@/lib/prisma";

// 페이지 워커가 필요로 하는 job 필드만 select. 트랜잭션 내부 findUnique와
// ClaimedPageRow 타입이 같은 정의를 공유하게 한 곳에 둔다 — 예전엔 두 select가
// 따로 적혀 있다가 outputMode가 한쪽(미사용 경로)에만 추가되는 드리프트가 나
// verbatim 고속경로가 작동하지 않았다. satisfies + GetPayload + 캐스팅 제거로
// 런타임 select와 타입이 어긋나면 tsc가 즉시 잡도록 한다.
const PAGE_WITH_JOB = {
  include: {
    job: {
      select: {
        academyId: true,
        createdById: true,
        mode: true,
        totalPages: true,
        // P7-D2: "verbatim"이면 페이지 OCR에서 Gemini를 건너뛰고 Document AI
        // 순수 OCR만 돌린다(그대로 추출 고속 경로). null=기존 Gemini 경로.
        outputMode: true,
      },
    },
  },
} satisfies Prisma.ExtractionPageDefaultArgs;

export type ClaimedPageRow = Prisma.ExtractionPageGetPayload<typeof PAGE_WITH_JOB>;

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
      ...PAGE_WITH_JOB,
    });
    if (!row) {
      throw new Error(`page row missing after claim: ${idempotencyKey}`);
    }

    // Retry-safety: wipe any ExtractionItem rows left over from an earlier
    // attempt on THIS page. Plain-text M1 never writes items so this is a
    // no-op for M1 jobs; for M2/M4 it's what prevents duplicate blocks on
    // retry. Atomic with the lease claim → zero-gap.
    await tx.extractionItem.deleteMany({ where: { pageId: row.id } });

    return row;
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
