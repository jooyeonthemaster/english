"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ClipboardList, Grid2X2, Grid3X3, List, RefreshCw } from "lucide-react";
import type { QueuedPassage } from "@/hooks/use-passage-queue";
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
import { QueueEmpty } from "./queue-empty";
import { QueueSelectionBar } from "./queue-selection-bar";
import { QueueGrid, type QueueGridCols } from "./queue-grid";

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
  const [gridCols, setGridCols] = useState<QueueGridCols>("grid3");
  const { triggerRefresh } = useTaskQueue();

  return (
    <div className="min-w-0">
      {p.queue.length === 0 ? (
        <QueueEmpty />
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* ─── Section header ─── */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <ClipboardList className="size-4" aria-hidden="true" />
              </span>
              <h3 className="truncate text-[13px] font-bold text-slate-900">
                지문 목록
              </h3>
              <span
                aria-hidden="true"
                className="shrink-0 text-[11px] font-medium text-slate-300"
              >
                ·
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                {p.queue.length}개
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
            {/* ─── Selection toolbar ─── */}
            {p.selectedIds.size > 0 && (
              <QueueSelectionBar
                selectedCount={p.selectedIds.size}
                filteredLength={p.filteredQueue.length}
                onSelectAll={p.selectAll}
                onClearSelection={p.clearSelection}
                collections={p.collections}
                activeCollectionId={p.filterCollection || null}
                onAddToFolder={(collectionId) =>
                  addToFolder({
                    collectionId,
                    selectedIds: p.selectedIds,
                    setAddingToFolder: p.setAddingToFolder,
                    setCollections: p.setCollections,
                    setCollectionPassageIds: p.setCollectionPassageIds,
                    clearSelection: p.clearSelection,
                  })
                }
                onMoveToFolder={(collectionId) =>
                  moveToFolder({
                    collectionId,
                    selectedIds: p.selectedIds,
                    collections: p.collections,
                    collectionPassageIds: p.collectionPassageIds,
                    setAddingToFolder: p.setAddingToFolder,
                    setCollections: p.setCollections,
                    setCollectionPassageIds: p.setCollectionPassageIds,
                    clearSelection: p.clearSelection,
                  })
                }
              />
            )}

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
            />
          </div>
        </section>
      )}
    </div>
  );
}
