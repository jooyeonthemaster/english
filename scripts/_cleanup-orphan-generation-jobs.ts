// 죽은 생성 큐 정리 (26-07-21) — dev 서버가 md-stream 생성 도중 종료되면 잡이
// PROCESSING 고아로 남아 UI 큐가 영원히 돈다. 표준 stale-cleanup(10분 fastPath
// 규칙, 환불 포함)을 먼저 돌리고, 남은 md-stream 고아(270s 벽 + 여유 = 6분 초과,
// md-stream 은 미배포라 dev 외 처리 주체가 없음)를 표적 정리한다.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const MD_STREAM_ORPHAN_MS = 6 * 60 * 1000;
const MSG = "Stale AI job auto-cleaned after timeout. Please run it again.";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { cleanupStaleWorkbenchAiJobs } = await import(
    "../src/lib/workbench-ai-job-stale-cleanup"
  );
  const { refundCredits } = await import("../src/lib/credits");
  const { CREDIT_COSTS } = await import("../src/lib/credit-costs");

  const listActive = () =>
    prisma.workbenchAiJob.findMany({
      where: {
        domain: "QUESTION_GENERATION",
        deletedAt: null,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        academyId: true,
        status: true,
        questionType: true,
        createdAt: true,
        startedAt: true,
        updatedAt: true,
        triggerRunId: true,
        creditTxId: true,
        config: true,
      },
    });

  const before = await listActive();
  console.log(`활성(PENDING/PROCESSING) 생성 잡: ${before.length}건`);
  for (const j of before) {
    const cfg = (j.config ?? {}) as Record<string, unknown>;
    const ageMin = (Date.now() - (j.startedAt ?? j.createdAt).getTime()) / 60000;
    console.log(
      ` - ${j.id} ${j.status} ${j.questionType} age=${ageMin.toFixed(1)}m` +
        ` mdStream=${cfg.mdStream === true} fastPath=${cfg.fastPath === true}` +
        ` trigger=${j.triggerRunId ? "Y" : "N"} tx=${j.creditTxId ? "Y" : "N"}`,
    );
  }

  console.log("\n[1] 표준 stale-cleanup (전 학원, 검증된 규칙·환불 포함)");
  const std = await cleanupStaleWorkbenchAiJobs({});
  console.log(JSON.stringify(std));

  console.log("\n[2] 잔여 md-stream 고아 표적 정리 (6분 초과)");
  const cutoff = new Date(Date.now() - MD_STREAM_ORPHAN_MS);
  const orphans = (await listActive()).filter((j) => {
    const cfg = (j.config ?? {}) as Record<string, unknown>;
    return (
      cfg.mdStream === true &&
      j.triggerRunId === null &&
      (j.startedAt ?? j.createdAt) < cutoff
    );
  });
  for (const j of orphans) {
    const updated = await prisma.workbenchAiJob.updateMany({
      where: { id: j.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: MSG,
        completedAt: new Date(),
      },
    });
    if (updated.count === 0) continue;
    let refund = "no-tx";
    if (j.creditTxId) {
      const tx = await prisma.creditTransaction.findUnique({
        where: { id: j.creditTxId },
        select: { academyId: true, type: true, operationType: true },
      });
      if (
        tx &&
        tx.academyId === j.academyId &&
        tx.type === "CONSUMPTION" &&
        typeof tx.operationType === "string" &&
        tx.operationType in CREDIT_COSTS
      ) {
        const amount = await refundCredits(
          j.academyId,
          tx.operationType as keyof typeof CREDIT_COSTS,
          j.creditTxId,
          MSG,
        );
        refund = amount > 0 ? `refunded ${amount}` : "already-refunded/0";
      } else {
        refund = "tx-invalid(skip)";
      }
    }
    console.log(` - killed ${j.id} (${j.questionType}) refund=${refund}`);
  }
  if (orphans.length === 0) console.log(" - 대상 없음");

  const after = await listActive();
  console.log(`\n정리 후 활성 잡: ${after.length}건`);
  for (const j of after) {
    const ageMin = (Date.now() - (j.startedAt ?? j.createdAt).getTime()) / 60000;
    console.log(` - ${j.id} ${j.status} ${j.questionType} age=${ageMin.toFixed(1)}m (신선 — 유지)`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
