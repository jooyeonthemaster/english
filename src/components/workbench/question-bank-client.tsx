// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { PassageGroupedView } from "./question-bank-passage-view";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Shared modules
import type { CollectionItem } from "./shared/types";
import { Pagination } from "./shared/pagination";
import { FolderSection } from "./shared/folder-section";
import { MoveOrCopyFolderPicker } from "./shared/move-or-copy-folder-picker";
import { QuestionCard } from "./question-card";
import { QuestionBankCard } from "./question-bank-card";
import { DragSelect } from "@/components/ui/drag-select";
import { CreateExamDialog } from "./question-bank-client/create-exam-dialog";
import { EditQuestionDialog } from "./question-bank-client/edit-question-dialog";
import { GridToggle } from "./question-bank-client/grid-toggle";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import { QuestionDetailDialog } from "./question-bank-client/question-detail-dialog";
import { QuestionFiltersToolbar } from "./question-bank-client/filters-toolbar";
import { useQuestionEditor } from "./question-bank-client/use-question-editor";

// Hooks
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useSelection } from "@/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";

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
  view: "flat" | "passage";
  questionsData: {
    questions: QuestionItem[];
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
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  // URL filters
  const {
    updateFilter,
    updateFilters,
    handleSearch: urlSearch,
    goToPage,
    isPending: isNavPending,
  } = useUrlFilters(QUESTION_BANK_PATH);

  function handleSearch() {
    urlSearch(searchValue);
  }

  // Folder manager
  const folders = useFolderManager({
    initialCollections,
    initialMembership,
    actions: {
      createCollection: createQuestionCollection,
      updateCollection: updateQuestionCollection,
      deleteCollection: deleteQuestionCollection,
      addToCollection: addQuestionsToCollection,
      removeFromCollection: removeQuestionsFromCollection,
    },
    itemLabel: "문제",
  });

  // Grid view mode
  const [gridCols, setGridCols] = useState<2 | 3 | "list">(2);
  const viewSize: "lg" | "md" | "sm" =
    gridCols === 3 ? "md" : "lg";

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
    return rawGroupedPassages
      .map((p) => ({
        ...p,
        questions: p.questions.filter((q) => !removedIds.has(q.id)),
      }))
      // Hide passages whose questions are all removed so the grouped grid
      // doesn't render empty cards.
      .filter((p) => p.questions.length > 0);
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

  // Selection
  const displayedQuestionIds = useMemo(
    () => displayedQuestions.map((q) => q.id),
    [displayedQuestions],
  );
  const getDisplayedIds = useCallback(
    () => displayedQuestionIds,
    [displayedQuestionIds],
  );
  const {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    clearSelection,
  } = useSelection(getDisplayedIds);
  const isCurrentPageSelected =
    displayedQuestionIds.length > 0 &&
    displayedQuestionIds.every((id) => selectedIds.has(id));

  const handleSelectCurrentPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const shouldClearPage =
        displayedQuestionIds.length > 0 &&
        displayedQuestionIds.every((id) => next.has(id));

      for (const id of displayedQuestionIds) {
        if (shouldClearPage) next.delete(id);
        else next.add(id);
      }

      return next;
    });
  }, [displayedQuestionIds, setSelectedIds]);

  // Exam dialog
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  // Bulk delete
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Bulk approve (검수완료)
  const [bulkApproving, setBulkApproving] = useState(false);
  const [selectingAllPages, setSelectingAllPages] = useState(false);

  // Stats
  const totalCount = isGrouped
    ? (groupedData?.total ?? 0)
    : (questionsData?.total ?? 0);
  const allPagesSelectableCount = !isGrouped && folders.activeFolder
    ? (folders.membership[folders.activeFolder]?.size ?? 0)
    : totalCount;
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
      };
      const result = await getWorkbenchQuestionIds(academyId, effectiveFilters, {
        passageOnly: isGrouped,
      });

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
        err instanceof Error
          ? err.message
          : "전체 문제 선택에 실패했습니다.",
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
  ]);

  const editor = useQuestionEditor((id) => {
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
  });
  const detailLoadTokenRef = useRef(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
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
    async (itemId: string, folderId: string, copy: boolean) => {
      const success = await folders.handleDragToFolder(
        itemId,
        folderId,
        copy,
        selectedIds,
      );
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  const handleDragToRoot = useCallback(
    async (itemId: string, copy: boolean) => {
      if (copy || !folders.activeFolder) return;
      const ids = selectedIds.has(itemId) ? selectedIds : new Set([itemId]);
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
      setBulkDeleteOpen(false);
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

  const filtersToolbar = (
    <QuestionFiltersToolbar
      filters={filters}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={handleSearch}
      updateFilter={updateFilter}
      updateFilters={updateFilters}
    />
  );

  const reviewStatusSegment = (() => {
    const segments = [
      { id: "all", label: "전체", count: statusCounts?.all ?? 0, value: "ALL", active: filters.approved === undefined },
      { id: "pending", label: "미검수", count: statusCounts?.pending ?? 0, value: "false", active: filters.approved === false },
      { id: "approved", label: "검수완료", count: statusCounts?.approved ?? 0, value: "true", active: filters.approved === true },
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

  const selectionExtraActions = (
    <>
      {/* 검수완료 (선택 문항 일괄 검수) */}
      <button
        type="button"
        onClick={() => void handleBulkApprove()}
        disabled={selectedIds.size === 0 || bulkApproving}
        className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-green-200 bg-green-50/60 px-2.5 text-[11px] font-semibold text-green-700 shadow-none transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 disabled:cursor-not-allowed disabled:border-green-100 disabled:bg-green-50/50 disabled:text-green-300 disabled:opacity-100"
      >
        {bulkApproving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5" />
        )}
        검수완료
      </button>

      <MoveOrCopyFolderPicker
        collections={folders.collections}
        activeFolder={folders.activeFolder}
        selectedCount={selectedIds.size}
        onCopy={handleAddToFolder}
        onMove={handleMoveToFolder}
      />

      {/* Create exam */}
      <button
        onClick={() => {
          setExamTitle("");
          setCreateExamOpen(true);
        }}
        className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
      >
        <ClipboardList className="w-3.5 h-3.5" />
        시험지 만들기
      </button>

      {/* Bulk delete */}
      <button
        type="button"
        onClick={() => setBulkDeleteOpen(true)}
        disabled={selectedIds.size === 0 || bulkDeleting}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {bulkDeleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
        삭제
      </button>
    </>
  );

  const gridToggle = <GridToggle gridCols={gridCols} setGridCols={setGridCols} />;
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
        <span className="shrink-0 font-semibold text-blue-500">
          현재 지문
        </span>
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

  const toolbarRow = (
    <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-2">
          <SelectAllCheckbox
            checked={isCurrentPageSelected && selectedIds.size > 0}
            indeterminate={selectedIds.size > 0 && !isCurrentPageSelected}
            disabled={displayedQuestions.length === 0}
            onChange={handleSelectCurrentPage}
            title={`${selectedIds.size}문항 선택`}
            ariaLabel={
              isCurrentPageSelected ? "현재 페이지 해제" : "현재 페이지 선택"
            }
          />
          <div
            className={
              "flex items-center gap-3 " +
              (selectedIds.size > 0
                ? ""
                : "pointer-events-none opacity-50")
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
                className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
              >
                <FolderX className="h-3.5 w-3.5" />
                폴더에서 삭제
              </button>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {reviewStatusSegment}
          {viewModeToggle}
          {filtersToolbar}
          {gridToggle}
        </div>
      </div>
  );

  const isEmpty =
    (isGrouped ? groupedPassages.length === 0 : flatQuestions.length === 0) &&
    !folders.activeFolder;

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
                ? "지문 분석을 거친 지문에서 생성된 문제만 표시됩니다."
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
                breadcrumbPath={folders.breadcrumbPath}
                onNavigateToRoot={handleNavigateToRoot}
                useCardInsideFolder={true}
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
              className="sticky z-20 shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90"
            >
              {toolbarRow}
            </div>

            <div className="relative min-w-0 px-4 pb-3 pt-3 sm:px-5">
              {showNavLoading ? (
                <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/55 pt-12 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500 shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    불러오는 중…
                  </div>
                </div>
              ) : null}
              {isGrouped ? (
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
                  cardClickSelects
                  showDetailButton
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
              ) : displayedQuestions.length === 0 && !isNavPending ? (
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
              ) : (
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
                  {displayedQuestions.map((q, idx) => {
                    const startIdx = (currentPage - 1) * 20;
                    if (showingPendingOnly) {
                      return (
                        <QuestionCard
                          key={q.id}
                          q={q}
                          num={startIdx + idx + 1}
                          selected={selectedIds.has(q.id)}
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
                    return (
                      <QuestionBankCard
                        key={q.id}
                        q={q}
                        num={startIdx + idx + 1}
                        selected={selectedIds.has(q.id)}
                        onToggle={() => toggleSelect(q.id)}
                        onDelete={() => handleDelete(q.id)}
                        onApprove={() => handleApprove(q.id)}
                        onUnapprove={() => handleUnapprove(q.id)}
                        onToggleStar={() => handleToggleStar(q.id)}
                        onDetail={() => openDetail(q.id)}
                        onEdit={() => editor.openEditor(q.id)}
                        viewSize={viewSize}
                        cardClickSelects
                        showDetailButton
                        dragRequiresSelection
                        getDragQuestionIds={getDragQuestionIds}
                      />
                    );
                  })}
                </DragSelect>
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
      />

      <EditQuestionDialog
        open={editor.editDialogOpen}
        onOpenChange={(open) => {
          if (!open) editor.closeEditor();
          else editor.setEditDialogOpen(true);
        }}
        loading={editor.questionLoading}
        loadError={editor.questionLoadError}
        editingQuestion={editor.editingQuestion}
        editingQuestionId={editor.editingQuestionId}
        onClose={editor.closeEditor}
        onDeleted={editor.handleEditorDeleted}
        onRetry={editor.openEditor}
      />

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!bulkDeleting) setBulkDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              선택한 문제 {selectedIds.size}문항을 삭제하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 문제에 연결된 해설/시험 연결도 함께
              삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleBulkDelete();
              }}
              disabled={bulkDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {bulkDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
