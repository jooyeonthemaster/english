"use client";

import { cn } from "@/lib/utils";

/** 페이지 번호 윈도우(양끝 + 현재 주변, 나머지는 … 축약). total<=7이면 전부 표시. */
export function getPageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

/** 어드민 목록 공용 페이저 — 가운데 정렬 · 이전/다음 · 페이지 번호 선택. */
export function AdminPagination({
  page,
  totalPages,
  disabled = false,
  onChange,
}: {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const navBtn =
    "inline-flex h-8 items-center justify-center rounded-md border border-gray-200 px-3 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 border-t border-gray-100 px-5 py-3">
      <button
        type="button"
        className={navBtn}
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
      >
        이전
      </button>
      {getPageWindow(page, totalPages).map((entry, index) =>
        entry === "…" ? (
          <span key={`ellipsis-${index}`} className="px-1.5 text-[12px] text-gray-300">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            disabled={disabled}
            aria-current={entry === page ? "page" : undefined}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[12px] font-semibold transition disabled:cursor-not-allowed",
              entry === page
                ? "bg-slate-900 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
          >
            {entry}
          </button>
        ),
      )}
      <button
        type="button"
        className={navBtn}
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
      >
        다음
      </button>
    </div>
  );
}
