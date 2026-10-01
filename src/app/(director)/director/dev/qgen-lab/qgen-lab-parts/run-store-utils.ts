// 1회 실행 = POST /generate SSE 소비 + 외부 스토어(useSyncExternalStore 구독).
// 파서 루프는 use-generation-handlers.ts:409-458 정본 패턴. 실행은 클릭 핸들러에서만 시작한다 —
// 이펙트에서 시작하면 StrictMode 이중 마운트가 유료 생성을 두 번 쏜다(서버는 클라 이탈에도 계속 생성).
// 클라 타이밍은 t0(실행 버튼 시점 performance.now()) 기준 meta/첫 r/첫 c/done 도착 ms.

import type {
  AttemptRecord,
  GenerateRequest,
  LabEvent,
  PlannerPlan,
  RunResult,
  VerifyResult,
} from "@/lib/qgen-lab/types";
import { LAB_API, labErrorOf, postClientTiming } from "./api-utils";

export type LiveStatus = "running" | "ok" | "gate_fail" | "error" | "aborted";
export type LivePhase = "connecting" | "planning" | "generating" | "retrying" | "done";

export interface LiveAttempt {
  n: number;
  kind: AttemptRecord["kind"];
  model: string;
  promptChars: number;
  /** t0 기준 ms */
  startMs: number;
  firstReasoningMs: number | null;
  firstContentMs: number | null;
  reasoning: string;
  content: string;
}

export interface LiveTiming {
  metaMs: number | null;
  firstReasoningMs: number | null;
  firstContentMs: number | null;
  doneMs: number | null;
}

export interface LiveRunSnapshot {
  key: string;
  armId: string;
  passageId: string;
  rep: number;
  batchId: string | null;
  status: LiveStatus;
  phase: LivePhase;
  runId: string | null;
  seed: number | null;
  plan: PlannerPlan | null;
  verifies: VerifyResult[];
  attempts: LiveAttempt[];
  retries: { reason: string; atMs: number }[];
  result: RunResult | null;
  error: string | null;
  timing: LiveTiming;
  /** performance.now() 기준점 — 경과 표시용. */
  t0: number;
}

export interface LabRun {
  readonly key: string;
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => LiveRunSnapshot;
  abort: () => void;
  readonly done: Promise<LiveRunSnapshot>;
}

/** 서버 maxDuration 300s + 여유. */
const CLIENT_TIMEOUT_MS = 330_000;
/** r/c 델타 화면 반영 스로틀. */
const FLUSH_MS = 120;
/** 사고 텍스트 보관 상한(끝부분 유지) — 장시간 스트림 메모리 방어. */
const REASONING_CAP = 200_000;

