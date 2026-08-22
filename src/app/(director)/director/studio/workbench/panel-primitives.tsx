"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 클래스 패널 공용 프리미티브 (§3.1.3 보조)
//
// class-panel.tsx 의 분할 파일(500줄 규칙). 섹션 지연 조회 상태 훅과
// lemma-dossier 섹션 스트립 관용구 계열의 시각 문법(Sec·스켈레톤·오류·날짜
// 표기)을 모아 둔다 — 우측 패널 계열(class-panel·passage-dossier-pane §3.9)
// 공용. 다른 화면과는 공유하지 않는다.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { StudioActionResult } from "@/actions/studio/classes";

// ── 섹션 지연 조회 공통 상태 (섹션별 독립 — 한 섹션 실패가 패널을 비우지 않게) ──

export type SectionState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

export function useSectionData<T>(
  load: () => Promise<StudioActionResult<T>>,
  fallbackError: string,
): { state: SectionState<T>; retry: () => void } {
  const [state, setState] = useState<SectionState<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    load()
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data !== undefined) {
          setState({ status: "ready", data: res.data });
        } else {
          setState({ status: "error", error: res.error ?? fallbackError });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", error: fallbackError });
      });
    return () => {
      cancelled = true;
    };
  }, [load, fallbackError, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { state, retry };
}

// ── 날짜 표기 ────────────────────────────────────────────────────────────────

// 직접 조립 — toLocale* 의 "8. 10." 공백 삽입을 피해 워크벤치 카드 표기
// (custom-type-utils·deployments-panel의 "8.10 23:07" 꼴)와 정렬한다(감사 D6).

export function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 패널 공통 시각 문법 (lemma-dossier 섹션 스트립 관용구) ───────────────────

export function Sec({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-200/80">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-1.5">
        <h3 className="text-[10.5px] font-bold tracking-wide text-slate-600">{title}</h3>
        {action}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

/** 섹션 헤더 우측 텍스트 액션 — 클래스 홈 딥링크용 공통 꼴 */
export function SecLink({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-0.5 rounded text-[10.5px] font-semibold text-blue-600 transition-colors hover:text-blue-700 hover:underline"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

export function SectionSkeleton({
  rows = 3,
  rowHeight = "h-8",
}: {
  rows?: number;
  /** 실제 행 높이와 맞춰 로딩→완료 레이아웃 점프를 없앤다(감사 D6) */
  rowHeight?: string;
}) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${rowHeight} animate-pulse rounded-md bg-slate-100`} />
      ))}
    </div>
  );
}

export function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
      <p className="text-[11.5px] leading-relaxed text-rose-600 break-keep">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1.5 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-100"
      >
        다시 시도
      </button>
    </div>
  );
}

/** 지표 타일 한 칸 — 지표 스트립·학원 요약이 같은 꼴을 공유한다 */
export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-0.5 text-[15px] font-bold leading-tight tabular-nums text-slate-900">
        {value}
        <span className="ml-0.5 text-[10.5px] font-medium text-slate-400">{unit}</span>
      </p>
    </div>
  );
}
