/**
 * 기출 단어 코퍼스 — 정량 모수 엔진 (LLM 0회)
 *
 * SPEC §4 의 두 갈래 설계 중 "정량 모수" 축을 담당한다.
 * 코퍼스 4,537지문의 **모든 표층형**에 대해 출현·분포·추세를 결정론적으로 계산한다.
 * 에이전트는 의미 분해만 하고, 숫자는 전부 여기서 나온다(SPEC §8-4 "숫자 창작 금지"의 근거).
 *
 *   npx tsx scripts/vocab-corpus-stats.ts --out=experiments/vocab-corpus-20260728/stats.json
 *   npx tsx scripts/vocab-corpus-stats.ts --word=quantify    # 단어 하나 조회
 *   npx tsx scripts/vocab-corpus-stats.ts --top=40           # 추세 급변 상위
 *
 * 중요: 연도마다 코퍼스 크기가 다르므로(2003년 24지문 vs 2014년 311지문) 원시 빈도로
 * 추세를 논하면 전부 거짓이 된다. 모든 추세 지표는 **만 단어당 출현(per10k)** 으로 정규화한다.
 */
import fs from "node:fs";
import PASSAGES from "@/data/exam-passages/passages.json";

type Rec = {
  id: string; year: number; exam: string; board: string;
  grade?: string; typeGroup: string; text: string;
};
const ALL = (PASSAGES as unknown as Rec[]).filter((p) => typeof p.text === "string" && p.text.trim());

/** 표층형 토큰화 — 알파벳 + 내부 아포스트로피(don't, art's). 소문자 정규화. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

// ── 1. 축별 코퍼스 크기(정규화 분모) ────────────────────────────────────
const totalWordsByYear = new Map<number, number>();
const totalWordsByGrade = new Map<string, number>();
const totalWordsByType = new Map<string, number>();
const passagesByYear = new Map<number, number>();
let corpusWords = 0;

// ── 2. 표층형별 집계 ────────────────────────────────────────────────────
type Agg = {
  total: number;
  docs: Set<string>;
  byYear: Map<number, number>;
  byGrade: Map<string, number>;
  byType: Map<string, number>;
  byBoard: Map<string, number>;
};
const agg = new Map<string, Agg>();
const mk = (): Agg => ({ total: 0, docs: new Set(), byYear: new Map(), byGrade: new Map(), byType: new Map(), byBoard: new Map() });
const bump = <K>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

for (const p of ALL) {
  const toks = tokenize(p.text);
  const grade = p.grade ?? "(미상)";
  corpusWords += toks.length;
  bump(totalWordsByYear, p.year, toks.length);
  bump(totalWordsByGrade, grade, toks.length);
  bump(totalWordsByType, p.typeGroup, toks.length);
  bump(passagesByYear, p.year);

  for (const t of toks) {
    let a = agg.get(t);
    if (!a) { a = mk(); agg.set(t, a); }
    a.total++;
    a.docs.add(p.id);
    bump(a.byYear, p.year);
    bump(a.byGrade, grade);
    bump(a.byType, p.typeGroup);
    bump(a.byBoard, p.board);
  }
}

const YEARS = [...totalWordsByYear.keys()].sort((a, b) => a - b);
const GRADES = ["고1", "고2", "고3"];

// ── 3. 추세 지표 ────────────────────────────────────────────────────────
/** 만 단어당 출현. 연도별 코퍼스 크기 차이를 제거한다. */
const per10k = (count: number, denom: number) => (denom > 0 ? (count / denom) * 10_000 : 0);

/** 최소제곱 기울기 — per10k 시계열의 연간 변화율. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

/** 최대 연속 미등장 구간(공백기) — "한동안 사라졌다 돌아온" 패턴 탐지. */
function longestGap(years: number[], present: Set<number>): { gap: number; from: number | null; to: number | null } {
  let best = 0, bf: number | null = null, bt: number | null = null;
  let cur = 0, start: number | null = null;
  for (const y of years) {
    if (present.has(y)) {
      if (cur > best) { best = cur; bf = start; bt = y; }
      cur = 0; start = null;
    } else {
      if (start === null) start = y;
      cur++;
    }
  }
  if (cur > best) { best = cur; bf = start; bt = null; }
  return { gap: best, from: bf, to: bt };
}