export function startLabRun(args: {
  key: string;
  request: GenerateRequest;
  /** 실행 버튼 시점(여러 팔 동시 실행이면 같은 값). 없으면 지금. */
  t0?: number;
  hasPlanner?: boolean;
  /** 끝나면 POST /client-timing (기본 true). */
  postTiming?: boolean;
}): LabRun {
  const t0 = args.t0 ?? performance.now();
  const req = args.request;
  const ctrl = new AbortController();
  let abortReason: "user" | "timeout" | null = null;
  const timer = setTimeout(() => {
    abortReason = "timeout";
    ctrl.abort();
  }, CLIENT_TIMEOUT_MS);

  const state: LiveRunSnapshot = {
    key: args.key,
    armId: req.armId,
    passageId: req.passageId,
    rep: req.rep,
    batchId: req.batchId ?? null,
    status: "running",
    phase: "connecting",
    runId: null,
    seed: null,
    plan: null,
    verifies: [],
    attempts: [],
    retries: [],
    result: null,
    error: null,
    timing: { metaMs: null, firstReasoningMs: null, firstContentMs: null, doneMs: null },
    t0,
  };

  let snapshot: LiveRunSnapshot = { ...state };
  const listeners = new Set<() => void>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushNow = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    snapshot = {
      ...state,
      attempts: state.attempts.map((a) => ({ ...a })),
      verifies: [...state.verifies],
      retries: [...state.retries],
      timing: { ...state.timing },
    };
    for (const l of listeners) l();
  };
  const flushSoon = () => {
    if (!flushTimer) flushTimer = setTimeout(flushNow, FLUSH_MS);
  };
  const rel = () => Math.round(performance.now() - t0);
  const currentAttempt = (): LiveAttempt => {
    let a = state.attempts[state.attempts.length - 1];
    if (!a) {
      // attempt 이벤트 없이 델타가 오면(계약 위반 방어) 가상 시도를 연다.
      a = { n: 1, kind: "gen", model: "", promptChars: 0, startMs: rel(), firstReasoningMs: null, firstContentMs: null, reasoning: "", content: "" };
      state.attempts.push(a);
    }
    return a;
  };

  const handle = (e: LabEvent) => {
    switch (e.t) {
      case "meta":
        state.runId = e.runId;
        state.seed = e.seed;
        state.timing.metaMs ??= rel();
        state.phase = args.hasPlanner ? "planning" : "generating";
        return flushNow();
      case "plan":
        state.plan = e.plan;
        state.phase = "generating";
        return flushNow();
      case "attempt":
        state.attempts.push({
          n: e.n,
          kind: e.kind,
          model: e.model,
          promptChars: e.promptChars,
          startMs: rel(),
          firstReasoningMs: null,
          firstContentMs: null,
          reasoning: "",
          content: "",
        });
        state.phase = "generating";
        return flushNow();
      case "r": {
        const a = currentAttempt();
        const t = rel();
        a.firstReasoningMs ??= t;
        state.timing.firstReasoningMs ??= t;
        a.reasoning = (a.reasoning + e.d).slice(-REASONING_CAP);
        return flushSoon();
      }
      case "c": {
        const a = currentAttempt();
        const t = rel();
        a.firstContentMs ??= t;
        state.timing.firstContentMs ??= t;
        a.content += e.d;
        return flushSoon();
      }
      case "retry":
        state.retries.push({ reason: e.reason, atMs: rel() });
        state.phase = "retrying";
        return flushNow();
      case "verify":
        state.verifies.push(e.verify);
        return flushNow();
      case "stage":
        // 구제 전략 단계 종료 — 라이브 화면은 표시하지 않는다(결과 RunResult.strategy.stages 에 남음).
        return;
      case "done":
        state.result = e.result;
        state.runId ??= e.result.runId;
        state.status = e.result.status;
        if (e.result.status !== "ok" && e.result.failReason) state.error = e.result.failReason;
        state.plan ??= e.result.plan;
        return;
      case "error":
        state.error = e.message;
        state.status = "error";
        if (e.result) {
          state.result = e.result;
          state.runId ??= e.result.runId;
        }
        return;
    }
  };

  const run = async () => {
    const res = await fetch(`${LAB_API}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(await labErrorOf(res));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminal = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let event: LabEvent;
        try {
          event = JSON.parse(payload) as LabEvent;
        } catch {
          continue;
        }
        if (!event || typeof event !== "object" || typeof event.t !== "string") continue;
        handle(event);
        if (event.t === "done" || event.t === "error") terminal = true;
      }
    }
    if (!terminal) throw new Error("스트림이 done 없이 끊겼습니다(서버 결과는 runs 원장에 남았을 수 있음)");
  };

  const done = run()
    .catch((err: unknown) => {
      if (abortReason === "user") {
        state.status = "aborted";
        state.error = "사용자 중단(서버 생성은 계속될 수 있음)";
      } else if (abortReason === "timeout") {
        state.status = "error";
        state.error = `클라 타임아웃 ${CLIENT_TIMEOUT_MS / 1000}s`;
      } else {
        state.status = "error";
        state.error = err instanceof Error ? err.message : String(err);
      }
    })
    .then(() => {
      clearTimeout(timer);
      if (state.status === "running") state.status = "error";
      state.phase = "done";
      state.timing.doneMs = rel();
      flushNow();
      const runId = state.runId;
      if (runId && args.postTiming !== false && state.status !== "aborted") {
        void postClientTiming(
          {
            runId,
            clickToMetaMs: state.timing.metaMs,
            clickToFirstReasoningMs: state.timing.firstReasoningMs,
            clickToFirstContentMs: state.timing.firstContentMs,
            clickToDoneMs: state.timing.doneMs,
          },
          state.batchId,
        );
      }
      return snapshot;
    });

  return {
    key: args.key,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: () => snapshot,
    abort() {
      if (state.phase === "done") return;
      abortReason = "user";
      ctrl.abort();
    },
    done,
  };
}
