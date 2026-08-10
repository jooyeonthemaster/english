/**
 * 어휘 row 관계어(동의어·반의어) 결정론 정규화 — **서버 생성 시점 단일 진실원**.
 *
 * 왜 서버인가: 클라이언트 렌더에서 자르면 저장 JSON 은 그대로라 표/인쇄/학생앱
 * (report-sections, study-activities.ts, worksheet-study/compile.ts)이 서로 다른
 * 값을 본다. 정규화는 저장되는 JSON 자체에 1회 적용하고 모든 소비자가 그것을 읽는다.
 *
 * 계약:
 *  - "해당 없음" = REL_NONE("—") 하나로 통일한다. 대시류·N/A·"없음"·빈 문자열·키 누락을
 *    전부 흡수한다. 소비자들이 이 글자로 배제 판정을 하므로(compile.ts relationTokens,
 *    study-activities.ts rightTokens) 빈 셀보다 "—" 가 언제나 안전하다.
 *  - 동의어·반의어 각각 최대 2개. **맨 앞 1순위가 학생앱 연결 문제 정답으로 출제된다**
 *    (프롬프트 계약과 동일) — 순서를 절대 흔들지 않는다.
 *  - 한 단어가 서로 다른 표제어의 동의어이면서 반의어이면(교차관계 충돌) 1순위
 *    주장자만 남긴다 — 연결 문제 정답이 둘이 되는 실측 사고 예방
 *    (worksheet-study/compile.ts resolveGroupPairs 주석의 media effect/trigger 사고).
 *  - **내용을 지어내지 않는다**: 없는 반의어를 만들지 않고 "—" 로만 표기한다.
 *  - **순수함수 + 멱등**: coerceSection 은 재개(resume)·최종 재조립에서 같은 섹션에
 *    여러 번 걸린다. 두 번 걸어도 결과가 같아야 한다.
 */

/** 관계어 "해당 없음" 표기 — 하류(compile.ts / study-activities.ts)가 배제하는 토큰. */
export const REL_NONE = "—";
/** 동의어 상한 — 표 폭(14%)과 연결 문제 정답 후보 선명도 때문에 2개. */
export const MAX_SYNONYMS = 2;
/** 반의어 상한 — 동의어와 동일. */
export const MAX_ANTONYMS = 2;
/** 반의어 커버리지 경고 하한(계측 전용 — 저장을 막지 않는다). 프롬프트 목표치는 70%. */
export const MIN_ANTONYM_COVERAGE = 0.5;

