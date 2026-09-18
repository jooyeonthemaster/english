"use client";

// 페이지 흐름 패널 — 이전 페이지 → [선택 경로] → 다음 페이지 3열. 흐름 미선택이면 안내 + 빠른 선택.

import { ArrowDown, ArrowRight, Route, X } from "lucide-react";
import type { FlowStep, PageFlow } from "@/lib/analytics/reports/pages";
import { fmtInt, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportEmpty, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { PathLabel, share } from "./path-label";
import { useNarrow } from "./use-narrow";

export function FlowPanel({
  selected,
  flow,
  loading,
  suggestions,
  onSelect,
  onClear,
}: {
  /** URL 의 flow 파라미터 */
  selected: string | null;
  /** 응답의 flow (선택 경로와 다르면 아직 로딩 중) */
  flow: PageFlow | null;
  loading: boolean;
  /** 미선택 시 빠른 선택 후보(인기 페이지 상위) */
  suggestions: string[];
  onSelect: (path: string) => void;
  onClear: () => void;
}) {
  const ready = !!selected && flow?.path === selected;

  return (
    <Section
      title="페이지 흐름"
      description="선택한 페이지 직전·직후에 본 페이지 Top 10 · 같은 탭 안의 이동 기준"
      right={
        selected ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="size-3.5" aria-hidden /> 닫기
          </button>
        ) : null
      }
    >
      {!selected && (
        <div className="space-y-3">
          <p className="flex items-start gap-1.5 text-[12.5px] text-gray-500">
            <Route className="mt-0.5 size-3.5 shrink-0 text-blue-500" aria-hidden />
            아래 표의 「흐름」 버튼을 누르거나 여기서 페이지를 고르면, 그 페이지로 오기 직전과 떠난 직후에 본 페이지를 보여줍니다.
          </p>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSelect(p)}
                  className="max-w-full truncate rounded-full border border-gray-200 bg-white px-2.5 py-1 font-mono text-[11.5px] text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && !ready && (loading ? <ReportSkeleton rows={4} /> : <ReportEmpty message="이 경로의 흐름을 볼 수 없습니다" />)}

      {selected && ready && flow && flow.totalViews === 0 && (
        <ReportEmpty message={`이 기간·필터에서 ${flow.path} 페이지뷰가 없습니다`} />
      )}

      {selected && ready && flow && flow.totalViews > 0 && (
        <div className="grid grid-cols-1 items-stretch gap-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)_auto_minmax(0,1fr)] xl:gap-3">
          <StepList
            heading="이전 페이지"
            steps={flow.previous}
            total={flow.totalViews}
            remainderLabel="이전 기록 없음(첫 페이지·새 탭)·그 외"
            emptyNote="직전에 본 페이지 기록이 없습니다"
            onSelect={onSelect}
          />
          <Connector />
          <div className="flex flex-col justify-center rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-4">
            <div className="text-[11px] font-semibold text-blue-600">선택한 페이지</div>
            <div className="mt-1.5 min-w-0">
              <PathLabel path={flow.path} className="max-w-full sm:max-w-full" />
            </div>
            <div className="mt-3 text-[24px] font-bold leading-none text-blue-700 tabular-nums">
              {fmtInt(flow.totalViews)}
              <span className="ml-1 text-[12px] font-semibold">페이지뷰</span>
            </div>
          </div>
          <Connector />
          <StepList
            heading="다음 페이지"
            steps={flow.next}
            total={flow.totalViews}
            remainderLabel="여기서 종료·그 외"
            emptyNote="이어서 본 페이지 기록이 없습니다"
            onSelect={onSelect}
          />
        </div>
      )}
    </Section>
  );
}

function Connector() {
  return (
    <div className="flex items-center justify-center text-gray-300" aria-hidden>
      <ArrowDown className="size-4 xl:hidden" />
      <ArrowRight className="hidden size-4 xl:block" />
    </div>
  );
}

function StepList({
  heading,
  steps,
  total,
  remainderLabel,
  emptyNote,
  onSelect,
}: {
  heading: string;
  steps: FlowStep[];
  total: number;
  remainderLabel: string;
  emptyNote: string;
  onSelect: (path: string) => void;
}) {
  const listed = steps.reduce((s, x) => s + x.count, 0);
  const remainder = Math.max(0, total - listed);
  const max = Math.max(1, ...steps.map((s) => s.count));
  // 좁은 판에서는 긴 경로가 말줄임으로 잘리고 터치에는 title 툴팁이 뜨지 않아 두 줄까지 접어 보여준다(표와 같은 규칙).
  const narrow = useNarrow();

  return (
    <div className="min-w-0 rounded-xl border border-gray-100 p-3">
      <div className="mb-2 text-[11px] font-semibold text-gray-400">{heading}</div>
      {steps.length === 0 && <p className="px-1 pb-1 text-[12px] text-gray-400">{emptyNote}</p>}
      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.path}>
            <button
              type="button"
              onClick={() => onSelect(s.path)}
              className="group relative flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-blue-50/40"
              title="이 페이지의 흐름으로 이동"
            >
              <span
                className="absolute inset-y-0.5 left-0 rounded-md bg-blue-50 group-hover:bg-blue-100/70"
                style={{ width: `${Math.max(2, Math.round((s.count / max) * 100))}%` }}
                aria-hidden
              />
              <span
                className={cn(
                  "relative min-w-0 flex-1 font-mono text-[12px] text-gray-800",
                  narrow ? "line-clamp-2 break-all whitespace-normal" : "truncate",
                )}
              >
                {s.path}
              </span>
              <span className="relative shrink-0 text-[12px] tabular-nums text-gray-600">{fmtInt(s.count)}</span>
              <span className="relative w-11 shrink-0 text-right text-[11px] tabular-nums text-gray-400">{fmtPct(share(s.count, total))}</span>
            </button>
          </li>
        ))}
        {remainder > 0 && (
          <li className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-gray-400">
            <span className="min-w-0 flex-1 truncate">{remainderLabel}</span>
            <span className="shrink-0 tabular-nums">{fmtInt(remainder)}</span>
            <span className="w-11 shrink-0 text-right text-[11px] tabular-nums">{fmtPct(share(remainder, total))}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
