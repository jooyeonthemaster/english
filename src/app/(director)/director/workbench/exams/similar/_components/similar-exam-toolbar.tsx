"use client";

import { Command, Eye, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 중앙(패턴 분석 시험지) 상단 툴바 — 시험지 생성의 PreviewToolbar 외형 복제.
// 빌더의 저장/인쇄/다운로드 자리에는 동형 액션(생성 시작·작업 새로고침)을 둔다.
// ---------------------------------------------------------------------------

interface SimilarExamToolbarProps {
  staged: boolean;
  totalPages: number;
  busy: boolean;
  canGenerate: boolean;
  selectedPassageCount: number;
  onOpenCommandPalette: () => void;
  onGenerate: () => void;
}

export function SimilarExamToolbar({
  staged,
  totalPages,
  busy,
  canGenerate,
  selectedPassageCount,
  onOpenCommandPalette,
  onGenerate,
}: SimilarExamToolbarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-slate-400" />
        <span className="whitespace-nowrap text-[12px] font-bold text-slate-600">
          패턴 분석 시험지
        </span>
        {staged ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {totalPages}페이지
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            미입력
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 sm:inline-flex">
          지문 {selectedPassageCount}개
        </span>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          title="빠른 실행 (Ctrl/⌘+K)"
          aria-label="빠른 실행"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Command className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[11px] font-bold text-white transition-colors",
            "bg-slate-900 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300",
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          시험지 생성 시작
        </button>
      </div>
    </div>
  );
}
