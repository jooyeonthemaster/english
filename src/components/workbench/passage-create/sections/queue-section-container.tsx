"use client";

import type { Dispatch, SetStateAction } from "react";
import type { QueuedPassage } from "@/hooks/use-passage-queue";
import type { PassageCollection } from "../types";
import {
  handleCreateFolder as createFolder,
  handleRenameFolder as renameFolder,
  handleDeleteFolder as deleteFolder,
  handleAddToFolder as addToFolder,
} from "../folder-actions";
import { QueueEmpty } from "./queue-empty";
import { QueueToolbar } from "./queue-toolbar";
import { QueueFilterRow } from "./queue-filter-row";
import { QueueSelectionBar } from "./queue-selection-bar";
import { QueueGrid } from "./queue-grid";

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
  setCollectionPassageIds: Dispatch<SetStateAction<Map<string, Set<string>>>>;

  // Selection
  selectedIds: Set<string>;
  toggleSelect: (id: string, shiftKey: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Modal / queue actions
  setModalPassageId: (id: string | null) => void;
  retryAnalysis: (id: string) => void;
  removeFromQueue: (id: string) => void;
}

export function QueueSectionContainer(p: QueueSectionContainerProps) {
  return (
    <div className="px-6 py-5">
      {p.queue.length === 0 ? (
        <QueueEmpty />
      ) : (
        <>
          {/* ─── Search + Filter bar ─── */}
          <QueueToolbar
            queueLength={p.queue.length}
            filteredLength={p.filteredQueue.length}
            activeCount={p.activeCount}
            filterSearch={p.filterSearch}
            setFilterSearch={p.setFilterSearch}
            showFilters={p.showFilters}
            setShowFilters={p.setShowFilters}
            hasActiveFilters={p.hasActiveFilters}
            activeFilterCount={[p.filterSchool, p.filterGrade, p.filterSemester, p.filterPublisher].filter(Boolean).length}
            collections={p.collections}
            filterCollection={p.filterCollection}
            setFilterCollection={p.setFilterCollection}
            editingFolderId={p.editingFolderId}
            setEditingFolderId={p.setEditingFolderId}
            editingFolderName={p.editingFolderName}
            setEditingFolderName={p.setEditingFolderName}
            onRenameFolder={(id) =>
              renameFolder({
                id,
                editingFolderName: p.editingFolderName,
                setCollections: p.setCollections,
                setEditingFolderId: p.setEditingFolderId,
              })
            }
            onDeleteFolder={(id) =>
              deleteFolder({
                id,
                filterCollection: p.filterCollection,
                setCollections: p.setCollections,
                setFilterCollection: p.setFilterCollection,
              })
            }
            showNewFolder={p.showNewFolder}
            setShowNewFolder={p.setShowNewFolder}
            newFolderName={p.newFolderName}
            setNewFolderName={p.setNewFolderName}
            onCreateFolder={() =>
              createFolder({
                newFolderName: p.newFolderName,
                setCollections: p.setCollections,
                setNewFolderName: p.setNewFolderName,
                setShowNewFolder: p.setShowNewFolder,
              })
            }
          />

          {/* ─── Expanded filter row ─── */}
          {p.showFilters && (
            <QueueFilterRow
              filterSchool={p.filterSchool}
              setFilterSchool={p.setFilterSchool}
              filterGrade={p.filterGrade}
              setFilterGrade={p.setFilterGrade}
              filterSemester={p.filterSemester}
              setFilterSemester={p.setFilterSemester}
              filterPublisher={p.filterPublisher}
              setFilterPublisher={p.setFilterPublisher}
              filterOptions={p.filterOptions}
              hasActiveFilters={p.hasActiveFilters}
              onResetFilters={() => { p.setFilterSearch(""); p.setFilterSchool(""); p.setFilterGrade(""); p.setFilterSemester(""); p.setFilterPublisher(""); }}
            />
          )}

          {/* ─── Selection toolbar ─── */}
          {p.selectedIds.size > 0 && (
            <QueueSelectionBar
              selectedCount={p.selectedIds.size}
              filteredLength={p.filteredQueue.length}
              onSelectAll={p.selectAll}
              onClearSelection={p.clearSelection}
              showAddToFolder={p.showAddToFolder}
              setShowAddToFolder={p.setShowAddToFolder}
              collections={p.collections}
              addingToFolder={p.addingToFolder}
              onAddToFolder={(collectionId) =>
                addToFolder({
                  collectionId,
                  selectedIds: p.selectedIds,
                  setAddingToFolder: p.setAddingToFolder,
                  setCollections: p.setCollections,
                  setCollectionPassageIds: p.setCollectionPassageIds,
                  clearSelection: p.clearSelection,
                  setShowAddToFolder: p.setShowAddToFolder,
                })
              }
            />
          )}

          {/* ─── Card grid ─── */}
          <QueueGrid
            filteredQueue={p.filteredQueue}
            selectedIds={p.selectedIds}
            onToggleSelect={p.toggleSelect}
            onViewDetail={p.setModalPassageId}
            onRetry={p.retryAnalysis}
            onRemove={p.removeFromQueue}
          />
        </>
      )}
    </div>
  );
}
