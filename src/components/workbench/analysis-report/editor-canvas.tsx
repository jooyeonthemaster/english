import { memo, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { PreviewZoomControls } from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { ReportPages, type ReportEdit } from "./report-pages";
import type { FlowItem } from "./report-sections";

/**
 * 문서 트리 방화벽 1차.
 *
 * `ReportPages` 는 이 편집기의 렌더 트리 전체(측정 클론 + 전 페이지 + 모든 shell)라
 * 상위 상태(줌·줌컨트롤 위치·스크롤 등)가 바뀔 때마다 통째로 다시 훑였다. props 4개
 * (report / edit / onPagesChange / flowItems)가 전부 안정 참조이므로 memo 경계 하나로
 * 그 재실행을 막는다. `edit` 은 AnalysisReportEditor 에서 activeId·드래그 상태가
 * 바뀔 때만 새 객체가 되도록 고정돼 있다(startDrag ref 래핑).
 */
const MemoReportPages = memo(ReportPages);

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
  /**
   * 상위에서 이미 한 번 계산한 자연 순서 FlowItem[](visibleFlowItems 적용 전).
   * 그대로 ReportPages 로 통과시킨다 — 편집기가 descriptors·썸네일과 함께 쓰는
   * 단일 계산본을 공유해, 한 번의 report 변경에 문서 JSX 를 여러 벌 만들지 않는다.
   */
  flowItems: FlowItem[];
};

export const EditorCanvas = memo(function EditorCanvas({
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
  flowItems,
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
          className="par-root-edit-scroller par-scroll h-full min-h-0 overflow-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable]"
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
              <MemoReportPages
                report={report}
                edit={edit}
                onPagesChange={onPagesChange}
                flowItems={flowItems}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
