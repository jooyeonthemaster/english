// crit 비평(RESCUE-SPEC §5.4-1 = rep §5.3-2 진단) — 게이트 통과 초안의 미끼 4개(T1 린트 + DG)와 정답(R-lint·depth + D7)을 본다.
//   미끼 결함: T1 적중 또는 DG ≥ θ_swap(0.65) — P_dead 높은 순 최대 maxDecoyFlags(기본 2)개.
//   정답 결함: R-lint 적중, 또는 (대용형 쌍이 아니고) D7 pBroke < 0.3. D7 미상(jev 실패)은 0.5 로 보아 결함 아님.
// jev 는 DG 1요청(미끼 4문장) ∥ D7 1요청(+밴드 2) — 실패는 미상 처리(§6)하고 note 로 남는다.
import { isProFormPair } from "../verify";
import type { StrategyContext } from "../strategies/index";
import { answerOf, displayOf, NUMS, type ItemMark, type ItemModel } from "./item-model";
import { askD7, askDG, d7Pair, dgSentence, pDeadStep } from "./jev-probes";
import { analyzeAnswer, FAMILY_KO, type AnswerAnalysis } from "./lint-answer";
import { lintDecoy, T1_REASON_KO } from "./lint-decoy";

export const THETA_SWAP = 0.65;
export const ANSWER_PBROKE_MIN = 0.3;

export interface DecoyDiag {
  mark: ItemMark;
  /** 원문 등장순 1..5(번호 지문 원문자). */
  no: number;
  t1Rules: string[];
  dg: number | null;
  pDead: number;
  flagged: boolean;
  reason: string | null;
}

export interface AnswerDiag {
  mark: ItemMark;
  no: number;
  analysis: AnswerAnalysis;
  pBroke: number | null;
  exempt: boolean;
  flagged: boolean;
  reason: string | null;
}

export interface Critique {
  decoys: DecoyDiag[];
  answer: AnswerDiag;
  t1: number;
  dgMax: number | null;
  /** 사람이 읽는 결함 요약(기록용). */
  flags: string[];
}

/** 설계메모의 정답 자기 거리 — 정답 표현(원형·오형)이 든 메모 줄의 첫 "N단어". */
export function memoAnswerDist(rawText: string, ans: Pick<ItemMark, "shown" | "original">): number | null {
  const memo = rawText.split("밑줄지문:")[0] ?? "";
  const keys = [ans.shown, ans.original].map((s) => s.toLowerCase()).filter(Boolean);
  for (const line of memo.split("\n")) {
    const l = line.toLowerCase();
    if (!keys.some((k) => l.includes(k))) continue;
    const m = /(\d+)\s*단어/.exec(line);
    if (m) return Number(m[1]);
  }
  return null;
}

export async function critiqueItem(
  ctx: Pick<StrategyContext, "askJev">,
  item: ItemModel,
  o: { stage: string; thetaSwap?: number; maxDecoyFlags?: number; pBrokeMin?: number; memoDist?: number | null },
): Promise<Critique> {
  const theta = o.thetaSwap ?? THETA_SWAP;
  const pMin = o.pBrokeMin ?? ANSWER_PBROKE_MIN;
  const disp = displayOf(item.passage, item.marks);
  const ans = answerOf(item);
  const ansDisp = disp.marks.find((m) => m.role === "answer")!;
  const decoyMarks = item.marks.filter((m) => m.role !== "answer");
  const exempt = isProFormPair(ans.shown, item.fix);
  const pair = exempt ? null : d7Pair(item.passage, ans, ans.shown);
  const [dgs, d7] = await Promise.all([
    askDG(ctx, decoyMarks.map((m) => dgSentence(item.passage, item.marks, m)), o.stage),
    pair ? askD7(ctx, pair, { stage: o.stage, threshold: pMin, note: "draft-answer" }) : Promise.resolve({ p: null, asks: 0 }),
  ]);
  const decoys: DecoyDiag[] = decoyMarks.map((m, i) => {
    const dm = disp.marks.find((x) => x.start === m.start)!;
    const lint = lintDecoy(disp, dm);
    const dg = dgs[i];
    return {
      mark: m,
      no: item.marks.indexOf(m) + 1,
      t1Rules: lint.t1Rules,
      dg,
      pDead: pDeadStep(lint.t1, dg),
      flagged: false,
      reason: null,
    };
  });
  const cands = decoys.filter((d) => d.t1Rules.length > 0 || (d.dg != null && d.dg >= theta)).sort((x, y) => y.pDead - x.pDead || (y.dg ?? 0) - (x.dg ?? 0));
  for (const d of cands.slice(0, o.maxDecoyFlags ?? 2)) {
    d.flagged = true;
    d.reason =
      d.t1Rules.length > 0
        ? T1_REASON_KO[d.t1Rules[0]] ?? d.t1Rules[0]
        : `학생이 보자마자 옳다고 확정하는 죽은 미끼(판정 모델 확률 ${(d.dg ?? 0).toFixed(2)})`;
  }
  const analysis = analyzeAnswer(disp, ansDisp, item.fix, { memoDist: o.memoDist ?? null });
  const pBroke = exempt ? null : d7.p;
  const invalid = !exempt && pBroke != null && pBroke < pMin;
  const answer: AnswerDiag = {
    mark: ans,
    no: item.marks.indexOf(ans) + 1,
    analysis,
    pBroke,
    exempt,
    flagged: analysis.rlint.length > 0 || invalid,
    reason: analysis.rlint.length > 0 ? "오형이 보자마자 드러나는 인지형 정답" : invalid ? "다른 해석으로 문법적일 수 있는 정답" : null,
  };
  const dgKnown = decoys.map((d) => d.dg).filter((x): x is number => x != null);
  const flags = [
    ...decoys.filter((d) => d.flagged).map((d) => `decoy${NUMS[d.no - 1]}:${d.t1Rules.length ? `T1(${d.t1Rules.join("+")})` : `DG=${(d.dg ?? 0).toFixed(2)}`}`),
    ...(answer.flagged ? [`answer:${analysis.rlint.length ? `R(${analysis.rlint.join("+")})` : `pBroke=${(pBroke ?? 0).toFixed(2)}`}`] : []),
  ];
  return {
    decoys,
    answer,
    t1: decoys.filter((d) => d.t1Rules.length > 0).length,
    dgMax: dgKnown.length ? Math.max(...dgKnown) : null,
    flags,
  };
}

/** 검사 결과 줄(§5.4 프롬프트 {지적 줄}). */
export function critiqueLines(c: Critique): string[] {
  const out: string[] = [];
  for (const d of c.decoys) if (d.flagged) out.push(`- ${NUMS[d.no - 1]} ${d.mark.shown}: ${d.reason}`);
  if (c.answer.flagged) out.push(`- 정답 ${NUMS[c.answer.no - 1]} ${c.answer.mark.shown}: ${c.answer.reason}`);
  return out;
}

export { FAMILY_KO };
