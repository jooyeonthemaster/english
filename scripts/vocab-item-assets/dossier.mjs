// ============================================================================
// 문항 자산 캠페인 — 도시에(dossier) 컴파일러 (읽기 전용)
//
// 단어 하나의 흩어진 자산(품사 변이·전 뜻·예문·함정노트·혼동어·연어·오답 후보)을
// LLM 생성 입력 1건으로 컴파일한다. 생성 품질은 프롬프트가 아니라 이 마샬링이
// 결정한다는 전제의 산물(2026-08-05 품질 전수조사).
//
// 단위는 lemma|pos 가 아니라 **철자(spelling)** 다 — affect 명사(정서)와
// 동사(영향을 미치다)를 한 도시에에 합쳐야 품사 교차 함정을 설계할 수 있고,
// 감사가 지적한 lemma|pos 분리 신원 문제(각 품사가 각자 '대표 뜻'으로 생존)를
// 생성 단계에서 봉합할 수 있다.
//
// 사용:
//   npx tsx scripts/vocab-item-assets/dossier.mjs --lemma "person,affect,have to"
//   npx tsx scripts/vocab-item-assets/dossier.mjs --lemma person --out experiments/vocab-item-assets/dossiers
// ============================================================================
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const requireRepo = createRequire(new URL("../../package.json", import.meta.url));
const { PrismaClient } = requireRepo("@prisma/client");
const prisma = new PrismaClient();

import { pathToFileURL } from "url";

const LIVE = { retiredAt: null };
// 게이트(gate.mjs)·교정기(repair.mjs)가 전부 여기서 import한다 — 정규화가 어긋나면
// "필터는 통과했는데 게이트가 잡는" 유령 결함이 생긴다(파일럿 실측). 사본 금지.
export const normKo = (s) => String(s ?? "").replace(/[\s·~〜,;()\/]/g, "");
/** 어미 변형 퍼지 키 — '정확히'≈'정확하게'≈'정확하다' (정성 패널 확정 수리안) */
export const fuzzyKo = (s) =>
  normKo(s).replace(/(하다|하게|하는|하며|되다|스럽다|스러운|스럽게|히|이)$/, "");
/** 어간 공유 — child↔childhood, play↔playing (블라인드 실측 17.4% 뚫림) */
export const stemShare = (a, b) => {
  const x = String(a).toLowerCase().replace(/[^a-z]/g, "");
  const y = String(b).toLowerCase().replace(/[^a-z]/g, "");
  if (x.length < 4 || y.length < 4) return false;
  return x.startsWith(y.slice(0, 4)) && y.startsWith(x.slice(0, 4));
};
const asArr = (j) => (Array.isArray(j) ? j.filter((x) => typeof x === "string") : []);

/** 코퍼스 추출 아티팩트(플레이스홀더 골격) 휴리스틱 — 감사 확정 병리. */
function artifactSuspect(lemma) {
  const l = ` ${lemma.toLowerCase()} `;
  if (/(^|\s)(a|b)(\s|$)/.test(l.trim().replace(/^./, " $&"))) {} // noop guard
  return (
    /(\s|^)(a|b)(\s|$)/.test(lemma.toLowerCase()) ||
    lemma.includes("...") ||
    /^(of one's|one's own|there be|there is|the same)$/i.test(lemma.trim())
  );
}

/** senseKo 형태 시그니처 — 오답 후보의 형태 정합 필터(감사: 형태 불일치=정답 유출).
 *  '~마다'(every)·'~보다'(than) 같은 조사 표기는 '~다' 종결 술어가 아니다 —
 *  오인 시 술어 오답을 요구하게 돼 해당 sense가 영구 불통과한다(실측 2건). */
export function formSig(ko) {
  const t = String(ko ?? "").trim();
  // '~다' 종결 오인 예외(실측 4건으로 수렴한 규칙):
  //  · '마다' 종결은 항상 조사다('~마다', '~할 때마다' — 술어 중 '마다' 종결은 없다)
  //  · '보다·에다'는 물결 접두가 있을 때만 조사다(무접두 '보다'는 see/look의 술어 뜻)
  const da = /다$/.test(t) && !/마다$/.test(t) && !/^[~〜]\s*(보다|에다)$/.test(t);
  return { da, words: t.split(/\s+/).length, len: t.length };
}
export function formMatch(a, b) {
  return (
    a.da === b.da &&
    Math.abs(a.words - b.words) <= 1 &&
    b.len >= Math.max(1, Math.ceil(a.len * 0.4)) &&
    b.len <= a.len * 2.5 + 2
  );
}

