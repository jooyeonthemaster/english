// 배치 큐 러너 — 매니페스트를 (지문×rep×팔) 큐로 펼쳐 클라 동시성으로 돌린다.
// 순서 interleave = 지문마다, rep 마다, 팔을 돌려가며(시간대 편향 상쇄). by-arm = 팔 → 지문 → rep.
// rep 는 1부터. 서버 runs 원장에 같은 (팔,지문,rep) 의 ok/gate_fail 기록이 있으면 건너뛴다(재개).
// 상태는 ref 가 정본이고 화면·window.__qgenLab 에는 변화마다 사본을 내보낸다.

import { useCallback, useEffect, useRef, useState } from "react";

import type { ArmConfig, BatchManifest } from "@/lib/qgen-lab/types";
import { answerLabelOf, type RunSummary } from "./api-utils";
import { publishBatch, publishError } from "./instrument-utils";
import { startLabRun, type LabRun, type LiveRunSnapshot } from "./run-store-utils";

export type BatchItemStatus = "queued" | "running" | "ok" | "gate_fail" | "error" | "skipped";
export type BatchState = "idle" | "running" | "paused" | "finished";

export interface BatchItem {
  key: string;
  idx: number;
  armId: string;
  passageId: string;
  rep: number;
  status: BatchItemStatus;
  runId: string | null;
  clientMs: number | null;
  serverMs: number | null;
  costUsd: number | null;
  failReason: string | null;
  attempts: number | null;
  answerLabel: string | null;
  run: LabRun | null;
  tries: number;
}

export interface BatchCounts {
  total: number;
  queued: number;
  running: number;
  ok: number;
  gate_fail: number;
  error: number;
  skipped: number;
  done: number;
}

export const itemKey = (armId: string, passageId: string, rep: number) => `${armId}|${passageId}|r${rep}`;

export function expandManifest(m: BatchManifest): BatchItem[] {
  const triples: [string, string, number][] = [];
  const reps = Array.from({ length: Math.max(1, m.reps) }, (_, i) => i + 1);
  if (m.order === "by-arm") {
    for (const a of m.armIds) for (const p of m.passageIds) for (const r of reps) triples.push([a, p, r]);
  } else {
    for (const p of m.passageIds) for (const r of reps) for (const a of m.armIds) triples.push([a, p, r]);
  }
  return triples.map(([armId, passageId, rep], idx) => ({
    key: itemKey(armId, passageId, rep),
    idx,
    armId,
    passageId,
    rep,
    status: "queued",
    runId: null,
    clientMs: null,
    serverMs: null,
    costUsd: null,
    failReason: null,
    attempts: null,
    answerLabel: null,
    run: null,
    tries: 0,
  }));
}

export function countItems(items: BatchItem[]): BatchCounts {
  const c: BatchCounts = { total: items.length, queued: 0, running: 0, ok: 0, gate_fail: 0, error: 0, skipped: 0, done: 0 };
  for (const it of items) c[it.status] += 1;
  c.done = c.ok + c.gate_fail + c.error + c.skipped;
  return c;
}

function settleIfIdle(items: BatchItem[], state: { current: BatchState }) {
  if (state.current === "idle") return;
  if (!items.some((i) => i.status === "queued" || i.status === "running")) state.current = "finished";
}

function applySnapshot(item: BatchItem, snap: LiveRunSnapshot) {
  const r = snap.result;
  item.status = snap.status === "ok" || snap.status === "gate_fail" ? snap.status : "error";
  item.runId = snap.runId ?? r?.runId ?? null;
  item.clientMs = snap.timing.doneMs;
  item.serverMs = r?.totalMs ?? null;
  item.costUsd = r?.cost?.totalUsd ?? null;
  item.failReason = item.status === "ok" ? null : r?.failReason ?? snap.error ?? null;
  item.attempts = r ? r.attempts.length : null;
  item.answerLabel = r ? answerLabelOf(r) : null;
}

