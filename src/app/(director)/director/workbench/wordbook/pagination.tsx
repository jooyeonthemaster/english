"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 페이지네이션 (탐색 표 하단 고정 푸터)
//
// 「더 보기」(누적 append)를 대체한다. 누적 방식은 (a) 지금 몇 번째 구간을 보는지
// 알 수 없고 (b) 뒤로 갈수록 DOM 이 무한히 커지며 (c) 「보이는 단어 모두 담기」의
// 의미가 스크롤 이력에 따라 달라졌다. 페이지 단위는 이 셋을 한 번에 없앤다.
//
// 스크롤 영역 **밖**(형제)에 놓는다 — 표를 아무리 내려도 항상 보여야 한다.
// ============================================================================

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { WORDBOOK_PAGE_SIZES } from "./wordbook-types";
import { fmt } from "./wordbook-ui";

interface PaginationProps {
  /** 1-base */
  page: number;
  pageSize: number;
  /** 서버 총계(이미 OFFSET_MAX 로 잘려 온 값) */
  total: number;
  /** 이번 페이지에 실제로 그려진 행 수 — 마지막 페이지 표기에 쓴다 */
  rowCount: number;
  loading: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

/**
 * 표시할 페이지 번호 목록 — 양 끝 + 현재 주변만 남기고 사이는 생략(0).
 * 총 쪽수가 적으면 전부 편다. 반환의 0 은 "…" 자리다(페이지 번호는 1-base라
 * 0 이 실제 값과 충돌하지 않는다).
 */
export function pageWindow(page: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: number[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(totalPages - 1, page + 1);
  if (from > 2) out.push(0);
  for (let i = from; i <= to; i++) out.push(i);
  if (to < totalPages - 1) out.push(0);
  out.push(totalPages);
  return out;
}

const BTN =
  "inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-[11px] font-medium tabular-nums transition-colors disabled:cursor-default disabled:opacity-35";
const BTN_IDLE = "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

export function Pagination({
  page,
  pageSize,
  total,
  rowCount,
  loading,
  onPage,
  onPageSize,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(1, page), totalPages);
  // 표기는 "실제로 그린 행" 기준 — 마지막 페이지에서 계산상 끝(cur*pageSize)이
  // 총계를 넘어가면 "974개 중 1,040번째"가 되어 버린다.
  const from = total === 0 ? 0 : (cur - 1) * pageSize + 1;
  const to = total === 0 ? 0 : (cur - 1) * pageSize + rowCount;

  const go = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== cur && !loading) onPage(next);
  };

  return (
    <nav
      aria-label="목록 페이지"
      className="flex h-10 shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3"
    >
      {/* 범위 표기 */}
      <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
        {total === 0 ? (
          "0개"
        ) : (
          <>
            <b className="text-slate-800">{fmt(from)}</b>–
            <b className="text-slate-800">{fmt(to)}</b>
            <span className="text-slate-400"> / {fmt(total)}개</span>
          </>
        )}
      </span>

      {/* 페이지 크기 */}
      <label className="ml-1 hidden shrink-0 items-center gap-1 text-[11px] text-slate-400 sm:flex">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          disabled={loading}
          aria-label="한 쪽에 보여줄 단어 수"
          className="h-6 rounded border border-slate-200 bg-white px-1 text-[11px] tabular-nums text-slate-600 outline-none focus:border-blue-400 disabled:opacity-40"
        >
          {WORDBOOK_PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}개씩
            </option>
          ))}
        </select>
      </label>

      {/* 페이지 이동 — 우측 정렬 */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" aria-label="첫 쪽" title="첫 쪽"
          onClick={() => go(1)} disabled={loading || cur === 1}
          className={`${BTN} ${BTN_IDLE}`}>
          <ChevronsLeft className="size-3.5" />
        </button>
        <button type="button" aria-label="이전 쪽" title="이전 쪽"
          onClick={() => go(cur - 1)} disabled={loading || cur === 1}
          className={`${BTN} ${BTN_IDLE}`}>
          <ChevronLeft className="size-3.5" />
        </button>

        {/* 번호 — 좁은 화면에서는 "3 / 13" 축약본으로 대체 */}
        <div className="hidden items-center gap-1 md:flex">
          {pageWindow(cur, totalPages).map((p, i) =>
            p === 0 ? (
              <span key={`gap-${i}`} className="px-0.5 text-[11px] text-slate-300">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                disabled={loading}
                aria-current={p === cur ? "page" : undefined}
                aria-label={`${p}쪽`}
                className={`${BTN} ${
                  p === cur
                    ? "border-slate-900 bg-slate-900 text-white"
                    : BTN_IDLE
                }`}
              >
                {p}
              </button>
            ),
          )}
        </div>
        <span className="px-1 text-[11px] tabular-nums text-slate-500 md:hidden">
          {fmt(cur)} / {fmt(totalPages)}
        </span>

        <button type="button" aria-label="다음 쪽" title="다음 쪽"
          onClick={() => go(cur + 1)} disabled={loading || cur === totalPages}
          className={`${BTN} ${BTN_IDLE}`}>
          <ChevronRight className="size-3.5" />
        </button>
        <button type="button" aria-label="마지막 쪽" title="마지막 쪽"
          onClick={() => go(totalPages)} disabled={loading || cur === totalPages}
          className={`${BTN} ${BTN_IDLE}`}>
          <ChevronsRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}
