"use client";

import { type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronDown, ChevronLeft, ChevronRight, CirclePlay, GripVertical, RotateCcw, ShoppingBasket, Trash2, X } from "lucide-react";
import { MobileStepHeader } from "@/components/workbench/mobile-step-flow";
import { toast } from "sonner";
import { type BuilderQuestion, type BuilderQuestionSetRender, DEFAULT_PAPER_COVER, type Density, type HeaderPatch, LINE_GAP_MARKER, type PaginationSettings, type PaperCover, type PaperSize, type PaperTemplate, type PassageStyle } from "./paper-builder/types";
import { DEFAULT_INSTRUCTIONS, PAPER_SIZE_SPECS } from "./paper-builder/constants";
import { buildGroups, formatDateInput } from "./paper-builder/paper-item-utils";
import { asDensity, asPaperSize, asPaperTemplate, asPassageStyle, buildPaperItemsFromExam, formatExamDate, parseBuilderSettings } from "./exam-paper-builder-existing";
import { DEFAULT_TEMPLATE_SETTINGS, normalizePaperCover, readSavedTemplateSettings } from "./paper-builder/saved-template-settings";
import { deleteExamPaperBuilderDraft, type ExamPaperBuilderDraft, type ExamPaperBuilderDraftState, getExamPaperBuilderDraftKey, readExamPaperBuilderDraft, writeExamPaperBuilderDraft } from "./paper-builder/indexeddb-drafts";
import { useSidebarFocus } from "@/components/layout/sidebar-focus-context";
import { paginateGroups } from "./paper-builder/pagination";
import { buildAnswerKeyLayout, EMPTY_ANSWER_KEY_LAYOUT } from "./paper-builder/answer-key-layout";
import { usePrintPortal } from "./paper-builder/hooks/use-print-portal";
import { PrintStyles } from "./paper-builder/components/print-styles";
import { BuilderPropertiesPanel } from "./paper-builder/components/builder-properties-panel";
import { QuestionDetailModal } from "./paper-builder/components/question-detail-modal";
import { BlockFormatToolbar } from "./paper-builder/components/block-format-toolbar";
import { MobileBlockActionBar, MobileBlockEditSheet } from "./paper-builder/components/mobile-block-actions";
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
import { addQuestionsToCollection, createQuestionCollection, deleteQuestionCollection, getAcademyQuestionCollectionMembership, getQuestionCollections, removeQuestionsFromCollection, updateQuestionCollection } from "@/actions/workbench";
import { incrementExamPrintCount } from "@/actions/exams";
import {
  getExamPaperBuilderSetMemberQuestionsByQuestionIds,
  getExamPaperBuilderQuestionSetsBySetIds,
  getExamPaperBuilderQuestionsByIds,
  getExamPaperBuilderQuestionsPage,
  getExamPaperBuilderQuestionIds,
  getExamPaperBuilderQuestionPageOf,
} from "@/actions/exam-paper-builder";
import { BUILDER_PAGE_SIZE } from "@/actions/workbench/_question-where";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { DEFAULT_MOBILE_PAGE_SIZE } from "@/hooks/use-mobile-pagination";
import type { WorkbenchQuestionFilters } from "@/actions/workbench/_types";
import {
  getAcademyQuestionSetMemberMap,
  type QuestionSetForRender,
} from "@/actions/question-sets";
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
import { asAutoPointTotal, buildDefaultSaveAsTitle, clampPanelWidths, clampThumbnailsWidth, formatBuilderDraftUpdatedAt, getQuestionDropInsertion, hasMeaningfulBuilderDraft, readStoredLeftPanelCollapsed, readStoredPanelWidths, readStoredRightPanelCollapsed, readStoredThumbnailsCollapsed, readStoredThumbnailsWidth, samePanelWidths } from "./exam-paper-builder-client-parts/builder-helpers";
import { PageThumbnails } from "./exam-paper-builder-client-parts/page-thumbnails";

function toBuilderQuestionSetRender(
  set: QuestionSetForRender,
): BuilderQuestionSetRender {
  return {
    id: set.id,
    setLabel: set.setLabel,
    canonicalPassage: set.canonicalPassage,
    layout: set.layout,
    members: set.members.map((member) => ({
      questionId: member.questionId,
      orderInSet: member.orderInSet,
      isStructural: member.isStructural,
      typeId: member.typeId,
      spans: Array.isArray(member.spans) ? member.spans : [],
    })),
  };
}

function attachSetRender(
  question: BuilderQuestion,
  setRenderById: Map<string, BuilderQuestionSetRender>,
): BuilderQuestion {
  const setId = question.setId;
  if (!setId) return question;
  const setRender = setRenderById.get(setId);
  return setRender ? { ...question, setRender } : question;
}

