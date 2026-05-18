// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GenerateQuestionsDialog } from "./generate-questions-dialog";
import {
  Database,
  Search,
  ClipboardList,
  Grid2X2,
  Grid3X3,
  LayoutGrid,
  Star,
  ArrowUpDown,
  Loader2,
  Rows3,
  FileText,
} from "lucide-react";
import { PassageGroupedView } from "./question-bank-passage-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getWorkbenchQuestion,
  deleteWorkbenchQuestion,
  approveWorkbenchQuestion,
  toggleQuestionStar,
  createQuestionCollection,
  addQuestionsToCollection,
  removeQuestionsFromCollection,
  deleteQuestionCollection,
  updateQuestionCollection,
} from "@/actions/workbench";
import { createExam } from "@/actions/exams";

// Shared modules
import type { CollectionItem } from "./shared/types";
import { Pagination } from "./shared/pagination";
import { FolderSection } from "./shared/folder-section";
import { SelectionToolbar } from "./shared/selection-toolbar";
import { MoveOrCopyFolderPicker } from "./shared/move-or-copy-folder-picker";
import { TypeFilterPopover, TYPE_SUBTYPE_MAP } from "./question-type-filter";
import { QuestionBankCard } from "./question-bank-card";
import { QuestionEditClient } from "./question-edit-client";

// Hooks
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useSelection } from "@/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Main Component
// ---------------------------------------------------------------------------

