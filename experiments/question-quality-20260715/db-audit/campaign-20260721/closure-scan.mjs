// 폐쇄 검사: 확정된 36개 결함 시그니처를 DB 전수(2,892행)에서 재탐색.
// 그룹 밖에 같은 오염 사본이 남아 있는지 = "전수 조사" 주장의 실증 검사.
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const envText = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import("file:///" + root + "/node_modules/@prisma/client/default.js");
const prisma = new PrismaClient();

const DIR = path.join(root, "experiments/question-quality-20260715/db-audit/campaign-20260721");
const fixes = JSON.parse(fs.readFileSync(path.join(DIR, "confirmed-fixes.json"), "utf8"));
const groups = JSON.parse(fs.readFileSync(path.join(DIR, "groups-final.json"), "utf8"));
const byId = new Map(groups.map((g) => [g.groupId, g]));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

console.log("전수 로드 중…");
const all = await prisma.passage.findMany({
  select: { id: true, title: true, academyId: true, subject: true, content: true },
});
console.log(`loaded ${all.length} passages\n`);

let outsideHits = 0;
for (const fix of fixes) {
  const g = byId.get(fix.groupId);
  const known = new Set(g.memberIds);
  const tokens = fix.plantedExcerpt.replace(/[­​]/g, "").replace(/[①-⑳]/g, " ").trim().split(/\s+/).map(esc);
  const exRe = new RegExp(tokens.join("(?:[\\s\\u00AD\\u200B]|[①-⑳])+"));
  const hits = all.filter((p) => !known.has(p.id) && exRe.test(p.content));
  if (hits.length) {
    outsideHits += hits.length;
    console.log(`✗ OUTSIDE-GROUP DEFECT ${fix.groupId} "${fix.plantedText}" → ${hits.length} rows:`);
    for (const h of hits) console.log(`    ${h.id} "${(h.title || "").slice(0, 40)}" academy=${h.academyId}`);
  }
}
console.log(outsideHits === 0 ? "\n✓ 그룹 밖 결함 사본 0 — 사본 수집 완결" : `\n✗ ${outsideHits} rows outside groups still defective`);

// 추가: 교정된 문장이 DB 전체에 몇 행 존재하는지(= 이 지문의 실제 총 사본 수) 대조
console.log("\n=== 교정문 기준 전체 사본 수 (그룹 수집이 놓친 사본이 있는지 역검사) ===");
let extra = 0;
for (const fix of fixes) {
  const g = byId.get(fix.groupId);
  const known = new Set(g.memberIds);
  const corrected = fix.plantedExcerpt
    .replace(/[­​]/g, "")
    .replace(new RegExp(`(?<![A-Za-z])${esc(fix.plantedText)}(?![A-Za-z])`), fix.correctedText);
  const tokens = corrected.replace(/[①-⑳]/g, " ").trim().split(/\s+/).map(esc);
  const cRe = new RegExp(tokens.join("(?:[\\s\\u00AD\\u200B]|[①-⑳])+"));
  const hits = all.filter((p) => cRe.test(p.content));
  const outside = hits.filter((p) => !known.has(p.id));
  if (outside.length) {
    extra += outside.length;
    console.log(`  ${fix.groupId} "${fix.correctedText}": 그룹 밖 정상 사본 ${outside.length}행 — ${outside.map((o) => `${o.id}("${(o.title || "").slice(0, 24)}")`).join(", ")}`);
  }
}
console.log(extra === 0 ? "✓ 그룹 밖 동일 지문 사본 0 — dedup·앵커 확장이 전 사본을 포섭" : `⚠ 그룹 밖 동일 지문(정상) ${extra}행 — 오염은 없으나 수집 범위 밖이었음`);
await prisma.$disconnect();
