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
import { GripVertical } from "lucide-react";
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
const PANEL_WIDTH_STORAGE_KEY = "smoat.examPaperBuilder.panelWidths.v1";
const RIGHT_PANEL_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.rightPanelCollapsed.v1";
const PANEL_HANDLE_WIDTH = 8;
const RIGHT_PANEL_COLLAPSED_WIDTH = 48;
const PANEL_MIN_CENTER = 420;
const PANEL_DEFAULT_WIDTHS = { left: 400, right: 320 };
const PANEL_LIMITS = {
  left: { min: 280, max: 560 },
  right: { min: 260, max: 440 },
};

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
  if (typeof candidate.left !== "number" || typeof candidate.right !== "number") {
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
  return window.localStorage.getItem(RIGHT_PANEL_COLLAPSED_STORAGE_KEY) === "true";
}

function clampPanelWidths(widths: PanelWidths, containerWidth: number): PanelWidths {
  const availableWidth = Math.max(
    0,
    containerWidth - PANEL_HANDLE_WIDTH * 2,
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

  let best:
    | {
        element: HTMLElement;
        rect: DOMRect;
        score: number;
      }
    | null = null;

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
  const placement = clientY < best.rect.top + best.rect.height / 2 ? "before" : "after";
  const targetPartKey = resolveDropIndicatorPartKey(
    scroller,
    targetLocalId,
    placement,
  );
  return { targetLocalId, targetPartKey, placement };
}

function PanelResizeHandle({
  side,
  disabled = false,
  onPointerDown,
}: {
  side: PanelResizeSide;
  disabled?: boolean;
  onPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    side: PanelResizeSide,
  ) => void;
}) {
  const label = side === "left" ? "문제은행 패널 폭 조절" : "편집 패널 폭 조절";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={disabled ? -1 : 0}
      aria-hidden={disabled}
      disabled={disabled}
      onPointerDown={(event) => onPointerDown(event, side)}
      className={cn(
        "no-print hidden h-full min-h-0 cursor-col-resize touch-none items-center justify-center border-x border-slate-200 bg-slate-50 text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-500 active:bg-blue-100 lg:flex",
        disabled
          ? "w-0 cursor-default overflow-hidden border-0 p-0 opacity-0"
          : "w-2",
      )}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
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
  onSelectPage: (pageIndex: number) => void;
}) {
  const pageCount = paperPages.length;
  if (pageCount <= 0) return null;
  const thumbnailWidth = 56;
  const paperSpec = PAPER_SIZE_SPECS[paperSize];
  const previewPageWidth = Math.round(PREVIEW_PAGE_WIDTH * paperSpec.widthRatio);
  const thumbnailScale = thumbnailWidth / previewPageWidth;

  return (
    <div className="no-print hidden w-[96px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white/80 px-2 py-3 lg:block">
      <div className="space-y-2">
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

  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [difficulty, setDifficulty] = useState("ALL");
  const [selectedSubTypes, setSelectedSubTypes] = useState<string[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [detailQuestion, setDetailQuestion] = useState<BuilderQuestion | null>(null);
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

  const [title, setTitle] = useState(`새 시험지 ${formatDateInput(new Date())}`);
  const [subtitle, setSubtitle] = useState("영어 내신 대비");
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [studentNameLabel, setStudentNameLabel] = useState("이름");
  const [academyLogoDataUrl, setAcademyLogoDataUrl] = useState<string | null>(null);
  const [examDate] = useState("");
  const [classId] = useState("");
  const [schoolId] = useState("");
  const [grade] = useState("");
  const [semester] = useState("");
  const [examType] = useState("MIDTERM");

  const [template, setTemplate] = useState<PaperTemplate>("clean");
  const [columns, setColumns] = useState<1 | 2>(2);
  const [density, setDensity] = useState<Density>("comfortable");
  const [passageStyle, setPassageStyle] = useState<PassageStyle>("boxed");
  const showAnswerSpace = true;
  const [showPassageTitle, setShowPassageTitle] = useState(true);
  const [showQuestionMeta, setShowQuestionMeta] = useState(true);
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
  } = usePaperItems(markDirty);
  const [questionDropActive, setQuestionDropActive] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPartKey, setDragOverPartKey] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after">("before");
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [panelWidths, setPanelWidths] = useState<PanelWidths>(readStoredPanelWidths);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(
    readStoredRightPanelCollapsed,
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
      if (selectedCollectionId && !question.collectionItems.some((item) => item.collectionId === selectedCollectionId)) {
        return false;
      }
      if (difficulty !== "ALL" && question.difficulty !== difficulty) return false;
      if (selectedSubTypes.length > 0 && !selectedSubTypes.includes(question.subType || "")) {
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
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [questions, search, selectedCollectionId, difficulty, selectedSubTypes, approvedOnly, starredOnly]);

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
    }),
    [paperSize, columns, density, passageStyle, showAnswerSpace, showPassageTitle, showQuestionMeta, template],
  );
  const paginationResult = useMemo(
    () => paginateGroups(paperGroups, paginationSettings),
    [paperGroups, paginationSettings],
  );
  const paperPages = paginationResult.pages;
  const overflowItemIds = paginationResult.overflowItems;
  const previewContentHeight =
    paperPages.length > 0
      ? paperPages.length * previewBaseWidth * PAPER_SIZE_SPECS[paperSize].heightRatio +
        (paperPages.length - 1) * PREVIEW_PAGE_GAP
      : 0;
  const rightHandleWidth = rightPanelCollapsed ? 0 : PANEL_HANDLE_WIDTH;
  const rightColumnWidth = rightPanelCollapsed
    ? RIGHT_PANEL_COLLAPSED_WIDTH
    : panelWidths.right;
  const builderGridColumns = `${panelWidths.left}px ${PANEL_HANDLE_WIDTH}px minmax(${PANEL_MIN_CENTER}px,1fr) ${rightHandleWidth}px ${rightColumnWidth}px`;

  useEffect(() => {
    const element = previewScrollerRef.current;
    if (!element) return;

    return dropTargetForElements({
      element,
      canDrop: ({ source }) => source.data.type === "question",
      onDragEnter: ({ location }) => {
        setQuestionDropActive(true);
        const input = location.current.input;
        const insertion = getQuestionDropInsertion(element, input.clientX, input.clientY);
        setDragOverItemId(insertion.targetLocalId);
        setDragOverPartKey(insertion.targetPartKey);
        setDragPlacement(insertion.placement);
      },
      onDrag: ({ location }) => {
        const input = location.current.input;
        const insertion = getQuestionDropInsertion(element, input.clientX, input.clientY);
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
        const insertion = getQuestionDropInsertion(element, input.clientX, input.clientY);
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
        const distance = Math.abs(frame.getBoundingClientRect().top - scrollerTop - 20);
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

  function handlePanelResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>,
    side: PanelResizeSide,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const container = builderGridRef.current;
    if (!container) return;

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidths = panelWidths;
    const containerWidth = container.getBoundingClientRect().width;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const nextWidths =
        side === "left"
          ? { ...startWidths, left: startWidths.left + deltaX }
          : { ...startWidths, right: startWidths.right - deltaX };

      setPanelWidths(clampPanelWidths(nextWidths, containerWidth));
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });
  }

  function markDirty() {
    setDirty(true);
  }

  function updateHeader(patch: HeaderPatch) {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.subtitle !== undefined) setSubtitle(patch.subtitle);
    if (patch.instructions !== undefined) setInstructions(patch.instructions);
    if (patch.studentNameLabel !== undefined) setStudentNameLabel(patch.studentNameLabel);
    if (patch.academyLogoDataUrl !== undefined) setAcademyLogoDataUrl(patch.academyLogoDataUrl);
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
      ? `/api/exams/${examId}/export-docx?answers=true`
      : `/api/exams/${examId}/export-docx`;
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
      ? `/api/exams/${examId}/export-hwpx?answers=true`
      : `/api/exams/${examId}/export-hwpx`;
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
    <div id="exam-builder-shell" className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F4F6F9] md:-m-6">
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

        <PanelResizeHandle side="left" onPointerDown={handlePanelResizeStart} />

        <section className="flex min-w-0 flex-col overflow-hidden bg-slate-100/70">
          <PreviewToolbar
            template={template}
            paperSize={paperSize}
            dirty={dirty}
            isPending={isPending}
            paperItemsCount={questionItemsCount}
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
                schoolName={schools.find((school) => school.id === schoolId)?.name || ""}
                className={classes.find((cls) => cls.id === classId)?.name || ""}
                examDate={examDate}
                onSelectPage={handleSelectPage}
              />
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

        <PanelResizeHandle
          side="right"
          disabled={rightPanelCollapsed}
          onPointerDown={handlePanelResizeStart}
        />

        <BuilderPropertiesPanel
          activeItem={activeItem}
          paperItemsCount={paperItems.length}
          totalPoints={totalPoints}
          templateControls={templateSettingsPanel}
          collapsed={rightPanelCollapsed}
          canUndo={canUndo}
          canRedo={canRedo}
          onCollapsedChange={setRightPanelCollapsed}
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
          onRemoveItem={removeItem}
        />
      </div>

      {detailQuestion && (
        <QuestionDetailModal question={detailQuestion} onClose={() => setDetailQuestion(null)} />
      )}

      <PrintStyles paperSize={paperSize} />
    </div>
  );
}
