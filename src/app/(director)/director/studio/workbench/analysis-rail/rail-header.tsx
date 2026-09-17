"use client";

// ============================================================================
// 레일 헤더 — 상태 칩 + 제목 + 새로고침·닫기 + (진행 바) + 여정 스트립 슬롯.
// v4(26-09-02, 정본 docs/exam-analysis-v4-spec.md §3 U5-1·U5-2)에서 행 화면과
// 후보(분석 전) 화면이 **같은 헤더 골격**을 쓰도록 분리했다 — 카드에서 무엇을
// 눌러도 레일 상단이 같은 모양이어야 「같은 콘솔」로 읽힌다.
//
// 진행 바는 기존 ANALYZING 바(§4 글로우 — "레일 진행 바 = 기존 ANALYZING 바
// 재사용")를 그대로 쓰고, boost RUNNING(AI 심층 분석 중 k/N)도 같은 바를 탄다.
// percent null = 총량 미상(1/3 폭 pulse).
// ============================================================================

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RailHeaderProgress {
  /** 0~100 · null = 총량 미상(불확정 pulse) */
  percent: number | null;
  caption: string;
}

export function RailHeader({
  badgeLabel,
  badgeClassName,
  badgeIcon: BadgeIcon,
  badgeSpinning = false,
  title,
  meta,
  onRefresh,
  onClose,
  progress,
  children,
}: {
  badgeLabel: string;
  badgeClassName: string;
  /** 칩 좌측 아이콘(후보 = FileClock). 스피너와 배타 — spinning 이 우선. */
  badgeIcon?: LucideIcon;
  badgeSpinning?: boolean;
  title: string;
  /** 제목 아래 1줄 메타(후보: 「문항 N」). */
  meta?: string | null;
  /** 없으면 새로고침 버튼을 그리지 않는다(ANALYZING·후보). */
  onRefresh?: () => void;
  onClose: () => void;
  progress?: RailHeaderProgress | null;
  /** 여정 스트립 슬롯 — 헤더 하단 상시(§3 U5-1). */
  children?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-b border-slate-100 px-3 pb-2.5 pt-1">
      <div className="flex min-w-0 items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
              badgeClassName,
            )}
          >
            {badgeSpinning ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : BadgeIcon ? (
              <BadgeIcon className="size-3" aria-hidden="true" />
            ) : null}
            {badgeLabel}
          </span>
          <h3
            className="mt-1.5 break-keep text-[13px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 line-clamp-2"
            title={title}
          >
            {title}
          </h3>
          {meta ? (
            <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-400">
              {meta}
            </p>
          ) : null}
        </div>
        {/* 새로고침 — 새 탭 검수·채점 복귀 수렴의 수동 채널(자동 수렴 2채널의
            보조). keep-previous 라 눌러도 백지 플래시가 없다. */}
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="상세 새로고침"
            title="상세 새로고침"
            className="mt-0.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <RotateCw className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          title="상세 닫기"
          // hidden xl:flex — <xl 드로어에는 드로어 자체 X 가 이미 있어 중복(실측).
          className="mt-0.5 hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 xl:flex"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* 진행 실황 — 요약 폴(row.progress / funnel.boost)이 소스라 5초 단위 자연 갱신 */}
      {progress ? (
        <div className="mt-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full bg-blue-500 transition-[width] duration-500",
                progress.percent == null && "w-1/3 animate-pulse",
              )}
              style={
                progress.percent != null
                  ? { width: `${progress.percent}%` }
                  : undefined
              }
            />
          </div>
          <p className="mt-1.5 break-keep text-[11px] leading-relaxed tabular-nums text-slate-400">
            {progress.caption}
          </p>
        </div>
      ) : null}

      {children ? <div className="mt-2.5 min-w-0">{children}</div> : null}
    </div>
  );
}
