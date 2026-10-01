// qgen-lab 플래너 공용 인벤토리(PLANNER-SPEC §2 buildInventory) — ja·jf·jh 3종이 같은 절차로 만든다.
//   1 후보(코드, extractCandidates) → 2 jev 1라운드 A2+D(state={passage 원문}, 한 요청 팬아웃)
//   → 3 정답점수 A2×(0.25+D/4) · 미끼점수 A2 + 코드 사전 블렌드
//   → 4 정답 상위 K=10 자리 × mutator 오형(≤3) → 킬러 사전 필터 → D7 C_cls_ex(임계 ±0.1 밴드 2회 재질의 평균)
//        ∥ D4 categoryPair(p_max≥0.8 확정, 아니면 top-2 — 임계 ±0.08 밴드 재질의)
//   → 5 정답 후보 = 유효 쌍(p≥0.5) 순위(정답점수×p_valid), 자리·문장 중복 제거
//   → 6 미끼 인벤토리 12 = 정답 후보 문장 밖 위주 · 킬러 사전 필터 통과 · 경쟁형 있음 · 같은 코드 ≤2 · 문장 분산.
// 유효 정답이 minValidAnswers 미만이면 다음 K 자리로 한 라운드 더(최대 maxRounds). jev 호출은 전부 세마포어(동시 ≤8).
// 보정 근거: calib/SUMMARY.txt (site-planner·d7-validity·d4-category·d5d6). 질문 문구는 jev-questions.ts(축자 이식)만 쓴다.
import type { LabDifficulty } from "@/lib/qgen-lab/types";
import { askJev, type JevAnswer, type JevQuestion } from "../jev-client";
import { extractCandidates, type SiteCandidate } from "./candidates";
import {
  answerPrefilter, candidateDefaultCode, decoyCodePrior, decoyDepth, decoyPrefilter, type Prefilter,
} from "./code-prior";
import { sentenceSplit, type LabSentence, type PlannerContext } from "./index";
import { limiter, mean, overlaps, pickSpread, r3, type PlacedSite } from "./inventory-utils";
import {
  categoryPair, readCategoryPair, readNoul, readScore, readValidity, siteAnswerScore, siteRound, validityClsEx,
} from "./jev-questions";
import { askJevPacked } from "./jev-questions-utils";
import { applyWrongForm, proposeWrongForms, type WrongFormProposal } from "./mutator";

export interface InventoryOptions {
  /** 원장 phase. */
  phase: string;
  difficulty?: LabDifficulty;
  /** 정답 후보 자리 수(라운드당). */
  k?: number;
  maxWrongPerSite?: number;
  /** D7 유효 임계(soft 0.5). */
  validThreshold?: number;
  /** 밴드 재질의를 거는 임계들(soft 0.5 · hard 0.6 — 인벤토리를 세 플래너가 공유하므로 둘 다). */
  bandThresholds?: number[];
  band?: number;
  extraAsks?: number;
  /** D4 확정 임계·밴드. */
  catConfirm?: number;
  catBand?: number;
  concurrency?: number;
  minValidAnswers?: number;
  maxRounds?: number;
  decoyTop?: number;
  /** 미끼 점수 = (1−w)·A2 + w·(코드 사전/2). 보정 없음(순위 보조항) — 보고서 gaps 참조. */
  priorWeight?: number;
}

const DEFAULTS = {
  k: 10, maxWrongPerSite: 3, validThreshold: 0.5, bandThresholds: [0.5, 0.6], band: 0.1, extraAsks: 2,
  catConfirm: 0.8, catBand: 0.08, concurrency: 8, minValidAnswers: 3, maxRounds: 2, decoyTop: 12, priorWeight: 0.3,
};

/** 정답점수 상한(A2≤1, D≤4 → 1.25) — PlanSite.score 를 0~1 로 맞추는 정규화 분모. */
const ANSWER_RAW_MAX = siteAnswerScore(1, 4);

export interface InvSite {
  c: SiteCandidate;
  a2: number;
  d: number;
  /** A2×(0.25+D/4) 원값(0~1.25). */
  answerRaw: number;
  answerNorm: number;
  /** answerRaw 내림차순 순위(1부터). */
  rank: number;
  /** 미끼 기본 코드(D4 전 근사 — candidateDefaultCode). */
  code: string;
  prior: number;
  decoyScore: number;
}

