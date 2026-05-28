// @ts-nocheck
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, GraduationCap, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addExamsToCollection,
  bulkDeleteExams,
  createExamCollection,
  deleteExam,
  deleteExamCollection,
  removeExamsFromCollection,
  updateExamCollection,
} from "@/actions/exams";
import { Button } from "@/components/ui/button";
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

// Shared folder modules
import type { CollectionItem } from "@/components/workbench/shared/types";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import { SelectionToolbar } from "@/components/workbench/shared/selection-toolbar";

// Hooks
import { useSelection } from "@/components/workbench/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";

// Exam card
import { ExamFileCard } from "./exam-file-card";

import { ExamListRow } from "./exam-list-client-parts/exam-list-row";
import { FiltersToolbar } from "./exam-list-client-parts/filters-toolbar";
import type { ClassOption, ExamItem } from "./exam-list-client-parts/types";

interface Props {
  exams: ExamItem[];
  classes: ClassOption[];
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
}

// ---------------------------------------------------------------------------
// Server action adapters
// ---------------------------------------------------------------------------
const folderActions = {
  createCollection: createExamCollection,
  updateCollection: updateExamCollection,
  deleteCollection: deleteExamCollection,
  addToCollection: addExamsToCollection,
  removeFromCollection: removeExamsFromCollection,
};

// ---------------------------------------------------------------------------
// 시험 관리 메인 페이지
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
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Optimistically hide deleted exams until router.refresh() updates props —
  // same pattern as passage-list-client / question-bank-client.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // ─── Folder manager ───
  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    itemLabel: "시험",
  });
  const { filterByActiveFolder } = folder;

  // ─── Client-side filtering ───
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (removedIds.has(exam.id)) return false;
      if (search && !exam.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "ALL" && exam.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && exam.status !== statusFilter) return false;
      if (classFilter !== "ALL" && exam.class?.id !== classFilter) return false;
      return true;
    });
  }, [exams, removedIds, search, typeFilter, statusFilter, classFilter]);

  // ─── Filter by active folder ───
  const displayedExams = useMemo(
    () => filterByActiveFolder(filteredExams),
    [filterByActiveFolder, filteredExams],
  );

  const examIds = useMemo(() => displayedExams.map((e) => e.id), [displayedExams]);
  const selection = useSelection(examIds);

  // ─── Folder action wrappers ───
  const onAddToFolder = useCallback(
    async (collectionId: string) => {
      const success = await folder.handleAddToFolder(collectionId, selection.selectedIds);
      if (success) {
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
      const success = await folder.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selection.selectedIds,
      );
      if (success) selection.clearSelection();
    },
    [folder, selection],
  );

  const onRemoveFromFolder = useCallback(async () => {
    const success = await folder.handleRemoveFromFolder(selection.selectedIds);
    if (success) selection.clearSelection();
  }, [folder, selection]);

  const onDragToFolder = useCallback(
    (itemId: string, folderId: string, copy: boolean) => {
      folder
        .handleDragToFolder(itemId, folderId, copy, selection.selectedIds)
        .then((success) => {
          if (success) selection.clearSelection();
        });
    },
    [folder, selection],
  );

  const onDragToRoot = useCallback(
    (itemId: string, copy: boolean) => {
      if (copy || !folder.activeFolder) return;
      const ids = selection.selectedIds.has(itemId)
        ? selection.selectedIds
        : new Set([itemId]);
      folder.handleRemoveFromFolder(ids).then((success) => {
        if (success) selection.clearSelection();
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
    const targetId = deleteId;
    const result = await deleteExam(targetId);
    if (result.success) {
      toast.success("시험이 삭제되었습니다.");
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.add(targetId);
        return next;
      });
      router.refresh();
    } else {
      toast.error(result.error || "삭제에 실패했습니다.");
    }
    setDeleteId(null);
  }

  // ─── Bulk delete handler ───
  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteExams(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === result.requested) {
        toast.success(`${result.deleted}부의 시험을 삭제했습니다.`);
      } else if (result.deleted === 0) {
        // Only DRAFT exams are deletable — surface that as a more helpful
        // message than the generic "no rows" path.
        if (result.skippedNonDraft > 0) {
          toast.error("초안 상태의 시험만 삭제할 수 있습니다.");
        } else {
          toast.error("삭제된 시험이 없습니다.");
        }
      } else {
        const missing = result.requested - result.deleted;
        const reason =
          result.skippedNonDraft > 0
            ? `(${result.skippedNonDraft}부는 초안이 아니어서 제외됨)`
            : "";
        toast.warning(
          `${result.deleted}부 삭제됨, ${missing}부 누락 ${reason}`.trim(),
        );
      }
      // Hide only the ids that the server confirmed it could delete. If the
      // server skipped non-DRAFT exams, leave them visible since they're
      // still real rows the user might still want to act on.
      if (result.deleted > 0) {
        // We don't know exactly which subset got deleted when deleted <
        // requested. In that rare case fall back to optimistically hiding
        // every requested id; router.refresh() restores anything the server
        // actually kept.
        const idsToHide =
          result.deleted === result.requested ? ids : ids;
        setRemovedIds((prev) => {
          const next = new Set(prev);
          for (const id of idsToHide) next.add(id);
          return next;
        });
      }
      selection.clearSelection();
      setBulkDeleteOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }, [selection, bulkDeleting, router]);

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
        type="button"
        onClick={() => setBulkDeleteOpen(true)}
        disabled={selection.selectedIds.size === 0 || bulkDeleting}
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
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  시험 만들기
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
              onDragToRoot={onDragToRoot}
              breadcrumbPath={folder.breadcrumbPath}
              onNavigateToRoot={() => {
                folder.setActiveFolder(null);
                selection.clearSelection();
              }}
              useCardInsideFolder={true}
              rootLabel="전체 시험"
              toolbar={
                <FiltersToolbar
                  search={search}
                  setSearch={setSearch}
                  typeFilter={typeFilter}
                  setTypeFilter={setTypeFilter}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  classFilter={classFilter}
                  setClassFilter={setClassFilter}
                  viewType={viewType}
                  setViewType={setViewType}
                  classes={classes}
                />
              }
              pageHeader={{
                icon: <GraduationCap className="h-3.5 w-3.5" />,
                title: "시험 관리",
                totalCount,
                itemLabel: "시험",
                itemUnit: "부",
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
                  itemUnit="부"
                />
              }
            />

            {/* Exams section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-slate-600">
                  시험지
                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">
                    {displayedExams.length}부
                  </span>
                </h3>
              </div>

              {displayedExams.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {folder.activeFolder
                      ? "이 폴더에 시험이 없습니다."
                      : "조건에 맞는 시험이 없습니다."}
                  </p>
                  {folder.activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">
                      시험을 드래그하거나 선택 후 &quot;폴더에 추가&quot;를
                      사용하세요.
                    </p>
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
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 시험과 관련된 모든 데이터가
              삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!bulkDeleting) setBulkDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              선택한 시험 {selection.selectedIds.size}부를 삭제하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 초안 상태의 시험만 삭제되며,
              배포된 시험은 자동으로 건너뜁니다.
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
