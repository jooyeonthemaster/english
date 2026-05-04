// @ts-nocheck
"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onGoToPage: (page: number) => void;
}

/**
 * Build the list of page numbers to display.
 * Always shows first, last, and current +/- 2, with -1 as ellipsis placeholder.
 */
function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);
  for (let i = current - 2; i <= current + 2; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push(-1); // ellipsis
    }
    result.push(sorted[i]);
  }
  return result;
}

export function Pagination({ page, totalPages, onGoToPage }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 pt-6">
      {/* First page */}
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onGoToPage(1)}
        className="h-8 w-8 p-0"
        aria-label="첫 페이지"
      >
        <ChevronsLeft className="w-4 h-4" />
      </Button>

      {/* Previous */}
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onGoToPage(page - 1)}
        className="h-8 w-8 p-0"
        aria-label="이전 페이지"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      {/* Page numbers */}
      {pageNumbers.map((p, idx) =>
        p === -1 ? (
          <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-[12px] text-slate-400">
            ...
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            onClick={() => onGoToPage(p)}
            className={`h-8 w-8 p-0 text-[12px] ${
              p === page
                ? "bg-slate-800 text-white hover:bg-slate-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            aria-label={`${p}페이지`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Button>
        )
      )}

      {/* Next */}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onGoToPage(page + 1)}
        className="h-8 w-8 p-0"
        aria-label="다음 페이지"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {/* Last page */}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onGoToPage(totalPages)}
        className="h-8 w-8 p-0"
        aria-label="마지막 페이지"
      >
        <ChevronsRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