export interface InvCategory {
  /** 최고 확률 코드(a~m 또는 none). */
  code: string;
  top2: string[];
  pmax: number;
  confirmed: boolean;
  asks: number;
  probs: Record<string, number>;
}

export interface InvPair {
  site: InvSite;
  w: WrongFormProposal;
  prefilter: Prefilter;
  originalSentence: string;
  modifiedSentence: string;
  pFirst: number | null;
  /** 밴드 재질의 평균(null = 질의 실패). */
  pValid: number | null;
  values: number[];
  category: InvCategory | null;
  /** answerNorm × pValid (0~1). */
  score: number;
  round: number;
  error?: string;
}

export interface InvDecoy {
  site: InvSite;
  deep: boolean;
  depthSignals: string[];
  formula: string | null;
  /** 비킬러 난이도에서 기록만 하는 죽은 미끼 사유. */
  flags: string[];
}

export interface Inventory {
  passage: string;
  difficulty: LabDifficulty;
  sentences: LabSentence[];
  /** answerRaw 내림차순. */
  sites: InvSite[];
  /** D7 을 물은 쌍 전부. */
  pairs: InvPair[];
  /** 유효·중복 제거·순위(정답 후보 전체). */
  answers: InvPair[];
  /** 미끼 인벤토리 상위 decoyTop. */
  decoys: InvDecoy[];
  /** 킬러 사전 필터 통과·경쟁형 있는 미끼 자리 전체(점수순, 정답 후보 자리 포함) — hard 대체 후보. */
  decoyPool: InvDecoy[];
  excluded: { core: string; wrong: string; reasons: string[] }[];
  errors: string[];
  stats: {
    ms: number;
    jevCalls: number;
    jevCostUsd: number;
    rounds: number;
    nCandidates: number;
    stageMs: Record<string, number>;
  };
}

/** 플래너 params → 인벤토리 옵션(숫자만, 범위 밖은 무시). */
export function inventoryOptionsFrom(
  params: Record<string, unknown> | undefined,
  base: InventoryOptions,
): InventoryOptions {
  const n = (key: string, lo: number, hi: number) => numParam(params, key, lo, hi);
  const picked: Partial<InventoryOptions> = {
    k: n("k", 1, 40),
    maxWrongPerSite: n("maxWrongPerSite", 1, 3),
    validThreshold: n("validThreshold", 0, 1),
    concurrency: n("concurrency", 1, 8),
    minValidAnswers: n("minValidAnswers", 1, 10),
    maxRounds: n("maxRounds", 1, 3),
    decoyTop: n("decoyTop", 4, 20),
    priorWeight: n("priorWeight", 0, 1),
  };
  const out: InventoryOptions = { ...base };
  for (const [k, v] of Object.entries(picked)) if (v !== undefined) Object.assign(out, { [k]: v });
  return out;
}

/** 플래너 컨텍스트 → 인벤토리 옵션(phase·난이도 + params 덮어쓰기). */
export const contextInventoryOptions = (ctx: PlannerContext): InventoryOptions =>
  inventoryOptionsFrom(ctx.params, { phase: ctx.phase, difficulty: ctx.difficulty });

/** params 의 숫자 하나(범위 밖·비숫자는 undefined). */
export function numParam(params: Record<string, unknown> | undefined, key: string, lo: number, hi: number): number | undefined {
  const v = params?.[key];
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
}

export const placeOf = (s: InvSite): PlacedSite => ({ start: s.c.start, end: s.c.end, sentenceIdx: s.c.sentenceIdx });

/** 정답 쌍의 범주 코드 — D4 확정이면 그 코드, 미확정이면 top-2("d/a"), D4 없음이면 mutator 추정 코드. */
export function pairCategoryCode(p: InvPair): string {
  if (!p.category) return p.w.code;
  return p.category.confirmed || p.category.top2.length < 2 ? p.category.code : p.category.top2.join("/");
}

