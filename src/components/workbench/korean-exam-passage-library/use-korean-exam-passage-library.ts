"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  KoFacets,
  KoListResponse,
  KoPassage,
} from "@/lib/korean-exam-passages/types";
import { KO_PAGE_SIZE } from "@/lib/korean-exam-passages/types";
import { useIsMobile } from "@/hooks/use-is-mobile";

// 국어 기출 지문 브라우저의 데이터·필터·선택 상태 훅.
// /api/korean/exam-passages 를 호출해 facet 까지 함께 받는다(동적 facet).

interface MultiFilters {
  boards: Set<string>;
  grades: Set<string>;
  years: Set<number>;
  sihengs: Set<string>;
  galaes: Set<string>;
  subGenres: Set<string>;
  difficulties: Set<string>;
  keywords: Set<string>;
}

const EMPTY = (): MultiFilters => ({
  boards: new Set(),
  grades: new Set(),
  years: new Set(),
  sihengs: new Set(),
  galaes: new Set(),
  subGenres: new Set(),
  difficulties: new Set(),
  keywords: new Set(),
});

type DimKey = keyof MultiFilters;

export function useKoreanExamPassageLibrary() {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<MultiFilters>(EMPTY);
  const [page, setPage] = useState(1);

  const isMobile = useIsMobile();
  const pageSize = isMobile ? 10 : KO_PAGE_SIZE;

  const [items, setItems] = useState<KoPassage[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facets, setFacets] = useState<KoFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 본 적 있는 지문 레코드 캐시(선택분 pick 복원용) + 선택 상태(페이지·필터 넘나들어 누적).
  const recordCache = useRef<Map<string, KoPassage>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // 검색 디바운스.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filters.boards.size) p.set("boards", [...filters.boards].join(","));
    if (filters.grades.size) p.set("grades", [...filters.grades].join(","));
    if (filters.years.size) p.set("years", [...filters.years].join(","));
    if (filters.sihengs.size) p.set("sihengs", [...filters.sihengs].join(","));
    if (filters.galaes.size) p.set("galaes", [...filters.galaes].join(","));
    if (filters.subGenres.size)
      p.set("subGenresJson", JSON.stringify([...filters.subGenres]));
    if (filters.difficulties.size)
      p.set("difficulties", [...filters.difficulties].join(","));
    if (filters.keywords.size)
      p.set("keywords", [...filters.keywords].join(","));
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p;
  }, [q, filters, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/korean/exam-passages?${buildParams().toString()}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("국어 기출 지문을 불러오지 못했습니다.");
        return (await res.json()) as KoListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        // 화면 폭 변화로 pageSize가 바뀌어 현재 페이지가 범위를 벗어나면
        // 서버가 보정한 페이지로 동기화한다. effect 본문의 동기 setState를 피한다.
        setPage((current) => (data.page === current ? current : data.page));
        setFacets(data.facets);
        for (const it of data.items) recordCache.current.set(it.id, it);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildParams]);

  const toggle = useCallback(<T extends string | number>(dim: DimKey, value: T) => {
    setFilters((prev) => {
      const next = new Set(prev[dim] as Set<T>);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [dim]: next };
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY());
    setSearchInput("");
    setQ("");
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(
    () =>
      filters.boards.size +
      filters.grades.size +
      filters.years.size +
      filters.sihengs.size +
      filters.galaes.size +
      filters.subGenres.size +
      filters.difficulties.size +
      filters.keywords.size +
      (q ? 1 : 0),
    [filters, q],
  );

  // 상세(원문 문제) 캐시.
  const detailCache = useRef<Map<string, unknown>>(new Map());
  const fetchDetail = useCallback(async (id: string) => {
    if (detailCache.current.has(id)) return detailCache.current.get(id);
    try {
      const res = await fetch(
        `/api/korean/exam-passages?detail=${encodeURIComponent(id)}`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) return null;
      const data = await res.json();
      detailCache.current.set(id, data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // ── 선택(picker 모드) ──
  const toggleSelect = useCallback((id: string) => {
    const rec = items.find((it) => it.id === id);
    if (rec) recordCache.current.set(id, rec);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [items]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const pageAllSelected = useMemo(
    () => items.length > 0 && items.every((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );
  const toggleSelectPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSel = items.length > 0 && items.every((it) => next.has(it.id));
      for (const it of items) {
        recordCache.current.set(it.id, it);
        if (allSel) next.delete(it.id);
        else next.add(it.id);
      }
      return next;
    });
  }, [items]);

  // 선택분 → pick(id·제목·본문). 페이지 밖 선택분은 ids 조회로 본문 확보.
  const collectSelectedPicks = useCallback(async (): Promise<KoExamPick[]> => {
    const ids = [...selectedIds];
    if (ids.length === 0) return [];
    const missing = ids.filter((id) => !recordCache.current.has(id));
    if (missing.length > 0) {
      try {
        const res = await fetch(
          `/api/korean/exam-passages?ids=${encodeURIComponent(missing.join(","))}`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as KoListResponse;
          for (const it of data.items) recordCache.current.set(it.id, it);
        }
      } catch {
        /* 일부 누락분은 아래에서 건너뜀 */
      }
    }
    return ids
      .map((id) => recordCache.current.get(id))
      .filter((r): r is KoPassage => Boolean(r))
      .map((r) => ({ id: r.id, title: r.title, content: r.passageText }));
  }, [selectedIds]);

  return {
    searchInput,
    setSearchInput,
    filters,
    toggle,
    clearFilters,
    activeFilterCount,
    items,
    total,
    totalPages,
    page,
    setPage,
    facets,
    loading,
    error,
    fetchDetail,
    // 선택
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelect,
    isSelected,
    clearSelection,
    pageAllSelected,
    toggleSelectPage,
    collectSelectedPicks,
  };
}

/** 호스트(문제·학습지·웹툰 생성)가 받는 국어 기출 지문 pick. */
export interface KoExamPick {
  id: string;
  title: string;
  content: string;
}

export type KoreanExamPassageLibraryApi = ReturnType<
  typeof useKoreanExamPassageLibrary
>;