const exampleSource = (e) =>
  [e.year, e.grade, e.typeGroup].filter(Boolean).join(" · ") || null;

/** 품사×구여부×난이도 창별 오답 후보 풀 캐시(질의 절약). */
const poolCache = new Map();
async function candidatePool(pos, isPhrase, difficulty) {
  const key = `${pos}|${isPhrase}|${difficulty}`;
  if (poolCache.has(key)) return poolCache.get(key);
  const rows = await prisma.vocabDrillSense.findMany({
    where: {
      ...LIVE,
      pos,
      isPhrase,
      difficulty: { gte: Math.max(1, difficulty - 1), lte: Math.min(5, difficulty + 1) },
    },
    orderBy: [{ occurrences: "desc" }, { id: "asc" }],
    take: 900,
    select: {
      lemma: true, pos: true, senseKo: true, senseEn: true,
      difficulty: true, senseOrder: true,
    },
  });
  poolCache.set(key, rows);
  return rows;
}

/** sense 하나의 오답 후보 30개 — 형태 정합·자기 배제·중복 제거·다양화 샘플. */
/** 이 sense의 정답으로 성립하는 표기 전부 — 오답 금지 목록의 원천. */
export function bannedKoOf(sense) {
  const alts = (Array.isArray(sense.senseKoCandidates) ? sense.senseKoCandidates : [])
    .map((c) => (typeof c === "string" ? c : c?.ko))
    .filter(Boolean);
  return [...new Set([sense.senseKo, ...alts])];
}

async function distractorCandidates(sense, spelling) {
  const pool = await candidatePool(sense.pos, sense.isPhrase, sense.difficulty);
  const sig = formSig(sense.senseKo);
  const banned = bannedKoOf(sense);
  const seen = new Set(banned.map(normKo));
  // 퍼지 금지 — '정확히'가 정답인데 후보 '정확하게'를 실으면 게이트 MC_CAND_COLLISION
  const fuzzyBanned = new Set(banned.map(fuzzyKo).filter((k) => k.length >= 2));
  const matched = [];
  for (const c of pool) {
    if (c.lemma.toLowerCase() === spelling.toLowerCase()) continue;
    const key = normKo(c.senseKo);
    if (seen.has(key)) continue;
    const fk = fuzzyKo(c.senseKo);
    if (fk.length >= 2 && fuzzyBanned.has(fk)) continue;
    if (!formMatch(sig, formSig(c.senseKo))) continue;
    seen.add(key);
    matched.push(c);
  }
  // 다양화: 빈도순 목록을 등간격으로 훑어 고빈도 편중(감사: top-300 도배)을 피한다.
  const N = 30;
  const step = Math.max(1, Math.floor(matched.length / N));
  const picked = [];
  for (let i = 0; i < matched.length && picked.length < N; i += step) picked.push(matched[i]);
  return picked.map((c) => ({
    lemma: c.lemma,
    pos: c.pos,
    senseKo: c.senseKo,
    senseEn: String(c.senseEn ?? "").slice(0, 140),
    difficulty: c.difficulty,
  }));
}

// ── 영단어 오답 안전 후보군(닫힌 풀) ─────────────────────────────────────────
// 정성 패널 실측: WC를 자유 작성시키면 luna가 유의어를 뽑는다(이중정답 38.2%,
// 규범 3-1로도 비수렴 — 재롤 사이클 168→180). 해법은 프롬프트가 아니라 마샬링:
// DB에서 동의어·어간공유·품사 불일치를 "사전에" 배제한 목록만 주고 고르게 한다.

