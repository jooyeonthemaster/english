"use client";

import { type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronRight, GripVertical, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { type BuilderQuestion, DEFAULT_PAPER_COVER, type Density, type HeaderPatch, LINE_GAP_MARKER, type PaginationSettings, type PaperCover, type PaperSize, type PaperTemplate, type PassageStyle } from "./paper-builder/types";
import { DEFAULT_INSTRUCTIONS, PAPER_SIZE_SPECS, SUBTYPE_LABELS } from "./paper-builder/constants";
import { buildGroups, formatDateInput, parseTags } from "./paper-builder/paper-item-utils";
import { asDensity, asPaperSize, asPaperTemplate, asPassageStyle, buildPaperItemsFromExam, formatExamDate, parseBuilderSettings } from "./exam-paper-builder-existing";
import { DEFAULT_TEMPLATE_SETTINGS, normalizePaperCover, readSavedTemplateSettings } from "./paper-builder/saved-template-settings";
import { deleteExamPaperBuilderDraft, type ExamPaperBuilderDraft, type ExamPaperBuilderDraftState, getExamPaperBuilderDraftKey, readExamPaperBuilderDraft, writeExamPaperBuilderDraft } from "./paper-builder/indexeddb-drafts";
import { useSidebarFocus } from "@/components/layout/sidebar-focus-context";
import { paginateGroups } from "./paper-builder/pagination";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { BuilderPropertiesPanel } from "./paper-builder/components/builder-properties-panel";
import { QuestionDetailModal } from "./paper-builder/components/question-detail-modal";
import { BlockFormatToolbar } from "./paper-builder/components/block-format-toolbar";
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
import { addQuestionsToCollection, createQuestionCollection, deleteQuestionCollection, removeQuestionsFromCollection, updateQuestionCollection } from "@/actions/workbench";
import { incrementExamPrintCount } from "@/actions/exams";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { useBeforeUnloadWarning } from "@/components/shared/use-unsaved-close-guard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EXAM_SEED_QUESTION_IDS_KEY } from "@/lib/exam-paper-seed";
import { BUILDER_DRAFT_AUTOSAVE_DELAY_MS, BUILDER_HEADER_AUTO_HIDE_DELAY_MS, BUILDER_HEADER_HIDE_ZONE_PX, LEFT_PANEL_COLLAPSED_STORAGE_KEY, PANEL_DRAG_THRESHOLD, PANEL_MIN_CENTER, PANEL_TOGGLE_HANDLE_WIDTH, PANEL_WIDTH_STORAGE_KEY, PREVIEW_PAGE_GAP, RIGHT_PANEL_COLLAPSED_STORAGE_KEY, THUMBNAILS_COLLAPSED_STORAGE_KEY, THUMBNAILS_WIDTH_STORAGE_KEY } from "./exam-paper-builder-client-parts/builder-constants";
import type { BuilderPanelTab, ExamPaperBuilderClientProps, PanelResizeSide, PanelWidths, SaveDraftOptions } from "./exam-paper-builder-client-parts/builder-types";
import { asAutoPointTotal, buildDefaultSaveAsTitle, clampPanelWidths, clampThumbnailsWidth, formatBuilderDraftUpdatedAt, getQuestionDropInsertion, hasMeaningfulBuilderDraft, readStoredLeftPanelCollapsed, readStoredPanelWidths, readStoredRightPanelCollapsed, readStoredThumbnailsCollapsed, readStoredThumbnailsWidth, samePanelWidths, sortBuilderQuestions } from "./exam-paper-builder-client-parts/builder-helpers";
import { PageThumbnails } from "./exam-paper-builder-client-parts/page-thumbnails";
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
  const initialPaperQuestionCount = useMemo(
    () => initialPaperItems.filter((item) => item.blockType === "question").length,
    [initialPaperItems],
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
  const previousQuestionItemsCountRef = useRef(initialPaperQuestionCount);

  const [savedExamId, setSavedExamId] = useState<string | null>(
    initialExam?.id ?? null,
  );
  const [pendingBuilderDraft, setPendingBuilderDraft] =
    useState<ExamPaperBuilderDraft | null>(null);
  const [draftStorageReady, setDraftStorageReady] =
    useState(isEditingExistingExam);
  const [dirty, setDirty] = useState(false);
  // 전체 페이지형 편집기 — 미저장 변경 시 브라우저 이탈(탭 닫기/새로고침) 경고.
  useBeforeUnloadWarning(dirty);
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
  const [rightPanelTab, setRightPanelTab] = useState<BuilderPanelTab>(() =>
    initialPaperQuestionCount === 0 ? "settings" : "edit",
  );
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
  const [forceTwoPerPage, setForceTwoPerPage] = useState(() =>
    typeof initialSettings?.layout?.forceTwoPerPage === "boolean"
      ? initialSettings.layout.forceTwoPerPage
      : (savedTemplateSettings?.forceTwoPerPage ??
        DEFAULT_TEMPLATE_SETTINGS.forceTwoPerPage),
  );
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
    insertLineGap,
    removeLineGap,
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
  // 워드프로세서식 빈 줄 — 미리보기에서 문제 사이 간격을 클릭하면 그 자리에 텍스트 캐럿이
  // 놓인다. afterLocalId 는 캐럿 바로 위 항목의 localId(null = 맨 앞 간격). 이 상태에서
  // Enter 로 빈 줄 추가, Backspace 로 제거, Esc 로 해제한다.
  const [lineCaret, setLineCaret] = useState<{ afterLocalId: string | null } | null>(
    null,
  );
  // 블록(이미지·텍스트 등)을 삽입한 직후, 그 블록이 다음 칸·다음 쪽으로 들어갔더라도
  // 미리보기가 자동으로 그 위치까지 스크롤해 사용자에게 보여주기 위한 대상 localId.
  const [pendingScrollItemId, setPendingScrollItemId] = useState<string | null>(null);
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
  useEffect(() => {
    const previousCount = previousQuestionItemsCountRef.current;
    if (questionItemsCount > previousCount) {
      setRightPanelTab("edit");
    } else if (questionItemsCount === 0 && paperItems.length === 0) {
      setRightPanelTab("settings");
    }
    previousQuestionItemsCountRef.current = questionItemsCount;
  }, [paperItems.length, questionItemsCount]);

  const selectedPaperQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of paperItems) {
      if (item.blockType === "question") ids.add(item.questionId);
    }
    return ids;
  }, [paperItems]);

  // 워드프로세서식 빈 줄(line-gap) 여백은 "미리보기에서만" 조절하는 요소다. 우측 편집
  // 패널(블록 목록·선택 블록·블록 수)에는 일반 블록으로 노출하지 않도록 걸러낸다.
  const panelPaperItems = useMemo(
    () =>
      paperItems.filter(
        (item) =>
          !(item.blockType === "spacer" && item.blockText === LINE_GAP_MARKER),
      ),
    [paperItems],
  );

  // 미리보기에서 클릭한 문항(블록)의 원본 문제 id — 좌측 문제목록 카드 강조/스크롤용.
  const activeQuestionId =
    activeItem && activeItem.blockType === "question"
      ? activeItem.questionId
      : null;

  // 문항(블록)을 선택하면 빈 줄 캐럿은 해제한다(둘은 상호 배타).
  useEffect(() => {
    if (activeItemId) setLineCaret(null);
  }, [activeItemId]);

  // 빈 줄 캐럿이 놓인 동안 Enter=빈 줄 추가 / Backspace=제거 / Esc=해제.
  // 본문 인라인 편집(EditableText·입력창) 중에는 가로채지 않는다.
  useEffect(() => {
    if (!lineCaret) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA")
      )
        return;
      const linePx = density === "compact" ? 15 : 18;
      if (event.key === "Enter") {
        // 빈 줄을 한 줄 끼우고 캐럿도 그 줄로 함께 내려간다.
        event.preventDefault();
        const nextAnchor = insertLineGap(lineCaret.afterLocalId, linePx);
        if (nextAnchor) setLineCaret({ afterLocalId: nextAnchor });
      } else if (event.key === "Backspace" || event.key === "Delete") {
        // 캐럿이 놓인 빈 줄을 지우고 캐럿이 한 줄 위로 올라간다(실제 문항은 못 지움).
        event.preventDefault();
        const { ok, nextAnchor } = removeLineGap(lineCaret.afterLocalId);
        if (ok) setLineCaret({ afterLocalId: nextAnchor });
      } else if (event.key === "Escape") {
        setLineCaret(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lineCaret, density, insertLineGap, removeLineGap]);

  // 전역 단축키: 선택 블록 Delete/Backspace=삭제, Cmd/Ctrl+Z=되돌리기,
  // Cmd/Ctrl+Shift+Z(또는 Ctrl+Y)=다시 실행.
  // 본문 인라인 편집(EditableText)·입력창·선택상자에 포커스가 있을 땐 가로채지 않는다
  // (텍스트 편집과 브라우저 기본 실행취소를 보존).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editing =
        !!el &&
        (el.isContentEditable ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT");
      if (editing) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) redo();
        } else if (canUndo) {
          undo();
        }
        return;
      }
      if (mod && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        if (canRedo) redo();
        return;
      }

      // 빈 줄 캐럿이 활성일 땐 위 핸들러가 Delete/Backspace 를 처리하므로 제외.
      // 잠긴 블록은 삭제하지 않는다(미리보기 휴지통 버튼과 동일 규칙).
      if (
        !lineCaret &&
        activeItemId &&
        !activeItem?.locked &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        removeItem(activeItemId);
        setActiveItemId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeItemId,
    activeItem?.locked,
    lineCaret,
    removeItem,
    setActiveItemId,
    undo,
    redo,
    canUndo,
    canRedo,
  ]);

  // 빈 줄이 칸/페이지를 넘어가면 캐럿이 다음 쪽으로 이동하므로, 화면 밖으로 나간 경우
  // 미리보기를 캐럿(빈 줄 자리)이 보이도록 따라 스크롤한다(워드프로세서처럼 시야가 따라감).
  useEffect(() => {
    const anchor = lineCaret?.afterLocalId;
    if (!anchor) return;
    const raf = window.requestAnimationFrame(() => {
      const scroller = previewScrollerRef.current;
      const target = scroller?.querySelector<HTMLElement>(
        `[data-line-gap-anchor="${CSS.escape(anchor)}"]`,
      );
      if (!scroller || !target) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const fullyVisible =
        targetRect.top >= scrollerRect.top + 8 &&
        targetRect.bottom <= scrollerRect.bottom - 8;
      if (fullyVisible) return;
      scroller.scrollTo({
        top:
          scroller.scrollTop +
          targetRect.top -
          scrollerRect.top -
          scrollerRect.height / 2,
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [lineCaret, previewScrollerRef]);

  // 블록 삽입 직후: 새 블록(특히 다음 쪽으로 넘어간 이미지)이 화면 밖이면 그 위치까지
  // 부드럽게 스크롤해 사용자에게 보여준다. paperItems 변경(삽입→재배치) 후 DOM 이 갱신된
  // 뒤 RAF 로 스크롤한다(타이밍 안전). 이미 보이면 그대로 둔다.
  useEffect(() => {
    if (!pendingScrollItemId) return;
    const raf = window.requestAnimationFrame(() => {
      const scroller = previewScrollerRef.current;
      const target = scroller?.querySelector<HTMLElement>(
        `[data-paper-item-id="${CSS.escape(pendingScrollItemId)}"]`,
      );
      if (!scroller || !target) return; // 아직 렌더 전 — paperItems 갱신 시 재시도.
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const fullyVisible =
        targetRect.top >= scrollerRect.top + 8 &&
        targetRect.bottom <= scrollerRect.bottom - 8;
      if (!fullyVisible) {
        scroller.scrollTo({
          top:
            scroller.scrollTop + targetRect.top - scrollerRect.top - 72,
          behavior: "smooth",
        });
      }
      setPendingScrollItemId(null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pendingScrollItemId, paperItems, previewScrollerRef]);

  const addQuestionIdsToPaper = useCallback((ids: Iterable<string>) => {
    const seen = new Set<string>();
    const selectedQuestions: BuilderQuestion[] = [];

    for (const id of ids) {
      if (seen.has(id) || paperQuestionCounts.has(id)) continue;
      const question = questionById.get(id);
      if (!question) continue;
      seen.add(id);
      selectedQuestions.push(question);
    }

    if (selectedQuestions.length > 0) {
      addQuestionsAtDropTarget(selectedQuestions, null, "after");
    }
  }, [addQuestionsAtDropTarget, paperQuestionCounts, questionById]);

  const removeQuestionIdFromPaper = useCallback((id: string) => {
    const targets = paperItems.filter(
      (item) => item.blockType === "question" && item.questionId === id,
    );
    for (const item of targets) removeItem(item.localId);
  }, [paperItems, removeItem]);

  // 문제 생성 결과에서 '시험지 생성'으로 넘어오면, 그 문제들을 미리보기(시험지)에
  // 바로 올린다. seed id 는 sessionStorage 로 전달되고 1회 소비 후 비운다.
  const seededFromGenerateRef = useRef(false);
  useEffect(() => {
    if (seededFromGenerateRef.current) return;
    seededFromGenerateRef.current = true;
    try {
      const raw = window.sessionStorage.getItem(EXAM_SEED_QUESTION_IDS_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(EXAM_SEED_QUESTION_IDS_KEY);
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length > 0) {
        addQuestionIdsToPaper(
          ids.filter((value): value is string => typeof value === "string"),
        );
      }
    } catch {
      // 잘못된 seed 값은 무시한다.
    }
  }, [addQuestionIdsToPaper]);

  const togglePaperQuestionSelection = useCallback((id: string) => {
    if (selectedPaperQuestionIds.has(id)) {
      removeQuestionIdFromPaper(id);
      return;
    }
    addQuestionIdsToPaper([id]);
  }, [addQuestionIdsToPaper, removeQuestionIdFromPaper, selectedPaperQuestionIds]);

  const applyPaperQuestionSelection = useCallback((nextSelectedIds: Set<string>) => {
    const toRemove = Array.from(selectedPaperQuestionIds).filter(
      (id) => !nextSelectedIds.has(id),
    );
    const toAdd = Array.from(nextSelectedIds).filter(
      (id) => !selectedPaperQuestionIds.has(id),
    );

    for (const id of toRemove) removeQuestionIdFromPaper(id);
    addQuestionIdsToPaper(toAdd);
  }, [addQuestionIdsToPaper, removeQuestionIdFromPaper, selectedPaperQuestionIds]);

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
    setActivePageIndex(0);
    setRightPanelTab(
      state.paperItems.some((item) => item.blockType === "question")
        ? "edit"
        : "settings",
    );
    previousQuestionItemsCountRef.current = state.paperItems.filter(
      (item) => item.blockType === "question",
    ).length;
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
        const draggedIds = Array.isArray(rawIds) && rawIds.length > 0
          ? rawIds.filter((id): id is string => typeof id === "string")
          : typeof source.data.questionId === "string"
            ? [source.data.questionId]
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
        addQuestionsAtDropTarget(dropped, insertion.targetLocalId, insertion.placement);
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

  function togglePassageTitleVisibility() {
    setShowPassageTitle((current) => !current);
    markDirty();
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
      forceTwoPerPage,
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

  // 새 시험지(create)에서 처음 저장하면, 저장이 유발하는 현재 라우트 새로고침에
  // 빌더가 리마운트될 때 메모리에만 있던 paperItems가 사라진다(create 페이지는
  // initialExam이 없어 빈 상태로 다시 시작하고, 같은 저장이 IndexedDB 임시저장본도
  // 지워 복구할 길이 없다). 편집 라우트는 DB에서 내용을 다시 불러오므로, 첫 저장
  // 직후 편집 화면으로 옮겨 내용 손실을 막는다("다른 이름으로 저장"과 동일한 패턴).
  function goToEditAfterFreshSave(examId: string) {
    if (isEditingExistingExam) return;
    router.replace(`/director/workbench/exams/${examId}/edit`);
  }

  function handleSave() {
    startTransition(async () => {
      const examId = await saveDraft();
      if (examId) goToEditAfterFreshSave(examId);
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
      // 다운로드(attachment fetch)를 먼저 발사한 뒤 라우트를 이동해야 진행 중인
      // 다운로드가 끊기지 않는다.
      triggerDocxDownload(examId, false);
      goToEditAfterFreshSave(examId);
    });
  }

  function handleDownloadDocxWithAnswers() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerDocxDownload(examId, true);
      goToEditAfterFreshSave(examId);
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
      goToEditAfterFreshSave(examId);
    });
  }

  function handleDownloadHwpxWithAnswers() {
    startTransition(async () => {
      const examId = dirty || !savedExamId ? await saveDraft() : savedExamId;
      if (!examId) return;
      triggerHwpxDownload(examId, true);
      goToEditAfterFreshSave(examId);
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

  // 블록 삽입 후 그 블록을 스크롤 대상으로 등록 → 다음 쪽으로 넘어가도 자동으로 보여준다.
  function handleInsertBlock(blockType: Parameters<typeof insertBlock>[0]) {
    setPendingScrollItemId(insertBlock(blockType));
  }
  function handleUploadImageBlock(dataUrl: string, imageAlt: string) {
    setPendingScrollItemId(insertImageBlock(dataUrl, imageAlt));
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
      forceTwoPerPage={forceTwoPerPage}
      setForceTwoPerPage={setForceTwoPerPage}
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
            activeQuestionId={activeQuestionId}
            selectedQuestionIds={selectedPaperQuestionIds}
            onToggleSelect={togglePaperQuestionSelection}
            setSelectedQuestionIds={applyPaperQuestionSelection}
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
            onResetPaper={() =>
              replacePaperItems([], null, { markAsDirty: true })
            }
            onSave={handleSave}
            onSaveAs={savedExamId ? openSaveAsDialog : undefined}
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
                  lineCaret={lineCaret}
                  setLineCaret={setLineCaret}
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
          {/* 텍스트/섹션 블록 인라인 편집 시 떠오르는 서식 툴바(글자크기·굵게·기울임·정렬). */}
          <BlockFormatToolbar items={paperItems} onUpdateItem={updateItem} />
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
            paperItems={panelPaperItems}
            activeItemId={activeItemId}
            paperItemsCount={panelPaperItems.length}
            totalPoints={totalPoints}
            autoPointTotal={autoPointTotal}
            showPassageTitle={showPassageTitle}
            activeTab={rightPanelTab}
            onTabChange={setRightPanelTab}
            settingsPanel={templateSettingsPanel}
            onSelectItem={handleSelectPaperItem}
            onInsertBlock={handleInsertBlock}
            onUploadImageBlock={handleUploadImageBlock}
            onDuplicateItem={duplicateItem}
            onToggleLockItem={toggleLockItem}
            onTogglePassageTitle={togglePassageTitleVisibility}
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
              <SaveButton
                type="submit"
                saving={isPending}
                disabled={isPending || !saveAsTitle.trim()}
                title="새 시험지로 저장"
              />
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
