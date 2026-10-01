"use client";

// 단계 타임라인 칩(계획 · 1차(ttfb/첫 본문) · 재생성 · 검증 · 총) + 토큰·비용 계기.
// 실행 중엔 클라 기준 경과(신호색), 끝나면 서버 RunResult 수치로 갈아 끼운다.

import { useEffect, useState } from "react";

import { fmtChars, fmtKrw, fmtMs, fmtTokens, fmtUsd, sumNullable } from "./format-utils";
import type { LiveRunSnapshot } from "./run-store-utils";
import { Gauge } from "./ui-bits";

/** 실행 중에만 도는 시계(250ms). */
export function useTicker(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => (typeof performance !== "undefined" ? performance.now() : 0));
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

const KIND_LABEL = { gen: "차", regen: "재생성", escalate: "승급", stage: "단계", assemble: "조립" } as const;

export function RunTimeline({ snap, now, hasPlanner }: { snap: LiveRunSnapshot; now: number; hasPlanner: boolean }) {
  const r = snap.result;
  const live = snap.status === "running";
  const since = (relMs: number) => Math.max(0, now - (snap.t0 + relMs));

  if (r) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {(r.plan || r.planMs > 0) && <Gauge label="계획" value={fmtMs(r.planMs)} />}
        {r.attempts.map((a) => (
          <Gauge
            key={a.n}
            label={a.kind === "gen" ? `${a.n}${KIND_LABEL.gen}` : KIND_LABEL[a.kind]}
            value={fmtMs(a.durationMs)}
            sub={`ttfb ${fmtMs(a.ttfbMs)} · 본문 ${fmtMs(a.firstContentMs)}${a.adopted ? " ✓" : ""}`}
            tone={a.transportError ? "warn" : a.adopted ? "good" : "idle"}
            title={[
              `${a.model}${a.provider ? ` @${a.provider}` : ""}`,
              `finish=${a.finishReason ?? "—"} · 첫 사고 ${fmtMs(a.firstReasoningMs)}`,
              a.transportError ? `전송 오류: ${a.transportError}` : "",
              a.gateIssues.length ? `게이트 ${a.gateIssues.length}건` : "게이트 0건",
            ]
              .filter(Boolean)
              .join("\n")}
          />
        ))}
        {(r.verify || r.verifyMs > 0) && (
          <Gauge
            label="검증"
            value={fmtMs(r.verifyMs)}
            sub={r.verify ? (r.verify.pass ? "pass" : "fail") : undefined}
            tone={r.verify ? (r.verify.pass ? "good" : "warn") : "idle"}
          />
        )}
        <Gauge label="총" value={fmtMs(r.totalMs)} tone="idle" />
        <Gauge label="체감" value={fmtMs(snap.timing.doneMs)} tone="muted" title="클라 기준(실행 버튼 → done 도착)" />
      </div>
    );
  }

  const last = snap.attempts[snap.attempts.length - 1];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {snap.phase === "connecting" && live && <Gauge label="접속" value={fmtMs(since(0))} tone="live" />}
      {hasPlanner &&
        (snap.plan ? (
          <Gauge label="계획" value={fmtMs(snap.plan.ms)} />
        ) : snap.phase === "planning" && live ? (
          <Gauge label="계획" value={fmtMs(since(snap.timing.metaMs ?? 0))} tone="live" />
        ) : null)}
      {snap.attempts.map((a, i) => {
        const isLast = a === last;
        const next = snap.attempts[i + 1];
        const running = isLast && live && snap.phase !== "retrying";
        const dur = next
          ? next.startMs - a.startMs
          : running
            ? since(a.startMs)
            : snap.timing.doneMs != null
              ? snap.timing.doneMs - a.startMs
              : null;
        const think = a.firstContentMs != null ? a.firstContentMs - a.startMs : running ? since(a.startMs) : null;
        const write = a.firstContentMs != null ? (running ? since(a.firstContentMs) : null) : null;
        return (
          <Gauge
            key={`${a.n}-${i}`}
            label={a.kind === "gen" ? `${a.n}${KIND_LABEL.gen}` : KIND_LABEL[a.kind]}
            value={fmtMs(dur)}
            sub={`사고 ${fmtMs(think)}${write != null ? ` · 작성 ${fmtMs(write)}` : ""}`}
            tone={running ? "live" : "idle"}
            title={`${a.model} · 프롬프트 ${fmtChars(a.promptChars)}`}
          />
        );
      })}
      {snap.retries.map((rt, i) => (
        <Gauge key={`rt-${i}`} label="재시도" value={fmtMs(rt.atMs)} tone="warn" title={rt.reason} />
      ))}
      {snap.verifies.map((v, i) => (
        <Gauge key={`v-${i}`} label="검증" value={fmtMs(v.ms)} sub={v.pass ? "pass" : "fail"} tone={v.pass ? "good" : "warn"} />
      ))}
      <Gauge
        label={live ? "경과" : "체감"}
        value={fmtMs(live ? since(0) : snap.timing.doneMs)}
        tone={live ? "live" : "muted"}
      />
    </div>
  );
}

export function RunMetrics({ snap }: { snap: LiveRunSnapshot }) {
  const r = snap.result;
  if (!r) {
    const a = snap.attempts[snap.attempts.length - 1];
    if (!a) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Gauge label="사고" value={fmtChars(a.reasoning.length)} tone="muted" />
        <Gauge label="본문" value={fmtChars(a.content.length)} tone="muted" />
      </div>
    );
  }
  const tin = sumNullable(r.attempts.map((a) => a.inputTokens));
  const tout = sumNullable(r.attempts.map((a) => a.outputTokens));
  const trsn = sumNullable(r.attempts.map((a) => a.reasoningTokens));
  const c = r.cost;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Gauge label="in" value={fmtTokens(tin)} />
      <Gauge label="out" value={fmtTokens(tout)} />
      <Gauge label="reason" value={fmtTokens(trsn)} />
      <Gauge
        label="비용"
        value={fmtUsd(c?.totalUsd)}
        sub={fmtKrw(c?.totalUsd)}
        title={c ? `생성 ${fmtUsd(c.genUsd)} · jev ${fmtUsd(c.jevUsd)} · LLM 계획 ${fmtUsd(c.llmPlanUsd)}` : undefined}
      />
    </div>
  );
}

/** 클라 체감 타이밍 한 줄(meta / 첫 사고 / 첫 본문 / done). */
export function ClientTimingLine({ snap }: { snap: LiveRunSnapshot }) {
  const t = snap.timing;
  return (
    <p className="font-mono text-[0.6875rem] text-stone-500 tabular-nums">
      클라 meta {fmtMs(t.metaMs)} · 첫 사고 {fmtMs(t.firstReasoningMs)} · 첫 본문 {fmtMs(t.firstContentMs)} · done{" "}
      {fmtMs(t.doneMs)}
      {snap.seed != null && <span className="ml-2 text-stone-400">seed {snap.seed}</span>}
    </p>
  );
}
