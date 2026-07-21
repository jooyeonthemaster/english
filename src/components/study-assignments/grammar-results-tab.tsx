"use client";

// ============================================================================
// 과제 상세 — "훈련 현황" 탭 (GRAMMAR 어법 훈련 한정)
//
// getGrammarAssignmentResults 소비: 상단 요약 타일(시작 학생·평균 진행·평균
// 정답률)과 학생별 진행 테이블(푼 문항 n/m 바·정답률·최근 활동·훈련 기록
// 링크)을 렌더한다. 15초 자동 폴링(문서 비가시 시 중단) + 수동 갱신 + 마지막
// 갱신 시각. 최근 활동 3분 이내면 파란 펄스 도트("학습 중").
// 규범: docs/director-console-spec.md §3.2·§3.3.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Gauge, History, Loader2, RefreshCw, Target, Users } from "lucide-react";
import {
  getGrammarAssignmentResults,
  type GrammarResultsData,
} from "@/actions/study-assignments/grammar-results";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;
/** "학습 중" 라이브 판정 — 마지막 활동 3분 이내(spec §3.3) */
const LIVE_WINDOW_MS = 3 * 60_000;

type LoadMode = "initial" | "manual" | "poll";

/** 점수 3단 톤 — <50 취약(rose) / <80 보통(blue) / 이상 안정(emerald) */
function accuracyTone(pct: number): string {
  if (pct < 50) return "text-rose-600";
  if (pct < 80) return "text-blue-600";
  return "text-emerald-600";
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "방금 전";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

function fmtClock(date: Date): string {
  return date.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** 파란 펄스 도트 — "학습 중" 라이브 표시 */
function LiveDot() {
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
    </span>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{value}</p>
      {sub ? <p className="mt-0.5 text-[12px] text-slate-400">{sub}</p> : null}
    </div>
  );
}

export function GrammarResultsTab({ assignmentId }: { assignmentId: string }) {
  const [data, setData] = useState<GrammarResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const runRef = useRef<((mode: LoadMode) => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let busy = false;

    const run = async (mode: LoadMode) => {
      if (busy) return;
      busy = true;
      if (mode === "initial") {
        setLoading(true);
        setError(null);
      }
      if (mode === "manual") setRefreshing(true);
      try {
        const res = await getGrammarAssignmentResults(assignmentId);
        if (cancelled) return;
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
          setLastUpdatedAt(new Date());
        } else if (mode !== "poll") {
          // 폴링 실패는 기존 화면 유지(조용히), 초기·수동 실패만 에러 표면화
          setError(res.error ?? "훈련 현황을 불러오지 못했습니다.");
        }
      } finally {
        busy = false;
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    runRef.current = run;

    void run("initial");
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void run("poll");
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run("poll");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      runRef.current = null;
    };
  }, [assignmentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-16 text-[13px] text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        훈련 현황을 불러오는 중입니다
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white py-12">
        <p className="text-[13px] text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => void runRef.current?.("manual")}
          className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (!data || data.students.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-16 text-center">
        <p className="text-[13px] font-semibold text-slate-500">아직 훈련 기록이 없습니다</p>
        <p className="text-[13px] text-slate-400">
          학생이 어법 훈련을 시작하면 진행과 정답률이 여기에 실시간으로 집계됩니다.
        </p>
      </div>
    );
  }

  const { students, summary } = data;
  const now = Date.now();

  return (
    <div className="flex flex-col gap-3">
      {/* 갱신 스트립 — 마지막 갱신 시각 + 수동 갱신 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-slate-400">
          {lastUpdatedAt ? (
            <>
              마지막 갱신 <span className="tabular-nums">{fmtClock(lastUpdatedAt)}</span> · 15초마다
              자동 갱신
            </>
          ) : (
            "15초마다 자동 갱신"
          )}
          {error ? <span className="ml-1.5 text-rose-500">· {error}</span> : null}
        </p>
        <button
          type="button"
          onClick={() => void runRef.current?.("manual")}
          disabled={refreshing}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
          갱신
        </button>
      </div>

      {/* 요약 타일 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={<Users className="size-3.5 text-blue-500" aria-hidden />}
          label="시작 학생"
          value={
            <>
              {summary.startedCount}
              <span className="text-[13px] font-medium text-slate-400">
                {" "}
                / {summary.taskCount}명
              </span>
            </>
          }
          sub={`완료 ${summary.doneCount}명`}
        />
        <SummaryTile
          icon={<Gauge className="size-3.5 text-blue-500" aria-hidden />}
          label="평균 진행"
          value={summary.avgProgressPct != null ? `${summary.avgProgressPct}%` : "—"}
          sub="푼 문항 기준"
        />
        <SummaryTile
          icon={<Target className="size-3.5 text-emerald-500" aria-hidden />}
          label="평균 정답률"
          value={
            summary.avgAccuracyPct != null ? (
              <span className={accuracyTone(summary.avgAccuracyPct)}>
                {summary.avgAccuracyPct}%
              </span>
            ) : (
              "—"
            )
          }
          sub="훈련 시작 학생 기준"
        />
      </div>

      {/* 학생별 진행 테이블 */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[12px] text-slate-500">
                <th className="whitespace-nowrap px-3 py-2 font-medium">학생</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">진행</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">정답률</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">최근 활동</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">훈련 기록</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const progressPct =
                  s.total > 0 ? Math.min(100, Math.round((s.solved / s.total) * 100)) : 0;
                const live =
                  s.status !== "DONE" &&
                  s.lastActivityAt != null &&
                  now - new Date(s.lastActivityAt).getTime() < LIVE_WINDOW_MS;
                return (
                  <tr
                    key={s.taskId}
                    className="border-b border-slate-50 text-[13px] text-slate-700 transition-colors last:border-0 hover:bg-blue-50/40"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">
                      {s.studentName}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-20 shrink-0 whitespace-nowrap tabular-nums">
                          {s.total > 0 ? (
                            <>
                              {s.solved}
                              <span className="text-slate-400">/{s.total} 문항</span>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </span>
                        <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:w-36">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              s.status === "DONE" ? "bg-emerald-500" : "bg-blue-600",
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {s.accuracyPct != null ? (
                        <span
                          className={cn("font-bold tabular-nums", accuracyTone(s.accuracyPct))}
                        >
                          {s.accuracyPct}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {live ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
                          <LiveDot />
                          학습 중
                          <span className="font-normal text-slate-400">
                            · {fmtRelative(s.lastActivityAt)}
                          </span>
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "tabular-nums",
                            s.lastActivityAt ? "text-slate-500" : "text-slate-300",
                          )}
                        >
                          {fmtRelative(s.lastActivityAt)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link
                        href={`/director/students/${s.studentId}?tab=grammar`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <History className="size-3" aria-hidden />
                        훈련 기록
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
