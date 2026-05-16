// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  GraduationCap,
  Search,
  Plus,
  Grid2x2,
  List,
  Trash2,
  Eye,
  Calendar,
  ClipboardList,
  Users,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  deleteExam,
  createExamCollection,
  updateExamCollection,
  deleteExamCollection,
  addExamsToCollection,
  removeExamsFromCollection,
} from "@/actions/exams";

// Shared folder modules
import type { CollectionItem, CollectionActions } from "@/components/workbench/shared/types";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { SelectionToolbar } from "@/components/workbench/shared/selection-toolbar";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";

// Hooks (use the workbench/hooks versions that support CollectionActions interface)
import { useFolderManager } from "@/components/workbench/hooks/use-folder-manager";
import { useSelection } from "@/components/workbench/hooks/use-selection";

// Exam card
import { ExamFileCard } from "./exam-file-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExamItem {
  id: string;
  title: string;
  type: string;
  status: string;
  examDate: string | Date | null;
  totalPoints: number;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  _count: { questions: number; submissions: number };
}

interface ClassOption {
  id: string;
  name: string;
}

interface Props {
  exams: ExamItem[];
  classes: ClassOption[];
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
}

// ---------------------------------------------------------------------------
// Constants (shared between card & list)
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  OFFLINE: "오프라인",
  ONLINE: "온라인",
  VOCAB: "단어",
  MOCK: "모의",
};

