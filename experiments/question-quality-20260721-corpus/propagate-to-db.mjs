// 코퍼스 복원분(291건)을 DB 사본에 전파.
// 코퍼스 레코드의 plantedError.excerpt 를 DB passages 전수에서 찾아, 같은 절차로 교정.
// 사용: node propagate-to-db.mjs [--dry]
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
const DRY = process.argv.includes("--dry");
const OUT = path.join(root, "experiments/question-quality-20260721-corpus");

const corpus = JSON.parse(fs.readFileSync(path.join(root, "src/data/exam-passages/passages.json"), "utf8"));
const restored = corpus.filter((c) => c.plantedError);
console.log(`코퍼스 복원 레코드: ${restored.length}`);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TYPO = [[/['‘’ʼ]/g, "['‘’ʼ]"], [/["“”]/g, '["“”]'], [/[-‐‑‒–—―−]/g, "[-‐‑‒–—―−]"]];
const typo = (s) => TYPO.reduce((a, [re, cls]) => a.replace(re, cls), s);
const wordRe = (t, f = "g") => new RegExp(`(?<![A-Za-z])${typo(esc(t))}(?![A-Za-z])`, f);
const excerptRe = (ex) =>
  new RegExp(ex.replace(/[­​]/g, "").trim().split(/\s+/).map((t) => typo(esc(t))).join("(?:[\\s\\u00AD\\u200B]|[①-⑳])+"), "g");
const count = (s, re) => (s.match(re) || []).length;

console.log("DB 지문 전수 로드…");
const all = await prisma.passage.findMany({ select: { id: true, title: true, academyId: true, content: true } });
console.log(`DB passages: ${all.length}`);

const planned = [];
const skipped = [];
for (const rec of restored) {
  const pe = rec.plantedError;
  const exRe = excerptRe(pe.excerpt);
  for (const row of all) {
    exRe.lastIndex = 0;
    const spans = [...row.content.matchAll(excerptRe(pe.excerpt))];
    if (spans.length === 0) continue;
    if (spans.length > 1) { skipped.push({ id: row.id, corpusId: rec.id, why: `EXCERPT_HITS=${spans.length}` }); continue; }
    const span = spans[0][0];
    const inSpan = count(span, wordRe(pe.planted));
    if (inSpan !== 1) { skipped.push({ id: row.id, corpusId: rec.id, why: `WORD_IN_SPAN=${inSpan}` }); continue; }
    const fixedSpan = span.replace(wordRe(pe.planted, ""), pe.original);
    planned.push({
      id: row.id, title: row.title, academyId: row.academyId, corpusId: rec.id,
      planted: pe.planted, original: pe.original,
      before: row.content, after: row.content.replace(span, fixedSpan),
    });
  }
}
console.log(`\n전파 대상 DB 행: ${planned.length} (스킵 ${skipped.length})`);
const byCorpus = {};
for (const p of planned) byCorpus[p.corpusId] = (byCorpus[p.corpusId] || 0) + 1;
console.log(`영향 코퍼스 지문 수: ${Object.keys(byCorpus).length}`);
for (const p of planned.slice(0, 20)) {
  console.log(`  ${p.id} "${String(p.title).slice(0, 26)}" ← ${p.corpusId}: "${p.planted}"→"${p.original}"`);
}
if (planned.length > 20) console.log(`  … 외 ${planned.length - 20}행`);
for (const s of skipped.slice(0, 10)) console.log(`  SKIP ${s.id} (${s.corpusId}): ${s.why}`);

if (DRY) { console.log("\nDRY-RUN — 미적용"); await prisma.$disconnect(); process.exit(0); }
if (planned.length === 0) { console.log("전파 대상 없음."); await prisma.$disconnect(); process.exit(0); }

const backupPath = path.join(root, "experiments/question-quality-20260715/passage-fix-backup-20260721-corpus-propagate.json");
fs.writeFileSync(backupPath, JSON.stringify(
  planned.map((p) => ({ id: p.id, title: p.title, academyId: p.academyId, corpusId: p.corpusId, contentBefore: p.before, fix: `"${p.planted}"→"${p.original}"` })), null, 2));
console.log(`\n백업: ${path.basename(backupPath)} (${planned.length}행)`);

let n = 0;
for (const p of planned) { await prisma.passage.update({ where: { id: p.id }, data: { content: p.after } }); n++; }
console.log(`적용: ${n}행`);

let bad = 0;
for (const p of planned) {
  const r = await prisma.passage.findUnique({ where: { id: p.id }, select: { content: true } });
  if (!r || r.content !== p.after) { console.log(`✗ MISMATCH ${p.id}`); bad++; }
}
console.log(bad === 0 ? `✓ 재검증 ${n}/${n} pass` : `✗ ${bad}건 문제`);
fs.writeFileSync(path.join(OUT, "db-propagation.json"), JSON.stringify({ applied: n, skipped }, null, 2));
await prisma.$disconnect();
