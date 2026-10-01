// 구제 전략 실행 문맥(RESCUE-SPEC §3.4 StrategyContext) — 기록기(rec)·예산 가드(§6)·바인딩된 부품(llm·draft·gate·assemble·askJev).
// 오케스트레이터가 실행마다 1개 만든다. attempts 는 RunResult.attempts 와 같은 배열(전략이 예외로 끝나도 콜 기록이 남는다).
import type {
  ArmConfig,
  AttemptRecord,
  GenModelConfig,
  LabEvent,
  LabPassage,
  ReasoningEffort,
  StrategyRecord,
  StrategyStage,
} from "@/lib/qgen-lab/types";
import { askJev as askJevRaw } from "../jev-client";
import { packJevRequests } from "../planners/jev-questions-utils";
import { draftItem, gateDraftText } from "../rescue/draft";
import { assembleRecord, lunaCall } from "../rescue/llm-call";
import type { BudgetEstimate, StrategyBudget, StrategyContext, StrategyRecorder } from "./index";

/** 전략 내부 jev 정책(비평 반영 26-09-25): 재시도 2회 · 시도당 5s · 전략당 동시 요청 ≤8. */
export const STRATEGY_JEV = { maxAttempts: 2, timeoutMs: 5_000, concurrency: 8 } as const;

/** §6 선택 단계 추정치(비용 USD · 시간 ms). */
export const BUDGET_EST = {
  usd: { draft: 0.0015, iclDraft: 0.0026, writer: 0.0008, revise: 0.0008, lens: 0.0008 },
  ms: { writer: 12_000, revise: 14_000, regen: 25_000 },
} as const;

const DEFAULT_MAX_USD = 0.012;
const DEFAULT_SOFT_DEADLINE_MS = 45_000;
const DEFAULT_MIN_WALL_MS = 30_000;
const EFFORTS: readonly ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh"];

export interface StrategyContextInit {
  arm: ArmConfig;
  passage: LabPassage;
  rep: number;
  seed: number;
  regenSeed: number;
  runId: string;
  batchId: string | null;
  t0: number;
  budgetMs: () => number;
  emit: (e: LabEvent) => void;
  phaseBase: string;
  attempts: AttemptRecord[];
}

const num = (v: unknown, dflt: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt);

/** 팔 gen + params.effort 덮어쓰기(K-L6med+icl 등). */
export function strategyGen(arm: ArmConfig): GenModelConfig {
  const effort = arm.strategy?.params?.effort;
  return typeof effort === "string" && (EFFORTS as readonly string[]).includes(effort)
    ? { ...arm.gen, effort: effort as ReasoningEffort }
    : arm.gen;
}

/** 동시 실행 상한 — 슬롯을 대기자에게 넘겨 상한을 넘지 않는다. */
function limiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < limit) active++;
    else await new Promise<void>((r) => queue.push(r));
    try {
      return await fn();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}

function createRecorder(init: StrategyContextInit, params: Record<string, unknown>): StrategyRecorder {
  const stages: StrategyStage[] = [];
  const repairs: StrategyRecord["repairs"] = [];
  const residualFlags: string[] = [];
  const notes: string[] = [];
  let extra: Partial<Pick<StrategyRecord, "provenance" | "diagnosis" | "frm" | "writer">> = {};
  let fallback: string | null = null;
  let jevUsd = 0;
  let jevCalls = 0;
  const llmUsd = () => init.attempts.reduce((s, a) => s + (a.costUsd ?? 0), 0);
  const elapsedMs = () => Date.now() - init.t0;
  return {
    async stage<T>(name: string, fn: (s: { note(text: string): void }) => Promise<T>): Promise<T> {
      const startMs = elapsedMs();
      const llm0 = llmUsd();
      const jev0 = jevUsd;
      const calls0 = jevCalls;
      let note: string | undefined;
      let ok = false;
      try {
        const r = await fn({
          note: (t) => {
            note = t;
          },
        });
        ok = true;
        return r;
      } finally {
        const ms = elapsedMs() - startMs;
        stages.push({
          name,
          startMs,
          ms,
          llmUsd: llmUsd() - llm0,
          jevUsd: jevUsd - jev0,
          jevCalls: jevCalls - calls0,
          ok,
          ...(note !== undefined ? { note } : {}),
        });
        try {
          init.emit({ t: "stage", name, ms, ...(note !== undefined ? { note: note.slice(0, 200) } : {}) });
        } catch {
          /* 표시 전용 */
        }
      }
    },
    addJev(usd, calls) {
      jevUsd += Number.isFinite(usd) ? usd : 0;
      jevCalls += Number.isFinite(calls) ? calls : 0;
    },
    repair(kind, detail) {
      repairs.push({ kind, detail });
    },
    flag(f) {
      if (!residualFlags.includes(f)) residualFlags.push(f);
    },
    note(t) {
      notes.push(t);
    },
    fallback(reason) {
      fallback = reason;
    },
    patch(p) {
      extra = { ...extra, ...p };
    },
    spentUsd: () => llmUsd() + jevUsd,
    llmUsd,
    jevUsd: () => jevUsd,
    elapsedMs,
    snapshot: (): StrategyRecord => ({
      strategyId: init.arm.strategy?.id ?? "",
      params: { ...params },
      stages: stages.map((s) => ({ ...s })),
      provenance: extra.provenance ?? null,
      diagnosis: extra.diagnosis ?? null,
      repairs: repairs.map((r) => ({ ...r })),
      residualFlags: [...residualFlags],
      frm: extra.frm ?? null,
      writer: extra.writer ?? null,
      fallback,
      notes: [...notes],
      jevUsd,
      jevCalls,
    }),
  };
}