const TYPE_COLORS: Record<string, string> = {
  OFFLINE: "bg-slate-100 text-slate-600",
  ONLINE: "bg-blue-100 text-blue-600",
  VOCAB: "bg-violet-100 text-violet-600",
  MOCK: "bg-teal-100 text-teal-600",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  PUBLISHED: "배포됨",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  ARCHIVED: "보관",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  PUBLISHED: "bg-blue-100 text-blue-600",
  IN_PROGRESS: "bg-emerald-100 text-emerald-600",
  COMPLETED: "bg-emerald-100 text-emerald-600",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

// ---------------------------------------------------------------------------
// Server action adapters (match CollectionActions interface)
// ---------------------------------------------------------------------------

const folderActions: CollectionActions = {
  create: createExamCollection,
  update: updateExamCollection,
  delete: deleteExamCollection,
  addItems: addExamsToCollection,
  removeItems: removeExamsFromCollection,
};

// ---------------------------------------------------------------------------
// ExamListRow — draggable list view row
// ---------------------------------------------------------------------------

function ExamListRow({
  exam,
  selected,
  onToggleSelect,
  onClick,
  onDelete,
}: {
  exam: ExamItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ examId: exam.id, title: exam.title, type: "exam" }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [exam.id, exam.title]);

  return (
    <div
      ref={dragRef}
      onClick={() => onClick(exam.id)}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 rounded-lg bg-white border cursor-pointer transition-all hover:shadow-sm",
        selected ? "ring-2 ring-blue-400 border-blue-300" : "border-slate-200 hover:border-slate-300",
        isDragging && "opacity-40 scale-95",
      )}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(exam.id, e.shiftKey); }}
        className={cn(
          "w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 transition-all",
          selected
            ? "bg-blue-600 text-white border border-blue-600"
            : "bg-white border border-slate-300 text-transparent hover:border-blue-400",
        )}
      >
        <Check className="w-3 h-3" />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate block">
          {exam.title}
        </span>
      </div>

      {/* Type */}
      <span className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
        TYPE_COLORS[exam.type] || "bg-slate-100 text-slate-600",
      )}>
        {TYPE_LABELS[exam.type] || exam.type}
      </span>

      {/* Class */}
      <span className="text-[11px] text-slate-500 w-16 truncate shrink-0">{exam.class?.name || "-"}</span>

      {/* Date */}
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 w-20 shrink-0">
        <Calendar className="w-3 h-3 text-slate-400" />
        {exam.examDate ? formatDate(exam.examDate) : "미정"}
      </span>

      {/* Questions */}
      <span className="text-[11px] text-slate-500 w-14 text-center shrink-0">{exam._count.questions}문제</span>

      {/* Status */}
      <span className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
        STATUS_COLORS[exam.status] || "bg-gray-100 text-gray-600",
      )}>
        {STATUS_LABELS[exam.status] || exam.status}
      </span>

      {/* Submissions */}
      <span className="text-[11px] text-slate-500 w-12 text-center shrink-0">{exam._count.submissions}명</span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onClick(exam.id)}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-slate-100 transition-colors"
        >
          <Eye className="w-3.5 h-3.5 text-slate-400" />
        </button>
        {exam.status === "DRAFT" && (
          <button
            onClick={() => onDelete(exam.id)}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ExamListClient({
  exams,
  classes,
  collections: initialCollections,
  collectionMembership: initialMembership,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [viewType, setViewType] = useState<"grid" | "list">("grid");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // ─── Folder manager ───
  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    entityLabel: "시험",
  });

  // ─── Client-side filtering ───
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (search && !exam.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "ALL" && exam.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && exam.status !== statusFilter) return false;
      if (classFilter !== "ALL" && exam.class?.id !== classFilter) return false;
      return true;
    });
  }, [exams, search, typeFilter, statusFilter, classFilter]);

  // ─── Filter by active folder ───
  const displayedExams = useMemo(
    () => folder.filterByActiveFolder(filteredExams),
    [folder.filterByActiveFolder, filteredExams],
  );

  const examIds = useMemo(() => displayedExams.map((e) => e.id), [displayedExams]);
  const selection = useSelection(examIds);

  // ─── Folder action wrappers ───
  const onAddToFolder = useCallback(
    async (collectionId: string) => {
      const result = await folder.handleAddToFolder(collectionId, [...selection.selectedIds]);
      if (result?.success) {
        selection.clearSelection();
      }
    },
    [folder, selection],
  );

  const onMoveToFolder = useCallback(
    async (collectionId: string) => {
      if (selection.selectedIds.size === 0) return;
      const anyId = selection.selectedIds.values().next().value as string | undefined;
      if (!anyId) return;
      const result = await folder.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selection.selectedIds,
      );
      if (result?.success) selection.clearSelection();
    },
    [folder, selection],
  );

  const onRemoveFromFolder = useCallback(async () => {
    const result = await folder.handleRemoveFromFolder([...selection.selectedIds]);
    if (result?.success) selection.clearSelection();
  }, [folder, selection]);

  const onDragToFolder = useCallback(
    (itemId: string, folderId: string, copy: boolean) => {
      folder.handleDragToFolder(itemId, folderId, copy, selection.selectedIds).then((result) => {
        if (result?.success) selection.clearSelection();
      });
    },
    [folder, selection],
  );

  const onFolderClick = useCallback(
    (folderId: string) => {
      folder.setActiveFolder(folderId);
      selection.clearSelection();
    },
    [folder, selection],
  );


  // ─── Delete handler ───
  async function handleDelete() {
    if (!deleteId) return;
    const result = await deleteExam(deleteId);
    if (result.success) {
      toast.success("시험이 삭제되었습니다.");
      router.refresh();
    } else {
      toast.error(result.error || "삭제에 실패했습니다.");
    }
    setDeleteId(null);
  }

  // ─── Filter + view-toggle bar (rendered inside FolderSection.toolbar) ───
  const filtersToolbar = (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
        <input
          placeholder="검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          className="w-40 h-7 pl-7 pr-2.5 text-[11.5px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="유형" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 유형</SelectItem>
          <SelectItem value="OFFLINE">오프라인</SelectItem>
          <SelectItem value="ONLINE">온라인</SelectItem>
          <SelectItem value="VOCAB">단어</SelectItem>
          <SelectItem value="MOCK">모의</SelectItem>
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[88px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 상태</SelectItem>
          <SelectItem value="DRAFT">초안</SelectItem>
          <SelectItem value="PUBLISHED">배포됨</SelectItem>
          <SelectItem value="IN_PROGRESS">진행중</SelectItem>
          <SelectItem value="COMPLETED">완료</SelectItem>
          <SelectItem value="ARCHIVED">보관</SelectItem>
        </SelectContent>
      </Select>

      <Select value={classFilter} onValueChange={setClassFilter}>
        <SelectTrigger className="w-[96px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="반" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 반</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
        <button
          onClick={() => setViewType("grid")}
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center transition-colors",
            viewType === "grid"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600",
          )}
          aria-label="그리드 보기"
        >
          <Grid2x2 className="w-3 h-3" />
        </button>
        <button
          onClick={() => setViewType("list")}
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center transition-colors",
            viewType === "list"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600",
          )}
          aria-label="목록 보기"
        >
          <List className="w-3 h-3" />
        </button>
      </div>

      <span className="h-5 w-px bg-slate-200" />

      <Link href="/director/exams/create">
        <Button size="sm" className="h-7 text-[11.5px] px-2.5 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-3 h-3 mr-1" />시험 만들기
        </Button>
      </Link>
    </>
  );

  // ─── "Add to folder" extra action for SelectionToolbar ───
  const addToFolderAction = (
    <>
      <MoveOrCopyFolderPicker
        collections={folder.collections}
        activeFolder={folder.activeFolder}
        selectedCount={selection.selectedIds.size}
        onCopy={onAddToFolder}
        onMove={onMoveToFolder}
      />

      <span className="text-slate-300">|</span>

      {/* Bulk delete */}
      <button
        onClick={() => {
          if (selection.selectedIds.size === 1) {
            setDeleteId([...selection.selectedIds][0]);
          } else {
            toast.info("삭제는 한 번에 하나의 시험만 가능합니다.");
          }
        }}
        className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        삭제
      </button>
    </>
  );

  const totalCount = exams.length;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Page header bar removed — identity + CTAs now live inside the
          sticky FolderSection card. */}

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pt-0 pb-4">
        {exams.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">등록된 시험이 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">시험을 만들어 문제를 관리하세요</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Link href="/director/exams/create">
                <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />시험 만들기
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Folders section — selection toolbar is embedded inside so it
                inherits the section's sticky positioning and stays pinned
                while the grid below scrolls. */}
            <FolderSection
              childFolders={folder.childFolders}
              activeFolder={folder.activeFolder}
              dragItemType="exam"
              dragItemIdKey="examId"
              itemCountLabel="시험"
              showNewFolder={folder.showNewFolder}
              newFolderName={folder.newFolderName}
              onNewFolderNameChange={folder.setNewFolderName}
              onShowNewFolder={folder.setShowNewFolder}
              onCreateFolder={folder.handleCreateFolder}
              onNavigateToFolder={onFolderClick}
              onRenameFolder={folder.handleRenameFolder}
              onDeleteFolder={folder.handleDeleteFolder}
              onDragToFolder={onDragToFolder}
              useCardInsideFolder={true}
              toolbar={filtersToolbar}
              pageHeader={{
                icon: <GraduationCap className="h-3.5 w-3.5" />,
                title: "시험 관리",
                totalCount,
                itemLabel: "시험",
              }}
              selectionBar={
                <SelectionToolbar
                  embedded
                  selectedCount={selection.selectedIds.size}
                  totalCount={displayedExams.length}
                  isAllSelected={selection.isAllSelected}
                  onSelectAll={selection.selectAll}
                  onClearSelection={selection.clearSelection}
                  activeFolder={folder.activeFolder}
                  onRemoveFromFolder={onRemoveFromFolder}
                  extraActions={addToFolderAction}
                />
              }
            />

            {/* Exams section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-slate-600">
                  시험지
                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">{displayedExams.length}개</span>
                </h3>
              </div>

              {displayedExams.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {folder.activeFolder ? "이 폴더에 시험이 없습니다." : "조건에 맞는 시험이 없습니다."}
                  </p>
                  {folder.activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">시험을 드래그하거나 선택 후 &quot;폴더에 추가&quot;를 사용하세요.</p>
                  )}
                </div>
              ) : viewType === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {displayedExams.map((exam) => (
                    <ExamFileCard
                      key={exam.id}
                      exam={exam}
                      selected={selection.selectedIds.has(exam.id)}
                      onToggleSelect={selection.toggleSelect}
                      onClick={(id) => router.push(`/director/exams/${id}`)}
                    />
                  ))}
                </div>
              ) : (
                /* List view — with drag support */
                <div className="space-y-1.5">
                  {displayedExams.map((exam) => (
                    <ExamListRow
                      key={exam.id}
                      exam={exam}
                      selected={selection.selectedIds.has(exam.id)}
                      onToggleSelect={selection.toggleSelect}
                      onClick={(id) => router.push(`/director/exams/${id}`)}
                      onDelete={setDeleteId}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 시험과 관련된 모든 데이터가 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
