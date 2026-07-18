/** span-carve 게이트 오탐 스캔(읽기 전용): DB의 기존 빈칸 문항 전체에
 *  findBlankSpanCarveIssues 를 돌려 발동률·발동 문항을 보고한다. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { findBlankSpanCarveIssues } from "../../../../src/lib/question-quality/validators/blank/span-carve";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const questions = await prisma.question.findMany({
    where: { subType: "BLANK_INFERENCE", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, createdAt: true, difficulty: true, structuredData: true, tags: true },
  });
  console.log(`scanned blank questions: ${questions.length}`);
  let flagged = 0;
  const byCode = new Map<string, number>();
  for (const q of questions) {
    const sd = typeof q.structuredData === "string"
      ? JSON.parse(q.structuredData)
      : (q.structuredData as Record<string, unknown> | null);
    if (!sd) continue;
    const optsForCorrect = Array.isArray(sd.options) ? sd.options : [];
    const correctOpt = optsForCorrect.find(
      (o: Record<string, unknown>) => String(o?.label) === String(sd.correctAnswer),
    );
    const findings = findBlankSpanCarveIssues(
      typeof sd.passageWithBlank === "string" ? sd.passageWithBlank : undefined,
      typeof sd.originalExpression === "string" ? sd.originalExpression : undefined,
      typeof correctOpt?.text === "string" ? correctOpt.text : undefined,
    );
    if (findings.length > 0) {
      flagged += 1;
      for (const f of findings) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
      console.log(`FLAG ${q.id} ${q.createdAt.toISOString().slice(0, 10)} ${q.difficulty} ${findings.map((f) => f.code).join(",")}`);
      console.log(`  evidence: ${JSON.stringify(findings[0]!.evidence).slice(0, 220)}`);
      const opts = Array.isArray(sd.options) ? sd.options : [];
      const correct = opts.find((o: Record<string, unknown>) => String(o?.label) === String(sd.correctAnswer));
      if (correct) console.log(`  correctOption: "${String(correct.text).slice(0, 110)}"`);
    }
  }
  console.log(`\nflagged: ${flagged}/${questions.length} (${((100 * flagged) / questions.length).toFixed(1)}%)`);
  for (const [code, n] of byCode) console.log(`  ${code}: ${n}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
