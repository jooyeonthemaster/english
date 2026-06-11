"use client";

import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ClipboardList,
  Grid2X2,
  Grid3X3,
  List,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { QueuedPassage } from "@/hooks/use-passage-queue";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import type { PassageCollection } from "../types";
import {
  handleAddToFolder as addToFolder,
  handleMoveToFolder as moveToFolder,
} from "../folder-actions";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { QueueEmpty } from "./queue-empty";
import { QueueGrid, type QueueGridCols } from "./queue-grid";

// passage-create 컬렉션(평면 구조)을 공용 폴더 피커가 기대하는 CollectionItem 으로 변환.
function adaptCollections(list: PassageCollection[]): CollectionItem[] {
  return list.map((c) => ({
    id: c.id,
    parentId: null,
    name: c.name,
    description: c.description,
    color: c.color,
    _count: { items: c._count.items, children: 0 },
  }));
}

interface QueueSectionContainerProps {
  queue: QueuedPassage[];
  filteredQueue: QueuedPassage[];
  activeCount: number;

  // Filters
  filterSearch: string;
  setFilterSearch: (v: string) => void;
  filterSchool: string;
  setFilterSchool: (v: string) => void;
  filterGrade: string;
  setFilterGrade: (v: string) => void;
  filterSemester: string;
  setFilterSemester: (v: string) => void;
  filterPublisher: string;
  setFilterPublisher: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean | ((prev: boolean) => boolean)) => void;
  filterOptions: {
    schoolNames: string[];
    grades: number[];
    publishers: string[];
  };
  hasActiveFilters: boolean;

  // Collections
  collections: PassageCollection[];
  setCollections: Dispatch<SetStateAction<PassageCollection[]>>;
  filterCollection: string;
  setFilterCollection: (v: string) => void;
  editingFolderId: string | null;
  setEditingFolderId: (v: string | null) => void;
  editingFolderName: string;
  setEditingFolderName: (v: string) => void;
  showNewFolder: boolean;
  setShowNewFolder: (v: boolean) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  showAddToFolder: boolean;
  setShowAddToFolder: (v: boolean | ((prev: boolean) => boolean)) => void;
  addingToFolder: boolean;
  setAddingToFolder: (v: boolean) => void;
  collectionPassageIds: Map<string, Set<string>>;
  setCollectionPassageIds: Dispatch<SetStateAction<Map<string, Set<string>>>>;

  // Selection
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  toggleSelect: (id: string, shiftKey: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Modal / queue actions
  setModalPassageId: (id: string | null) => void;
  retryAnalysis: (id: string) => void;
  removeFromQueue: (id: string) => void;
}

const QUEUE_GRID_OPTIONS = [
  { value: "grid3", label: "3열 보기", Icon: Grid3X3 },
  { value: "grid2", label: "2열 보기", Icon: Grid2X2 },
  { value: "list", label: "목록 보기", Icon: List },
] satisfies ReadonlyArray<ViewModeCycleOption<QueueGridCols>>;

