// 정답 교체 후보 메뉴(RESCUE-SPEC §5.4 정답 메뉴 ≤3 — 정답이 결함일 때만). 코드 후보 × proposeWrongForms(max 2)
// → 프로덕션 answerPrefilter(KILLER: 과훈련·RECOGNITION_BAN) → R-lint 무결·수일치는 유인 명사 필수·선행사 모호 없음·코드 거리 ≥5
// → 순위(비수일치 우선 → J → 거리↓ → 해시), 수일치 ≤1, 자리당 1 → 상위 12쌍 D7 → pBroke ≥ 0.8(밴드 ±0.1) → ≤3.
// 오형 자리 적합성 가드(verbSiteOk)·형용사 용법 -ing 제외는 LAB/rescue/replay/lib/answer-pick.mjs(codeAnswerCands) 이식이다.
import { answerPrefilter } from "../planners/code-prior";
import { extractCandidates } from "../planners/candidates";
import { candidateContext, proposeWrongForms } from "../planners/mutator";
import { baseOfS as baseOfS3 } from "../planners/mutator-utils";
import { fnv1a32 } from "../seeded-random";
import { isProFormPair } from "../verify";
import type { StrategyContext } from "../strategies/index";
import { displayOf, type ItemModel } from "./item-model";
import { askD7, d7Pair } from "./jev-probes";
import { analyzeAnswer, FAMILY_CODE, FAMILY_KO, type AnswerAnalysis } from "./lint-answer";
import { gateSpacingOk } from "./decoy-picker";
import { BE, DET, DO, HAVE, MODAL, PREP, adjShaped } from "./lint-lex";
import type { SyntaxView, WordRange } from "./lint-syntax";

export const ANSWER_MIN_DIST = 5;
export const ANSWER_MENU_D7 = 0.8;

export interface AnswerMenuItem {
  id: string;
  start: number;
  end: number;
  surface: string;
  wrong: string;
  sentenceNo: number;
  fam: AnswerAnalysis["fam"];
  famKo: string;
  code: string;
  dist: number | null;
  clue: string | null;
  depth: AnswerAnalysis["depth"];
  pBroke: number;
  rule: string;
}

const NOUN_PREV = new Set([...DET, "one", "two", "three", "four", "five"]);
const VERB_RULE = /^(V|be |have |OC |to |to-V|V-|p\.p\.)/;
const ING_ADJ_PREV = /^(more|most|less|least|very|so|too|how|much|quite|rather|increasingly|highly)$/;
const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** 동사 활용 오형의 자리 적합성(answer-pick.mjs verbSiteOk 이식 — 태거가 명사·한정 형용사를 동사로 잡은 비단어·무의미 정답 차단). */
export function verbSiteOk(view: SyntaxView, wr: WordRange, wrong: string): boolean {
  const W = view.W;
  const head = W[wr.b].c;
  const wh = (String(wrong).trim().split(/\s+/).pop() ?? "").toLowerCase();
  if (wh === head) return true;
  if (!/(ing|ed)$/.test(head) && !BE.has(head) && !HAVE.has(head) && !DO.has(head) && !MODAL.has(head)) {
    const lemma = baseOfS3(head) ?? head;
    const forms = new Set([lemma, lemma + "s", lemma + "es"]);
    const nounPrev = (p: SyntaxView["W"][number]) =>
      NOUN_PREV.has(p.c) || ["D", "POSS", "NUM", "A"].includes(p.tag) || (adjShaped(p.c) && !/ly$/.test(p.c)) || (PREP.has(p.c) && p.c !== "to");
    const nounEv = W.some((t, k) => forms.has(t.c) && k > 0 && W[k - 1].sid === t.sid && nounPrev(W[k - 1]));
    if (nounEv && (/ing$/.test(wh) || wh === lemma || wh === lemma + "s")) return false;
  }
  if (/ing$/.test(head) && !/ing$/.test(wh)) {
    const nx = W[wr.b + 1] && W[wr.b + 1].sid === W[wr.b].sid ? W[wr.b + 1] : null;
    const pv = wr.a > 0 && W[wr.a - 1].sid === W[wr.a].sid ? W[wr.a - 1] : null;
    if (nx && nx.tag === "N" && pv && (["A", "D", "POSS", "NUM"].includes(pv.tag) || adjShaped(pv.c))) return false;
  }
  return true;
}

interface Pair {
  start: number;
  end: number;
  surface: string;
  wrong: string;
  rule: string;
  sentenceNo: number;
  a: AnswerAnalysis;
  h: number;
}

