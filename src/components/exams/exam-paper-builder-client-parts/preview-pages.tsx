"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { A4PaperPage } from "../paper-builder/components/a4-paper-page";
import { ExamCoverPage } from "../paper-builder/components/exam-cover-page";
import { ExamAnswerKeyPage } from "../paper-builder/components/exam-answer-key-page";
import type { AnswerKeyLayout } from "../paper-builder/answer-key-layout";
import type {
  ClassOption,
  Density,
  DropPlacement,
  HeaderPatch,
  PaperCover,
  PaperItem,
  PaperPage,
  PaperSize,
  PaperTemplate,
  PassageStyle,
  SchoolOption,
} from "../paper-builder/types";

// ---------------------------------------------------------------------------
// 미리보기 스크롤러 안에 들어가는 페이지 묶음 (zoom 컨테이너 포함).
// ---------------------------------------------------------------------------

interface PreviewPagesProps {
  paperItems: PaperItem[];
  paperPages: PaperPage[];
  overflowItemIds: Set<string>;
  previewBaseWidth: number;
  previewZoom: number;
  previewContentHeight: number;
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
  cover: PaperCover;
  updateCover: (patch: Partial<PaperCover>) => void;
  activeItemId: string | null;
  setActiveItemId: (id: string | null) => void;
  // 워드프로세서식 빈 줄 캐럿 — 문제 사이 간격 클릭 위치(afterLocalId = 캐럿 위 항목, null=맨 앞).
  lineCaret: { afterLocalId: string | null } | null;
  setLineCaret: (caret: { afterLocalId: string | null } | null) => void;
  updateHeader: (patch: HeaderPatch) => void;
  updateItem: (localId: string, patch: Partial<PaperItem>) => void;
  updateGroupPassage: (
    groupId: string | null,
    patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">,
  ) => void;
  moveItemToDropTarget: (
    sourceLocalId: string,
    targetLocalId: string,
    placement: DropPlacement,
  ) => void;
  removeItem: (localId: string) => void;
  ungroupItem: (localId: string) => void;
  regroupByPassage: () => void;
  tryToggleKeepWithPrev: (localId: string) => void;
  draggingItemId: string | null;
  setDraggingItemId: (id: string | null) => void;
  dragOverItemId: string | null;
  setDragOverItemId: (id: string | null) => void;
  dragOverPartKey: string | null;
  setDragOverPartKey: (key: string | null) => void;
  dragPlacement: DropPlacement;
  setDragPlacement: (p: DropPlacement) => void;
  schools: SchoolOption[];
  classes: ClassOption[];
  schoolId: string;
  classId: string;
  examDate: string;
  // 공유 QR 자기등록(E4) — enrollEnabled 시 첫 페이지 헤더에 인쇄할 QR data URI.
  examEnrollQrDataUrl?: string | null;
  readOnly?: boolean;
  // 한 페이지의 (zoom 적용 전) 픽셀 높이 — 가상화 프레임의 placeholder 높이로 쓴다.
  singlePageHeight: number;
  // 시험지 맨 뒤 정답표 페이지(들). pages 가 비어 있으면 렌더하지 않는다.
  answerKey: AnswerKeyLayout;
  // 해설 포함 PDF 인쇄 직전 모든 페이지를 강제 마운트(미스크롤 페이지 빈 인쇄 방지).
  forceMountAll?: boolean;
}

