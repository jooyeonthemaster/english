/** H-STD-9 기준선(읽기 전용): 7/14 품질 대공사 배포 이후 프로덕션에서 생성된
 *  STANDARD INTERMEDIATE 어법·빈칸 문항을 최신순으로 회수한다 (평가 패킷용). */
import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const since = new Date("2026-07-14T00:00:00+09:00");

  const jobs = await prisma.workbenchAiJob.findMany({
    where: {
      domain: "QUESTION_GENERATION",
      createdAt: { gte: since },
      status: "COMPLETED",
      generationPlan: "STANDARD",
      difficulty: "INTERMEDIATE",
      questionType: { in: ["GRAMMAR_ERROR", "BLANK_INFERENCE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true, createdAt: true, questionType: true, generationPlan: true,
      difficulty: true, successCount: true, passageId: true, result: true,
    },
  });

  const ids = jobs.map((j) => j.id);
  const costs = await prisma.platformApiUsageCost.findMany({
    where: { sourceId: { in: ids } },
    select: { sourceId: true, costKrw: true, calls: true },
  });
  const costByJob = new Map<string, { krw: number; calls: number }>();
  for (const c of costs) {
    const cur = costByJob.get(c.sourceId) ?? { krw: 0, calls: 0 };
    cur.krw += c.costKrw; cur.calls += c.calls;
    costByJob.set(c.sourceId, cur);
  }

  const out: unknown[] = [];
  const perType: Record<string, number> = {};
  for (const j of jobs) {
    const type = j.questionType!;
    if ((perType[type] ?? 0) >= 6) continue; // 유형별 최대 6
    const result = j.result as Record<string, unknown> | null;
    const questionIds = (result?.questionIds as string[] | undefined) ?? [];
    if (!questionIds.length) continue;
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true, subType: true, difficulty: true, questionText: true,
        options: true, correctAnswer: true, explanation: true,
        structuredData: true, tags: true, passageId: true,
      },
    });
    if (!questions.length) continue;
    const passage = j.passageId
      ? await prisma.passage.findUnique({
          where: { id: j.passageId },
          select: { id: true, title: true, content: true },
        })
      : null;
    const c = costByJob.get(j.id) ?? { krw: 0, calls: 0 };
    perType[type] = (perType[type] ?? 0) + 1;
    console.log(`${j.createdAt.toISOString()} ${type} ${c.krw.toFixed(0)}원 calls=${c.calls} passage=${passage?.title}`);
    out.push({
      job: {
        id: j.id, createdAt: j.createdAt.toISOString(), status: "COMPLETED",
        plan: "STANDARD", type, difficulty: "INTERMEDIATE",
        costKrw: c.krw, costUsd: 0, calls: c.calls, inputTokens: 0, outputTokens: 0,
        models: [], costEvents: [], timing: (result?.debugTiming as Record<string, unknown>) ?? undefined,
      },
      passage: passage ? { id: passage.id, title: passage.title, content: passage.content } : null,
      questions,
    });
  }
  console.log(`\nselected: ${out.length} jobs (${JSON.stringify(perType)})`);
  const outPath = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716/private/prod-int-baseline.private.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`wrote ${outPath}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
