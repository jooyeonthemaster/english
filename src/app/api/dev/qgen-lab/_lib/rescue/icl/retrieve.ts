// 구제 ICL 시연 검색(RESCUE-SPEC §5.1 retrieve, 결정론) — 대상 지문 구조 군(T) → 시연 k개(기본 6).
//   점수 = 1.0·[family ∈ T] + 0.3·[그 외] + 0.2·|demo.tags ∩ T|/|T| + 0.1·[gold]
//   쿼터: 서로 다른 family ≥ min(4, 가용) · agreement ≤1(단서 거리 ≥7 만) · teacher: gold ≥3·gemini ≤3 · 같은 지문 2개 금지
//   동점 = mulberry32(seed) · 순서 = 시드 셔플 후 family ∈ T 인 최고점 시연을 마지막에.
// 누설 차단(감독 규칙 26-09-25): 대상과 같은 지문 id, 또는 대상 지문과 8-gram 이 하나라도 겹치는 시연은 후보에서 뺀다 —
// 선택 후에도 다시 단언한다(위반이면 throw — 누설된 프롬프트를 보내지 않는다).
import { mulberry32 } from "../../seeded-random";
import type { IclBank, IclDemo } from "./bank";
import { familyInTags, tagPassage, type IclFamily, type IclTag } from "./tagger";

export const LEAK_NGRAM = 8;
const AGREEMENT_MIN_CUE = 7;

const ngramTokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function ngrams(s: string, n: number): Set<string> {
  const t = ngramTokens(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(" "));
  return out;
}

/** a·b 가 단어 n-gram 을 하나라도 공유하는가(소문자·구두점 무시). */
export function sharesNgram(a: string, b: string, n = LEAK_NGRAM): boolean {
  const A = ngrams(a, n);
  if (A.size === 0) return false;
  for (const g of ngrams(b, n)) if (A.has(g)) return true;
  return false;
}

/** 누설 사유(없으면 null) — 같은 지문 id 또는 8-gram 겹침. */
export function leakReason(demo: Pick<IclDemo, "passageId" | "passageText">, target: { id: string; text: string }): string | null {
  if (demo.passageId === target.id) return "same-passage";
  if (sharesNgram(demo.passageText, target.text)) return "ngram-overlap";
  return null;
}

export interface RetrieveOpts {
  k: number;
  seed: number;
  /** 은행 종류 — teacher 는 gold ≥3·gemini ≤3, self 는 gold ≥3·self ≤3. */
  minGold?: number;
  maxOther?: number;
}

export interface RetrieveResult {
  demos: IclDemo[];
  targetTags: IclTag[];
  scores: Record<string, number>;
  /** 후보에서 뺀 항목(누설·자격 미달). */
  excluded: { id: string; reason: string }[];
}

function score(d: IclDemo, T: Set<IclTag>): number {
  const inter = d.tags.filter((t) => T.has(t)).length;
  return (familyInTags(d.family, T) ? 1.0 : 0.3) + (T.size > 0 ? (0.2 * inter) / T.size : 0) + (d.source === "gold" ? 0.1 : 0);
}

/** 대상 지문 → 시연 k개(쿼터 충족 탐욕). 후보가 k보다 적으면 가능한 만큼. */
export function retrieveDemos(bank: IclBank, target: { id: string; text: string }, o: RetrieveOpts): RetrieveResult {
  const targetTags = tagPassage(target.text).tags;
  const T = new Set(targetTags);
  const minGold = o.minGold ?? 3;
  const maxOther = o.maxOther ?? 3;
  const excluded: { id: string; reason: string }[] = [];
  const cands: IclDemo[] = [];
  for (const d of bank.entries) {
    const leak = leakReason(d, target);
    if (leak) excluded.push({ id: d.id, reason: leak });
    else if (!d.eligible) excluded.push({ id: d.id, reason: `ineligible: ${d.excludeReason ?? "?"}` });
    else if (d.family === "agreement" && !((d.cueDist ?? 0) >= AGREEMENT_MIN_CUE)) excluded.push({ id: d.id, reason: "agreement-cue<7" });
    else cands.push(d);
  }
  // 동점 난수는 id 정렬 순으로 배정 — 은행 파일의 항목 순서에 결과가 흔들리지 않게.
  const rng = mulberry32(o.seed);
  const tie = new Map<string, number>();
  for (const d of [...cands].sort((a, b) => (a.id < b.id ? -1 : 1))) tie.set(d.id, rng());
  const scores: Record<string, number> = {};
  for (const d of cands) scores[d.id] = Math.round(score(d, T) * 1e6) / 1e6;
  const ranked = [...cands].sort((a, b) => scores[b.id] - scores[a.id] || tie.get(a.id)! - tie.get(b.id)!);
  const familiesAvail = new Set(ranked.map((d) => d.family)).size;
  const famTarget = Math.min(4, familiesAvail, o.k);
  const goldAvail = ranked.filter((d) => d.source === "gold").length;

  const chosen: IclDemo[] = [];
  const usedPassages = new Set<string>();
  const fams = new Set<IclFamily>();
  const pick = (strictGold: boolean, strictFam: boolean): IclDemo | undefined => {
    const remaining = o.k - chosen.length;
    const goldCount = chosen.filter((d) => d.source === "gold").length;
    const needGold = strictGold ? Math.max(0, Math.min(minGold, goldAvail) - goldCount) : 0;
    const needFam = strictFam ? Math.max(0, famTarget - fams.size) : 0;
    return ranked.find((d) => {
      if (chosen.includes(d) || usedPassages.has(d.passageId)) return false;
      if (d.family === "agreement" && chosen.some((c) => c.family === "agreement")) return false;
      if (d.source !== "gold" && chosen.filter((c) => c.source !== "gold").length >= maxOther) return false;
      if (remaining <= needGold && d.source !== "gold") return false;
      if (remaining <= needFam && fams.has(d.family)) return false;
      return true;
    });
  };
  while (chosen.length < o.k) {
    const d = pick(true, true) ?? pick(true, false) ?? pick(false, false);
    if (!d) break;
    chosen.push(d);
    usedPassages.add(d.passageId);
    fams.add(d.family);
  }
  // 순서: 시드 셔플(Fisher–Yates) → family ∈ T 인 최고점 시연을 마지막으로.
  const order = [...chosen];
  const rng2 = mulberry32(o.seed ^ 0x9e3779b9);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng2() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const lastIdx = order.reduce(
    (best, d, i) => (familyInTags(d.family, T) && (best < 0 || scores[d.id] > scores[order[best].id]) ? i : best),
    -1,
  );
  if (lastIdx >= 0) order.push(order.splice(lastIdx, 1)[0]);
  for (const d of order) {
    const leak = leakReason(d, target);
    if (leak) throw new Error(`[icl] 누설 시연 선택(${d.id} ↔ ${target.id}: ${leak}) — 조립 중단`);
  }
  return { demos: order, targetTags, scores, excluded };
}
