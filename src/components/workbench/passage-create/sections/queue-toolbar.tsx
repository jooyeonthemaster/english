"use client";

import {
  Search,
  X,
  Filter,
  FolderOpen,
  FolderPlus,
  Check,
  Loader2,
} from "lucide-react";
import type { PassageCollection } from "../types";

interface QueueToolbarProps {
  queueLength: number;
  filteredLength: number;
  activeCount: number;
  filterSearch: string;
  setFilterSearch: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean | ((prev: boolean) => boolean)) => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;

  // Folders
  collections: PassageCollection[];
  filterCollection: string;
  setFilterCollection: (v: string) => void;
  editingFolderId: string | null;
  setEditingFolderId: (v: string | null) => void;
  editingFolderName: string;
  setEditingFolderName: (v: string) => void;
  onRenameFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  showNewFolder: boolean;
  setShowNewFolder: (v: boolean) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  onCreateFolder: () => void;
}

export function QueueToolbar(props: QueueToolbarProps) {
  const {
    queueLength,
    filteredLength,
    activeCount,
    filterSearch,
    setFilterSearch,
    showFilters,
    setShowFilters,
    hasActiveFilters,
    activeFilterCount,
    collections,
    filterCollection,
    setFilterCollection,
    editingFolderId,
    setEditingFolderId,
    editingFolderName,
    setEditingFolderName,
    onRenameFolder,
    onDeleteFolder,
    showNewFolder,
    setShowNewFolder,
    newFolderName,
    setNewFolderName,
    onCreateFolder,
  } = props;

  return (
    <div className="flex items-center gap-3 mb-3">
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          placeholder="지문 검색..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          className="w-full h-9 pl-9 pr-3 text-[13px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
        />
        {filterSearch && (
          <button onClick={() => setFilterSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
      </div>

      {/* Filter toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className={`h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
          hasActiveFilters ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
        }`}
      >
        <Filter className="w-3.5 h-3.5" />
        필터
        {hasActiveFilters && (
          <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Folder management */}
      <div className="flex items-center gap-1">
        {collections.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilterCollection(filterCollection === c.id ? "" : c.id)}
            onDoubleClick={() => { setEditingFolderId(c.id); setEditingFolderName(c.name); }}
            className={`h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
              filterCollection === c.id
                ? "bg-blue-50 border-blue-200 text-blue-600"
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
            title={`${c.name} (${c._count.items}개) — 더블클릭으로 이름 변경`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {editingFolderId === c.id ? (
              <input
                autoFocus
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                onBlur={() => onRenameFolder(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameFolder(c.id);
                  if (e.key === "Escape") setEditingFolderId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-20 bg-transparent outline-none border-b border-blue-400 text-[12px]"
              />
            ) : (
              <>
                {c.name}
                <span className="text-[10px] text-slate-400">{c._count.items}</span>
              </>
            )}
            {filterCollection === c.id && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onDeleteFolder(c.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDeleteFolder(c.id); } }}
                className="ml-0.5 p-0.5 rounded hover:bg-red-50 cursor-pointer"
                title="폴더 삭제"
              >
                <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
              </span>
            )}
          </button>
        ))}

        {showNewFolder ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              placeholder="폴더 이름"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateFolder();
                if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
              }}
              className="h-9 w-32 px-3 text-[12px] rounded-lg border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500/10"
            />
            <button onClick={onCreateFolder} className="h-9 px-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="h-9 px-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewFolder(true)}
            className="h-9 px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            새 폴더
          </button>
        )}
      </div>

      <div className="flex-1" />

      {/* Info */}
      <span className="text-[12px] text-slate-400">
        {filteredLength !== queueLength
          ? `${filteredLength} / ${queueLength}개`
          : `${queueLength}개`}
      </span>
      {activeCount > 0 && (
        <span className="text-[11px] text-blue-600 font-medium">
          <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
          {activeCount}개 분석 중
        </span>
      )}
    </div>
  );
}