/** 정답 메뉴 — 현재 미끼 4개는 그대로 둔다고 보고(겹침·게이트 간격·정답① 회피) 후보를 만든다. */
export async function buildAnswerMenu(
  ctx: Pick<StrategyContext, "askJev">,
  a: { passageId: string; item: ItemModel; stage: string; size?: number; topD7?: number; d7Min?: number; minDist?: number },
): Promise<{ menu: AnswerMenuItem[]; funnel: Record<string, number> }> {
  const passage = a.item.passage;
  const size = a.size ?? 3;
  const d7Min = a.d7Min ?? ANSWER_MENU_D7;
  const minDist = a.minDist ?? ANSWER_MIN_DIST;
  const decoys = a.item.marks.filter((m) => m.role !== "answer");
  const disp0 = displayOf(passage, []);
  const funnel: Record<string, number> = { cands: 0, pairs: 0, prefilter: 0, lint: 0, d7Asked: 0, d7Fail: 0, d7Low: 0, menu: 0 };
  const pairs: Pair[] = [];
  for (const c of extractCandidates(passage, { variant: "full" })) {
    if (c.tokenIds.length > 2) continue;
    if (decoys.some((d) => (c.start < d.end && d.start < c.end) || !gateSpacingOk(passage, d, c))) continue;
    if (!decoys.some((d) => d.start < c.start)) continue; // 정답이 ①이 되지 않게
    funnel.cands++;
    const wr0 = disp0.view.W.filter((t) => t.start < c.end && t.end > c.start).map((t) => t.wi);
    if (!wr0.length) continue;
    const wr = { a: wr0[0], b: wr0[wr0.length - 1] };
    const tag = disp0.view.W[wr.b].tag;
    const left = candidateContext(c).left;
    for (const p of proposeWrongForms(c, { max: 2 })) {
      if (VERB_RULE.test(p.rule) && !["V", "AUX", "G", "E", "TO"].includes(tag)) continue;
      if (wc(p.wrong) > 2 || isProFormPair(p.wrong, c.word)) continue;
      if (!verbSiteOk(disp0.view, wr, p.wrong)) continue;
      if (/ing$/.test(c.word.toLowerCase()) && !/ing$/.test(p.wrong.toLowerCase()) && ING_ADJ_PREV.test(left[left.length - 1] ?? "")) continue;
      funnel.pairs++;
      if (!answerPrefilter(passage, c, p.wrong, "KILLER").ok) {
        funnel.prefilter++;
        continue;
      }
      const disp = displayOf(passage, [{ start: c.start, end: c.end, shown: p.wrong }]);
      const an = analyzeAnswer(disp, disp.marks[0], c.word);
      const ok = an.rlint.length === 0 && (an.fam !== "agreement" || !!an.attractor) && !an.ambiguousAntecedent && (an.dist ?? 0) >= minDist;
      if (!ok) {
        funnel.lint++;
        continue;
      }
      pairs.push({ start: c.start, end: c.end, surface: c.word, wrong: p.wrong, rule: p.rule, sentenceNo: c.sentenceIdx + 1, a: an, h: fnv1a32(`${a.passageId}:${c.start}:${p.wrong}`) });
    }
  }
  pairs.sort(
    (x, y) =>
      Number(x.a.fam === "agreement") - Number(y.a.fam === "agreement") ||
      Number(y.a.depth === "J") - Number(x.a.depth === "J") ||
      (y.a.dist ?? 0) - (x.a.dist ?? 0) ||
      x.h - y.h,
  );
  const shortlist: Pair[] = [];
  let agreement = 0;
  for (const p of pairs) {
    if (shortlist.length >= (a.topD7 ?? 12)) break;
    if (shortlist.some((s) => s.start === p.start)) continue;
    if (p.a.fam === "agreement") {
      if (agreement >= 1) continue;
      agreement++;
    }
    shortlist.push(p);
  }
  funnel.d7Asked = shortlist.length;
  const d7 = await Promise.all(
    shortlist.map(async (p) => {
      const pair = d7Pair(passage, p, p.wrong);
      if (!pair) return null;
      return (await askD7(ctx, pair, { stage: a.stage, threshold: d7Min, note: "answer-menu" })).p;
    }),
  );
  const menu: AnswerMenuItem[] = [];
  shortlist.forEach((p, i) => {
    const pb = d7[i];
    if (pb == null) funnel.d7Fail++;
    else if (pb < d7Min) funnel.d7Low++;
    else if (menu.length < size)
      menu.push({
        id: `A${menu.length + 1}`,
        start: p.start,
        end: p.end,
        surface: p.surface,
        wrong: p.wrong,
        sentenceNo: p.sentenceNo,
        fam: p.a.fam,
        famKo: FAMILY_KO[p.a.fam],
        code: FAMILY_CODE[p.a.fam],
        dist: p.a.dist,
        clue: p.a.clue,
        depth: p.a.depth,
        pBroke: pb,
        rule: p.rule,
      });
  });
  funnel.menu = menu.length;
  return { menu, funnel };
}
