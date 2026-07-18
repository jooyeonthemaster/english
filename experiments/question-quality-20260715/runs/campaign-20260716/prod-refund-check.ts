/** 장애 후속(읽기 전용): 오늘 실패한 6개 잡의 크레딧 차감/환불 짝을 확인한다. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

const JOB_IDS = [
  "cmromh46c000fi5044h6tefja",
  "cmromh3b80009i5047erztf3o",
  "cmromh2ch000sl5048eyc3ju4",
  "cmromg81n0005i504dt595jmo",
  "cmromg3rj0001i504ufc7o66k",
  "cmromg2j20005l504k7oqdfzx",
];

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const anchor = await prisma.creditTransaction.findFirst({
    where: { referenceId: JOB_IDS[0] },
    select: { academyId: true },
  });
  if (!anchor) { console.log("anchor tx not found"); await prisma.$disconnect(); return; }
  const txs = await prisma.creditTransaction.findMany({
    where: {
      academyId: anchor.academyId,
      createdAt: {
        gte: new Date("2026-07-17T07:30:00Z"),
        lte: new Date("2026-07-17T07:45:00Z"),
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      type: true,
      amount: true,
      balanceAfter: true,
      referenceId: true,
      referenceType: true,
      description: true,
    },
  });
  console.log(`all credit transactions in incident window: ${txs.length}`);
  for (const t of txs) {
    const failedJob = t.referenceId && JOB_IDS.includes(t.referenceId) ? " [FAILED-JOB]" : "";
    console.log(
      `${t.createdAt.toISOString()} ${t.type.padEnd(11)} amount=${String(t.amount).padStart(3)} after=${t.balanceAfter} ref=${t.referenceType}:${t.referenceId}${failedJob} ${t.description ?? ""}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
