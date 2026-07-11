"use client";

// 학생 상세 허브 — 개요 탭 "최근 14일 학습 리듬" 카드.
// 서버 확장 없이 어법 상세 프리로드(days)와 과제 completedAt 을 클라 집계해
// grammar-tab 14일 활동 차트의 h-16 컴팩트 미러를 보여준다.
// grammar null(플래그 OFF)·14일 기록 0이면 자체 미렌더.

import { ChevronRight } from "lucide-react";
import type { StudentStudyTaskRow } from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";
import type { GrammarSnapshot } from "./overview-tab";

const WEEK_MS = 7 * 86_400_000;

export function OverviewActivityCard({
  grammar,
  tasks,
  onGoTab,
}: {
  grammar: GrammarSnapshot | null;
  tasks: StudentStudyTaskRow[];
  onGoTab: (tab: string) => void;
}) {
  if (!grammar || grammar.days.length === 0) return null;
  const total14 = grammar.days.reduce((sum, d) => sum + d.solved, 0);
  if (total14 === 0) return null;

  // 이번 주(최근 7일) 요약 — 어법 풀이량·정답률 + 완료 과제(completedAt 기준)
  const week = grammar.days.filter((d) => d.offset <= 6);
  const weekSolved = week.reduce((sum, d) => sum + d.solved, 0);
  const weekCorrect = week.reduce((sum, d) => sum + d.correct, 0);
  const weekAccuracy = weekSolved > 0 ? Math.round((weekCorrect / weekSolved) * 100) : null;
  const now = Date.now();
  const weekDoneTasks = tasks.filter((t) => {
    if (!t.completedAt) return false;
    const done = new Date(t.completedAt).getTime();
    return now - done >= 0 && now - done < WEEK_MS;
  }).length;

  const maxSolved = Math.max(1, ...grammar.days.map((d) => d.solved));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold text-slate-600">최근 14일 학습 리듬</p>
        <button
          type="button"
          onClick={() => onGoTab("grammar")}
          className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-blue-600"
        >
          자세히
          <ChevronRight className="size-3" aria-hidden />
        </button>
      </div>

      {/* grammar-tab 14일 차트의 컴팩트 미러(h-24 → h-16) — 동일 색 규칙 */}
      <div className="flex h-16 items-end gap-1">
        {grammar.days.map((d) => {
          const h = d.solved > 0 ? Math.max(8, (d.solved / maxSolved) * 100) : 0;
          const acc = d.solved > 0 ? d.correct / d.solved : 0;
          return (
            <div
              key={d.offset}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${d.offset === 0 ? "오늘" : `${d.offset}일 전`} · ${d.solved}문항 · 정답 ${d.correct}`}
            >
              <div
                style={{ height: `${h}%` }}
                className={cn(
                  "w-full rounded-t",
                  d.solved === 0
                    ? "bg-transparent"
                    : acc >= 0.7
                      ? "bg-blue-500"
                      : acc >= 0.5
                        ? "bg-blue-300"
                        : "bg-rose-300",
                )}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-300">
        <span>13일 전</span>
        <span>오늘</span>
      </div>

      <p className="mt-2.5 border-t border-slate-50 pt-2.5 text-[12px] text-slate-500">
        이번 주 풀이{" "}
        <span className="font-bold tabular-nums text-slate-800">{weekSolved}</span>문항
        {weekAccuracy !== null ? (
          <>
            {" · "}정답률{" "}
            <span
              className={cn(
                "font-bold tabular-nums",
                weekAccuracy >= 70
                  ? "text-emerald-600"
                  : weekAccuracy < 50
                    ? "text-rose-600"
                    : "text-slate-800",
              )}
            >
              {weekAccuracy}%
            </span>
          </>
        ) : null}
        {" · "}완료 과제{" "}
        <span className="font-bold tabular-nums text-slate-800">{weekDoneTasks}</span>건
      </p>
    </div>
  );
}
