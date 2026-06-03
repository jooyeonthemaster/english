"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ChevronRight,
  ChevronUp,
  GripVertical,
  PanelLeftClose,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BuilderQuestion,
  ClassOption,
  Density,
  HeaderPatch,
  PaginationSettings,
  PaperCover,
  PaperPage,
  PaperSize,
  PaperTemplate,
  PassageStyle,
  QuestionCollection,
  SchoolOption,
} from "./paper-builder/types";
import { DEFAULT_PAPER_COVER } from "./paper-builder/types";
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
import {
  asDensity,
  asPaperSize,
  asPaperTemplate,
  asPassageStyle,
  buildPaperItemsFromExam,
  formatExamDate,
  parseBuilderSettings,
} from "./exam-paper-builder-existing";
import {
  DEFAULT_TEMPLATE_SETTINGS,
  normalizePaperCover,
  readSavedTemplateSettings,
} from "./paper-builder/saved-template-settings";
import {
  deleteExamPaperBuilderDraft,
  getExamPaperBuilderDraftKey,
  readExamPaperBuilderDraft,
  writeExamPaperBuilderDraft,
  type ExamPaperBuilderDraft,
  type ExamPaperBuilderDraftState,
} from "./paper-builder/indexeddb-drafts";
import { useSidebarFocus } from "@/components/layout/sidebar-focus-context";
import { resolveDropIndicatorPartKey } from "./paper-builder/drop-indicator-dom";
import { paginateGroups } from "./paper-builder/pagination";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { A4PaperPage } from "./paper-builder/components/a4-paper-page";
import { ExamCoverPage } from "./paper-builder/components/exam-cover-page";
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
import { useFolderManager } from "@/hooks/use-folder-manager";
import type { CollectionItem } from "@/components/workbench/shared/types";
import {
  createQuestionCollection,
  updateQuestionCollection,
  deleteQuestionCollection,
  addQuestionsToCollection,
  removeQuestionsFromCollection,
} from "@/actions/workbench";
import { incrementExamPrintCount } from "@/actions/exams";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ExamDetail } from "./exam-detail-client-parts/types";

interface ExamPaperBuilderClientProps {
  academyId: string;
  questions: BuilderQuestion[];
  collections: QuestionCollection[];
  classes: ClassOption[];
  schools: SchoolOption[];
  initialExam?: ExamDetail | null;
}

const PREVIEW_PAGE_GAP = 20;
// v2: bumped so the wider default left panel applies for everyone (old saved
// widths from v1 are discarded).
const PANEL_WIDTH_STORAGE_KEY = "smoat.examPaperBuilder.panelWidths.v2";
const RIGHT_PANEL_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.rightPanelCollapsed.v1";
const LEFT_PANEL_COLLAPSED_STORAGE_KEY =
  "smoat.examPaperBuilder.leftPanelCollapsed.v1";
const SETTINGS_NUDGE_HIDDEN_STORAGE_KEY =
  "smoat.examPaperBuilder.settingsNudgeHidden.v1";
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
const BUILDER_HEADER_AUTO_HIDE_DELAY_MS = 2000;
const BUILDER_HEADER_HIDE_ZONE_PX = 96;
const BUILDER_DRAFT_AUTOSAVE_DELAY_MS = 900;

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

function asAutoPointTotal(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  return Math.min(999, Math.max(1, Math.round(numeric)));
}

function hasMeaningfulBuilderDraft(state: ExamPaperBuilderDraftState): boolean {
  return state.dirty || (!state.savedExamId && state.paperItems.length > 0);
}

function formatBuilderDraftUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장 시각 알 수 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildDefaultSaveAsTitle(currentTitle: string): string {
  const baseTitle = currentTitle.trim() || `새 시험지 ${formatDateInput(new Date())}`;
  return `${baseTitle} (사본)`;
}

// 정렬 — questions 페이지의 정렬 옵션(최신순/오래된순/난이도/중요)과 동일.
const DIFFICULTY_RANK: Record<string, number> = {
  BASIC: 1,
  INTERMEDIATE: 2,
  KILLER: 3,
};

