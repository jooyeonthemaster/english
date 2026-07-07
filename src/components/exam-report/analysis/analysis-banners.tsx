"use client";

// ============================================================================
// 문항 분석 탭 보조 프레젠테이션 — 배너/유형 필터/대기 스켈레톤 (analysis-step
// 에서 분리). 로직 없음: 상태·저장·드라이버는 전부 analysis-step 이 소유한다.
// ============================================================================

import { AlertTriangle, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── 이어서 분석 배너 ─────────────────────────────────────────────────────────
// 체인 단선/실패로 중단된 부분 분석 건의 막다른 화면 제거 — DRAFT/FAILED 인데
// examMap 과 미판정 문항이 남아 있으면 재개 CTA 를 노출한다(추가 과금 없음:
// 첫 실행 전액과금 후 paidFullRun 이 미시도 문항을 무료 처리 — W1).
export function ResumeAnalysisBanner({
  remaining,
  busy,
  onResume,
}: {
  remaining: number;
  busy: boolean;
  onResume: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-blue-700">분석이 중단되었습니다</p>
        <p className="mt-0.5 text-xs text-blue-600/90">
          남은 {remaining}문항을 이어서 분석할 수 있어요. 이미 과금된 문항은 추가로
          과금되지 않습니다.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onResume}
        disabled={busy}
        className="shrink-0 bg-blue-600 hover:bg-blue-700"
      >
        <Play className="h-3.5 w-3.5" />
        남은 {remaining}문항 이어서 분석
      </Button>
    </div>
  );
}

// ── 분석 실패 배너 ───────────────────────────────────────────────────────────

export function AnalysisFailedBanner({
  onRetry,
  busy,
  refundedCredits,
}: {
  onRetry: () => void;
  busy: boolean;
  refundedCredits?: number;
}) {
  // D2: "환불되었습니다" 문구는 실제 환불이 발생했을 때만 노출(허위 안내 방지).
  const refunded = (refundedCredits ?? 0) > 0;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
      <div className="flex-1">
        <p className="text-sm font-medium text-rose-700">문항 분석에 실패했습니다</p>
        <p className="mt-0.5 text-xs text-rose-600">
          {refunded
            ? `사용된 크레딧 ${refundedCredits}개가 환불되었습니다. 잠시 후 다시 시도해 주세요.`
            : "잠시 후 다시 시도해 주세요. 재시도 시 실패한 문항은 추가로 과금되지 않습니다."}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={busy}
        className="shrink-0 border-rose-300 text-rose-600 hover:bg-rose-100"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        재시도
      </Button>
    </div>
  );
}

// ── 유형 필터 칩 행 ──────────────────────────────────────────────────────────
// 카드 리스트 상단 — 문항 수가 많을 때 세로 무한 나열을 완화한다.

export interface AnalysisTypeOption {
  label: string;
  count: number;
}

export function AnalysisTypeFilter({
  options,
  active,
  onSelect,
}: {
  options: AnalysisTypeOption[];
  active: string | null;
  onSelect: (label: string | null) => void;
}) {
  // 유형이 하나뿐이면 필터가 의미 없다 — 렌더 생략.
  if (options.length <= 1) return null;
  const total = options.reduce((sum, o) => sum + o.count, 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
      <FilterChip
        label="전체"
        count={total}
        selected={active === null}
        onClick={() => onSelect(null)}
      />
      {options.map((o) => (
        <FilterChip
          key={o.label}
          label={o.label}
          count={o.count}
          selected={active === o.label}
          onClick={() => onSelect(active === o.label ? null : o.label)}
        />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
        (selected
          ? "border-blue-600 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700")
      }
    >
      {label}
      <span className="tabular-nums text-[11px] opacity-70">{count}</span>
    </button>
  );
}

// ── 분석 대기 카드(스켈레톤) ─────────────────────────────────────────────────

export function PendingCard({ number }: { number: string }) {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-400">
          {number}
        </span>
        <div className="h-3 w-1/2 rounded bg-slate-100" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-2.5 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  );
}
