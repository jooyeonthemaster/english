/**
 * 방치된 충전 주문 일괄 정리 (1회성 백필 + 필요 시 재실행).
 *
 *  1) 30분 넘게 PENDING 인 주문 → 포트원 조회 결과로 동기화/결제 취소
 *  2) 예전에 FAILED 로 저장된 "사용자 취소" 주문 → CANCELLED(결제 취소)
 *
 * 기본은 dry-run(쓰기 없음). 실제 반영은 --apply.
 *   NODE_OPTIONS="--require ./scripts/_shim-server-only.cjs" \
 *     npx tsx --tsconfig tsconfig.json scripts/reconcile-stale-topups.ts [--apply]
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { reconcileStalePendingTopUps } from "@/lib/stale-topup-reconcile";
import { isUserCancelledFailure } from "@/lib/credit-topup-status";

const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "== APPLY (DB 쓰기) ==" : "== DRY RUN (쓰기 없음) ==");

  const pending = await reconcileStalePendingTopUps({ dryRun: !apply, limit: 1000 });
  console.log(`\n[1] 오래된 결제 대기 ${pending.length}건`);
  for (const item of pending) {
    console.log(
      [
        item.createdAt.toISOString().slice(0, 16),
        item.paymentId.slice(0, 12),
        `포트원=${item.portoneStatus ?? "-"}`,
        `${item.action} → ${item.nextStatus ?? "(변경 없음)"}`,
        item.detail ?? "",
      ].join(" | "),
    );
  }
  console.log(tally(pending.map((i) => `${i.action} → ${i.nextStatus ?? "-"}`)));

  const failed = await prisma.creditTopUp.findMany({
    where: { status: "FAILED" },
    select: { id: true, createdAt: true, failureCode: true, failureMessage: true },
  });
  const userCancelled = failed.filter((row) =>
    isUserCancelledFailure({ reason: row.failureMessage, pgCode: row.failureCode }),
  );
  console.log(`\n[2] FAILED 중 사용자 취소 ${userCancelled.length}건 → CANCELLED (실패 유지 ${failed.length - userCancelled.length}건)`);
  for (const row of userCancelled) {
    console.log(`${row.createdAt.toISOString().slice(0, 16)} | ${row.failureMessage}`);
  }
  if (apply && userCancelled.length > 0) {
    const res = await prisma.creditTopUp.updateMany({
      where: { id: { in: userCancelled.map((r) => r.id) }, status: "FAILED" },
      data: { status: "CANCELLED" },
    });
    console.log(`  반영 ${res.count}건`);
  }
}

function tally(keys: string[]) {
  return keys.reduce<Record<string, number>>((acc, k) => {
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

main().finally(() => prisma.$disconnect());
