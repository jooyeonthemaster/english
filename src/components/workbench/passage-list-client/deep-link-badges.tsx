// @ts-nocheck
"use client";

import React from "react";
import { BookMarked, Folder, X } from "lucide-react";

interface Props {
  sourceMaterialBadge: { id: string; label: string } | null;
  collectionBadge: { id: string; label: string } | null;
  updateFilter: (key: string, value: string) => void;
}

export function DeepLinkBadges({
  sourceMaterialBadge,
  collectionBadge,
  updateFilter,
}: Props) {
  if (!sourceMaterialBadge && !collectionBadge) return null;

  return (
    <div className="px-6 py-2 bg-sky-50/70 border-b border-sky-100 flex items-center gap-2 shrink-0">
      <span className="text-[11px] font-semibold text-slate-500 mr-1">필터 고정됨</span>
      {sourceMaterialBadge && (
        <button
          type="button"
          onClick={() => updateFilter("sourceMaterialId", "")}
          className="group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-white text-[11px] font-medium text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
          title="이 시험지 필터 해제"
        >
          <BookMarked className="w-3 h-3" />
          <span className="truncate max-w-[220px]">{sourceMaterialBadge.label}</span>
          <X className="w-3 h-3 text-slate-400 group-hover:text-sky-700" />
        </button>
      )}
      {collectionBadge && (
        <button
          type="button"
          onClick={() => updateFilter("collectionId", "")}
          className="group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-white text-[11px] font-medium text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
          title="이 폴더 필터 해제"
        >
          <Folder className="w-3 h-3" />
          <span className="truncate max-w-[180px]">{collectionBadge.label}</span>
          <X className="w-3 h-3 text-slate-400 group-hover:text-sky-700" />
        </button>
      )}
    </div>
  );
}
