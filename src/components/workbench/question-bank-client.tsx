// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GenerateQuestionsDialog } from "./generate-questions-dialog";
import {
  Database,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Rows3,
  FileText,
  FolderX,
  Loader2,
  Trash2,
} from "lucide-react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { PassageGroupedView } from "./question-bank-passage-view";
import { QuestionSetSection } from "./question-set-section";
import { toast } from "sonner";
import {
  deleteWorkbenchQuestion,
  bulkDeleteWorkbenchQuestions,
  bulkApproveWorkbenchQuestions,
  getWorkbenchQuestion,
  getWorkbenchQuestionIds,
  approveWorkbenchQuestion,
  unapproveWorkbenchQuestion,
  toggleQuestionStar,
  createQuestionCollection,
  addQuestionsToCollection,
  removeQuestionsFromCollection,
  deleteQuestionCollection,
  updateQuestionCollection,
} from "@/actions/workbench";
import { createExam } from "@/actions/exams";
import { confirmNative } from "@/lib/browser-confirm";

// Shared modules
import type { CollectionItem } from "./shared/types";
import { Pagination } from "./shared/pagination";
import { FolderSection } from "./shared/folder-section";
import { MoveOrCopyFolderPicker } from "./shared/move-or-copy-folder-picker";
import { QuestionCard } from "./question-card";
import { QuestionBankCard } from "./question-bank-card";
import { DragSelect } from "@/components/ui/drag-select";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { AssignQuestionsAction } from "./question-bank-client/assign-questions-action";
import { CreateExamDialog } from "./question-bank-client/create-exam-dialog";
import { EditQuestionDialog } from "./question-bank-client/edit-question-dialog";
import { GridToggle } from "./question-bank-client/grid-toggle";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import { QuestionDetailDialog } from "./question-bank-client/question-detail-dialog";
import {
  SimilarQuestionAnalysisModal,
  type QAnalysis,
} from "@/app/(director)/director/workbench/questions/similar/similar-question-analysis-modal";

// 동형 문제 생성물이면 원본 문항 분석(structuredData._similarSourceAnalysis)을 추출.
// 일반 문항은 null → '분석 정보' 버튼이 렌더되지 않는다(동형 한정).
function getSimilarSourceAnalysis(q: {
  structuredData?: unknown;
}): QAnalysis | null {
  let sd: unknown = q?.structuredData;
  if (typeof sd === "string") {
    try {
      sd = JSON.parse(sd);
    } catch {
      return null;
    }
  }
  if (
    sd &&
    typeof sd === "object" &&
    (sd as Record<string, unknown>)._similarSourceAnalysis
  ) {
    return (sd as Record<string, unknown>)._similarSourceAnalysis as QAnalysis;
  }
  return null;
}
import { QuestionFiltersToolbar } from "./question-bank-client/filters-toolbar";
import { useQuestionEditor } from "./question-bank-client/use-question-editor";

// Hooks
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useSelection } from "@/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { getAcademyQuestionSetMemberMap } from "@/actions/question-sets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const QUESTION_BANK_PATH = "/director/workbench/questions";

interface QuestionItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  structuredData?: unknown;
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date;
  passage: {
    id: string;
    title: string;
    content: string;
    grade?: number | null;
    semester?: string | null;
    publisher?: string | null;
    school?: { id: string; name: string } | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count: { examLinks: number };
  examLinks?: { exam: { id: string; title: string } }[];
}

interface GroupedPassage {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  school: { id: string; name: string } | null;
  analysis: { id: string; updatedAt: Date } | null;
  totalQuestionCount: number;
  questions: QuestionItem[];
}

interface QuestionBankProps {
  academyId: string;
  /**
   * 과목 스코프 — "KOREAN" 이면 국어 문제 은행(/director/korean/questions):
   * KO_* 문항만 노출, 유형 필터는 국어 그룹, URL 내비게이션도 국어 라우트 유지.
   * 미전달 = 영어 기본(KO_* 문항 완전 배제, 기존 UX 픽셀 동일).
   */
  subjectScope?: "KOREAN";
  view: "flat" | "passage";
  questionsData: {
    questions: QuestionItem[];
    setIds?: string[];
    total: number;
    page: number;
    totalPages: number;
  } | null;
  groupedData: {
    passages: GroupedPassage[];
    total: number;
    page: number;
    totalPages: number;
  } | null;
  statusCounts?: { all: number; pending: number; approved: number };
  filters: {
    page: number;
    type?: string;
    subType?: string;
    difficulty?: string;
    collectionId?: string;
    aiGenerated?: boolean;
    approved?: boolean;
    starred?: boolean;
    sort?: string;
    search?: string;
    /** 서버 페치와 동일한 과목 스코프 — 국어 라우트 페이지가 "KOREAN" 을 싣는다. */
    subject?: "KOREAN";
  };
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
}

// ---------------------------------------------------------------------------
// Helpers (shared chrome with passage-list-client)
// ---------------------------------------------------------------------------

