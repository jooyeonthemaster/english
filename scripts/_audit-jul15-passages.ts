import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

const IDS = [
  "cmrknyvof0010mm2wmidkbdn9", // Kant
  "cmr8z7c3h007smm0s9gfw34jf", // dress history
  "cmr8z7a4v006smm0sgrzrvxt6", // style guide
  "cmrknegao000nmm2wka3fiox0", // good ancestor
  "cmr3blkb9002ummf06jqvcn1u", // plants
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const ps = await prisma.passage.findMany({
    where: { id: { in: IDS } },
    select: { id: true, title: true, content: true, source: true, createdAt: true },
  });
  for (const p of ps) {
    const c = p.content;
    console.log("─".repeat(90));
    console.log(`${p.id.slice(-6)} | ${p.title} | source=${p.source ?? "-"} | ${p.createdAt.toISOString()}`);
    console.log("  이중마침표('..'):", /\.\.(?!\.)/.test(c) ? "있음 ⚠" : "없음");
    const bad = c.match(/[^.]*it is unlikely[^.]*\./);
    if (bad) console.log("  의심문장:", bad[0].trim());
    const dq = c.match(/\s{2,}/) ? "이중공백 있음" : "-";
    console.log("  기타:", dq);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
