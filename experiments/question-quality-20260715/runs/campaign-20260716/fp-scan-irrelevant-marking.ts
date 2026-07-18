/** T10 IRRELEVANT 번호 마킹 형식 게이트 오탐 스캔(읽기 전용): DB의 기존 수락 IRRELEVANT
 *  문항에 findIrrelevantMarkingFormatIssues 를 돌려 발동률·발동 문항을 보고한다.
 *  fp-scan-span-carve.ts 패턴. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { findIrrelevantMarkingFormatIssues } from "../../../../src/lib/question-quality/validators/irrelevant";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const questions = await prisma.question.findMany({
    where: { subType: "IRRELEVANT", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, createdAt: true, difficulty: true, structuredData: true },
  });
  console.log(`scanned IRRELEVANT questions: ${questions.length}`);

  let analyzable = 0;
  let flagged = 0;
  const byCode = new Map<string, number>();
  for (const q of questions) {
    const sd =
      typeof q.structuredData === "string"
        ? JSON.parse(q.structuredData)
        : (q.structuredData as Record<string, unknown> | null);
    if (!sd) continue;
    const sentences = Array.isArray(sd.sentences) ? sd.sentences.map((s: unknown) => String(s)) : [];
    const pwn = typeof sd.passageWithNumbers === "string" ? sd.passageWithNumbers : "";
    const spanCount = (pwn.match(/[①-⑳]\s*__[\s\S]+?__/g) ?? []).length;
    if (spanCount >= 2 && sentences.length > 0) analyzable += 1;

    const findings = findIrrelevantMarkingFormatIssues(sd.passageWithNumbers, sentences);
    if (findings.length > 0) {
      flagged += 1;
      for (const f of findings) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
      console.log(
        `FLAG ${q.id} ${q.createdAt.toISOString().slice(0, 10)} ${q.difficulty} ${findings.map((f) => f.code).join(",")}`,
      );
      console.log(`  evidence: ${JSON.stringify(findings[0]!.evidence).slice(0, 260)}`);
    }
  }
  console.log(
    `\nflagged: ${flagged}/${questions.length} scanned (${((100 * flagged) / questions.length).toFixed(1)}%); analyzable(>=2 __spans__)=${analyzable}`,
  );
  for (const [code, n] of byCode) console.log(`  ${code}: ${n}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
