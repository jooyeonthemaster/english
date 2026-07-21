// 읽기 전용: 오염 지문 3건의 현재 DB 상태 검증 + 동일 지문 사본 탐색
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import(
  "file:///" + root + "/node_modules/@prisma/client/default.js"
);
const prisma = new PrismaClient();

const targets = [
  {
    id: "cmrs251gp000dja0apyfs37lt",
    probes: ["distinguishable", "indistinguishable"],
  },
  {
    id: "cmrs0c609000pks0al5760lii",
    probes: ["conditions which", "conditions in which"],
  },
  {
    id: "cmrs0c5z9000dks0and5u4f19",
    probes: ["necessitates", "resolve the workforce", "workforce"],
  },
];

for (const t of targets) {
  const p = await prisma.passage.findUnique({
    where: { id: t.id },
    select: {
      id: true,
      title: true,
      academyId: true,
      tags: true,
      content: true,
      updatedAt: true,
    },
  });
  if (!p) {
    console.log(`\n=== ${t.id}: NOT FOUND ===`);
    continue;
  }
  console.log(`\n=== ${p.id} | ${p.title} | academy=${p.academyId} | updated=${p.updatedAt.toISOString()} ===`);
  console.log(`tags: ${JSON.stringify(p.tags).slice(0, 200)}`);
  for (const probe of t.probes) {
    const idx = p.content.indexOf(probe);
    if (idx < 0) {
      console.log(`  probe "${probe}": ABSENT`);
    } else {
      console.log(
        `  probe "${probe}": @${idx} …${p.content.slice(Math.max(0, idx - 90), idx + probe.length + 90).replace(/\s+/g, " ")}…`,
      );
    }
  }
  // 같은 지문의 다른 사본(제목 or 앞 80자 일치) — 깨끗한 원문 참조용
  const head = p.content.replace(/\s+/g, " ").trim().slice(0, 60);
  const dupes = await prisma.passage.findMany({
    where: {
      id: { not: p.id },
      OR: [{ title: p.title }, { content: { contains: head.slice(0, 40) } }],
    },
    select: { id: true, title: true, academyId: true },
    take: 8,
  });
  console.log(`  dupes: ${dupes.length ? dupes.map((d) => `${d.id}(${d.title})`).join(", ") : "none"}`);
}
await prisma.$disconnect();
