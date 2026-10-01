// 구제 전략 레지스트리 + 계약(RESCUE-SPEC §3.4) — arm.strategy 가 있으면 orchestrate.ts 가 이 모듈을 동적 import 해
// 플래너·1차·재생성·검증기 단계 대신 runStrategy 를 부르고, 받은 채택본으로 기존 4~5단계(판정·후처리·기록)를 돈다.
//
// 전략 구현자 규칙(strategies/<id>.ts 는 부품 조합만 — 150줄 이하 권장):
//   · 모든 LLM 콜은 ctx.llm(소형 stage 콜) / ctx.draft(초안 = 프로덕션 md v2 파싱·게이트)로 — 원장·캡·기록이 자동이다.
//   · 모든 jev 는 ctx.askJev / ctx.askJevPacked(재시도 2회·시도당 5s·전략당 동시 8 — planners 의 askJevPacked 직접 호출 금지)
//     — 실패는 throw 하므로 생성물을 죽이지 않게 잡아서
//     미상 처리(DG → P_dead 0.25, D7 → pBroke 0.5)하고 rec.flag/note 로 남긴다(§6).
//   · 선택 단계(재생성·수정·작가) 직전에 ctx.budget.allow({usd, ms?, stage}) — 비용 maxUsd·소프트 마감 추정 검사.
//     "<20s 일 때만 재생성" 같은 경과 시간 게이트는 두지 않는다(비평 반영: crit 수정 콜은 예산 안이면 항상 허용).
//   · 코드로 만든 최종 원문(수정 적용·재렌더)은 ctx.assemble(stage, text) 로 게이트 + 가상 레코드.
//   · 채택은 adoptByProductionRule(first, second) — 둘째가 게이트 이슈 ≤ 첫째일 때만 둘째.
//   · 반환: {adopted: {record, parsed}, lastQuestion, labChecks?}. record(StrategyRecord)는 ctx.rec 가 쌓고 오케스트레이터가 스냅샷한다.
// 등록: 아래 STRATEGIES 의 스텁 줄을 `id: () => import("./<id>").then((m) => m.<fn>)` 로 바꾼다.
import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { ArmConfig, AttemptRecord, LabPassage, RunResult, StrategyRecord } from "@/lib/qgen-lab/types";
import type { JevAnswer, JevQuestion, JevResult } from "../jev-client";
import type { LabParsed } from "../parse-gate";
import type { JevFragment } from "../planners/jev-questions";
import type { PackLimits } from "../planners/jev-questions-utils";
import type { DraftHost, DraftOpts, DraftOutcome } from "../rescue/draft";
import type { LlmCallOpts, LlmCallOutcome } from "../rescue/llm-call";

export { createStrategyContext, STRATEGY_JEV, BUDGET_EST } from "./context";
export type { StrategyContextInit } from "./context";

export interface StrategyStageHandle {
  /** 단계 note(시연 id·태그·토큰 추정 등) — 마지막 값이 남는다. */
  note(text: string): void;
}

export interface StrategyRecorder {
  /** 계측 단계 — 시작·길이·LLM/jev 지출 증분·성공 여부를 stages 에 남기고 {t:"stage"} 이벤트를 낸다(예외는 그대로 전파). */
  stage<T>(name: string, fn: (s: StrategyStageHandle) => Promise<T>): Promise<T>;
  addJev(usd: number, calls: number): void;
  repair(kind: StrategyRecord["repairs"][number]["kind"], detail: string): void;
  /** 잔여 결함 플래그(residualFlags — 캐스케이드 시뮬 입력). */
  flag(flag: string): void;
  note(text: string): void;
  fallback(reason: string): void;
  patch(p: Partial<Pick<StrategyRecord, "provenance" | "diagnosis" | "frm" | "writer">>): void;
  /** 이 실행 LLM 합(attempts costUsd) + jev 합. */
  spentUsd(): number;
  llmUsd(): number;
  jevUsd(): number;
  /** 실행 시작(t0) 이후 ms. */
  elapsedMs(): number;
  snapshot(): StrategyRecord;
}

export interface BudgetEstimate {
  usd: number;
  /** 있으면 소프트 마감 검사(elapsed + ms > softDeadlineMs 면 거부). */
  ms?: number;
  /** 있으면 거부 사유를 notes 에 "skip <stage>: …" 로 남긴다. */
  stage?: string;
  /** 270s 벽까지 남아야 할 최소 ms(기본 30s — 프로덕션 재생성 조건). */
  minWallMs?: number;
}

