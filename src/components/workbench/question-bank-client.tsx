// @ts-nocheck
"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GenerateQuestionsDialog } from "./generate-questions-dialog";
import { Database, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import {
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
import { QuestionBankCard } from "./question-bank-card";
import { CreateExamDialog } from "./question-bank-client/create-exam-dialog";
import { EditQuestionDialog } from "./question-bank-client/edit-question-dialog";
import { GridToggle } from "./question-bank-client/grid-toggle";
import { QuestionFiltersToolbar } from "./question-bank-client/filters-toolbar";
import { useQuestionEditor } from "./question-bank-client/use-question-editor";

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

interface QuestionBankProps {
  academyId: string;
  questionsData: {
    questions: QuestionItem[];
    total: number;
    page: number;
    totalPages: number;
  };
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
  questionsData,
  filters,
  collections: initialCollections,
  collectionMembership: initialMembership,
}: QuestionBankProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

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

  // Questions in active folder
  const questionsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return questionsData.questions;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return questionsData.questions.filter((q) => ids.has(q.id));
  }, [questionsData.questions, folders.activeFolder, folders.membership]);

  const displayedQuestions =
    folders.activeFolder === null
      ? questionsData.questions
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
  const totalCount = questionsData.total;

  const editor = useQuestionEditor((id) => {
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
  });

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

  // ─── Filter bar (rendered inside FolderSection.toolbar) ───
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

  const gridToggle = <GridToggle gridCols={gridCols} setGridCols={setGridCols} />;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Page header bar removed — identity + CTAs now live inside the
          sticky FolderSection card. */}

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pt-0 pb-4">
        {questionsData.questions.length === 0 && !folders.activeFolder ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <Database className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">문제가 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">
              AI 워크벤치에서 문제를 생성해보세요
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
              itemCountLabel="문제"
              showNewFolder={folders.showNewFolder}
              newFolderName={folders.newFolderName}
              onNewFolderNameChange={folders.setNewFolderName}
              onShowNewFolder={folders.setShowNewFolder}
              onCreateFolder={folders.handleCreateFolder}
              onNavigateToFolder={(id) => {
                folders.navigateToFolder(id);
                clearSelection();
              }}
              onRenameFolder={folders.handleRenameFolder}
              onDeleteFolder={folders.handleDeleteFolder}
              onDragToFolder={handleDragToFolder}
              onDragToRoot={handleDragToRoot}
              breadcrumbPath={folders.breadcrumbPath}
              onNavigateToRoot={() => {
                folders.setActiveFolder(null);
                clearSelection();
              }}
              toolbar={filtersToolbar}
              pageHeader={{
                icon: <Database className="h-3.5 w-3.5" />,
                title: "문제 관리",
                totalCount,
                itemLabel: "문제",
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
                  rightSlot={gridToggle}
                />
              }
            />

            {/* Questions section */}
            <div>
              {displayedQuestions.length === 0 ? (
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
                    const startIdx = (questionsData.page - 1) * 20;
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
                        onEdit={() => editor.openEditor(q.id)}
                        viewSize={viewSize}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Pagination */}
        {!folders.activeFolder && (
          <Pagination
            page={questionsData.page}
            totalPages={questionsData.totalPages}
            onGoToPage={goToPage}
          />
        )}
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
    </div>
  );
}
