"use client";

// ============================================================================
// 분석 진행 스트립 — ANALYZING 상단 고정 영역 (analysis-step 에서 분리).
//
// 실제 진행률 바 + ETA(aiMeta.progress 를 optional 소비 — 부재 시 클라 파생값
// 폴백, 문항 지도 자체가 없으면 "문항 인식 중") + 문항 칩 스트립.
// 칩 상태: OK=blue / FAILED=rose(클릭 → 해당 카드로 스크롤) / 미판정=slate pulse.
// 로직 없음 — 표시 전용. 진행 문구는 진실만(가짜 안내 금지).
// ============================================================================

import type { ExamAnalysisProgress } from "@/lib/exam-report/types";
import { AnalysisProgress } from "./analysis-progress";

/** 문항 칩 1개 — 상태와 스크롤 타깃은 상위(analysis-step)가 계산해 내린다. */
export interface QuestionChipInfo {
  number: string;
  state: "OK" | "FAILED" | "PENDING";
  /** 해당 분석 카드 DOM id — FAILED 칩 클릭 시 스크롤 타깃 */
  targetId: string;
}

interface AnalysisProgressStripProps {
  /** 서버 실측 진행 스냅샷 — 첫 체크포인트 전엔 null(=아직 문항 인식/1라운드 중) */
  progress: ExamAnalysisProgress | null;
  /** progress 부재 시 폴백 — 클라 파생(perQuestion 존재 수 / examMap 문항 수) */
  fallbackCompleted: number;
  fallbackTotal: number;
  chips: QuestionChipInfo[];
  onChipClick: (targetId: string) => void;
}

export function AnalysisProgressStrip({
  progress,
  fallbackCompleted,
  fallbackTotal,
  chips,
  onChipClick,
}: AnalysisProgressStripProps) {
  // 진행 수치는 서버 스냅샷과 클라 파생값 중 큰 쪽 — 체크포인트 직후 폴링이
  // 먼저 도착해도 진행바가 뒤로 가지 않는다(둘 다 같은 체크포인트 산출물).
  const total = progress?.total ?? fallbackTotal;
  const completed = Math.max(progress?.completed ?? 0, fallbackCompleted);
  // ETA 는 이번 실행 실측 msPerQuestion 이 있을 때만 — 추정치 발명 금지.
  const etaMs =
    progress?.msPerQuestion && progress.msPerQuestion > 0 && total > completed
      ? (total - completed) * progress.msPerQuestion
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <AnalysisProgress
        completed={completed}
        total={total}
        etaMs={etaMs}
        variant="inline"
      />
      {chips.length > 0 && (
        <QuestionChipStrip chips={chips} onChipClick={onChipClick} />
      )}
    </div>
  );
}

// ── 문항 칩 스트립 ───────────────────────────────────────────────────────────

function QuestionChipStrip({
  chips,
  onChipClick,
}: {
  chips: QuestionChipInfo[];
  onChipClick: (targetId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">문항별 진행</span>
        <span className="flex items-center gap-3 text-[11px] text-slate-400">
          <LegendDot className="bg-blue-500" label="완료" />
          <LegendDot className="bg-rose-500" label="실패" />
          <LegendDot className="bg-slate-300" label="대기" />
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          if (c.state === "FAILED") {
            return (
              <button
                key={c.number}
                type="button"
                onClick={() => onChipClick(c.targetId)}
                title="분석 실패 — 클릭하면 해당 문항 카드로 이동합니다"
                className="inline-flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-md border border-rose-200 bg-rose-50 px-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100"
              >
                {c.number}
              </button>
            );
          }
          return (
            <span
              key={c.number}
              className={
                "inline-flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-md px-1.5 text-xs font-semibold " +
                (c.state === "OK"
                  ? "bg-blue-50 text-blue-700"
                  : "animate-pulse bg-slate-100 text-slate-400")
              }
            >
              {c.number}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
