#!/usr/bin/env node
// 선지 계량 — 디스크의 gate.json 에서 선지 길이 분포를 실측한다.
//
// 왜: 교리 §4.1 "정답이 최장 선지가 되면 안 된다"와 §5-10 "최장−최단 > 10단어면 재작성"은
// **기계로 셀 수 있는 규칙**인데 지금은 산문으로만 존재한다. 산문 규칙은 지켜졌는지 알 수 없다.
// 먼저 실측해서 위반이 있는지 보고, 있으면 게이트로 승격한다(계기 우선).
//
// 사용: node qbank/harness/measure-options.mjs [--year 2027] [--json]
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const asJson = argv.includes("--json");
const yearFilter = arg("--year", null);
const OUT = "qbank/out";

// 한국어 선지는 어절, 영어 선지는 단어로 센다. 두 언어가 섞이면 공백 토큰이 공통 척도다.
const wc = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

const viol = { answerLongest: [], spread: [] };
const all = [];

for (const year of readdirSync(OUT)) {
  if (yearFilter && year !== yearFilter) continue;
  const ydir = join(OUT, year);
  if (!statSync(ydir).isDirectory()) continue;
  for (const p of readdirSync(ydir)) {
    const pdir = join(ydir, p);
    if (!statSync(pdir).isDirectory()) continue;
    for (const f of readdirSync(pdir)) {
      if (!f.endsWith(".gate.json")) continue;
      const type = f.replace(/\.gate\.json$/, "");
      let g;
      try { g = JSON.parse(readFileSync(join(pdir, f), "utf8")); } catch { continue; }
      for (const it of g.items || []) {
        const sd = it.structuredData || {};
        const opts = Array.isArray(sd.options) ? sd.options : null;
        if (!opts || opts.length < 2) continue;
        const lens = opts.map((o) => wc(typeof o === "string" ? o : o.text));
        if (lens.some((n) => n === 0)) continue;
        // 정답 라벨 정규화 — "3" / "③" / ["1","2"] 모두 온다
        const norm = (v) => String(v).replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, (c) => String("①②③④⑤⑥⑦⑧⑨⑩".indexOf(c) + 1)).trim();
        const ansRaw = sd.correctAnswer ?? sd.answer ?? sd.correctAnswers;
        const ansSet = new Set((Array.isArray(ansRaw) ? ansRaw : String(ansRaw ?? "").split(/[,\s]+/)).map(norm).filter(Boolean));
        const idxOf = (o, i) => norm(typeof o === "string" ? String(i + 1) : (o.label ?? i + 1));
        const ansLens = opts.map((o, i) => (ansSet.has(idxOf(o, i)) ? lens[i] : null)).filter((n) => n !== null);
        if (!ansLens.length) continue;
        const max = Math.max(...lens), min = Math.min(...lens);
        const spread = max - min;
        const isAnsLongest = ansLens.some((n) => n === max) && lens.filter((n) => n === max).length === 1;
        const rec = { year, passage: p, type, item: it.index, difficulty: it.meta?.difficulty, lens, ansLens, spread, isAnsLongest };
        all.push(rec);
        if (isAnsLongest) viol.answerLongest.push(rec);
        if (spread > 10) viol.spread.push(rec);
      }
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ total: all.length, viol }, null, 2));
} else {
  const spreads = all.map((r) => r.spread).sort((a, b) => a - b);
  const q = (p) => spreads.length ? spreads[Math.min(spreads.length - 1, Math.floor(spreads.length * p))] : 0;
  console.log(`검사 문항 ${all.length}개 (선지 보유 문항만)`);
  console.log(`선지 길이 편차(최장−최단):  중앙값 ${q(0.5)}  p75 ${q(0.75)}  p90 ${q(0.9)}  최대 ${spreads.at(-1) ?? 0}`);
  console.log(`\n[위반] 정답이 단독 최장 선지: ${viol.answerLongest.length}건 (${(viol.answerLongest.length / (all.length || 1) * 100).toFixed(1)}%)`);
  for (const r of viol.answerLongest.slice(0, 15)) {
    console.log(`   ${r.passage}/${r.type} #${r.item} [${r.difficulty}] 길이 ${JSON.stringify(r.lens)} 정답 ${JSON.stringify(r.ansLens)}`);
  }
  if (viol.answerLongest.length > 15) console.log(`   … 외 ${viol.answerLongest.length - 15}건`);
  console.log(`\n[위반] 길이 편차 > 10어절: ${viol.spread.length}건 (${(viol.spread.length / (all.length || 1) * 100).toFixed(1)}%)`);
  for (const r of viol.spread.slice(0, 15)) {
    console.log(`   ${r.passage}/${r.type} #${r.item} [${r.difficulty}] 편차 ${r.spread}  길이 ${JSON.stringify(r.lens)}`);
  }
  if (viol.spread.length > 15) console.log(`   … 외 ${viol.spread.length - 15}건`);
  // 유형별 위반 집계 — 특정 유형에 몰리면 유형 고유 원인(근본원인 병합)
  const byType = {};
  for (const r of [...viol.answerLongest, ...viol.spread]) byType[r.type] = (byType[r.type] || 0) + 1;
  const top = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) console.log(`\n유형별 위반 집중도: ${top.map(([t, n]) => `${t}=${n}`).join(" · ")}`);
}
