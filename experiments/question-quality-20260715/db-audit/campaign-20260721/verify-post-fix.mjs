// 사후 검증: 수정된 68행을 재조회해 (1)교정문이 실재하는지 (2)남은 동일 단어가 정당한 자리인지 축자 확인
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

const backup = JSON.parse(
  fs.readFileSync(path.join(root, "experiments/question-quality-20260715/passage-fix-backup-20260721-campaign.json"), "utf8"),
);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (t) => new RegExp(`(?<![A-Za-z])${esc(t)}(?![A-Za-z])`, "g");

let pass = 0, fail = 0;
const leftovers = [];
for (const b of backup) {
  const row = await prisma.passage.findUnique({ where: { id: b.id }, select: { id: true, content: true } });
  if (!row) { console.log(`✗ MISSING ROW ${b.id}`); fail++; continue; }
  // 백업 대비 실제 변경분 확인
  if (row.content === b.contentBefore) { console.log(`✗ UNCHANGED ${b.id} (${b.groupId})`); fail++; continue; }
  // fixes 문자열에서 각 교정 추출
  const pairs = [...b.fixes.matchAll(/"([^"]+)"→"([^"]*)"/g)].map((m) => ({ from: m[1], to: m[2] }));
  let rowOk = true;
  for (const p of pairs) {
    if (!row.content.includes(p.to.trim()) && p.to.trim()) { console.log(`✗ CORRECTION ABSENT ${b.id} (${b.groupId}) "${p.to}"`); rowOk = false; }
    const rest = (row.content.match(wordRe(p.from)) || []).length;
    if (rest > 0) {
      // 남은 출현이 정당한지 문맥 축자 출력
      const re = wordRe(p.from);
      let m2;
      while ((m2 = re.exec(row.content)) !== null) {
        leftovers.push({
          id: b.id, groupId: b.groupId, word: p.from,
          ctx: row.content.slice(Math.max(0, m2.index - 60), m2.index + p.from.length + 60).replace(/\s+/g, " "),
        });
      }
    }
  }
  if (rowOk) pass++; else fail++;
}
console.log(`\n=== rows verified: ${pass} pass / ${fail} fail (of ${backup.length}) ===`);
console.log(`\n=== 잔존 동일 단어 출현 ${leftovers.length}건 — 정당성 축자 확인 ===`);
for (const l of leftovers) console.log(`${l.groupId} ${l.id} "${l.word}": …${l.ctx}…`);

// 캠페인 전체 재스캔: 교정 대상 문자열이 DB 어디에도 남지 않았는지 그룹 전수 확인
console.log(`\n=== 그룹 전수 잔존 스캔 ===`);
const DIR = path.join(root, "experiments/question-quality-20260715/db-audit/campaign-20260721");
const groups = JSON.parse(fs.readFileSync(path.join(DIR, "groups-final.json"), "utf8"));
const fixes = JSON.parse(fs.readFileSync(path.join(DIR, "confirmed-fixes.json"), "utf8"));
const byId = new Map(groups.map((g) => [g.groupId, g]));
let residualSpans = 0;
for (const fix of fixes) {
  const g = byId.get(fix.groupId);
  const rows = await prisma.passage.findMany({ where: { id: { in: g.memberIds } }, select: { id: true, content: true } });
  // 결함 발췌(공백 관용)가 아직 남은 행이 있는지
  const tokens = fix.plantedExcerpt.replace(/[­​]/g, "").replace(/[①-⑳]/g, " ").trim().split(/\s+/).map(esc);
  const exRe = new RegExp(tokens.join("(?:[\\s\\u00AD\\u200B]|[①-⑳])+"), "g");
  const hits = rows.filter((r) => exRe.test(r.content));
  if (hits.length) {
    console.log(`✗ DEFECT SPAN REMAINS ${fix.groupId} "${fix.plantedText}": ${hits.map((h) => h.id).join(", ")}`);
    residualSpans += hits.length;
  }
}
console.log(residualSpans === 0 ? "✓ 결함 발췌 잔존 0 — 전 사본 정리 완료" : `✗ ${residualSpans} spans remain`);
await prisma.$disconnect();
