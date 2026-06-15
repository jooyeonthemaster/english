"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { startAdaptivePoll } from "@/lib/adaptive-poll";

// ─────────────────────────────────────────────────────────────────────────────
// 진행 중인 지문 분석(학습자료 생성) 잡 폴링
//
// 학습지 생성(/workbench/passages/create)에서 시작한 학습자료 생성은 서버
// 백그라운드 잡(WorkbenchAiJob, domain=PASSAGE_ANALYSIS)으로 돈다. 다른
// 워크벤치 화면(문제 생성 등)에서 "이 지문은 지금 학습자료 생성중"을
// 보여주려면 서버 잡 상태를 폴링해야 한다 — 탭/새로고침과 무관하게 정확하다.
// ─────────────────────────────────────────────────────────────────────────────

export interface PassageAnalysisActivityJob {
  id: string;
  passageId: string;
  passageTitle: string;
  createdAt: string;
}

interface AiJobSummaryRow {
  id: string;
  status: string;
  title?: string | null;
  passageId?: string | null;
  createdAt: string;
  passage?: { id?: string; title?: string | null } | null;
}

const IN_PROGRESS_STATUSES = new Set(["PENDING", "PROCESSING"]);
const SUCCESS_STATUSES = new Set(["COMPLETED", "PARTIAL"]);

// ── 낙관적 시작 등록 ─────────────────────────────────────────────────────────
// 폴링 주기(5~30초) 때문에 생기는 배지 표시 딜레이를 없앤다: 분석 잡을 시작
// 하는 쪽이 notePassageAnalysisStarted()를 부르면 같은 탭의 모든 구독자에게
// 즉시 "생성중"으로 보이고, 이후 서버 폴이 잡을 확인하면 서버 상태로 넘어간다.
// TTL 안에 서버 폴이 한 번도 진행 중으로 못 본 항목(초고속 완료·캐시 응답)은
// 완료로 간주해 onSettled 를 태워 목록 새로고침을 유도한다.

interface OptimisticAnalysisStart {
  passageId: string;
  passageTitle: string;
  startedAt: number;
}

const OPTIMISTIC_TTL_MS = 15_000;

const optimisticStarts = new Map<string, OptimisticAnalysisStart>();
const optimisticListeners = new Set<() => void>();
const EMPTY_OPTIMISTIC: OptimisticAnalysisStart[] = [];
let optimisticSnapshot: OptimisticAnalysisStart[] = EMPTY_OPTIMISTIC;

function emitOptimistic() {
  optimisticSnapshot = Array.from(optimisticStarts.values());
  optimisticListeners.forEach((l) => l());
}

function subscribeOptimistic(listener: () => void) {
  optimisticListeners.add(listener);
  return () => optimisticListeners.delete(listener);
}

function getOptimisticSnapshot() {
  return optimisticSnapshot;
}

function getOptimisticServerSnapshot() {
  return EMPTY_OPTIMISTIC;
}

/** 분석 잡 시작 직후 호출 — 폴링을 기다리지 않고 즉시 "생성중"으로 표시. */
export function notePassageAnalysisStarted(
  passageId: string,
  passageTitle?: string,
) {
  optimisticStarts.set(passageId, {
    passageId,
    passageTitle: passageTitle || "지문",
    startedAt: Date.now(),
  });
  emitOptimistic();
}

/** 시작 요청이 실패했을 때(크레딧 부족 등) 낙관적 표시를 거둔다. */
export function notePassageAnalysisStartFailed(passageId: string) {
  if (optimisticStarts.delete(passageId)) emitOptimistic();
}

export interface PassageAnalysisActivityOptions {
  /**
   * 이 훅이 "진행 중"으로 보던 잡이 끝났을 때 호출된다(성공/실패 분리).
   * 지문 목록을 다시 불러 카드가 새로고침 없이 "분석 완료" 모습으로
   * 바뀌게 하는 용도. passageId 배열을 전달한다.
   */
  onSettled?: (completedPassageIds: string[], failedPassageIds: string[]) => void;
}

/** 진행 중(PENDING/PROCESSING)인 지문 분석 잡 목록. 진행 중일 땐 5초,
 *  한가할 땐 30초까지 백오프하며 폴링한다. */