// ─── 페이지 지연 마운트 (미리보기 가상화) ───
// 수백~1000+ 페이지를 한꺼번에 마운트하면 빌더가 멈추므로, 화면 근처 페이지만
// 실제 A4PaperPage 를 마운트한다. 프레임은 마운트 전에도 실제 페이지 높이를 차지해
// 스크롤 위치·data-exam-page-index 가 흔들리지 않는다(페이지 단위 스크롤은 그대로 동작).
// 한 번 마운트된 페이지는 다시 언마운트하지 않는다 — 편집 중 상태(인라인 에디터/드래그)를
// 잃지 않기 위함. 즉 초기 렌더와 대량 삽입이 가벼워지고, 스크롤하며 점진적으로 채워진다.
function LazyPaperPage({
  pageIndex,
  height,
  eager,
  forceMount,
  children,
}: {
  pageIndex: number;
  height: number;
  eager: boolean;
  // 인쇄(특히 해설 포함 PDF) 직전에 모든 페이지를 즉시 마운트해, 아직 스크롤하지 않은
  // 페이지가 빈 채로 인쇄되지 않게 한다.
  forceMount: boolean;
  children: () => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(eager);

  useEffect(() => {
    if (forceMount) setMounted(true);
  }, [forceMount]);

  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      // 위/아래로 한 화면 남짓 미리 마운트해 스크롤 중 빈 페이지가 노출되지 않게 한다.
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  return (
    <div
      ref={ref}
      className="exam-preview-page-frame w-full"
      data-exam-page-index={pageIndex}
      style={{ minHeight: height }}
    >
      {mounted ? children() : null}
    </div>
  );
}

export function PreviewPages(props: PreviewPagesProps) {
  const {
    paperItems,
    paperPages,
    overflowItemIds,
    previewBaseWidth,
    previewZoom,
    previewContentHeight,
    schools,
    classes,
    schoolId,
    classId,
    cover,
    updateCover,
  } = props;
  void paperItems;

  const schoolName = schools.find((school) => school.id === schoolId)?.name || "";
  const resolvedClassName = classes.find((cls) => cls.id === classId)?.name || "";

  return (
    <div
      className="exam-preview-zoom-spacer mx-auto"
      style={{
        width: previewBaseWidth * previewZoom,
        height: previewContentHeight * previewZoom,
      }}
    >
      <div
        className="exam-preview-zoom-content flex flex-col items-center gap-5"
        style={{
          width: previewBaseWidth,
          transform: `scale(${previewZoom})`,
          transformOrigin: "top left",
        }}
      >
        {cover.enabled && (
          <div className="exam-preview-page-frame w-full" data-exam-cover-frame="true">
            <ExamCoverPage
              paperSize={props.paperSize}
              cover={cover}
              title={props.title}
              subtitle={props.subtitle}
              academyLogoDataUrl={props.academyLogoDataUrl}
              schoolName={schoolName}
              className={resolvedClassName}
              examDate={props.examDate}
              onHeaderChange={props.updateHeader}
              onCoverChange={updateCover}
              readOnly={props.readOnly}
            />
          </div>
        )}
        {paperPages.map((pageColumns, pageIndex) => (
          <LazyPaperPage
            key={pageIndex}
            pageIndex={pageIndex}
            height={props.singlePageHeight}
            eager={pageIndex < 2}
            forceMount={props.forceMountAll ?? false}
          >
            {() => (
            <A4PaperPage
              pageIndex={pageIndex}
              pageCount={paperPages.length}
              paperSize={props.paperSize}
              title={props.title}
              subtitle={props.subtitle}
              instructions={props.instructions}
              studentNameLabel={props.studentNameLabel}
              academyLogoDataUrl={props.academyLogoDataUrl}
              examEnrollQrDataUrl={props.examEnrollQrDataUrl}
              template={props.template}
              columns={props.columns}
              density={props.density}
              passageStyle={props.passageStyle}
              showAnswerSpace={props.showAnswerSpace}
              showPassageTitle={props.showPassageTitle}
              showQuestionMeta={props.showQuestionMeta}
              pageColumns={pageColumns}
              activeItemId={props.activeItemId}
              setActiveItemId={props.setActiveItemId}
              lineCaret={props.lineCaret}
              setLineCaret={props.setLineCaret}
              onHeaderChange={props.updateHeader}
              onUpdateItem={props.updateItem}
              onUpdateGroupPassage={props.updateGroupPassage}
              onMoveItemToDropTarget={props.moveItemToDropTarget}
              onRemoveItem={props.removeItem}
              onUngroupItem={props.ungroupItem}
              onRegroupByPassage={props.regroupByPassage}
              onToggleKeepWithPrev={props.tryToggleKeepWithPrev}
              overflowItemIds={overflowItemIds}
              draggingItemId={props.draggingItemId}
              setDraggingItemId={props.setDraggingItemId}
              dragOverItemId={props.dragOverItemId}
              setDragOverItemId={props.setDragOverItemId}
              dragOverPartKey={props.dragOverPartKey}
              setDragOverPartKey={props.setDragOverPartKey}
              dragPlacement={props.dragPlacement}
              setDragPlacement={props.setDragPlacement}
              schoolName={schoolName}
              className={resolvedClassName}
              examDate={props.examDate}
              readOnly={props.readOnly}
            />
            )}
          </LazyPaperPage>
        ))}
        {props.answerKey.pages.map((entries, answerPageIndex) => (
          <div
            key={`answer-${answerPageIndex}`}
            className="exam-preview-page-frame w-full"
            data-exam-answer-key-frame="true"
          >
            <ExamAnswerKeyPage
              paperSize={props.paperSize}
              template={props.template}
              density={props.density}
              title={props.title}
              entries={entries}
              rowsPerPage={props.answerKey.rowsPerPage}
              mode={props.answerKey.mode}
              pageOrdinal={answerPageIndex + 1}
              pageTotal={props.answerKey.pages.length}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
