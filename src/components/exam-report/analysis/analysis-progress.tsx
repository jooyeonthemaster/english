"use client";

// ============================================================================
// 문항 분석 진행 표시 — 단일 컴포넌트로 일원화.
//   "문항 분석 n/N" 진행바 + 단계 라벨 + (실측 있으면) ETA. total=0 은 아직
//   E1a 문항 인식 전 — 인디터미닛 바 + "문항 인식 중" 표기(가짜 % 금지).
//   체크포인트 기반: 폴링으로 채워지는 진행값을 completed 로 받는다.
//   variant="full"   → 진입 시 전체 화면(스켈레톤 그리드 포함).
//   variant="inline" → 카드 리스트 상단 배너(스켈레톤 없음, 얇은 패딩).
// ============================================================================

import { Loader2 } from "lucide-react";

interface AnalysisProgressProps {
  completed: number;
  total: number;
  /** 남은 예상 시간(ms) — aiMeta.progress.msPerQuestion 실측 기반. 없으면 미표기 */
  etaMs?: number;
  variant?: "full" | "inline";
}

export function AnalysisProgress({
  completed,
  total,
  etaMs,
  variant = "full",
}: AnalysisProgressProps) {
  // total=0 = E1a(문항 인식) 전 — 진행률을 발명하지 않고 인식 중임을 그대로 보인다.
  const recognizing = total <= 0;
  const safeTotal = Math.max(total, 1);
  const done = Math.min(Math.max(completed, 0), safeTotal);
  const pct = Math.min(100, Math.round((done / safeTotal) * 100));
  // 전 문항 분석이 끝나면 시험지 종합(examLevel) 분석 단계로 넘어간다.
  const allDone = total > 0 && completed >= total;
  const stageLabel = recognizing
    ? "시험지 문항을 인식하고 있습니다"
    : allDone
      ? "시험지 종합 분석 중"
      : "문항을 분석하고 있습니다";
  const etaMin =
    !recognizing && !allDone && etaMs != null && etaMs > 0
      ? Math.max(1, Math.ceil(etaMs / 60_000))
      : null;
  const inline = variant === "inline";

  return (
    <div className="flex flex-col gap-6">
      <div
        className={
          inline
            ? "rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3"
            : "rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4"
        }
      >
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {stageLabel}
        </div>
        {!inline && (
          <p className="mt-1 text-xs text-blue-600/80">
            20년 경력 강사 수준의 정밀 분석은 시간이 걸립니다. 분석은 서버에서
            진행되므로 화면을 닫아도 계속됩니다 — 언제든 돌아와 진행 상황을
            확인하세요.
          </p>
        )}

        <div className={inline ? "mt-2.5" : "mt-4"}>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
            <span>
              {recognizing ? "문항 인식 중" : allDone ? "문항 분석 완료" : "문항 분석"}
              {etaMin != null && (
                <span className="text-slate-400"> · 약 {etaMin}분 남음</span>
              )}
            </span>
            {!recognizing && (
              <span className="tabular-nums font-medium text-slate-700">
                {done} / {total} 문항
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
            {recognizing ? (
              // 인디터미닛 — 문항 수 미확정이므로 % 를 그리지 않는다.
              <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-400" />
            ) : (
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            )}
          </div>
        </div>
      </div>

      {variant === "full" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: Math.min(Math.max(total, 4), 8) }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-slate-200" />
                <div className="h-3 w-1/2 rounded bg-slate-200" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-2.5 w-full rounded bg-slate-100" />
                <div className="h-2.5 w-5/6 rounded bg-slate-100" />
                <div className="h-2.5 w-2/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
