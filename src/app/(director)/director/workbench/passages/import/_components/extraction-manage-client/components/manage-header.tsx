"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Database } from "lucide-react";

import type { CollectionItem } from "@/components/workbench/shared/types";

import { DraftBreadcrumbNav } from "./draft-breadcrumb-nav";

export type StatusFilter =
  | "ALL"
  | "RESTORED"
  | "PENDING"
  | "PARTIAL"
  | "FAILED"
  | "NO_RESTORATION_NEEDED";
export type SortOrder = "newest" | "oldest" | "page_asc";

interface ManageHeaderProps {
  totalCount: number;
  resultScope: "all" | "job";
  activeFolder: string | null;
  breadcrumbPath: CollectionItem[];

  onBackToAllResults: () => void;
  onNavigateUp: () => void;
  onNavigateToFolder: (id: string | null) => void;

  /**
   * Right-side slot. Originally hosted the search / filter / refresh /
   * queue / upload row; that row now lives directly above the draft grid,
   * and this slot is reserved for the selection toolbar so bulk actions
   * are always visible at the top of the page.
   */
  rightArea?: ReactNode;
}

export function ManageHeader({
  totalCount,
  resultScope,
  activeFolder,
  breadcrumbPath,
  onBackToAllResults,
  onNavigateUp,
  onNavigateToFolder,
  rightArea,
}: ManageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 shrink-0 sm:px-5 sm:gap-4 xl:px-6">
      {/* Left: back/icon + title + breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {activeFolder ? (
          <button
            type="button"
            onClick={onNavigateUp}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
            aria-label="상위 폴더로"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Database className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">자료 관리</h1>
            <span className="text-sm tabular-nums text-slate-400">{totalCount}개</span>
            <DraftBreadcrumbNav
              activeFolder={activeFolder}
              breadcrumbPath={breadcrumbPath}
              onNavigateToFolder={onNavigateToFolder}
              rootLabel="전체 자료"
            />
            {resultScope === "job" ? (
              <button
                type="button"
                onClick={onBackToAllResults}
                className="ml-1 cursor-pointer rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                전체 결과로
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            추출한 지문을 폴더로 정리하고 복원문을 검수합니다.
          </p>
        </div>
      </div>

      {rightArea ? (
        <div className="flex min-w-0 shrink-0 items-center justify-end">
          {rightArea}
        </div>
      ) : null}
    </div>
  );
}
