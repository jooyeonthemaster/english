import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const FROM = new Date("2026-07-15T01:00:00.000Z");

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../src/lib/prisma");
  const [questions, jobs] = await Promise.all([
    prisma.question.findMany({
      where: { createdAt: { gte: FROM }, deletedAt: null, aiGenerated: true },
      select: {
        id: true,
        createdAt: true,
        subType: true,
        difficulty: true,
        passageId: true,
        structuredData: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workbenchAiJob.findMany({
      where: { createdAt: { gte: FROM }, domain: "QUESTION_GENERATION" },
      select: {
        id: true,
        createdAt: true,
        completedAt: true,
        status: true,
        questionType: true,
        generationPlan: true,
        difficulty: true,
        requestedCount: true,
        successCount: true,
        failedCount: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const byQuestionCell: Record<string, number> = {};
  for (const question of questions) {
    const structured = question.structuredData as Record<string, unknown> | null;
    const plan = typeof structured?._generationPlan === "string"
      ? structured._generationPlan
      : "UNKNOWN";
    increment(byQuestionCell, `${plan}/${question.subType}/${question.difficulty}`);
  }

  const byJobCell: Record<string, number> = {};
  for (const job of jobs) {
    increment(
      byJobCell,
      `${job.generationPlan}/${job.questionType ?? "UNKNOWN"}/${job.difficulty ?? "UNKNOWN"}/${job.status}`,
    );
  }

  process.stdout.write(`${JSON.stringify({
    fromUtc: FROM.toISOString(),
    observedThroughUtc: new Date().toISOString(),
    questionCount: questions.length,
    jobCount: jobs.length,
    earliestQuestionUtc: questions[0]?.createdAt.toISOString() ?? null,
    latestQuestionUtc: questions.at(-1)?.createdAt.toISOString() ?? null,
    earliestJobUtc: jobs[0]?.createdAt.toISOString() ?? null,
    latestJobUtc: jobs.at(-1)?.createdAt.toISOString() ?? null,
    byQuestionCell,
    byJobCell,
    publicRows: questions.map((question) => ({
      idSuffix: question.id.slice(-6),
      createdAtUtc: question.createdAt.toISOString(),
      subType: question.subType,
      difficulty: question.difficulty,
      passageIdSuffix: question.passageId.slice(-6),
    })),
  }, null, 2)}\n`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
