"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  ExamPassage,
  ExamPassageFacets,
  ExamPassageListResponse,
  ExamPassagePick,
} from "@/lib/exam-passages/types";
import { EXAM_MAX_IDS, EXAM_PAGE_SIZE } from "@/lib/exam-passages/types";
import { toExamPick } from "@/lib/exam-passages/format";

// 기출 지문 브라우저의 데이터·필터·선택 상태 훅.
// /api/exam-passages 를 호출해 facet 까지 함께 받는다(첫 응답에서 facets 채움).
// 선택(selectedIds)은 페이지·필터를 넘나들어 누적 유지된다.

interface MultiFilters {
  years: Set<number>;
  exams: Set<string>;
  grades: Set<string>;
  types: Set<string>;
  recons: Set<string>;
}

const EMPTY_FILTERS = (): MultiFilters => ({
  years: new Set(),
  exams: new Set(),
  grades: new Set(),
  types: new Set(),
  recons: new Set(),
});

export function useExamPassageLibrary() {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<MultiFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ExamPassage[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facets, setFacets] = useState<ExamPassageFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // 미리보기/불러오기에 쓸 레코드 캐시(본 적 있는 지문).
  const recordCache = useRef<Map<string, ExamPassage>>(new Map());

  // 검색어 디바운스(300ms) — 입력은 즉시, fetch 는 멈춘 뒤.
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
    if (filters.years.size) p.set("years", [...filters.years].join(","));
    if (filters.exams.size) p.set("exams", [...filters.exams].join(","));
    if (filters.grades.size) p.set("grades", [...filters.grades].join(","));
    if (filters.types.size) p.set("types", [...filters.types].join(","));
    if (filters.recons.size) p.set("recon", [...filters.recons].join(","));
    p.set("page", String(page));
    p.set("pageSize", String(EXAM_PAGE_SIZE));
    return p;
  }, [q, filters, page]);

  // 목록 로드. (외부 시스템=API 동기화를 위한 비동기 로딩 플래그이므로
  // set-state-in-effect 규칙은 의도적으로 비활성화 — 파생 상태가 아님.)
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    const params = buildParams();
    fetch(`/api/exam-passages?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("기출 지문을 불러오지 못했습니다.");
        return (await res.json()) as ExamPassageListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
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

  // ── 필터 토글 ──
  const toggleYear = useCallback((year: number) => {
    setFilters((prev) => {
      const years = new Set(prev.years);
      if (years.has(year)) years.delete(year);
      else years.add(year);
      return { ...prev, years };
    });
    setPage(1);
  }, []);

  const toggleExam = useCallback((exam: string) => {
    setFilters((prev) => {
      const exams = new Set(prev.exams);
      if (exams.has(exam)) exams.delete(exam);
      else exams.add(exam);
      return { ...prev, exams };
    });
    setPage(1);
  }, []);

  const toggleGrade = useCallback((grade: string) => {
    setFilters((prev) => {
      const grades = new Set(prev.grades);
      if (grades.has(grade)) grades.delete(grade);
      else grades.add(grade);
      return { ...prev, grades };
    });
    setPage(1);
  }, []);

  const toggleType = useCallback((type: string) => {
    setFilters((prev) => {
      const types = new Set(prev.types);
      if (types.has(type)) types.delete(type);
      else types.add(type);
      return { ...prev, types };
    });
    setPage(1);
  }, []);

  const toggleRecon = useCallback((recon: string) => {
    setFilters((prev) => {
      const recons = new Set(prev.recons);
      if (recons.has(recon)) recons.delete(recon);
      else recons.add(recon);
      return { ...prev, recons };
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS());
    setSearchInput("");
    setQ("");
    setPage(1);
  }, []);

  const activeFilterCount =
    filters.years.size +
    filters.exams.size +
    filters.grades.size +
    filters.types.size +
    filters.recons.size +
    (q ? 1 : 0);

  // ── 선택 (서버/import 가 300개에서 잘리므로 클라에서 상한을 둬 무음 손실 방지) ──
  const toggleSelect = useCallback(
    (id: string) => {
      if (!selectedIds.has(id) && selectedIds.size >= EXAM_MAX_IDS) {
        toast.info(`한 번에 최대 ${EXAM_MAX_IDS}개까지 담을 수 있어요.`);
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [selectedIds],
  );

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const pageAllSelected = useMemo(
    () => items.length > 0 && items.every((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );

  const toggleSelectPage = useCallback(() => {
    const allSelected =
      items.length > 0 && items.every((it) => selectedIds.has(it.id));
    if (!allSelected) {
      const room = EXAM_MAX_IDS - selectedIds.size;
      const toAdd = items.filter((it) => !selectedIds.has(it.id));
      if (toAdd.length > room) {
        toast.info(`한 번에 최대 ${EXAM_MAX_IDS}개까지 담을 수 있어요.`);
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSel = items.length > 0 && items.every((it) => next.has(it.id));
      if (allSel) {
        for (const it of items) next.delete(it.id);
        return next;
      }
      for (const it of items) {
        if (next.has(it.id)) continue;
        if (next.size >= EXAM_MAX_IDS) break;
        next.add(it.id);
      }
      return next;
    });
  }, [items, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // 선택분을 pick 으로 — 페이지 밖 선택분은 ids 조회로 본문 확보.
  const collectSelectedPicks = useCallback(async (): Promise<
    ExamPassagePick[]
  > => {
    const ids = [...selectedIds];
    if (ids.length === 0) return [];
    const missing = ids.filter((id) => !recordCache.current.has(id));
    if (missing.length > 0) {
      try {
        const res = await fetch(
          `/api/exam-passages?ids=${encodeURIComponent(missing.join(","))}`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as ExamPassageListResponse;
          for (const it of data.items) recordCache.current.set(it.id, it);
        }
      } catch {
        /* 일부 누락분은 아래에서 건너뜀 */
      }
    }
    // 선택 순서가 아닌 코퍼스 정렬 순서를 유지(연도desc) — 안정적 표시.
    return ids
      .map((id) => recordCache.current.get(id))
      .filter((r): r is ExamPassage => Boolean(r))
      .map(toExamPick);
  }, [selectedIds]);

  return {
    // 검색·필터
    searchInput,
    setSearchInput,
    filters,
    toggleYear,
    toggleExam,
    toggleGrade,
    toggleType,
    toggleRecon,
    clearFilters,
    activeFilterCount,
    // 데이터
    items,
    total,
    totalPages,
    page,
    setPage,
    facets,
    loading,
    error,
    // 선택
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelect,
    isSelected,
    pageAllSelected,
    toggleSelectPage,
    clearSelection,
    collectSelectedPicks,
  };
}

export type ExamPassageLibraryApi = ReturnType<typeof useExamPassageLibrary>;
