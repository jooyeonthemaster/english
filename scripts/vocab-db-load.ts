/**
 * 기출 단어 코퍼스 → DB 적재기 (vocab_drill_* 콘텐츠 7테이블)
 *
 * build/lemmas.json (+ stats.json / phrase-stats.json 의 연도별 시계열) 을
 * prisma/sql/vocab-drill-init.sql 이 만든 테이블에 **멱등하게** 밀어 넣는다.
 *
 * ── 안전설계 (scripts/normalize-vocab-corpus.ts 관례) ────────────────────────
 *  1. dry-run 이 기본. --apply 를 줘야 한 글자라도 쓴다.
 *  2. 기본 dry-run 은 **DB 에 접속조차 하지 않는다**(순수 오프라인 검증 + 계획).
 *     DB 를 읽어 insert/update 를 가르고 싶으면 --diff 를 준다.
 *  3. 적재 전 형상 검증이 먼저다. 필수 키 누락·타입 불일치·ID 해시 충돌을
 *     전부 모아 보고하고, 하나라도 있으면 멈춘다(--force 로만 통과, 불량은 스킵).
 *  4. 멱등 — id 가 내용 주소(content-addressed)라 두 번 돌려도 같은 행이 UPDATE 된다.
 *  5. 파괴적 조작 없음 — DELETE/TRUNCATE 를 하지 않는다. 사라진 콘텐츠는
 *     --sweep 이 "retiredAt" 을 찍을 뿐이고, 학생 학습 데이터는 절대 건드리지 않는다.
 *     (숙달도 이관은 SQL 계획만 출력한다 — 실행은 사람이 승인한 뒤 별도로.)
 *
 * ── ID 규칙 (prisma/sql/vocab-drill-init.sql §1 결정 2 와 동일해야 한다) ────
 *   lemmaId   = sha1(lower(lemma) '\x1f' pos).slice(0,16)
 *   senseId   = **sense-registry.json 이 정본**. 신규 발급 시의 주조 규칙만
 *               lemmaId ':' sha1(normSense(senseKey)).slice(0,8) 이다.
 *               한 번 발급된 senseId 는 정의문이 바뀌어도 그대로 간다(spec §11.2).
 *   exampleId = sha1(senseId '\x1f' passageId '\x1f' sentenceIndex '\x1f' surface).slice(0,16)
 *   trapId    = sha1(senseId '\x1f' kind '\x1f' note).slice(0,16)
 *   ★ 번들 버전을 해시 입력에 넣지 않는다 — 넣으면 재빌드마다 ID 가 바뀌어
 *     학생 숙달도(vocab_drill_mastery.senseId)가 전부 고아가 된다.
 *
 * ── sense 승계는 유사도가 아니라 출처로 판정한다 (spec §11 / 적대검수 major-4) ──
 * 이전 판(2026-07-28 이전)은 은퇴 sense 를 생존 sense 에 **정의문 Jaccard 유사도**로
 * 자동 재접합했다. 그 장치는 제거됐다. 근거는 vocab-sense-registry.ts 머리말과
 * docs/vocab-corpus-spec.md §11 에 있다. 요약:
 *   · 생존 sense 1개인 표제어(64.9%)에서 유사도를 계산조차 않고 죽은 뜻을 흡수했다
 *   · DO NOTHING 이라 최초 1회로 굳어 재실행해도 정정되지 않았다
 * 지금은 `passageId#sentenceIndex#surface` 출처 집합이 **1:1 로 모호하지 않을 때만**
 * 승계한다. 병합·분할이 의심되면 잇지 않고 새 id 를 발급한다 — 잘못 잇는 것보다 낫다.
 * vocab_drill_sense_aliases 는 **명시적 판정(4단계 산출·사람)만** 채운다.
 *
 * ── 사용법 ──────────────────────────────────────────────────────────────────
 *   # 1) 검증만 (DB 접속 없음)
 *   npx tsx scripts/vocab-db-load.ts --file=experiments/vocab-corpus-20260728/build/lemmas.json \
 *     --stats=experiments/vocab-corpus-20260728/stats.json \
 *     --phrase-stats=experiments/vocab-corpus-20260728/phrase-stats.json
 *
 *   # 2) DB 와 대조 (읽기만)
 *   npx tsx --env-file-if-exists=.env --env-file-if-exists=.env.local \
 *     scripts/vocab-db-load.ts --file=…/build/lemmas.json --diff
 *
 *   # 3) 실제 적재 (첫 세대 senseId 발급이면 --registry-init 이 필요하다)
 *   npx tsx --env-file-if-exists=.env --env-file-if-exists=.env.local \
 *     scripts/vocab-db-load.ts --file=…/build/lemmas.json \
 *       --stats=experiments/vocab-corpus-20260728/stats.json \
 *       --phrase-stats=experiments/vocab-corpus-20260728/phrase-stats.json \
 *       --apply --registry-init --sweep --activate
 *
 *   플래그: --version=<수동버전> --limit=N --only=lemmas,senses,… --chunk=400
 *           --registry=<경로>(기본: lemmas.json 옆 sense-registry.json)
 *           --registry-init(레지스트리 최초 생성 승인) --verbose
 *           --force(검증 실패 무시하고 불량 스킵 — **--sweep 과 함께 쓸 수 없다**)
 *
 * ⚠️ 이 스크립트는 테이블을 만들지 않는다. 먼저
 *    `npx prisma db execute --file prisma/sql/vocab-drill-init.sql` 이 적용돼 있어야 한다.
 *    (DDL 집행은 사용자 승인 사항이다.)
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  loadStatsIndex, aggregateLemma, gradeTopOf, skew, GRADES as AGG_GRADES,
  type StatsIndex, type LemmaAgg,
} from "./vocab-stats-agg";
import {
  SenseRegistry, loadRegistry, saveRegistry, defaultRegistryPath, memberKey,
  type NewSense,
} from "./vocab-sense-registry";

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 구/숙어로 취급하는 품사 — quant.isPhrase 가 없을 때의 대체 판정. */
const PHRASE_POS = new Set(["idiom", "phrasal_verb", "collocation"]);
/** 알려진 품사 9종(실측). 벗어나면 경고만 하고 적재는 계속한다. */
const KNOWN_POS = new Set([
  "noun", "verb", "adjective", "adverb", "preposition", "conjunction",
  "idiom", "phrasal_verb", "collocation",
]);
/** tier 오름차순 — 대표 tier 는 관측된 것 중 **가장 높은 것**을 쓴다.
 *  근거: 실측 13,783 중 97.4%(13,426)가 tiers 길이 1 이라 사실상 무영향이고,
 *  갈리는 357건에서는 단어장 난이도를 **과소평가하지 않는 쪽**이 안전하다. */