export async function buildInventory(passage: string, o: InventoryOptions): Promise<Inventory> {
  const t0 = performance.now();
  const opt = { ...DEFAULTS, ...o };
  const difficulty: LabDifficulty = o.difficulty ?? "KILLER";
  const lim = limiter(opt.concurrency);
  const stats = { jevCalls: 0, jevCostUsd: 0 };
  const stageMs: Record<string, number> = {};
  const errors: string[] = [];
  const lap = (k: string, from: number) => (stageMs[k] = Math.round((stageMs[k] ?? 0) + performance.now() - from));
  const ask = (state: unknown, questions: Record<string, JevQuestion>, note: string) =>
    lim(async () => {
      const r = await askJev(state, questions, { phase: opt.phase, note });
      stats.jevCalls++;
      stats.jevCostUsd += r.costUsd;
      return r;
    });

  // 1. 후보
  let t = performance.now();
  const sentences = sentenceSplit(passage);
  const cands = extractCandidates(passage);
  if (cands.length === 0) throw new Error("jev 플래너: 후보 자리 0개(지문이 비었거나 영어 지문이 아님)");
  lap("extract", t);

  // 2~3. A2+D 1라운드 → 점수
  t = performance.now();
  const r1 = await askJevPacked(siteRound(passage, cands), { phase: opt.phase, note: `plan A2+D ${cands.length}` });
  stats.jevCalls += r1.requests;
  stats.jevCostUsd += r1.costUsd;
  lap("a2d", t);
  const w = opt.priorWeight;
  const sites: InvSite[] = cands
    .map((c) => {
      const a2 = readNoul(r1.answers[`${c.id}:A2`]);
      const d = readScore(r1.answers[`${c.id}:D`]);
      const answerRaw = siteAnswerScore(a2, d);
      const code = candidateDefaultCode(c);
      const prior = decoyCodePrior(code);
      return { c, a2, d, answerRaw, answerNorm: answerRaw / ANSWER_RAW_MAX, rank: 0, code, prior, decoyScore: (1 - w) * a2 + (w * prior) / 2 };
    })
    .sort((x, y) => y.answerRaw - x.answerRaw);
  sites.forEach((s, i) => (s.rank = i + 1));

  // 4~5. 정답 자리 → 오형 → 사전 필터 → D7 ∥ D4 → 순위
  const pairs: InvPair[] = [];
  const excluded: Inventory["excluded"] = [];
  // 첫 문장 제외(보정 프로토타입 site-planner/planner.mjs buildPlan 의 정답 shortlist 규칙)
  const eligible = sites.filter((s) => s.c.sentenceIdx !== 0);
  let cursor = 0;
  let rounds = 0;
  let answers: InvPair[] = [];
  while (rounds < opt.maxRounds && cursor < eligible.length) {
    rounds++;
    const roundPairs: InvPair[] = [];
    let picked = 0;
    while (cursor < eligible.length && picked < opt.k) {
      const s = eligible[cursor++];
      const sent = sentences[s.c.sentenceIdx];
      if (!sent) continue;
      let usable = 0;
      for (const wf of proposeWrongForms(s.c, { max: opt.maxWrongPerSite })) {
        const pf = answerPrefilter(passage, s.c, wf.wrong, difficulty);
        if (!pf.ok) {
          excluded.push({ core: s.c.word, wrong: wf.wrong, reasons: pf.reasons });
          continue;
        }
        const ap = applyWrongForm(passage, s.c, wf.wrong, sent);
        roundPairs.push({
          site: s, w: wf, prefilter: pf, originalSentence: ap.originalSentence, modifiedSentence: ap.modifiedSentence,
          pFirst: null, pValid: null, values: [], category: null, score: 0, round: rounds,
        });
        usable++;
      }
      if (usable > 0) picked++;
    }
    if (roundPairs.length === 0) break;
    await judgePairs(roundPairs, opt, ask, errors, lap);
    pairs.push(...roundPairs);
    answers = rankAnswers(pairs, opt.validThreshold);
    if (answers.length >= opt.minValidAnswers) break;
  }

  // 6. 미끼 인벤토리 — 풀 = 킬러 사전 필터 통과 + 경쟁형(오형 제안 ≥1)이 있는 자리 전체(조동사 등 판정할 형태가 없는 자리 제외).
  //    soft 인벤토리는 정답 후보 상위 3 자리와 겹치지 않게, hard 는 풀에서 자기 정답만 뺀다(2·3순위 자리를 깊은 미끼로 회수 가능).
  t = performance.now();
  const top3 = answers.slice(0, 3);
  const pool: InvDecoy[] = [];
  for (const s of [...sites].sort((a, b) => b.decoyScore - a.decoyScore)) {
    if (proposeWrongForms(s.c, { max: 1 }).length === 0) continue;
    const pf = decoyPrefilter(passage, s.c, difficulty);
    if (!pf.ok) continue;
    pool.push({ site: s, deep: false, depthSignals: [], formula: null, flags: pf.flags });
  }
  for (const d of pool.slice(0, 48)) {
    const v = decoyDepth(passage, [{ id: d.site.c.id, start: d.site.c.start, end: d.site.c.end, word: d.site.c.word }]).get(d.site.c.id);
    if (v) Object.assign(d, { deep: v.deep, depthSignals: v.signals, formula: v.formula });
  }
  const softPool = pool.filter((d) => !top3.some((p) => overlaps(p.site.c, d.site.c)));
  const decoys = pickSpread(passage, softPool, (d) => placeOf(d.site), (d) => d.site.code, {
    n: opt.decoyTop,
    avoidSentences: new Set(top3.map((p) => p.site.c.sentenceIdx)),
    perSentence: 2,
    perCode: 2,
    fixed: top3.map((p) => placeOf(p.site)),
  });
  lap("decoys", t);

  return {
    passage, difficulty, sentences, sites, pairs, answers, decoys, decoyPool: pool, excluded, errors,
    stats: { ms: Math.round(performance.now() - t0), ...stats, rounds, nCandidates: cands.length, stageMs },
  };
}

