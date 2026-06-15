"use client";

import { useMemo } from "react";
import { Loader2, CheckCircle2, AlertCircle, GraduationCap } from "lucide-react";
import { LEARNING_CATEGORIES } from "@/lib/learning-constants";
import {
  useLearningGenerationTasks,
  type LearningGenerationTask,
} from "@/lib/learning-generation-tracker";
import type { PassageAnalysisActivityJob } from "@/hooks/use-passage-analysis-activity";

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  LEARNING_CATEGORIES.map((c) => [c.value, c.label]),
);

interface PassageGroup {
  passageId: string;
  passageTitle: string;
  /** 서버 분석 잡(학습지 생성 플로우)이 돌고 있는 지문 */
  analysisRunning: boolean;
  generating: LearningGenerationTask[];
  done: number;
  error: number;
  total: number;
}

/**
 * 백그라운드 학습자료 생성 버퍼링 창.
 *
 * 두 소스를 합쳐 지문 단위로 보여준다:
 *  - analysisJobs: 학습지 생성(passages/create)발 서버 분석 잡 — 탭/새로고침
 *    무관(서버 상태 폴링).
 *  - 전역 트래커: 학습 문제 생성(generate-learning)발 클라이언트 fetch —
 *    같은 탭의 페이지 이동 동안 유지.
 */
export function LearningGenerationIndicator({
  analysisJobs = [],
}: {
  analysisJobs?: PassageAnalysisActivityJob[];
}) {
  const tasks = useLearningGenerationTasks();

  const groups = useMemo<PassageGroup[]>(() => {
    const byPassage = new Map<string, PassageGroup>();
    const groupFor = (passageId: string, passageTitle: string) => {
      let g = byPassage.get(passageId);
      if (!g) {
        g = {
          passageId,
          passageTitle,
          analysisRunning: false,
          generating: [],
          done: 0,
          error: 0,
          total: 0,
        };
        byPassage.set(passageId, g);
      }
      return g;
    };
    for (const j of analysisJobs) {
      groupFor(j.passageId, j.passageTitle).analysisRunning = true;
    }
    for (const t of tasks) {
      const g = groupFor(t.passageId, t.passageTitle);
      g.total += 1;
      if (t.status === "generating") g.generating.push(t);
      else if (t.status === "done") g.done += 1;
      else g.error += 1;
    }
    return Array.from(byPassage.values());
  }, [analysisJobs, tasks]);

  if (groups.length === 0) return null;

  const anyGenerating = groups.some(
    (g) => g.analysisRunning || g.generating.length > 0,
  );

  return (
    <div className="fixed bottom-6 right-8 z-40 w-[300px] rounded-xl border border-blue-200 bg-white shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50/70 border-b border-blue-100">
        {anyGenerating ? (
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        )}
        <span className="text-[12px] font-bold text-slate-800">
          {anyGenerating ? "학습자료 생성중" : "학습자료 생성 완료"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-white border border-blue-200 px-1.5 py-0.5 rounded-full">
          <GraduationCap className="w-3 h-3" />
          지문 {groups.length}개
        </span>
      </div>

      {/* Passage rows */}
      <ul className="max-h-[200px] overflow-y-auto divide-y divide-slate-100">
        {groups.map((g) => {
          const rowGenerating = g.analysisRunning || g.generating.length > 0;
          return (
            <li key={g.passageId} className="flex items-start gap-2.5 px-4 py-2.5">
              {rowGenerating ? (
                <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0 mt-0.5" />
              ) : g.error > 0 ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-700 truncate">
                  {g.passageTitle}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {g.analysisRunning ? (
                    "학습자료 생성중"
                  ) : g.generating.length > 0 ? (
                    <>
                      {g.generating
                        .map((t) => CATEGORY_LABELS[t.category] || t.category)
                        .join("·")}{" "}
                      생성중 ({g.done + g.error}/{g.total})
                    </>
                  ) : g.error > 0 ? (
                    `일부 실패 (${g.error}건)`
                  ) : (
                    "생성 완료"
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
