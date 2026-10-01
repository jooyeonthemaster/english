// qgen-lab best-of-N 1차 생성(PLANNER-SPEC §4, arm.sampling) — 같은 프롬프트로 N개 병렬 → 후보마다 게이트 →
// 게이트 통과본은 생성이 끝나는 즉시 jev 평가(selector.ts)를 시작(다른 후보 생성과 겹쳐 선별 지연 최소화) → 전원 완료 후 선별.
// 후보마다 전송 재시도 규칙은 단일 경로와 같다(runAttempt 내부: EMPTY_BODY + 예산 ≥60s → 1회 재전송).
// 표시 방류: 사고(r)·본문(c) 델타는 채널별로 가장 먼저 흘린 후보 하나만 내보낸다(LabEvent 에 시도 번호가 없어
// 여러 후보가 섞이면 미리보기가 깨진다) — 첫 r/첫 c 도착 시각은 전 후보 중 최초와 같다. 그 후보가 전송 실패하면 잠금 해제.
// 선별 실패(채택 null) 시 재생성은 호출측(orchestrate) 몫 — 여기선 피드백 기준 후보(baseline = 슬롯 순 첫 파싱 후보)만 돌려준다.
import type { AttemptRecord, GenModelConfig, LabEvent, RunResult } from "@/lib/qgen-lab/types";
import {
  candidateNote,
  evaluateCandidate,
  pickCandidate,
  SELECTOR_ID,
  type CandidateEval,
  type SelectorDeps,
  type SelectTier,
} from "../selector";
import { runAttempt, type AttemptContext, type AttemptOutcome } from "./attempt";

/** 검증 실패 → 게이트 이슈 문구(재생성 피드백의 relocation 정규식 /정답 시비/ 발화).
 *  검증기 reason 이 이미 "정답 시비 — jev 검증:" 으로 시작하면(PLANNER-SPEC §3) 접두를 겹치지 않는다. */
export function jevVerifyIssue(reason: string): string {
  return /^정답 시비/.test(reason.trim()) ? reason.trim() : `정답 시비 — jev 검증: ${reason}`;
}

export interface SampledCandidate {
  slot: number;
  /** 이 후보의 마지막 콜 n(전송 재시도가 있으면 재전송 콜). 0 = 콜 기록 없음(콜 전 예외). */
  attemptN: number;
  outcome: AttemptOutcome | null;
  /** 전송 실패(재시도 후에도) — 없으면 null. */
  error: unknown;
  eval: CandidateEval | null;
  /** 생성 종료 시각(epoch ms). */
  genDoneAt: number;
}

export interface SamplingOutcome {
  candidates: SampledCandidate[];
  chosen: SampledCandidate | null;
  chosenTier: SelectTier | null;
  /** 채택이 없을 때 재생성 피드백 기준(슬롯 순 첫 파싱 후보). 전원 전송 실패면 null. */
  baseline: SampledCandidate | null;
  selection: NonNullable<RunResult["selection"]>;
}

/** 채널별 선착 후보만 통과시키는 emit 래퍼. */
function leadEmitter(emit: (e: LabEvent) => void) {
  const lead: { r: number | null; c: number | null } = { r: null, c: null };
  return {
    forSlot:
      (slot: number) =>
      (e: LabEvent): void => {
        if (e.t === "r" || e.t === "c") {
          if (lead[e.t] === null) lead[e.t] = slot;
          if (lead[e.t] !== slot) return;
        }
        emit(e);
      },
    release(slot: number): void {
      if (lead.r === slot) lead.r = null;
      if (lead.c === slot) lead.c = null;
    },
  };
}