/** 풀 키별 lemma→전체 뜻(normKo) 집합 — 게이트 WC_DB_SYNONYM의 역조회와 동일 원천. */
const glossMapCache = new Map();
async function glossMapFor(poolKey, lemmas) {
  if (glossMapCache.has(poolKey)) return glossMapCache.get(poolKey);
  const rows = await prisma.vocabDrillSense.findMany({
    where: { lemma: { in: lemmas }, ...LIVE },
    select: { lemma: true, pos: true, senseKo: true, senseKoCandidates: true },
  });
  const map = new Map(); // lemma(lower) → {glosses:Set(normKo), fuzzy:Set, poses:Set}
  for (const r of rows) {
    const key = r.lemma.toLowerCase();
    if (!map.has(key)) map.set(key, { glosses: new Set(), fuzzy: new Set(), poses: new Set() });
    const e = map.get(key);
    e.poses.add(r.pos);
    for (const c of [r.senseKo, ...(Array.isArray(r.senseKoCandidates) ? r.senseKoCandidates : [])]) {
      const ko = typeof c === "string" ? c : c?.ko;
      if (!ko) continue;
      e.glosses.add(normKo(ko));
      const fk = fuzzyKo(ko);
      if (fk.length >= 2) e.fuzzy.add(fk);
    }
  }
  glossMapCache.set(poolKey, map);
  return map;
}

async function wordChoicePool(sense, spelling) {
  const pool = await candidatePool(sense.pos, sense.isPhrase, sense.difficulty);
  const poolKey = `${sense.pos}|${sense.isPhrase}|${sense.difficulty}`;
  // 뜻 지도는 풀 "전체" lemma로 캐시한다 — 철자별 제외 목록으로 캐시하면 다음
  // 철자에서 지도에 없는 lemma가 무검사 통과하는 유령 결함이 생긴다.
  const allLemmas = [];
  const seenAll = new Set();
  for (const c of pool) {
    const key = c.lemma.toLowerCase();
    if (!seenAll.has(key)) { seenAll.add(key); allLemmas.push(c.lemma); }
  }
  const glossMap = await glossMapFor(poolKey, allLemmas);
  // 철자별 후보(자기 자신·어간 공유 제외)
  const distinct = [];
  const seenLemma = new Set();
  for (const c of pool) {
    const key = c.lemma.toLowerCase();
    if (seenLemma.has(key)) continue;
    seenLemma.add(key);
    if (key === spelling.toLowerCase()) continue;
    if (stemShare(c.lemma, spelling)) continue;
    distinct.push({ lemma: c.lemma, ko: c.senseKo, difficulty: c.difficulty });
  }
  const banned = bannedKoOf(sense);
  const bannedNorm = new Set(banned.map(normKo));
  const bannedFuzzy = new Set(banned.map(fuzzyKo).filter((k) => k.length >= 2));
  const safe = distinct.filter((d) => {
    const e = glossMap.get(d.lemma.toLowerCase());
    if (!e) return true;
    for (const g of e.glosses) if (bannedNorm.has(g)) return false;
    for (const f of e.fuzzy) if (bannedFuzzy.has(f)) return false; // 게이트보다 엄격(안전 여유)
    return true;
  });
  // 그럴듯함 랭킹: 첫 글자 일치·길이 근접 우선(형태 혼동축), 결정론 타이브레이크
  const score = (d) =>
    Math.abs(d.lemma.length - spelling.length) -
    (d.lemma[0]?.toLowerCase() === spelling[0]?.toLowerCase() ? 3 : 0);
  safe.sort((a, b) => score(a) - score(b) || a.lemma.localeCompare(b.lemma));
  return safe.slice(0, 16).map((d) => ({ en: d.lemma, ko: d.ko }));
}