export function useBatchRunner({
  arms,
  onRunSettled,
}: {
  arms: ArmConfig[];
  onRunSettled: (snap: LiveRunSnapshot) => void;
}) {
  const itemsRef = useRef<BatchItem[]>([]);
  const manifestRef = useRef<BatchManifest | null>(null);
  const stateRef = useRef<BatchState>("idle");
  const concurrencyRef = useRef(2);
  const loadTokenRef = useRef(0);
  const armsRef = useRef(arms);
  const settledRef = useRef(onRunSettled);
  useEffect(() => {
    armsRef.current = arms;
    settledRef.current = onRunSettled;
  }, [arms, onRunSettled]);

  const [view, setView] = useState<{
    manifest: BatchManifest | null;
    items: BatchItem[];
    state: BatchState;
    concurrency: number;
  }>({ manifest: null, items: [], state: "idle", concurrency: 2 });

  const bump = useCallback(() => {
    const items = itemsRef.current;
    const m = manifestRef.current;
    const c = countItems(items);
    publishBatch(
      m
        ? {
            id: m.id,
            total: c.total,
            done: c.done,
            running: c.running,
            failed: c.error,
            items: items.map((i) => ({
              key: i.key,
              runId: i.runId,
              status: i.status,
              clientMs: i.clientMs,
              serverMs: i.serverMs,
            })),
          }
        : null,
    );
    setView({
      manifest: m,
      items: items.map((i) => ({ ...i })),
      state: stateRef.current,
      concurrency: concurrencyRef.current,
    });
  }, []);

  // pump ↔ dispatch 상호 재귀 — ref 로 최신 함수를 잡는다.
  const pumpRef = useRef<() => void>(() => undefined);

  const dispatch = useCallback(
    (item: BatchItem) => {
      const m = manifestRef.current;
      if (!m) return;
      const token = loadTokenRef.current;
      const arm = armsRef.current.find((a) => a.id === item.armId);
      item.status = "running";
      item.tries += 1;
      item.failReason = null;
      const run = startLabRun({
        key: `${m.id}:${item.key}:${item.tries}`,
        hasPlanner: !!arm && arm.planner.id !== "none",
        request: { armId: item.armId, passageId: item.passageId, rep: item.rep, batchId: m.id },
      });
      item.run = run;
      void run.done.then((snap) => {
        if (loadTokenRef.current !== token) return; // 도중에 다른 배치를 불러왔다
        applySnapshot(item, snap);
        if (item.status === "error") publishError(`${item.key}: ${item.failReason ?? "unknown"}`);
        settledRef.current(snap);
        pumpRef.current();
        settleIfIdle(itemsRef.current, stateRef);
        bump();
      });
    },
    [bump],
  );

  const pump = useCallback(() => {
    if (stateRef.current !== "running") return;
    const items = itemsRef.current;
    let running = items.filter((i) => i.status === "running").length;
    for (const it of items) {
      if (running >= concurrencyRef.current) break;
      if (it.status !== "queued") continue;
      dispatch(it);
      running += 1;
    }
  }, [dispatch]);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const load = useCallback(
    (manifest: BatchManifest, prior: RunSummary[], skipPrior: boolean) => {
      if (stateRef.current === "running" || itemsRef.current.some((i) => i.status === "running")) return;
      loadTokenRef.current += 1;
      const items = expandManifest(manifest);
      if (skipPrior) {
        const byKey = new Map<string, RunSummary>();
        for (const s of prior) if (s.status === "ok" || s.status === "gate_fail") byKey.set(itemKey(s.armId, s.passageId, s.rep), s);
        for (const it of items) {
          const s = byKey.get(it.key);
          if (!s) continue;
          it.status = "skipped";
          it.runId = s.runId;
          it.serverMs = s.totalMs;
          it.clientMs = s.clientMs;
          it.costUsd = s.costUsd;
          it.failReason = s.status === "gate_fail" ? s.failReason : null;
          it.attempts = s.attempts;
          it.answerLabel = s.answerLabel;
        }
      }
      manifestRef.current = manifest;
      itemsRef.current = items;
      stateRef.current = "idle";
      concurrencyRef.current = Math.max(1, manifest.concurrency);
      bump();
    },
    [bump],
  );

  const start = useCallback(() => {
    if (!manifestRef.current) return;
    stateRef.current = "running";
    pump();
    settleIfIdle(itemsRef.current, stateRef);
    bump();
  }, [bump, pump]);

  const pause = useCallback(() => {
    if (stateRef.current !== "running") return;
    stateRef.current = "paused";
    bump();
  }, [bump]);

  const retryFailed = useCallback(() => {
    let n = 0;
    for (const it of itemsRef.current) {
      if (it.status !== "error") continue;
      it.status = "queued";
      it.failReason = null;
      n += 1;
    }
    if (!n) return;
    stateRef.current = "running";
    pump();
    bump();
  }, [bump, pump]);

  const setConcurrency = useCallback(
    (n: number) => {
      concurrencyRef.current = Math.max(1, Math.min(12, Math.floor(n) || 1));
      pump();
      bump();
    },
    [bump, pump],
  );

  return { ...view, counts: countItems(view.items), load, start, pause, retryFailed, setConcurrency };
}
