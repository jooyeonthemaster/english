// 최종 조인 분석 — grades.json × keymap × results.jsonl
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const grades = JSON.parse(fs.readFileSync(path.join(HERE, "grades.json"), "utf8")).graded;
const keymap = JSON.parse(fs.readFileSync(
  "C:/Users/jooye/AppData/Local/Temp/claude/d--Desktop-2026project-nara/81d49447-f31d-47df-9490-6666fe3f6f9c/scratchpad/craft-ab-keymap.json", "utf8"));
const byBid = new Map(keymap.map((k) => [k.bid, k]));
const byKey = new Map();
for (const l of fs.readFileSync(path.join(HERE, "results.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const r = JSON.parse(l);
  if (!r.skipped) byKey.set(`${r.arm}:${r.model}:${r.p}:${r.qtype}`, r);
}
const joined = grades.map((g) => {
  const k = byBid.get(g.bid);
  const r = byKey.get(`${k.arm}:${k.model}:${k.p}:${k.qtype}`);
  return { ...g, arm: k.arm, model: k.model, p: k.p, qtype: k.qtype, wallMs: r?.wallMs ?? null, costUsd: r?.costUsd ?? null };
});
fs.writeFileSync(path.join(HERE, "final-joined.json"), JSON.stringify(joined, null, 1));

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const p90 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : 0; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

for (const qtype of ["blank", "grammar"]) {
  console.log(`\n==== ${qtype.toUpperCase()} (n=10/cell) ====`);
  console.log("arm×model      F  A  craft평균  중앙시간  p90시간  중앙원가  p90원가");
  const cells = {};
  for (const j of joined.filter((x) => x.qtype === qtype)) {
    const key = `${j.arm}×${j.model}`;
    cells[key] = cells[key] || { F: 0, A: 0, craft: [], ms: [], usd: [] };
    const c = cells[key];
    if (j.finalVerdict === "F") c.F++;
    if (j.finalVerdict === "A") c.A++;
    c.craft.push(j.craftScore);
    if (j.wallMs) c.ms.push(j.wallMs);
    if (j.costUsd) c.usd.push(j.costUsd);
  }
  for (const key of Object.keys(cells).sort()) {
    const c = cells[key];
    console.log(
      key.padEnd(13),
      String(c.F).padStart(2), String(c.A).padStart(2),
      mean(c.craft).toFixed(1).padStart(8),
      (Math.round(med(c.ms) / 1000) + "s").padStart(8), (Math.round(p90(c.ms) / 1000) + "s").padStart(8),
      (Math.round(med(c.usd) * 1400) + "원").padStart(8), (Math.round(p90(c.usd) * 1400) + "원").padStart(8),
    );
  }
}
// F 상세
console.log("\n==== F 상세 ====");
for (const j of joined.filter((x) => x.finalVerdict === "F")) {
  console.log(`${j.bid} ${j.arm}×${j.model} p${j.p} ${j.qtype}: ${(j.defects[0] ?? "").slice(0, 110)}`);
}
// A 분포
console.log("\n==== A 분포 ====");
const aCount = {};
for (const j of joined.filter((x) => x.finalVerdict === "A")) {
  const key = `${j.arm}×${j.model}×${j.qtype}`;
  aCount[key] = (aCount[key] || 0) + 1;
}
console.log(JSON.stringify(aCount, null, 1));
// paired 공예 비교(암별 craft 평균, 방법 단위 합산)
console.log("\n==== 방법 단위 합계(모델 불문) ====");
for (const qtype of ["blank", "grammar"]) {
  for (const arm of ["A", "B", "C"]) {
    const set = joined.filter((x) => x.qtype === qtype && x.arm === arm);
    console.log(`${qtype} ${arm}: F=${set.filter((x) => x.finalVerdict === "F").length}/30 A=${set.filter((x) => x.finalVerdict === "A").length}/30 craft=${mean(set.map((x) => x.craftScore)).toFixed(2)}`);
  }
}