export function usePassageAnalysisActivity(
  options?: PassageAnalysisActivityOptions,
): PassageAnalysisActivityJob[] {
  const [jobs, setJobs] = useState<PassageAnalysisActivityJob[]>([]);
  const onSettledRef = useRef(options?.onSettled);
  onSettledRef.current = options?.onSettled;
  // 직전 폴에서 진행 중이던 잡: jobId → passageId. 다음 폴에서 사라지거나
  // 완료 상태로 바뀐 잡을 "끝났다"로 판정한다.
  const prevInProgressRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    return startAdaptivePoll({
      activeMs: 5_000,
      // 다른 탭에서 시작된 생성도 30초 안에는 보이도록 짧게 잡는다(요약 뷰라 가벼움).
      idleMs: 30_000,
      run: async (signal) => {
        try {
          const res = await fetch(
            "/api/workbench/ai-jobs?domain=PASSAGE_ANALYSIS&limit=100&view=summary",
            { credentials: "include", cache: "no-store", signal },
          );
          if (!res.ok) return null;
          const data = (await res.json()) as { jobs?: AiJobSummaryRow[] };
          if (signal.aborted) return null;
          const rows = data.jobs ?? [];
          const pending = rows.filter(
            (j) => IN_PROGRESS_STATUSES.has(j.status) && j.passageId,
          );

          // 직전 폴에서 진행 중이던 잡이 끝났는지 판정 → onSettled 통지.
          const pendingIds = new Set(pending.map((j) => j.id));
          const statusById = new Map(rows.map((j) => [j.id, j.status]));
          const completed: string[] = [];
          const failed: string[] = [];
          for (const [jobId, passageId] of prevInProgressRef.current) {
            if (pendingIds.has(jobId)) continue;
            const status = statusById.get(jobId);
            // 100건 창 밖으로 밀려 상태를 모르면 성공으로 간주(낙관적 새로고침).
            if (status === undefined || SUCCESS_STATUSES.has(status)) {
              completed.push(passageId);
            } else {
              failed.push(passageId);
            }
          }
          prevInProgressRef.current = new Map(
            pending.map((j) => [j.id, j.passageId as string]),
          );

          // 낙관적 항목 정리: 서버가 같은 지문의 잡을 진행 중으로 보면 서버
          // 상태로 넘기고, TTL 이 지나도록 못 봤으면 초고속 완료로 간주한다.
          const pendingPassageIds = new Set(pending.map((j) => j.passageId));
          let optimisticChanged = false;
          for (const entry of Array.from(optimisticStarts.values())) {
            if (pendingPassageIds.has(entry.passageId)) {
              optimisticStarts.delete(entry.passageId);
              optimisticChanged = true;
            } else if (Date.now() - entry.startedAt > OPTIMISTIC_TTL_MS) {
              optimisticStarts.delete(entry.passageId);
              optimisticChanged = true;
              completed.push(entry.passageId);
            }
          }
          if (optimisticChanged) emitOptimistic();

          if (completed.length > 0 || failed.length > 0) {
            onSettledRef.current?.(completed, failed);
          }

          setJobs(
            pending.map((j) => ({
              id: j.id,
              passageId: j.passageId as string,
              passageTitle: j.passage?.title || j.title || "지문",
              createdAt: j.createdAt,
            })),
          );
          // 진행 중인 잡이 있으면 서명에 시각을 섞어 어댑티브 백오프를 막는다
          // (status 불변 → idleMs 까지 늘어져 완료 감지가 늦어지는 것 방지).
          if (pending.length > 0) {
            return `${pending.map((j) => `${j.id}:${j.status}`).join("|")}|t${Date.now()}`;
          }
          return "idle";
        } catch {
          return null;
        }
      },
    });
  }, []);

  const optimistic = useSyncExternalStore(
    subscribeOptimistic,
    getOptimisticSnapshot,
    getOptimisticServerSnapshot,
  );

  // 서버 폴 결과 + 아직 서버가 확인하지 못한 낙관적 시작을 합친다.
  return useMemo(() => {
    if (optimistic.length === 0) return jobs;
    const covered = new Set(jobs.map((j) => j.passageId));
    return [
      ...jobs,
      ...optimistic
        .filter((o) => !covered.has(o.passageId))
        .map((o) => ({
          id: `optimistic-${o.passageId}`,
          passageId: o.passageId,
          passageTitle: o.passageTitle,
          createdAt: new Date(o.startedAt).toISOString(),
        })),
    ];
  }, [jobs, optimistic]);
}
