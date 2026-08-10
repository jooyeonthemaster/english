// 상류 고정: 마스터 passages.jsonl + by-exam/*.json 에도 동일 복원을 적용.
// 이걸 안 하면 build_app_bundle.py 재실행 시 앱 번들의 복원 72건이 되돌아간다.
// 사용: node fix-master.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const BASE = path.join(root, "english-exam-passages");
const MASTER = path.join(BASE, "passages.jsonl");
const BYEXAM = path.join(BASE, "by-exam");
const OUT = path.join(root, "experiments/question-quality-20260721-corpus");
const DRY = process.argv.includes("--dry");

const bundle = JSON.parse(fs.readFileSync(path.join(root, "src/data/exam-passages/passages.json"), "utf8"));
const restored = new Map(bundle.filter((c) => c.plantedError).map((c) => [c.id, c]));
console.log(`앱 번들 복원 레코드: ${restored.size}`);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TYPO = [[/['‘’ʼ]/g, "['‘’ʼ]"], [/["“”]/g, '["“”]'], [/[-‐‑‒–—―−]/g, "[-‐‑‒–—―−]"]];
const typo = (s) => TYPO.reduce((a, [re, cls]) => a.replace(re, cls), s);
const wordRe = (t, f = "g") => new RegExp(`(?<![A-Za-z])${typo(esc(t))}(?![A-Za-z])`, f);
const excerptRe = (ex) =>
  new RegExp(ex.replace(/[­​]/g, "").trim().split(/\s+/).map((t) => typo(esc(t))).join("[\\s\\u00AD\\u200B]+"), "g");
const count = (s, re) => (s.match(re) || []).length;

// 하나의 레코드 텍스트에 복원 적용 (발췌 앵커 우선, 실패 시 단어 1회)
function restore(text, pe) {
  const spans = [...text.matchAll(excerptRe(pe.excerpt))];
  if (spans.length === 1) {
    const span = spans[0][0];
    if (count(span, wordRe(pe.planted)) === 1) {
      return { after: text.replace(span, span.replace(wordRe(pe.planted, ""), pe.original)), how: "excerpt" };
    }
  }
  if (count(text, wordRe(pe.planted)) === 1) {
    return { after: text.replace(wordRe(pe.planted, ""), pe.original), how: "word-1hit" };
  }
  return null;
}

// ── 1) passages.jsonl ──
const lines = fs.readFileSync(MASTER, "utf8").split("\n");
let mFixed = 0, mSkip = 0;
const newLines = lines.map((l) => {
  if (!l.trim()) return l;
  let o;
  try { o = JSON.parse(l); } catch { return l; }
  const c = restored.get(o.passageId);
  if (!c || !o.text) return l;
  if (!wordRe(c.plantedError.planted).test(o.text)) return l; // 이미 깨끗
  const r = restore(o.text, c.plantedError);
  if (!r) { mSkip++; console.log(`  SKIP master ${o.passageId}: "${c.plantedError.planted}" 앵커 불가`); return l; }
  o.text = r.after;
  o.plantedError = { ...c.plantedError };
  o.hasDeliberateError = false;
  mFixed++;
  return JSON.stringify(o);
});
console.log(`\npassages.jsonl: 수정 ${mFixed} / 스킵 ${mSkip}`);

// ── 2) by-exam/*.json ──
const files = fs.readdirSync(BYEXAM).filter((f) => f.endsWith(".json"));
let bFixed = 0, bFiles = 0;
const byExamOut = new Map();
for (const f of files) {
  const p = path.join(BYEXAM, f);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const arr = Array.isArray(data) ? data : data.passages;
  if (!Array.isArray(arr)) continue;
  let touched = 0;
  for (const o of arr) {
    const pid = o.passageId || o.id;
    const c = restored.get(pid);
    if (!c || !o.text) continue;
    if (!wordRe(c.plantedError.planted).test(o.text)) continue;
    const r = restore(o.text, c.plantedError);
    if (!r) { console.log(`  SKIP by-exam ${pid}`); continue; }
    o.text = r.after;
    o.plantedError = { ...c.plantedError };
    o.hasDeliberateError = false;
    touched++; bFixed++;
  }
  if (touched > 0) { byExamOut.set(p, data); bFiles++; }
}
console.log(`by-exam/*.json: 수정 ${bFixed}건 / 파일 ${bFiles}개`);

if (DRY) { console.log("\nDRY-RUN — 미적용"); process.exit(0); }

fs.copyFileSync(MASTER, path.join(OUT, "passages.jsonl.backup-20260721"));
fs.writeFileSync(MASTER, newLines.join("\n"));
for (const [p, data] of byExamOut) {
  const rel = path.basename(p);
  fs.copyFileSync(p, path.join(OUT, `byexam-backup-${rel}`));
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}
console.log(`\n적용 완료. 백업: passages.jsonl.backup-20260721 + byexam-backup-*.json (${bFiles}개)`);

// ── 재검증 ──
const re = fs.readFileSync(MASTER, "utf8").trim().split("\n");
const m2 = new Map();
for (const l of re) { try { const o = JSON.parse(l); m2.set(o.passageId, o); } catch {} }
let bad = 0, checked = 0;
for (const [id, c] of restored) {
  const o = m2.get(id);
  if (!o) continue;
  checked++;
  if (wordRe(c.plantedError.planted).test(o.text)) { console.log(`✗ 잔존 ${id}`); bad++; }
}
console.log(`재검증: 마스터 내 대상 ${checked}건 중 오염 잔존 ${bad}건 ${bad === 0 ? "✓" : "✗"}`);
console.log(`마스터 레코드 수: ${m2.size} (원본 1633)`);
