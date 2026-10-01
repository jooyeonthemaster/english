// 미끼 교체 후보 메뉴(RESCUE-SPEC §5.4 미끼 메뉴 = picker 상위 6개) — LAB/rescue/replay/lib/picker.mjs 의 필터·순위 이식.
// 후보는 원문 그대로의 단어(밑줄만 긋는다). 하드 제외: 기존 밑줄과 겹침·사이 <2단어, T1, 정답과 같은 범주, 저사전 구성,
// 대안형 부재·국소 강제 규칙, 코드당 2개 초과, 프로덕션 죽은 미끼 사유(decoyPrefilter KILLER), 게이트 인접 규칙 위반.
// 소프트(순위 단계): 같은 문장·T2 추가 규칙·사이 <3단어·첫 두 문장·정답① 위험. 순위 = (단계, (1−P_dead(DG))×livePrior, 해시).
// DG 는 상위 dgAsk 개만(요청당 ≤4문장) 묻고 DG < 0.45 만 남긴다(replay DG_MAX). jev 실패 후보는 검증 불가라 뺀다.
import { decoyDeadReasons } from "../planners/code-prior";
import { extractCandidates } from "../planners/candidates";
import { fnv1a32 } from "../seeded-random";
import { displayOf, type ItemMark, type ItemModel } from "./item-model";
import { askDG, dgSentence, pDeadSmooth } from "./jev-probes";
import { classifySite, lintDecoy, type DispMark } from "./lint-decoy";
import { LEX_ADJ } from "./lint-lex";
import { wordRange } from "./lint-syntax";
import type { StrategyContext } from "../strategies/index";

/** replay out/live-prior.json(Claude live 라벨, 구성별 스무딩 산 비율, a=5) — 선형 데이터 표. */
const LIVE_PRIOR: Readonly<Record<string, number>> = {
  "to-base": 0.361, "part-comma": 0.954, "part-other": 0.918, "rel-comma": 0.894, pron: 0.548, "oc-bare": 0.961, "part-postmod": 0.94,
  "agr-adjacent": 0.523, "rel-adj": 0.882, "be-pp": 0.71, "ed-finite": 0.894, "pron-demonstrative": 0.747, "rel-noun-clause": 0.915,
  "agr-attractor": 0.949, noun: 0.728, "adj-attrib": 0.924, "adj-other": 0.763, "agr-distant": 0.885, other: 0.547, "ing-after-verb": 0.411,
  "part-initial": 0.961, adv: 0.859, "be-ing": 0.781, "to-inf": 0.647, "rel-prep": 0.967, "prep-ing": 0.638, conj: 0.882,
  "pron-reflexive": 0.959, "agr-nosubj": 0.72, modal: 0.281, cmp: 0.492, "rel-initial": 0.867, "modal-base": 0.179, "adj-complement": 0.746,
  "have-pp": 0.328, parallel: 0.894, "rel-other": 0.66,
};
const LIVE_PRIOR_BASE = 0.788;
export const livePrior = (config: string): number => LIVE_PRIOR[config] ?? LIVE_PRIOR_BASE;
export const HARD_EXCLUDE_CONFIGS = new Set(["noun", "other", "modal", "modal-base", "to-base", "have-pp", "cmp", "adj-attrib", "prep-ing", "be-ing"]);
export const HARD_EXCLUDE_RULES = ["connective", "noun", "whToV", "article", "detAdj", "prepIng", "auxAdvPP", "subjAdj1", "bothOk"];
export const DG_MAX = 0.45;
const CONJ_LIKE_REL = new Set(["when", "if", "how", "why", "whether"]);

/** 범주 → 한국어(메뉴 줄). */
export const CAT_KO: Readonly<Record<string, string>> = {
  relative: "관계사·명사절", participle: "분사", finite: "정동사·준동사", agreement: "수일치", pronoun: "대명사", adjadv: "형용사·부사",
  voice: "태", objcomp: "목적격보어", parallel: "병렬", infinitive: "to부정사·동명사", conj: "접속사·전치사", cmp: "비교", other: "기타",
};

