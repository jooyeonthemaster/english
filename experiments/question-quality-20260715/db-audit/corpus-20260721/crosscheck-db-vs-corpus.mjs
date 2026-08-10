// 결정적 대조: 어제 DB에서 확정·수정한 오염 원문이 코퍼스에서는 어떤 상태인가?
// corpus 에 오염어가 남아 있으면 → 코퍼스가 오염 원본(상류)
// corpus 가 이미 깨끗하면 → hasDeliberateError 는 "오류 유형 출신" 표시일 뿐 현재 텍스트 상태가 아님
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const corpus = JSON.parse(fs.readFileSync(path.join(root, "src/data/exam-passages/passages.json"), "utf8"));
const backup = JSON.parse(
  fs.readFileSync(path.join(root, "experiments/question-quality-20260715/passage-fix-backup-20260721-campaign.json"), "utf8"),
);

const norm = (s) => s.replace(/[^A-Za-z]+/g, " ").toLowerCase().trim().replace(/\s+/g, " ");
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 3));
const overlap = (a, b) => {
  let i = 0;
  for (const w of a) if (b.has(w)) i++;
  return i / Math.min(a.size, b.size || 1);
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (t) => new RegExp(`(?<![A-Za-z])${esc(t)}(?![A-Za-z])`);

const corpusWords = corpus.map((c) => ({ c, w: words(c.text) }));
const seen = new Set();
const rows = [];
let matched = 0, unmatched = 0;

for (const b of backup) {
  const key = norm(b.contentBefore).slice(0, 120);
  if (seen.has(key)) continue;
  seen.add(key);
  const bw = words(b.contentBefore);
  let best = null, bs = 0;
  for (const { c, w } of corpusWords) {
    const s = overlap(bw, w);
    if (s > bs) { bs = s; best = c; }
  }
  if (bs < 0.75) { unmatched++; continue; }
  matched++;
  const pairs = [...b.fixes.matchAll(/"([^"]+)"→"([^"]*)"/g)].map((m) => ({ from: m[1], to: m[2] }));
  for (const p of pairs) {
    const has = wordRe(p.from).test(best.text);
    rows.push({
      corpusId: best.id, type: best.type, flag: best.hasDeliberateError,
      recon: best.reconstructionKind, fix: `${p.from} → ${p.to}`,
      corpusHasPlanted: has, sim: Number(bs.toFixed(2)),
    });
  }
}

const dirty = rows.filter((r) => r.corpusHasPlanted);
const clean = rows.filter((r) => !r.corpusHasPlanted);
console.log(`백업 고유 지문 중 코퍼스 매칭: ${matched} (미매칭 ${unmatched})`);
console.log(`  ★ 코퍼스에 오염어 잔존(DIRTY): ${dirty.length}`);
console.log(`  ★ 코퍼스는 이미 깨끗(clean):   ${clean.length}\n`);
for (const r of rows.sort((a, b) => Number(b.corpusHasPlanted) - Number(a.corpusHasPlanted))) {
  console.log(`${r.corpusHasPlanted ? "DIRTY" : "clean"}  ${String(r.type).padEnd(12)} flag=${String(r.flag).padEnd(5)} ${r.corpusId.padEnd(26)} ${r.fix}`);
}
fs.writeFileSync(
  path.join(root, "experiments/question-quality-20260715/db-audit/corpus-20260721/crosscheck.json"),
  JSON.stringify(rows, null, 2),
);
