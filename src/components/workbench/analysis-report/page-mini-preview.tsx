import { memo } from "react";

import { cn } from "@/lib/utils";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { ReportThumbnailSheet } from "./report-pages";
import type { FlowItem } from "./report-sections";

const PAGE_THUMB_WIDTH_PX = 76;

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
    <span
      className={cn(
        "relative inline-block overflow-hidden rounded-[3px] border bg-white shadow-sm",
        selected ? "border-blue-300" : "border-slate-200",
      )}
    >
      <ReportThumbnailSheet
        report={report}
        ids={ids}
        itemsById={itemsById}
        bodyNumber={bodyNumber}
        bodyTotal={bodyTotal}
        width={PAGE_THUMB_WIDTH_PX}
      />
      <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[8px] font-black text-slate-500 shadow-sm">
        {isCover ? "C" : bodyNumber}
      </span>
    </span>
  );
});