export async function buildDossier(spelling) {
  const lemmaRows = await prisma.vocabDrillLemma.findMany({
    where: { lemma: spelling, ...LIVE },
    orderBy: { per10k: { sort: "desc", nulls: "last" } },
  });
  if (!lemmaRows.length) return null;

  const variants = [];
  const confusableSet = new Set();
  for (const L of lemmaRows) {
    for (const c of asArr(L.confusable)) confusableSet.add(c);
    const senses = await prisma.vocabDrillSense.findMany({
      where: { lemmaId: L.id, ...LIVE },
      orderBy: { senseOrder: "asc" },
    });
    const senseOut = [];
    for (const s of senses) {
      const [examples, traps] = await Promise.all([
        prisma.vocabDrillExample.findMany({
          where: { senseId: s.id, ...LIVE },
          orderBy: { ord: "asc" },
          take: 6,
          select: { id: true, en: true, ko: true, surface: true, year: true, grade: true, typeGroup: true },
        }),
        prisma.vocabDrillTrap.findMany({
          where: { senseId: s.id, ...LIVE },
          orderBy: { ord: "asc" },
          take: 8,
          select: { kind: true, note: true },
        }),
      ]);
      senseOut.push({
        senseId: s.id,
        senseOrder: s.senseOrder,
        senseKo: s.senseKo,
        senseKoCandidates: s.senseKoCandidates,
        // 전량 전송 — 12개로 잘랐더니 as(대안 23개)류에서 모델이 모르는 표기를
        // 게이트가 잡는 유령 결함이 났다(파일럿 실측)
        bannedKo: bannedKoOf(s),
        senseEn: s.senseEn,
        tier: s.tier,
        difficulty: s.difficulty,
        occurrences: s.occurrences, // sense 단위 실빈도 — 대표성 판단의 정본
        isPhrase: s.isPhrase,
        examples: examples.map((e) => ({
          exampleId: e.id,
          en: e.en,
          ko: e.ko,
          surface: e.surface,
          source: exampleSource(e),
        })),
        traps,
        distractorCandidates: await distractorCandidates(s, spelling),
        // 영단어 오답은 이 닫힌 풀에서만 고른다(동의어·어간공유 사전 배제 완료)
        wordChoiceCandidates: await wordChoicePool(s, spelling),
      });
    }
    variants.push({
      lemmaId: L.id,
      pos: L.pos,
      isPhrase: L.isPhrase,
      per10k: L.per10k,
      totalOccurrences: L.totalOccurrences,
      gradeTop: L.gradeTop,
      trendLabel: L.trendLabel,
      collocations: asArr(L.collocations).slice(0, 8),
      surfaces: asArr(L.surfaces).slice(0, 10),
      senses: senseOut,
    });
  }

  // 혼동어를 뜻까지 해석해서 실어준다 — "sensible/sensitive를 헷갈린다"가
  // 오답 설계 재료가 되려면 그 단어들의 뜻이 입력에 있어야 한다.
  const confusableResolved = [];
  for (const c of [...confusableSet].slice(0, 12)) {
    const rows = await prisma.vocabDrillSense.findMany({
      where: { lemma: c, senseOrder: 0, ...LIVE },
      take: 3,
      select: { lemma: true, pos: true, senseKo: true, senseEn: true },
    });
    for (const r of rows) {
      confusableResolved.push({
        lemma: r.lemma,
        pos: r.pos,
        senseKo: r.senseKo,
        senseEn: String(r.senseEn ?? "").slice(0, 140),
      });
    }
  }

  return {
    spelling,
    artifactSuspect: artifactSuspect(spelling),
    variantCount: variants.length,
    senseCount: variants.reduce((a, v) => a + v.senses.length, 0),
    confusables: confusableResolved,
    variants,
  };
}

export { prisma };

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const spellings = (opt("lemma", "") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const OUT = opt("out", "experiments/vocab-item-assets/dossiers");
  if (!spellings.length) {
    console.error('사용법: --lemma "person,affect" [--out dir]');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const sp of spellings) {
    const d = await buildDossier(sp);
    if (!d) {
      console.log(`✗ ${sp}: 표제어 없음`);
      continue;
    }
    const file = path.join(OUT, `${sp.replace(/[^a-z0-9]+/gi, "_")}.json`);
    const json = JSON.stringify(d, null, 1);
    fs.writeFileSync(file, json);
    console.log(
      `✓ ${sp}: 품사변이 ${d.variantCount} · 뜻 ${d.senseCount} · 혼동어 ${d.confusables.length}` +
        ` · ${(json.length / 1024).toFixed(0)}KB (~${Math.round(json.length / 4 / 1000)}k tok)` +
        (d.artifactSuspect ? " · ⚠아티팩트 의심" : ""),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
