"use client";

import { A4PaperPage } from "../paper-builder/components/a4-paper-page";
import type {
  ClassOption,
  Density,
  DropPlacement,
  HeaderPatch,
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
  activeItemId: string | null;
  setActiveItemId: (id: string | null) => void;
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
  readOnly?: boolean;
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
  } = props;
  void paperItems;

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
        {paperPages.map((pageColumns, pageIndex) => (
          <div
            key={pageIndex}
            className="exam-preview-page-frame w-full"
            data-exam-page-index={pageIndex}
          >
            <A4PaperPage
              pageIndex={pageIndex}
              pageCount={paperPages.length}
              paperSize={props.paperSize}
              title={props.title}
              subtitle={props.subtitle}
              instructions={props.instructions}
              studentNameLabel={props.studentNameLabel}
              academyLogoDataUrl={props.academyLogoDataUrl}
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
              schoolName={schools.find((school) => school.id === schoolId)?.name || ""}
              className={classes.find((cls) => cls.id === classId)?.name || ""}
              examDate={props.examDate}
              readOnly={props.readOnly}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
