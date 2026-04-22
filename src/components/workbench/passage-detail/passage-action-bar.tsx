"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ListChecks,
  GraduationCap,
  FilePlus2,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Passage Action Bar — "이 지문을 ..." quick actions
// Kept as a local sub-component so it inherits passage props without
// another round-trip through context / props drilling.
// ---------------------------------------------------------------------------
export function PassageActionBar({
  passageId,
  onRunAnalysis,
  analyzing,
  onOpenExamDialog,
  onOpenAssignDialog,
}: {
  passageId: string;
  onRunAnalysis: () => Promise<void> | void;
  analyzing: boolean;
  onOpenExamDialog: () => void;
  onOpenAssignDialog: () => void;
}) {
  const router = useRouter();

  const handleAnalyze = useCallback(async () => {
    // The parent owns the running state (via `analyzing`) so we don't keep
    // a duplicate local spinner — the full-screen AnalysisLoadingOverlay is
    // the single source of truth and avoids double-spinner confusion that
    // existed when both this button and the overlay rendered Loader2.
    await onRunAnalysis();
  }, [onRunAnalysis]);

  const goGenerate = useCallback(() => {
    router.push(
      `/director/workbench/generate?passageIds=${encodeURIComponent(passageId)}`,
    );
  }, [passageId, router]);

  const goLearning = useCallback(() => {
    router.push(
      `/director/workbench/generate-learning?passageIds=${encodeURIComponent(passageId)}`,
    );
  }, [passageId, router]);

  return (
    <section
      aria-label="이 지문으로 할 수 있는 작업"
      className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-white p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-slate-700">
          이 지문을
        </h3>
        <span className="text-[11px] text-slate-400">
          다음 작업으로 바로 이어갑니다
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing}
          className="group flex items-center gap-2 h-11 px-3 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 hover:border-sky-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-left"
        >
          {/* Deliberately no Loader2 here — the AnalysisLoadingOverlay
              provides the authoritative feedback to avoid a double spinner. */}
          <BarChart3 className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="text-[12px] font-semibold text-slate-700 group-hover:text-sky-800 truncate">
            5-layer 분석 실행
          </span>
        </button>

        <button
          type="button"
          onClick={goGenerate}
          className="group flex items-center gap-2 h-11 px-3 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 hover:border-sky-300 transition-colors text-left"
        >
          <ListChecks className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="text-[12px] font-semibold text-slate-700 group-hover:text-sky-800 truncate">
            문제 생성하기
          </span>
        </button>

        <button
          type="button"
          onClick={goLearning}
          className="group flex items-center gap-2 h-11 px-3 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 hover:border-sky-300 transition-colors text-left"
        >
          <GraduationCap className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="text-[12px] font-semibold text-slate-700 group-hover:text-sky-800 truncate">
            학습 문제 생성
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenExamDialog}
          className="group flex items-center gap-2 h-11 px-3 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 hover:border-sky-300 transition-colors text-left"
        >
          <FilePlus2 className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="text-[12px] font-semibold text-slate-700 group-hover:text-sky-800 truncate">
            시험에 추가
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenAssignDialog}
          className="group flex items-center gap-2 h-11 px-3 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 hover:border-sky-300 transition-colors text-left"
        >
          <Users className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="text-[12px] font-semibold text-slate-700 group-hover:text-sky-800 truncate">
            반 과제로 배포
          </span>
        </button>
      </div>
    </section>
  );
}