type Ask = (state: unknown, q: Record<string, JevQuestion>, note: string) => Promise<{ answers: Record<string, JevAnswer> }>;

/** D7 1차 → (밴드 재질의 ∥ D4 1차 → D4 밴드 재질의). 개별 질의 실패는 그 쌍만 탈락(errors 기록). */
async function judgePairs(
  pairs: InvPair[],
  opt: typeof DEFAULTS,
  ask: Ask,
  errors: string[],
  lap: (k: string, from: number) => void,
): Promise<void> {
  const ask7 = async (p: InvPair): Promise<number> => {
    const f = validityClsEx(p.originalSentence, p.modifiedSentence);
    const r = await ask(f.state, f.questions, `D7 ${p.site.c.word}->${p.w.wrong}`);
    return readValidity(r.answers.C_cls_ex);
  };
  let t = performance.now();
  await Promise.all(
    pairs.map(async (p) => {
      try {
        p.pFirst = await ask7(p);
        p.values = [p.pFirst];
      } catch (e) {
        p.error = e instanceof Error ? e.message : String(e);
        errors.push(`D7 ${p.site.c.word}->${p.w.wrong}: ${p.error.slice(0, 120)}`);
      }
    }),
  );
  lap("d7", t);
  const inBand = (v: number) => opt.bandThresholds.some((th) => Math.abs(v - th) < opt.band);
  const reask = pairs.filter((p) => p.pFirst !== null && inBand(p.pFirst));
  // 밴드 밖 1차값이 임계 미만이면 평균도 임계 미만 → D4 불요
  const maybeValid = pairs.filter((p) => p.pFirst !== null && (p.pFirst >= opt.validThreshold || inBand(p.pFirst)));
  t = performance.now();
  await Promise.all([
    Promise.all(
      reask.map(async (p) => {
        const more = await Promise.all(Array.from({ length: opt.extraAsks }, () => ask7(p).catch(() => null)));
        for (const v of more) if (v !== null) p.values.push(v);
      }),
    ),
    classifyPairs(maybeValid, opt, ask, errors),
  ]);
  lap("band+d4", t);
  for (const p of pairs) {
    if (p.values.length === 0) continue;
    p.pValid = mean(p.values);
    p.score = p.site.answerNorm * p.pValid;
  }
}

function summarizeCategory(probsList: Record<string, number>[], confirmAt: number): InvCategory {
  const keys = new Set(probsList.flatMap((p) => Object.keys(p)));
  const probs: Record<string, number> = {};
  for (const k of keys) probs[k] = r3(mean(probsList.map((p) => p[k] ?? 0)));
  const order = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const pmax = order[0]?.[1] ?? 0;
  return { code: order[0]?.[0] ?? "none", top2: order.slice(0, 2).map((x) => x[0]), pmax, confirmed: pmax >= confirmAt, asks: probsList.length, probs };
}

