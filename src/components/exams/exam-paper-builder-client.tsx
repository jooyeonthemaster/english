"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronRight, GripVertical, PanelLeftClose } from "lucide-react";
import { toast } from "sonner";
import type {
  BuilderQuestion,
  ClassOption,
  Density,
  HeaderPatch,
  PaginationSettings,
  PaperPage,
  PaperSize,
  PaperTemplate,
  PassageStyle,
  QuestionCollection,
  SchoolOption,
} from "./paper-builder/types";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_SHOW_PASSAGE_TITLE,
  PAPER_SIZE_SPECS,
  PREVIEW_PAGE_WIDTH,
  SUBTYPE_LABELS,
} from "./paper-builder/constants";
import {
  buildGroups,
  formatDateInput,
  parseTags,
} from "./paper-builder/paper-item-utils";
import { resolveDropIndicatorPartKey } from "./paper-builder/drop-indicator-dom";
import { paginateGroups } from "./paper-builder/pagination";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { A4PaperPage } from "./paper-builder/components/a4-paper-page";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { BuilderPropertiesPanel } from "./paper-builder/components/builder-properties-panel";
import { QuestionDetailModal } from "./paper-builder/components/question-detail-modal";
import { QuestionLibraryPanel } from "./paper-builder/components/question-library-panel";
import { TemplateSettingsPanel } from "./paper-builder/components/template-settings-panel";
import { PreviewPages } from "./exam-paper-builder-client-parts/preview-pages";
import { PreviewToolbar } from "./exam-paper-builder-client-parts/preview-toolbar";
import { PreviewZoomControls } from "./exam-paper-builder-client-parts/preview-zoom-controls";
import { saveExamPaperDraftFromBuilder } from "./exam-paper-builder-client-parts/save-draft";
import { usePaperItems } from "./exam-paper-builder-client-parts/use-paper-items";
import { usePreviewZoom } from "./exam-paper-builder-client-parts/use-preview-zoom";
import { ExamPaperGenerationIcon } from "@/components/icons/workflow-icons";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { cn } from "@/lib/utils";

interface ExamPaperBuilderClientProps {
  academyId: string;
  questions: BuilderQuestion[];
  collections: QuestionCollection[];
  classes: ClassOption[];
  schools: SchoolOption[];
}

const PREVIEW_PAGE_GAP = 20;
// v2: bumped so the wider default left panel applies for everyone (old saved
// widths from v1 are discarded).
const PANEL_WIDTH_STORAGE_KEY = "smoat.examPaperBuilder.panelWidths.v2";
const RIGHT_PANEL_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.rightPanelCollapsed.v1";
const LEFT_PANEL_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.leftPanelCollapsed.v1";
// 패널 여닫기/폭 조절 겸용 세로 핸들의 컬럼 폭(버튼 w-4 + 좌우 mx-1).
const PANEL_TOGGLE_HANDLE_WIDTH = 24;
// 핸들 클릭(여닫기)과 드래그(폭 조절)를 구분하는 이동 임계값(px).
const PANEL_DRAG_THRESHOLD = 4;
const PANEL_MIN_CENTER = 420;
const PANEL_DEFAULT_WIDTHS = { left: 560, right: 320 };
const PANEL_LIMITS = {
  left: { min: 280, max: 880 },
  right: { min: 260, max: 440 },
};
// 미리보기 페이지 썸네일(세로 목록) 패널.
const THUMBNAILS_WIDTH_STORAGE_KEY =
  "smoat.examPaperBuilder.thumbnailsWidth.v1";
const THUMBNAILS_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.thumbnailsCollapsed.v1";
const THUMBNAILS_WIDTH_DEFAULT = 96;
const THUMBNAILS_WIDTH_MIN = 64;
const THUMBNAILS_WIDTH_MAX = 240;

type PanelWidths = typeof PANEL_DEFAULT_WIDTHS;
type PanelResizeSide = "left" | "right";
type QuestionDropInsertion = {
  targetLocalId: string | null;
  targetPartKey: string | null;
  placement: "before" | "after";
};

function clampNumber(value: number, min: number, max: number) {
  const normalizedMax = Math.max(min, max);
  return Math.min(Math.max(value, min), normalizedMax);
}

function sanitizeStoredPanelWidths(input: unknown): PanelWidths | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<Record<keyof PanelWidths, unknown>>;
  if (
    typeof candidate.left !== "number" ||
    typeof candidate.right !== "number"
  ) {
    return null;
  }
  return {
    left: candidate.left,
    right: candidate.right,
  };
}

