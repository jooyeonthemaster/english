import { memo, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { ReportThumbnailSheet } from "./report-pages";
import type { FlowItem } from "./report-sections";

/** 썸네일 실폭(px). ReportThumbnailSheet 이 이 폭으로 A4(794px)를 scale 축소한다. */
export const PAGE_THUMB_WIDTH_PX = 76;
/**
 * 썸네일 실높이(px). ReportThumbnailSheet 의 `width * (297 / 210)` 과 **반올림 없이 동일**해야
 * 한다 — Math.round 를 끼우면 장당 0.43px 씩 어긋나 자리표시자↔실렌더 전환 때 레일 스크롤이
 * 튀고(20장 누적 ≈ 8.6px), 드래그 재정렬의 드롭 슬롯 판정(rect.top + height/2)도 밀린다.
 */
export const PAGE_THUMB_HEIGHT_PX = PAGE_THUMB_WIDTH_PX * (297 / 210);

/**
 * 실렌더본과 자리표시자가 **같은 바깥 박스**를 갖도록 둘이 공유하는 껍데기.
 * 테두리/라운드/그림자/배지가 여기 한 곳에서만 정의되므로 두 경로의 박스 크기가
 * 구조적으로 어긋날 수 없다(가상화의 핵심 불변식).
 */
function ThumbShell({
  selected,
  badge,
  children,
}: {
  selected: boolean;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "relative inline-block overflow-hidden rounded-[3px] border bg-white shadow-sm",
        selected ? "border-blue-300" : "border-slate-200",
      )}
    >
      {children}
      <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[8px] font-black text-slate-500 shadow-sm">
        {badge}
      </span>
    </span>
  );
}

export const PageMiniPreview = memo(function PageMiniPreview({
  ids,
  report,
  itemsById,
  isCover,
  bodyNumber,
  bodyTotal,
  selected,
}: {
  ids: string[];
  report: AnalysisReport;
  itemsById: Map<string, FlowItem>;
  isCover: boolean;
  bodyNumber: number;
  bodyTotal: number;
  selected: boolean;
}) {
  return (
    <ThumbShell selected={selected} badge={isCover ? "C" : bodyNumber}>
      <ReportThumbnailSheet
        report={report}
        ids={ids}
        itemsById={itemsById}
        bodyNumber={bodyNumber}
        bodyTotal={bodyTotal}
        width={PAGE_THUMB_WIDTH_PX}
      />
    </ThumbShell>
  );
});

/**
 * 뷰포트 밖 썸네일 자리표시자 — ReportThumbnailSheet 의 바깥 박스
 * (`width × width*(297/210)`, overflow:hidden, position:relative)와 픽셀 단위로 동일한
 * 빈 상자만 그린다. A4 1장분 조판(텍스트 셰이핑·표 조판·줄바꿈)이 통째로 생략된다.
 */
export const PageMiniPlaceholder = memo(function PageMiniPlaceholder({
  isCover,
  bodyNumber,
  selected,
}: {
  isCover: boolean;
  bodyNumber: number;
  selected: boolean;
}) {
  return (
    <ThumbShell selected={selected} badge={isCover ? "C" : bodyNumber}>
      <div
        aria-hidden
        style={{
          width: PAGE_THUMB_WIDTH_PX,
          height: PAGE_THUMB_HEIGHT_PX,
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(180deg,#f8fafc,#f1f5f9)",
        }}
      />
    </ThumbShell>
  );
});
