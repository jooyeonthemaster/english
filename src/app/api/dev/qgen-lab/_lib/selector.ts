// qgen-lab 선별기 jev-select (PLANNER-SPEC §4) — best-of-N 병렬 생성본 중 1개를 고른다.
// 게이트 통과본마다 병렬 3갈래(생성이 끝난 후보부터 바로 시작 — 오케스트레이터 sampling.ts):
//   ① jev-d10 검증(verify.ts jevVerify — 규칙·임계는 PLN-VERIFY 소관, 여기선 pass 만 읽는다)
//   ② 표시 지문 1요청: 정답 표시문 단서거리 D(cueD, 0..4) + 미끼 4개 유혹도(tempt2, 0..2)
//   ③ 정답 쌍 D7 C_cls_ex(원문 문장 vs 표시 문장) → pBroke
// 품질 점수 = 0.5·pBroke + 0.3·(D/4) + 0.2·mean(tempt2/2).
// 채택 = 검증 통과본 중 최고점 → 없으면 게이트 통과본 중 최고점 → 그것도 없으면 null(호출측이 재생성). 동점은 attemptN 작은 쪽.
// 질문 문구는 planners/jev-questions.ts(보정 승자 축자) 빌더만 쓴다. 상태 모양은 보정(d5d6 buildR4·prep.mjs)과 같게:
//   state = {passage: 번호 지문 "【① x】…"}, target.marked_sentence = 표시 문장(오형 박힘)에서 대상만 ⟦ ⟧·다른 마커 제거.
// pBroke 를 따로 묻는 이유: VerifyResult 계약에 pBroke 필드가 없다(≈$0.00003·병렬이라 지연 0 — 계약에 생기면 재사용).
// 평가 실패(검증·jev 예외)는 던지지 않는다 — 후보 기록(note)에 남기고 점수 null(같은 층에서 최하위)로 순위만 내린다.
import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { VerifyResult } from "@/lib/qgen-lab/types";
import type { JevAnswer } from "./jev-client";
import {
  cueD,
  readScore,
  readValidity,
  tempt2,
  validityClsEx,
  type JevFragment,
} from "./planners/jev-questions";
import {
  askJevPacked,
  combineFragments,
  markedSentence,
  NUMS,
  sentencesByMarker,
} from "./planners/jev-questions-utils";
import { jevVerify } from "./verify";

export const SELECTOR_ID = "jev-select";
export const SELECT_WEIGHTS = { pBroke: 0.5, cue: 0.3, tempt: 0.2 } as const;

export type SelectorVerifyFn = (
  q: MdGrammarQuestion,
  passage: string,
  params: Record<string, unknown> | undefined,
  phase: string,
) => Promise<VerifyResult>;
export type SelectorAskFn = (
  fragment: JevFragment,
  opts: { phase: string; note?: string },
) => Promise<{ answers: Record<string, JevAnswer>; costUsd: number }>;

/** 외부 호출 주입점(오프라인 테스트는 스텁을 넣는다). 기본 = 실검증기 + askJevPacked(원장·캡은 askJev 가 처리). */
export interface SelectorDeps {
  verify: SelectorVerifyFn;
  ask: SelectorAskFn;
}
export const DEFAULT_SELECTOR_DEPS: SelectorDeps = { verify: jevVerify, ask: askJevPacked };

const MARK_RE = /\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g;

/** "(C)" → 3 (A=1). 형식 밖이면 0. */
export function labelNo(label: string): number {
  const m = /^\(?([A-J])\)?$/.exec(label.trim());
  return m ? m[1].charCodeAt(0) - 64 : 0;
}

/** [[X:shown]] → 【① shown】 (보정 prep.mjs 번호 지문과 같은 표기: 원문자 뒤 공백 1칸). ⑤ 너머 라벨이면 null. */
export function toNumberedDisplay(markedPassage: string): string | null {
  let bad = false;
  const out = markedPassage.replace(MARK_RE, (_m, letter: string, shown: string) => {
    const i = letter.charCodeAt(0) - 65;
    if (i >= NUMS.length) bad = true;
    return `【${NUMS[i] ?? "?"} ${shown}】`;
  });
  return bad ? null : out;
}

export interface SelectionProbe {
  numbered: string;
  ansNo: number;
  decoyNos: number[];
  /** state {passage: 번호 지문} — 키 `ans:D`, `t<no>:tempt2`. */
  display: JevFragment;
  /** state {original_sentence, modified_sentence} — 키 `C_cls_ex`. */
  validity: JevFragment;
}

