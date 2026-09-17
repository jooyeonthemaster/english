/** 정밀 정리 — 오늘 만든 시리즈([QA] 접두 + spec.series 보유)만. 과거 QA 잔재는 보존 */
import * as fs from "node:fs";
import * as path from "node:path";
for (const line of fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const decks = await prisma.vocabDrillDeck.findMany({
    where: { title: { startsWith: "[QA]" } },
    select: { id: true, title: true, academyId: true, createdAt: true, spec: true },
    orderBy: { createdAt: "asc" },
  });
  const mine: string[] = [];
  for (const d of decks) {
    const series = (d.spec as { series?: { key?: string } } | null)?.series;
    const tag = series ? `series=${series.key}` : "no-series";
    console.log(d.createdAt.toISOString(), "|", d.title, "|", tag, "|", d.academyId.slice(0, 8));
    if (series) mine.push(d.id);
  }
  const attempts = await prisma.vocabDrillAttempt.count({ where: { deckId: { in: mine } } });
  const progress = await prisma.vocabDrillDeckProgress.count({ where: { deckId: { in: mine } } });
  console.log("my series decks:", mine.length, "attempts:", attempts, "progress:", progress);
  if (attempts === 0 && progress === 0 && mine.length) {
    const del = await prisma.vocabDrillDeck.deleteMany({ where: { id: { in: mine } } });
    console.log("deleted:", del.count);
  } else {
    console.log("SKIP delete");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
