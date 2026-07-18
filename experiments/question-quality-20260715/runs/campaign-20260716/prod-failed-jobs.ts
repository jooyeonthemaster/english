/** 프로덕션 장애 조사(읽기 전용): 최근 실패한 문제생성 잡의 rawError 원문을 회수한다. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - 1000 * 60 * 60 * 12);

  const jobs = await prisma.workbenchAiJob.findMany({
    where: {
      domain: "QUESTION_GENERATION",
      createdAt: { gte: since },
      status: { in: ["FAILED", "PROCESSING"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      status: true,
      questionType: true,
      generationPlan: true,
      difficulty: true,
      errorMessage: true,
      result: true,
      config: true,
    },
  });
  console.log(`recent FAILED/PROCESSING qgen jobs (12h): ${jobs.length}\n`);
  for (const j of jobs) {
    const result = j.result as Record<string, unknown> | null;
    const config = j.config as Record<string, unknown> | null;
    console.log("──────────────────────────────────────────────");
    console.log(`${j.createdAt.toISOString()} ${j.status} ${j.generationPlan}/${j.questionType}/${j.difficulty} job=${j.id}`);
    console.log(`fastPath=${config?.fastPath ?? "?"} errorMessage=${j.errorMessage ?? "(none)"}`);
    if (result?.rawError) console.log(`rawError: ${String(result.rawError).slice(0, 1500)}`);
    if (result?.rejectionSummary) {
      console.log(`rejectionSummary: ${JSON.stringify(result.rejectionSummary).slice(0, 2000)}`);
    }
    if (result?.debugTiming) console.log(`debugTiming: ${JSON.stringify(result.debugTiming)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
