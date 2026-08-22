import { memo, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { PreviewZoomControls } from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { ReportPages, type ReportEdit } from "./report-pages";
import type { FlowItem } from "./report-sections";

/**
 * 학습지 편집기 캔버스(스크롤러 + 줌 컨트롤 + ReportPages).
 *
 * E21(§3.10.21 E21-3 「전역 오염 차단」) 배선: 이 파일은 **additive 2 prop**
 * (`printRootId` · `printExclude`)만 추가한다. 둘 다 미전달이면 기존과 완전히
 * 동일하게 동작한다(printRootId 기본값 = 현행 하드코딩 id, printExclude 미전달 =
 * ReportPages 가 지금처럼 `par-print-exclude` 클래스를 붙이지 않음).
 * 합성 로직·폭 사다리·표면 헤더는 전부 상위(AnalysisReportEditor / 조판 표면)
 * 소관이고 캔버스는 값을 통과시키기만 한다.
 *
 * ─── 문서 트리 방화벽 1차 ───
 *
 * `ReportPages` 는 이 편집기의 렌더 트리 전체(측정 클론 + 전 페이지 + 모든 shell)라
 * 상위 상태(줌·줌컨트롤 위치·스크롤 등)가 바뀔 때마다 통째로 다시 훑였다. props
 * (report / edit / onPagesChange / flowItems + E21 의 printExclude)가 전부 안정 참조·
 * 원시값이므로 memo 경계 하나로 그 재실행을 막는다. `edit` 은 AnalysisReportEditor
 * 에서 activeId·드래그 상태가 바뀔 때만 새 객체가 되도록 고정돼 있다(startDrag ref 래핑).
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
  /**
   * 스크롤러 DOM id. 기본값은 현행 하드코딩값 `"exam-paper-print-root"` 라
   * **미전달 시 동작이 바이트 동일**하다.
   *
   * 왜 주입구가 필요한가(§3.10.21 E21-3 표 1행 — 실측):
   * 같은 id 가 시험지 빌더 `src/components/exams/exam-paper-builder-client.tsx:2897`
   * 에도 하드코딩돼 있는데, 스튜디오는 조판 표면을 **숨김 마운트로 상시 보존**한다
   * (`src/app/(director)/director/studio/studio-home-client.tsx:1689-1700` —
   *  `examStudioOpen` 이면 `composeVisible` 여부와 무관하게 마운트하고 `hidden` 만
   *  토글). 그래서 학습지 조판이 우측에 뜨면 **한 DOM 에 같은 id 가 2개 공존**한다.
   * 이때 `src/components/exams/paper-builder/components/a4-paper-page-parts/use-paper-item-drag.ts:52,65`
   * 의 `document.getElementById("exam-paper-print-root")` 는 **첫 매칭만** 잡으므로
   * 블록 드래그 오토스크롤이 남의 캔버스를 스크롤한다.
   * (같은 계열의 중복 id 사고는 `studio-home-client.tsx:1686-1688` 주석이 인쇄
   *  포털 쪽 선례로 이미 명문화해 뒀다 — "getElementById 로 첫 노드만 잡아 서로의
   *  노드를 옮긴다".)
   * → 학습지 조판 임베드는 `"sheet-compose-print-root"` 같은 고유값을 내려 준다.
   */
  printRootId?: string;
  /**
   * `ReportPages` 로 그대로 패스스루 → 켜면 이 루트에 `.par-print-exclude` 가 붙어
   * 인쇄에서 제외된다. **현재 이 통로 자체가 없어 편집기 루트는 항상 인쇄 대상**이다.
   *
   * 왜 필요한가: `report-styles.ts` 의 인쇄 규칙 3종 —
   *   `:1854` `body *{visibility:hidden!important}` + 형제 가지치기 `:has()` 체인
   *   (`:1861-1877`) + `:1878-1885` `.par-root:not(.par-cover-preview):not(.par-print-exclude)
   *   {position:absolute!important;left:0;top:0}` —
   * 은 **인쇄 대상 루트가 정확히 1개**임을 전제한다. 여러 루트가 공존하면 같은 좌표에
   * 겹치거나 빈 페이지를 만든다. 이 이력은 `report-pages/pages.tsx:23-28` 의 동명 prop
   * 주석에 실측으로 남아 있다 — "2026-08-11 실측: 목록 미리보기 21루트로 재현"(백지).
   * → 조판 표면은 활성 캔버스 1개만 `printExclude={false}`, 숨김 보존된 나머지는 true.
   */
  printExclude?: boolean;
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
  // 기본값을 여기서 못 박아 미전달 경로(지문 스튜디오·학습지 생성 모달)를 현행 그대로 둔다.
  printRootId = "exam-paper-print-root",
  printExclude,
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
          id={printRootId}
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
                printExclude={printExclude}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