/** 문항 → 선별 질문 2요청. 만들 수 없으면 사유 문자열. */
export function buildSelectionProbe(q: MdGrammarQuestion): SelectionProbe | string {
  if (!q.markedPassage?.includes("[[")) return "markedPassage 없음(지문 복사 형식 아님)";
  const numbered = toNumberedDisplay(q.markedPassage);
  if (!numbered) return "밑줄 라벨이 ⑤ 를 넘음";
  const ansNo = labelNo(q.answer);
  const byNo = new Map(q.marks.map((m) => [labelNo(m.label), m]));
  const ans = byNo.get(ansNo);
  if (!ans) return `정답 라벨 ${q.answer} 가 밑줄에 없음`;
  const sents = sentencesByMarker(numbered);
  const sentOf = (no: number) => (no >= 1 && no <= NUMS.length ? sents[no - 1] : "");
  const ansSent = sentOf(ansNo);
  if (!ansSent) return `정답 ${NUMS[ansNo - 1] ?? q.answer} 문장을 번호 지문에서 못 찾음`;
  const decoyNos = [...byNo.keys()].filter((no) => no !== ansNo && !!sentOf(no)).sort((x, y) => x - y);
  if (decoyNos.length === 0) return "미끼 문장을 번호 지문에서 못 찾음";

  const parts: { prefix: string; fragment: JevFragment }[] = [
    {
      prefix: "ans",
      fragment: {
        state: { passage: numbered },
        questions: cueD({ word: ans.shown, marked_sentence: markedSentence(ansSent, ansNo) }).questions,
      },
    },
    ...decoyNos.map((no) => ({
      prefix: `t${no}`,
      fragment: tempt2(numbered, {
        label: NUMS[no - 1],
        word: byNo.get(no)?.shown ?? "",
        marked_sentence: markedSentence(sentOf(no), no),
      }),
    })),
  ];
  const strip = (s: string) => s.replace(/[⟦⟧]/g, "");
  return {
    numbered,
    ansNo,
    decoyNos,
    display: combineFragments(parts),
    validity: validityClsEx(
      strip(markedSentence(ansSent, ansNo, ans.original)),
      strip(markedSentence(ansSent, ansNo)),
    ),
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 품질 점수(0~1). tempts 가 비면 유혹도 항 0. */
export function selectionScore(p: { pBroke: number; cueD: number; tempts: number[] }): number {
  const tMean = p.tempts.length > 0 ? p.tempts.reduce((s, t) => s + clamp(t, 0, 2) / 2, 0) / p.tempts.length : 0;
  return (
    SELECT_WEIGHTS.pBroke * clamp(p.pBroke, 0, 1) +
    SELECT_WEIGHTS.cue * (clamp(p.cueD, 0, 4) / 4) +
    SELECT_WEIGHTS.tempt * tMean
  );
}

export interface CandidateEval {
  verify: VerifyResult | null;
  verifyError: string | null;
  pBroke: number | null;
  cueD: number | null;
  tempts: number[] | null;
  score: number | null;
  /** 점수를 못 낸 사유(질문 조립 불가·jev 예외). */
  scoreError: string | null;
  /** 이 후보 평가 벽시계(3갈래 병렬). */
  ms: number;
  jevCostUsd: number;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 게이트 통과본 1개 평가 — 검증·D+tempt2·D7 을 병렬로. 예외를 던지지 않는다. */
export async function evaluateCandidate(
  q: MdGrammarQuestion,
  passageText: string,
  opts: { phase: string; verifyParams?: Record<string, unknown>; deps?: SelectorDeps },
): Promise<CandidateEval> {
  const t0 = Date.now();
  const deps = opts.deps ?? DEFAULT_SELECTOR_DEPS;
  const probe = buildSelectionProbe(q);
  // 동기 throw 도 거부로 받는다(스텁·주입 함수 방어).
  const settle = <T>(fn: () => Promise<T>) =>
    Promise.resolve()
      .then(fn)
      .then(
        (v) => ({ v, err: null as string | null }),
        (e: unknown) => ({ v: null as T | null, err: errMsg(e) }),
      );
  const [vr, dr, pr] = await Promise.all([
    settle(() => deps.verify(q, passageText, opts.verifyParams, opts.phase)),
    typeof probe === "string"
      ? Promise.resolve(null)
      : settle(() => deps.ask(probe.display, { phase: opts.phase, note: `select D+tempt2 ${probe.decoyNos.length}` })),
    typeof probe === "string"
      ? Promise.resolve(null)
      : settle(() => deps.ask(probe.validity, { phase: opts.phase, note: "select D7" })),
  ]);

  let cue: number | null = null;
  let tempts: number[] | null = null;
  let pBroke: number | null = null;
  let scoreError: string | null = typeof probe === "string" ? probe : null;
  if (typeof probe !== "string") {
    if (dr?.v) {
      cue = readScore(dr.v.answers["ans:D"]);
      tempts = probe.decoyNos.map((no) => readScore(dr.v?.answers[`t${no}:tempt2`]));
    } else scoreError = `D+tempt2: ${dr?.err ?? "응답 없음"}`;
    if (pr?.v) pBroke = readValidity(pr.v.answers.C_cls_ex);
    else scoreError = [scoreError, `D7: ${pr?.err ?? "응답 없음"}`].filter(Boolean).join(" · ");
  }
  const score =
    pBroke !== null && cue !== null && tempts !== null ? selectionScore({ pBroke, cueD: cue, tempts }) : null;
  return {
    verify: vr.v,
    verifyError: vr.err,
    pBroke,
    cueD: cue,
    tempts,
    score,
    scoreError,
    ms: Date.now() - t0,
    jevCostUsd: (vr.v?.jevCostUsd ?? 0) + (dr?.v?.costUsd ?? 0) + (pr?.v?.costUsd ?? 0),
  };
}

export interface SelectorEntry {
  slot: number;
  attemptN: number;
  gateClean: boolean;
  eval: CandidateEval | null;
}
export type SelectTier = "verified" | "gate-clean";

/** 채택 규칙(순수): 검증 통과 층 → 게이트 통과 층, 층 안에서 점수 내림차순(null 최하위)·attemptN 오름차순. */
export function pickCandidate(entries: SelectorEntry[]): { slot: number | null; tier: SelectTier | null } {
  const best = (xs: SelectorEntry[]) =>
    [...xs].sort((a, b) => {
      const sa = a.eval?.score ?? null;
      const sb = b.eval?.score ?? null;
      if (sa !== sb) {
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      }
      return a.attemptN - b.attemptN;
    })[0];
  const clean = entries.filter((e) => e.gateClean);
  const verified = clean.filter((e) => e.eval?.verify?.pass === true);
  if (verified.length > 0) return { slot: best(verified).slot, tier: "verified" };
  if (clean.length > 0) return { slot: best(clean).slot, tier: "gate-clean" };
  return { slot: null, tier: null };
}

const f2 = (x: number) => x.toFixed(2);

/** selection.candidates[i].note — 한 줄 요약(채택 표시·평가 수치·실패 사유). */
export function candidateNote(c: {
  gateIssues: string[];
  transportError: string | null;
  eval: CandidateEval | null;
  chosenTier: SelectTier | null;
}): string {
  const head = c.chosenTier
    ? c.chosenTier === "verified"
      ? "채택(검증 통과 최고점)"
      : "채택(검증 통과본 없음 → 게이트 통과 최고점)"
    : "";
  let body: string;
  if (c.transportError) body = `전송 실패: ${c.transportError.slice(0, 160)}`;
  else if (c.gateIssues.length > 0)
    body = `게이트: ${c.gateIssues[0].slice(0, 160)}${c.gateIssues.length > 1 ? ` 외 ${c.gateIssues.length - 1}건` : ""}`;
  else if (!c.eval) body = "평가 없음";
  else {
    const e = c.eval;
    const v = e.verify ? (e.verify.pass ? "검증 통과" : "검증 실패") : `검증 오류: ${(e.verifyError ?? "").slice(0, 120)}`;
    const s =
      e.score !== null
        ? `점수 ${e.score.toFixed(3)} (pBroke ${f2(e.pBroke ?? 0)} · D ${f2(e.cueD ?? 0)}/4 · 유혹 ${(e.tempts ?? []).map(f2).join("/")})`
        : `점수 없음: ${(e.scoreError ?? "").slice(0, 120)}`;
    body = `${v} · ${s} · 평가 ${e.ms}ms`;
  }
  return head ? `${head} · ${body}` : body;
}
