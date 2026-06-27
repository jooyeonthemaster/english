import type { MouseEvent as ReactMouseEvent, RefObject } from "react";

import { PreviewZoomControls } from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { ReportPages, type ReportEdit } from "./report-pages";

type Props = {
  pageList: string[][];
  zoom: number;
  zoomControlsPos: { top: number; right: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
  onZoomControlsDragStart: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  onDeselect: () => void;
  a4Width: number;
  contentHeight: number;
  report: AnalysisReport;
  edit: ReportEdit;
  onPagesChange: (pages: string[][]) => void;
};

export function EditorCanvas({
  pageList,
  zoom,
  zoomControlsPos,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
  onZoomControlsDragStart,
  scrollerRef,
  onDeselect,
  a4Width,
  contentHeight,
  report,
  edit,
  onPagesChange,
}: Props) {
  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/70">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {pageList.length > 0 ? (
          <PreviewZoomControls
            zoom={zoom}
            position={zoomControlsPos}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onReset={onReset}
            onFit={onFit}
            onDragStart={onZoomControlsDragStart}
          />
        ) : null}
        <div
          id="exam-paper-print-root"
          ref={scrollerRef}
          className="par-scroll h-full min-h-0 overflow-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onDeselect();
          }}
        >
          <div
            className="mx-auto"
            style={{
              width: a4Width * zoom,
              height: contentHeight * zoom,
            }}
          >
            <div
              style={{
                width: a4Width,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <ReportPages report={report} edit={edit} onPagesChange={onPagesChange} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
