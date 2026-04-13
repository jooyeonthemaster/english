// @ts-nocheck
"use client";

import { ChevronRight } from "lucide-react";
import type { CollectionItem } from "./types";

interface BreadcrumbNavProps {
  activeFolder: string | null;
  breadcrumbPath: CollectionItem[];
  onNavigateToFolder: (id: string | null) => void;
  rootLabel: string;
}

export function BreadcrumbNav({
  activeFolder,
  breadcrumbPath,
  onNavigateToFolder,
  rootLabel,
}: BreadcrumbNavProps) {
  if (breadcrumbPath.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-[12px]">
      {breadcrumbPath.map((folder, i) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-slate-300" />
          {i === breadcrumbPath.length - 1 ? (
            <span className="text-slate-700 font-semibold">{folder.name}</span>
          ) : (
            <button
              onClick={() => onNavigateToFolder(folder.id)}
              className="text-blue-600 hover:underline"
            >
              {folder.name}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
