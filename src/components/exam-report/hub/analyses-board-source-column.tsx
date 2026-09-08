"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 현황 보드 카드 좌측 열(시험지 썸네일 / 상태 패널)
//
// analyses-board-cards.tsx 에서 **자구 그대로** 이사(26-09-02, 파일 500줄 상한 —
// v4 깊이 칩·힌트 줄·심층 글로우 분기가 들어오며 카드 파일이 넘쳤다). 동작·
// 클래스 무변경. statusVisual 은 hideThumbnail(스튜디오) 모드의 제목 좌측 상태
// 아이콘 칩도 같이 쓰므로 export 한다(패널·오버레이 칩·아이콘 칩 단일 소스).
// ============================================================================

import {
  CircleCheck,
  FileClock,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import { cn } from "@/lib/utils";
import { AnalysisSourceThumbnail } from "./analysis-source-thumbnail";
import { STATUS_BADGE } from "./board-shared";

// 업로드한 시험지 사진이 있으면 그 1쪽 썸네일을 채우고, 없으면(자체 시험지·고아
// DRAFT) 상태 아이콘 패널이 그대로 드러난다. 썸네일이 덮은 경우 상태는 하단
// 오버레이 칩으로 유지한다.

/** 상태별 아이콘/색/라벨 — 패널과 오버레이 칩이 공유하는 단일 소스. */
export function statusVisual(
  status: ExamReportSummaryRow["status"],
  orphan: boolean,
) {
  if (orphan) {
    return {
      Icon: Upload as LucideIcon,
      tint: "text-slate-400",
      bg: "bg-slate-100/70",
      label: "등록 미완료",
    };
  }
  if (status === "FAILED") {
    return {
      Icon: TriangleAlert as LucideIcon,
      tint: "text-rose-400",
      bg: "bg-rose-50",
      label: STATUS_BADGE.FAILED.label,
    };
  }
  if (status === "ANALYZED") {
    return {
      Icon: CircleCheck as LucideIcon,
      tint: "text-emerald-500",
      bg: "bg-emerald-50",
      label: STATUS_BADGE.ANALYZED.label,
    };
  }
  return {
    Icon: FileClock as LucideIcon,
    tint: "text-blue-400",
    bg: "bg-blue-50/60",
    label: STATUS_BADGE.DRAFT.label,
  };
}

export function SourceColumn({
  row,
  orphan,
}: {
  row: ExamReportSummaryRow;
  orphan: boolean;
}) {
  const { Icon, tint, bg, label } = statusVisual(row.status, orphan);
  // 사진이 있는 분석만 썸네일 시도(자체 시험지 합성/고아 DRAFT 는 사진 자체가 없음).
  const thumbPath = row.thumbnailPath ?? null;
  return (
    // 바깥 열: 카드 높이만큼 늘어나며 상태 색을 깐다(A4 박스가 카드보다 짧을 때
    // 남는 아래 여백이 상태 색으로 자연스럽게 이어지도록).
    <div
      className={cn(
        "relative flex w-[24%] min-w-[74px] max-w-[96px] shrink-0 items-start justify-center self-stretch overflow-hidden border-r border-slate-100 md:w-[164px] md:min-w-[118px] md:max-w-[164px]",
        bg,
      )}
    >
      {/* A4(210:297) 비율 박스 — 시험지가 대개 A4 라 썸네일/상태를 같은 규격에
          맞춘다. 폭이 정해지면 높이가 비율로 따라오므로 반응형에서도 유지된다.
          카드 min-h 는 이 박스가 잘리지 않도록 맞춰 둔다(열 최대폭×297/210). */}
      <div className="relative aspect-[210/297] w-full">
        {/* 베이스: 상태 패널 — 썸네일이 없거나 실패하면 이게 그대로 보인다 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
          <Icon
            className={cn("h-7 w-7 md:h-9 md:w-9", tint)}
            aria-hidden="true"
          />
          <span
            className={cn(
              "text-center text-[10px] font-semibold md:text-[11px]",
              tint,
            )}
          >
            {label}
          </span>
        </div>

        {/* 업로드 사진 썸네일(지연 로드) — 성공 시 위 패널을 덮는다 */}
        {thumbPath && (
          <AnalysisSourceThumbnail
            analysisId={row.id}
            path={thumbPath}
            alt={`${row.title} 시험지 사진`}
          />
        )}

        {/* 썸네일이 덮은 경우에도 상태는 하단 칩으로 유지 */}
        {thumbPath && (
          <span
            className={cn(
              "absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm",
              tint,
            )}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </span>
        )}
      </div>
    </div>
  );
}
