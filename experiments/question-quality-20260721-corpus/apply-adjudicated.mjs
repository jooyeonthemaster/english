// 조정 결과 적용: DEFECT 40 복원 / CLEAN 12 플래그 교정 / UNRESOLVED 3 보존
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const CORPUS = path.join(root, "src/data/exam-passages/passages.json");
const OUT = path.join(root, "experiments/question-quality-20260721-corpus");
const DRY = process.argv.includes("--dry");

const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const adj = JSON.parse(fs.readFileSync(path.join(OUT, "adj-results.json"), "utf8"));
const byId = new Map(corpus.map((c) => [c.id, c]));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TYPO = [[/['‘’ʼ]/g, "['‘’ʼ]"], [/["“”]/g, '["“”]'], [/[-‐‑‒–—―−]/g, "[-‐‑‒–—―−]"]];
const typo = (s) => TYPO.reduce((a, [re, cls]) => a.replace(re, cls), s);
const wordRe = (t, f = "g") => new RegExp(`(?<![A-Za-z])${typo(esc(t))}(?![A-Za-z])`, f);
const excerptRe = (ex) =>
  new RegExp(ex.replace(/[­​]/g, "").trim().split(/\s+/).map((t) => typo(esc(t))).join("[\\s\\u00AD\\u200B]+"), "g");
const count = (s, re) => (s.match(re) || []).length;

// 게이트-C 승인분만 적용 (1차에서 갈렸던 난케이스라 회의적 게이트를 별도로 통과시켰다)
const gateC = JSON.parse(fs.readFileSync(path.join(OUT, "gateC-results.json"), "utf8"));
const gcApproved = new Set(gateC.approvedIds);
const gcRejected = new Set(gateC.rejectedList.map((r) => r.id));
console.log(`게이트-C: 승인 ${gateC.approved} / 거부 ${gateC.rejected}`);

const planned = [], skipped = [];
for (const d of adj.defect.filter((x) => gcApproved.has(x.id) && !gcRejected.has(x.id))) {
  const rec = byId.get(d.id);
  if (!rec) { skipped.push({ id: d.id, why: "NOT_IN_CORPUS" }); continue; }
  const text = rec.text;
  const spans = [...text.matchAll(excerptRe(d.plantedExcerpt))];
  let after = null, how = null;
  if (spans.length === 1) {
    const span = spans[0][0];
    if (count(span, wordRe(d.plantedText)) === 1) {
      after = text.replace(span, span.replace(wordRe(d.plantedText, ""), d.correctedText));
      how = "excerpt-anchored";
    }
  }
  if (!after) {
    const wc = count(text, wordRe(d.plantedText));
    if (wc === 1) { after = text.replace(wordRe(d.plantedText, ""), d.correctedText); how = "word-1hit"; }
  }
  if (!after) { skipped.push({ id: d.id, why: `no-safe-anchor (excerpt=${spans.length})`, planted: d.plantedText }); continue; }
  planned.push({ id: d.id, how, before: text, after, d });
}

function ctx(b, a, pad = 45) {
  let s = 0; while (s < b.length && s < a.length && b[s] === a[s]) s++;
  let e = 0; while (e < b.length - s && e < a.length - s && b[b.length - 1 - e] === a[a.length - 1 - e]) e++;
  return `…${b.slice(Math.max(0, s - pad), s)}⟦${b.slice(s, b.length - e)} ⇒ ${a.slice(s, a.length - e)}⟧${b.slice(b.length - e, b.length - e + pad)}…`.replace(/\s+/g, " ");
}
console.log(`조정 DEFECT ${adj.defect.length} → 적용 ${planned.length} / 스킵 ${skipped.length}`);
for (const p of planned) console.log(`  ${p.id} [${p.d.votes}] ${ctx(p.before, p.after)}`);
for (const s of skipped) console.log(`  SKIP ${s.id}: ${s.why} ${s.planted ? `"${s.planted}"` : ""}`);
console.log(`\nCLEAN 12 플래그 교정 / UNRESOLVED ${adj.unresolved.length} 보존`);

if (DRY) { console.log("\nDRY-RUN — 미적용"); process.exit(0); }

fs.copyFileSync(CORPUS, path.join(OUT, "passages.json.backup-20260721-adj"));
for (const p of planned) {
  const rec = byId.get(p.id);
  rec.text = p.after;
  rec.plantedError = {
    planted: p.d.plantedText, original: p.d.correctedText, excerpt: p.d.plantedExcerpt,
    verifiedBy: `adjudicated-3way(${p.d.votes})`, restoredAt: "2026-07-21",
  };
  rec.hasDeliberateError = false;
}
for (const c of adj.clean) {
  const rec = byId.get(c.id);
  if (rec) { rec.hasDeliberateError = false; rec.errorAudit = `clean-verified-adjudicated-20260721(${c.votes})`; }
}
for (const u of adj.unresolved) {
  const rec = byId.get(u.id);
  if (rec) rec.errorAudit = "UNRESOLVED-20260721: judges disagree, left untouched";
}
fs.writeFileSync(CORPUS, JSON.stringify(corpus));

const re = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const rById = new Map(re.map((c) => [c.id, c]));
let bad = 0;
for (const p of planned) {
  const r = rById.get(p.id);
  if (r.text !== p.after || !r.plantedError) { console.log(`✗ ${p.id}`); bad++; }
}
console.log(`\n적용 ${planned.length}건 | 재검증 ${bad === 0 ? "pass" : bad + "건 실패"}`);
console.log(`레코드 ${re.length} | hasDeliberateError=true 잔여 ${re.filter((x) => x.hasDeliberateError).length}`);
console.log(`plantedError 총 보유: ${re.filter((x) => x.plantedError).length}`);
fs.writeFileSync(path.join(OUT, "applied-adjudicated.json"), JSON.stringify({ planned: planned.map((p) => ({ id: p.id, votes: p.d.votes, planted: p.d.plantedText, original: p.d.correctedText })), skipped }, null, 2));