function readStoredPanelWidths(): PanelWidths {
  if (typeof window === "undefined") return PANEL_DEFAULT_WIDTHS;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY) || "",
    );
    return sanitizeStoredPanelWidths(parsed) ?? PANEL_DEFAULT_WIDTHS;
  } catch {
    return PANEL_DEFAULT_WIDTHS;
  }
}

function readStoredRightPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(RIGHT_PANEL_COLLAPSED_STORAGE_KEY) === "true"
  );
}

function readStoredLeftPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(LEFT_PANEL_COLLAPSED_STORAGE_KEY) === "true"
  );
}

function clampThumbnailsWidth(width: number): number {
  return Math.min(
    THUMBNAILS_WIDTH_MAX,
    Math.max(THUMBNAILS_WIDTH_MIN, Math.round(width)),
  );
}

function readStoredThumbnailsWidth(): number {
  if (typeof window === "undefined") return THUMBNAILS_WIDTH_DEFAULT;
  const stored = Number(
    window.localStorage.getItem(THUMBNAILS_WIDTH_STORAGE_KEY),
  );
  if (!Number.isFinite(stored) || stored <= 0) return THUMBNAILS_WIDTH_DEFAULT;
  return clampThumbnailsWidth(stored);
}

function readStoredThumbnailsCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(THUMBNAILS_COLLAPSED_STORAGE_KEY) === "true"
  );
}

function clampPanelWidths(
  widths: PanelWidths,
  containerWidth: number,
): PanelWidths {
  const availableWidth = Math.max(
    0,
    containerWidth - PANEL_TOGGLE_HANDLE_WIDTH * 2,
  );
  const maxSideWidth = Math.max(0, availableWidth - PANEL_MIN_CENTER);

  let left = clampNumber(
    widths.left,
    PANEL_LIMITS.left.min,
    Math.min(PANEL_LIMITS.left.max, maxSideWidth - PANEL_LIMITS.right.min),
  );
  let right = clampNumber(
    widths.right,
    PANEL_LIMITS.right.min,
    Math.min(PANEL_LIMITS.right.max, maxSideWidth - left),
  );

  const centerWidth = availableWidth - left - right;
  if (centerWidth < PANEL_MIN_CENTER) {
    const overflow = PANEL_MIN_CENTER - centerWidth;
    if (right > PANEL_LIMITS.right.min) {
      right = Math.max(PANEL_LIMITS.right.min, right - overflow);
    } else {
      left = Math.max(PANEL_LIMITS.left.min, left - overflow);
    }
  }

  return {
    left: Math.round(left),
    right: Math.round(right),
  };
}

function samePanelWidths(a: PanelWidths, b: PanelWidths) {
  return a.left === b.left && a.right === b.right;
}

function getQuestionDropInsertion(
  scroller: HTMLElement,
  clientX: number,
  clientY: number,
): QuestionDropInsertion {
  const itemElements = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-paper-item-id]"),
  ).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (itemElements.length === 0) {
    return { targetLocalId: null, targetPartKey: null, placement: "after" };
  }

  let best: {
    element: HTMLElement;
    rect: DOMRect;
    score: number;
  } | null = null;

  for (const element of itemElements) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const horizontalDistance =
      clientX < rect.left
        ? rect.left - clientX
        : clientX > rect.right
          ? clientX - rect.right
          : Math.abs(clientX - centerX) * 0.2;
    const verticalDistance =
      clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : Math.abs(clientY - centerY) * 0.2;
    const score = verticalDistance + horizontalDistance * 1.4;

    if (!best || score < best.score) {
      best = { element, rect, score };
    }
  }

  if (!best) {
    return { targetLocalId: null, targetPartKey: null, placement: "after" };
  }

  const targetLocalId = best.element.dataset.paperItemId || null;
  const placement =
    clientY < best.rect.top + best.rect.height / 2 ? "before" : "after";
  const targetPartKey = resolveDropIndicatorPartKey(
    scroller,
    targetLocalId,
    placement,
  );
  return { targetLocalId, targetPartKey, placement };
}

