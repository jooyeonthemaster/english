#!/usr/bin/env node
// 상태 점검 — 디스크(진실원 I5)만 읽어 유닛 현황을 한 화면으로 요약한다.
//
// 사용: node qbank/harness/status.mjs [--year 2027] [--passage q20]
//
// 왜 스크립트인가: gate.json 은 유닛당 수십 KB 라 그대로 읽으면 컨텍스트가 터진다.
// 감독이 봐야 하는 것은 ok/blocking/qualityBlocking/문항수 네 개뿐이다.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = "qbank/out";
const yearFilter = arg("--year", null);
const passFilter = arg("--passage", null);

const rows = [];
for (const year of readdirSync(OUT)) {
  if (yearFilter && year !== yearFilter) continue;
  const ydir = join(OUT, year);
  if (!statSync(ydir).isDirectory()) continue;
  for (const p of readdirSync(ydir)) {
    if (passFilter && !p.includes(passFilter)) continue;
    const pdir = join(ydir, p);
    if (!statSync(pdir).isDirectory()) continue;
    for (const f of readdirSync(pdir)) {
      if (!f.endsWith(".md")) continue;
      const type = f.replace(/\.md$/, "");
      const gp = join(pdir, `${type}.gate.json`);
      const row = { year, passage: p, type, md: true, gate: null, items: 0, blk: 0, qblk: 0, ok: null, reviews: [] };
      if (existsSync(gp)) {
        try {
          const g = JSON.parse(readFileSync(gp, "utf8"));
          row.gate = true;
          row.ok = !!g.ok;
          row.items = Array.isArray(g.items) ? g.items.length : 0;
          // 게이트 스키마는 두 축을 분리해 담는다: blocking(프로덕션 동등) vs qualityBlocking(우리 기준)
          const collect = (k) => {
            if (Array.isArray(g[k])) return g[k].length;
            let n = 0;
            for (const it of g.items || []) {
              if (k === "blocking") n += (it.gateIssues || []).length;
              else n += (it.qualityErrors || []).length;
            }
            return n + (Array.isArray(g.unitIssues) ? g.unitIssues.filter(u => k === "blocking" ? !u.quality : u.quality).length : 0);
          };
          row.blk = collect("blocking");
          row.qblk = collect("quality");
        } catch { row.gate = false; }
      }
      for (const rf of readdirSync(pdir)) {
        const m = rf.match(new RegExp(`^${type}\\.review(?:\\.(\\w+))?\\.json$`));
        if (m) row.reviews.push(m[1] || "claude");
      }
      rows.push(row);
    }
  }
}

rows.sort((a, b) => (a.year + a.passage + a.type).localeCompare(b.year + b.passage + b.type));

let curPassage = "";
let totItems = 0, totOk = 0, totBlk = 0, totQ = 0;
for (const r of rows) {
  const key = `${r.year}/${r.passage}`;
  if (key !== curPassage) { console.log(`\n■ ${key}`); curPassage = key; }
  const mark = r.gate === null ? "…게이트없음" : r.ok ? "PASS" : "FAIL";
  const rev = r.reviews.length ? ` rev[${r.reviews.join(",")}]` : "";
  console.log(
    `   ${r.type.padEnd(24)} ${String(r.items).padStart(2)}문항  ${mark.padEnd(11)}` +
    `blk=${r.blk} qblk=${r.qblk}${rev}`
  );
  totItems += r.items;
  if (r.ok) totOk++;
  totBlk += r.blk; totQ += r.qblk;
}
console.log(
  `\n합계: 유닛 ${rows.length} · PASS ${totOk} · 문항 ${totItems} · blocking ${totBlk} · quality ${totQ}`
);
