// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GenerateQuestionsDialog } from "./generate-questions-dialog";
import {
  Database,
  Search,
  FolderPlus,
  ClipboardList,
  Square,
  Grid2X2,
  Grid3X3,
  LayoutGrid,
  Folder,
  Layers,
  ArrowLeft,
  Star,
  ArrowUpDown,
} from "lucide-react";
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
import { BreadcrumbNav } from "./shared/breadcrumb-nav";
import {
  TypeFilterPopover,
  TYPE_SUBTYPE_MAP,
} from "./question-type-filter";
import { QuestionBankCard } from "./question-bank-card";

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
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date;
  passage: {
    id: string; title: string; content: string;
    grade?: number | null; semester?: string | null; publisher?: string | null;
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
  const { updateFilter, updateFilters, handleSearch: urlSearch, goToPage } = useUrlFilters("/director/questions");

  function handleSearch() { urlSearch(searchValue); }

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
  const viewSize: "lg" | "md" | "sm" = gridCols === 2 ? "lg" : gridCols === 3 ? "md" : "sm";

  // Questions in active folder
  const questionsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return questionsData.questions;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return questionsData.questions.filter((q) => ids.has(q.id));
  }, [questionsData.questions, folders.activeFolder, folders.membership]);

  const displayedQuestions = folders.activeFolder === null ? questionsData.questions : questionsInActiveFolder;

  // Selection
  const getDisplayedIds = useCallback(
    () => displayedQuestions.map((q) => q.id),
    [displayedQuestions],
  );
  const { selectedIds, setSelectedIds, toggleSelect, selectAll, clearSelection } = useSelection(getDisplayedIds);

  // "Add to folder" dropdown (question-specific)
  const [showAddToFolder, setShowAddToFolder] = useState(false);
  const addToFolderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddToFolder) return;
    function handleClick(e: MouseEvent) {
      if (addToFolderRef.current && !addToFolderRef.current.contains(e.target as Node)) {
        setShowAddToFolder(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAddToFolder]);

  // Exam dialog
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  // Stats
  const totalCount = questionsData.total;

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
      const success = await folders.handleDragToFolder(itemId, folderId, copy, selectedIds);
      if (success) clearSelection();
    },
    [folders.handleDragToFolder, selectedIds, clearSelection],
  );

  // ─── Add to folder (wraps hook's handler) ───
  async function handleAddToFolder(collectionId: string) {
    const success = await folders.handleAddToFolder(collectionId, selectedIds);
    if (success) {
      clearSelection();
      setShowAddToFolder(false);
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
  const selectionExtraActions = (
    <>
      {/* Add to folder */}
      <div ref={addToFolderRef} className="relative">
        <button
          onClick={() => setShowAddToFolder(!showAddToFolder)}
          className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          폴더에 추가
        </button>
        {showAddToFolder && (
          <div className="absolute left-0 top-8 z-20 w-56 bg-white rounded-lg border border-slate-200 shadow-lg py-1">
            {folders.collections.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-slate-400">폴더가 없습니다.</p>
            ) : (
              folders.collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleAddToFolder(c.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-blue-50 text-left"
                >
                  <Folder className="w-3.5 h-3.5 text-slate-400" />
                  {c.name}
                  <span className="ml-auto text-[10px] text-slate-400">{c._count.items}개</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <span className="text-slate-300">|</span>

      {/* Create exam */}
      <button
        onClick={() => { setExamTitle(""); setCreateExamOpen(true); }}
        className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
      >
        <ClipboardList className="w-3.5 h-3.5" />
        시험지 만들기
      </button>
    </>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ─── Unified Header: title + breadcrumb + search + filters + AI button ─── */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: back/icon + title + breadcrumb */}
        <div className="flex items-center gap-2 shrink-0">
          {folders.activeFolder ? (
            <button
              onClick={() => {
                folders.navigateUp();
                clearSelection();
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
          ) : (
            <Database className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
          )}
          <h1 className="text-[15px] font-bold text-slate-900">문제 은행</h1>
          <span className="text-[12px] text-slate-400">{totalCount}개</span>
          <BreadcrumbNav
            activeFolder={folders.activeFolder}
            breadcrumbPath={folders.breadcrumbPath}
            onNavigateToFolder={(id) => { folders.navigateToFolder(id); clearSelection(); }}
            rootLabel="전체 문제"
          />
        </div>

        <div className="flex-1" />

        {/* Right: search + filters + AI button */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
            <input
              placeholder="검색..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-44 h-8 pl-8 pr-3 text-[12px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Multi-select hierarchical type filter */}
          <TypeFilterPopover
            currentSubTypes={filters.subType?.split(",").filter(Boolean) || []}
            onApply={(selectedSubs) => {
              if (selectedSubs.length === 0) {
                updateFilters({ type: "ALL", subType: "ALL" });
              } else {
                // Infer types from selected subtypes
                const types = new Set<string>();
                for (const sub of selectedSubs) {
                  const group = TYPE_SUBTYPE_MAP.find((g) => g.subtypes.some((s) => s.value === sub));
                  if (group) types.add(group.type);
                }
                updateFilters({
                  type: types.size > 0 ? [...types].join(",") : "ALL",
                  subType: selectedSubs.join(","),
                });
              }
            }}
          />

          <Select value={filters.difficulty || "ALL"} onValueChange={(v) => updateFilter("difficulty", v)}>
            <SelectTrigger className="w-24 h-8 text-[12px]"><SelectValue placeholder="난이도" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체 난이도</SelectItem>
              <SelectItem value="BASIC">기본</SelectItem>
              <SelectItem value="INTERMEDIATE">중급</SelectItem>
              <SelectItem value="KILLER">킬러</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.approved === true ? "true" : filters.approved === false ? "false" : "ALL"}
            onValueChange={(v) => updateFilter("approved", v)}
          >
            <SelectTrigger className="w-24 h-8 text-[12px]"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체 상태</SelectItem>
              <SelectItem value="true">승인 완료</SelectItem>
              <SelectItem value="false">미승인</SelectItem>
            </SelectContent>
          </Select>

          {/* Starred filter */}
          <button
            onClick={() => {
              if (filters.starred === true) {
                updateFilter("starred", "ALL");
              } else {
                updateFilter("starred", "true");
              }
            }}
            className={`flex items-center gap-1 h-8 px-2.5 text-[12px] font-medium rounded-lg border transition-colors ${
              filters.starred === true
                ? "bg-yellow-50 border-yellow-300 text-yellow-700"
                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
            aria-label="중요 문제 필터"
            aria-pressed={filters.starred === true}
          >
            <Star className={`w-3.5 h-3.5 ${filters.starred === true ? "fill-yellow-400 text-yellow-500" : ""}`} />
            중요
          </button>

          {/* Sort dropdown */}
          <Select value={filters.sort || "newest"} onValueChange={(v) => updateFilter("sort", v === "newest" ? "ALL" : v)}>
            <SelectTrigger className="w-32 h-8 text-[12px]">
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

          <Button
            className="bg-blue-600 hover:bg-blue-700 h-8"
            size="sm"
            onClick={() => setGenerateDialogOpen(true)}
          >
            <Layers className="w-3.5 h-3.5 mr-1" />
            AI 문제 생성
          </Button>
        </div>
      </div>

      {/* ─── Selection toolbar ─── */}
      <SelectionToolbar
        selectedCount={selectedIds.size}
        totalCount={displayedQuestions.length}
        isAllSelected={selectedIds.size === displayedQuestions.length && displayedQuestions.length > 0}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        activeFolder={folders.activeFolder}
        onRemoveFromFolder={handleRemoveFromFolder}
        extraActions={selectionExtraActions}
      />

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 py-4">
        {questionsData.questions.length === 0 && !folders.activeFolder ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <Database className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">문제가 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">AI 워크벤치에서 문제를 생성해보세요</p>
          </div>
        ) : (
          <>
          {/* Folders section -- sticky below header */}
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
            onNavigateToFolder={(id) => { folders.navigateToFolder(id); clearSelection(); }}
            onRenameFolder={folders.handleRenameFolder}
            onDeleteFolder={folders.handleDeleteFolder}
            onDragToFolder={handleDragToFolder}
          />

            {/* Questions section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-slate-600">
                  문제
                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">{displayedQuestions.length}개</span>
                </h3>
                <div className="flex items-center gap-2">
                  {/* Grid view toggle */}
                  <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setGridCols(2)}
                      className={`p-1.5 transition-colors ${gridCols === 2 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
                      aria-label="2열 보기"
                      aria-pressed={gridCols === 2}
                    >
                      <Grid2X2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setGridCols(3)}
                      className={`p-1.5 transition-colors border-x border-slate-200 ${gridCols === 3 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
                      aria-label="3열 보기"
                      aria-pressed={gridCols === 3}
                    >
                      <Grid3X3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setGridCols(4)}
                      className={`p-1.5 transition-colors ${gridCols === 4 ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
                      aria-label="4열 보기"
                      aria-pressed={gridCols === 4}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {folders.childFolders.length === 0 && !folders.showNewFolder && (
                    <button
                      onClick={() => folders.setShowNewFolder(true)}
                      className="flex items-center gap-1 text-[11px] text-blue-600 font-medium hover:text-blue-700"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />새 폴더
                    </button>
                  )}
                </div>
              </div>

              {/* Select all toggle */}
              {displayedQuestions.length > 0 && selectedIds.size === 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={selectAll}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                  >
                    <Square className="w-3.5 h-3.5" />
                    전체 선택
                  </button>
                </div>
              )}

              {displayedQuestions.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {folders.activeFolder ? "이 폴더에 문제가 없습니다." : "등록된 문제가 없습니다."}
                  </p>
                  {folders.activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">문제를 선택 후 &quot;폴더에 추가&quot;를 사용하세요.</p>
                  )}
                </div>
              ) : (
                <div className={`grid gap-3 ${
                  gridCols === 2
                    ? "grid-cols-1 md:grid-cols-2"
                    : gridCols === 3
                    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                }`}>
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
              선택한 {selectedIds.size}개 문제로 초안(DRAFT) 시험지를 생성합니다.
              생성 후 상세 페이지에서 순서, 배점 등을 편집할 수 있습니다.
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
    </div>
  );
}
