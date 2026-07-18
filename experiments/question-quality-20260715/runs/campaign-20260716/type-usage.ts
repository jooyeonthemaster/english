/** 프로덕션 유형별 생성 빈도(읽기 전용): 최근 60일 문항 수 상위 유형. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - 60 * 24 * 3600_000);
  const rows = await prisma.question.groupBy({
    by: ["subType"],
    where: { createdAt: { gte: since }, deletedAt: null, aiGenerated: true },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
  });
  for (const r of rows) console.log(String(r.subType).padEnd(24), r._count._all);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
