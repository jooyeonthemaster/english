"use client";

// ============================================================================
// 과제 상세 — "문항 통계" 탭 (EXAM·QUESTIONS 한정)
//
// getAssignmentQuestionStats(U1) 소비: 문항별 정답률·오답 선지 분포를
// 취약 문항 우선(정답률 오름차순 — 서버 정렬)으로 렌더한다. 탭이 처음
// 활성화될 때 1회만 lazy 로드(같은 과제에서 탭 재방문 시 재조회 없음).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  getAssignmentQuestionStats,
  type AssignmentQuestionStatsData,
} from "@/actions/study-assignments";
import { cn } from "@/lib/utils";

/** 정답률 3단 톤 — <50% 취약(rose) / <80% 보통(blue) / 이상 안정(emerald) */
function rateTone(rate: number): { bar: string; text: string } {
  if (rate < 50) return { bar: "bg-rose-500", text: "text-rose-600" };
  if (rate < 80) return { bar: "bg-blue-600", text: "text-blue-600" };
  return { bar: "bg-emerald-500", text: "text-emerald-600" };
}

export function AssignmentQuestionStats({
  assignmentId,
  active,
}: {
  assignmentId: string;
  /** 탭 활성 여부 — 첫 활성화 시점에 로드 */
  active: boolean;
}) {
  const [data, setData] = useState<AssignmentQuestionStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || loadedForRef.current === assignmentId) return;
    loadedForRef.current = assignmentId;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await getAssignmentQuestionStats(assignmentId);
      if (cancelled) {
        loadedForRef.current = null;
        return;
      }
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error ?? "문항 통계를 불러오지 못했습니다.");
        loadedForRef.current = null; // 재시도 허용
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, assignmentId]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {loading ? (
        <div className="flex flex-col gap-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <p className="px-3 py-8 text-center text-[12.5px] text-slate-400">{error}</p>
      ) : !data || data.submittedCount === 0 || data.rows.length === 0 ? (
        <p className="px-3 py-8 text-center text-[12.5px] text-slate-400">
          아직 제출한 답안이 없습니다. 학생이 제출하면 문항별 정답률이 집계됩니다.
        </p>
      ) : (
        <>
          <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-400">
            취약 문항 순 · 제출 <span className="tabular-nums">{data.submittedCount}</span>명 기준
          </p>
          <div className="divide-y divide-slate-50">
            {data.rows.map((r) => {
              const rate = r.correctRate;
              const tone = rate != null ? rateTone(rate) : null;
              return (
                <div key={r.questionId} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11.5px] font-bold tabular-nums text-slate-500">
                    {r.orderNum > 0 ? r.orderNum : "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 break-keep text-[12.5px] text-slate-700">
                      {r.questionText ?? "(삭제된 문항)"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={cn("block h-full rounded-full", tone?.bar ?? "bg-slate-200")}
                          style={{ width: `${rate ?? 0}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          "text-[12px] font-bold tabular-nums",
                          tone?.text ?? "text-slate-300",
                        )}
                      >
                        {rate != null ? `${rate}%` : "—"}
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-400">
                        {r.correct}/{r.attempted}명 정답
                      </span>
                      {r.needsReview > 0 ? (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-700">
                          확인 필요 {r.needsReview}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {/* 오답 선지 분포 — 빈도 상위 4개 */}
                  {r.wrongChoices.length > 0 ? (
                    <div className="flex max-w-[180px] shrink-0 flex-wrap justify-end gap-1">
                      {r.wrongChoices.slice(0, 4).map((w) => (
                        <span
                          key={w.choice}
                          className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-slate-600"
                        >
                          <span className="font-bold">{w.choice}</span> {w.count}명
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