function PageThumbnails({
  paperPages,
  overflowItemIds,
  activePageIndex,
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
}: {
  paperPages: PaperPage[];
  overflowItemIds: Set<string>;
  activePageIndex: number;
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
}) {
  const pageCount = paperPages.length;
  if (pageCount <= 0) return null;
  // 썸네일 폭은 패널 폭에 맞춰 비례 조절(좌우 여백·스크롤바 분량 차감).
  const thumbnailWidth = Math.max(28, width - 40);
  const paperSpec = PAPER_SIZE_SPECS[paperSize];
  const previewPageWidth = Math.round(
    PREVIEW_PAGE_WIDTH * paperSpec.widthRatio,
  );
  const thumbnailScale = thumbnailWidth / previewPageWidth;

  return (
    <div
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
              className="relative block overflow-hidden"
              style={{
                width: thumbnailWidth,
                height: thumbnailWidth * paperSpec.heightRatio,
              }}
            >
              <span
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

export function ExamPaperBuilderClient({
  academyId,
  questions,
  collections,
  classes,
  schools,
}: ExamPaperBuilderClientProps) {
  const [isPending, startTransition] = useTransition();
  const builderGridRef = useRef<HTMLDivElement>(null);
  // 핸들을 드래그(폭 조절)한 직후 발생하는 click이 패널을 토글하지 않도록 막는 플래그.
  const suppressHandleClickRef = useRef(false);

  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [difficulty, setDifficulty] = useState("ALL");
  const [selectedSubTypes, setSelectedSubTypes] = useState<string[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [detailQuestion, setDetailQuestion] = useState<BuilderQuestion | null>(
    null,
  );
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const {
    scrollerRef: previewScrollerRef,
    zoom: previewZoom,
    baseWidth: previewBaseWidth,
    controlsPos: previewZoomControlsPos,
    zoomIn: zoomPreviewIn,
    zoomOut: zoomPreviewOut,
    reset: resetPreviewZoom,
    handleControlsDragStart: handlePreviewZoomControlsDragStart,
  } = usePreviewZoom(paperSize);

  const [title, setTitle] = useState(
    `새 시험지 ${formatDateInput(new Date())}`,
  );
  const [subtitle, setSubtitle] = useState("영어 내신 대비");
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [studentNameLabel, setStudentNameLabel] = useState("이름");
  const [academyLogoDataUrl, setAcademyLogoDataUrl] = useState<string | null>(
    null,
  );
  const [examDate] = useState("");
  const [classId] = useState("");
  const [schoolId] = useState("");
  const [grade] = useState("");
  const [semester] = useState("");
  const [examType] = useState("MIDTERM");

  const [template, setTemplate] = useState<PaperTemplate>("clean");
  const [columns, setColumns] = useState<1 | 2>(2);
  const [density, setDensity] = useState<Density>("comfortable");
  // 켜면 자동 흐름 대신 한 칸당 문항 1개씩(2단=페이지당 2문제) 강제 배치.
  const [forceTwoPerPage, setForceTwoPerPage] = useState(false);
  const [passageStyle, setPassageStyle] = useState<PassageStyle>("boxed");
  const showAnswerSpace = true;
  const [showPassageTitle, setShowPassageTitle] = useState(DEFAULT_SHOW_PASSAGE_TITLE);
  const [showQuestionMeta, setShowQuestionMeta] = useState(false);
  const {
    paperItems,
    activeItemId,
    activeItem,
    setActiveItemId,
    totalPoints,
    canUndo,
    canRedo,
    undo,
    redo,
    addQuestionAtDropTarget,
    toggleQuestion,
    selectAllFiltered,
    clearPaper,
    updateItem,
    insertBlock,
    insertImageBlock,
    duplicateItem,
    toggleLockItem,
    tryToggleKeepWithPrev,
    updateGroupPassage,
    removeItem,
    moveItemToDropTarget,
    ungroupItem,
    regroupByPassage,
    shuffleQuestions,
  } = usePaperItems(markDirty);
  const [questionDropActive, setQuestionDropActive] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPartKey, setDragOverPartKey] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after">(
    "before",
  );
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [panelWidths, setPanelWidths] = useState<PanelWidths>(
    readStoredPanelWidths,
  );
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(
    readStoredRightPanelCollapsed,
  );
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(
    readStoredLeftPanelCollapsed,
  );
  const [thumbnailsWidth, setThumbnailsWidth] = useState(
    readStoredThumbnailsWidth,
  );
  const [thumbnailsCollapsed, setThumbnailsCollapsed] = useState(
    readStoredThumbnailsCollapsed,
  );

  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );

  const selectedQuestionIds = useMemo(
    () =>
      new Set(
        paperItems
          .filter((item) => item.blockType === "question")
          .map((item) => item.questionId),
      ),
    [paperItems],
  );
  const questionItemsCount = selectedQuestionIds.size;

  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter((question) => {
      if (
        selectedCollectionId &&
        !question.collectionItems.some(
          (item) => item.collectionId === selectedCollectionId,
        )
      ) {
        return false;
      }
      if (difficulty !== "ALL" && question.difficulty !== difficulty)
        return false;
      if (
        selectedSubTypes.length > 0 &&
        !selectedSubTypes.includes(question.subType || "")
      ) {
        return false;
      }
      if (approvedOnly && !question.approved) return false;
      if (starredOnly && !question.starred) return false;
      if (query) {
        const tags = parseTags(question.tags).join(" ");
        const haystack = [
          question.questionText,
          question.correctAnswer,
          question.passage?.title || "",
          question.passage?.content || "",
          tags,
          SUBTYPE_LABELS[question.subType || ""] || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    questions,
    search,
    selectedCollectionId,
    difficulty,
    selectedSubTypes,
    approvedOnly,
    starredOnly,
  ]);

  const paperGroups = useMemo(() => buildGroups(paperItems), [paperItems]);
  const paginationSettings = useMemo<PaginationSettings>(
    () => ({
      paperSize,
      columns,
      density,
      passageStyle,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      template,
      forceTwoPerPage,
    }),
    [
      paperSize,
      columns,
      density,
      passageStyle,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      template,
      forceTwoPerPage,
    ],
  );
  const paginationResult = useMemo(
    () => paginateGroups(paperGroups, paginationSettings),
    [paperGroups, paginationSettings],
  );
  const paperPages = paginationResult.pages;
  const overflowItemIds = paginationResult.overflowItems;
  const previewContentHeight =
    paperPages.length > 0
      ? paperPages.length *
          previewBaseWidth *
          PAPER_SIZE_SPECS[paperSize].heightRatio +
        (paperPages.length - 1) * PREVIEW_PAGE_GAP
      : 0;
  // 토글 핸들은 접힘 여부와 무관하게 항상 표시한다.
  const leftColumnWidth = leftPanelCollapsed ? 0 : panelWidths.left;
  const rightColumnWidth = rightPanelCollapsed ? 0 : panelWidths.right;
  const builderGridColumns = `${leftColumnWidth}px ${PANEL_TOGGLE_HANDLE_WIDTH}px minmax(${PANEL_MIN_CENTER}px,1fr) ${PANEL_TOGGLE_HANDLE_WIDTH}px ${rightColumnWidth}px`;

  useEffect(() => {
    const element = previewScrollerRef.current;
    if (!element) return;

    return dropTargetForElements({
      element,
      canDrop: ({ source }) => source.data.type === "question",
      onDragEnter: ({ location }) => {
        setQuestionDropActive(true);
        const input = location.current.input;
        const insertion = getQuestionDropInsertion(
          element,
          input.clientX,
          input.clientY,
        );
        setDragOverItemId(insertion.targetLocalId);
        setDragOverPartKey(insertion.targetPartKey);
        setDragPlacement(insertion.placement);
      },
      onDrag: ({ location }) => {
        const input = location.current.input;
        const insertion = getQuestionDropInsertion(
          element,
          input.clientX,
          input.clientY,
        );
        setDragOverItemId(insertion.targetLocalId);
        setDragOverPartKey(insertion.targetPartKey);
        setDragPlacement(insertion.placement);
      },
      onDragLeave: () => {
        setQuestionDropActive(false);
        setDragOverItemId(null);
        setDragOverPartKey(null);
      },
      onDrop: ({ source, location }) => {
        setQuestionDropActive(false);
        setDragOverItemId(null);
        setDragOverPartKey(null);
        const questionId = source.data.questionId;
        if (typeof questionId !== "string") return;

        const question = questionById.get(questionId);
        if (!question) {
          toast.error("문제를 찾지 못했습니다.");
          return;
        }
        const input = location.current.input;
        const insertion = getQuestionDropInsertion(
          element,
          input.clientX,
          input.clientY,
        );
        addQuestionAtDropTarget(
          question,
          insertion.targetLocalId,
          insertion.placement,
        );
      },
    });
  }, [addQuestionAtDropTarget, previewScrollerRef, questionById]);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      const pageFrames = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-exam-page-index]"),
      );
      if (pageFrames.length === 0) return;

      const scrollerTop = scroller.getBoundingClientRect().top;
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      pageFrames.forEach((frame) => {
        const pageIndex = Number(frame.dataset.examPageIndex || 0);
        const distance = Math.abs(
          frame.getBoundingClientRect().top - scrollerTop - 20,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = pageIndex;
        }
      });
      setActivePageIndex(bestIndex);
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [paperPages.length, previewScrollerRef]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PANEL_WIDTH_STORAGE_KEY,
        JSON.stringify(panelWidths),
      );
    } catch {
      // Ignore storage failures; resizing still works for the current session.
    }
  }, [panelWidths]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        RIGHT_PANEL_COLLAPSED_STORAGE_KEY,
        String(rightPanelCollapsed),
      );
    } catch {
      // Ignore storage failures; the drawer still works for the current session.
    }
  }, [rightPanelCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LEFT_PANEL_COLLAPSED_STORAGE_KEY,
        String(leftPanelCollapsed),
      );
    } catch {
      // Ignore storage failures; the drawer still works for the current session.
    }
  }, [leftPanelCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        THUMBNAILS_WIDTH_STORAGE_KEY,
        String(thumbnailsWidth),
      );
    } catch {
      // Thumbnail width is a convenience preference.
    }
  }, [thumbnailsWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        THUMBNAILS_COLLAPSED_STORAGE_KEY,
        String(thumbnailsCollapsed),
      );
    } catch {
      // Ignore storage failures; the list still works for the current session.
    }
  }, [thumbnailsCollapsed]);

  useEffect(() => {
    const element = builderGridRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? element.clientWidth;
      setPanelWidths((current) => {
        const next = clampPanelWidths(current, width);
        return samePanelWidths(current, next) ? current : next;
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 핸들 클릭: 패널 여닫기 토글. 직전에 드래그(폭 조절)한 경우엔 토글하지 않는다.
  function togglePanelCollapsed(side: PanelResizeSide) {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    if (side === "left") {
      setLeftPanelCollapsed((collapsed) => !collapsed);
    } else {
      setRightPanelCollapsed((collapsed) => !collapsed);
    }
  }

  // 핸들 드래그: 임계값을 넘겨 움직이면 폭을 조절한다(열려 있을 때만 사용).
  function handlePanelResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    side: PanelResizeSide,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    // 새 상호작용을 시작하므로 직전 드래그의 잔여 플래그를 초기화한다.
    suppressHandleClickRef.current = false;

    const container = builderGridRef.current;
    const startX = event.clientX;
    const startWidths = panelWidths;
    const containerWidth = container?.getBoundingClientRect().width ?? 0;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let didDrag = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (!didDrag) {
        if (Math.abs(deltaX) < PANEL_DRAG_THRESHOLD) return;
        didDrag = true;
        // 드래그가 시작됐으니 이어지는 click의 토글을 막는다.
        suppressHandleClickRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }
      moveEvent.preventDefault();
      const nextWidths =
        side === "left"
          ? { ...startWidths, left: startWidths.left + deltaX }
          : { ...startWidths, right: startWidths.right - deltaX };
      setPanelWidths(clampPanelWidths(nextWidths, containerWidth));
    };

    const finish = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (didDrag) {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      }
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  // 페이지 썸네일 드래그바: 좌우로 끌어 패널(썸네일) 폭을 조절한다.
  function handleThumbnailsResizePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = thumbnailsWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      setThumbnailsWidth(clampThumbnailsWidth(startWidth + moveEvent.clientX - startX));
    };

    const finish = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  function markDirty() {
    setDirty(true);
  }

  function updateHeader(patch: HeaderPatch) {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.subtitle !== undefined) setSubtitle(patch.subtitle);
    if (patch.instructions !== undefined) setInstructions(patch.instructions);
    if (patch.studentNameLabel !== undefined)
      setStudentNameLabel(patch.studentNameLabel);
    if (patch.academyLogoDataUrl !== undefined)
      setAcademyLogoDataUrl(patch.academyLogoDataUrl);
    markDirty();
  }

  function handleLogoUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 로고로 넣을 수 있습니다.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("로고 이미지는 1.5MB 이하로 올려주세요.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        toast.error("로고 이미지를 읽지 못했습니다.");
        return;
      }
      setAcademyLogoDataUrl(result);
      markDirty();
    };
    reader.onerror = () => toast.error("로고 이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  }

  async function saveDraft(): Promise<string | null> {
    const result = await saveExamPaperDraftFromBuilder({
      academyId,
      savedExamId,
      title,
      classId,
      schoolId,
      grade,
      semester,
      examType,
      examDate,
      totalPoints,
      template,
      paperSize,
      columns,
      density,
      showAnswerSpace,
      showPassageTitle,
      showQuestionMeta,
      passageStyle,
      subtitle,
      studentNameLabel,
      instructions,
      academyLogoDataUrl,
      paperItems,
      classes,
      schools,
    });

    if (!result.success) return null;

    setSavedExamId(result.id);
    setDirty(false);
    return result.id;
  }

  function handleSave() {
    startTransition(async () => {
      await saveDraft();
    });
  }

  function handlePrint() {
    if (paperItems.length === 0) {
      toast.error("인쇄할 문제를 먼저 선택해주세요.");
      return;
    }
    window.setTimeout(() => window.print(), 50);
  }

  usePrintPortal(paperSize);

  function triggerDocxDownload(examId: string, withAnswers: boolean) {
    const link = document.createElement("a");
    link.href = withAnswers
      ? `/api/exams/${examId}/export-docx?answers=true&t=${Date.now()}`
      : `/api/exams/${examId}/export-docx?t=${Date.now()}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadDocx() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerDocxDownload(examId, false);
    });
  }

  function handleDownloadDocxWithAnswers() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerDocxDownload(examId, true);
    });
  }

  function triggerHwpxDownload(examId: string, withAnswers: boolean) {
    const link = document.createElement("a");
    link.href = withAnswers
      ? `/api/exams/${examId}/export-hwpx?answers=true&t=${Date.now()}`
      : `/api/exams/${examId}/export-hwpx?t=${Date.now()}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleDownloadHwpx() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerHwpxDownload(examId, false);
    });
  }

  function handleDownloadHwpxWithAnswers() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerHwpxDownload(examId, true);
    });
  }

  function handleSelectPage(pageIndex: number) {
    const scroller = previewScrollerRef.current;
    const target = scroller?.querySelector<HTMLElement>(
      `[data-exam-page-index="${pageIndex}"]`,
    );
    if (!scroller || !target) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    scroller.scrollTo({
      top: scroller.scrollTop + targetRect.top - scrollerRect.top - 20,
      behavior: "smooth",
    });
    setActivePageIndex(pageIndex);
  }

  const templateSettingsPanel = (
    <TemplateSettingsPanel
      template={template}
      setTemplate={setTemplate}
      academyLogoDataUrl={academyLogoDataUrl}
      setAcademyLogoDataUrl={setAcademyLogoDataUrl}
      onLogoUpload={handleLogoUpload}
      paperSize={paperSize}
      setPaperSize={setPaperSize}
      columns={columns}
      setColumns={setColumns}
      density={density}
      setDensity={setDensity}
      passageStyle={passageStyle}
      setPassageStyle={setPassageStyle}
      showPassageTitle={showPassageTitle}
      setShowPassageTitle={setShowPassageTitle}
      showQuestionMeta={showQuestionMeta}
      setShowQuestionMeta={setShowQuestionMeta}
      markDirty={markDirty}
      variant="sidebar"
    />
  );

  return (
    <div
      id="exam-builder-shell"
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F4F6F9] md:-m-6"
    >
      <div className="no-print shrink-0 border-b border-slate-200/80 bg-white px-5 py-3">
        <WorkflowPageTitle
          icon={ExamPaperGenerationIcon}
          title="시험지 생성"
          description="문제 은행에서 문제를 고르고 용지 미리보기에서 편집해 시험지를 저장합니다."
        />
      </div>
      <div
        ref={builderGridRef}
        className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white lg:[grid-template-columns:var(--exam-builder-grid-columns)]"
        style={
          {
            "--exam-builder-grid-columns": builderGridColumns,
          } as CSSProperties
        }
      >
        {leftPanelCollapsed ? (
          // 접혀도 그리드 1번 컬럼 자리를 채워 나머지 컬럼이 밀리지 않게 한다.
          <div aria-hidden className="min-w-0 overflow-hidden" />
        ) : (
          <QuestionLibraryPanel
            paperItemsCount={questionItemsCount}
            filteredQuestions={filteredQuestions}
            selectedQuestionIds={selectedQuestionIds}
            collections={collections}
            search={search}
            setSearch={setSearch}
            showFilters={showFilters}
            setShowFilters={setShowFilters}
            selectedSubTypes={selectedSubTypes}
            setSelectedSubTypes={setSelectedSubTypes}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            approvedOnly={approvedOnly}
            setApprovedOnly={setApprovedOnly}
            starredOnly={starredOnly}
            setStarredOnly={setStarredOnly}
            selectedCollectionId={selectedCollectionId}
            setSelectedCollectionId={setSelectedCollectionId}
            onToggleQuestion={toggleQuestion}
            onSelectAllFiltered={() => selectAllFiltered(filteredQuestions)}
            onRegroupByPassage={regroupByPassage}
            onClearPaper={clearPaper}
            onShowDetail={setDetailQuestion}
          />
        )}

        {leftPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setLeftPanelCollapsed(false)}
            title="문제관리 패널 열기"
            aria-label="문제관리 패널 열기"
            aria-expanded={false}
            className="no-print mx-1 hidden h-full min-h-0 w-4 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
          >
            <span>{">"}</span>
            <span style={{ writingMode: "vertical-rl" }}>문제관리</span>
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={(event) => handlePanelResizePointerDown(event, "left")}
            onClick={() => togglePanelCollapsed("left")}
            title="드래그하여 폭 조절 · 클릭하여 닫기"
            aria-label="문제관리 패널 닫기"
            aria-expanded
            className="group/lhandle no-print mx-1 hidden h-full min-h-0 w-4 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
          >
            <span>{"<"}</span>
            <span style={{ writingMode: "vertical-rl" }}>문제관리</span>
            <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/lhandle:opacity-70" />
          </button>
        )}

        <section className="flex min-w-0 flex-col overflow-hidden bg-slate-100/70">
          <PreviewToolbar
            template={template}
            paperSize={paperSize}
            dirty={dirty}
            isPending={isPending}
            paperItemsCount={questionItemsCount}
            forceTwoPerPage={forceTwoPerPage}
            onToggleTwoPerPage={() => setForceTwoPerPage((value) => !value)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onPrint={handlePrint}
            onDownloadDocx={handleDownloadDocx}
            onDownloadDocxWithAnswers={handleDownloadDocxWithAnswers}
            onDownloadHwpx={handleDownloadHwpx}
            onDownloadHwpxWithAnswers={handleDownloadHwpxWithAnswers}
            onSave={handleSave}
          />

          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100/70">
            {paperPages.length > 0 && (
              <PreviewZoomControls
                zoom={previewZoom}
                position={previewZoomControlsPos}
                onZoomIn={zoomPreviewIn}
                onZoomOut={zoomPreviewOut}
                onReset={resetPreviewZoom}
                onDragStart={handlePreviewZoomControlsDragStart}
              />
            )}
            {questionDropActive && (
              <div className="no-print pointer-events-none absolute inset-4 z-10 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/5 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]">
                <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-blue-200 bg-white/95 px-3 py-1 text-[11px] font-black text-blue-700 shadow-sm">
                  문제 추가
                </div>
              </div>
            )}
            {(draggingItemId || questionDropActive) && (
              <div className="no-print pointer-events-none absolute inset-0 z-[9]">
                <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-blue-300/70" />
                <div className="absolute left-0 top-1/2 w-full border-t border-dashed border-blue-300/70" />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-blue-200 bg-white/95 px-3 py-1 text-[10px] font-black text-blue-700 shadow-sm">
                  snap guide
                </div>
              </div>
            )}
            <div className="flex h-full min-h-0">
              {paperPages.length > 0 &&
                (thumbnailsCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setThumbnailsCollapsed(false)}
                    title="페이지 목록 열기"
                    aria-label="페이지 목록 열기"
                    aria-expanded={false}
                    className="no-print hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-r border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 lg:flex"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span style={{ writingMode: "vertical-rl" }}>페이지</span>
                  </button>
                ) : (
                  <>
                    <PageThumbnails
                      paperPages={paperPages}
                      overflowItemIds={overflowItemIds}
                      activePageIndex={activePageIndex}
                      title={title}
                      subtitle={subtitle}
                      instructions={instructions}
                      studentNameLabel={studentNameLabel}
                      academyLogoDataUrl={academyLogoDataUrl}
                      paperSize={paperSize}
                      template={template}
                      columns={columns}
                      density={density}
                      passageStyle={passageStyle}
                      showAnswerSpace={showAnswerSpace}
                      showPassageTitle={showPassageTitle}
                      showQuestionMeta={showQuestionMeta}
                      schoolName={
                        schools.find((school) => school.id === schoolId)?.name || ""
                      }
                      className={
                        classes.find((cls) => cls.id === classId)?.name || ""
                      }
                      examDate={examDate}
                      width={thumbnailsWidth}
                      onClose={() => setThumbnailsCollapsed(true)}
                      onSelectPage={handleSelectPage}
                    />
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="페이지 목록 폭 조절"
                      title="드래그하여 페이지 목록 폭 조절"
                      onPointerDown={handleThumbnailsResizePointerDown}
                      className="no-print hidden h-full min-h-0 w-2 shrink-0 cursor-col-resize touch-none items-center justify-center border-r border-slate-200 bg-slate-50 text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-500 active:bg-blue-100 lg:flex"
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                  </>
                ))}
              <div
                id="exam-paper-print-root"
                ref={previewScrollerRef}
                onPointerDownCapture={(event) => {
                  const target = event.target as HTMLElement;
                  if (!target.closest("[data-paper-item-id]")) {
                    setActiveItemId(null);
                  }
                }}
                className={cn(
                  "min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-5 transition-colors",
                  questionDropActive && "bg-blue-50/40",
                )}
              >
                <PreviewPages
                  paperItems={paperItems}
                  paperPages={paperPages}
                  overflowItemIds={overflowItemIds}
                  previewBaseWidth={previewBaseWidth}
                  previewZoom={previewZoom}
                  previewContentHeight={previewContentHeight}
                  title={title}
                  paperSize={paperSize}
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
                  activeItemId={activeItemId}
                  setActiveItemId={setActiveItemId}
                  updateHeader={updateHeader}
                  updateItem={updateItem}
                  updateGroupPassage={updateGroupPassage}
                  moveItemToDropTarget={moveItemToDropTarget}
                  removeItem={removeItem}
                  ungroupItem={ungroupItem}
                  regroupByPassage={regroupByPassage}
                  tryToggleKeepWithPrev={tryToggleKeepWithPrev}
                  draggingItemId={draggingItemId}
                  setDraggingItemId={setDraggingItemId}
                  dragOverItemId={dragOverItemId}
                  setDragOverItemId={setDragOverItemId}
                  dragOverPartKey={dragOverPartKey}
                  setDragOverPartKey={setDragOverPartKey}
                  dragPlacement={dragPlacement}
                  setDragPlacement={setDragPlacement}
                  schools={schools}
                  classes={classes}
                  schoolId={schoolId}
                  classId={classId}
                  examDate={examDate}
                />
              </div>
            </div>
          </div>
        </section>

        {rightPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setRightPanelCollapsed(false)}
            title="편집 패널 열기"
            aria-label="편집 패널 열기"
            aria-expanded={false}
            className="no-print mx-1 hidden h-full min-h-0 w-4 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
          >
            <span>{"<"}</span>
            <span style={{ writingMode: "vertical-rl" }}>편집 패널</span>
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={(event) => handlePanelResizePointerDown(event, "right")}
            onClick={() => togglePanelCollapsed("right")}
            title="드래그하여 폭 조절 · 클릭하여 닫기"
            aria-label="편집 패널 닫기"
            aria-expanded
            className="group/ehandle no-print mx-1 hidden h-full min-h-0 w-4 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
          >
            <span>{">"}</span>
            <span style={{ writingMode: "vertical-rl" }}>편집 패널</span>
            <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/ehandle:opacity-70" />
          </button>
        )}

        {!rightPanelCollapsed && (
          <BuilderPropertiesPanel
            activeItem={activeItem}
            paperItemsCount={paperItems.length}
            totalPoints={totalPoints}
            templateControls={templateSettingsPanel}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onInsertBlock={insertBlock}
            onUploadImageBlock={insertImageBlock}
            onDuplicateItem={duplicateItem}
            onToggleLockItem={toggleLockItem}
            onUpdateItem={updateItem}
            onToggleKeepWithPrev={tryToggleKeepWithPrev}
            onUngroupItem={ungroupItem}
            onRegroupByPassage={regroupByPassage}
            onShuffleQuestions={shuffleQuestions}
            onRemoveItem={removeItem}
          />
        )}
      </div>

      {detailQuestion && (
        <QuestionDetailModal
          question={detailQuestion}
          onClose={() => setDetailQuestion(null)}
        />
      )}

      <PrintStyles paperSize={paperSize} />
    </div>
  );
}
