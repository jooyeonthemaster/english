// 마스터 DB(passages.jsonl)가 여전히 오염돼 있는지 확인.
// src/data/exam-passages/passages.json 은 build_app_bundle.py 의 산출물이므로,
// 마스터가 오염된 채면 재빌드 시 내 복원 326건이 전부 날아간다.
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const master = path.join(root, "english-exam-passages/passages.jsonl");
const lines = fs.readFileSync(master, "utf8").trim().split("\n");
const m = new Map();
for (const l of lines) { try { const o = JSON.parse(l); m.set(o.passageId || o.id, o); } catch {} }
console.log(`마스터 passages.jsonl 레코드: ${m.size}`);

const OUT = path.join(root, "experiments/question-quality-20260721-corpus");
const a1 = JSON.parse(fs.readFileSync(path.join(OUT, "applied-corpus-fixes.json"), "utf8"));
const a2 = JSON.parse(fs.readFileSync(path.join(OUT, "applied-adjudicated.json"), "utf8")).planned;
const all = [...a1.map((x) => ({ id: x.id, planted: x.planted, original: x.original })),
             ...a2.map((x) => ({ id: x.id, planted: x.planted, original: x.original }))];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (t) => new RegExp(`(?<![A-Za-z])${esc(t)}(?![A-Za-z])`);

let dirty = 0, clean = 0, missing = 0;
const dirtyList = [];
for (const a of all) {
  const rec = m.get(a.id);
  if (!rec) { missing++; continue; }
  if (wordRe(a.planted).test(rec.text)) { dirty++; dirtyList.push(a); }
  else clean++;
}
console.log(`\n내가 복원한 ${all.length}건을 마스터에서 조회:`);
console.log(`  ★ 마스터에 오염어 잔존: ${dirty}`);
console.log(`  마스터도 이미 깨끗:      ${clean}`);
console.log(`  마스터에 없음:           ${missing}`);
if (dirty > 0) {
  console.log(`\n→ 재빌드(python build_app_bundle.py) 시 복원 ${dirty}건이 전부 되돌아간다.`);
  console.log("샘플 5건:");
  for (const d of dirtyList.slice(0, 5)) console.log(`  ${d.id}: "${d.planted}" → "${d.original}"`);
}
fs.writeFileSync(path.join(OUT, "master-dirty.json"), JSON.stringify(dirtyList, null, 2));
