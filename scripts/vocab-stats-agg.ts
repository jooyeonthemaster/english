/**
 * 표제어 정량 합산 — stats.json / phrase-stats.json 의 **표면형 행**들을
 * 표제어 단위로 접어 올린다.
 *
 * ── 왜 이 모듈이 따로 있는가 (2026-07-28 적대검수 major-1) ─────────────────────
 * 이전 적재기는 `quant.trend.basis` **한 표면형**의 행을 그대로 연도통계로 실었다.
 * basis 는 "출현이 가장 많은 표면형"일 뿐 표제어가 아니다. 실측 귀결:
 *   · 표제어 총출현 ≠ basis 행 total 인 표제어 1,637/6,829 (24.0%)
 *   · 코퍼스 합계 523,846 vs 458,247 → **12.5% 유실**
 *   · make(verb) 는 surfaces=[make,made,making,makes] 인데 목록의 per10k 는 33.83,
 *     상세 그래프는 make 한 형태만의 15.17 — 같은 화면에서 두 수치가 모순됐다.
 *
 * ── 합산 규칙은 scripts/vocab-corpus-build.ts 의 quantFor 와 **동일해야 한다** ──
 * 그 함수가 `quant.totalOccurrences` 를 만든 주체다. 규칙이 어긋나면 목록(표제어
 * 스칼라)과 상세(연도통계)가 또 갈린다. 그래서 행 선택 로직을 그대로 복제한다:
 *   1) direct = resolve(lemma) 가 **구/숙어 행**이면 그 행 하나만 쓴다.
 *      — 구 행은 굴절 실현형이 이미 그 안에 합산돼 있다. 표면형을 또 더하면
 *        이중계상이다(실측: depend on 164 → 잘못 더하면 335).
 *   2) 아니면 실현 표면형들을 각각 해소해 **행 키 기준 중복 제거** 후 전부 더하고,
 *      direct 가 그 안에 없으면 추가한다.
 *   3) resolve 는 직접 키 → phrase-stats 의 aliasIndex 경유 사전형 순.
 *      (aliasIndex 없이 표면형만 찾으면 실측 1,005건이 미해소된다.)
 * 실측 검증: 이 규칙으로 합산하면 6,829 표제어 **전건**에서
 *   Σ(합산 행 total) == quant.totalOccurrences → 코퍼스 합계 일치율 **100.00%**.
 *
 * ── per10k 는 더하지 않는다 ─────────────────────────────────────────────────
 * 연도마다 코퍼스 총단어수가 다르다(2003년 2,656 vs 2014년 43,758). per10k 를
 * 그냥 더하면 분모가 뒤섞인 무의미한 수가 된다. **원시 빈도를 더한 뒤 해당 축의
 * 총단어수(meta.wordsByYear / meta.wordsByGrade)로 다시 나눈다.**
 */
import fs from "node:fs";

// ── 행 형상 ──────────────────────────────────────────────────────────────────
// stats.json 과 phrase-stats.json 의 공통 부분집합만 선언한다. phrase-stats 행에는
// isPhrase·slotCount·variants 등이 더 붙지만 합산에 쓰는 것은 아래뿐이다.
export type StatRow = {
  surface: string;
  total: number;
  docs: number;
  per10kAll: number;
  byYear: Record<string, number>;
  byGrade: Record<string, number>;
  byType: Record<string, number>;
  byBoard: Record<string, number>;
  per10kByGrade?: Record<string, number>;
  yearsPresent?: number;
  longestGap?: number;
  gapFrom?: number | null;
  gapTo?: number | null;
  trendLabel?: string;
  isPhrase?: boolean;
};

export type StatsMeta = {
  years: number[];
  passages: number;
  corpusWords: number;
  wordsByYear: Record<string, number>;
  wordsByGrade: Record<string, number>;
};

export type StatsIndex = {
  meta: StatsMeta;
  rowCount: number;
  aliasCount: number;
  loaded: string[];
  /** 표면형 → 행. 직접 키 우선, 없으면 aliasIndex 로 사전형을 거쳐 한 번 더. */
  resolve(form: string): StatRow | undefined;
  /** 행 키 → 어느 파일에서 왔는지(statsSource 컬럼용). */
  sourceOf(surface: string): "stats" | "phrase-stats";
};

const GRADES = ["고1", "고2", "고3"];
const per10k = (count: number, denom: number) => (denom > 0 ? (count / denom) * 10_000 : 0);
const r4 = (n: number) => +n.toFixed(4);

/**
 * scripts/vocab-corpus-stats.ts:89-103 의 longestGap 과 **동일 규칙**.
 * 선행/후행 미등장 구간도 공백기로 센다 — 원본 지표(quant.trend.longestGap)와
 * 같은 정의를 써야 두 값을 나란히 놓고 비교할 수 있다.
 */
