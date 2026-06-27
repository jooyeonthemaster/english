/**
 * 일회성 복구 스크립트 — 하드삭제된 AI 생성문제를 workbench_ai_jobs 잡 원장에서
 * 재구성해 각 학원 "휴지통"(deletedAt 세팅)으로 되살린다. (bulk createMany 판)
 *
 *  - 원본 question id 그대로 INSERT → 시험지/폴더 참조가 자동 재연결.
 *  - deletedAt = now() 로 넣어 휴지통에만 보이고, 살아있는 화면엔 안 새게 한다.
 *  - 앱이 원래 쓰던 매핑(saveGeneratedQuestionsForJob)을 1:1 재사용 → 충실도 보장.
 *  - 멱등: createMany skipDuplicates 로 이미 들어간 id/explanation 은 건너뛴다.
 *
 *    npx tsx scripts/_recover-deleted-to-trash.ts            # dry-run
 *    npx tsx scripts/_recover-deleted-to-trash.ts --execute  # 실제 INSERT
 */
import { PrismaClient } from "@prisma/client";
import { buildGeneratedQuestionText } from "@/lib/question-generation-persistence";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
} from "@/lib/question-generation-plans";

const EXECUTE = process.argv.includes("--execute");
const prisma = new PrismaClient();

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) return rawTags.filter((t): t is string => typeof t === "string");
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return rawTags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
  }
}
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

type Pair = {
  q: Record<string, unknown>;
  academyId: string;
  passageId: string | null;
  rawPlan: unknown;
};

async function main() {
  const now = new Date();
  const stats = {
    jobsScanned: 0,
    distinctQids: 0,
    alreadyLive: 0,
    deadRecoverable: 0,
    questionsInserted: 0,
    questionsSkipped: 0,
    explanationsInserted: 0,
    perAcademy: {} as Record<string, number>,
  };

  // 1) 잡 배치 스캔 → qid -> 원본 question 객체(첫 등장).
  const byQid = new Map<string, Pair>();
  let cursor: string | undefined;
  for (;;) {
    const jobs: Array<{
      id: string;
      academyId: string;
      passageId: string | null;
      generationPlan: string | null;
      result: unknown;
    }> = await prisma.workbenchAiJob.findMany({
      where: { result: { not: undefined } },
      select: { id: true, academyId: true, passageId: true, generationPlan: true, result: true },
      orderBy: { id: "asc" },
      take: 400,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (jobs.length === 0) break;
    cursor = jobs[jobs.length - 1].id;
    for (const job of jobs) {
      stats.jobsScanned++;
      const result = job.result as Record<string, unknown> | null;
      if (!isObj(result)) continue;
      const qs = result.questions;
      const ids = result.questionIds;
      if (!Array.isArray(qs) || !Array.isArray(ids) || qs.length !== ids.length) continue;
      for (let i = 0; i < ids.length; i++) {
        const qid = ids[i];
        const q = qs[i];
        if (typeof qid !== "string" || !isObj(q)) continue;
        if (byQid.has(qid)) continue;
        byQid.set(qid, { q, academyId: job.academyId, passageId: job.passageId, rawPlan: job.generationPlan });
      }
    }
  }
  stats.distinctQids = byQid.size;

  // 2) 살아있는/이미존재 id 제외 → dead(복구대상)만. (이미 휴지통에 넣은 것도 questions 에 존재하므로 제외됨)
  const allQids = [...byQid.keys()];
  const present = new Set<string>();
  for (const c of chunk(allQids, 1000)) {
    const rows = await prisma.question.findMany({ where: { id: { in: c } }, select: { id: true } });
    rows.forEach((r) => present.add(r.id));
  }
  stats.alreadyLive = present.size;
  const dead = allQids.filter((id) => !present.has(id));
  stats.deadRecoverable = dead.length;

  // 3) passage 존재 여부.
  const passageIds = [...new Set(dead.map((id) => byQid.get(id)!.passageId).filter((p): p is string => !!p))];
  const existingPassages = new Set<string>();
  for (const c of chunk(passageIds, 1000)) {
    const rows = await prisma.passage.findMany({ where: { id: { in: c } }, select: { id: true } });
    rows.forEach((r) => existingPassages.add(r.id));
  }

  // 4) 재구성 → bulk INSERT.
  const questionRows: Record<string, unknown>[] = [];
  const explanationRows: Record<string, unknown>[] = [];
  for (const qid of dead) {
    const { q, academyId, passageId, rawPlan } = byQid.get(qid)!;
    const plan = normalizeQuestionGenerationPlan((q._generationPlan as string) ?? rawPlan ?? undefined);
    const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);
    const enriched = { ...q, _generationPlan: plan, tags };
    const options = q.options;
    const explanation = q.explanation;
    questionRows.push({
      id: qid,
      academyId,
      passageId: passageId && existingPassages.has(passageId) ? passageId : null,
      type: Array.isArray(options) ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
      subType: typeof q._typeId === "string" ? q._typeId : typeof q.subType === "string" ? q.subType : null,
      questionText: buildGeneratedQuestionText(q),
      structuredData: JSON.parse(JSON.stringify(enriched)),
      options: Array.isArray(options) ? JSON.stringify(options) : null,
      correctAnswer:
        typeof q.correctAnswer === "string" ? q.correctAnswer : typeof q.modelAnswer === "string" ? q.modelAnswer : "",
      points: 1,
      difficulty: typeof q.difficulty === "string" ? q.difficulty : "INTERMEDIATE",
      tags: JSON.stringify(tags),
      aiGenerated: true,
      approved: false,
      deletedAt: now,
      deletedById: null,
    });
    if (typeof explanation === "string" && explanation.trim()) {
      explanationRows.push({
        questionId: qid,
        content: explanation,
        keyPoints:
          q.keyPoints == null ? null : typeof q.keyPoints === "string" ? q.keyPoints : JSON.stringify(q.keyPoints),
        wrongOptionExplanations:
          q.wrongOptionExplanations == null
            ? null
            : typeof q.wrongOptionExplanations === "string"
              ? q.wrongOptionExplanations
              : JSON.stringify(q.wrongOptionExplanations),
        aiGenerated: true,
      });
    }
    stats.perAcademy[academyId] = (stats.perAcademy[academyId] ?? 0) + 1;
  }

  if (EXECUTE) {
    for (const c of chunk(questionRows, 500)) {
      const r = await prisma.question.createMany({ data: c as never, skipDuplicates: true });
      stats.questionsInserted += r.count;
      stats.questionsSkipped += c.length - r.count;
      console.log(`  questions +${r.count} (skip ${c.length - r.count})`);
    }
    for (const c of chunk(explanationRows, 500)) {
      const r = await prisma.questionExplanation.createMany({ data: c as never, skipDuplicates: true });
      stats.explanationsInserted += r.count;
      console.log(`  explanations +${r.count}`);
    }
  } else {
    stats.questionsInserted = questionRows.length;
    stats.explanationsInserted = explanationRows.length;
  }

  console.log(JSON.stringify({ mode: EXECUTE ? "EXECUTE" : "DRY_RUN", ...stats }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
