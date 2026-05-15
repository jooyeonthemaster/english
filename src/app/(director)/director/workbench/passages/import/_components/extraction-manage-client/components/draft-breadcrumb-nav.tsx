"use client";

import { ChevronRight } from "lucide-react";

import type { CollectionItem } from "@/components/workbench/shared/types";

interface DraftBreadcrumbNavProps {
  activeFolder: string | null;
  breadcrumbPath: CollectionItem[];
  onNavigateToFolder: (id: string | null) => void;
  rootLabel: string;
}

export function DraftBreadcrumbNav({
  activeFolder,
  breadcrumbPath,
  onNavigateToFolder,
  rootLabel,
}: DraftBreadcrumbNavProps) {
  void activeFolder;
  void rootLabel;
  if (breadcrumbPath.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm">
      {breadcrumbPath.map((folder, i) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="size-3.5 text-slate-300" />
          {i === breadcrumbPath.length - 1 ? (
            <span className="font-semibold text-slate-700">{folder.name}</span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateToFolder(folder.id)}
              className="cursor-pointer text-blue-600 hover:underline"
            >
              {folder.name}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