export function ExamPaperBuilderClient({
  academyId,
  questions,
  total: initialTotal,
  totalPages: initialTotalPages,
  statusCounts: initialStatusCounts,
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
  // 모바일(<lg) 전용 2단계 흐름: 1) 문제 선택 ↔ 2) 미리보기·저장. 데스크톱은 영향 없음.
  const [mobileStep, setMobileStep] = useState<"select" | "preview">("select");
  // 모바일 하단 고정 '담긴 문제' 장바구니 펼침 상태.
  const [cartOpen, setCartOpen] = useState(false);
  // 모바일 미리보기에서 텍스트·섹션 블록 '내용 수정' 풀스크린 시트 열림 상태.
  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  // 모바일 컨텍스트 바 대상 — activeItem 은 activeItemId 가 null 이어도 첫 블록으로
  // 폴백(PC 편집 패널용)하므로, 사용자가 실제로 탭한 블록만 잡는다.
  const mobileSelectedItem = activeItemId
    ? paperItems.find((it) => it.localId === activeItemId) ?? null
    : null;
  // 모바일 컨텍스트 바의 위로/아래로 — 터치 드래그 대신 인접 블록과 자리를 바꾼다.
  const mobileSelectedIndex = mobileSelectedItem
    ? paperItems.findIndex((it) => it.localId === mobileSelectedItem.localId)
    : -1;
  const moveActiveItem = (direction: -1 | 1) => {
    if (!mobileSelectedItem || mobileSelectedIndex < 0) return;
    const target = paperItems[mobileSelectedIndex + direction];
    if (!target) return;
    moveItemToDropTarget(
      mobileSelectedItem.localId,
      target.localId,
      direction === -1 ? "before" : "after",
    );
  };
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

  // 미리보기/선택 작업세트용 풀 캐시 — 현재 페이지에 없는(다른 페이지·시드된) 문항을
  // getExamPaperBuilderQuestionsByIds 로 배치 로드해 보관한다. questionById 에 병합돼
  // 미리보기 추가 시 "현재 페이지에 없는 문항"도 정상적으로 올라간다.
  const [fetchedQuestions, setFetchedQuestions] = useState<
    Map<string, BuilderQuestion>
  >(() => new Map());

  // ─── 좌측 목록: 서버 페이지네이션(100/page, 문제관리 페이지와 동일 구조) ───
  // 한 페이지(pageQuestions)만 메모리에 둔다. SSR 로 받은 1페이지(questions prop)로
  // 시작하고, 페이지/필터 변경 시 getExamPaperBuilderQuestionsPage 로 다시 받는다.
  const [pageQuestions, setPageQuestions] = useState<BuilderQuestion[]>(
    () => questions,
  );
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [statusCounts, setStatusCounts] = useState(initialStatusCounts);
  const [listLoading, setListLoading] = useState(false);
  // 폴더 드래그 등 "필터는 그대로지만 목록이 바뀐" 경우 강제 재조회용 카운터.
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // 검색 입력 debounce — 키 입력마다 서버를 때리지 않도록 300ms 후 적용.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const questionById = useMemo(() => {
    const map = new Map<string, BuilderQuestion>();
    for (const [id, q] of fetchedQuestions) map.set(id, q);
    for (const question of pageQuestions) map.set(question.id, question);
    return map;
  }, [pageQuestions, fetchedQuestions]);

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

  const [setMemberMap, setSetMemberMap] = useState<Record<string, string>>({});
  useEffect(() => {
    getAcademyQuestionSetMemberMap()
      .then(setSetMemberMap)
      .catch(() => {});
  }, []);

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
    questionSetIdOf: (id) => setMemberMap[id] ?? null,
    // 폴더 배지를 하위 폴더까지 합산한 누적 수치로 표시(중복 제거).
    cumulativeCounts: true,
  });

  // 시험지 관리 페이지와 동일한 폴더 카운트(하위 합산·중복)를 위해, 페이징된
  // 20문항 기반 멤버십 대신 학원 전체 문제 컬렉션·멤버십을 마운트 시 한 번
  // 하이드레이트한다(폴더 탐색은 서버 collectionId 필터라 영향 없음).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cols, membership] = await Promise.all([
          getQuestionCollections(academyId),
          getAcademyQuestionCollectionMembership(academyId),
        ]);
        if (cancelled) return;
        folders.setCollections(cols as unknown as CollectionItem[]);
        const next: Record<string, Set<string>> = {};
        for (const [k, v] of Object.entries(membership ?? {})) {
          next[k] = new Set(v as string[]);
        }
        folders.setMembership(next);
      } catch {
        // 실패 시 페이징 멤버십 폴백 유지(배지가 다소 적게 보일 수 있음)
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyId]);

  // 모바일(<lg)에선 한 페이지에 10개만 보이도록 서버 조회 limit 을 낮춘다(데스크톱은
  // 기존 BUILDER_PAGE_SIZE 그대로 → PC 무변경). 마운트 후 승격되므로 최초 100개 →
  // 10개 재조회가 한 번 일어난다(기존 모바일 페이지네이션 패턴과 동일한 트레이드오프).
  const isMobile = useIsMobile();

  // 현재 필터 상태 → 서버 조회 파라미터. 폴더 활성값은 collectionId 로 서버에 전달한다.
  const buildListFilters = useCallback(
    (targetPage: number): WorkbenchQuestionFilters => ({
      page: targetPage,
      limit: isMobile ? DEFAULT_MOBILE_PAGE_SIZE : BUILDER_PAGE_SIZE,
      sort,
      search: debouncedSearch || undefined,
      difficulty: difficulty === "ALL" ? undefined : difficulty,
      subType: selectedSubTypes.length ? selectedSubTypes.join(",") : undefined,
      starred: starredOnly ? true : undefined,
      approved:
        approvedFilter === "approved"
          ? true
          : approvedFilter === "pending"
            ? false
            : undefined,
      collectionId: folders.activeFolder ?? undefined,
    }),
    [
      isMobile,
      sort,
      debouncedSearch,
      difficulty,
      selectedSubTypes,
      starredOnly,
      approvedFilter,
      folders.activeFolder,
    ],
  );

  // 필터 변경 감지용 시그니처 — 바뀌면 page 를 1 로 리셋한다(현재 페이지가 범위 밖이
  // 되는 것 방지). 페이지 번호 자체는 시그니처에서 제외한다.
  const listFilterSig = useMemo(
    () => JSON.stringify(buildListFilters(0)),
    [buildListFilters],
  );

  // 좌측 목록 서버 조회 — 페이지/필터/강제갱신 변경 시 현재 페이지를 다시 받는다.
  // 최초 마운트는 SSR 1페이지(props)를 그대로 쓰고 재조회하지 않는다.
  const listMountedRef = useRef(false);
  const listSigRef = useRef(listFilterSig);
  useEffect(() => {
    if (!listMountedRef.current) {
      listMountedRef.current = true;
      listSigRef.current = listFilterSig;
      return;
    }
    // 필터가 바뀌었고 1페이지가 아니면, page=1 로 리셋만 하고 다음 렌더에서 조회한다.
    if (listSigRef.current !== listFilterSig && page !== 1) {
      listSigRef.current = listFilterSig;
      setPage(1);
      return;
    }
    listSigRef.current = listFilterSig;
    let cancelled = false;
    setListLoading(true);
    void getExamPaperBuilderQuestionsPage(academyId, buildListFilters(page))
      .then((res) => {
        if (cancelled) return;
        setPageQuestions(res.questions as unknown as BuilderQuestion[]);
        setTotalCount(res.total);
        setTotalPages(res.totalPages);
        setStatusCounts(res.statusCounts);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // listFilterSig 가 필터 변화를 대표하므로 개별 필터 deps 는 생략한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyId, page, listFilterSig, listRefreshKey]);

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

  // 모바일 장바구니 목록 — 담긴 문제를 questionId 기준 1개씩(중복 제거) 담은 표시용 블록.
  const selectedQuestionBlocks = useMemo(() => {
    const seen = new Set<string>();
    return paperItems.filter((item) => {
      if (item.blockType !== "question" || seen.has(item.questionId)) return false;
      seen.add(item.questionId);
      return true;
    });
  }, [paperItems]);

  // 드래그한 문제를 폴더에 담기/이동. 체크된(=시험지에 올라간) 문항 전체가 선택으로
  // 간주되어, 끄는 카드가 그 선택에 포함되면 selectedPaperQuestionIds 전체가 함께
  // 이동한다(useFolderManager.handleDragToFolder 가 selection 포함 여부로 판단).
  // 폴더 이동은 시험지 멤버십과 무관하므로 선택(=시험지 구성)은 그대로 둔다.
  const handleDragQuestionToFolder = useCallback(
    (itemId: string | string[], folderId: string, copy: boolean) => {
      void folders
        .handleDragToFolder(itemId, folderId, copy, selectedPaperQuestionIds)
        // 폴더가 활성 필터면 멤버십 변화가 서버 목록에 반영되도록 재조회한다.
        .finally(() => setListRefreshKey((k) => k + 1));
    },
    [folders, selectedPaperQuestionIds],
  );
  // "전체 문제"로 드래그하면 현재 폴더에서 제거한다(복사 드롭은 무시). 끄는 카드가
  // 선택에 포함되면 선택 전체를, 아니면 그 카드만 폴더에서 뺀다.
  const handleDragQuestionToRoot = useCallback(
    (itemId: string | string[], copy: boolean) => {
      if (copy || !folders.activeFolder) return;
      const dragged = Array.isArray(itemId) ? itemId : [itemId];
      const ids = dragged.some((id) => selectedPaperQuestionIds.has(id))
        ? selectedPaperQuestionIds
        : new Set<string>(dragged);
      void folders
        .handleRemoveFromFolder(ids)
        .finally(() => setListRefreshKey((k) => k + 1));
    },
    [folders, selectedPaperQuestionIds],
  );

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
  const activeQuestionSetId =
    activeItem && activeItem.blockType === "question"
      ? (activeItem.sourceQuestion.setId ?? null)
      : null;

  // 미리보기 블록 클릭 → 좌측 카드 글로우/스크롤. 서버 페이지네이션이라 대상 카드가
  // 다른 페이지에 있을 수 있다. 현재 페이지에 없으면 rank 로 그 문항의 페이지를 계산해
  // 점프한다(점프 후 패널의 기존 scroll-to-active 가 글로우/스크롤을 마무리). 같은 id
  // 로 중복 점프하지 않도록 ref 로 가드한다.
  const lastGlowJumpRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeQuestionId) {
      lastGlowJumpRef.current = null;
      return;
    }
    if (
      pageQuestions.some(
        (q) =>
          q.id === activeQuestionId ||
          (activeQuestionSetId && q.setId === activeQuestionSetId),
      )
    ) {
      return; // 현재 페이지에 있음
    }
    if (lastGlowJumpRef.current === activeQuestionId) return; // 이미 점프 시도함
    lastGlowJumpRef.current = activeQuestionId;
    let cancelled = false;
    void getExamPaperBuilderQuestionPageOf(
      academyId,
      activeQuestionId,
      buildListFilters(1),
    ).then((targetPage) => {
      if (cancelled || !targetPage) return;
      setPage(targetPage);
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeQuestionId,
    activeQuestionSetId,
    pageQuestions,
    academyId,
    buildListFilters,
  ]);

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

  const resolveQuestionsForPaperInsertion = useCallback(
    async (
      ids: Iterable<string>,
      options: { skipExisting: boolean },
    ): Promise<BuilderQuestion[]> => {
      const seen = new Set<string>();
      const orderedIds: string[] = [];
      const missingIds: string[] = [];

      for (const id of ids) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        orderedIds.push(id);
        if (!questionById.has(id)) missingIds.push(id);
      }
      if (orderedIds.length === 0) return [];

      // 로드 상한을 넘었거나 시드된 id 중 목록에 없는 문항은 배치 로드해 병합한다.
      // questionById 는 다음 렌더에 갱신되므로, 이번 호출에선 합쳐진 맵을 직접 만들어 쓴다.
      let resolved = questionById;
      if (missingIds.length > 0) {
        try {
          const fetched = (await getExamPaperBuilderQuestionsByIds(
            academyId,
            missingIds,
          )) as unknown as BuilderQuestion[];
          if (fetched.length > 0) {
            setFetchedQuestions((prev) => {
              const next = new Map(prev);
              for (const q of fetched) next.set(q.id, q);
              return next;
            });
            const merged = new Map(questionById);
            for (const q of fetched) merged.set(q.id, q);
            resolved = merged;
          }
        } catch {
          toast.error("일부 문항을 불러오지 못했습니다.");
        }
      }

      const seedQuestions: BuilderQuestion[] = [];
      for (const id of orderedIds) {
        const question = resolved.get(id);
        if (question) seedQuestions.push(question);
      }
      if (seedQuestions.length === 0) return [];

      const setSeedIds = seedQuestions
        .filter((question) => Boolean(question.setId))
        .map((question) => question.id);
      const setIds = Array.from(
        new Set(
          seedQuestions
            .map((question) => question.setId)
            .filter((setId): setId is string => Boolean(setId)),
        ),
      );
      const setRenderById = new Map<string, BuilderQuestionSetRender>();
      const setMembersBySetId = new Map<string, BuilderQuestion[]>();

      if (setSeedIds.length > 0) {
        try {
          const [members, sets] = await Promise.all([
            getExamPaperBuilderSetMemberQuestionsByQuestionIds(
              academyId,
              setSeedIds,
            ) as Promise<BuilderQuestion[]>,
            getExamPaperBuilderQuestionSetsBySetIds(academyId, setIds),
          ]);
          for (const set of sets) {
            setRenderById.set(set.id, toBuilderQuestionSetRender(set));
          }
          if (members.length > 0) {
            const renderedMembers = members.map((question) =>
              attachSetRender(question, setRenderById),
            );
            setFetchedQuestions((prev) => {
              const next = new Map(prev);
              for (const question of renderedMembers) next.set(question.id, question);
              return next;
            });
            for (const question of renderedMembers) {
              if (!question.setId) continue;
              const bucket = setMembersBySetId.get(question.setId) ?? [];
              bucket.push(question);
              setMembersBySetId.set(question.setId, bucket);
            }
          }
        } catch {
          toast.error("세트 문항 일부를 불러오지 못했습니다.");
        }
      }

      const emittedQuestionIds = new Set<string>();
      const expandedSetIds = new Set<string>();
      const selectedQuestions: BuilderQuestion[] = [];
      const emit = (question: BuilderQuestion) => {
        if (emittedQuestionIds.has(question.id)) return;
        emittedQuestionIds.add(question.id);
        if (options.skipExisting && paperQuestionCounts.has(question.id)) return;
        selectedQuestions.push(attachSetRender(question, setRenderById));
      };

      for (const question of seedQuestions) {
        const setId = question.setId;
        if (setId) {
          if (expandedSetIds.has(setId)) continue;
          expandedSetIds.add(setId);
          const members = setMembersBySetId.get(setId);
          if (members?.length) {
            members.forEach(emit);
            continue;
          }
        }
        emit(question);
      }

      return selectedQuestions;
    },
    [academyId, paperQuestionCounts, questionById],
  );

  const addQuestionIdsToPaper = useCallback(
    async (ids: Iterable<string>) => {
      const selectedQuestions = await resolveQuestionsForPaperInsertion(ids, {
        skipExisting: true,
      });
      if (selectedQuestions.length > 0) {
        addQuestionsAtDropTarget(selectedQuestions, null, "after");
      }
    },
    [addQuestionsAtDropTarget, resolveQuestionsForPaperInsertion],
  );

  const removeQuestionIdFromPaper = useCallback((id: string) => {
    const sourceQuestion =
      questionById.get(id) ??
      paperItems.find(
        (item) => item.blockType === "question" && item.questionId === id,
      )?.sourceQuestion;
    const setId = sourceQuestion?.setId || null;
    const targets = paperItems.filter(
      (item) =>
        item.blockType === "question" &&
        (setId ? item.sourceQuestion.setId === setId : item.questionId === id),
    );
    for (const item of targets) removeItem(item.localId);
  }, [paperItems, questionById, removeItem]);

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
        void addQuestionIdsToPaper(
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
    void addQuestionIdsToPaper([id]);
  }, [addQuestionIdsToPaper, removeQuestionIdFromPaper, selectedPaperQuestionIds]);

  const applyPaperQuestionSelection = useCallback((nextSelectedIds: Set<string>) => {
    const toRemove = Array.from(selectedPaperQuestionIds).filter(
      (id) => !nextSelectedIds.has(id),
    );
    const toAdd = Array.from(nextSelectedIds).filter(
      (id) => !selectedPaperQuestionIds.has(id),
    );

    for (const id of toRemove) removeQuestionIdFromPaper(id);
    void addQuestionIdsToPaper(toAdd);
  }, [addQuestionIdsToPaper, removeQuestionIdFromPaper, selectedPaperQuestionIds]);

  // 전체 선택(페이지 경계 무관) — 현재 필터에 매칭되는 모든 문항 ID 를 서버에서 받아
  // 시험지에 일괄 추가/제거한다. 선택 = 시험지 구성이므로 곧바로 미리보기에 반영된다.
  // 수천 개를 한 번에 담으면 풀 데이터 로드(addQuestionIdsToPaper)가 무거우므로,
  // 진행 토스트로 사용자에게 알린다.
  const [selectAllPending, setSelectAllPending] = useState(false);
  const handleToggleSelectAllFiltered = useCallback(async () => {
    if (selectAllPending) return;
    setSelectAllPending(true);
    try {
      const ids = await getExamPaperBuilderQuestionIds(
        academyId,
        buildListFilters(1),
      );
      if (ids.length === 0) return;
      const allSelected = ids.every((id) => selectedPaperQuestionIds.has(id));
      const next = new Set(selectedPaperQuestionIds);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
        if (ids.length > 300) {
          toast.message(`${ids.length}개 문항을 시험지에 담는 중…`);
        }
      }
      applyPaperQuestionSelection(next);
    } catch {
      toast.error("전체 선택을 처리하지 못했습니다.");
    } finally {
      setSelectAllPending(false);
    }
  }, [
    selectAllPending,
    academyId,
    buildListFilters,
    selectedPaperQuestionIds,
    applyPaperQuestionSelection,
  ]);

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

  // 목록 필터링·정렬·페이지네이션·검수상태 개수는 모두 서버가 수행한다
  // (getExamPaperBuilderQuestionsPage). pageQuestions 가 곧 "현재 페이지의 결과",
  // statusCounts 는 서버 집계값이다.

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
  // 해설 포함 PDF 인쇄 중에만 true — 켜지면 각 문항 뒤에 인라인 정답·해설을 페이지네이션/
  // 렌더에 포함하고(아래 includeAnswers), 맨 뒤 정답표는 빼며(DOCX 해설과 동일), 인쇄가
  // 끝나면 afterprint 에서 다시 끈다. 평소 편집 미리보기에는 영향이 없다.
  const [explanationPrint, setExplanationPrint] = useState(false);
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
      includeAnswers: explanationPrint,
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
      explanationPrint,
    ],
  );
  const paginationResult = useMemo(
    () => paginateGroups(paperGroups, paginationSettings),
    [paperGroups, paginationSettings],
  );
  const paperPages = paginationResult.pages;
  const overflowItemIds = paginationResult.overflowItems;
  // 시험지 맨 뒤 정답표 페이지(들). PDF(=미리보기 인쇄)에 정답지가 빠지지 않도록
  // 미리보기 DOM 의 마지막 페이지로 렌더한다. 문항이 없으면 pages 가 비어 안 그려진다.
  // 해설 포함 PDF(인라인)일 때는 맨 뒤 정답표를 빼고(DOCX 해설과 동일), 평소 문제만
  // 미리보기/PDF 에는 정답표를 붙인다.
  const answerKey = useMemo(
    () =>
      explanationPrint
        ? EMPTY_ANSWER_KEY_LAYOUT
        : buildAnswerKeyLayout(paperItems, { paperSize, density }),
    [paperItems, paperSize, density, explanationPrint],
  );
  // 표지(cover.enabled)는 본문 페이지 앞에 한 장 더 렌더되므로, scale 컨테이너의
  // 높이를 예약하는 zoom-spacer 높이에 표지 한 장 + 간격을 더해야 스크롤이 잘리지 않는다.
  const singlePageHeight =
    previewBaseWidth * PAPER_SIZE_SPECS[paperSize].heightRatio;
  const renderedPageCount =
    paperPages.length + (cover.enabled ? 1 : 0) + answerKey.pages.length;
  const previewContentHeight =
    renderedPageCount > 0
      ? renderedPageCount * singlePageHeight +
        (renderedPageCount - 1) * PREVIEW_PAGE_GAP
      : 0;

  // ─── 미리보기 가상화 보조 ───
  // 페이지를 지연 마운트(preview-pages.tsx)하면 화면 밖 페이지의 카드/캐럿은 DOM 에
  // 없어 querySelector 로 못 찾는다. 그 경우를 위해 항목 localId → 페이지 인덱스 맵을
  // 만들어, 대상이 아직 마운트되지 않았을 때 페이지 높이로 스크롤 위치를 정확히 추정한다
  // (모든 페이지 높이가 singlePageHeight 로 균일하므로 추정이 정확하다).
  const itemPageIndex = useMemo(() => {
    const map = new Map<string, number>();
    paperPages.forEach((columns, pageIndex) => {
      for (const column of columns) {
        for (const fragment of column) {
          for (const part of fragment.parts) {
            const localId = part.source?.localId;
            if (localId && !map.has(localId)) map.set(localId, pageIndex);
          }
        }
      }
    });
    return map;
  }, [paperPages]);

  const scrollPreviewToItem = useCallback(
    (localId: string, topMargin: number) => {
      const scroller = previewScrollerRef.current;
      if (!scroller) return;
      // 1) 이미 마운트돼 DOM 에 있으면 그 요소 기준으로 정확히 스크롤.
      const target = scroller.querySelector<HTMLElement>(
        `[data-paper-item-id="${CSS.escape(localId)}"], [data-line-gap-anchor="${CSS.escape(localId)}"]`,
      );
      if (target) {
        const scrollerRect = scroller.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const fullyVisible =
          targetRect.top >= scrollerRect.top + 8 &&
          targetRect.bottom <= scrollerRect.bottom - 8;
        if (!fullyVisible) {
          scroller.scrollTo({
            top:
              scroller.scrollTop +
              targetRect.top -
              scrollerRect.top -
              topMargin,
            behavior: "smooth",
          });
        }
        return;
      }
      // 2) 아직 지연 마운트 전이면 페이지 인덱스로 위치를 추정해 스크롤(→ 마운트 유발).
      const pageIndex = itemPageIndex.get(localId);
      if (pageIndex == null) return;
      const coverOffset = cover.enabled ? singlePageHeight + PREVIEW_PAGE_GAP : 0;
      const estimatedTop =
        (coverOffset + pageIndex * (singlePageHeight + PREVIEW_PAGE_GAP)) *
        previewZoom;
      scroller.scrollTo({
        top: Math.max(0, estimatedTop - topMargin),
        behavior: "smooth",
      });
    },
    [
      cover.enabled,
      itemPageIndex,
      previewScrollerRef,
      previewZoom,
      singlePageHeight,
    ],
  );

  // 빈 줄이 칸/페이지를 넘어가면 캐럿이 다음 쪽으로 이동하므로, 화면 밖으로 나간 경우
  // 미리보기를 캐럿(빈 줄 자리)이 보이도록 따라 스크롤한다(워드프로세서처럼 시야가 따라감).
  useEffect(() => {
    const anchor = lineCaret?.afterLocalId;
    if (!anchor) return;
    const raf = window.requestAnimationFrame(() => {
      scrollPreviewToItem(anchor, previewScrollerRef.current
        ? previewScrollerRef.current.getBoundingClientRect().height / 2
        : 0);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [lineCaret, previewScrollerRef, scrollPreviewToItem]);

  // 블록 삽입 직후: 새 블록(특히 다음 쪽으로 넘어간 이미지)이 화면 밖이면 그 위치까지
  // 부드럽게 스크롤해 사용자에게 보여준다. paperItems 변경(삽입→재배치) 후 DOM 이 갱신된
  // 뒤 RAF 로 스크롤한다(타이밍 안전). 이미 보이면 그대로 둔다.
  useEffect(() => {
    if (!pendingScrollItemId) return;
    const raf = window.requestAnimationFrame(() => {
      scrollPreviewToItem(pendingScrollItemId, 72);
      setPendingScrollItemId(null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pendingScrollItemId, paperItems, previewScrollerRef, scrollPreviewToItem]);
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

        const input = location.current.input;
        const insertion = getQuestionDropInsertion(
          element,
          input.clientX,
          input.clientY,
        );
        void resolveQuestionsForPaperInsertion(draggedIds, {
          skipExisting: false,
        }).then((dropped) => {
          if (dropped.length === 0) {
            toast.error("문제를 찾지 못했습니다.");
            return;
          }
          addQuestionsAtDropTarget(
            dropped,
            insertion.targetLocalId,
            insertion.placement,
          );
        });
      },
    });
  }, [addQuestionsAtDropTarget, previewScrollerRef, resolveQuestionsForPaperInsertion]);

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

  // 해설 포함 PDF: 인라인 정답·해설을 켜고(재페이지네이션) 레이아웃이 적용된 다음 인쇄한다.
  function handlePrintWithAnswers() {
    if (paperItems.length === 0) {
      toast.error("인쇄할 문제를 먼저 선택해주세요.");
      return;
    }
    if (savedExamId) {
      void incrementExamPrintCount(savedExamId);
    }
    setExplanationPrint(true);
  }

  useEffect(() => {
    if (!explanationPrint) return;
    // 해설 포함 재페이지네이션 + 전 페이지 강제 마운트가 레이아웃까지 반영된 뒤 인쇄한다
    // (rAF 로 한 프레임 양보 후 약간의 지연 — 페이지 수가 많아도 빈 인쇄가 없게).
    let timer = 0;
    const raf = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => window.print(), 120);
    });
    // 인쇄 종료(또는 취소) 후 인라인 해설 모드를 해제해 편집 미리보기를 원래대로 되돌린다.
    const handleAfterPrint = () => setExplanationPrint(false);
    window.addEventListener("afterprint", handleAfterPrint, { once: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [explanationPrint]);

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
        // 모바일: 상단 앱바(sticky h-14=3.5rem)만큼 뺀 높이로 맞추고 -m-4 로 main 의
        // p-4 를 상쇄해 풀블리드로. → 셸이 뷰포트를 넘치지 않아 페이지 스크롤이 사라지고
        // 하단 shrink-0 푸터(장바구니/다음 버튼)가 화면 바닥에 고정된다.
        // 데스크톱(md:)은 기존 -m-6 / h-[100dvh] 그대로.
        "relative -m-4 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden md:-m-6 md:h-[100dvh]",
        // 기존 시험지 '수정' 모드는 새로 만드는 화면과 헷갈리지 않도록 배경을
        // 살짝 어둡게 한다 (미리보기 종이 자체는 흰색 그대로).
        isEditingExistingExam ? "bg-slate-200" : "bg-[#F4F6F9]",
      )}
    >
      <div
        aria-hidden={!headerVisible}
        className={cn(
          // 모바일(<lg)에선 자동 숨김 헤더를 아예 렌더하지 않는다 — 잠깐 보였다 사라지는
          // 플래시 방지 + 상단 앱바와 중복 제거. 데스크톱(lg 이상)만 노출(자동 숨김 동작 유지).
          "no-print hidden shrink-0 overflow-hidden border-b bg-white px-5 transition-[max-height,padding,opacity,transform,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block",
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
          // 모바일(<lg)에선 '헤더 보기' 삼각형을 숨긴다 — 터치엔 mousemove 자동숨김이
          // 무의미하고 상단 앱바와 중복이라 불필요. 데스크톱(lg 이상)은 그대로 노출.
          "no-print hidden lg:block absolute left-0 top-0 z-40 h-4 w-4 bg-slate-900/10 shadow-[2px_2px_8px_rgba(15,23,42,0.12)] backdrop-blur-sm transition-[opacity,transform,background-color] duration-300 ease-out [clip-path:polygon(0_0,100%_0,0_100%)] hover:bg-blue-500/20 focus:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-200",
          headerVisible
            ? "pointer-events-none -translate-x-1 -translate-y-1 opacity-0"
            : "translate-x-0 translate-y-0 opacity-100",
        )}
      />
      {/* 모바일 전용 진행 스텝 — 문제 생성 페이지와 동일한 공용 스텝 헤더(번호 원형+연결선).
          선택 개수는 아래 하단 고정 '담긴 문제' 장바구니가 대신 보여준다. */}
      <div className="no-print shrink-0 border-b border-slate-200 bg-white px-2 py-2 lg:hidden">
        <MobileStepHeader
          steps={[
            { key: "select", label: "문제 선택" },
            { key: "preview", label: "미리보기 · 저장" },
          ]}
          currentKey={mobileStep}
          onSelect={(key) => {
            setMobileStep(key as "select" | "preview");
            setCartOpen(false);
            window.scrollTo({ top: 0 });
          }}
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
          <div
            className={cn(
              "overflow-hidden lg:contents",
              mobileStep === "select" ? "grid h-full" : "hidden",
            )}
          >
          <QuestionLibraryPanel
            academyId={academyId}
            filteredQuestions={pageQuestions}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            listLoading={listLoading}
            selectAllPending={selectAllPending}
            onToggleSelectAllFiltered={handleToggleSelectAllFiltered}
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
            totalQuestionCount={totalCount}
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
          </div>
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
            "min-w-0 flex-col overflow-hidden lg:flex lg:h-auto",
            mobileStep === "preview" ? "flex h-full" : "hidden",
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
            onDownloadPdfWithAnswers={handlePrintWithAnswers}
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
                  singlePageHeight={singlePageHeight}
                  answerKey={answerKey}
                  forceMountAll={explanationPrint}
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

      {/* ── 모바일 전용 하단 고정 바 (셸 shrink-0 푸터, lg:hidden) ──
          문제 선택 단계: '담긴 문제' 장바구니(펼치면 목록·빼기) + 다음 단계 버튼.
          미리보기 단계: 이전(문제 선택)으로 돌아가는 버튼. 데스크톱은 전부 숨김. */}
      <div className="no-print shrink-0 lg:hidden">
        {mobileStep === "select" ? (
          <>
            {cartOpen && selectedQuestionBlocks.length > 0 ? (
              <div className="flex max-h-[40vh] min-h-0 flex-col border-t border-slate-100 bg-slate-50/70">
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {selectedQuestionBlocks.map((item, i) => (
                    <div
                      key={item.localId}
                      className="mb-1.5 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
                    >
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="line-clamp-2 min-w-0 flex-1 text-[12px] font-medium leading-relaxed text-slate-700">
                        {item.questionText?.trim() ||
                          item.passageTitle?.trim() ||
                          "문제"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeQuestionIdFromPaper(item.questionId)}
                        aria-label="시험지에서 빼기"
                        className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setCartOpen((open) => !open)}
              aria-expanded={cartOpen}
              aria-label={cartOpen ? "담긴 문제 목록 접기" : "담긴 문제 목록 펼치기"}
              className="flex w-full shrink-0 items-center gap-2.5 border-t border-slate-100 bg-white px-3 py-2 text-left"
            >
              <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ShoppingBasket className="size-5" aria-hidden="true" />
                {selectedQuestionBlocks.length > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
                    {selectedQuestionBlocks.length}
                  </span>
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12.5px] font-bold text-slate-900">
                  담긴 문제 {selectedQuestionBlocks.length}개
                </span>
                <span className="truncate text-[10.5px] text-slate-400">
                  {selectedQuestionBlocks.length > 0
                    ? "탭하여 담긴 문제 보기·빼기"
                    : "문제를 눌러 시험지에 담아보세요"}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-slate-400 transition-transform",
                  cartOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            <div className="shrink-0 border-t border-slate-100 bg-white p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                aria-disabled={selectedQuestionBlocks.length === 0}
                onClick={() => {
                  if (selectedQuestionBlocks.length === 0) return;
                  setCartOpen(false);
                  // 로드/추가 시 자동 활성화된 블록이 남아 있으면 미리보기 진입 즉시
                  // 컨텍스트 바가 떠 버린다 — 탭하기 전엔 선택 없음으로 시작.
                  setActiveItemId(null);
                  setMobileStep("preview");
                  window.scrollTo({ top: 0 });
                }}
                className={cn(
                  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border text-[14px] font-extrabold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                  selectedQuestionBlocks.length === 0
                    ? "cursor-not-allowed border-blue-200 bg-blue-300"
                    : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700",
                )}
              >
                <CirclePlay className="size-5" aria-hidden="true" />
                다음으로 (미리보기 · 저장)
              </button>
            </div>
          </>
        ) : mobileSelectedItem ? (
          // 미리보기에서 블록을 탭하면 '이전' 버튼 자리에 블록 컨텍스트 바가 나타난다.
          // (좌측 액션 레일·인라인 편집은 모바일에서 비활성 — 이 바가 유일한 편집 경로)
          <MobileBlockActionBar
            item={mobileSelectedItem}
            canMoveUp={mobileSelectedIndex > 0}
            canMoveDown={
              mobileSelectedIndex >= 0 &&
              mobileSelectedIndex < paperItems.length - 1
            }
            onMoveUp={() => moveActiveItem(-1)}
            onMoveDown={() => moveActiveItem(1)}
            onUpdateItem={updateItem}
            onUngroupItem={ungroupItem}
            onRegroupByPassage={regroupByPassage}
            onRemoveItem={(localId) => {
              removeItem(localId);
              // removeItem 은 남은 첫 블록을 활성화하므로(PC 편집 패널용), 모바일에선
              // 선택을 풀어 컨텍스트 바가 다른 블록으로 튀지 않게 한다.
              setActiveItemId(null);
            }}
            onEditContent={() => setMobileEditOpen(true)}
            onClose={() => setActiveItemId(null)}
          />
        ) : (
          <div className="shrink-0 border-t border-slate-200 bg-white p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                setMobileStep("select");
                window.scrollTo({ top: 0 });
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-[13.5px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              이전 (문제 선택)
            </button>
          </div>
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

      {mobileEditOpen && mobileSelectedItem && (
        <MobileBlockEditSheet
          // key: 다른 블록을 이어서 수정할 때 시트 내부 draft 가 초기화되도록.
          key={mobileSelectedItem.localId}
          item={mobileSelectedItem}
          onCommit={(patch) => updateItem(mobileSelectedItem.localId, patch)}
          onClose={() => setMobileEditOpen(false)}
        />
      )}

      {detailQuestion && (
        <QuestionDetailModal
          // 해설은 마운트 후 백그라운드 병합되므로, 열려 있는 동안에도 최신(해설 포함)
          // 버전을 questionById 에서 끌어와 도착 즉시 모달에 반영한다.
          question={questionById.get(detailQuestion.id) ?? detailQuestion}
          onClose={() => setDetailQuestion(null)}
        />
      )}

      <PrintStyles paperSize={paperSize} />
    </div>
  );
}