export function QuestionBankClient({
  academyId,
  view,
  questionsData,
  groupedData,
  filters,
  collections: initialCollections,
  collectionMembership: initialMembership,
}: QuestionBankProps) {
  const isGrouped = view === "passage";
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  );
  const [editingQuestion, setEditingQuestion] = useState<Awaited<
    ReturnType<typeof getWorkbenchQuestion>
  > | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionLoadError, setQuestionLoadError] = useState<string | null>(
    null,
  );
  const editLoadTokenRef = useRef(0);

  // URL filters
  const {
    updateFilter,
    updateFilters,
    handleSearch: urlSearch,
    goToPage,
  } = useUrlFilters("/director/questions");

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
  const [gridCols, setGridCols] = useState<2 | 3 | 4>(2);
  const viewSize: "lg" | "md" | "sm" =
    gridCols === 2 ? "lg" : gridCols === 3 ? "md" : "sm";

  // Initial folder from URL in grouped mode (collectionId is server-driven)
  useEffect(() => {
    if (isGrouped && filters.collectionId && !folders.activeFolder) {
      folders.setActiveFolder(filters.collectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flattened list of question objects currently being displayed.
  // In flat mode: questionsData.questions filtered by activeFolder (client-side).
  // In grouped mode: every question across all visible passages (server-filtered).
  const flatQuestions = questionsData?.questions ?? [];
  const questionsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return flatQuestions;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return flatQuestions.filter((q) => ids.has(q.id));
  }, [flatQuestions, folders.activeFolder, folders.membership]);

  const groupedPassages = groupedData?.passages ?? [];

  const displayedQuestions = isGrouped
    ? groupedPassages.flatMap((p) => p.questions)
    : folders.activeFolder === null
      ? flatQuestions
      : questionsInActiveFolder;

  // Selection
  const getDisplayedIds = useCallback(
    () => displayedQuestions.map((q) => q.id),
    [displayedQuestions],
  );
  const {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
  } = useSelection(getDisplayedIds);

  // Exam dialog
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

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

  async function handleOpenQuestionEditor(id: string) {
    const token = editLoadTokenRef.current + 1;
    editLoadTokenRef.current = token;
    setEditDialogOpen(true);
    setEditingQuestionId(id);
    setEditingQuestion(null);
    setQuestionLoadError(null);
    setQuestionLoading(true);

    try {
      const question = await getWorkbenchQuestion(id);
      if (editLoadTokenRef.current !== token) return;
      if (!question) {
        setQuestionLoadError("문제를 찾을 수 없습니다.");
        toast.error("문제를 찾을 수 없습니다.");
        return;
      }
      setEditingQuestion(question);
    } catch {
      if (editLoadTokenRef.current !== token) return;
      setQuestionLoadError("문제를 불러오는 중 오류가 발생했습니다.");
      toast.error("문제를 불러오지 못했습니다.");
    } finally {
      if (editLoadTokenRef.current === token) setQuestionLoading(false);
    }
  }

  function closeQuestionEditor() {
    editLoadTokenRef.current += 1;
    setEditDialogOpen(false);
    setEditingQuestionId(null);
    setEditingQuestion(null);
    setQuestionLoadError(null);
    setQuestionLoading(false);
  }

  function handleEditorDeleted(id: string) {
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
    closeQuestionEditor();
    router.refresh();
  }

  // ─── Question Actions ───
  async function handleDelete(id: string) {
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    const result = await deleteWorkbenchQuestion(id);
    if (result.success) {
      toast.success("삭제됨");
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
      router.refresh();
    } else {
      toast.error(result.error || "삭제 실패");
    }
  }

  async function handleApprove(id: string) {
    const result = await approveWorkbenchQuestion(id);
    if (result.success) {
      toast.success("승인됨");
      router.refresh();
    } else {
      toast.error(result.error || "승인 실패");
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

  // In grouped mode the server filters by collectionId, so folder navigation
  // must also push to the URL. Flat mode keeps the existing client-side
  // filter behavior.
  const handleNavigateFolder = useCallback(
    (id: string | null) => {
      folders.navigateToFolder(id);
      clearSelection();
      if (isGrouped) {
        updateFilter("collectionId", id || "ALL");
      }
    },
    [folders, clearSelection, isGrouped, updateFilter],
  );

  const handleNavigateToRoot = useCallback(() => {
    folders.setActiveFolder(null);
    clearSelection();
    if (isGrouped) {
      updateFilter("collectionId", "ALL");
    }
  }, [folders, clearSelection, isGrouped, updateFilter]);

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

  // ─── Extra actions for selection toolbar (question-specific) ───
  // ─── Filter bar (rendered inside FolderSection.toolbar) ───
  const viewModeToggle = (
    <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
      <button
        onClick={() => updateFilters({ view: "ALL", collectionId: "ALL" })}
        className={`flex items-center gap-1 px-2 h-7 text-[11px] font-medium transition-colors ${
          !isGrouped
            ? "bg-slate-800 text-white"
            : "text-slate-500 hover:bg-slate-50"
        }`}
        aria-pressed={!isGrouped}
      >
        <Rows3 className="w-3 h-3" />
        문제별
      </button>
      <button
        onClick={() =>
          updateFilters({
            view: "passage",
            collectionId: folders.activeFolder || "ALL",
          })
        }
        className={`flex items-center gap-1 px-2 h-7 text-[11px] font-medium transition-colors border-l border-slate-200 ${
          isGrouped
            ? "bg-slate-800 text-white"
            : "text-slate-500 hover:bg-slate-50"
        }`}
        aria-pressed={isGrouped}
      >
        <FileText className="w-3 h-3" />
        지문별
      </button>
    </div>
  );

  const filtersToolbar = (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
        <input
          placeholder="검색..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="w-40 h-7 pl-7 pr-2.5 text-[11.5px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      <TypeFilterPopover
        currentSubTypes={filters.subType?.split(",").filter(Boolean) || []}
        onApply={(selectedSubs) => {
          if (selectedSubs.length === 0) {
            updateFilters({ type: "ALL", subType: "ALL" });
          } else {
            const types = new Set<string>();
            for (const sub of selectedSubs) {
              const group = TYPE_SUBTYPE_MAP.find((g) =>
                g.subtypes.some((s) => s.value === sub),
              );
              if (group) types.add(group.type);
            }
            updateFilters({
              type: types.size > 0 ? [...types].join(",") : "ALL",
              subType: selectedSubs.join(","),
            });
          }
        }}
      />

      <Select
        value={filters.difficulty || "ALL"}
        onValueChange={(v) => updateFilter("difficulty", v)}
      >
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="난이도" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 난이도</SelectItem>
          <SelectItem value="BASIC">기본</SelectItem>
          <SelectItem value="INTERMEDIATE">중급</SelectItem>
          <SelectItem value="KILLER">킬러</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={
          filters.approved === true
            ? "true"
            : filters.approved === false
              ? "false"
              : "ALL"
        }
        onValueChange={(v) => updateFilter("approved", v)}
      >
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 상태</SelectItem>
          <SelectItem value="true">승인 완료</SelectItem>
          <SelectItem value="false">미승인</SelectItem>
        </SelectContent>
      </Select>

      <button
        onClick={() => {
          if (filters.starred === true) updateFilter("starred", "ALL");
          else updateFilter("starred", "true");
        }}
        className={`flex items-center gap-1 h-7 px-2 text-[11.5px] font-medium rounded-md border transition-colors ${
          filters.starred === true
            ? "bg-yellow-50 border-yellow-300 text-yellow-700"
            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        }`}
        aria-label="중요 문제 필터"
        aria-pressed={filters.starred === true}
      >
        <Star
          className={`w-3 h-3 ${filters.starred === true ? "fill-yellow-400 text-yellow-500" : ""}`}
        />
        중요
      </button>

      <Select
        value={filters.sort || "newest"}
        onValueChange={(v) => updateFilter("sort", v === "newest" ? "ALL" : v)}
      >
        <SelectTrigger className="w-[108px] h-7 text-[11.5px] px-2.5">
          <ArrowUpDown className="w-3 h-3 mr-1 shrink-0" />
          <SelectValue placeholder="정렬" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">최신순</SelectItem>
          <SelectItem value="oldest">오래된순</SelectItem>
          <SelectItem value="difficulty_desc">난이도 높은순</SelectItem>
          <SelectItem value="difficulty_asc">난이도 낮은순</SelectItem>
          <SelectItem value="starred">중요 문제 먼저</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  const selectionExtraActions = (
    <>
      <MoveOrCopyFolderPicker
        collections={folders.collections}
        activeFolder={folders.activeFolder}
        selectedCount={selectedIds.size}
        onCopy={handleAddToFolder}
        onMove={handleMoveToFolder}
      />

      <span className="text-slate-300">|</span>

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
    </>
  );

  const gridToggle = (
    <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
      <button
        onClick={() => setGridCols(2)}
        className={`p-1 transition-colors ${gridCols === 2 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
        aria-label="2열 보기"
        aria-pressed={gridCols === 2}
      >
        <Grid2X2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setGridCols(3)}
        className={`p-1 transition-colors border-x border-slate-200 ${gridCols === 3 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
        aria-label="3열 보기"
        aria-pressed={gridCols === 3}
      >
        <Grid3X3 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setGridCols(4)}
        className={`p-1 transition-colors ${gridCols === 4 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
        aria-label="4열 보기"
        aria-pressed={gridCols === 4}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Page header bar removed — identity + CTAs now live inside the
          sticky FolderSection card. */}

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pt-0 pb-4">
        {(isGrouped
          ? groupedPassages.length === 0
          : flatQuestions.length === 0) && !folders.activeFolder ? (
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
          <>
            {/* Folders section -- sticky below header. Selection toolbar is
              embedded inside so it shares the sticky pinning. */}
            <FolderSection
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
              toolbar={filtersToolbar}
              pageHeader={{
                icon: <Database className="h-3.5 w-3.5" />,
                title: "문제 관리",
                totalCount,
                itemLabel: isGrouped ? "지문" : "문제",
              }}
              selectionBar={
                <SelectionToolbar
                  embedded
                  selectedCount={selectedIds.size}
                  totalCount={displayedQuestions.length}
                  isAllSelected={
                    selectedIds.size === displayedQuestions.length &&
                    displayedQuestions.length > 0
                  }
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  activeFolder={folders.activeFolder}
                  onRemoveFromFolder={handleRemoveFromFolder}
                  extraActions={selectionExtraActions}
                  rightSlot={
                    <div className="flex items-center gap-1.5">
                      {viewModeToggle}
                      {gridToggle}
                    </div>
                  }
                />
              }
            />

            {/* Questions / Passages section */}
            <div>
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
                  onToggleStar={handleToggleStar}
                  onEdit={handleOpenQuestionEditor}
                />
              ) : displayedQuestions.length === 0 ? (
                <div className="text-center py-12">
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
                <div
                  className={`grid gap-3 ${
                    gridCols === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : gridCols === 3
                        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  }`}
                >
                  {displayedQuestions.map((q, idx) => {
                    const startIdx = (currentPage - 1) * 20;
                    return (
                      <QuestionBankCard
                        key={q.id}
                        q={q}
                        num={startIdx + idx + 1}
                        selected={selectedIds.has(q.id)}
                        onToggle={() => toggleSelect(q.id)}
                        onDelete={() => handleDelete(q.id)}
                        onApprove={() => handleApprove(q.id)}
                        onToggleStar={() => handleToggleStar(q.id)}
                        onEdit={() => handleOpenQuestionEditor(q.id)}
                        viewSize={viewSize}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Pagination — flat mode: hidden when folder active.
            Grouped mode: always shown (folder filter is server-side). */}
        {(isGrouped || !folders.activeFolder) && (
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onGoToPage={goToPage}
          />
        )}
      </div>

      {/* ─── Dialogs ─── */}

      {/* Create exam dialog */}
      <Dialog open={createExamOpen} onOpenChange={setCreateExamOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              시험지 만들기 ({selectedIds.size}문제)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="시험지 제목"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateExam();
              }}
              autoFocus
            />
            <p className="text-xs text-slate-500">
              선택한 {selectedIds.size}개 문제로 초안(DRAFT) 시험지를
              생성합니다. 생성 후 상세 페이지에서 순서, 배점 등을 편집할 수
              있습니다.
            </p>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleCreateExam}
              disabled={!examTitle.trim() || creatingExam}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingExam ? "생성 중..." : "시험지 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GenerateQuestionsDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        academyId={academyId}
      />

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeQuestionEditor();
          else setEditDialogOpen(true);
        }}
      >
        <DialogContent
          className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1440px] gap-0 overflow-hidden rounded-2xl border-slate-200 bg-[#F8FAFB] p-0 shadow-2xl sm:max-w-[1440px]"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>문제 수정</DialogTitle>
          </DialogHeader>

          {questionLoading ? (
            <div className="flex h-full items-center justify-center bg-white">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                문제를 불러오는 중
              </div>
            </div>
          ) : questionLoadError ? (
            <div className="flex h-full items-center justify-center bg-white">
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium text-slate-700">
                  {questionLoadError}
                </p>
                <div className="flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={closeQuestionEditor}
                  >
                    닫기
                  </Button>
                  {editingQuestionId && (
                    <Button
                      size="sm"
                      onClick={() =>
                        handleOpenQuestionEditor(editingQuestionId)
                      }
                    >
                      다시 불러오기
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : editingQuestion ? (
            <QuestionEditClient
              key={editingQuestion.id}
              question={editingQuestion}
              mode="modal"
              onClose={closeQuestionEditor}
              onDeleted={handleEditorDeleted}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
