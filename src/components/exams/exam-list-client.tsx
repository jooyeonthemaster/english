// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  GraduationCap,
  Grid2x2,
  List,
  Loader2,
  Trash2,
} from "lucide-react";
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
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";

// Hooks
import { useSelection } from "@/components/workbench/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";

// Exam card
import { ExamFileCard } from "./exam-file-card";
import { ExamQuickViewDialog } from "./exam-quick-view-dialog";

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

const EXAM_VIEW_OPTIONS = [
  { value: "grid", label: "그리드 보기", Icon: Grid2x2 },
  { value: "list", label: "목록 보기", Icon: List },
] satisfies ReadonlyArray<ViewModeCycleOption<"grid" | "list">>;

// ---------------------------------------------------------------------------
// Shared chrome helpers (mirrors question-bank-client)
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
  const [quickViewExamId, setQuickViewExamId] = useState<string | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
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

  const openQuickView = useCallback((examId: string) => {
    setQuickViewExamId(examId);
    setQuickViewOpen(true);
  }, []);

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

  const totalCount = exams.length;

  // ─── Sticky measurement so the toolbar row pins below the folder card ───
  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(true);

  // ─── Selection-gated bulk actions (left side of toolbar) ───
  const selectionExtraActions = (
    <>
      <MoveOrCopyFolderPicker
        collections={folder.collections}
        activeFolder={folder.activeFolder}
        selectedCount={selection.selectedIds.size}
        onCopy={onAddToFolder}
        onMove={onMoveToFolder}
      />

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

  // ─── Toolbar row (mirrors question-bank-client) ───
  const toolbarRow = (
    <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
      <div className="flex items-center gap-2">
        <SelectAllCheckbox
          checked={selection.isAllSelected && selection.selectedIds.size > 0}
          indeterminate={
            selection.selectedIds.size > 0 && !selection.isAllSelected
          }
          disabled={displayedExams.length === 0}
          onChange={selection.selectAll}
          title={`${selection.selectedIds.size}부 선택`}
          ariaLabel={selection.isAllSelected ? "전체 해제" : "전체 선택"}
        />
        <div
          className={
            "flex items-center gap-3 " +
            (selection.selectedIds.size > 0
              ? ""
              : "pointer-events-none opacity-50")
          }
          aria-disabled={selection.selectedIds.size === 0}
        >
          {selectionExtraActions}
          {folder.activeFolder ? (
            <button
              type="button"
              onClick={onRemoveFromFolder}
              title="폴더에서 삭제"
              aria-label="폴더에서 삭제"
              className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              폴더에서 삭제
            </button>
          ) : null}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        <FiltersToolbar
          search={search}
          setSearch={setSearch}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          classes={classes}
        />
        <ViewModeCycleButton
          value={viewType}
          options={EXAM_VIEW_OPTIONS}
          onChange={setViewType}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]">
      {/* ─── Content ─── */}
      <div className="-mx-6 flex-1 bg-[#F4F6F9] px-6 pt-2 pb-4 sm:px-8">
        {exams.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">등록된 시험이 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">
              시험을 만들어 문제를 관리하세요
            </p>
          </div>
        ) : (
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Sticky layer 1 — folder section (page identity + folders) */}
            <div
              ref={folderStickyRef}
              className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
            >
              <FolderSection
                embedded
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
                enableFolderControls
                allFolders={folder.collections}
                storageKey="exams"
                treatRootAsFolder
                pageHeader={{
                  icon: <GraduationCap className="h-3.5 w-3.5" />,
                  parentLabel: "시험 관리",
                  title: "전체 시험",
                  totalCount,
                  itemLabel: "시험",
                  itemUnit: "부",
                }}
              />
            </div>

            {/* Sticky layer 2 — selection + filter toolbar */}
            <div
              style={{ top: folderStickyHeight }}
              className="sticky z-20 shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90"
            >
              {toolbarRow}
            </div>

            {/* Cards / list */}
            <div className="min-w-0 px-4 pb-3 pt-3 sm:px-5">
              {displayedExams.length === 0 ? (
                <div className="py-12 text-center">
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
                      onClick={openQuickView}
                      onEdit={(id) =>
                        router.push(`/director/workbench/exams/${id}/edit`)
                      }
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
                      onClick={openQuickView}
                      onEdit={(id) =>
                        router.push(`/director/workbench/exams/${id}/edit`)
                      }
                      onDelete={setDeleteId}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
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

      <ExamQuickViewDialog
        examId={quickViewExamId}
        open={quickViewOpen}
        onOpenChange={setQuickViewOpen}
      />
    </div>
  );
}
