// 스윕 결과 요약 — 넘침(정확성)과 칸 채움/추정 오차(품질)를 함께 본다.
//   node scripts/exam-pagination/paper-report.mjs a.jsonl [b.jsonl ...]
import { readFileSync } from "node:fs";

function load(file) {
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => !r.error);
}

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : NaN);

for (const file of process.argv.slice(2)) {
  const rows = load(file);
  let pages = 0;
  const overflow = [];
  const slack = []; // 칸 아래 남은 빈 공간(마지막 칸 제외)
  const estErr = [];
  let passes = 0;
  for (const row of rows) {
    pages += row.pages;
    passes += row.guardPasses ?? 0;
    const cols = row.cols ?? [];
    cols.forEach((c, index) => {
      if (c.used > c.avail + 1) overflow.push({ url: row.url.split("?")[1], ...c });
      if (index < cols.length - 1) slack.push(Math.round(c.avail - c.used));
      if (c.est != null) estErr.push(Math.round(c.est - c.used));
    });
  }
  slack.sort((a, b) => a - b);
  estErr.sort((a, b) => a - b);
  const batches = rows.length;
  console.log(`\n== ${file}  (batches ${batches}, pages ${pages}, guard passes ${passes})`);
  console.log(`   넘친 칸: ${overflow.length}${overflow.length ? " → " + overflow.slice(0, 5).map((o) => `${o.url} p${o.p}c${o.c} +${Math.round(o.used - o.avail)}px`).join(", ") : ""}`);
  console.log(
    `   칸 아래 남은 여백 px: median ${pct(slack, 0.5)} · p25 ${pct(slack, 0.25)} · p75 ${pct(slack, 0.75)} · p95 ${pct(slack, 0.95)} · max ${slack[slack.length - 1]}`,
  );
  console.log(
    `   추정−실측 px: median ${pct(estErr, 0.5)} · p05 ${pct(estErr, 0.05)} · p95 ${pct(estErr, 0.95)} · min ${estErr[0]} · max ${estErr[estErr.length - 1]}`,
  );
}