function useMeasuredHeight(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setHeight(Math.ceil(el.getBoundingClientRect().height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return [ref, height] as const;
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  title,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
  title: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function QuestionBankClient({
  academyId,
  subjectScope,
  view,
  questionsData,
  groupedData,
  statusCounts,
  filters,
  collections: initialCollections,
  collectionMembership: initialMembership,
}: QuestionBankProps) {
  const isGrouped = view === "passage";
  const router = useRouter();
  // URL 내비게이션 베이스 — 국어 문제 은행은 국어 라우트에 머문다(필터/페이지
  // 이동이 영어 문제 은행으로 튕기지 않도록). 미전달 = 기존 영어 경로 그대로.
  const bankPath =
    subjectScope === "KOREAN"
      ? "/director/korean/questions"
      : QUESTION_BANK_PATH;
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  // 동형 생성물 카드의 '분석 정보' 모달(동형 한정).
  const [sourceAnalysis, setSourceAnalysis] = useState<QAnalysis | null>(null);

  // URL filters
  const {
    updateFilter,
    updateFilters,
    handleSearch: urlSearch,
    goToPage,
    isPending: isNavPending,
  } = useUrlFilters(bankPath);

  function handleSearch(value?: string) {
    // X 버튼은 빈 값을 명시적으로 넘긴다(상태 갱신은 비동기라 stale 방지).
    urlSearch(value !== undefined ? value : searchValue);
  }

  // Folder manager — 폴더 생성만 과목 스코프를 실어 감싼다(국어 문제 은행에서
  // 만든 폴더는 subject='KOREAN' 저장 → 영어 폴더 목록과 완전 분리). 영어
  // 기본 경로는 subject 미전달 = 기존 INSERT 그대로(무회귀).
  const [setCount, setSetCount] = useState<number | null>(null);
  const [setMemberMap, setSetMemberMap] = useState<Record<string, string>>({});
  useEffect(() => {
    getAcademyQuestionSetMemberMap()
      .then(setSetMemberMap)
      .catch(() => {});
  }, []);

  const folders = useFolderManager({
    initialCollections,
    initialMembership,
    actions: {
      createCollection: (data) =>
        createQuestionCollection(
          subjectScope === "KOREAN"
            ? { ...data, subject: "KOREAN" as const }
            : data,
        ),
      updateCollection: updateQuestionCollection,
      deleteCollection: deleteQuestionCollection,
      addToCollection: addQuestionsToCollection,
      removeFromCollection: removeQuestionsFromCollection,
    },
    itemLabel: "문제",
    questionSetIdOf: (id) => setMemberMap[id] ?? null,
    // 폴더 배지를 하위 폴더까지 합산한 누적 수치로 표시(중복 제거). 세트 멤버는
    // questionSetIdOf 로 한 세트를 1개로 접어, 실제 카드 단위와 배지를 맞춘다.
    cumulativeCounts: true,
  });

  // Grid view mode
  const [gridCols, setGridCols] = usePersistedState<2 | 3 | "list">(
    "smoat:view-mode:question-bank",
    2,
    (v): v is 2 | 3 | "list" => v === 2 || v === 3 || v === "list",
  );
  const viewSize: "lg" | "md" | "sm" = gridCols === 3 ? "md" : "lg";

  // Optimistically hide deleted questions until router.refresh() reaches the
  // page. Declared up here because the displayed-questions useMemo below
  // depends on it.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // Smooth loading feedback for in-page navigations (entering a folder, the
  // review-status filter, pagination). Debounced ~150ms so only genuinely slow
  // loads surface a spinner — fast navigations swap content with no flash, and
  // the misleading "empty folder" frame never shows mid-transition.
  const [showNavLoading, setShowNavLoading] = useState(false);
  useEffect(() => {
    if (!isNavPending) {
      setShowNavLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setShowNavLoading(true), 150);
    return () => window.clearTimeout(timer);
  }, [isNavPending]);

  // Folder selection is server-driven via the `collectionId` URL param in BOTH
  // flat and grouped modes. Keep the active-folder UI state in sync with the URL
  // so deep links, refresh(), and browser back/forward all resolve to the same
  // folder the server is querying.
  useEffect(() => {
    const target = filters.collectionId ?? null;
    if (target !== folders.activeFolder) {
      folders.setActiveFolder(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.collectionId]);

  // Flattened list of question objects currently being displayed.
  // In flat mode: questionsData.questions is already scoped to the active folder
  // by the server (via the `collectionId` URL param); the client-side membership
  // intersection below is only an OPTIMISTIC mask so drag-out / move removals
  // disappear instantly without waiting for a server round-trip.
  // In grouped mode: every question across all visible passages (server-filtered).
  const rawFlatQuestions = questionsData?.questions ?? [];
  const flatQuestions = useMemo(
    () =>
      removedIds.size === 0
        ? rawFlatQuestions
        : rawFlatQuestions.filter((q) => !removedIds.has(q.id)),
    [rawFlatQuestions, removedIds],
  );
  const questionsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return flatQuestions;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return flatQuestions.filter((q) => ids.has(q.id));
  }, [flatQuestions, folders.activeFolder, folders.membership]);

  const rawGroupedPassages = groupedData?.passages ?? [];
  const groupedPassages = useMemo(() => {
    if (removedIds.size === 0) return rawGroupedPassages;
    return (
      rawGroupedPassages
        .map((p) => ({
          ...p,
          questions: p.questions.filter((q) => !removedIds.has(q.id)),
        }))
        // Hide passages whose questions are all removed so the grouped grid
        // doesn't render empty cards.
        .filter((p) => p.questions.length > 0)
    );
  }, [rawGroupedPassages, removedIds]);
  const [activePassageContext, setActivePassageContext] = useState<{
    id: string;
    title: string;
    visibleCount: number;
    totalQuestionCount: number;
    hasAnalysis: boolean;
    isOpen: boolean;
  } | null>(null);
  const [expandedPassageIds, setExpandedPassageIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!isGrouped) {
      setActivePassageContext(null);
      return;
    }
    if (
      activePassageContext &&
      !groupedPassages.some((passage) => passage.id === activePassageContext.id)
    ) {
      setActivePassageContext(null);
    }
  }, [activePassageContext, groupedPassages, isGrouped]);

  const displayedQuestions = isGrouped
    ? groupedPassages.flatMap((p) => p.questions)
    : folders.activeFolder === null
      ? flatQuestions
      : questionsInActiveFolder;
  const pageSetIds = questionsData?.setIds ?? [];

  // Selection
  const displayedQuestionIds = useMemo(
    () => displayedQuestions.map((q) => q.id),
    [displayedQuestions],
  );
  const getDisplayedIds = useCallback(
    () => displayedQuestionIds,
    [displayedQuestionIds],
  );
  const { selectedIds, setSelectedIds, toggleSelect, clearSelection } =
    useSelection(getDisplayedIds);
  // Exam dialog
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  // Bulk delete
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Bulk approve (검수완료)
  const [bulkApproving, setBulkApproving] = useState(false);
  const [selectingAllPages, setSelectingAllPages] = useState(false);

  // Stats
  const totalCount = isGrouped
    ? (groupedData?.total ?? 0)
    : (questionsData?.total ?? 0);
  const currentPage = isGrouped
    ? (groupedData?.page ?? 1)
    : (questionsData?.page ?? 1);
  const totalPages = isGrouped
    ? (groupedData?.totalPages ?? 1)
    : (questionsData?.totalPages ?? 1);

  const handleSelectAllPages = useCallback(async () => {
    if (selectingAllPages) return;

    setSelectingAllPages(true);
    try {
      const effectiveFilters = {
        ...filters,
        page: undefined,
        limit: undefined,
        collectionId: folders.activeFolder ?? filters.collectionId,
        // 목록(서버 페치)과 동일한 과목 스코프로 전체 선택 population 을 맞춘다.
        ...(subjectScope === "KOREAN" ? { subject: "KOREAN" as const } : {}),
      };
      const result = await getWorkbenchQuestionIds(
        academyId,
        effectiveFilters,
        {
          passageOnly: isGrouped,
        },
      );

      if (!result.success) {
        toast.error(result.error || "전체 문제 선택에 실패했습니다.");
        return;
      }

      const ids = result.ids.filter((id) => !removedIds.has(id));
      if (ids.length === 0) {
        toast.error("선택할 문제가 없습니다.");
        return;
      }

      setSelectedIds(new Set(ids));
      toast.success(`${ids.length}문항을 전체 페이지에서 선택했습니다.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "전체 문제 선택에 실패했습니다.",
      );
    } finally {
      setSelectingAllPages(false);
    }
  }, [
    academyId,
    filters,
    folders.activeFolder,
    isGrouped,
    removedIds,
    selectingAllPages,
    setSelectedIds,
    subjectScope,
  ]);

  // 헤더 체크박스 = "전체 페이지 선택". 현재 페이지만이 아니라 현재 폴더/필터의 전체
  // 문항(getWorkbenchQuestionIds)을 선택한다 → 하위 폴더 안에서도 전체 선택→이동 가능.
  // 이미 전체가 선택돼 있으면 해제한다.
  const allFilteredSelected =
    totalCount > 0 && selectedIds.size >= totalCount;
  const someSelected = selectedIds.size > 0 && !allFilteredSelected;
  const handleToggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      clearSelection();
      return;
    }
    void handleSelectAllPages();
  }, [allFilteredSelected, clearSelection, handleSelectAllPages]);

  const editor = useQuestionEditor((id) => {
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
  });
  const detailLoadTokenRef = useRef(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  // 방금 상세를 열어본 문제 id — 모달을 닫아도 유지해, 닫는 순간 카드를 한 번 반짝인다.
  const [lastViewedQuestionId, setLastViewedQuestionId] = useState<
    string | null
  >(null);
  const [detailQuestion, setDetailQuestion] = useState<Awaited<
    ReturnType<typeof getWorkbenchQuestion>
  > | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);

  const openDetail = useCallback(async (id: string) => {
    const token = detailLoadTokenRef.current + 1;
    detailLoadTokenRef.current = token;
    setDetailOpen(true);
    setDetailQuestionId(id);
    setLastViewedQuestionId(id);
    setDetailQuestion(null);
    setDetailLoadError(null);
    setDetailLoading(true);

    try {
      const question = await getWorkbenchQuestion(id);
      if (detailLoadTokenRef.current !== token) return;
      if (!question) {
        setDetailLoadError("문제를 찾을 수 없습니다.");
        toast.error("문제를 찾을 수 없습니다.");
        return;
      }
      setDetailQuestion(question);
    } catch {
      if (detailLoadTokenRef.current !== token) return;
      setDetailLoadError("문제를 불러오는 중 오류가 발생했습니다.");
      toast.error("문제를 불러오지 못했습니다.");
    } finally {
      if (detailLoadTokenRef.current === token) setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    detailLoadTokenRef.current += 1;
    setDetailOpen(false);
    setDetailQuestionId(null);
    setDetailQuestion(null);
    setDetailLoadError(null);
    setDetailLoading(false);
  }, []);

  // 상세 → 수정 진입 여부. true 일 때만 수정 모달에 '뒤로' 버튼을 노출한다.
  const [editorCameFromDetail, setEditorCameFromDetail] = useState(false);

  // 상세 보기 우측 상단 '문제 수정' → 상세를 닫고 수정 모달을 연다.
  const openEditorFromDetail = useCallback(
    (id: string) => {
      closeDetail();
      setEditorCameFromDetail(true);
      editor.openEditor(id);
    },
    [closeDetail, editor],
  );

  // 수정 모달 '뒤로' → 수정을 닫고 같은 문제의 상세로 복귀한다.
  const backToDetail = useCallback(() => {
    const id = editor.editingQuestionId;
    setEditorCameFromDetail(false);
    editor.closeEditor();
    if (id) void openDetail(id);
  }, [editor, openDetail]);

  // ─── Question Actions ───
  async function handleDelete(id: string) {
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    const result = await deleteWorkbenchQuestion(id);
    if (result.success) {
      toast.success("삭제됨");
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
      if (detailQuestionId === id) closeDetail();
      router.refresh();
    } else {
      toast.error(result.error || "삭제 실패");
    }
  }

  async function handleApprove(id: string) {
    const result = await approveWorkbenchQuestion(id);
    if (result.success) {
      toast.success("검수완료");
      setDetailQuestion((prev) =>
        prev && prev.id === id ? { ...prev, approved: true } : prev,
      );
      router.refresh();
    } else {
      toast.error(result.error || "승인 실패");
    }
  }

  async function handleUnapprove(id: string) {
    const result = await unapproveWorkbenchQuestion(id);
    if (result.success) {
      toast.success("검수 취소됨");
      setDetailQuestion((prev) =>
        prev && prev.id === id ? { ...prev, approved: false } : prev,
      );
      router.refresh();
    } else {
      toast.error(result.error || "검수 취소 실패");
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkApproving) return;
    setBulkApproving(true);
    try {
      const result = await bulkApproveWorkbenchQuestions(ids);
      if (!result.success) {
        toast.error(result.error || "검수 처리에 실패했습니다.");
        return;
      }
      toast.success(`${result.approved}문항을 검수완료 처리했습니다.`);
      clearSelection();
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "검수 처리에 실패했습니다.",
      );
    } finally {
      setBulkApproving(false);
    }
  }

  async function handleToggleStar(id: string) {
    const result = await toggleQuestionStar(id);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error || "중요 표시 변경 실패");
    }
  }

  // Folder navigation is server-driven in BOTH modes: push the folder id to the
  // `collectionId` URL param so the server scopes the query (and its pagination)
  // to the folder. `navigateToFolder` updates the breadcrumb UI optimistically;
  // the URL param is the source of truth the server reads.
  const handleNavigateFolder = useCallback(
    (id: string | null) => {
      folders.navigateToFolder(id);
      clearSelection();
      updateFilter("collectionId", id || "ALL");
    },
    [folders, clearSelection, updateFilter],
  );

  const handleNavigateToRoot = useCallback(() => {
    folders.setActiveFolder(null);
    clearSelection();
    updateFilter("collectionId", "ALL");
  }, [folders, clearSelection, updateFilter]);

  // ─── Folder drag handler (wraps hook's handler with selectedIds) ───
  const handleDragToFolder = useCallback(
    // 세트 드래그면 itemId 가 멤버 배열 — 훅이 배열을 그대로 받아 전체를 폴더에 넣는다.
    async (
      itemId: string | string[],
      folderId: string,
      copy: boolean,
      keepFolderIds: string[] = [],
    ) => {
      const success = await folders.handleDragToFolder(
        itemId,
        folderId,
        copy,
        selectedIds,
        keepFolderIds,
      );
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  // Folders the dragged question (or whole selection) currently belongs to —
  // powers the "keep in this folder" toggles when moving.
  const getItemFolders = useCallback(
    (itemId: string) => {
      const ids = selectedIds.has(itemId) ? selectedIds : new Set([itemId]);
      return folders.collections
        .filter((c) =>
          [...ids].some((id) => folders.membership[c.id]?.has(id)),
        )
        .map((c) => ({ id: c.id, name: c.name }));
    },
    [folders.collections, folders.membership, selectedIds],
  );

  const handleDragToRoot = useCallback(
    async (itemId: string | string[], copy: boolean) => {
      if (copy || !folders.activeFolder) return;
      // 세트는 멤버 전체(배열)를 폴더에서 뺀다.
      const draggedIds = Array.isArray(itemId) ? itemId : [itemId];
      const ids = draggedIds.some((id) => selectedIds.has(id))
        ? selectedIds
        : new Set(draggedIds);
      const success = await folders.handleRemoveFromFolder(ids);
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  // 다중 선택 드래그: 선택된 카드를 끌면 선택 전체를, 아니면 그 카드만 끌고
  // 간다. 카드(QuestionBankCard)는 이 값으로 "여러 장이 한 덩어리로 겹쳐진"
  // 드래그 미리보기 + 개수 배지를 띄운다.
  const getDragQuestionIds = useCallback(
    (draggedId: string) =>
      selectedIds.has(draggedId) ? Array.from(selectedIds) : [draggedId],
    [selectedIds],
  );

  // ─── Move (cut + paste) — removes from all current folders, adds to target ───
  const handleMoveToFolder = useCallback(
    async (collectionId: string) => {
      if (selectedIds.size === 0) return;
      const anyId = selectedIds.values().next().value as string | undefined;
      if (!anyId) return;
      const success = await folders.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selectedIds,
      );
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  // ─── Add to folder (wraps hook's handler) ───
  async function handleAddToFolder(collectionId: string) {
    const success = await folders.handleAddToFolder(collectionId, selectedIds);
    if (success) {
      clearSelection();
    }
  }

  // ─── Remove from folder (wraps hook's handler) ───
  async function handleRemoveFromFolder() {
    const success = await folders.handleRemoveFromFolder(selectedIds);
    if (success) clearSelection();
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteWorkbenchQuestions(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === result.requested) {
        toast.success(`${result.deleted}문항을 삭제했습니다.`);
      } else if (result.deleted === 0) {
        toast.error("삭제된 문제가 없습니다.");
      } else {
        toast.warning(
          `${result.deleted}문항 삭제됨, ${result.requested - result.deleted}문항 누락`,
        );
      }
      setRemovedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      clearSelection();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleCreateExam() {
    if (!examTitle.trim() || selectedIds.size === 0) return;
    setCreatingExam(true);
    const questions = Array.from(selectedIds).map((id, idx) => ({
      questionId: id,
      orderNum: idx + 1,
      points: 1,
    }));
    const result = await createExam(academyId, {
      title: examTitle.trim(),
      type: "OFFLINE",
      totalPoints: questions.length,
      questions,
    });
    if (result.success) {
      toast.success("시험지가 생성되었습니다.");
      setCreateExamOpen(false);
      router.push(`/director/exams/${result.id}`);
    } else {
      toast.error(result.error || "시험지 생성 실패");
    }
    setCreatingExam(false);
  }

  const showingPendingOnly = filters.approved === false;

  // ── 국어(KO) 지문 세트 ── 국어 문제 은행에서만 세트 카드(공유지문 1개 + 멤버
  // 문항 묶음)를 노출한다. 영어 경로에서는 섹션 자체를 마운트하지 않는다(무회귀).
  // 카운트는 국어 빈-상태 판정 보조용.
  const [koSetCount, setKoSetCount] = useState(0);

  // ─── View mode toggle (문제별 / 지문별) ───
  const VIEW_MODE_OPTIONS = [
    { value: "ALL", label: "문제별", Icon: Rows3 },
    { value: "passage", label: "지문별", Icon: FileText },
  ] satisfies ReadonlyArray<ViewModeCycleOption<string>>;
  const viewModeToggle = (
    <ViewModeCycleButton
      value={isGrouped ? "passage" : "ALL"}
      options={VIEW_MODE_OPTIONS}
      showLabel
      onChange={(next) =>
        next === "passage"
          ? updateFilters({
              view: "passage",
              collectionId: folders.activeFolder || "ALL",
            })
          : updateFilters({
              view: "ALL",
              collectionId: folders.activeFolder || "ALL",
            })
      }
    />
  );

  const reviewStatusSegment = (() => {
    const segments = [
      {
        id: "all",
        label: "전체",
        count: statusCounts?.all ?? 0,
        value: "ALL",
        active: filters.approved === undefined,
      },
      {
        id: "pending",
        label: "미검수",
        count: statusCounts?.pending ?? 0,
        value: "false",
        active: filters.approved === false,
      },
      {
        id: "approved",
        label: "검수완료",
        count: statusCounts?.approved ?? 0,
        value: "true",
        active: filters.approved === true,
      },
    ] as const;
    return (
      <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200 bg-white">
        {segments.map((seg, index) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => {
              clearSelection();
              updateFilter("approved", seg.value);
            }}
            aria-pressed={seg.active}
            className={`h-7 cursor-pointer px-2.5 text-[11px] font-semibold transition-colors ${
              index > 0 ? "border-l border-slate-200 " : ""
            }${
              seg.active
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            }`}
          >
            {seg.label}{" "}
            <span className={seg.active ? "text-slate-200" : "text-slate-400"}>
              {seg.count}
            </span>
          </button>
        ))}
      </div>
    );
  })();

  // 선택 항목 중 아직 검수완료되지 않은(미검수) 문항 수 — bulk 검수완료 버튼의
  // 빨강(검수필요 있음)/초록(모두 완료) 상태와 활성/비활성 판정에 쓴다.
  const selectedPendingApprovalCount = useMemo(
    () =>
      flatQuestions.filter((q) => selectedIds.has(q.id) && !q.approved).length,
    [flatQuestions, selectedIds],
  );

  const selectionExtraActions = (
    <>
      <MoveOrCopyFolderPicker
        collections={folders.collections}
        activeFolder={folders.activeFolder}
        selectedCount={selectedIds.size}
        onCopy={handleAddToFolder}
        onMove={handleMoveToFolder}
        compact
      />

      <button
        type="button"
        onClick={() => void handleBulkApprove()}
        disabled={selectedPendingApprovalCount === 0 || bulkApproving}
        title={
          selectedPendingApprovalCount > 0
            ? `미검수 ${selectedPendingApprovalCount}개 검수완료`
            : "선택한 문항이 모두 검수완료입니다"
        }
        className={
          // per-card 토글과 동일한 빨강/초록 언어: 선택 중 미검수가 있으면
          // 빨강(클릭 시 완료, hover 초록 미리보기), 없으면 초록(모두 완료).
          "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2.5 text-[11px] font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (selectedPendingApprovalCount > 0
            ? "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
            : "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700")
        }
      >
        {bulkApproving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5" />
        )}
        {/* 좁은 폭(모바일 컨테이너)에서는 라벨을 숨겨 아이콘만 남긴다. */}
        <span className="@max-[30rem]:hidden">검수완료</span>
      </button>

      {/* 과제로 배포 — 선택 문항을 QUESTIONS 과제로 학생 앱에 배포.
          국어 문제 은행(KO_*)은 학생 앱 문항 플레이어 미검증이라 미노출(무회귀). */}
      {subjectScope !== "KOREAN" ? (
        <AssignQuestionsAction
          selectedIds={selectedIds}
          onAssigned={clearSelection}
        />
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (
            !confirmNative(
              `선택한 문제 ${selectedIds.size}문항을 삭제하시겠습니까?`,
              "이 작업은 되돌릴 수 없습니다. 문제에 연결된 해설/시험 연결도 함께 삭제됩니다.",
            )
          )
            return;
          void handleBulkDelete();
        }}
        disabled={selectedIds.size === 0 || bulkDeleting}
        title="삭제"
        aria-label="삭제"
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 @max-[30rem]:bg-white text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {bulkDeleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
      </button>
    </>
  );

  const gridToggle = (
    <GridToggle gridCols={gridCols} setGridCols={setGridCols} />
  );

  // 전체 선택·검수 상태·보기(문제별/지문별)를 '줄 세개' 필터 팝오버 안으로 모은다.
  const filterPopoverExtra = (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void handleSelectAllPages()}
        disabled={selectingAllPages || totalCount === 0}
        className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectingAllPages ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : null}
        전체 선택
      </button>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-600">검수 상태</span>
        {reviewStatusSegment}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-600">보기</span>
        {viewModeToggle}
      </div>
    </div>
  );

  const filtersToolbar = (
    <QuestionFiltersToolbar
      filters={filters}
      subjectScope={subjectScope}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={handleSearch}
      updateFilter={updateFilter}
      updateFilters={updateFilters}
      popoverExtra={filterPopoverExtra}
    />
  );

  const toggleActivePassage = useCallback(() => {
    if (!activePassageContext) return;
    if (activePassageContext.isOpen) {
      setExpandedPassageIds((prev) => ({
        ...prev,
        [activePassageContext.id]: false,
      }));
      setActivePassageContext(null);
      return;
    }

    const nextOpen = !activePassageContext.isOpen;
    setExpandedPassageIds((prev) => ({
      ...prev,
      [activePassageContext.id]: nextOpen,
    }));
    setActivePassageContext((prev) =>
      prev ? { ...prev, isOpen: nextOpen } : prev,
    );
  }, [activePassageContext]);

  const activePassageBar =
    isGrouped && activePassageContext ? (
      <div className="flex min-h-7 min-w-0 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-1.5 text-[11px]">
        <span className="shrink-0 font-semibold text-blue-500">현재 지문</span>
        <span className="h-3 w-px shrink-0 bg-blue-200" />
        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span className="min-w-0 flex-1 truncate font-bold text-blue-800">
          {activePassageContext.title}
        </span>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-blue-700 ring-1 ring-blue-200">
          {activePassageContext.visibleCount}문항
        </span>
        {activePassageContext.hasAnalysis ? (
          <span className="shrink-0 rounded-md border border-blue-100 bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
            분석 완료
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggleActivePassage}
          aria-expanded={activePassageContext.isOpen}
          className="ml-auto inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-white px-2 text-[10.5px] font-bold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {activePassageContext.isOpen ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
          {activePassageContext.isOpen ? "접기" : "펼치기"}
        </button>
      </div>
    ) : null;

  // ─── Selection / filter toolbar row (mirrors passage-list-client) ───
  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(true);
  // 문항 카드 영역 — '다음으로(시험지 생성)'가 비활성(선택 0개)일 때 눌리면 이 안의
  // 카드들을 글로우시켜 "문항을 먼저 고르세요"를 유도한다.
  const cardZoneRef = useRef<HTMLDivElement>(null);

  // 페이지 이동(currentPage 변경) 시 카드 목록 맨 위로 부드럽게 스크롤한다.
  // 최초 마운트에서는 스크롤하지 않는다(불필요한 점프 방지).
  const pageScrollSkipRef = useRef(true);
  useEffect(() => {
    if (pageScrollSkipRef.current) {
      pageScrollSkipRef.current = false;
      return;
    }
    cardZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage]);

  const toolbarRow = (
    <div className="flex min-h-9 flex-nowrap items-center gap-x-1.5 gap-y-1.5 md:flex-wrap md:gap-x-2">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 md:gap-2">
        <SelectAllCheckbox
          checked={allFilteredSelected}
          indeterminate={someSelected}
          disabled={
            (totalCount === 0 && displayedQuestions.length === 0) ||
            selectingAllPages
          }
          onChange={handleToggleSelectAll}
          title={
            allFilteredSelected
              ? `전체 ${selectedIds.size}문항 선택됨 — 클릭 시 해제`
              : `전체 ${totalCount}문항 선택`
          }
          ariaLabel={allFilteredSelected ? "전체 해제" : "전체 페이지 선택"}
        />
        <div
          className={
            "flex min-w-0 shrink-0 flex-nowrap items-center gap-1.5 md:gap-3 " +
            (selectedIds.size > 0 ? "" : "pointer-events-none opacity-50")
          }
          aria-disabled={selectedIds.size === 0}
        >
          {selectionExtraActions}
          {folders.activeFolder ? (
            <button
              type="button"
              onClick={handleRemoveFromFolder}
              title="폴더에서 삭제"
              aria-label="폴더에서 삭제"
              className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 @max-[30rem]:bg-white @max-[30rem]:px-0 @max-[30rem]:w-7 px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700"
            >
              <FolderX className="h-3.5 w-3.5" />
              <span className="@max-[30rem]:hidden">폴더에서 삭제</span>
            </button>
          ) : null}
        </div>
        {/* 휴지통 — 삭제 버튼 오른쪽에 두어 "삭제 → 휴지통" 흐름을 잇는다.
            좁은 폭(모바일 컨테이너)에서는 아이콘만 남겨 한 줄에 맞춘다.
            선택과 무관하게 항상 활성. */}
        <Link
          // 국어 문제 은행에서는 국어 휴지통으로 — KO_* 문항만 보이는 대칭 라우트.
          href={
            subjectScope === "KOREAN"
              ? "/director/korean/questions/trash"
              : "/director/workbench/questions/trash"
          }
          title="삭제한 문제 보관함"
          aria-label="휴지통"
          className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 @max-[30rem]:w-7 @max-[30rem]:px-0 px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 md:h-9"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="@max-[30rem]:hidden">휴지통</span>
        </Link>
        {/* 시험지 만들기 — 흐림 처리되는 액션 클러스터 밖에 둬 비활성 시
            또렷한 회색으로 보이게 한다. 모바일에선 남은 폭을 채우며 줄어든다. */}
        <button
          type="button"
          // 네이티브 disabled 대신 aria-disabled — 비활성처럼 보이되 클릭은 살려
          // 둬야, 눌렀을 때 "문항을 먼저 고르세요" 힌트 글로우를 띄울 수 있다.
          aria-disabled={selectedIds.size === 0 || creatingExam}
          title={
            selectedIds.size === 0
              ? "문항을 선택하면 시험지를 만들 수 있어요"
              : undefined
          }
          onClick={() => {
            if (creatingExam) return;
            if (selectedIds.size === 0) {
              // 비활 사유 = 문항 미선택 → 카드들을 글로우시켜 선택을 유도.
              triggerHintGlowWithin(cardZoneRef.current);
              return;
            }
            setExamTitle("");
            setCreateExamOpen(true);
          }}
          className={
            "flex h-10 min-w-0 flex-[1_1_auto] items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border px-2.5 text-[13px] font-bold text-white shadow-sm transition-colors md:h-12 md:min-w-0 md:basis-auto md:grow md:text-[14px] " +
            (selectedIds.size === 0 || creatingExam
              ? "cursor-not-allowed border-blue-200 bg-blue-300 shadow-none"
              : "cursor-pointer border-blue-600 bg-blue-600 hover:border-blue-700 hover:bg-blue-700")
          }
        >
          <ClipboardList className="size-4 md:size-5" />
          <span className="md:hidden">시험지 생성</span>
          <span className="hidden md:inline">다음으로 (시험지 생성)</span>
        </button>
      </div>
      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 md:ml-auto md:w-auto md:flex-wrap md:gap-2">
        {filtersToolbar}
        {/* 2·3열 그리드 토글 — 모바일(<lg)은 항상 1열이라 숨긴다. */}
        <div className="hidden lg:block">{gridToggle}</div>
      </div>
    </div>
  );

  const isEmpty =
    isGrouped && groupedPassages.length === 0 && !folders.activeFolder;

  // 평면(flat) 목록의 문항 카드 한 장 — 기본(영어) 경로와 국어 세트 혼합 경로가
  // 같은 카드를 그리도록 공용화(렌더 결과는 기존 인라인 map 과 동일).
  const renderFlatQuestionCard = (q, idx) => {
    const startIdx = (currentPage - 1) * 20;
    if (showingPendingOnly) {
      return (
        <QuestionCard
          key={q.id}
          q={q}
          num={startIdx + idx + 1}
          selected={selectedIds.has(q.id)}
          recentlyViewed={
            lastViewedQuestionId === q.id && detailQuestionId !== q.id
          }
          onToggle={() => toggleSelect(q.id)}
          onApprove={() => handleApprove(q.id)}
          onDetail={() => openDetail(q.id)}
          onEdit={() => editor.openEditor(q.id)}
          readonly
          compact
          showReviewActions
          openOnCardClick
        />
      );
    }
    const similarAnalysis = getSimilarSourceAnalysis(q);
    return (
      <QuestionBankCard
        key={q.id}
        q={q}
        num={startIdx + idx + 1}
        selected={selectedIds.has(q.id)}
        recentlyViewed={
          lastViewedQuestionId === q.id && detailQuestionId !== q.id
        }
        onToggle={() => toggleSelect(q.id)}
        onDelete={() => handleDelete(q.id)}
        onApprove={() => handleApprove(q.id)}
        onUnapprove={() => handleUnapprove(q.id)}
        onToggleStar={() => handleToggleStar(q.id)}
        onDetail={() => openDetail(q.id)}
        onEdit={() => editor.openEditor(q.id)}
        onShowAnalysis={
          similarAnalysis ? () => setSourceAnalysis(similarAnalysis) : undefined
        }
        viewSize={viewSize}
        cardClickSelects
        showDetailButton
        showQuickActions
        showGenerationHistory
        onOpenSiblingDetail={openDetail}
        dragRequiresSelection
        getDragQuestionIds={getDragQuestionIds}
      />
    );
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]">
      {/* ─── Content ─── */}
      <div className="-mx-6 flex-1 bg-[#F4F6F9] px-6 pt-2 pb-4 sm:px-8">
        {isEmpty ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <Database className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {isGrouped ? "분석된 지문이 없습니다" : "문제가 없습니다"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {isGrouped
                ? "학습지 생성을 거친 지문에서 생성된 문제만 표시됩니다."
                : "AI 워크벤치에서 문제를 생성해보세요"}
            </p>
          </div>
        ) : (
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div
              ref={folderStickyRef}
              className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
            >
              <FolderSection
                embedded
                childFolders={folders.childFolders}
                activeFolder={folders.activeFolder}
                dragItemType="question"
                dragItemIdKey="questionId"
                itemCountLabel={isGrouped ? "지문" : "문제"}
                showNewFolder={folders.showNewFolder}
                newFolderName={folders.newFolderName}
                onNewFolderNameChange={folders.setNewFolderName}
                onShowNewFolder={folders.setShowNewFolder}
                onCreateFolder={folders.handleCreateFolder}
                onNavigateToFolder={handleNavigateFolder}
                onRenameFolder={folders.handleRenameFolder}
                onDeleteFolder={folders.handleDeleteFolder}
                onDragToFolder={handleDragToFolder}
                onDragToRoot={handleDragToRoot}
                getItemFolders={getItemFolders}
                breadcrumbPath={folders.breadcrumbPath}
                onNavigateToRoot={handleNavigateToRoot}
                useCardInsideFolder={false}
                rootLabel="전체 문제"
                enableFolderControls
                allFolders={folders.collections}
                storageKey="questions"
                treatRootAsFolder
                contextBar={activePassageBar}
                pageHeader={{
                  icon: <Database className="h-3.5 w-3.5" />,
                  parentLabel: "문제 관리",
                  title: "전체 문제",
                  totalCount,
                  itemLabel: isGrouped ? "지문" : "문제",
                  itemUnit: isGrouped ? "편" : "문항",
                }}
              />
            </div>

            <div
              style={{ top: folderStickyHeight }}
              className="@container sticky z-20 shrink-0 border-t border-slate-200 bg-slate-50/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90 lg:px-4"
            >
              {toolbarRow}
            </div>

            <div
              ref={cardZoneRef}
              className="relative min-w-0 px-4 pb-3 pt-3 sm:px-5"
              // 페이지 이동 스크롤 시 스티키 폴더/툴바 아래에 카드 첫 줄이 오도록 여백 확보.
              style={{ scrollMarginTop: folderStickyHeight + 56 }}
            >
              {showNavLoading ? (
                <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/55 pt-12 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500 shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    불러오는 중…
                  </div>
                </div>
              ) : null}
              {isGrouped ? (
                <>
                  {/* 국어 문제 은행 — 지문 세트(공유지문 1개+멤버 묶음) 전용 섹션.
                      영어 경로에서는 마운트하지 않는다(무회귀). */}
                  {subjectScope === "KOREAN" ? (
                    <div className="mb-3">
                      <QuestionSetSection
                        subjectScope="KOREAN"
                        showSets={!folders.activeFolder}
                        onCountChange={setKoSetCount}
                        onMemberSplit={() => router.refresh()}
                        gridClassName={`grid items-start gap-3 ${
                          gridCols === 2
                            ? "grid-cols-1 md:grid-cols-2"
                            : gridCols === 3
                              ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                              : "grid-cols-1"
                        }`}
                      />
                    </div>
                  ) : null}
                <PassageGroupedView
                  passages={groupedPassages}
                  gridCols={gridCols}
                  viewSize={viewSize}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  onToggleSelect={toggleSelect}
                  onDelete={handleDelete}
                  onApprove={handleApprove}
                  onUnapprove={handleUnapprove}
                  onToggleStar={handleToggleStar}
                  onDetail={openDetail}
                  onEdit={editor.openEditor}
                  lastViewedQuestionId={lastViewedQuestionId}
                  openDetailQuestionId={detailQuestionId}
                  cardClickSelects
                  showDetailButton
                  showQuickActions
                  showGenerationHistory
                  onOpenSiblingDetail={openDetail}
                  dragRequiresSelection
                  expandedPassageIds={expandedPassageIds}
                  setExpandedPassageIds={setExpandedPassageIds}
                  onActivePassageChange={setActivePassageContext}
                  getDragQuestionIds={getDragQuestionIds}
                  renderQuestion={
                    showingPendingOnly
                      ? (q, idx) => (
                          <QuestionCard
                            key={q.id}
                            q={q}
                            num={idx + 1}
                            selected={selectedIds.has(q.id)}
                            recentlyViewed={
                              lastViewedQuestionId === q.id &&
                              detailQuestionId !== q.id
                            }
                            onToggle={() => toggleSelect(q.id)}
                            onApprove={() => handleApprove(q.id)}
                            onDetail={() => openDetail(q.id)}
                            onEdit={() => editor.openEditor(q.id)}
                            readonly
                            compact
                            showReviewActions
                            openOnCardClick
                          />
                        )
                      : undefined
                  }
                />
                </>
              ) : subjectScope === "KOREAN" ? (
                // 국어 문제 은행(flat) — 1페이지에서 지문 세트 카드를 일반 카드와
                // createdAt 최신순으로 섞어 노출(임베디드 문제은행과 동일 패턴).
                <>
                  <DragSelect
                    value={selectedIds}
                    onChange={setSelectedIds}
                    className={`grid gap-3 ${
                      gridCols === 2
                        ? "grid-cols-1 md:grid-cols-2"
                        : gridCols === 3
                          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                          : "grid-cols-1"
                    }`}
                  >
                    <QuestionSetSection
                      inline
                      subjectScope="KOREAN"
                      showSets={currentPage === 1 && !folders.activeFolder}
                      onCountChange={setKoSetCount}
                      onMemberSplit={() => router.refresh()}
                      normalItems={displayedQuestions.map((q, idx) => ({
                        id: q.id,
                        createdAt: q.createdAt,
                        node: renderFlatQuestionCard(q, idx),
                      }))}
                    />
                  </DragSelect>
                  {displayedQuestions.length === 0 &&
                  koSetCount === 0 &&
                  !isNavPending ? (
                    <div className="py-12 text-center">
                      <Database className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-[13px] text-slate-400">
                        {folders.activeFolder
                          ? "이 폴더에 문제가 없습니다."
                          : "등록된 문제가 없습니다."}
                      </p>
                      {folders.activeFolder && (
                        <p className="text-[12px] text-slate-400 mt-1">
                          문제를 선택 후 &quot;폴더에 추가&quot;를 사용하세요.
                        </p>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <DragSelect
                    value={selectedIds}
                    onChange={setSelectedIds}
                    className={`grid gap-3 ${
                      gridCols === 2
                        ? "grid-cols-1 md:grid-cols-2"
                        : gridCols === 3
                          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                          : "grid-cols-1"
                    }`}
                  >
                    <QuestionSetSection
                      inline
                      showSets={pageSetIds.length > 0}
                      setIds={pageSetIds}
                      refreshKey={`${folders.activeFolder ?? "all"}:${filters.approved ?? "all"}:${filters.subType ?? "all"}:${filters.difficulty ?? "all"}:${filters.search ?? ""}`}
                      onCountChange={setSetCount}
                      onMemberSplit={() => router.refresh()}
                      collectionId={folders.activeFolder ?? undefined}
                      filters={filters}
                      normalItems={displayedQuestions.map((q, idx) => ({
                        id: q.id,
                        createdAt: q.createdAt,
                        node: renderFlatQuestionCard(q, idx),
                      }))}
                    />
                  </DragSelect>
                  {displayedQuestions.length === 0 &&
                    setCount === 0 &&
                    !isNavPending && (
                      <div className="py-12 text-center">
                        <Database className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-[13px] text-slate-400">
                          {folders.activeFolder
                            ? "이 폴더에 문제가 없습니다."
                            : "등록된 문제가 없습니다."}
                        </p>
                        {folders.activeFolder && (
                          <p className="text-[12px] text-slate-400 mt-1">
                            문제를 선택 후 &quot;폴더에 추가&quot;를 사용하세요.
                          </p>
                        )}
                      </div>
                    )}
                </>

              )}
            </div>
          </section>
        )}

        {/* Pagination — folder filtering is server-side in BOTH modes now, so the
            folder view is properly paginated. <Pagination> self-hides when there
            is only a single page. */}
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onGoToPage={goToPage}
        />
      </div>

      {/* ─── Dialogs ─── */}

      <CreateExamDialog
        open={createExamOpen}
        onOpenChange={setCreateExamOpen}
        examTitle={examTitle}
        setExamTitle={setExamTitle}
        selectedCount={selectedIds.size}
        selectedQuestionIds={Array.from(selectedIds)}
        creating={creatingExam}
        onCreate={handleCreateExam}
      />

      <GenerateQuestionsDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        academyId={academyId}
      />

      <QuestionDetailDialog
        open={detailOpen}
        loading={detailLoading}
        loadError={detailLoadError}
        questionId={detailQuestionId}
        question={detailQuestion}
        onClose={closeDetail}
        onRetry={openDetail}
        onApprove={handleApprove}
        onUnapprove={handleUnapprove}
        onDelete={handleDelete}
        onEdit={openEditorFromDetail}
      />

      {sourceAnalysis ? (
        <SimilarQuestionAnalysisModal
          analysis={sourceAnalysis}
          onClose={() => setSourceAnalysis(null)}
        />
      ) : null}

      <EditQuestionDialog
        open={editor.editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditorCameFromDetail(false);
            editor.closeEditor();
          } else editor.setEditDialogOpen(true);
        }}
        loading={editor.questionLoading}
        loadError={editor.questionLoadError}
        editingQuestion={editor.editingQuestion}
        editingQuestionId={editor.editingQuestionId}
        onClose={() => {
          setEditorCameFromDetail(false);
          editor.closeEditor();
        }}
        onDeleted={editor.handleEditorDeleted}
        onRetry={editor.openEditor}
        onSaved={() => router.refresh()}
        onApproved={() => router.refresh()}
        onSavedAsNew={() => router.refresh()}
        onBack={editorCameFromDetail ? backToDetail : undefined}
      />

    </div>
  );
}