export interface StrategyBudget {
  maxUsd: number;
  softDeadlineMs: number;
  allow(est: BudgetEstimate): { ok: boolean; reason: string | null };
}

export interface StrategyContext extends DraftHost {
  arm: ArmConfig;
  passage: LabPassage;
  rep: number;
  /** 재생성 시드(labRegenSeed — 프로덕션 재추첨 재현, v2 KILLER 프롬프트에는 영향 없음). */
  regenSeed: number;
  batchId: string | null;
  /** arm.strategy.params(공통 가드 포함 원본). */
  params: Record<string, unknown>;
  /** 실행 시작 epoch ms. */
  t0: number;
  rec: StrategyRecorder;
  budget: StrategyBudget;
  /** LLM 1콜(파싱 없음) — kind "stage" 는 r/c 미방류. */
  llm(o: LlmCallOpts): Promise<LlmCallOutcome>;
  /** 초안 1콜 + 프로덕션 md v2 파싱·게이트. */
  draft(o: DraftOpts): Promise<DraftOutcome>;
  /** 원문 → 프로덕션 파싱·게이트(콜 없음). */
  gate(text: string, finishReason?: string | null): LabParsed;
  /** 코드 조립본 게이트 + 가상 레코드(kind "assemble"). */
  assemble(stage: string, text: string): { record: AttemptRecord; parsed: LabParsed };
  /** jev 1요청(재시도 2·시도당 5s·전략당 동시 8, 원장 phase <phaseBase>:jev, note "run=<runId> <stage>"). */
  askJev(state: unknown, questions: Record<string, JevQuestion>, o: { stage: string; note?: string }): Promise<JevResult>;
  /** 조각(jev-questions.ts 빌더 산출)을 packJevRequests 로 나눠 askJev(같은 정책)로 병렬 질의 → 답 병합. */
  askJevPacked(
    fragment: JevFragment,
    o: { stage: string; note?: string; limits?: PackLimits },
  ): Promise<{ answers: Record<string, JevAnswer>; costUsd: number; requests: number }>;
}

export interface StrategyResult {
  adopted: { record: AttemptRecord; parsed: LabParsed };
  /** 게이트 실패로 끝나도 기록할 마지막 파싱본(없으면 채택본의 question). */
  lastQuestion?: MdGrammarQuestion | null;
  /** RunResult.labChecks 에 병합(t1Hits·answerFamily·decoySelfCheck 등). */
  labChecks?: Partial<RunResult["labChecks"]>;
}

export type StrategyFn = (ctx: StrategyContext) => Promise<StrategyResult>;

/** 새 전략 id 를 먼저 등록할 때의 스텁(호출 시 "미구현" 오류). 현재 등록분은 모두 실구현. */
export const notImplemented =
  (id: string): (() => Promise<StrategyFn>) =>
  async () => {
    throw new Error(`구제 전략 미구현: ${id}`);
  };

/** 동적 import 레지스트리(키 = arm.strategy.id). 미구현 전략은 호출 시 "미구현" 오류 → 실행 status "error". */
export const STRATEGIES: Record<string, () => Promise<StrategyFn>> = {
  icl: () => import("./icl").then((m) => m.icl),
  cx: () => import("./cx").then((m) => m.cx),
  "icl+cx": () => import("./icl-cx").then((m) => m.iclCx),
  crit: () => import("./crit").then((m) => m.runCrit),
};

export function getStrategy(id: string): (() => Promise<StrategyFn>) | undefined {
  return Object.prototype.hasOwnProperty.call(STRATEGIES, id) ? STRATEGIES[id] : undefined;
}

/** 전략 실행 — 예외는 fallback "error: …" 를 남기고 그대로 던진다(오케스트레이터가 status "error" 로 기록). */
export async function runStrategy(ctx: StrategyContext): Promise<StrategyResult> {
  const id = ctx.arm.strategy?.id;
  try {
    if (!id) throw new Error(`팔 ${ctx.arm.id}: strategy 없음`);
    const load = getStrategy(id);
    if (!load) throw new Error(`구제 전략 미등록: ${id}`);
    const fn = await load();
    const res = await fn(ctx);
    if (!res?.adopted?.record || !res.adopted.parsed) throw new Error(`구제 전략 ${id}: 채택본 없음`);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.rec.fallback(`error: ${msg.slice(0, 200)}`);
    throw err;
  }
}