export function QueueSectionContainer(p: QueueSectionContainerProps) {
  const [gridCols, setGridCols] = usePersistedState<QueueGridCols>(
    "smoat:view-mode:passage-registration-queue",
    "grid3",
    (v): v is QueueGridCols =>
      v === "grid3" || v === "grid2" || v === "list",
  );
  const { triggerRefresh } = useTaskQueue();
  // 마키(영역 드래그) 시작 영역 = 이 "지문 목록" 섹션 전체(헤더·툴바·그리드). 같은
  // 페이지의 "자료 관리" 패널과 boundary 가 분리돼 서로 섞이지 않는다.
  const marqueeBoundaryRef = useRef<HTMLElement>(null);

  // ─── 선택 상태(툴바 상시 표시용) ───
  const selectedCount = p.selectedIds.size;
  const allSelected =
    p.filteredQueue.length > 0 &&
    p.filteredQueue.every((q) => p.selectedIds.has(q.id));
  const someSelected = selectedCount > 0 && !allSelected;
  const adaptedCollections = adaptCollections(p.collections);
  const handleCopyToFolder = (collectionId: string) =>
    addToFolder({
      collectionId,
      selectedIds: p.selectedIds,
      setAddingToFolder: p.setAddingToFolder,
      setCollections: p.setCollections,
      setCollectionPassageIds: p.setCollectionPassageIds,
      clearSelection: p.clearSelection,
    });
  const handleMoveToFolder = (collectionId: string) =>
    moveToFolder({
      collectionId,
      selectedIds: p.selectedIds,
      collections: p.collections,
      collectionPassageIds: p.collectionPassageIds,
      setAddingToFolder: p.setAddingToFolder,
      setCollections: p.setCollections,
      setCollectionPassageIds: p.setCollectionPassageIds,
      clearSelection: p.clearSelection,
    });
  // 선택한 지문을 목록에서 일괄 삭제(로컬 큐에서 제거).
  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    if (
      !window.confirm(`선택한 ${selectedCount}개 지문을 목록에서 삭제할까요?`)
    )
      return;
    p.selectedIds.forEach((id) => p.removeFromQueue(id));
    p.clearSelection();
  };

  return (
    <div className="min-w-0">
      {p.queue.length === 0 ? (
        <QueueEmpty />
      ) : (
        <section
          ref={marqueeBoundaryRef}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
        >
          {/* ─── Section header ─── */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <ClipboardList className="size-4" aria-hidden="true" />
              </span>
              <h3 className="truncate text-[13px] font-bold text-slate-900">
                지문 목록
              </h3>
              {/* 전체 선택 체크박스 — 제목 오른쪽에 상시 표시(다른 페이지 툴바와 통일) */}
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={p.selectAll}
                disabled={p.filteredQueue.length === 0}
                title="전체 선택"
                aria-label="전체 선택"
                className="size-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span
                aria-hidden="true"
                className="shrink-0 text-[11px] font-medium text-slate-300"
              >
                ·
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                {selectedCount > 0
                  ? `${selectedCount}개 선택`
                  : `${p.queue.length}개`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* 삭제 — 선택한 지문을 목록에서 제거(선택이 없으면 비활성) */}
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedCount === 0}
                title="선택 삭제"
                aria-label="선택 삭제"
                className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-200 bg-white px-2.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </button>
              {/* 이동 / 복사 — 상시 표시(선택이 없으면 비활성) */}
              <MoveOrCopyFolderPicker
                collections={adaptedCollections}
                activeFolder={p.filterCollection || null}
                selectedCount={selectedCount}
                onCopy={handleCopyToFolder}
                onMove={handleMoveToFolder}
                disabled={selectedCount === 0}
              />
              <span
                aria-hidden="true"
                className="shrink-0 text-slate-200"
              >
                |
              </span>
              <span className="shrink-0 text-[11px] font-medium text-slate-400">
                최신순으로 표시됩니다
              </span>
              <button
                type="button"
                onClick={() => triggerRefresh()}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="작업 목록 새로고침"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </button>
              <ViewModeCycleButton
                value={gridCols}
                options={QUEUE_GRID_OPTIONS}
                onChange={setGridCols}
              />
            </div>
          </div>

          {/* ─── Body ─── */}
          <div className="px-4 py-3">
            {/* ─── Card grid ─── */}
            <QueueGrid
              filteredQueue={p.filteredQueue}
              selectedIds={p.selectedIds}
              setSelectedIds={p.setSelectedIds}
              onToggleSelect={p.toggleSelect}
              onViewDetail={p.setModalPassageId}
              onRetry={p.retryAnalysis}
              onRemove={p.removeFromQueue}
              gridCols={gridCols}
              marqueeBoundaryRef={marqueeBoundaryRef}
            />
          </div>
        </section>
      )}
    </div>
  );
}