export async function runSampledFirstAttempts(
  ctx: AttemptContext,
  a: {
    n: number;
    gen: GenModelConfig;
    /** 선별기 원장 phase. */
    phase: string;
    /** jevVerify params(팔 검증기가 jev-d10 이면 그 params, 아니면 undefined = 검증기 기본). */
    verifyParams?: Record<string, unknown>;
    /** 팔 검증기가 jev-d10 이고 onFail≠flag 면 검증 실패 = 게이트 이슈(그 후보는 게이트 통과본에서 빠진다). */
    verifyGates: boolean;
    deps: SelectorDeps;
    /** first-clean = jev 없이 게이트 통과본 중 슬롯 순서 첫 번째(대조군 — jb3 의 이득이 jev 선별인지 N회 시도인지 가른다). */
    selector?: "jev-select" | "first-clean";
  },
): Promise<SamplingOutcome> {
  const firstClean = a.selector === "first-clean";
  const n = Math.max(1, Math.min(8, Math.floor(a.n)));
  const lead = leadEmitter(ctx.emit);

  const runSlot = async (slot: number): Promise<SampledCandidate> => {
    // 후보별 기록 배열 — 끝나면(성공·실패 무관) 공유 attempts 로 옮긴다.
    const local: AttemptRecord[] = [];
    const cctx: AttemptContext = { ...ctx, attempts: local, emit: lead.forSlot(slot) };
    let outcome: AttemptOutcome | null = null;
    let error: unknown = null;
    let genDoneAt = Date.now();
    try {
      outcome = await runAttempt(cctx, { kind: "gen", gen: a.gen, feedback: null });
    } catch (err) {
      error = err;
      lead.release(slot);
    } finally {
      genDoneAt = Date.now();
      ctx.attempts.push(...local);
    }
    let ev: CandidateEval | null = null;
    if (!firstClean && outcome && outcome.parsed.gateIssues.length === 0 && outcome.parsed.question) {
      ev = await evaluateCandidate(outcome.parsed.question, ctx.passageText, {
        phase: a.phase,
        verifyParams: a.verifyParams,
        deps: a.deps,
      });
      outcome.record.verify = ev.verify;
      if (a.verifyGates && ev.verify && !ev.verify.pass) {
        // 검증 오류(ev.verify null)는 차단하지 않는다 — 인프라 실패로 깨끗한 후보를 버리지 않게(note 에 남음).
        const issue = jevVerifyIssue(ev.verify.reason);
        outcome.parsed.gateIssues = [...outcome.parsed.gateIssues, issue];
        outcome.record.gateIssues = [...outcome.record.gateIssues, issue];
      }
    }
    return { slot, attemptN: local[local.length - 1]?.n ?? 0, outcome, error, eval: ev, genDoneAt };
  };

  const candidates = await Promise.all(Array.from({ length: n }, (_, slot) => runSlot(slot)));
  const lastGenDoneAt = Math.max(...candidates.map((c) => c.genDoneAt));

  const gateClean = (c: SampledCandidate) =>
    !!c.outcome && c.outcome.parsed.gateIssues.length === 0 && !!c.outcome.parsed.question;
  const firstCleanSlot = candidates.find((c) => gateClean(c))?.slot ?? null;
  const pick: { slot: number | null; tier: SelectTier | null } = firstClean
    ? { slot: firstCleanSlot, tier: firstCleanSlot === null ? null : "gate-clean" }
    : pickCandidate(candidates.map((c) => ({ slot: c.slot, attemptN: c.attemptN, gateClean: gateClean(c), eval: c.eval })));
  const chosen = pick.slot === null ? null : (candidates[pick.slot] ?? null);
  const baseline = chosen ? null : (candidates.find((c) => c.outcome !== null) ?? null);

  const selection: NonNullable<RunResult["selection"]> = {
    selectorId: firstClean ? "first-clean" : SELECTOR_ID,
    chosenAttemptN: chosen?.attemptN ?? null,
    candidates: candidates.map((c) => ({
      attemptN: c.attemptN,
      gateClean: gateClean(c),
      verifyPass: c.eval?.verify ? c.eval.verify.pass : null,
      score: c.eval?.score ?? null,
      note: candidateNote({
        gateIssues: c.outcome?.parsed.gateIssues ?? [],
        transportError: c.error ? (c.error instanceof Error ? c.error.message : String(c.error)) : null,
        eval: c.eval,
        chosenTier: chosen === c ? pick.tier : null,
      }),
    })),
    // 선별이 더한 벽시계 = 마지막 후보 생성 종료 → 채택 결정(앞선 후보 평가는 생성과 겹쳐 여기 안 잡힌다 — 후보별 평가 ms 는 note).
    ms: Math.max(0, Date.now() - lastGenDoneAt),
    jevCostUsd: candidates.reduce((s, c) => s + (c.eval?.jevCostUsd ?? 0), 0),
  };
  return { candidates, chosen, chosenTier: pick.tier, baseline, selection };
}
