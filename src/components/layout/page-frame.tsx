// ============================================================================
// 디렉터 페이지 프레임 정본 — exam-report library 디자인 언어의 공유 컴포넌트화
//
// 전 디렉터 페이지가 이 프레임을 쓴다(설계 바이블 §2):
//  - PageShell: bg-[#F4F6F9] 페이지 배경 + 패딩(-m 상쇄)
//  - SectionCard: 흰 카드 + WorkflowPageTitle 헤더 스트립 + 액션 슬롯
//  - StatusPill: soft 3톤 상태 배지 (slate/blue/emerald/rose/violet/teal)
//  - StatTile/StatStrip: KPI 스트립
// 주황/앰버 톤·Sparkles 아이콘 금지. 토스 hex(#191F28 등) 신규 사용 금지.
// ============================================================================

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";

/** 페이지 배경 셸 — AdminShell main(p-4 md:p-6)의 패딩을 상쇄하고 자체 패딩 */
export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-m-4 md:-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8",
        className,
      )}
    >
      {/* 전폭 정본(스펙 §6) — max-w 캡 금지. 좌우 여백은 셸 패딩(px-4 sm:px-6 xl:px-8)이 담당. */}
      <main className="flex w-full min-w-0 max-w-none flex-col gap-4">
        {children}
      </main>
    </div>
  );
}

/** 섹션 카드 — 헤더 스트립(WorkflowPageTitle + 액션) + 본문 */
export function SectionCard({
  icon,
  title,
  description,
  beta,
  actions,
  children,
  className,
  bodyClassName,
  headerClassName,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  beta?: boolean;
  /** 헤더 우측 액션 슬롯 */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 본문 패딩 오버라이드 — 기본 p-4. 테이블 풀블리드는 "p-0" */
  bodyClassName?: string;
  headerClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3",
          headerClassName,
        )}
      >
        <WorkflowPageTitle icon={icon} title={title} description={description} beta={beta} />
        {actions ? (
          // mr: 전역 작업 목록 플로팅 버튼(fixed right-0 top-0 h-14, task-queue-host)
          // 예약 코너 회피 — 메인이 충분히 안쪽으로 들어오는 초광폭에선 해제.
          <div className="mr-10 flex shrink-0 items-center gap-2 min-[1800px]:mr-0">
            {actions}
          </div>
        ) : null}
      </div>
      <div className={cn("min-w-0 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

// ── 상태 배지 ────────────────────────────────────────────────────────────────

export type PillTone = "slate" | "blue" | "emerald" | "rose" | "violet" | "teal" | "indigo";

const PILL_TONES: Record<PillTone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  teal: "border-teal-200 bg-teal-50 text-teal-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

export function StatusPill({
  tone,
  pulse,
  children,
  className,
}: {
  tone: PillTone;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        PILL_TONES[tone],
        className,
      )}
    >
      {pulse ? (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

// ── KPI 스트립 ───────────────────────────────────────────────────────────────

const TILE_VALUE_TONES: Record<PillTone, string> = {
  slate: "text-slate-900",
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  rose: "text-rose-600",
  violet: "text-violet-600",
  teal: "text-teal-600",
  indigo: "text-indigo-600",
};

export function StatTile({
  label,
  value,
  sub,
  tone = "slate",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5",
        className,
      )}
    >
      <span className="truncate text-[11px] font-medium text-slate-400">{label}</span>
      <span
        className={cn(
          "truncate text-lg font-bold leading-tight tabular-nums",
          TILE_VALUE_TONES[tone],
        )}
      >
        {value}
      </span>
      {sub ? <span className="truncate text-[11px] text-slate-400">{sub}</span> : null}
    </div>
  );
}

export function StatStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
