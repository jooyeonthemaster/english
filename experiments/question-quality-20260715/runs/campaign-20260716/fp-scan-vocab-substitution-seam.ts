/** vocab-substitution-seam 게이트 오탐 스캔(읽기 전용): DB의 기존 VOCAB_CHOICE 문항에
 *  findVocabSubstitutionSeamIssues 를 돌려 발동률·발동 문항을 보고한다. 원문 대조(class 2)를
 *  위해 passageId 로 Passage.content 도 읽는다. DB 는 findMany 만(쓰기 없음). */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { findVocabSubstitutionSeamIssues } from "../../../../src/lib/question-quality/validators/vocab/substitution-seam";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const questions = await prisma.question.findMany({
    where: { subType: "VOCAB_CHOICE", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      createdAt: true,
      difficulty: true,
      structuredData: true,
      passageId: true,
    },
  });
  console.log(`scanned VOCAB_CHOICE questions: ${questions.length}`);

  // 원문 대조용 Passage.content 배치 조회(읽기 전용).
  const passageIds = [
    ...new Set(questions.map((q) => q.passageId).filter((id): id is string => !!id)),
  ];
  const passages = await prisma.passage.findMany({
    where: { id: { in: passageIds } },
    select: { id: true, content: true },
  });
  const passageById = new Map(passages.map((p) => [p.id, p.content]));

  let flagged = 0;
  const byCode = new Map<string, number>();
  for (const q of questions) {
    const sd =
      typeof q.structuredData === "string"
        ? JSON.parse(q.structuredData)
        : (q.structuredData as Record<string, unknown> | null);
    if (!sd) continue;
    const passageWithMarkers =
      typeof sd.passageWithMarkers === "string" ? sd.passageWithMarkers : undefined;
    const passage = q.passageId ? passageById.get(q.passageId) : undefined;
    const vocabDisplayMode =
      typeof sd.vocabDisplayMode === "string" ? sd.vocabDisplayMode : undefined;

    const findings = findVocabSubstitutionSeamIssues(
      sd.markedWords,
      passageWithMarkers,
      passage ?? undefined,
      vocabDisplayMode,
    );
    if (findings.length > 0) {
      flagged += 1;
      for (const f of findings) byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
      console.log(
        `\nFLAG ${q.id} ${q.createdAt.toISOString().slice(0, 10)} ${q.difficulty} mode=${vocabDisplayMode ?? "?"} ${findings
          .map((f) => f.code)
          .join(",")}`,
      );
      for (const f of findings) {
        console.log(`  evidence: ${JSON.stringify(f.evidence)}`);
      }
      // 마커 문맥을 직접 열람할 수 있게 정답 밑줄 주변을 출력.
      if (passageWithMarkers) {
        const answers = Array.isArray(sd.markedWords)
          ? sd.markedWords.filter(
              (w: Record<string, unknown>) => w?.isInappropriate === true,
            )
          : [];
        for (const a of answers) {
          const sub =
            (typeof a.substituteWord === "string" && a.substituteWord) ||
            (typeof a.word === "string" && a.word) ||
            "";
          if (!sub) continue;
          const idx = passageWithMarkers.indexOf(sub);
          if (idx >= 0) {
            console.log(
              `  ctx: ...${passageWithMarkers.slice(Math.max(0, idx - 40), idx + sub.length + 40)}...`,
            );
          }
        }
      }
    }
  }
  console.log(
    `\nflagged: ${flagged}/${questions.length} (${((100 * flagged) / (questions.length || 1)).toFixed(2)}%)`,
  );
  for (const [code, n] of byCode) console.log(`  ${code}: ${n}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
