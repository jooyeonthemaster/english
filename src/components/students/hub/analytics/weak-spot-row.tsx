"use client";

// ============================================================================
// 보충 필요 행·CTA — "같은 버튼, 같은 자리" 단일 컴포넌트
// (docs/director-console-v3-design.md §D2-1)
//
// WeakSpotRow: 라벨 + 지표 바(MetricBar) + 점수 + 말 설명(scoreExplain, 규칙
// R10 — 점수 단독 노출 금지) + 상시 노출 h-6 미니 버튼 「과제 보내기」(호버
// 시 강조만 — hover-reveal 금지, §0.1-2 발견성 계약).
// WeakPointCta: row(행 내 미니) / card(카드 우상단 「이 범위로 과제 보내기」)
// 2형 단일 정본. 배선은 트랙 A 소관 — 셸의 openDeployComposer 를 onDeploy 로
// 받는다(아직 소비자 없음).
// ============================================================================

import { Send } from "lucide-react";
import type { WeakMetricKind, WeakSpot } from "@/lib/student-analytics/types";
import { CTA_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { MetricBar, scoreText } from "./kit";

/** 지표 종별 단위 — 숙달도만 「점」, 정답률 계열은 「%」 (D6 워딩) */
function metricUnit(kind: WeakMetricKind): string {
  return kind === "mastery" ? "점" : "%";
}

/** 취약점 배포 CTA — 모든 보충 필요 표면에서 같은 모양·같은 워딩 */
export function WeakPointCta({
  variant,
  label,
  onClick,
  disabled,
  disabledTitle,
  className,
}: {
  /** row = 행 내 상시 h-6 미니 버튼 · card = 카드 우상단 버튼 */
  variant: "row" | "card";
  /** 기본 워딩(D6) — CTA_LABELS.SEND_TASK(row) · SEND_TASK_SCOPED(card) 소비 */
  label?: string;
  onClick: () => void;
  /** 배포 경로 없음(WeakSpot.deploy=null) — 비활성 + 사유 툴팁만(D2-1) */
  disabled?: boolean;
  disabledTitle?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white font-semibold transition-colors",
        variant === "row"
          ? "h-6 gap-1 px-2 text-[11.5px] text-slate-500"
          : "h-7 gap-1.5 px-2.5 text-[12px] text-slate-600",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
        className,
      )}
    >
      <Send className={variant === "row" ? "size-3" : "size-3.5"} aria-hidden />
      {label ?? (variant === "row" ? CTA_LABELS.SEND_TASK : CTA_LABELS.SEND_TASK_SCOPED)}
    </button>
  );
}

/** 보충 필요 행 — 랭킹 카드·목록의 공통 골격(라벨+바+점수+설명+상시 CTA) */
export function WeakSpotRow({
  spot,
  scoreExplain,
  onDeploy,
  disabledTitle,
  labelClassName,
  className,
}: {
  spot: WeakSpot;
  /** 말 설명 문자열 — director-glossary scoreExplain() 산출(규칙 R10) */
  scoreExplain: string;
  /** 배포 콜백 — 셸(student-hub-client)의 openDeployComposer 배선 지점 */
  onDeploy: (spot: WeakSpot) => void;
  /** deploy=null 사유 툴팁 문구(호출부 소유 — 킷은 워딩을 만들지 않는다) */
  disabledTitle?: string;
  /** 라벨 폭 조정(기본 w-[72px] — 긴 개념명은 호출부가 넓힌다) */
  labelClassName?: string;
  className?: string;
}) {
  const noDeploy = spot.deploy === null;
  return (
    <div className={cn("flex items-start gap-3 py-2", className)}>
      <div className="min-w-0 flex-1">
        <MetricBar
          label={
            <span className="block truncate" title={spot.label}>
              {spot.label}
            </span>
          }
          labelClassName={labelClassName}
          value={spot.metric.value}
          aside={
            <span className={cn("text-[13px] font-bold", scoreText(spot.metric.value))}>
              {spot.metric.value}
              {metricUnit(spot.metric.kind)}
            </span>
          }
        />
        <p className="mt-1 truncate text-[11.5px] text-slate-400">{scoreExplain}</p>
      </div>
      <WeakPointCta
        variant="row"
        onClick={() => onDeploy(spot)}
        disabled={noDeploy}
        disabledTitle={noDeploy ? disabledTitle : undefined}
        className="mt-0.5"
      />
    </div>
  );
}
