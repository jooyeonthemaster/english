// @ts-nocheck
"use client";

import { useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface PaginationProps {
  page: number;
  totalPages: number;
  onGoToPage: (page: number) => void;
  /**
   * 모바일에서 페이지를 넘길 때 이 요소의 상단(맨 윗 카드)으로 부드럽게
   * 스크롤한다. 스티키 헤더가 있는 목록은 헤더를 포함한 섹션을 가리켜야
   * 첫 카드가 헤더 아래로 정렬된다. 미지정 시 스크롤하지 않는다(데스크톱 불변).
   */
  scrollTargetRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Build the list of page numbers to display.
 * Always shows first, last, and current +/- siblings, with -1 as ellipsis placeholder.
 */
function getPageNumbers(current: number, total: number, siblings = 2): number[] {
  if (total <= siblings * 2 + 3) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);
  for (let i = current - siblings; i <= current + siblings; i++) {
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

export function Pagination({
  page,
  totalPages,
  onGoToPage,
  scrollTargetRef,
}: PaginationProps) {
  const isMobile = useIsMobile();

  // 페이지 변경 + (모바일 한정) 목록 맨 위로 부드럽게 스크롤.
  const goTo = useCallback(
    (p: number) => {
      onGoToPage(p);
      if (isMobile && scrollTargetRef?.current) {
        const el = scrollTargetRef.current;
        // 렌더 반영 후 스크롤(다음 프레임).
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    },
    [isMobile, onGoToPage, scrollTargetRef],
  );

  if (totalPages <= 1) return null;

  // 모바일은 현재 페이지 ±1만 보여 좌우 스크롤 없이 한 줄에 들어가게 한다.
  const pageNumbers = getPageNumbers(page, totalPages);
  const mobilePageNumbers = getPageNumbers(page, totalPages, 1);

  const renderPageButton = (p: number, idx: number) =>
    p === -1 ? (
      <span key={`ellipsis-${idx}`} className="flex h-7 w-6 shrink-0 items-center justify-center text-[12px] text-slate-400 md:h-8 md:w-8">
        ...
      </span>
    ) : (
      <Button
        key={p}
        variant={p === page ? "default" : "outline"}
        size="sm"
        onClick={() => goTo(p)}
        className={`h-7 w-7 shrink-0 p-0 text-[12px] md:h-8 md:w-8 ${
          p === page
            ? "bg-slate-800 text-white hover:bg-slate-700"
            : "text-slate-600 hover:bg-slate-50"
        }`}
        aria-label={`${p}페이지`}
        aria-current={p === page ? "page" : undefined}
      >
        {p}
      </Button>
    );

  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-0.5 px-1 pt-6 md:flex-nowrap md:gap-1 md:px-0">
      {/* First page — 모바일에선 숨겨 폭 확보(첫 페이지는 숫자 1로 이동 가능) */}
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => goTo(1)}
        className="hidden h-7 w-7 shrink-0 p-0 md:inline-flex md:h-8 md:w-8"
        aria-label="첫 페이지"
      >
        <ChevronsLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
      </Button>

      {/* Previous */}
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
        className="h-7 w-7 shrink-0 p-0 md:h-8 md:w-8"
        aria-label="이전 페이지"
      >
        <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
      </Button>

      {/* Page numbers — 모바일(±1)/데스크톱(±2) 목록을 CSS로 전환 */}
      <div className="contents md:hidden">{mobilePageNumbers.map(renderPageButton)}</div>
      <div className="hidden md:contents">{pageNumbers.map(renderPageButton)}</div>

      {/* Next */}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => goTo(page + 1)}
        className="h-7 w-7 shrink-0 p-0 md:h-8 md:w-8"
        aria-label="다음 페이지"
      >
        <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
      </Button>

      {/* Last page — 모바일에선 숨겨 폭 확보(마지막 페이지는 숫자로 이동 가능) */}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => goTo(totalPages)}
        className="hidden h-7 w-7 shrink-0 p-0 md:inline-flex md:h-8 md:w-8"
        aria-label="마지막 페이지"
      >
        <ChevronsRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
      </Button>
    </div>
  );
}
