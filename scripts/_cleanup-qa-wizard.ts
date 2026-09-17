/** QA 잔재 정리 — [QA] 접두 과제 3층 + [QA] 접두 덱 전부 삭제 */
import * as fs from "node:fs";
import * as path from "node:path";
for (const line of fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const asg = await prisma.studyAssignment.findMany({
    where: { title: { startsWith: "[QA]" } },
    select: { id: true, title: true },
  });
  const ids = asg.map((a) => a.id);
  const bridges = await prisma.vocabDrillAssignment.deleteMany({
    where: { assignmentId: { in: ids } },
  });
  const tasks = await prisma.studyAssignmentTask.deleteMany({
    where: { assignmentId: { in: ids } },
  });
  const assignments = await prisma.studyAssignment.deleteMany({
    where: { id: { in: ids } },
  });
  // [QA] 덱 — 학생 학습 흔적(attempts/progress)이 없는 것만 지운다(안전 가드)
  const decks = await prisma.vocabDrillDeck.findMany({
    where: { title: { startsWith: "[QA]" } },
    select: { id: true },
  });
  const deckIds = decks.map((d) => d.id);
  const attempts = await prisma.vocabDrillAttempt.count({ where: { deckId: { in: deckIds } } });
  const progress = await prisma.vocabDrillDeckProgress.count({ where: { deckId: { in: deckIds } } });
  if (attempts > 0 || progress > 0) {
    console.log(`ABORT deck delete — attempts=${attempts} progress=${progress}`);
  } else {
    const deleted = await prisma.vocabDrillDeck.deleteMany({ where: { id: { in: deckIds } } });
    console.log("decks deleted:", deleted.count);
  }
  console.log(
    "bridges:", bridges.count, "tasks:", tasks.count, "assignments:", assignments.count,
  );
  // 최종 확인
  const remainA = await prisma.studyAssignment.count({ where: { title: { startsWith: "[QA]" } } });
  const remainD = await prisma.vocabDrillDeck.count({ where: { title: { startsWith: "[QA]" } } });
  console.log("remaining [QA] assignments:", remainA, "decks:", remainD);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
