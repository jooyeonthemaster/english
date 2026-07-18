/** 7/17 16:00 KST 이후 프로덕션 생성 배치 전수 감사(읽기 전용):
 *  잡별 실청구 원가·콜수·재시도·생성 문항 원문을 회수한다. */
import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
loadEnvConfig(process.cwd());

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const since = new Date("2026-07-17T07:00:00Z"); // 16:00 KST

  const jobs = await prisma.workbenchAiJob.findMany({
    where: { domain: "QUESTION_GENERATION", createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, createdAt: true, status: true, questionType: true,
      generationPlan: true, difficulty: true, requestedCount: true,
      successCount: true, passageId: true, result: true, errorMessage: true,
    },
  });
  console.log(`qgen jobs since 16:00 KST: ${jobs.length}`);

  const ids = jobs.map((j) => j.id);
  const costs = await prisma.platformApiUsageCost.findMany({
    where: { sourceId: { in: ids } },
    select: {
      sourceId: true, model: true, costKrw: true, costUsd: true, calls: true,
      inputTokens: true, outputTokens: true, metadata: true, sourceDetail: true,
    },
  });
  const costByJob = new Map<string, typeof costs>();
  for (const c of costs) {
    (costByJob.get(c.sourceId) ?? costByJob.set(c.sourceId, []).get(c.sourceId)!).push(c);
  }

  const out: unknown[] = [];
  for (const j of jobs) {
    const result = j.result as Record<string, unknown> | null;
    const jobCosts = costByJob.get(j.id) ?? [];
    const totKrw = jobCosts.reduce((s, c) => s + c.costKrw, 0);
    const totUsd = jobCosts.reduce((s, c) => s + Number(c.costUsd ?? 0), 0);
    const totCalls = jobCosts.reduce((s, c) => s + c.calls, 0);
    const inTok = jobCosts.reduce((s, c) => s + c.inputTokens, 0);
    const outTok = jobCosts.reduce((s, c) => s + c.outputTokens, 0);
    const timing = result?.debugTiming as Record<string, unknown> | undefined;
    const questionIds = (result?.questionIds as string[] | undefined) ?? [];

    const questions = questionIds.length
      ? await prisma.question.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true, subType: true, difficulty: true, questionText: true,
            options: true, correctAnswer: true, explanation: true,
            structuredData: true, tags: true, passageId: true,
          },
        })
      : [];
    const passage = j.passageId
      ? await prisma.passage.findUnique({
          where: { id: j.passageId },
          select: { id: true, title: true, content: true },
        })
      : null;

    console.log("──────────────────────────────────────────────");
    console.log(`${j.createdAt.toISOString()} ${j.status} ${j.generationPlan}/${j.questionType}/${j.difficulty}`);
    console.log(`  job=${j.id} passage=${passage?.title ?? "?"}`);
    console.log(`  cost: ${totKrw.toFixed(1)}원 ($${totUsd.toFixed(4)}) calls=${totCalls} tokens in/out=${inTok}/${outTok}`);
    console.log(`  models: ${[...new Set(jobCosts.map((c) => c.model))].join(", ") || "(none)"}`);
    if (timing) console.log(`  timing: attempts=${timing.generationAttempts} genMs=${timing.generationMs} relaxed=${timing.relaxedFallback}`);
    if (j.status !== "COMPLETED") console.log(`  error: ${j.errorMessage}`);
    for (const q of questions) console.log(`  Q ${q.id} answer=${q.correctAnswer} tags=${JSON.stringify(q.tags).slice(0, 120)}`);

    out.push({
      job: {
        id: j.id, createdAt: j.createdAt.toISOString(), status: j.status,
        plan: j.generationPlan, type: j.questionType, difficulty: j.difficulty,
        costKrw: totKrw, costUsd: totUsd, calls: totCalls,
        inputTokens: inTok, outputTokens: outTok,
        models: [...new Set(jobCosts.map((c) => c.model))],
        costEvents: jobCosts.map((c) => ({
          detail: c.sourceDetail, model: c.model, krw: c.costKrw, usd: c.costUsd,
          calls: c.calls, inTok: c.inputTokens, outTok: c.outputTokens,
          metadata: c.metadata,
        })),
        timing, errorMessage: j.errorMessage,
      },
      passage: passage ? { id: passage.id, title: passage.title, content: passage.content } : null,
      questions,
    });
  }
  const outPath = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716/private/prod-jul17-batch.private.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nwrote ${outPath}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