function toTimestamp(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortBuilderQuestions(
  questions: BuilderQuestion[],
  sort: string,
): BuilderQuestion[] {
  const sorted = [...questions];
  switch (sort) {
    case "oldest":
      return sorted.sort(
        (a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt),
      );
    case "difficulty_desc":
      return sorted.sort(
        (a, b) =>
          (DIFFICULTY_RANK[b.difficulty] ?? 0) -
          (DIFFICULTY_RANK[a.difficulty] ?? 0),
      );
    case "difficulty_asc":
      return sorted.sort(
        (a, b) =>
          (DIFFICULTY_RANK[a.difficulty] ?? 0) -
          (DIFFICULTY_RANK[b.difficulty] ?? 0),
      );
    case "starred":
      return sorted.sort(
        (a, b) => Number(b.starred) - Number(a.starred),
      );
    case "newest":
    default:
      return sorted.sort(
        (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt),
      );
  }
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
        {cover.enabled && (
          <button
            type="button"
            onClick={onSelectCover}
            className="group flex w-full flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:border-blue-200 hover:bg-slate-50"
            title="표지로 이동"
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

type QuickCommand = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  run: () => void;
};

type SaveDraftOptions = {
  targetExamId?: string | null;
  titleOverride?: string;
  successMessage?: string;
};

function CommandBar({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: QuickCommand[];
  onClose: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollDirRef = useRef(0);

  const stopAutoScroll = useCallback(() => {
    scrollDirRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    const step = () => {
      const el = scrollerRef.current;
      if (el && scrollDirRef.current !== 0) {
        // 한 프레임에 ~4px 씩 — 가장자리에 마우스를 두면 서서히 흐르듯 스크롤된다.
        el.scrollLeft += scrollDirRef.current * 4;
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // 스크롤 영역 위에서 마우스가 좌/우 가장자리(48px) 안에 있으면 그 방향으로
  // 자동 스크롤하고, 가운데에 있으면 멈춘다. onMouseMove 로 위치를 읽어 버튼
  // 클릭을 막는 오버레이 없이 동작한다.
  const handleEdgeHover = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const el = scrollerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const EDGE = 48;
      const x = event.clientX - rect.left;
      if (x < EDGE) scrollDirRef.current = -1;
      else if (x > rect.width - EDGE) scrollDirRef.current = 1;
      else scrollDirRef.current = 0;
      if (scrollDirRef.current !== 0) startAutoScroll();
    },
    [startAutoScroll],
  );

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  if (!open) return null;

  return (
    <div className="no-print relative shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-200/40">
      <div
        ref={scrollerRef}
        onMouseMove={handleEdgeHover}
        onMouseLeave={stopAutoScroll}
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {commands.map((command) => (
          <button
            key={command.id}
            type="button"
            disabled={command.disabled}
            title={command.description}
            onClick={() => {
              command.run();
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-black text-slate-400">
              ⌘
            </span>
            {command.label}
          </button>
        ))}
      </div>

      {/* 하단 중앙 화살표 — 다시 접어서(닫아서) 빠른 실행을 숨긴다. */}
      <button
        type="button"
        onClick={onClose}
        title="빠른 실행 닫기"
        aria-label="빠른 실행 닫기"
        className="absolute -bottom-2.5 left-1/2 z-10 flex h-5 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ExamPaperBuilderClient({
  academyId,
  questions,
  collections,
  classes,
  schools,
  initialExam = null,
}: ExamPaperBuilderClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const builderGridRef = useRef<HTMLDivElement>(null);
  const headerAutoHideReadyRef = useRef(false);
  // 핸들을 드래그(폭 조절)한 직후 발생하는 click이 패널을 토글하지 않도록 막는 플래그.
  const suppressHandleClickRef = useRef(false);
  const draftAutosaveErrorShownRef = useRef(false);
  const initialSettings = useMemo(
    () => parseBuilderSettings(initialExam?.settings ?? null),
    [initialExam?.settings],
  );
  const initialPaperItems = useMemo(
    () =>
      initialExam
        ? buildPaperItemsFromExam(initialExam, initialSettings)
        : [],
    [initialExam, initialSettings],
  );
  const initialHeader = initialSettings?.header;
  const isEditingExistingExam = Boolean(initialExam?.id);
  const savedTemplateSettings = useMemo(
    () => (isEditingExistingExam ? null : readSavedTemplateSettings()),
    [isEditingExistingExam],
  );
  const builderDraftKey = useMemo(
    () => getExamPaperBuilderDraftKey(academyId),
    [academyId],
  );

  const [savedExamId, setSavedExamId] = useState<string | null>(
    initialExam?.id ?? null,
  );
  const [pendingBuilderDraft, setPendingBuilderDraft] =
    useState<ExamPaperBuilderDraft | null>(null);
  const [draftStorageReady, setDraftStorageReady] =
    useState(isEditingExistingExam);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("ALL");
  const [selectedSubTypes, setSelectedSubTypes] = useState<string[]>([]);
  // 검수 상태 세그먼트(전체/미검수/검수완료) — questions 페이지와 동일한 3분할.
  const [approvedFilter, setApprovedFilter] = useState<
    "ALL" | "pending" | "approved"
  >("ALL");
  const [starredOnly, setStarredOnly] = useState(false);
  const [sort, setSort] = useState("newest");
  const [detailQuestion, setDetailQuestion] = useState<BuilderQuestion | null>(
    null,
  );
  const [headerVisible, setHeaderVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNudgeDismissed, setSettingsNudgeDismissed] = useState(false);
  const [settingsNudgePreferenceLoaded, setSettingsNudgePreferenceLoaded] =
    useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>(() =>
    asPaperSize(
      initialSettings?.layout?.paperSize ??
        savedTemplateSettings?.paperSize ??
        DEFAULT_TEMPLATE_SETTINGS.paperSize,
    ),
  );
  const {
    scrollerRef: previewScrollerRef,
    zoom: previewZoom,
    baseWidth: previewBaseWidth,
    controlsPos: previewZoomControlsPos,
    zoomIn: zoomPreviewIn,
    zoomOut: zoomPreviewOut,
    reset: resetPreviewZoom,
    fitToScreen: fitPreviewToScreen,
    handleControlsDragStart: handlePreviewZoomControlsDragStart,
  } = usePreviewZoom(paperSize);

  const [title, setTitle] = useState(
    initialExam?.title || `새 시험지 ${formatDateInput(new Date())}`,
  );
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsTitle, setSaveAsTitle] = useState("");
  const [subtitle, setSubtitle] = useState(
    initialHeader?.subtitle || "영어 내신 대비",
  );
  const [instructions, setInstructions] = useState(
    initialHeader?.instructions || DEFAULT_INSTRUCTIONS,
  );
  const [studentNameLabel, setStudentNameLabel] = useState(
    initialHeader?.studentNameLabel || "이름",
  );
  const [academyLogoDataUrl, setAcademyLogoDataUrl] = useState<string | null>(
    initialHeader?.academyLogoDataUrl ??
      savedTemplateSettings?.academyLogoDataUrl ??
      null,
  );
  const [examDate, setExamDate] = useState(
    formatExamDate(initialExam?.examDate ?? null),
  );
  const [classId, setClassId] = useState(initialExam?.class?.id || "");
  const [schoolId, setSchoolId] = useState(initialExam?.school?.id || "");
  const [grade, setGrade] = useState(
    initialExam?.grade == null ? "" : String(initialExam.grade),
  );
  const [semester, setSemester] = useState(initialExam?.semester || "");
  const [examType, setExamType] = useState(initialExam?.examType || "MIDTERM");

  const [template, setTemplate] = useState<PaperTemplate>(() =>
    asPaperTemplate(
      initialSettings?.template ??
        savedTemplateSettings?.template ??
        DEFAULT_TEMPLATE_SETTINGS.template,
    ),
  );
  const [columns, setColumns] = useState<1 | 2>(() => {
    const value =
      initialSettings?.layout?.columns ??
      savedTemplateSettings?.columns ??
      DEFAULT_TEMPLATE_SETTINGS.columns;
    return value === 1 ? 1 : 2;
  });
  const [density, setDensity] = useState<Density>(() =>
    asDensity(
      initialSettings?.layout?.density ??
        savedTemplateSettings?.density ??
        DEFAULT_TEMPLATE_SETTINGS.density,
    ),
  );
  // 켜면 자동 흐름 대신 한 칸당 문항 1개씩(2단=페이지당 2문제) 강제 배치.
  const [forceTwoPerPage, setForceTwoPerPage] = useState(false);
  const [passageStyle, setPassageStyle] = useState<PassageStyle>(() =>
    asPassageStyle(
      initialSettings?.layout?.passageStyle ??
        savedTemplateSettings?.passageStyle ??
        DEFAULT_TEMPLATE_SETTINGS.passageStyle,
    ),
  );
  const showAnswerSpace = true;
  const [showPassageTitle, setShowPassageTitle] = useState(
    initialSettings?.layout?.showPassageTitle ??
      savedTemplateSettings?.showPassageTitle ??
      DEFAULT_TEMPLATE_SETTINGS.showPassageTitle,
  );
  const [showQuestionMeta, setShowQuestionMeta] = useState(
    initialSettings?.layout?.showQuestionMeta ??
      savedTemplateSettings?.showQuestionMeta ??
      DEFAULT_TEMPLATE_SETTINGS.showQuestionMeta,
  );
  const [autoPointTotal, setAutoPointTotal] = useState<number | null>(() =>
    asAutoPointTotal(
      initialSettings?.scoring?.autoPointTotal ??
        savedTemplateSettings?.autoPointTotal,
    ),
  );
  // 표지(COVER): 저장된 시험지 → 직전 저장한 설정 → 기본값(끔) 순으로 초기화.
  const [cover, setCover] = useState<PaperCover>(() =>
    normalizePaperCover(
      initialSettings?.cover ??
        savedTemplateSettings?.cover ??
        DEFAULT_PAPER_COVER,
    ),
  );
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
    addQuestionsAtDropTarget,
    replacePaperItems,
    updateItem,
    distributeTotalPoints,
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
  } = usePaperItems(markDirty, initialPaperItems, autoPointTotal);
  const [questionDropActive, setQuestionDropActive] = useState(false);
  // 드래그할 때 끌고 갈 문항 개수(다중 드래그 시 미리보기 배지에 "N개 추가" 표기).
  const [questionDropCount, setQuestionDropCount] = useState(1);
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

  // 문제관리(좌) 패널과 편집(우) 패널이 동시에 열려 있으면 전역 사이드바를 접도록
  // 요청한다. 둘 중 하나라도 닫히면 요청을 풀어 사이드바가 (사용자가 수동으로 닫지
  // 않았던 한) 다시 열리게 한다. 페이지를 벗어나면 요청을 해제한다.
  const { setCollapseRequested: setSidebarCollapseRequested } = useSidebarFocus();
  const bothBuilderPanelsOpen = !leftPanelCollapsed && !rightPanelCollapsed;
  useEffect(() => {
    setSidebarCollapseRequested(bothBuilderPanelsOpen);
  }, [bothBuilderPanelsOpen, setSidebarCollapseRequested]);
  useEffect(() => {
    return () => setSidebarCollapseRequested(false);
  }, [setSidebarCollapseRequested]);

  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );

  // ─── 파일(폴더) 관리 — questions 페이지와 동일한 중첩 폴더 구조를 컴팩트하게 ───
  // 초기 컬렉션을 폴더 매니저가 기대하는 CollectionItem 형태로 변환한다.
  const initialFolderCollections = useMemo<CollectionItem[]>(
    () =>
      collections.map((collection) => ({
        id: collection.id,
        parentId: collection.parentId,
        name: collection.name,
        description: null,
        color: collection.color,
        _count: {
          items: collection._count.items,
          children: collection._count.children,
        },
      })),
    [collections],
  );
  // 로드된 문제들의 collectionItems로 폴더 멤버십을 구성한다(필터 대상과 일치).
  const initialFolderMembership = useMemo<Record<string, Set<string>>>(() => {
    const membership: Record<string, Set<string>> = {};
    for (const question of questions) {
      for (const item of question.collectionItems) {
        (membership[item.collectionId] ??= new Set()).add(question.id);
      }
    }
    return membership;
  }, [questions]);

  const folders = useFolderManager({
    initialCollections: initialFolderCollections,
    initialMembership: initialFolderMembership,
    actions: {
      createCollection: createQuestionCollection,
      updateCollection: updateQuestionCollection,
      deleteCollection: deleteQuestionCollection,
      addToCollection: addQuestionsToCollection,
      removeFromCollection: removeQuestionsFromCollection,
    },
    itemLabel: "문제",
  });

  // 드래그한 문제를 폴더에 담기/이동(빈 selection이라 단일 문제만 대상).
  const handleDragQuestionToFolder = useCallback(
    (itemId: string, folderId: string, copy: boolean) => {
      void folders.handleDragToFolder(itemId, folderId, copy, new Set<string>());
    },
    [folders],
  );
  // "전체 문제"로 드래그하면 현재 폴더에서 제거한다(복사 드롭은 무시).
  const handleDragQuestionToRoot = useCallback(
    (itemId: string, copy: boolean) => {
      if (copy || !folders.activeFolder) return;
      void folders.handleRemoveFromFolder(new Set<string>([itemId]));
    },
    [folders],
  );

  const paperQuestionCounts = useMemo(
    () => {
      const counts = new Map<string, number>();
      for (const item of paperItems) {
        if (item.blockType !== "question") continue;
        counts.set(item.questionId, (counts.get(item.questionId) || 0) + 1);
      }
      return counts;
    },
    [paperItems],
  );
  const questionItemsCount = useMemo(
    () => Array.from(paperQuestionCounts.values()).reduce((sum, count) => sum + count, 0),
    [paperQuestionCounts],
  );
  const shouldNudgeSettingsButton =
    !isEditingExistingExam &&
    settingsNudgePreferenceLoaded &&
    !settingsOpen &&
    !settingsNudgeDismissed &&
    paperItems.length === 0;

  useEffect(() => {
    try {
      setSettingsNudgeDismissed(
        window.localStorage.getItem(SETTINGS_NUDGE_HIDDEN_STORAGE_KEY) === "true",
      );
    } catch {
      // Keep the normal first-run hint when storage is unavailable.
    } finally {
      setSettingsNudgePreferenceLoaded(true);
    }
  }, []);

  const openSettingsPanel = useCallback(() => {
    setSettingsNudgeDismissed(true);
    setSettingsOpen(true);
  }, []);

  const dismissSettingsNudge = useCallback(() => {
    setSettingsNudgeDismissed(true);
  }, []);

  const hideSettingsNudgePermanently = useCallback(() => {
    setSettingsNudgeDismissed(true);
    try {
      window.localStorage.setItem(SETTINGS_NUDGE_HIDDEN_STORAGE_KEY, "true");
    } catch {
      // The hint can still be dismissed for the current session.
    }
  }, []);

  // 체크박스 다중 선택(드래그 대상) — 미리보기 포함 여부와 무관한 별도 상태.
  // 체크는 미리보기에 넣지 않고, 드래그&드롭으로만 미리보기에 추가한다.
  const [dragSelectedIds, setDragSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [duplicateSelectedIds, setDuplicateSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleDragSelected = useCallback((id: string) => {
    setDragSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setDuplicateSelectedIds((current) => {
          if (!current.has(id)) return current;
          const duplicateNext = new Set(current);
          duplicateNext.delete(id);
          return duplicateNext;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const approveDuplicateSelection = useCallback((id: string) => {
    setDuplicateSelectedIds((prev) => new Set(prev).add(id));
    setDragSelectedIds((prev) => new Set(prev).add(id));
  }, []);

  useEffect(() => {
    setDuplicateSelectedIds((current) => {
      const next = new Set(
        Array.from(current).filter(
          (id) => paperQuestionCounts.has(id) && dragSelectedIds.has(id),
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [dragSelectedIds, paperQuestionCounts]);

  const builderDraftState = useMemo<ExamPaperBuilderDraftState>(
    () => ({
      savedExamId,
      title,
      subtitle,
      instructions,
      studentNameLabel,
      academyLogoDataUrl,
      examDate,
      classId,
      schoolId,
      grade,
      semester,
      examType,
      template,
      paperSize,
      columns,
      density,
      passageStyle,
      showPassageTitle,
      showQuestionMeta,
      forceTwoPerPage,
      autoPointTotal,
      cover,
      paperItems,
      activeItemId,
      dirty,
    }),
    [
      savedExamId,
      title,
      subtitle,
      instructions,
      studentNameLabel,
      academyLogoDataUrl,
      examDate,
      classId,
      schoolId,
      grade,
      semester,
      examType,
      template,
      paperSize,
      columns,
      density,
      passageStyle,
      showPassageTitle,
      showQuestionMeta,
      forceTwoPerPage,
      autoPointTotal,
      cover,
      paperItems,
      activeItemId,
      dirty,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    if (isEditingExistingExam) {
      setDraftStorageReady(true);
      return () => {
        cancelled = true;
      };
    }

    setDraftStorageReady(false);
    void readExamPaperBuilderDraft(builderDraftKey)
      .then((draft) => {
        if (cancelled) return;
        if (draft && hasMeaningfulBuilderDraft(draft.state)) {
          setPendingBuilderDraft(draft);
          setDraftStorageReady(false);
          return;
        }

        setPendingBuilderDraft(null);
        setDraftStorageReady(true);
        if (draft) void deleteExamPaperBuilderDraft(builderDraftKey);
      })
      .catch(() => {
        if (cancelled) return;
        setDraftStorageReady(true);
        if (!draftAutosaveErrorShownRef.current) {
          draftAutosaveErrorShownRef.current = true;
          toast.error("임시저장소를 확인하지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [builderDraftKey, isEditingExistingExam]);

  const writeCurrentBuilderDraft = useCallback(
    () =>
      writeExamPaperBuilderDraft({
        key: builderDraftKey,
        academyId,
        version: 1,
        updatedAt: new Date().toISOString(),
        state: { ...builderDraftState, dirty: true },
      }),
    [academyId, builderDraftKey, builderDraftState],
  );

  useEffect(() => {
    if (isEditingExistingExam || !draftStorageReady || pendingBuilderDraft) return;
    if (!hasMeaningfulBuilderDraft(builderDraftState)) return;

    const timer = window.setTimeout(() => {
      void writeCurrentBuilderDraft().catch(() => {
        if (draftAutosaveErrorShownRef.current) return;
        draftAutosaveErrorShownRef.current = true;
        toast.error("임시저장에 실패했습니다. 브라우저 저장 공간을 확인해주세요.");
      });
    }, BUILDER_DRAFT_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    academyId,
    builderDraftKey,
    builderDraftState,
    draftStorageReady,
    isEditingExistingExam,
    pendingBuilderDraft,
    writeCurrentBuilderDraft,
  ]);

  useEffect(() => {
    if (isEditingExistingExam || !draftStorageReady || pendingBuilderDraft) return;
    if (!hasMeaningfulBuilderDraft(builderDraftState)) return;

    const flushDraft = () => {
      void writeCurrentBuilderDraft().catch(() => undefined);
    };
    const flushDraftWhenHidden = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };

    window.addEventListener("pagehide", flushDraft);
    document.addEventListener("visibilitychange", flushDraftWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushDraft);
      document.removeEventListener("visibilitychange", flushDraftWhenHidden);
    };
  }, [
    builderDraftState,
    draftStorageReady,
    isEditingExistingExam,
    pendingBuilderDraft,
    writeCurrentBuilderDraft,
  ]);

  const restorePendingBuilderDraft = useCallback(() => {
    if (!pendingBuilderDraft) return;
    const state = pendingBuilderDraft.state;

    setSavedExamId(state.savedExamId ?? null);
    setTitle(state.title || `새 시험지 ${formatDateInput(new Date())}`);
    setSubtitle(state.subtitle || "영어 내신 대비");
    setInstructions(state.instructions || DEFAULT_INSTRUCTIONS);
    setStudentNameLabel(state.studentNameLabel || "이름");
    setAcademyLogoDataUrl(
      typeof state.academyLogoDataUrl === "string"
        ? state.academyLogoDataUrl
        : null,
    );
    setExamDate(state.examDate || "");
    setClassId(state.classId || "");
    setSchoolId(state.schoolId || "");
    setGrade(state.grade || "");
    setSemester(state.semester || "");
    setExamType(state.examType || "MIDTERM");
    setTemplate(asPaperTemplate(state.template));
    setPaperSize(asPaperSize(state.paperSize));
    setColumns(state.columns === 1 ? 1 : 2);
    setDensity(asDensity(state.density));
    setPassageStyle(asPassageStyle(state.passageStyle));
    setShowPassageTitle(Boolean(state.showPassageTitle));
    setShowQuestionMeta(Boolean(state.showQuestionMeta));
    setForceTwoPerPage(Boolean(state.forceTwoPerPage));
    setAutoPointTotal(asAutoPointTotal(state.autoPointTotal));
    setCover(normalizePaperCover(state.cover));
    replacePaperItems(state.paperItems, state.activeItemId, { markAsDirty: false });
    setDragSelectedIds(new Set());
    setDuplicateSelectedIds(new Set());
    setActivePageIndex(0);
    setSettingsNudgeDismissed(true);
    setSettingsOpen(false);
    setCommandPaletteOpen(false);
    setPendingBuilderDraft(null);
    setDraftStorageReady(true);
    setDirty(true);
    toast.success("임시저장본을 불러왔습니다.");
  }, [pendingBuilderDraft, replacePaperItems]);

  const discardPendingBuilderDraft = useCallback(() => {
    setPendingBuilderDraft(null);
    setDraftStorageReady(true);
    void deleteExamPaperBuilderDraft(builderDraftKey)
      .then(() => {
        toast.success("임시저장본을 삭제했습니다.");
      })
      .catch(() => {
        toast.error("임시저장본을 삭제하지 못했습니다.");
      });
  }, [builderDraftKey]);

  // 선택(체크)한 문항을 시험지 미리보기 끝에 한 번에 삽입한다. dragSelectedIds는
  // 체크한 순서대로 id가 쌓이므로 Array.from()이 곧 삽입 순서다. 삽입 후 선택 해제.
  const addSelectedQuestionsToPaper = useCallback((duplicateQuestionIds: Set<string>) => {
    const selected = Array.from(dragSelectedIds)
      .map((id) => questionById.get(id))
      .filter((q): q is BuilderQuestion => Boolean(q));
    if (selected.length === 0) return;
    addQuestionsAtDropTarget(selected, null, "after", {
      duplicateQuestionIds,
    });
    setDragSelectedIds(new Set());
    setDuplicateSelectedIds(new Set());
  }, [dragSelectedIds, questionById, addQuestionsAtDropTarget]);

  const activeFolderMembership = folders.activeFolder
    ? folders.membership[folders.activeFolder]
    : null;

  // 검수 상태를 제외한 모든 필터(폴더·검색·유형·난이도·중요)를 적용한 집합.
  // 검수 상태 세그먼트의 개수 표기는 이 집합을 기준으로 계산한다.
  const baseFilteredQuestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter((question) => {
      if (activeFolderMembership && !activeFolderMembership.has(question.id)) {
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
    activeFolderMembership,
    difficulty,
    selectedSubTypes,
    starredOnly,
  ]);

  const statusCounts = useMemo(() => {
    let approved = 0;
    for (const question of baseFilteredQuestions) {
      if (question.approved) approved += 1;
    }
    return {
      all: baseFilteredQuestions.length,
      approved,
      pending: baseFilteredQuestions.length - approved,
    };
  }, [baseFilteredQuestions]);

  const filteredQuestions = useMemo(() => {
    const afterStatus = baseFilteredQuestions.filter((question) => {
      if (approvedFilter === "approved") return question.approved;
      if (approvedFilter === "pending") return !question.approved;
      return true;
    });
    return sortBuilderQuestions(afterStatus, sort);
  }, [baseFilteredQuestions, approvedFilter, sort]);

  useEffect(() => {
    const autoHideTimer = window.setTimeout(() => {
      headerAutoHideReadyRef.current = true;
      setHeaderVisible(false);
    }, BUILDER_HEADER_AUTO_HIDE_DELAY_MS);
    return () => {
      window.clearTimeout(autoHideTimer);
    };
  }, []);

  useEffect(() => {
    if (!headerVisible) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!headerAutoHideReadyRef.current) return;
      if (event.clientY >= BUILDER_HEADER_HIDE_ZONE_PX) {
        setHeaderVisible(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [headerVisible]);

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
  // 표지(cover.enabled)는 본문 페이지 앞에 한 장 더 렌더되므로, scale 컨테이너의
  // 높이를 예약하는 zoom-spacer 높이에 표지 한 장 + 간격을 더해야 스크롤이 잘리지 않는다.
  const singlePageHeight =
    previewBaseWidth * PAPER_SIZE_SPECS[paperSize].heightRatio;
  const renderedPageCount = paperPages.length + (cover.enabled ? 1 : 0);
  const previewContentHeight =
    renderedPageCount > 0
      ? renderedPageCount * singlePageHeight +
        (renderedPageCount - 1) * PREVIEW_PAGE_GAP
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
      onDragEnter: ({ source, location }) => {
        setQuestionDropActive(true);
        const ids = source.data.questionIds;
        setQuestionDropCount(Array.isArray(ids) && ids.length > 0 ? ids.length : 1);
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

        // 다중 드래그면 questionIds(여러 개)를, 아니면 questionId(하나)를 사용한다.
        const rawIds = source.data.questionIds;
        const rawDuplicateIds = source.data.duplicateQuestionIds;
        const draggedIds = Array.isArray(rawIds) && rawIds.length > 0
          ? rawIds.filter((id): id is string => typeof id === "string")
          : typeof source.data.questionId === "string"
            ? [source.data.questionId]
            : [];
        const draggedDuplicateIds = Array.isArray(rawDuplicateIds)
          ? rawDuplicateIds.filter((id): id is string => typeof id === "string")
          : [];
        if (draggedIds.length === 0) return;

        const dropped = draggedIds
          .map((id) => questionById.get(id))
          .filter((q): q is BuilderQuestion => Boolean(q));
        if (dropped.length === 0) {
          toast.error("문제를 찾지 못했습니다.");
          return;
        }

        const input = location.current.input;
        const insertion = getQuestionDropInsertion(
          element,
          input.clientX,
          input.clientY,
        );
        addQuestionsAtDropTarget(
          dropped,
          insertion.targetLocalId,
          insertion.placement,
          { duplicateQuestionIds: draggedDuplicateIds },
        );
        // 드롭 후 선택 해제 — 같은 문항을 다시 끌 일이 없도록 초기화.
        setDragSelectedIds(new Set());
        setDuplicateSelectedIds(new Set());
      },
    });
  }, [addQuestionsAtDropTarget, previewScrollerRef, questionById]);

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

  function updateCover(patch: Partial<PaperCover>) {
    setCover((current) => ({ ...current, ...patch }));
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

  function updateAutoPointTotal(nextTotal: number | null): boolean {
    if (nextTotal === null) {
      setAutoPointTotal(null);
      markDirty();
      return true;
    }

    const normalizedTotal = asAutoPointTotal(nextTotal);
    if (normalizedTotal === null) {
      toast.error("총점은 1점 이상으로 입력해주세요.");
      return false;
    }

    if (paperItems.some((item) => item.blockType === "question")) {
      const distributed = distributeTotalPoints(normalizedTotal);
      if (!distributed) return false;
    }

    setAutoPointTotal(normalizedTotal);
    markDirty();
    return true;
  }

  async function saveDraft(options: SaveDraftOptions = {}): Promise<string | null> {
    const targetExamId =
      options.targetExamId === undefined ? savedExamId : options.targetExamId;
    const titleToSave = options.titleOverride ?? title;
    const result = await saveExamPaperDraftFromBuilder({
      academyId,
      savedExamId: targetExamId,
      successMessage: options.successMessage,
      title: titleToSave,
      type: initialExam?.type || "OFFLINE",
      classId,
      schoolId,
      grade,
      semester,
      examType,
      examDate,
      totalPoints,
      autoPointTotal,
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
      cover,
      paperItems,
      classes,
      schools,
    });

    if (!result.success) return null;

    setSavedExamId(result.id);
    if (titleToSave !== title) {
      setTitle(titleToSave);
    }
    setDirty(false);
    if (!isEditingExistingExam) {
      void deleteExamPaperBuilderDraft(builderDraftKey);
    }
    return result.id;
  }

  function handleSave() {
    startTransition(async () => {
      await saveDraft();
    });
  }

  function openSaveAsDialog() {
    setSaveAsTitle(buildDefaultSaveAsTitle(title));
    setSaveAsOpen(true);
  }

  function handleSaveAsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = saveAsTitle.trim();
    if (!trimmedTitle) {
      toast.error("새 시험지 제목을 입력해주세요.");
      return;
    }

    startTransition(async () => {
      const newExamId = await saveDraft({
        targetExamId: null,
        titleOverride: trimmedTitle,
        successMessage: "새 시험지로 저장되었습니다.",
      });
      if (!newExamId) return;

      setSaveAsOpen(false);
      router.replace(`/director/workbench/exams/${newExamId}/edit`);
    });
  }

  function handlePrint() {
    if (paperItems.length === 0) {
      toast.error("인쇄할 문제를 먼저 선택해주세요.");
      return;
    }
    // 저장된 시험지에 한해 인쇄 횟수 집계 (미저장 상태는 귀속 대상이 없음)
    if (savedExamId) {
      void incrementExamPrintCount(savedExamId);
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

  function handleSelectPaperItem(localId: string) {
    setActiveItemId(localId);
    window.requestAnimationFrame(() => {
      const scroller = previewScrollerRef.current;
      const target = scroller?.querySelector<HTMLElement>(
        `[data-paper-item-id="${localId}"]`,
      );
      if (!scroller || !target) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      scroller.scrollTo({
        top: scroller.scrollTop + targetRect.top - scrollerRect.top - 72,
        behavior: "smooth",
      });
    });
  }

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (commandPaletteOpen && event.key === "Escape") {
        event.preventDefault();
        setCommandPaletteOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if (!editing && event.key === "/") {
        event.preventDefault();
        openCommandPalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandPaletteOpen, openCommandPalette]);

  const quickCommands: QuickCommand[] = [
    {
      id: "insert-section",
      label: "섹션 블록 삽입",
      description: "선택 블록 바로 뒤에 섹션을 추가",
      run: () => insertBlock("section"),
    },
    {
      id: "insert-text",
      label: "텍스트 블록 삽입",
      description: "안내 문구나 지시문을 추가",
      run: () => insertBlock("text"),
    },
    {
      id: "insert-divider",
      label: "구분선 삽입",
      description: "시험지 흐름을 나누는 선 추가",
      run: () => insertBlock("divider"),
    },
    {
      id: "regroup",
      label: "지문별 자동 그룹화",
      description: "같은 지문 문항을 다시 묶기",
      disabled: paperItems.length < 2,
      run: regroupByPassage,
    },
    {
      id: "columns",
      label: columns === 2 ? "1단으로 전환" : "2단으로 전환",
      description: "시험지 단 구성을 빠르게 변경",
      run: () => {
        setColumns(columns === 2 ? 1 : 2);
        markDirty();
      },
    },
    {
      id: "density",
      label: density === "compact" ? "표준 밀도로 전환" : "압축 밀도로 전환",
      description: "문항 간격과 글자 흐름을 조정",
      run: () => {
        setDensity(density === "compact" ? "comfortable" : "compact");
        markDirty();
      },
    },
    {
      id: "save",
      label: "시험지 저장",
      description: "현재 시험지 구성을 저장",
      disabled: isPending || paperItems.length === 0,
      run: handleSave,
    },
    ...(savedExamId
      ? [
          {
            id: "save-as",
            label: "다른 이름으로 저장",
            description: "원본은 그대로 두고 새 시험지로 저장",
            disabled: isPending || paperItems.length === 0,
            run: openSaveAsDialog,
          },
        ]
      : []),
  ];

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
      cover={cover}
      setCover={updateCover}
      totalPoints={totalPoints}
      questionItemsCount={questionItemsCount}
      autoPointTotal={autoPointTotal}
      onChangeAutoPointTotal={updateAutoPointTotal}
      markDirty={markDirty}
      variant="sidebar"
    />
  );

  return (
    <div
      id="exam-builder-shell"
      className={cn(
        "relative flex h-[100dvh] min-h-0 flex-col overflow-hidden md:-m-6",
        // 기존 시험지 '수정' 모드는 새로 만드는 화면과 헷갈리지 않도록 배경을
        // 살짝 어둡게 한다 (미리보기 종이 자체는 흰색 그대로).
        isEditingExistingExam ? "bg-slate-200" : "bg-[#F4F6F9]",
      )}
    >
      <div
        aria-hidden={!headerVisible}
        className={cn(
          "no-print shrink-0 overflow-hidden border-b bg-white px-5 transition-[max-height,padding,opacity,transform,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          headerVisible
            ? "max-h-20 translate-y-0 border-slate-200/80 py-3 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-3 border-transparent py-0 opacity-0",
        )}
      >
        <div
          className={cn(
            "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            headerVisible ? "translate-y-0" : "-translate-y-2",
          )}
        >
          <WorkflowPageTitle
            icon={ExamPaperGenerationIcon}
            title={isEditingExistingExam ? "시험지 수정" : "시험지 생성"}
            description={
              isEditingExistingExam
                ? "저장된 시험지를 불러와 용지 구성과 문항 배치를 다시 편집합니다."
                : "문제 은행에서 문제를 고르고 용지 미리보기에서 편집해 시험지를 저장합니다."
            }
          />
        </div>
      </div>
      <button
        type="button"
        onMouseEnter={() => setHeaderVisible(true)}
        onFocus={() => setHeaderVisible(true)}
        onClick={() => setHeaderVisible(true)}
        title="헤더 보기"
        aria-label="헤더 보기"
        className={cn(
          "no-print absolute left-0 top-0 z-40 h-4 w-4 bg-slate-900/10 shadow-[2px_2px_8px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-[opacity,transform,background-color] duration-300 ease-out [clip-path:polygon(0_0,100%_0,0_100%)] hover:bg-blue-500/20 focus:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-200",
          headerVisible
            ? "pointer-events-none -translate-x-1 -translate-y-1 opacity-0"
            : "translate-x-0 translate-y-0 opacity-100",
        )}
      />
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
            filteredQuestions={filteredQuestions}
            search={search}
            setSearch={setSearch}
            selectedSubTypes={selectedSubTypes}
            setSelectedSubTypes={setSelectedSubTypes}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            approvedFilter={approvedFilter}
            setApprovedFilter={setApprovedFilter}
            starredOnly={starredOnly}
            setStarredOnly={setStarredOnly}
            sort={sort}
            setSort={setSort}
            statusCounts={statusCounts}
            paperQuestionCounts={paperQuestionCounts}
            selectedQuestionIds={dragSelectedIds}
            duplicateSelectedQuestionIds={duplicateSelectedIds}
            onToggleSelect={toggleDragSelected}
            onApproveDuplicateSelect={approveDuplicateSelection}
            setSelectedQuestionIds={setDragSelectedIds}
            onInsertSelected={addSelectedQuestionsToPaper}
            onShowDetail={setDetailQuestion}
            totalQuestionCount={questions.length}
            childFolders={folders.childFolders}
            activeFolder={folders.activeFolder}
            breadcrumbPath={folders.breadcrumbPath}
            showNewFolder={folders.showNewFolder}
            newFolderName={folders.newFolderName}
            onNewFolderNameChange={folders.setNewFolderName}
            onShowNewFolder={folders.setShowNewFolder}
            onCreateFolder={folders.handleCreateFolder}
            onNavigateToFolder={folders.navigateToFolder}
            onNavigateToRoot={() => folders.setActiveFolder(null)}
            onRenameFolder={folders.handleRenameFolder}
            onDeleteFolder={folders.handleDeleteFolder}
            onDragToFolder={handleDragQuestionToFolder}
            onDragToRoot={handleDragQuestionToRoot}
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

        <section
          className={cn(
            "flex min-w-0 flex-col overflow-hidden",
            isEditingExistingExam ? "bg-slate-200/80" : "bg-slate-100/70",
          )}
        >
          <PreviewToolbar
            template={template}
            paperSize={paperSize}
            dirty={dirty}
            isPending={isPending}
            paperItemsCount={questionItemsCount}
            forceTwoPerPage={forceTwoPerPage}
            onToggleTwoPerPage={() => {
              setForceTwoPerPage((value) => !value);
              markDirty();
            }}
            onOpenCommandPalette={() => {
              setCommandPaletteOpen((open) => !open);
            }}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onPrint={handlePrint}
            onDownloadPdf={handlePrint}
            onDownloadDocx={handleDownloadDocx}
            onDownloadDocxWithAnswers={handleDownloadDocxWithAnswers}
            onDownloadHwpx={handleDownloadHwpx}
            onDownloadHwpxWithAnswers={handleDownloadHwpxWithAnswers}
            onSave={handleSave}
            onSaveAs={savedExamId ? openSaveAsDialog : undefined}
          />

          <CommandBar
            open={commandPaletteOpen}
            commands={quickCommands}
            onClose={() => setCommandPaletteOpen(false)}
          />

          <div
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              isEditingExistingExam ? "bg-slate-200/80" : "bg-slate-100/70",
            )}
          >
            {paperPages.length > 0 && (
              <PreviewZoomControls
                zoom={previewZoom}
                position={previewZoomControlsPos}
                onZoomIn={zoomPreviewIn}
                onZoomOut={zoomPreviewOut}
                onReset={resetPreviewZoom}
                onFit={fitPreviewToScreen}
                onDragStart={handlePreviewZoomControlsDragStart}
              />
            )}
            {questionDropActive && (
              <div className="no-print pointer-events-none absolute inset-4 z-10 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/5 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]">
                <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-blue-200 bg-white/95 px-3 py-1 text-[11px] font-black text-blue-700 shadow-sm">
                  {questionDropCount > 1 ? `문제 ${questionDropCount}개 추가` : "문제 추가"}
                </div>
              </div>
            )}
            {(draggingItemId || questionDropActive) && (
              <div className="no-print pointer-events-none absolute inset-0 z-[9]">
                <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-blue-300/70" />
                <div className="absolute left-0 top-1/2 w-full border-t border-dashed border-blue-300/70" />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-blue-200 bg-white/95 px-3 py-1 text-[10px] font-black text-blue-700 shadow-sm">
                  스냅 가이드
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
                      cover={cover}
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
                      onSelectCover={() =>
                        previewScrollerRef.current?.scrollTo({
                          top: 0,
                          behavior: "smooth",
                        })
                      }
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
                  // scrollbar-gutter:stable keeps the vertical scrollbar from
                  // toggling the content width when the page count changes, which
                  // (with the fit-zoom measurement) caused the paper to flicker.
                  "min-h-0 flex-1 overflow-auto overscroll-contain px-5 py-5 transition-colors [scrollbar-gutter:stable]",
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
                  cover={cover}
                  updateCover={updateCover}
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
            paperItems={paperItems}
            activeItemId={activeItemId}
            paperItemsCount={paperItems.length}
            totalPoints={totalPoints}
            autoPointTotal={autoPointTotal}
            settingsNudgeActive={shouldNudgeSettingsButton}
            onDismissSettingsNudge={dismissSettingsNudge}
            onHideSettingsNudgePermanently={hideSettingsNudgePermanently}
            onOpenSettings={openSettingsPanel}
            onSelectItem={handleSelectPaperItem}
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

      <Dialog
        open={saveAsOpen}
        onOpenChange={(open) => {
          if (!isPending) setSaveAsOpen(open);
        }}
      >
        <DialogContent className="no-print sm:max-w-md">
          <form onSubmit={handleSaveAsSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>다른 이름으로 저장</DialogTitle>
              <DialogDescription>
                현재 편집 내용을 새 시험지로 저장합니다. 원본 시험지는 그대로 유지됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="exam-save-as-title">새 시험지 제목</Label>
              <Input
                id="exam-save-as-title"
                value={saveAsTitle}
                onChange={(event) => setSaveAsTitle(event.target.value)}
                disabled={isPending}
                maxLength={120}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveAsOpen(false)}
                disabled={isPending}
              >
                취소
              </Button>
              <Button type="submit" disabled={isPending || !saveAsTitle.trim()}>
                {isPending ? "저장 중..." : "새 시험지로 저장"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {pendingBuilderDraft && !isEditingExistingExam && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-black text-slate-900">
                  이어서 작성할 시험지가 있어요
                </p>
                <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-500">
                  {pendingBuilderDraft.state.title || "제목 없는 시험지"} ·{" "}
                  {pendingBuilderDraft.state.paperItems.length}블록 ·{" "}
                  {formatBuilderDraftUpdatedAt(pendingBuilderDraft.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={discardPendingBuilderDraft}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="임시저장본 닫기"
                title="새로 시작"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={discardPendingBuilderDraft}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                새로 시작
              </button>
              <button
                type="button"
                onClick={restorePendingBuilderDraft}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-black text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                이어서 작성
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="no-print fixed inset-0 z-40 flex justify-end bg-slate-950/25">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="시험지 설정 닫기"
            onClick={() => setSettingsOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[360px] max-w-[calc(100vw-32px)] flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <div>
                <p className="text-[13px] font-black text-slate-900">시험지 설정</p>
                <p className="text-[11px] font-semibold text-slate-400">
                  배점, 용지, 템플릿
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="시험지 설정 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {templateSettingsPanel}
            </div>
          </aside>
        </div>
      )}

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
