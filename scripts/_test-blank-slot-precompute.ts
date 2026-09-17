// 자리 사전계산 분석기 검증 (O231) — 상한 프로브 정답지 대조. API 0콜.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { analyzeBlankSlots, buildBlankSlotBlock } from "../src/lib/md-qgen/blank-slot-precompute";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const rows = await prisma.passage.findMany({
    where: { id: { in: ["cmruw7b2m0049mml48s8e5p2h", "cmsqwfxas0009i304m8gvfa23"] } },
    select: { id: true, title: true, content: true },
  });
  let pass = 0, fail = 0;
  const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log("PASS", n); } else { fail++; console.error("FAIL", n, d ?? ""); } };
  for (const p of rows) {
    const a = analyzeBlankSlots(p.content);
    console.log(`\n===== ${p.title}`);
    for (const c of a.candidates) console.log(` 후보 [S${c.sentenceIndex}] "${c.clause.slice(0, 70)}" echo=[${c.echoWords}] support=${c.supportSentences}`);
    for (const w of a.worst) console.log(` 금지 [S${w.sentenceIndex}] "${w.clause.slice(0, 60)}" echo=[${w.echoWords}]`);
    if (p.id === "cmruw7b2m0049mml48s8e5p2h") {
      // C1 정답지: 승자 자리 = "you have more needs than you really have"(믿음 내용절).
      // 기계가 골랐던 나쁜 자리 = 마지막 문장("cannot be attributed ... builds up").
      check("C1: 승자 문장(S7 needs 문장)이 후보에 있음", a.candidates.some((c) => /needs/.test(c.clause)),
        JSON.stringify(a.candidates.map((c) => c.clause.slice(0, 40))));
      check("C1: 마지막 재진술 문장은 후보 아님", !a.candidates.some((c) => /attributed|drip/.test(c.clause)));
    } else {
      // C2 정답지: 기계 나쁜 자리 = "allows us to put an objective value..."(직후 2문장이 축자 재진술).
      // 승자 자리 = 무의식 기제 문장(completely without your conscious mind ...).
      check("C2: objective value 자리는 1순위 아님 또는 어휘 경고 동봉", (() => { const ov = a.candidates.findIndex((c) => /objective value/.test(c.clause)); if (ov < 0) return true; const c = a.candidates[ov]; return ov > 0 && c.echoWords.some((w) => /objective|subjective/.test(w)); })(),
        JSON.stringify(a.candidates.map((c) => c.clause.slice(0, 40))));
      check("C2: 승자 계열 자리(conscious/sweat 기제)가 후보에 있음", a.candidates.some((c) => /conscious|sweat|subconscious/.test(c.clause)),
        JSON.stringify(a.candidates.map((c) => c.clause.slice(0, 40))));
    }
    const block = buildBlankSlotBlock(a);
    check(`${p.id.slice(-4)}: 블록 생성`, block.length > 100);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