/** 쉼표·세미콜론·슬래시·가운뎃점·일본식 쉼표 분리(compile.ts 와 동일 계열 + 확장). */
const SPLIT_RE = /[,;/·、]/;
/** 비교 키 정규화 — 앞뒤 따옴표·괄호·구두점 제거. */
const LEAD_PUNCT_RE = /^[\s"'([{‘“«]+/;
const TAIL_PUNCT_RE = /[\s"')\]}’”»,.!?;:]+$/;
/** 대시류만으로 이루어진 토큰("—","--","–" 등) — 전부 "없음" 표기다. */
const DASH_ONLY_RE = /^[-–—―ㅡ_]+$/;

/** "없음"을 뜻하는 토큰 — 대시류·N/A·한글 표기를 모두 흡수한다. */
const NONE_TOKENS = new Set([
  "n/a",
  "na",
  "none",
  "nil",
  "없음",
  "없다",
  "해당없음",
  "해당 없음",
  "x",
  "null",
  "undefined",
]);

function collapse(v: unknown): string {
  return typeof v === "string" ? v.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

/** 비교 키 — 대소문자·양끝 구두점·관사/to 표지를 흡수(중복·충돌 판정 전용). */
export function relKey(raw: string): string {
  return collapse(raw)
    .toLowerCase()
    .replace(LEAD_PUNCT_RE, "")
    .replace(TAIL_PUNCT_RE, "")
    .replace(/^(?:to|a|an|the)\s+/, "")
    .trim();
}

/**
 * "reduce, lessen, cut" → ["reduce","lessen","cut"].
 * 없음 토큰("—","N/A","없음" 등)·중복·공백은 제거하고 **순서는 보존**한다.
 */
export function relationTokens(raw: unknown): string[] {
  const src = collapse(raw);
  if (!src) return [];
  // ❗분리자보다 먼저 "문자열 전체가 없음 표기"인지 본다 — SPLIT_RE 가 "/" 를 쪼개므로
  //   "N/A" 를 먼저 걸러내지 않으면 ["N","A"] 라는 가짜 관계어가 만들어진다.
  const whole = relKey(src).replace(/\s+/g, "");
  if (!whole || NONE_TOKENS.has(whole) || DASH_ONLY_RE.test(whole)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const piece of src.split(SPLIT_RE)) {
    const t = collapse(piece);
    if (!t) continue;
    const k = relKey(t);
    // 대시류는 relKey 단계에서 글자가 전부 날아가지 않으므로 별도 판정한다.
    if (!k || NONE_TOKENS.has(k) || DASH_ONLY_RE.test(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export interface NormalizeVocabOptions {
  /** 동의어 상한(기본 2). */
  maxSynonyms?: number;
  /** 반의어 상한(기본 2). */
  maxAntonyms?: number;
  /** 표제어(자기·타 행)와 같은 관계어 제거(기본 true) — 연결 문제에서 중의적이다. */
  dropHeadwordCollisions?: boolean;
  /** 교차관계·행간 중복 충돌 해소(기본 true). 교사 수동 저장 경로에서는 false 권장. */
  resolveConflicts?: boolean;
  /** 빈 셀을 "—" 로 통일(기본 true). */
  fillEmptyWithDash?: boolean;
}

export interface VocabNormalizeStats {
  rows: number;
  /** 상한 초과로 잘린 행 수. */
  synTruncated: number;
  antTruncated: number;
  /** 반의어가 비어 "—" 로 채워진 행 수. */
  antFilledDash: number;
  /** 충돌로 제거된 관계어 토큰 수. */
  conflictsDropped: number;
  /** 실제 반의어가 1개 이상 남은 행 비율(0~1). */
  antCoverage: number;
}

type Rel = "syn" | "ant";

/**
 * 어휘 rows 를 정규화한다(순수함수 — 입력 불변, 같은 입력 → 같은 출력, 멱등).
 */
export function normalizeVocabularyRows<T extends Record<string, unknown>>(
  rows: readonly T[],
  opts: NormalizeVocabOptions = {},
): { rows: T[]; stats: VocabNormalizeStats } {
  const maxSyn = Math.max(1, opts.maxSynonyms ?? MAX_SYNONYMS);
  const maxAnt = Math.max(1, opts.maxAntonyms ?? MAX_ANTONYMS);
  const dropHead = opts.dropHeadwordCollisions ?? true;
  const resolve = opts.resolveConflicts ?? true;
  const fillDash = opts.fillEmptyWithDash ?? true;

  const stats: VocabNormalizeStats = {
    rows: rows.length,
    synTruncated: 0,
    antTruncated: 0,
    antFilledDash: 0,
    conflictsDropped: 0,
    antCoverage: 0,
  };
  if (rows.length === 0) return { rows: [], stats };

  // 1) 토큰화 + 표제어 충돌 제거
  const heads = new Set<string>();
  for (const r of rows) {
    const k = relKey(collapse(r.headword));
    if (k) heads.add(k);
  }
  const lists: Record<Rel, string[]>[] = rows.map((r) => {
    const own = relKey(collapse(r.headword));
    const pick = (raw: unknown): string[] =>
      relationTokens(raw).filter((t) => {
        const k = relKey(t);
        if (!k || k === own) return false; // 자기 표제어 = 무의미
        return dropHead ? !heads.has(k) : true; // 다른 행의 표제어 = 중의적
      });
    return { syn: pick(r.synonyms), ant: pick(r.antonyms) };
  });

  // 2) 충돌 해소 — 우선순위: 앞자리(pos) → 앞행(row). 1순위 주장자가 그 단어를 갖는다.
  //    교차관계(동의어↔반의어) 충돌은 무조건 제거한다(문항 정답 2개 방지).
  //    같은 관계끼리의 중복은 그 행의 '마지막 남은 한 개'까지 지우지는 않는다
  //    (빈 셀 방지 — 우측값 유일성은 소비자가 이미 별도로 보장한다:
  //     compile.ts buildMatchItem, study-activities.ts buildVocabMatch).
  if (resolve) {
    type Claim = { row: number; rel: Rel; pos: number };
    const claims = new Map<string, Claim[]>();
    lists.forEach((l, row) => {
      (["syn", "ant"] as const).forEach((rel) => {
        l[rel].forEach((t, pos) => {
          const k = relKey(t);
          if (!k) return;
          const arr = claims.get(k);
          if (arr) arr.push({ row, rel, pos });
          else claims.set(k, [{ row, rel, pos }]);
        });
      });
    });
    for (const [k, arr] of claims) {
      if (arr.length < 2) continue;
      const crossRel = new Set(arr.map((c) => c.rel)).size > 1;
      const sorted = [...arr].sort((a, b) => a.pos - b.pos || a.row - b.row);
      for (const c of sorted.slice(1)) {
        const list = lists[c.row][c.rel];
        if (!crossRel && list.length <= 1) continue; // 빈 셀 방지(같은 관계 중복만)
        const idx = list.findIndex((t) => relKey(t) === k);
        if (idx >= 0) {
          list.splice(idx, 1);
          stats.conflictsDropped += 1;
        }
      }
    }
  }

  // 3) 상한 절단 + "—" 통일 + 통계
  let antCovered = 0;
  const out = rows.map((r, i) => {
    const syn = lists[i].syn;
    const ant = lists[i].ant;
    if (syn.length > maxSyn) stats.synTruncated += 1;
    if (ant.length > maxAnt) stats.antTruncated += 1;
    const synOut = syn.slice(0, maxSyn);
    const antOut = ant.slice(0, maxAnt);
    if (antOut.length > 0) antCovered += 1;
    else stats.antFilledDash += 1;
    const next: Record<string, unknown> = { ...r };
    next.synonyms = synOut.length ? synOut.join(", ") : fillDash ? REL_NONE : "";
    next.antonyms = antOut.length ? antOut.join(", ") : fillDash ? REL_NONE : "";
    return next as T;
  });
  stats.antCoverage = antCovered / rows.length;
  return { rows: out, stats };
}

/**
 * 편집기 '시험지에서 제외' 키 — components/…/report-sections/vocabulary.tsx 의
 * vocabTestRowKey 와 **반드시 동일 규칙**이어야 한다(정규화 후 재매핑용).
 */
export function vocabRowKey(row: Record<string, unknown>): string {
  return [row.headword, row.pronunciation ?? "", row.meaning, row.synonyms ?? ""]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .join("\u001f");
}

/**
 * 정규화로 바뀐 row 키에 맞춰 vocabTestExcludedKeys 를 재매핑한다.
 * 재매핑이 없으면 synonyms 가 바뀌는 순간 교사의 '시험지에서 제외' 선택이 조용히 풀린다.
 * 바꿀 것이 없으면 undefined 를 돌려준다(호출부가 필드를 건드리지 않게).
 */
export function remapVocabExcludedKeys(
  beforeKeys: readonly string[],
  afterRows: readonly Record<string, unknown>[],
  excluded: readonly string[] | undefined,
): string[] | undefined {
  if (!excluded || excluded.length === 0) return undefined;
  const remap = new Map<string, string>();
  beforeKeys.forEach((before, i) => {
    const row = afterRows[i];
    if (!row) return;
    const after = vocabRowKey(row);
    if (before !== after) remap.set(before, after);
  });
  if (remap.size === 0) return undefined;
  return Array.from(
    new Set(excluded.filter((k): k is string => typeof k === "string").map((k) => remap.get(k) ?? k)),
  );
}

/** 섹션 단위 정규화 — rows 정규화 + vocabTestExcludedKeys 재매핑(순수·멱등). */
export function normalizeVocabularySection<S extends Record<string, unknown>>(
  section: S,
  opts: NormalizeVocabOptions = {},
): { section: S; stats: VocabNormalizeStats } {
  const rawRows: Record<string, unknown>[] = Array.isArray(section.rows)
    ? (section.rows as Record<string, unknown>[])
    : [];
  const beforeKeys = rawRows.map((r) => vocabRowKey(r));
  const { rows, stats } = normalizeVocabularyRows(rawRows, opts);
  const next: Record<string, unknown> = { ...section, rows };

  const excluded = Array.isArray(section.vocabTestExcludedKeys)
    ? (section.vocabTestExcludedKeys as unknown[]).filter((k): k is string => typeof k === "string")
    : undefined;
  const remapped = remapVocabExcludedKeys(beforeKeys, rows, excluded);
  if (remapped) next.vocabTestExcludedKeys = remapped;

  return { section: next as S, stats };
}

/** 반의어 커버리지(실제 반의어가 있는 행 비율). 정규화 전후 어느 rows 에도 쓸 수 있다. */
export function antonymCoverage(rows: readonly Record<string, unknown>[]): number {
  if (rows.length === 0) return 0;
  const covered = rows.filter((r) => relationTokens(r.antonyms).length > 0).length;
  return covered / rows.length;
}

/**
 * 반의어 커버리지 경고 문구 — 계측/재생성 유도용. 합격이면 null.
 *
 * ❗ 이 함수는 **저장을 막지 않는다**. 커버리지 미달로 섹션을 탈락시키면 재개·최종
 * 재조립에서 vocabulary 가 통째로 사라지고, 재생성은 섹션 예산(10000토큰)을 태운다.
 * 문구가 '반의어를 채워라'가 아니라 '반의어가 성립하는 표제어를 더 고르라'인 이유는
 * 프롬프트의 날조 금지 계약과 충돌하지 않게 하기 위함이다(실사고 C-1/C-2).
 */
export function vocabularyQualityIssue(
  rows: readonly Record<string, unknown>[],
  minCoverage: number = MIN_ANTONYM_COVERAGE,
): string | null {
  if (rows.length < 5) return null; // 표본 부족 — 판정하지 않는다
  const cov = antonymCoverage(rows);
  if (cov >= minCoverage) return null;
  const pct = Math.round(cov * 100);
  const need = Math.round(minCoverage * 100);
  const covered = Math.round(cov * rows.length);
  return (
    `반의어 커버리지 ${pct}% (${covered}/${rows.length}행) — 최소 ${need}% 필요. ` +
    `**반의어를 지어내지 마라.** 대신 표제어 선정을 다시 하라: 반대 개념이 분명한 어휘` +
    `(동사·형용사·정도/방향/증감 표현, 예: expand↔contract, explicit↔implicit)를 rows 의 ` +
    `절반 이상 포함시켜라. 반대말이 없는 중립 명사구는 antonyms 를 "${REL_NONE}" 로 두되 그런 행이 ` +
    `절반을 넘지 않게 구성하라. synonyms 는 정확한 것 최대 ${MAX_SYNONYMS}개(맨 앞이 1순위).`
  );
}