/** 분포 편중도 — 0(고름) ~ 1(한 축에 완전 집중). 정규화 엔트로피의 여집합. */
function skew(counts: number[], denoms: number[]): number {
  const rates = counts.map((c, i) => per10k(c, denoms[i]));
  const sum = rates.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const ps = rates.map((r) => r / sum).filter((p) => p > 0);
  if (ps.length <= 1) return 1;
  const H = -ps.reduce((a, p) => a + p * Math.log(p), 0);
  return 1 - H / Math.log(rates.length);
}

type Row = {
  surface: string;
  total: number; docs: number;
  per10kAll: number;
  byYear: Record<number, number>;
  per10kByYear: Record<number, number>;
  byGrade: Record<string, number>;
  per10kByGrade: Record<string, number>;
  gradeSkew: number;
  byType: Record<string, number>;
  typeSkew: number;
  topTypes: { typeGroup: string; per10k: number }[];
  byBoard: Record<string, number>;
  trendSlope: number;
  earlyPer10k: number;
  latePer10k: number;
  trendRatio: number | null;
  trendLabel: string;
  yearsPresent: number;
  longestGap: number;
  gapFrom: number | null;
  gapTo: number | null;
};

const EARLY = YEARS.filter((y) => y <= 2012);
const LATE = YEARS.filter((y) => y >= 2020);