const TIER_RANK = ["basic", "core", "academic", "advanced"];
const GRADES = ["고1", "고2", "고3"];

// ── 인자 ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = (k: string) => argv.includes(`--${k}`);

const OPT = {
  file: arg("file") ?? "experiments/vocab-corpus-20260728/build/lemmas.json",
  stats: arg("stats") ?? null,
  phraseStats: arg("phrase-stats") ?? null,
  registry: arg("registry") ?? null,
  registryInit: has("registry-init"),
  version: arg("version") ?? null,
  limit: Number(arg("limit") ?? 0) || 0,
  only: (arg("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  chunk: Math.max(50, Math.min(1000, Number(arg("chunk") ?? 400) || 400)),
  apply: has("apply"),
  diff: has("diff") || has("apply"),
  sweep: has("sweep"),
  activate: has("activate"),
  force: has("force"),
  verbose: has("verbose"),
};
const wants = (t: string) => OPT.only.length === 0 || OPT.only.includes(t);

// ── 형상 검증 스키마 ─────────────────────────────────────────────────────────
// 실측(6,860 표제어 / 13,783 뜻 / 16,604 예문 / 5,989 함정)으로 확인된 형상.
// 필수로 잡은 것은 "없으면 학습 콘텐츠가 성립하지 않는 것"뿐이고, 통계 계열은
// 전부 nullable 이다 — quant 미부착 표제어가 실제로 31건 존재한다.

const zExample = z.object({
  passageId: z.string().min(1),
  sentenceIndex: z.number().int().min(0),
  grade: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  typeGroup: z.string().nullable().optional(),
  surface: z.string(),
  en: z.string(),
  ko: z.string(),
});
const zTrap = z.object({ kind: z.string().min(1), note: z.string().min(1) });
const zTrend = z.object({
  label: z.string().nullable().optional(),
  ratio: z.number().nullable().optional(),
  slope: z.number().nullable().optional(),
  earlyPer10k: z.number().nullable().optional(),
  latePer10k: z.number().nullable().optional(),
  yearsPresent: z.number().nullable().optional(),
  longestGap: z.number().nullable().optional(),
  basis: z.string().nullable().optional(),
});
const zQuant = z.object({
  surfaces: z.array(z.string()).optional(),
  totalOccurrences: z.number().nullable().optional(),
  passageCount: z.number().nullable().optional(),
  per10k: z.number().nullable().optional(),
  trend: zTrend.nullable().optional(),
  gradeSkew: z.number().nullable().optional(),
  per10kByGrade: z.record(z.string(), z.number()).nullable().optional(),
  typeSkew: z.number().nullable().optional(),
  topTypes: z.array(z.object({ typeGroup: z.string(), per10k: z.number() })).optional(),
  isPhrase: z.boolean().nullable().optional(),
  zeroKind: z.string().nullable().optional(),
});
const zSense = z.object({
  senseKey: z.string().min(1),
  senseEnVariants: z.array(z.string()).optional(),
  senseKoCandidates: z.array(z.object({ ko: z.string(), n: z.number() })).optional(),
  senseKoProvisional: z.string().min(1), // 실측 공백 0건 — 비면 학습 불가라 필수로 잡는다
  occurrences: z.number().nullable().optional(),
  tiers: z.array(z.string()).optional(),
  difficultyAvg: z.number().nullable().optional(),
  trapRate: z.number().nullable().optional(),
  trapKinds: z.record(z.string(), z.number()).nullable().optional(),
  examples: z.array(zExample).optional(),
  traps: z.array(zTrap).optional(),
});
const zLemma = z.object({
  lemma: z.string().min(1),
  pos: z.string().min(1),
  totalEntries: z.number().nullable().optional(),
  senseCount: z.number().nullable().optional(),
  needsMergeJudgment: z.boolean().nullable().optional(),
  senses: z.array(zSense).min(1),
  confusable: z.array(z.string()).optional(),
  collocations: z.array(z.string()).optional(),
  quant: zQuant.nullable().optional(),
});
type Lemma = z.infer<typeof zLemma>;

const LEMMA_KEYS = new Set(Object.keys(zLemma.shape));
const SENSE_KEYS = new Set(Object.keys(zSense.shape));

// ── 유틸 ─────────────────────────────────────────────────────────────────────

const sha1 = (s: string) => crypto.createHash("sha1").update(s, "utf8").digest("hex");
const US = ""; // unit separator — 해시 입력 구분자(본문에 등장하지 않는다)

/** scripts/vocab-corpus-build.ts:41-48 의 normSense 와 **동일 규칙**이어야 한다. */
function normSense(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(to|a|an|the)\s+/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const lemmaIdOf = (lemma: string, pos: string) =>
  sha1(`${lemma.trim().toLowerCase()}${US}${pos}`).slice(0, 16);
/**
 * senseId **주조** 규칙 — 신규 발급 때만 쓴다. 정본은 sense-registry.json 이다(spec §11.2).
 * attempt>1 은 내용주소가 이미 다른 sense 에 점유됐을 때의 결정적 재해시.
 */
const senseIdOf = (lemmaId: string, senseKey: string, attempt = 1) =>
  `${lemmaId}:${sha1(attempt === 1 ? normSense(senseKey) : `${normSense(senseKey)}${US}${attempt}`).slice(0, 8)}`;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const fmt = (n: number) => n.toLocaleString("en-US");

/** 대표 tier — TIER_RANK 상 가장 높은 것. 알 수 없으면 'core'. */
function topTier(tiers: string[] | undefined): string {
  let best = -1;
  for (const t of tiers ?? []) { const i = TIER_RANK.indexOf(t); if (i > best) best = i; }
  return best >= 0 ? TIER_RANK[best] : "core";
}
// ⛔ jaccard() 는 제거됐다. 정의문 문자열 유사도로 sense 동일성을 판정하던
//    자동 alias 장치가 여기 있었다(적대검수 major-4 / spec §11.1).
//    승계 판정은 scripts/vocab-sense-registry.ts 가 **출처 집합**으로만 한다.
//    새로 되살리지 마라 — 3단계 선병합이 같은 이유로 실패했다.

// ── 행 모양 ──────────────────────────────────────────────────────────────────
// 컬럼 정의는 SQL 과 1:1 로 맞춘다. cast 가 있는 컬럼은 문자열로 넘기고 SQL 에서 캐스팅한다.

type Col = { name: string; cast?: string };
const C = (name: string, cast?: string): Col => ({ name, cast });
const J = (v: unknown) => JSON.stringify(v ?? null);

const LEMMA_COLS: Col[] = [
  C("id"), C("bundleVersion"), C("lemma"), C("pos"), C("isPhrase"), C("senseCount"),
  C("totalEntries"), C("needsMergeJudgment"), C("confusable", "jsonb"), C("collocations", "jsonb"),
  C("surfaces", "jsonb"), C("totalOccurrences"), C("passageCount"), C("per10k"),
  C("per10kGo1"), C("per10kGo2"), C("per10kGo3"), C("gradeTop"), C("gradeSkew"),
  C("typeSkew"), C("topTypes", "jsonb"), C("trendLabel"), C("trendRatio"), C("trendSlope"),
  C("earlyPer10k"), C("latePer10k"), C("yearsPresent"), C("longestGap"), C("trendBasis"),
  C("zeroKind"), C("retiredAt"),
];
const SENSE_COLS: Col[] = [
  C("id"), C("bundleVersion"), C("lemmaId"), C("lemma"), C("pos"), C("senseKey"),
  C("senseKeyNorm"), C("senseEn"), C("senseEnVariants", "jsonb"), C("senseKo"),
  C("senseKoCandidates", "jsonb"), C("tier"), C("tiers", "jsonb"), C("difficulty"),
  C("difficultyAvg"), C("occurrences"), C("exampleCount"), C("trapCount"), C("trapRate"),
  C("trapKinds", "jsonb"), C("senseOrder"), C("needsMergeJudgment"), C("isPhrase"),
  C("per10k"), C("gradeTop"), C("trendLabel"), C("retiredAt"),
];
const EXAMPLE_COLS: Col[] = [
  C("id"), C("bundleVersion"), C("senseId"), C("lemmaId"), C("passageId"), C("sentenceIndex"),
  C("grade"), C("year"), C("typeGroup"), C("surface"), C("en"), C("ko"), C("ord"), C("retiredAt"),
];
const TRAP_COLS: Col[] = [
  C("id"), C("bundleVersion"), C("senseId"), C("lemmaId"), C("kind"), C("note"), C("ord"), C("retiredAt"),
];
// ★ basis(표면형 1개) → basisSurfaces(합산에 쓴 행 전량) + totalOccurrences 로 확장.
//   "이 그래프가 무엇의 합계인지"를 행 자신이 증언해야 목록 수치와 대조할 수 있다.
const YEAR_COLS: Col[] = [
  C("lemmaId"), C("bundleVersion"), C("statsSource"), C("basis"), C("basisSurfaces", "jsonb"),
  C("totalOccurrences"), C("byYear", "jsonb"),
  C("per10kByYear", "jsonb"), C("byGrade", "jsonb"), C("per10kByGrade", "jsonb"),
  C("byType", "jsonb"), C("byBoard", "jsonb"), C("yearMin"), C("yearMax"),
  C("yearsPresent"), C("longestGap"), C("gapFrom"), C("gapTo"),
];

type Rows = { lemmas: unknown[][]; senses: unknown[][]; examples: unknown[][]; traps: unknown[][]; years: unknown[][] };

// ── 검증 + 셰이핑 ────────────────────────────────────────────────────────────

type Issue = { path: string; message: string; sample: string };

/** major-1 실측용 — 표제어 총출현 대비 연도통계 합계가 얼마나 맞는지. */
type YearAudit = {
  matched: number; missed: number;
  lemmaTotal: number; yearTotal: number;
  exact: number; drift: number;
  unresolvedSurfaces: number;
  yearMinFull: number; yearMaxFull: number; spanFull: number;
  presentDiffersFromBasis: number;
};

function shape(
  raw: unknown[], version: string,
  statsIdx: StatsIndex | null,
  registry: SenseRegistry,
) {
  const rows: Rows = { lemmas: [], senses: [], examples: [], traps: [], years: [] };
  const issues: Issue[] = [];
  const warn = new Map<string, number>();
  const bump = (k: string) => warn.set(k, (warn.get(k) ?? 0) + 1);

  const lemmaIdSeen = new Map<string, string>(); // id → 자연키 (해시 충돌 감지)
  const exampleIdSeen = new Set<string>();
  const trapIdSeen = new Set<string>();
  const audit: YearAudit = {
    matched: 0, missed: 0, lemmaTotal: 0, yearTotal: 0, exact: 0, drift: 0,
    unresolvedSurfaces: 0, yearMinFull: 0, yearMaxFull: 0, spanFull: 0,
    presentDiffersFromBasis: 0,
  };

  let skipped = 0;

  for (let i = 0; i < raw.length; i++) {
    const parsed = zLemma.safeParse(raw[i]);
    if (!parsed.success) {
      skipped++;
      const label = (raw[i] as { lemma?: string })?.lemma ?? `#${i}`;
      for (const e of parsed.error.issues.slice(0, 4)) {
        issues.push({ path: e.path.join("."), message: e.message, sample: String(label) });
      }
      continue;
    }
    const L: Lemma = parsed.data;

    // 알려지지 않은 키/값은 경고만 — 코퍼스가 계속 자라므로 적재를 막지 않는다.
    for (const k of Object.keys(raw[i] as object)) if (!LEMMA_KEYS.has(k)) bump(`미지의 표제어 키: ${k}`);
    if (!KNOWN_POS.has(L.pos)) bump(`미지의 pos: ${L.pos}`);

    const q = L.quant ?? null;
    const lemmaId = lemmaIdOf(L.lemma, L.pos);
    const natural = `${L.lemma.trim().toLowerCase()}|${L.pos}`;
    const prev = lemmaIdSeen.get(lemmaId);
    if (prev && prev !== natural) {
      issues.push({ path: "lemmaId", message: `해시 충돌: ${prev} ↔ ${natural}`, sample: lemmaId });
      continue;
    }
    if (prev === natural) { bump("중복 표제어(lemma+pos)"); continue; }
    lemmaIdSeen.set(lemmaId, natural);

    const isPhrase = q?.isPhrase ?? PHRASE_POS.has(L.pos);
    const per10k = num(q?.per10k);
    const trend = q?.trend ?? null;
    const trendLabel = trend?.label ?? null;

    if (!q) bump("quant 미부착 표제어(통계 컬럼 NULL 로 적재)");

    // ── 연도/학년/유형 시계열: **표제어가 실현한 모든 표면형의 합** (major-1) ──
    //    basis 한 표면형만 싣던 옛 방식은 코퍼스 합계의 12.5% 를 잃었고 목록의
    //    per10k 와 상세 그래프가 서로 다른 값을 말했다. 합산 규칙은
    //    vocab-corpus-build.ts quantFor 와 동일하다(vocab-stats-agg.ts 머리말).
    let agg: LemmaAgg | null = null;
    if (statsIdx && q) {
      agg = aggregateLemma(statsIdx, L.lemma, q.surfaces ?? []);
      if (!agg) { audit.missed++; bump("통계 행을 하나도 해소하지 못한 표제어"); }
      else {
        audit.matched++;
        audit.unresolvedSurfaces += agg.unresolved.length;
        const lemmaTot = num(q.totalOccurrences) ?? 0;
        audit.lemmaTotal += lemmaTot;
        audit.yearTotal += agg.total;
        if (agg.total === lemmaTot) audit.exact++; else audit.drift++;
        if (agg.yearMin === statsIdx.meta.years[0]) audit.yearMinFull++;
        if (agg.yearMax === statsIdx.meta.years[statsIdx.meta.years.length - 1]) audit.yearMaxFull++;
        if (agg.yearMin === statsIdx.meta.years[0]
            && agg.yearMax === statsIdx.meta.years[statsIdx.meta.years.length - 1]) audit.spanFull++;
        // 원본 신호(basis 행의 yearsPresent)와의 정합 — 합산하면 늘어나는 게 정상이다.
        const basisPresent = num(trend?.yearsPresent);
        if (basisPresent !== null && basisPresent !== agg.yearsPresent) audit.presentDiffersFromBasis++;
        if (basisPresent !== null && agg.yearsPresent < basisPresent) {
          issues.push({
            path: "yearStats.yearsPresent",
            message: `합산 등장연수(${agg.yearsPresent}) < basis 행(${basisPresent}) — 합산 규칙이 basis 행을 빠뜨렸다`,
            sample: `${L.lemma}/${L.pos}`,
          });
        }
      }
    }

    // 학년 축은 **필터 축**(Q1 학년별 단어장)이라 목록·상세가 어긋나면 바로 드러난다.
    // 통계 파일이 있으면 합산값으로, 없으면 종전처럼 quant(=basis 행) 값으로 간다.
    const per10kByGrade = agg ? agg.per10kByGrade : (q?.per10kByGrade ?? null);
    const gradeTop = gradeTopOf(per10kByGrade);
    const gradeSkew = agg && statsIdx
      ? +skew(
          AGG_GRADES.map((g) => agg.byGrade[g] ?? 0),
          AGG_GRADES.map((g) => Number(statsIdx.meta.wordsByGrade[g] ?? 0)),
        ).toFixed(4)
      : num(q?.gradeSkew);

    if (wants("lemmas")) {
      rows.lemmas.push([
        lemmaId, version, L.lemma, L.pos, isPhrase, L.senses.length,
        num(L.totalEntries) ?? 0, L.needsMergeJudgment ?? false,
        J(L.confusable ?? []), J(L.collocations ?? []), J(q?.surfaces ?? []),
        num(q?.totalOccurrences), num(q?.passageCount), per10k,
        num(per10kByGrade?.["고1"]), num(per10kByGrade?.["고2"]), num(per10kByGrade?.["고3"]),
        gradeTop, gradeSkew,
        // ⚠️ typeSkew·topTypes 는 여전히 basis(lead) 행 값이다. 유형별 per10k 를
        //    다시 계산하려면 유형별 총단어수가 필요한데 stats.json meta 에 없다.
        //    topTypes 의 per10k 를 역산해 추정할 수는 있으나(실측 오차 0.02~0.69%),
        //    측정값 컬럼에 추정치를 넣지 않는다. 원천(vocab-corpus-stats.ts)이
        //    meta.wordsByType 를 산출하면 그때 합산으로 바꾼다.
        num(q?.typeSkew), J(q?.topTypes ?? []),
        trendLabel, num(trend?.ratio), num(trend?.slope), num(trend?.earlyPer10k),
        num(trend?.latePer10k), num(trend?.yearsPresent), num(trend?.longestGap),
        trend?.basis ?? null, q?.zeroKind ?? null, null,
      ]);
    }

    if (agg && wants("years")) {
      rows.years.push([
        lemmaId, version, agg.source, trend?.basis ?? null, J(agg.rowKeys),
        agg.total, J(agg.byYear), J(agg.per10kByYear), J(agg.byGrade), J(agg.per10kByGrade),
        J(agg.byType), J(agg.byBoard),
        agg.yearMin, agg.yearMax, agg.yearsPresent, agg.longestGap, agg.gapFrom, agg.gapTo,
      ]);
    }

    // ── senseId 확정 — 정본은 sense-registry.json (spec §11.2) ──
    // 정규화 후 같은 정의문은 한 번만 싣는다(레지스트리에 중복 후보를 주지 않는다).
    type Pending = { S: (typeof L.senses)[number]; si: number; keyNorm: string; members: string[] };
    const pending: Pending[] = [];
    const normSeen = new Set<string>();
    for (let si = 0; si < L.senses.length; si++) {
      const S = L.senses[si];
      for (const k of Object.keys(S as object)) if (!SENSE_KEYS.has(k)) bump(`미지의 sense 키: ${k}`);
      const keyNorm = normSense(S.senseKey);
      if (!keyNorm) { issues.push({ path: "senseKey", message: "정규화 결과가 빈 문자열", sample: `${L.lemma}/${S.senseKey}` }); continue; }
      if (normSeen.has(keyNorm)) { bump("중복 sense(정규화 후 동일)"); continue; }
      normSeen.add(keyNorm);
      pending.push({
        S, si, keyNorm,
        members: (S.examples ?? []).map((e) => memberKey(e.passageId, e.sentenceIndex, e.surface)),
      });
    }
    if (!pending.length) continue;

    const payload: NewSense[] = pending.map((p) => ({
      contentId: senseIdOf(lemmaId, p.S.senseKey),
      senseKey: p.S.senseKey,
      members: p.members,
    }));
    const assigned = registry.resolveLemma(
      lemmaId, L.lemma, L.pos, payload,
      (idx, attempt) => senseIdOf(lemmaId, pending[idx].S.senseKey, attempt),
    );

    for (let pi = 0; pi < pending.length; pi++) {
      const { S, si, keyNorm } = pending[pi];
      const senseId = assigned[pi].senseId;

      const examples = S.examples ?? [];
      const traps = S.traps ?? [];
      const diffAvg = num(S.difficultyAvg) ?? 3;

      if (wants("senses")) {
        rows.senses.push([
          senseId, version, lemmaId, L.lemma, L.pos, S.senseKey, keyNorm,
          S.senseKey, J(S.senseEnVariants ?? []),
          S.senseKoProvisional, J(S.senseKoCandidates ?? []),
          topTier(S.tiers), J(S.tiers ?? []), clampInt(diffAvg, 1, 5), diffAvg,
          num(S.occurrences) ?? 0, examples.length, traps.length, num(S.trapRate) ?? 0,
          J(S.trapKinds ?? {}), si, L.needsMergeJudgment ?? false, isPhrase,
          per10k, gradeTop, trendLabel, null,
        ]);
      }

      if (wants("examples")) {
        for (let ei = 0; ei < examples.length; ei++) {
          const E = examples[ei];
          const id = sha1(`${senseId}${US}${E.passageId}${US}${E.sentenceIndex}${US}${E.surface}`).slice(0, 16);
          if (exampleIdSeen.has(id)) { bump("중복 예문(동일 지문·문장·굴절형)"); continue; }
          exampleIdSeen.add(id);
          if (E.grade && !GRADES.includes(E.grade)) bump(`미지의 grade: ${E.grade}`);
          rows.examples.push([
            id, version, senseId, lemmaId, E.passageId, E.sentenceIndex,
            E.grade ?? null, num(E.year), E.typeGroup ?? null, E.surface, E.en, E.ko, ei, null,
          ]);
        }
      }

      if (wants("traps")) {
        for (let ti = 0; ti < traps.length; ti++) {
          const T = traps[ti];
          const id = sha1(`${senseId}${US}${T.kind}${US}${T.note}`).slice(0, 16);
          if (trapIdSeen.has(id)) { bump("중복 함정(동일 kind·note)"); continue; }
          trapIdSeen.add(id);
          rows.traps.push([id, version, senseId, lemmaId, T.kind, T.note, ti, null]);
        }
      }
    }
  }
  return { rows, issues, warn, skipped, audit };
}

// ── 벌크 upsert ──────────────────────────────────────────────────────────────
// 10만 행 단위라 prisma.model.upsert() 를 행마다 부르면 왕복이 10만 번이다.
// 다중 VALUES + ON CONFLICT DO UPDATE 를 파라미터 바인딩으로 청크 실행한다.
// (schema.prisma 에 모델을 아직 손으로 안 넣었어도 동작한다는 부수 효과가 있다.)

function tuple(cols: Col[], row: unknown[]) {
  return Prisma.sql`(${Prisma.join(
    cols.map((c, i) => (c.cast ? Prisma.sql`${row[i]}::${Prisma.raw(c.cast)}` : Prisma.sql`${row[i]}`)),
  )})`;
}

type UpsertOpts = {
  /** 충돌 시 기존 행을 그대로 둔다. alias 처럼 "먼저 정해진 매핑이 이긴다" 인 경우. */
  doNothing?: boolean;
  /** 테이블에 updatedAt 컬럼이 없으면 false. (vocab_drill_sense_aliases 가 그렇다) */
  touchUpdatedAt?: boolean;
  /** INSERT 시에만 쓰고 재적재 때는 덮지 않을 컬럼(예: 번들 status — 소유자는 --activate 다). */
  skipUpdate?: string[];
};

async function bulkUpsert(
  db: PrismaClient, table: string, cols: Col[], rows: unknown[][], conflict: string[],
  opts: UpsertOpts = {},
): Promise<number> {
  if (!rows.length) return 0;
  const { doNothing = false, touchUpdatedAt = true, skipUpdate = [] } = opts;
  const colList = Prisma.raw(cols.map((c) => `"${c.name}"`).join(", "));
  const conflictList = Prisma.raw(conflict.map((c) => `"${c}"`).join(", "));
  // id 와 createdAt 은 갱신 대상이 아니다(PK 를 같은 값으로 덮어쓰지 않는다).
  const updatable = cols.filter(
    (c) => !conflict.includes(c.name) && c.name !== "createdAt" && c.name !== "id"
      && !skipUpdate.includes(c.name),
  );
  const action = doNothing
    ? Prisma.raw("DO NOTHING")
    : Prisma.raw(
        `DO UPDATE SET ${[
          ...updatable.map((c) => `"${c.name}" = EXCLUDED."${c.name}"`),
          ...(touchUpdatedAt ? [`"updatedAt" = CURRENT_TIMESTAMP`] : []),
        ].join(", ")}`,
      );
  let n = 0;
  for (let i = 0; i < rows.length; i += OPT.chunk) {
    const slice = rows.slice(i, i + OPT.chunk);
    const values = Prisma.join(slice.map((r) => tuple(cols, r)));
    n += await db.$executeRaw`
      INSERT INTO ${Prisma.raw(`"${table}"`)} (${colList})
      VALUES ${values}
      ON CONFLICT (${conflictList}) ${action}
    `;
    if (OPT.verbose) process.stdout.write(`\r    ${table}: ${fmt(Math.min(i + OPT.chunk, rows.length))}/${fmt(rows.length)}`);
  }
  if (OPT.verbose) process.stdout.write("\n");
  return n;
}

// ── 은퇴 스윕 ────────────────────────────────────────────────────────────────
// ⛔ 이 자리에 있던 **자동 alias 생성**(정의문 Jaccard 유사도로 은퇴 sense 를 생존
//    sense 에 재접합)은 제거됐다. 근거: docs/vocab-corpus-spec.md §11 · 적대검수 major-4.
//    vocab_drill_sense_aliases 는 이제 **명시적 판정만** 채운다(4단계 LLM 병합 산출 또는
//    사람). 적재기는 매핑을 추측하지 않는다 — 근거 없는 sense 는 그냥 은퇴시키고,
//    딸린 숙달도는 고아로 둔다. 잘못 이어 붙이는 것보다 낫다(§11.2 "미상" 규칙).

type SenseRow = { id: string; lemmaId: string; senseKey: string };

/** IN 목록은 파라미터 상한(65535)이 있다. 5,000개씩 잘라 돌린다. */
async function chunkedIn<T>(ids: string[], run: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 5000) out.push(...(await run(ids.slice(i, i + 5000))));
  return out;
}

async function sweep(db: PrismaClient, version: string, skipped: number) {
  // ── 안전 가드 ──
  // 스윕은 "이번 번들이 확인하지 않은 행"을 은퇴시킨다. 즉 **전량·무결 실행**에서만
  // 성립한다. 하나라도 빠진 채 돌리면 멀쩡한 콘텐츠가 통째로 은퇴한다.
  if (OPT.only.length) { console.error("  ✗ --only 와 --sweep 은 함께 쓸 수 없다(부분 적재분이 전량 은퇴한다)."); return; }
  if (OPT.limit) { console.error("  ✗ --limit 과 --sweep 은 함께 쓸 수 없다(적재하지 않은 표제어가 전부 은퇴한다)."); return; }
  // ★ major-3: --force 는 검증 실패 표제어를 **스킵**한다. 스킵된 표제어의 행은
  //   upsert 되지 않아 bundleVersion 이 옛 값으로 남고, 아래 UPDATE 가 그 행을
  //   "이번 번들이 확인하지 않은 행"으로 오인해 **정상 콘텐츠를 은퇴시킨다.**
  if (OPT.force) {
    console.error("  ✗ --force 와 --sweep 은 함께 쓸 수 없다.");
    console.error("    --force 로 스킵된 표제어는 bundleVersion 이 갱신되지 않아 스윕이 정상 콘텐츠를 은퇴시킨다.");
    console.error("    형상 오류를 먼저 고치고 --force 없이 전량 적재한 뒤에 스윕하라.");
    return;
  }
  if (skipped > 0) {
    console.error(`  ✗ 스킵된 표제어가 ${fmt(skipped)}건 있다 — 스윕은 전량·무결 적재에서만 허용한다.`);
    return;
  }

  // 이번 번들이 확인하지 않은 sense = 은퇴 후보. 학습 데이터를 참조 중일 수 있으므로
  // 절대 DELETE 하지 않고 retiredAt 만 찍는다.
  const dying = await db.$queryRaw<SenseRow[]>`
    SELECT "id", "lemmaId", "senseKey" FROM "vocab_drill_senses"
     WHERE "bundleVersion" <> ${version} AND "retiredAt" IS NULL
  `;
  if (!dying.length) { console.log("  스윕: 은퇴 후보 없음"); return; }

  const counts = await chunkedIn<{ n: bigint }>(dying.map((d) => d.id), (batch) => db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "vocab_drill_mastery"
     WHERE "senseId" IN (${Prisma.join(batch)})
  `);
  const affected = counts.reduce((s, r) => s + Number(r.n ?? 0), 0);
  // 명시적 매핑이 이미 있는 것만 이관 대상이다. 없으면 고아로 둔다(추측하지 않는다).
  const mapped = await chunkedIn<{ n: bigint }>(dying.map((d) => d.id), (batch) => db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "vocab_drill_sense_aliases"
     WHERE "fromSenseId" IN (${Prisma.join(batch)})
  `);
  const withAlias = mapped.reduce((s, r) => s + Number(r.n ?? 0), 0);
  console.log(`  스윕: 은퇴 후보 ${fmt(dying.length)}건`);
  console.log(`  스윕: 영향받는 학생 숙달도 행 ${fmt(affected)}건`);
  console.log(`  스윕: 명시적 매핑(sense_aliases)이 있는 은퇴 sense ${fmt(withAlias)}건 — 나머지는 고아로 둔다`);
  console.log(`        (적재기는 매핑을 만들지 않는다. 4단계 병합 판정이 채운다 — spec §11.2)`);

  if (!OPT.apply) { console.log("  (dry-run — 아무것도 쓰지 않음)"); return; }

  for (const t of ["vocab_drill_senses", "vocab_drill_examples", "vocab_drill_traps", "vocab_drill_lemmas"]) {
    const n = await db.$executeRaw`
      UPDATE ${Prisma.raw(`"${t}"`)} SET "retiredAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "bundleVersion" <> ${version} AND "retiredAt" IS NULL
    `;
    console.log(`  은퇴 표시 ${t}: ${fmt(n)}행`);
  }

  // ⛔ 숙달도 이관은 **실행하지 않는다** — 학생 데이터 병합은 사람이 승인할 일이다.
  //    그리고 이관 대상은 **명시적 매핑이 있는 것뿐**이다. 매핑 없는 은퇴 sense 의
  //    숙달도는 고아로 두고 자연 소멸시킨다(spec §11.2 "미상").
  console.log("\n  [숙달도 이관 계획] 검토 후 손으로 실행하라. 실행 전 백업 필수.");
  console.log(`  -- 명시적 alias 만 탄다. 목적지 행이 이미 있으면 합친다.
  --   masteryScore=최대값, box=최대값, attempts/correct/lapses=합, dueAt=이른 쪽
  -- WITH a AS (SELECT "fromSenseId","toSenseId" FROM "vocab_drill_sense_aliases"
  --             WHERE "reason" IN ('MERGE','SPLIT_PICK','MANUAL'))
  -- …  (합치기 정책 확정 후 작성. 무조건 실행 금지.)`);
}

// ── 레지스트리 준비 ──────────────────────────────────────────────────────────
// senseId 의 정본은 이 파일이다. 없는데 그냥 새로 만들어 버리면 **전 학생의 숙달도가
// 조용히 고아가 된다** — 새 experiments 디렉터리에서 돌렸을 때 실제로 일어날 일이다.
// 그래서 최초 생성은 --registry-init 로 사람이 명시 승인해야 한다.
function openRegistry(): { reg: SenseRegistry; path: string; existed: boolean } | null {
  const p = OPT.registry ?? defaultRegistryPath(OPT.file);
  const loaded = loadRegistry(p);
  if (loaded) return { reg: new SenseRegistry(loaded), path: p, existed: true };

  if (OPT.apply && !OPT.registryInit) {
    console.error(`\n✗ sense-registry 가 없다: ${p}`);
    console.error("  senseId 의 정본이 없으면 이번 적재가 전건 신규 발급이 되고,");
    console.error("  기존 학생 숙달도(vocab_drill_mastery.senseId)가 전부 고아가 된다.");
    console.error("  · 첫 세대 발급이 맞다면      → --registry-init 를 붙여라");
    console.error("  · 기존 레지스트리가 있다면   → --registry=<경로> 로 지정하라");
    return null;
  }
  return { reg: new SenseRegistry(null), path: p, existed: false };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ★ major-3: 스윕은 **전량·무결 실행**에서만 성립한다. 부분 적재(--only/--limit)와
  //   불량 스킵(--force)은 "이번 번들이 확인하지 않은 행"을 만들고, 스윕은 그것을
  //   은퇴 후보로 본다. 반쯤 쓰고 나서 막으면 늦으니 시작 전에 끊는다.
  if (OPT.sweep) {
    const bad = [OPT.force && "--force", OPT.only.length && "--only", OPT.limit && "--limit"].filter(Boolean);
    if (bad.length) {
      console.error(`✗ --sweep 은 ${bad.join(" / ")} 와 함께 쓸 수 없다.`);
      console.error("  스윕은 전량·무결 적재에서만 허용한다 — 적재되지 않은 정상 콘텐츠가 은퇴한다.");
      process.exit(2);
    }
  }
  if (!fs.existsSync(OPT.file)) { console.error(`파일 없음: ${OPT.file}`); process.exit(2); }
  const buf = fs.readFileSync(OPT.file);
  const checksum = crypto.createHash("sha256").update(buf).digest("hex");
  const json = JSON.parse(buf.toString("utf8")) as { meta?: Record<string, unknown>; lemmas?: unknown[] };

  if (!Array.isArray(json.lemmas)) { console.error("형상 오류: 최상위 lemmas 가 배열이 아니다."); process.exit(2); }
  const docs = Number(json.meta?.docs ?? 0);
  const version = OPT.version ?? `v${docs}-${checksum.slice(0, 8)}`;
  const input = OPT.limit ? json.lemmas.slice(0, OPT.limit) : json.lemmas;

  console.log("═".repeat(72));
  console.log(`단어 코퍼스 적재기 — ${OPT.apply ? "APPLY(실제 쓰기)" : "DRY-RUN(쓰기 없음)"}`);
  console.log(`  입력   ${OPT.file}  (${(buf.length / 1048576).toFixed(1)}MB)`);
  console.log(`  번들   ${version}   meta=${JSON.stringify(json.meta ?? {})}`);
  console.log(`  대상   표제어 ${fmt(input.length)}${OPT.limit ? ` (--limit=${OPT.limit})` : ""}`);
  console.log("═".repeat(72));

  // 0) 정량 인덱스 — 표제어 합산의 원천. 없으면 연도통계 없이 진행한다.
  console.log("\n[0] 정량 통계 인덱스");
  const statsIdx = (OPT.stats || OPT.phraseStats)
    ? loadStatsIndex({ stats: OPT.stats, phraseStats: OPT.phraseStats })
    : null;
  if (statsIdx) {
    console.log(`  ${statsIdx.loaded.join("  ")}`);
    console.log(`  연도 ${statsIdx.meta.years[0]}~${statsIdx.meta.years[statsIdx.meta.years.length - 1]}` +
      ` · 코퍼스 ${fmt(statsIdx.meta.corpusWords)}단어 / ${fmt(statsIdx.meta.passages)}지문`);
    if (!Object.keys(statsIdx.meta.wordsByYear).length) {
      console.error("  ✗ meta.wordsByYear 가 없다 — per10k 를 재계산할 분모가 없다. 통계 파일을 다시 만들어라.");
      process.exit(2);
    }
  } else {
    console.log("  건너뜀 (--stats= / --phrase-stats= 미지정 — 연도통계는 lemmas.json 에 없다)");
    console.log("  ⚠️ 학년 per10k·gradeTop 은 quant(=basis 표면형 1개) 값으로 적재된다. 목록과 상세가 어긋날 수 있다.");
  }

  // 0-b) senseId 레지스트리 — spec §11 의 정본
  const opened = openRegistry();
  if (!opened) process.exit(2);
  const { reg: registry, path: regPath, existed: regExisted } = opened;
  console.log(`\n[0-b] sense 레지스트리  ${regPath}`);
  console.log(regExisted
    ? `  기존 항목 ${fmt(registry.size)}건 — 출처 일치로 승계한다`
    : `  ⚠️ 없음 — 이번 실행이 **첫 세대 senseId 발급**이다${OPT.apply ? " (--registry-init 승인됨)" : " (dry-run)"}`);

  // 1) 검증 + 셰이핑
  console.log("\n[1] 형상 검증");
  const { rows, issues, warn, skipped, audit } = shape(input, version, statsIdx, registry);
  if (issues.length) {
    const byPath = new Map<string, Issue[]>();
    for (const i of issues) { const a = byPath.get(i.path) ?? []; a.push(i); byPath.set(i.path, a); }
    console.error(`  ✗ 치명 ${fmt(issues.length)}건 (표제어 ${fmt(skipped)}건 스킵)`);
    for (const [p, list] of [...byPath.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
      console.error(`    ${p} × ${list.length}  예: ${list[0].sample} — ${list[0].message}`);
    }
  } else {
    console.log("  ✓ 필수 키·타입 위반 0건, ID 해시 충돌 0건");
  }
  if (warn.size) {
    console.log("  경고(적재는 계속):");
    for (const [k, n] of [...warn.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k} × ${fmt(n)}`);
  }
  if (issues.length && !OPT.force) {
    console.error("\n검증 실패로 중단한다. 형상을 고치거나 --force 로 불량을 스킵하고 진행하라.");
    process.exit(1);
  }

  // 2) 연도 시계열 검수 — 표제어 총출현 대비 연도통계 합계 일치율(major-1 의 판정 지표)
  const partialRun = OPT.limit > 0 || OPT.only.length > 0;
  const regFinal = registry.finalize(version, partialRun);
  if (statsIdx) {
    const pc = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(2)}%` : "N/A");
    console.log(`\n[2] 연도 시계열 (표제어가 실현한 **전 표면형 합산**)`);
    console.log(`  매칭 ${fmt(audit.matched)} / 미매칭 ${fmt(audit.missed)}` +
      ` · 해소 실패 표면형 ${fmt(audit.unresolvedSurfaces)}건`);
    console.log(`  표제어 총출현 합계  ${fmt(audit.lemmaTotal)}`);
    console.log(`  연도통계 합계       ${fmt(audit.yearTotal)}   → **일치율 ${pc(audit.yearTotal, audit.lemmaTotal)}**`);
    console.log(`  표제어 단위 정확 일치 ${fmt(audit.exact)} / 어긋남 ${fmt(audit.drift)}` +
      ` (${pc(audit.exact, audit.matched)})`);
    console.log(`  yearMin/yearMax — 2003 시작 ${fmt(audit.yearMinFull)}(${pc(audit.yearMinFull, audit.matched)})` +
      ` · 2027 종료 ${fmt(audit.yearMaxFull)}(${pc(audit.yearMaxFull, audit.matched)})` +
      ` · 전구간 ${fmt(audit.spanFull)}(${pc(audit.spanFull, audit.matched)})`);
    console.log(`  합산 등장연수가 basis 행과 다른 표제어 ${fmt(audit.presentDiffersFromBasis)}건` +
      ` — basis 1개만 보던 옛 값이 과소했다는 뜻`);
    if (audit.drift) {
      console.log(`  ⚠️ 어긋남 ${fmt(audit.drift)}건: 합산 규칙이 vocab-corpus-build.ts quantFor 와 갈렸다는 신호다.`);
    }
  } else {
    console.log("\n[2] 연도 시계열  건너뜀 (통계 파일 미지정 — byYear 는 lemmas.json 에 없다)");
  }

  // 2-b) senseId 발급 내역
  const rs = registry.stats;
  console.log(`\n[2-b] senseId 발급 (정본: ${regPath})`);
  console.log(`  정의문 동일 승계 ${fmt(rs.content)} · 출처 1:1 승계 ${fmt(rs.source)}` +
    ` · 신규 ${fmt(rs.new)} · 재해시 ${fmt(rs.collision)}`);
  console.log(`  잇지 않음 — 병합 의심 ${fmt(rs.ambiguousMerge)} · 분할 의심 ${fmt(rs.ambiguousSplit)}` +
    `  (코드가 판정하지 않는다. 4단계 명시 판정이 sense_aliases 를 채운다 — spec §11.2)`);
  console.log(`  레지스트리 항목 ${fmt(registry.size)}건 — 생존 ${fmt(regFinal.alive)}` +
    ` · 미확인 ${fmt(regFinal.retired)}(이번에 새로 은퇴 ${fmt(regFinal.newlyRetired)})`);
  if (regFinal.partial) console.log("  ⚠️ 부분 실행(--limit/--only) — 안 보인 sense 에 은퇴 표시를 하지 않았다.");

  // 3) 계획
  console.log("\n[3] 적재 계획");
  const plan: [string, unknown[][], Col[], string[]][] = [
    ["vocab_drill_lemmas", rows.lemmas, LEMMA_COLS, ["id"]],
    ["vocab_drill_lemma_year_stats", rows.years, YEAR_COLS, ["lemmaId"]],
    ["vocab_drill_senses", rows.senses, SENSE_COLS, ["id"]],
    ["vocab_drill_examples", rows.examples, EXAMPLE_COLS, ["id"]],
    ["vocab_drill_traps", rows.traps, TRAP_COLS, ["id"]],
  ];
  for (const [t, r] of plan) console.log(`  ${t.padEnd(30)} ${fmt(r.length).padStart(9)}행`);
  const total = plan.reduce((s, [, r]) => s + r.length, 0);
  console.log(`  ${"합계".padEnd(30)} ${fmt(total).padStart(9)}행  (청크 ${OPT.chunk})`);

  if (!OPT.diff) {
    console.log("\nDRY-RUN 종료 — DB 에 접속하지 않았다. DB 와 대조하려면 --diff, 실제 적재는 --apply.");
    return;
  }

  const db = new PrismaClient();
  try {
    // 4) DB 대조
    console.log("\n[4] DB 대조");
    for (const [t, r] of plan) {
      if (!r.length) continue;
      try {
        const existing = await db.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n FROM ${Prisma.raw(`"${t}"`)}`;
        console.log(`  ${t.padEnd(30)} 현재 ${fmt(Number(existing[0]?.n ?? 0)).padStart(9)}행 → 적재 ${fmt(r.length)}행(upsert)`);
      } catch {
        console.error(`  ✗ ${t} 조회 실패 — 테이블이 없다.`);
        console.error("    먼저 DDL 을 적용하라(사용자 승인 사항):");
        console.error("      npx prisma db execute --file prisma/sql/vocab-drill-init.sql");
        process.exitCode = 1;
        return;
      }
    }

    if (!OPT.apply) {
      console.log("\nDRY-RUN 종료 — 읽기만 했다. 실제로 쓰려면 --apply 를 붙여라.");
      if (OPT.sweep) { console.log("\n[5] 스윕 예행"); await sweep(db, version, skipped); }
      return;
    }

    // 5) 쓰기
    console.log("\n[5] 적재");
    const t0 = Date.now();
    // status 는 --activate 만이 소유한다. 재적재가 ACTIVE 번들을 STAGED 로
    // 되돌리면 "활성 번들 정확히 하나" 불변식이 조용히 깨진다 → skipUpdate.
    await bulkUpsert(db, "vocab_drill_bundles", [
      C("id"), C("version"), C("sourcePath"), C("checksum"), C("docs"), C("corpusDocs"),
      C("lemmaCount"), C("senseCount"), C("exampleCount"), C("trapCount"), C("status"),
      C("meta", "jsonb"), C("loadedAt"),
    ], [[
      sha1(version).slice(0, 16), version, OPT.file, checksum, docs, statsIdx?.meta.passages ?? 0,
      rows.lemmas.length, rows.senses.length, rows.examples.length, rows.traps.length,
      // ⚠️ 연도통계 수만 행을 통째로 넣지 않는다 — 요약 수치만.
      "STAGED", J({
        issues: issues.length, skipped, warnings: Object.fromEntries(warn),
        yearStats: {
          matched: audit.matched, missed: audit.missed,
          lemmaTotal: audit.lemmaTotal, yearTotal: audit.yearTotal,
          coverage: audit.lemmaTotal > 0 ? +((audit.yearTotal / audit.lemmaTotal) * 100).toFixed(2) : null,
          exact: audit.exact, drift: audit.drift,
        },
        senseIds: { ...registry.stats, registrySize: registry.size, registryPath: regPath },
      }), new Date(),
    ]], ["version"], { skipUpdate: ["status"] });

    for (const [t, r, cols, conflict] of plan) {
      if (!r.length) continue;
      const n = await bulkUpsert(db, t, cols, r, conflict);
      console.log(`  ${t.padEnd(30)} ${fmt(n).padStart(9)}행 반영`);
    }
    console.log(`  소요 ${((Date.now() - t0) / 1000).toFixed(1)}초`);

    // 5-b) 레지스트리 저장 — DB 쓰기가 성공한 뒤에만. senseId 의 정본이므로
    //      이게 남지 않으면 다음 실행이 전건 재발급하고 숙달도가 고아가 된다.
    saveRegistry(regPath, registry.reg);
    console.log(`  sense-registry 저장 ${regPath} (${fmt(registry.size)}건)`);

    // 6) 스윕
    if (OPT.sweep) { console.log("\n[6] 은퇴 스윕"); await sweep(db, version, skipped); }

    // 7) 활성화 — 부분 유니크(status='ACTIVE')를 지키려면 한 트랜잭션에서 교체한다.
    if (OPT.activate) {
      await db.$transaction([
        db.$executeRaw`UPDATE "vocab_drill_bundles" SET "status"='RETIRED', "updatedAt"=CURRENT_TIMESTAMP
                        WHERE "status"='ACTIVE' AND "version" <> ${version}`,
        db.$executeRaw`UPDATE "vocab_drill_bundles" SET "status"='ACTIVE', "activatedAt"=CURRENT_TIMESTAMP,
                              "updatedAt"=CURRENT_TIMESTAMP WHERE "version" = ${version}`,
      ]);
      console.log(`\n[7] 번들 활성화 — ${version}`);
    } else {
      console.log(`\n[7] 번들은 STAGED 로 남겨 두었다. 활성화하려면 --activate 를 붙여 다시 돌려라.`);
    }
    console.log("\n완료. 화면을 확인하고 이상이 없는지 직접 검증하라.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