function longestGap(years: number[], present: Set<number>) {
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

// ── 인덱스 적재 ──────────────────────────────────────────────────────────────

type RawFile = {
  meta?: Partial<StatsMeta>;
  aliasIndex?: Record<string, string>;
  rows?: StatRow[];
};

/**
 * 두 통계 파일을 하나의 인덱스로 합친다. 나중에 넣은 파일이 같은 키를 이긴다
 * (build 쪽 `for (const r of s.rows) stats.set(r.surface, r)` 와 같은 순서).
 * aliasIndex 는 **먼저 본 것이 이긴다**(build 쪽 `if (!alias.has(form))` 와 동일).
 */
export function loadStatsIndex(paths: { stats?: string | null; phraseStats?: string | null }): StatsIndex | null {
  const rows = new Map<string, StatRow>();
  const src = new Map<string, "stats" | "phrase-stats">();
  const alias = new Map<string, string>();
  const loaded: string[] = [];
  let meta: StatsMeta | null = null;

  const one = (p: string | null | undefined, tag: "stats" | "phrase-stats") => {
    if (!p) return;
    if (!fs.existsSync(p)) { console.warn(`  ! 통계 파일 없음: ${p}`); return; }
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as RawFile;
    // meta 는 두 파일이 같은 코퍼스를 보므로 동일하다. 먼저 온 것을 쓰되
    // 연도 분모(wordsByYear)가 있는 쪽을 우선한다.
    if (!meta || (!Object.keys(meta.wordsByYear ?? {}).length && j.meta?.wordsByYear)) {
      meta = {
        years: (j.meta?.years ?? []).map(Number),
        passages: Number(j.meta?.passages ?? 0) || 0,
        corpusWords: Number(j.meta?.corpusWords ?? 0) || 0,
        wordsByYear: j.meta?.wordsByYear ?? {},
        wordsByGrade: j.meta?.wordsByGrade ?? {},
      };
    }
    let n = 0;
    for (const r of j.rows ?? []) {
      if (!r?.surface) continue;
      rows.set(r.surface, r);
      src.set(r.surface, tag);
      n++;
    }
    for (const [form, dict] of Object.entries(j.aliasIndex ?? {})) if (!alias.has(form)) alias.set(form, dict);
    loaded.push(`${p.split(/[\\/]/).pop()}(${n.toLocaleString("en-US")}행${j.aliasIndex ? `·alias ${Object.keys(j.aliasIndex).length.toLocaleString("en-US")}` : "·alias 없음"})`);
  };

  one(paths.stats, "stats");
  one(paths.phraseStats, "phrase-stats");
  if (!rows.size || !meta) return null;

  const m: StatsMeta = meta;
  if (!m.years.length) m.years = [...new Set(Object.keys(m.wordsByYear).map(Number))].sort((a, b) => a - b);

  return {
    meta: m,
    rowCount: rows.size,
    aliasCount: alias.size,
    loaded,
    resolve(form: string) {
      const k = form.toLowerCase();
      const direct = rows.get(k);
      if (direct) return direct;
      const d = alias.get(k);
      return d ? rows.get(d) : undefined;
    },
    sourceOf(surface: string) { return src.get(surface) ?? "stats"; },
  };
}

// ── 표제어 합산 ──────────────────────────────────────────────────────────────

export type LemmaAgg = {
  /** 실제로 더한 행 키들(연도통계 provenance — basis 한 개가 아니다) */
  rowKeys: string[];
  source: "stats" | "phrase-stats" | "mixed";
  /** 구 행 직접 조회로 확정돼 표면형 합산을 하지 않은 경우 */
  phraseDirect: boolean;
  /** 해소하지 못한 실현 표면형(감사용) */
  unresolved: string[];
  total: number;
  /** ⚠️ 지문 수가 **아니다** — 행별 docs 의 단순 합이라 한 지문에 두 표면형이 나오면
   *  두 번 센다. quant.passageCount 도 같은 방식이라(build 의 shapeQuant) 일부러
   *  맞춰 뒀을 뿐이다. 표제어의 등장 지문 수로 쓰지 마라. */
  docs: number;
  byYear: Record<string, number>;
  per10kByYear: Record<string, number>;
  byGrade: Record<string, number>;
  per10kByGrade: Record<string, number>;
  byType: Record<string, number>;
  byBoard: Record<string, number>;
  per10kAll: number;
  yearMin: number | null;
  yearMax: number | null;
  yearsPresent: number;
  longestGap: number;
  gapFrom: number | null;
  gapTo: number | null;
};

/**
 * @param lemma     표제어 문자열(사전형). 구/숙어는 이것이 곧 행 키다.
 * @param surfaces  quant.surfaces — 추출물이 알려 준 실현 표면형 전량.
 */
export function aggregateLemma(idx: StatsIndex, lemma: string, surfaces: string[]): LemmaAgg | null {
  // ── 1) 합산할 행 고르기 (vocab-corpus-build.ts quantFor 복제) ──
  const direct = idx.resolve(lemma.toLowerCase());
  const unresolved: string[] = [];
  let picked: StatRow[];
  let phraseDirect = false;

  if (direct?.isPhrase) {
    // 구 행은 굴절형이 이미 내부 합산돼 있다 — 표면형을 더하면 이중계상.
    picked = [direct];
    phraseDirect = true;
  } else {
    const byKey = new Map<string, StatRow>();
    for (const s of surfaces) {
      const r = idx.resolve(s.toLowerCase());
      if (!r) { unresolved.push(s); continue; }
      byKey.set(r.surface, r);
    }
    if (direct) byKey.set(direct.surface, direct);
    picked = [...byKey.values()];
  }
  if (!picked.length) return null;

  // ── 2) 원시 빈도 합산 ──
  const add = (dst: Record<string, number>, srcMap: Record<string, number> | undefined) => {
    for (const [k, v] of Object.entries(srcMap ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) dst[k] = (dst[k] ?? 0) + n;
    }
  };
  const byYear: Record<string, number> = {};
  const byGrade: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byBoard: Record<string, number> = {};
  let total = 0, docs = 0;
  for (const r of picked) {
    total += Number(r.total) || 0;
    docs += Number(r.docs) || 0;
    add(byYear, r.byYear);
    add(byGrade, r.byGrade);
    add(byType, r.byType);
    add(byBoard, r.byBoard);
  }

  // 25개 연도 키를 빠짐없이 채운다(원본 행과 같은 형상 — 0 인 해도 키를 갖는다).
  for (const y of idx.meta.years) if (byYear[String(y)] === undefined) byYear[String(y)] = 0;
  for (const g of GRADES) if (byGrade[g] === undefined) byGrade[g] = 0;

  // ── 3) per10k 는 **합산 후 재계산** ── 분모가 축마다 다르므로 절대 더하지 않는다.
  const per10kByYear: Record<string, number> = {};
  for (const y of idx.meta.years) {
    const k = String(y);
    per10kByYear[k] = r4(per10k(byYear[k] ?? 0, Number(idx.meta.wordsByYear[k] ?? 0)));
  }
  const per10kByGrade: Record<string, number> = {};
  for (const g of GRADES) {
    per10kByGrade[g] = r4(per10k(byGrade[g] ?? 0, Number(idx.meta.wordsByGrade[g] ?? 0)));
  }

  // ── 4) 연도 범위·공백기 — **0 인 해는 등장이 아니다** (major-2) ──
  const present = new Set(idx.meta.years.filter((y) => (byYear[String(y)] ?? 0) > 0));
  const gap = longestGap(idx.meta.years, present);
  const ys = [...present];

  const srcs = new Set(picked.map((r) => idx.sourceOf(r.surface)));

  return {
    rowKeys: picked.map((r) => r.surface),
    source: srcs.size > 1 ? "mixed" : ([...srcs][0] ?? "stats"),
    phraseDirect,
    unresolved,
    total,
    docs,
    byYear, per10kByYear, byGrade, per10kByGrade, byType, byBoard,
    per10kAll: r4(per10k(total, idx.meta.corpusWords)),
    yearMin: ys.length ? Math.min(...ys) : null,
    yearMax: ys.length ? Math.max(...ys) : null,
    yearsPresent: present.size,
    longestGap: gap.gap,
    gapFrom: gap.from,
    gapTo: gap.to,
  };
}

/** per10kByGrade argmax — Q1 학년별 단어장의 필터 축. 0 뿐이면 null. */
export function gradeTopOf(byGrade: Record<string, number> | null | undefined): string | null {
  if (!byGrade) return null;
  let best: string | null = null, bestV = -Infinity;
  for (const g of GRADES) {
    const v = byGrade[g];
    if (typeof v === "number" && v > bestV) { bestV = v; best = g; }
  }
  return bestV > 0 ? best : null;
}

/**
 * 분포 편중도 — scripts/vocab-corpus-stats.ts:106-114 의 skew 와 동일.
 * 0(고름) ~ 1(한 축에 완전 집중). 정규화 엔트로피의 여집합.
 */
export function skew(counts: number[], denoms: number[]): number {
  const rates = counts.map((c, i) => per10k(c, denoms[i]));
  const sum = rates.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const ps = rates.map((r) => r / sum).filter((p) => p > 0);
  if (ps.length <= 1) return 1;
  const H = -ps.reduce((a, p) => a + p * Math.log(p), 0);
  return 1 - H / Math.log(rates.length);
}

export { GRADES };