function buildRow(surface: string, a: Agg): Row {
  const byYear: Record<number, number> = {};
  const p10Year: Record<number, number> = {};
  for (const y of YEARS) {
    const c = a.byYear.get(y) ?? 0;
    byYear[y] = c;
    p10Year[y] = +per10k(c, totalWordsByYear.get(y) ?? 0).toFixed(4);
  }
  const xs = YEARS.slice();
  const ys = YEARS.map((y) => p10Year[y]);

  const earlyC = EARLY.reduce((n, y) => n + (a.byYear.get(y) ?? 0), 0);
  const earlyD = EARLY.reduce((n, y) => n + (totalWordsByYear.get(y) ?? 0), 0);
  const lateC = LATE.reduce((n, y) => n + (a.byYear.get(y) ?? 0), 0);
  const lateD = LATE.reduce((n, y) => n + (totalWordsByYear.get(y) ?? 0), 0);
  const e = per10k(earlyC, earlyD), l = per10k(lateC, lateD);
  const ratio = e > 0 ? l / e : null;

  let label = "안정";
  if (ratio === null) label = l > 0 ? "신규 등장" : "미등장";
  else if (ratio >= 2) label = "급증";
  else if (ratio >= 1.3) label = "증가";
  else if (ratio <= 0.5) label = "급감";
  else if (ratio <= 0.77) label = "감소";

  const present = new Set([...a.byYear.entries()].filter(([, c]) => c > 0).map(([y]) => y));
  const gap = longestGap(YEARS, present);

  const byGrade: Record<string, number> = {};
  const p10Grade: Record<string, number> = {};
  for (const g of GRADES) {
    byGrade[g] = a.byGrade.get(g) ?? 0;
    p10Grade[g] = +per10k(byGrade[g], totalWordsByGrade.get(g) ?? 0).toFixed(4);
  }

  const types = [...totalWordsByType.keys()];
  const byType: Record<string, number> = {};
  for (const t of types) byType[t] = a.byType.get(t) ?? 0;
  const topTypes = types
    .map((t) => ({ typeGroup: t, per10k: +per10k(byType[t], totalWordsByType.get(t) ?? 0).toFixed(3) }))
    .sort((x, y) => y.per10k - x.per10k)
    .slice(0, 3);

  const byBoard: Record<string, number> = {};
  for (const [b, c] of a.byBoard) byBoard[b] = c;

  return {
    surface, total: a.total, docs: a.docs.size,
    per10kAll: +per10k(a.total, corpusWords).toFixed(4),
    byYear, per10kByYear: p10Year,
    byGrade, per10kByGrade: p10Grade,
    gradeSkew: +skew(GRADES.map((g) => byGrade[g]), GRADES.map((g) => totalWordsByGrade.get(g) ?? 0)).toFixed(4),
    byType, typeSkew: +skew(types.map((t) => byType[t]), types.map((t) => totalWordsByType.get(t) ?? 0)).toFixed(4),
    topTypes, byBoard,
    trendSlope: +slope(xs, ys).toFixed(5),
    earlyPer10k: +e.toFixed(4), latePer10k: +l.toFixed(4),
    trendRatio: ratio === null ? null : +ratio.toFixed(3),
    trendLabel: label,
    yearsPresent: present.size,
    longestGap: gap.gap, gapFrom: gap.from, gapTo: gap.to,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

console.error(`코퍼스: 지문 ${ALL.length} · 총 ${corpusWords.toLocaleString()}단어 · 고유 표층형 ${agg.size.toLocaleString()} · 연도 ${YEARS[0]}~${YEARS[YEARS.length - 1]}`);

const word = flag("word");
if (word) {
  const a = agg.get(word.toLowerCase());
  if (!a) { console.error(`미등장: ${word}`); process.exit(1); }
  const r = buildRow(word.toLowerCase(), a);
  console.log(`\n=== ${r.surface} ===`);
  console.log(`  총 ${r.total}회 / ${r.docs}개 지문 / 만단어당 ${r.per10kAll}`);
  console.log(`  추세: ${r.trendLabel} (초기 ${r.earlyPer10k} → 최근 ${r.latePer10k}, 배율 ${r.trendRatio ?? "N/A"}, 기울기 ${r.trendSlope})`);
  console.log(`  등장 연도 ${r.yearsPresent}/${YEARS.length} · 최장 공백 ${r.longestGap}년${r.gapFrom ? ` (${r.gapFrom}~${r.gapTo ?? "현재"})` : ""}`);
  console.log(`  학년 편중 ${r.gradeSkew} — ` + GRADES.map((g) => `${g} ${r.per10kByGrade[g]}`).join(" / "));
  console.log(`  유형 편중 ${r.typeSkew} — 상위 ` + r.topTypes.map((t) => `${t.typeGroup}(${t.per10k})`).join(" "));
  console.log(`  연도별(만단어당):`);
  console.log("   " + YEARS.map((y) => `${y}:${r.per10kByYear[y] || "·"}`).join(" "));
  process.exit(0);
}

const top = flag("top");
if (top) {
  const n = Number(top);
  // 의미 있는 표본만 — 총 20회 이상 등장
  const rows = [...agg.entries()].filter(([, a]) => a.total >= 20).map(([s, a]) => buildRow(s, a));
  const show = (title: string, list: Row[]) => {
    console.log(`\n=== ${title} ===`);
    for (const r of list) {
      console.log(
        `  ${r.surface.padEnd(18)} 총${String(r.total).padStart(5)} ` +
        `초기 ${String(r.earlyPer10k).padStart(7)} → 최근 ${String(r.latePer10k).padStart(7)} ` +
        `(×${r.trendRatio ?? "N/A"}) ${r.trendLabel}`,
      );
    }
  };
  show(`최근 급증 상위 ${n}`, rows.filter((r) => r.trendRatio !== null).sort((a, b) => (b.trendRatio ?? 0) - (a.trendRatio ?? 0)).slice(0, n));
  show(`최근 급감 상위 ${n}`, rows.filter((r) => r.trendRatio !== null && r.earlyPer10k > 0).sort((a, b) => (a.trendRatio ?? 9e9) - (b.trendRatio ?? 9e9)).slice(0, n));
  show(`학년 편중 상위 ${n} (특정 학년에만 몰림)`, rows.slice().sort((a, b) => b.gradeSkew - a.gradeSkew).slice(0, n));
  show(`유형 편중 상위 ${n} (특정 문항유형에 몰림)`, rows.slice().sort((a, b) => b.typeSkew - a.typeSkew).slice(0, n));
  process.exit(0);
}

const out = flag("out");
if (!out) { console.error("usage: --out=<파일> | --word=<단어> | --top=<N>"); process.exit(2); }

const rows = [...agg.entries()].map(([s, a]) => buildRow(s, a)).sort((a, b) => b.total - a.total);
fs.writeFileSync(out, JSON.stringify({
  meta: {
    generatedFrom: "src/data/exam-passages/passages.json",
    passages: ALL.length, corpusWords, surfaceForms: agg.size,
    years: YEARS, earlyWindow: EARLY, lateWindow: LATE,
    wordsByYear: Object.fromEntries(totalWordsByYear),
    wordsByGrade: Object.fromEntries(totalWordsByGrade),
    passagesByYear: Object.fromEntries(passagesByYear),
    note: "모든 per10k 는 해당 축의 코퍼스 크기로 정규화된 값. 원시 빈도로 추세를 논하지 말 것.",
  },
  rows,
}, null, 1));
console.error(`→ ${out} (${rows.length.toLocaleString()}행, ${(fs.statSync(out).size / 1e6).toFixed(1)}MB)`);
