/** T10 SENTENCE_ORDER 무손실 분할 게이트 오탐 스캔(읽기 전용): DB의 기존 수락
 *  SENTENCE_ORDER 문항에 findSentenceOrderSourceCoverageIssues 를 돌려 발동률·발동
 *  문항을 보고한다(원문 = passageId→Passage.content). fp-scan-span-carve.ts 패턴. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { findSentenceOrderSourceCoverageIssues } from "../../../../src/lib/question-quality/validators/sentence-order";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const questions = await prisma.question.findMany({
    where: { subType: "SENTENCE_ORDER", deletedAt: null, passageId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      createdAt: true,
      difficulty: true,
      structuredData: true,
      passage: { select: { content: true } },
    },
  });
  console.log(`scanned SENTENCE_ORDER questions (with passage): ${questions.length}`);

  let analyzable = 0;
  let flagged = 0;
  const byCode = new Map<string, number>();
  for (const q of questions) {
    const sd =
      typeof q.structuredData === "string"
        ? JSON.parse(q.structuredData)
        : (q.structuredData as Record<string, unknown> | null);
    const passage = q.passage?.content;
    if (!sd || !passage) continue;
    // 게이트 전제(3단락 verbatim-backed)를 만족하는 문항만 분석 대상으로 집계.
    const paras = Array.isArray(sd.paragraphs) ? sd.paragraphs : [];
    if (paras.length === 3) analyzable += 1;

    const findings = findSentenceOrderSourceCoverageIssues(
      sd.paragraphs,
      passage,
    );
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
    `\nflagged: ${flagged}/${questions.length} scanned (${((100 * flagged) / questions.length).toFixed(1)}%); analyzable(3-para)=${analyzable}, flagged/analyzable=${((100 * flagged) / Math.max(1, analyzable)).toFixed(1)}%`,
  );
  for (const [code, n] of byCode) console.log(`  ${code}: ${n}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