function createBudget(init: StrategyContextInit, params: Record<string, unknown>, rec: StrategyRecorder): StrategyBudget {
  const maxUsd = num(params.maxUsd, DEFAULT_MAX_USD);
  const softDeadlineMs = num(params.softDeadlineMs, DEFAULT_SOFT_DEADLINE_MS);
  return {
    maxUsd,
    softDeadlineMs,
    allow(est: BudgetEstimate) {
      let reason: string | null = null;
      const spent = rec.spentUsd();
      const elapsed = rec.elapsedMs();
      const minWall = est.minWallMs ?? DEFAULT_MIN_WALL_MS;
      if (spent + est.usd > maxUsd) reason = `비용 $${(spent + est.usd).toFixed(4)} > $${maxUsd}`;
      else if (est.ms !== undefined && elapsed + est.ms > softDeadlineMs)
        reason = `소프트 마감 ${Math.round((elapsed + est.ms) / 1000)}s > ${Math.round(softDeadlineMs / 1000)}s`;
      else if (init.budgetMs() < minWall) reason = `벽 예산 ${Math.round(init.budgetMs() / 1000)}s < ${Math.round(minWall / 1000)}s`;
      if (reason && est.stage) rec.note(`skip ${est.stage}: ${reason}`);
      return { ok: reason === null, reason };
    },
  };
}

export function createStrategyContext(init: StrategyContextInit): StrategyContext {
  const params = { ...(init.arm.strategy?.params ?? {}) };
  let seq = 0;
  const rec = createRecorder(init, params);
  const budget = createBudget(init, params, rec);
  const jevLimit = limiter(STRATEGY_JEV.concurrency);
  const ctx: StrategyContext = {
    arm: init.arm,
    passage: init.passage,
    passageText: init.passage.text,
    difficulty: init.arm.difficulty,
    rep: init.rep,
    seed: init.seed,
    regenSeed: init.regenSeed,
    runId: init.runId,
    batchId: init.batchId,
    params,
    gen: strategyGen(init.arm),
    t0: init.t0,
    budgetMs: init.budgetMs,
    emit: init.emit,
    phaseBase: init.phaseBase,
    attempts: init.attempts,
    nextN: () => ++seq,
    rec,
    budget,
    llm: (o) => lunaCall(ctx, o),
    draft: (o) => draftItem(ctx, o),
    gate: (text, finishReason = null) => gateDraftText(ctx, text, finishReason),
    assemble(stage, text) {
      const parsed = gateDraftText(ctx, text);
      const record = assembleRecord(ctx, { stage, text, gateIssues: parsed.gateIssues });
      return { record, parsed: { ...parsed, gateIssues: [...parsed.gateIssues] } };
    },
    askJev: (state, questions, o) =>
      jevLimit(async () => {
        try {
          const r = await askJevRaw(state, questions, {
            phase: `${init.phaseBase}:jev`,
            note: `run=${init.runId} ${o.stage}${o.note ? ` ${o.note}` : ""}`,
            maxAttempts: STRATEGY_JEV.maxAttempts,
            timeoutMs: STRATEGY_JEV.timeoutMs,
          });
          rec.addJev(r.costUsd, 1);
          return r;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          rec.note(`jev 실패 ${o.stage}: ${msg.slice(0, 120)}`);
          throw err;
        }
      }),
    async askJevPacked(fragment, o) {
      const reqs = packJevRequests(fragment, o.limits ?? {});
      const rs = await Promise.all(
        reqs.map((r, i) =>
          ctx.askJev(r.state, r.questions, {
            stage: o.stage,
            note: `${o.note ?? ""}${reqs.length > 1 ? ` #${i + 1}/${reqs.length}` : ""}`.trim() || undefined,
          }),
        ),
      );
      return {
        answers: Object.assign({}, ...rs.map((r) => r.answers)),
        costUsd: rs.reduce((s, r) => s + r.costUsd, 0),
        requests: reqs.length,
      };
    },
  };
  return ctx;
}