/** -ly 부사의 형용사 대안형이 어휘집에 있는가(picker.mjs adjAlt). */
function adjAlt(d: string): boolean {
  if (!d.endsWith("ly") || d.length < 5) return false;
  const c: string[] = [];
  if (d.endsWith("ily")) c.push(d.slice(0, -3) + "y");
  if (d.endsWith("ably") || d.endsWith("ibly")) c.push(d.slice(0, -1) + "e");
  if (d.endsWith("ically")) c.push(d.slice(0, -2), d.slice(0, -4));
  c.push(d.slice(0, -2));
  return c.some((x) => LEX_ADJ.has(x));
}

/** 게이트 인접 규칙(parser.ts gateMdQuestion): 두 밑줄 사이에 종결부호가 없으면 단어 ≥ minGap. 원문 오프셋 기준. */
export function gateSpacingOk(passage: string, a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  const [x, y] = a.start <= b.start ? [a, b] : [b, a];
  if (y.start < x.end) return false;
  const between = passage.slice(x.end, y.start);
  if (/[.!?]["”’']?(\s|$)/.test(between.trimEnd())) return true;
  const words = between.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  const sentenceCount = (passage.match(/[.!?]["”’']?(\s|$)/g) ?? []).length;
  return words >= (sentenceCount < 5 ? 1 : 3);
}

export interface DecoyMenuItem {
  id: string;
  start: number;
  end: number;
  surface: string;
  /** 1부터(리포 문장 분할기). */
  sentenceNo: number;
  cat: string;
  config: string;
  code: string;
  dg: number;
  prior: number;
  soft: string[];
}

interface Cand {
  start: number;
  end: number;
  surface: string;
  sentenceNo: number;
  cm: DispMark & { start: number; end: number };
  cls: ReturnType<typeof classifySite>;
  soft: string[];
  level: number;
  prior: number;
  h: number;
  sentence?: string;
}

/**
 * 교체 대상(flagged)을 뺀 유지 밑줄 기준으로 새 미끼 후보를 순위화하고 DG 로 거른 메뉴(≤size).
 * answerCat = 정답 범주(같은 범주 미끼 제외).
 */
export async function buildDecoyMenu(
  ctx: Pick<StrategyContext, "askJev">,
  a: { passageId: string; item: ItemModel; flagged: ItemMark[]; answerCat: string | null; size?: number; dgAsk?: number; stage: string },
): Promise<{ menu: DecoyMenuItem[]; funnel: Record<string, number> }> {
  const passage = a.item.passage;
  const size = a.size ?? 6;
  const kept = a.item.marks.filter((m) => !a.flagged.includes(m));
  const disp = displayOf(passage, kept);
  const ans = disp.marks.find((m) => m.role === "answer");
  const sentOf = (wr: DispMark["wr"]) => (wr ? disp.view.W[wr.a].sid : -1);
  const markedSents = new Set(disp.marks.map((m) => sentOf(m.wr)));
  const firstTwo = disp.marks.filter((m) => sentOf(m.wr) <= 1).length;
  const anyBeforeAns = ans ? disp.marks.some((m) => m !== ans && m.start < ans.start) : true;
  const codeCount: Record<string, number> = {};
  for (const m of disp.marks) if (m.code) codeCount[m.code] = (codeCount[m.code] || 0) + 1;
  const gapWords = (x: DispMark, y: DispMark) => (x.wr && y.wr ? Math.max(x.wr.a, y.wr.a) - Math.min(x.wr.b, y.wr.b) - 1 : 99);
  const funnel: Record<string, number> = { cands: 0, hard: 0, prefilter: 0, dgAsked: 0, dgFail: 0, dgHigh: 0, menu: 0 };
  const pre: Cand[] = [];
  for (const c of extractCandidates(passage, { variant: "full" })) {
    if (c.tokenIds.length > 2) continue;
    funnel.cands++;
    const surface = passage.slice(c.start, c.end);
    if (a.item.marks.some((m) => c.start < m.end && m.start < c.end)) continue;
    const dStart = disp.toD(c.start);
    const cm = { start: c.start, end: c.end, shown: surface, dStart, dEnd: dStart + surface.length, wr: null as DispMark["wr"] };
    cm.wr = wordRange(disp.view, cm.dStart, cm.dEnd);
    if (!cm.wr) continue;
    const minGap = Math.min(99, ...disp.marks.map((m) => gapWords(cm, m)));
    if (minGap < 2 || kept.some((m) => !gateSpacingOk(passage, m, c))) continue;
    const cls = classifySite(disp, cm);
    const lint = lintDecoy(disp, cm);
    const low = surface.toLowerCase();
    const hard =
      lint.t1 ||
      HARD_EXCLUDE_CONFIGS.has(cls.config) ||
      (!!a.answerCat && cls.cat === a.answerCat) ||
      HARD_EXCLUDE_RULES.some((r) => lint.rules[r]) ||
      /[-‐–]$/.test(passage.slice(Math.max(0, c.start - 1), c.start)) ||
      /^[-‐–]/.test(passage.slice(c.end, c.end + 1)) || // 하이픈 복합어 일부
      (cls.cat === "relative" && CONJ_LIKE_REL.has(low) && cls.config !== "rel-adj") || // 접속사 용법(대안형 부재)
      (cls.config === "adv" && !adjAlt(low)) || // 형용사 대안형이 어휘에 없는 부사
      (codeCount[cls.code] || 0) >= 2;
    if (hard) {
      funnel.hard++;
      continue;
    }
    const sid = sentOf(cm.wr);
    const soft: string[] = [];
    if (markedSents.has(sid)) soft.push("same-sentence");
    if (lint.t2) soft.push("t2:" + lint.t2Rules.join("+"));
    if (minGap < 3) soft.push("gap<3");
    if (sid <= 1 && firstTwo >= 1) soft.push("first-two");
    if (ans && !anyBeforeAns && c.start > ans.start) soft.push("answer-first");
    const relaxable = ["same-sentence", "gap<3", "first-two"];
    const level = soft.length === 0 ? 1 : soft.every((s) => relaxable.includes(s)) ? 2 : 3;
    pre.push({ start: c.start, end: c.end, surface, sentenceNo: c.sentenceIdx + 1, cm, cls, soft, level, prior: livePrior(cls.config), h: fnv1a32(`${a.passageId}:${c.start}`) });
  }
  // 프로덕션 죽은 미끼 사유(관사 옆·근접 동일형·전치사+ing·be+ly+pp) — KILLER 사전 필터(§4.7)
  const dead = decoyDeadReasons(passage, pre.map((x) => ({ id: `c${x.start}`, start: x.start, end: x.end, word: x.surface })));
  const alive = pre.filter((x) => (dead.get(`c${x.start}`) ?? []).length === 0);
  funnel.prefilter = pre.length - alive.length;
  alive.sort((x, y) => x.level - y.level || y.prior - x.prior || x.h - y.h);
  const top = alive.slice(0, a.dgAsk ?? 12);
  for (const x of top) x.sentence = dgSentence(passage, [...kept, x.cm], x.cm);
  const dgs = top.length ? await askDG(ctx, top.map((x) => x.sentence!), a.stage) : [];
  funnel.dgAsked = top.length;
  const scored: (Cand & { dg: number; score: number })[] = [];
  top.forEach((x, i) => {
    const dg = dgs[i];
    if (dg == null) funnel.dgFail++;
    else if (dg >= DG_MAX) funnel.dgHigh++;
    else scored.push({ ...x, dg, score: (1 - pDeadSmooth(dg)) * x.prior });
  });
  scored.sort((x, y) => x.level - y.level || y.score - x.score || x.h - y.h);
  const menu: DecoyMenuItem[] = [];
  for (const x of scored) {
    if (menu.length >= size) break;
    if (menu.some((m) => x.start < m.end && m.start < x.end)) continue;
    menu.push({
      id: `M${menu.length + 1}`,
      start: x.start,
      end: x.end,
      surface: x.surface,
      sentenceNo: x.sentenceNo,
      cat: x.cls.cat,
      config: x.cls.config,
      code: x.cls.code,
      dg: x.dg,
      prior: x.prior,
      soft: x.soft,
    });
  }
  funnel.menu = menu.length;
  return { menu, funnel };
}
