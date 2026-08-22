"use client";

import { PanelLeftClose } from "lucide-react";
import type { Density, PaperCover, PaperPage, PaperSize, PaperTemplate, PassageStyle } from "../paper-builder/types";
import { PAPER_SIZE_SPECS, PREVIEW_PAGE_WIDTH } from "../paper-builder/constants";
import { A4PaperPage } from "../paper-builder/components/a4-paper-page";
import { ExamCoverPage } from "../paper-builder/components/exam-cover-page";
import { cn } from "@/lib/utils";

/**
 * 패널 폭 → 썸네일 조판 치수. 렌더와 드래그 고속 경로(빌더의 썸네일 폭 핸들이
 * 드래그 중 [data-thumb-rail]/[data-thumb-frame]/[data-thumb-scale] 에 직접
 * 기록)가 같은 식을 공유한다 — 값이 어긋나면 커밋 시 썸네일이 튄다.
 */
export function thumbMetrics(width: number, paperSize: PaperSize) {
  // 썸네일 폭은 패널 폭에 맞춰 비례 조절(좌우 여백·스크롤바 분량 차감).
  const thumbnailWidth = Math.max(28, width - 40);
  const paperSpec = PAPER_SIZE_SPECS[paperSize];
  const previewPageWidth = Math.round(
    PREVIEW_PAGE_WIDTH * paperSpec.widthRatio,
  );
  const thumbnailScale = thumbnailWidth / previewPageWidth;
  return {
    thumbnailWidth,
    thumbnailHeight: thumbnailWidth * paperSpec.heightRatio,
    previewPageWidth,
    thumbnailScale,
  };
}

export function PageThumbnails({
  paperPages,
  overflowItemIds,
  activePageIndex,
  cover,
  title,
  paperSize,
  subtitle,
  instructions,
  studentNameLabel,
  academyLogoDataUrl,
  template,
  columns,
  density,
  passageStyle,
  showAnswerSpace,
  showPassageTitle,
  showQuestionMeta,
  schoolName,
  className,
  examDate,
  width,
  onClose,
  onSelectPage,
  onSelectCover,
}: {
  paperPages: PaperPage[];
  overflowItemIds: Set<string>;
  activePageIndex: number;
  cover: PaperCover;
  title: string;
  paperSize: PaperSize;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
  template: PaperTemplate;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  schoolName: string;
  className: string;
  examDate: string;
  width: number;
  onClose: () => void;
  onSelectPage: (pageIndex: number) => void;
  onSelectCover: () => void;
}) {
  const pageCount = paperPages.length;
  if (pageCount <= 0) return null;
  const { thumbnailWidth, thumbnailHeight, previewPageWidth, thumbnailScale } =
    thumbMetrics(width, paperSize);

  return (
    <div
      data-thumb-rail
      style={{ width }}
      className="no-print hidden shrink-0 flex-col border-r border-slate-200 bg-white/80 lg:flex"
    >
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-slate-200 px-2 py-1.5">
        <span className="truncate text-[10px] font-black uppercase tracking-wider text-slate-400">
          페이지
        </span>
        <button
          type="button"
          onClick={onClose}
          title="페이지 목록 닫기"
          aria-label="페이지 목록 닫기"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-3">
        {cover.enabled && (
          <button
            type="button"
            onClick={onSelectCover}
            className="group flex w-full flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:border-blue-200 hover:bg-slate-50"
            title="표지로 이동"
          >
            <span
              data-thumb-frame
              className="relative block overflow-hidden"
              style={{
                width: thumbnailWidth,
                height: thumbnailHeight,
              }}
            >
              <span
                data-thumb-scale
                className="pointer-events-none absolute left-0 top-0 block"
                style={{
                  width: previewPageWidth,
                  transform: `scale(${thumbnailScale})`,
                  transformOrigin: "top left",
                }}
              >
                <ExamCoverPage
                  paperSize={paperSize}
                  cover={cover}
                  title={title}
                  subtitle={subtitle}
                  academyLogoDataUrl={academyLogoDataUrl}
                  schoolName={schoolName}
                  className={className}
                  examDate={examDate}
                  onHeaderChange={() => undefined}
                  onCoverChange={() => undefined}
                  readOnly
                />
              </span>
            </span>
            <span className="text-[10px] font-black">표지</span>
          </button>
        )}
        {paperPages.map((pageColumns, pageIndex) => (
          <button
            key={pageIndex}
            type="button"
            onClick={() => onSelectPage(pageIndex)}
            className={cn(
              "group flex w-full flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors",
              activePageIndex === pageIndex
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:bg-slate-50",
            )}
            title={`${pageIndex + 1}쪽으로 이동`}
          >
            <span
              data-thumb-frame
              className="relative block overflow-hidden"
              style={{
                width: thumbnailWidth,
                height: thumbnailHeight,
              }}
            >
              <span
                data-thumb-scale
                className="pointer-events-none absolute left-0 top-0 block"
                style={{
                  width: previewPageWidth,
                  transform: `scale(${thumbnailScale})`,
                  transformOrigin: "top left",
                }}
              >
                <A4PaperPage
                  pageIndex={pageIndex}
                  pageCount={pageCount}
                  paperSize={paperSize}
                  title={title}
                  subtitle={subtitle}
                  instructions={instructions}
                  studentNameLabel={studentNameLabel}
                  academyLogoDataUrl={academyLogoDataUrl}
                  template={template}
                  columns={columns}
                  density={density}
                  passageStyle={passageStyle}
                  showAnswerSpace={showAnswerSpace}
                  showPassageTitle={showPassageTitle}
                  showQuestionMeta={showQuestionMeta}
                  pageColumns={pageColumns}
                  activeItemId={null}
                  setActiveItemId={() => undefined}
                  lineCaret={null}
                  setLineCaret={() => undefined}
                  onHeaderChange={() => undefined}
                  onUpdateItem={() => undefined}
                  onUpdateGroupPassage={() => undefined}
                  onMoveItemToDropTarget={() => undefined}
                  onRemoveItem={() => undefined}
                  onUngroupItem={() => undefined}
                  onRegroupByPassage={() => undefined}
                  onToggleKeepWithPrev={() => undefined}
                  overflowItemIds={overflowItemIds}
                  draggingItemId={null}
                  setDraggingItemId={() => undefined}
                  dragOverItemId={null}
                  setDragOverItemId={() => undefined}
                  dragOverPartKey={null}
                  setDragOverPartKey={() => undefined}
                  dragPlacement="before"
                  setDragPlacement={() => undefined}
                  schoolName={schoolName}
                  className={className}
                  examDate={examDate}
                  readOnly
                />
              </span>
            </span>
            <span className="text-[10px] font-black">{pageIndex + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
