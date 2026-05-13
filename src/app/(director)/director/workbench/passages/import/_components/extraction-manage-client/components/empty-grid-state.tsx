"use client";

import { useRouter } from "next/navigation";
import { Database, FolderOpen, Search, UploadCloud } from "lucide-react";

type Variant = "no-drafts" | "empty-folder" | "no-search-results";

interface EmptyGridStateProps {
  variant: Variant;
  onResetFilters?: () => void;
}

export function EmptyGridState({ variant, onResetFilters }: EmptyGridStateProps) {
  const router = useRouter();

  if (variant === "no-drafts") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
        <Database className="mb-3 size-10 text-slate-200" aria-hidden="true" />
        <p className="text-[13px] font-bold text-slate-600">
          아직 추출된 자료가 없습니다
        </p>
        <p className="mt-1 text-[12px] text-slate-400">
          자료 추출 페이지에서 PDF/이미지/텍스트로 새 작업을 시작하세요.
        </p>
        <button
          type="button"
          onClick={() => router.push("/director/workbench/passages/import")}
          className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <UploadCloud className="size-3.5" />
          자료 추출하러 가기
        </button>
      </div>
    );
  }

  if (variant === "empty-folder") {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
        <FolderOpen className="mb-3 size-9 text-slate-200" aria-hidden="true" />
        <p className="text-[13px] font-bold text-slate-600">
          이 폴더에 아직 자료가 없습니다
        </p>
        <p className="mt-1 text-[12px] text-slate-400">
          전체 자료에서 카드를 드래그하거나, 다중 선택 후 폴더로 이동할 수 있습니다.
        </p>
      </div>
    );
  }

  // no-search-results
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <Search className="mb-3 size-9 text-slate-200" aria-hidden="true" />
      <p className="text-[13px] font-bold text-slate-600">검색 결과가 없습니다</p>
      <p className="mt-1 text-[12px] text-slate-400">
        검색어나 필터를 조정해 보세요.
      </p>
      {onResetFilters ? (
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          필터 초기화
        </button>
      ) : null}
    </div>
  );
}