/** D4 pair(10개씩 한 요청, 분류 체계 state 1회). p_max 가 확정 임계 ±catBand 안이면 그 항목들만 모아 2회 더 묻고 확률 평균. */
async function classifyPairs(pairs: InvPair[], opt: typeof DEFAULTS, ask: Ask, errors: string[]): Promise<void> {
  const item = (p: InvPair) => ({ markedSentence: p.site.c.marked_sentence, surface: p.site.c.word, wrong: p.w.wrong });
  const probsOf = new Map<InvPair, Record<string, number>[]>();
  const askChunk = async (grp: InvPair[], note: string) => {
    const f = categoryPair(grp.map(item));
    const r = await ask(f.state, f.questions, note);
    grp.forEach((p, k) => {
      const c = readCategoryPair(r.answers[`q${k}`]);
      if (c) probsOf.set(p, [...(probsOf.get(p) ?? []), c.probs]);
    });
  };
  const chunks: InvPair[][] = [];
  for (let i = 0; i < pairs.length; i += 10) chunks.push(pairs.slice(i, i + 10));
  await Promise.all(
    chunks.map((g) => askChunk(g, `D4 pair ${g.length}`).catch((e) => void errors.push(`D4: ${String(e?.message ?? e).slice(0, 120)}`))),
  );
  const band = pairs.filter((p) => {
    const l = probsOf.get(p);
    return l && Math.abs(summarizeCategory(l, opt.catConfirm).pmax - opt.catConfirm) < opt.catBand;
  });
  const bandChunks: InvPair[][] = [];
  for (let i = 0; i < band.length; i += 10) bandChunks.push(band.slice(i, i + 10));
  await Promise.all(
    bandChunks.flatMap((g) =>
      Array.from({ length: opt.extraAsks }, () =>
        askChunk(g, `D4 band ${g.length}`).catch((e) => void errors.push(`D4 band: ${String(e?.message ?? e).slice(0, 120)}`)),
      ),
    ),
  );
  for (const p of pairs) {
    const l = probsOf.get(p);
    if (l?.length) p.category = summarizeCategory(l, opt.catConfirm);
  }
}

/** 유효 쌍(p≥임계) 점수순 — 자리당 최선 1쌍, 문장당 1자리. */
function rankAnswers(pairs: InvPair[], threshold: number): InvPair[] {
  const valid = pairs.filter((p) => p.pValid !== null && p.pValid >= threshold).sort((a, b) => b.score - a.score);
  const out: InvPair[] = [];
  const sites = new Set<string>();
  const sents = new Set<number>();
  for (const p of valid) {
    if (sites.has(p.site.c.id) || sents.has(p.site.c.sentenceIdx)) continue;
    sites.add(p.site.c.id);
    sents.add(p.site.c.sentenceIdx);
    out.push(p);
  }
  return out;
}

/** plan.debug 용 요약(JSONL 에 남으므로 간결하게). */
export function inventoryDebug(inv: Inventory): Record<string, unknown> {
  const catStr = (p: InvPair) => (p.category ? `${p.category.code}:${p.category.pmax.toFixed(2)}${p.category.asks > 1 ? `×${p.category.asks}` : ""}` : "-");
  return {
    nCandidates: inv.stats.nCandidates,
    nPairs: inv.pairs.length,
    rounds: inv.stats.rounds,
    stageMs: inv.stats.stageMs,
    inventoryMs: inv.stats.ms,
    excluded: inv.excluded.slice(0, 12).map((x) => `${x.core}→${x.wrong}: ${x.reasons.join(" / ").slice(0, 100)}`),
    nExcluded: inv.excluded.length,
    pairs: inv.pairs.map(
      (p) => `${p.site.c.word}@S${p.site.c.sentenceIdx + 1}#${p.site.rank}→${p.w.wrong} p=${p.pValid === null ? "err" : p.pValid.toFixed(2)}${p.values.length > 1 ? `×${p.values.length}` : ""} ${catStr(p)}`,
    ),
    answers: inv.answers.map((p) => `${p.site.c.word}@S${p.site.c.sentenceIdx + 1}→${p.w.wrong} ${p.score.toFixed(3)}`),
    decoys: inv.decoys.map((d) => `${d.site.c.word}@S${d.site.c.sentenceIdx + 1}(${d.site.code} ${d.site.decoyScore.toFixed(2)}${d.deep ? " deep" : ""})`),
    errors: inv.errors,
  };
}
