"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  ExamPaper,
  ExamPaperListResponse,
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

// 보기 모드. 'papers'=시험지별(카드 그리드), 'problems'=문제별(지문 평면 검색).
// 검색어·유형·복원 필터가 걸리거나 시험지에 드릴인하면 자동으로 문제별로 본다.
export type ExamViewMode = "papers" | "problems";

export function useExamPassageLibrary() {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<MultiFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // 시험지별 ⇄ 문제별 토글(명시적). 드릴인은 별도 상태.
  const [mode, setMode] = useState<ExamViewMode>("papers");
  const [drillExamId, setDrillExamId] = useState<string | null>(null);
  const [drillTitle, setDrillTitle] = useState<string>("");

  const [items, setItems] = useState<ExamPassage[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facets, setFacets] = useState<ExamPassageFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 문제(지문) 평면 목록을 보고 있는가 — 드릴인/문제별 토글/검색·유형·복원 필터 중 하나라도.
  const browsingProblems =
    drillExamId !== null ||
    mode === "problems" ||
    q !== "" ||
    filters.types.size > 0 ||
    filters.recons.size > 0;

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
    // 시험지에 드릴인하면 그 시험지의 문제는 한 장에 다 보이도록 큰 페이지(서버 상한 100).
    const showProblems =
      drillExamId !== null ||
      mode === "problems" ||
      q !== "" ||
      filters.types.size > 0 ||
      filters.recons.size > 0;
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filters.years.size) p.set("years", [...filters.years].join(","));
    if (filters.exams.size) p.set("exams", [...filters.exams].join(","));
    if (filters.grades.size) p.set("grades", [...filters.grades].join(","));
    if (showProblems) {
      if (filters.types.size) p.set("types", [...filters.types].join(","));
      if (filters.recons.size) p.set("recon", [...filters.recons].join(","));
      if (drillExamId) p.set("examIds", drillExamId);
      p.set("pageSize", String(drillExamId ? 100 : EXAM_PAGE_SIZE));
    } else {
      p.set("group", "paper");
      p.set("pageSize", String(EXAM_PAGE_SIZE));
    }
    p.set("page", String(drillExamId ? 1 : page));
    return { params: p, showProblems };
  }, [q, filters, page, mode, drillExamId]);

  // 목록 로드. (외부 시스템=API 동기화를 위한 비동기 로딩 플래그이므로
  // set-state-in-effect 규칙은 의도적으로 비활성화 — 파생 상태가 아님.)
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    const { params, showProblems } = buildParams();
    fetch(`/api/exam-passages?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("기출 지문을 불러오지 못했습니다.");
        return (await res.json()) as
          | ExamPassageListResponse
          | ExamPaperListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setFacets(data.facets);
        if (showProblems) {
          const d = data as ExamPassageListResponse;
          setItems(d.items);
          for (const it of d.items) recordCache.current.set(it.id, it);
        } else {
          setPapers((data as ExamPaperListResponse).papers);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        setItems([]);
        setPapers([]);
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

  // ── 필터 토글 ── (연도/회차/학년은 시험지 단위 스코프 → 드릴인 해제)
  const toggleYear = useCallback((year: number) => {
    setFilters((prev) => {
      const years = new Set(prev.years);
      if (years.has(year)) years.delete(year);
      else years.add(year);
      return { ...prev, years };
    });
    setDrillExamId(null);
    setPage(1);
  }, []);

  const toggleExam = useCallback((exam: string) => {
    setFilters((prev) => {
      const exams = new Set(prev.exams);
      if (exams.has(exam)) exams.delete(exam);
      else exams.add(exam);
      return { ...prev, exams };
    });
    setDrillExamId(null);
    setPage(1);
  }, []);

  const toggleGrade = useCallback((grade: string) => {
    setFilters((prev) => {
      const grades = new Set(prev.grades);
      if (grades.has(grade)) grades.delete(grade);
      else grades.add(grade);
      return { ...prev, grades };
    });
    setDrillExamId(null);
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
    setMode("papers");
    setDrillExamId(null);
    setPage(1);
  }, []);

  // ── 보기 모드 ──
  // 시험지별: 문제 단위 narrowing(검색·유형·복원)을 지우고 시험지 카드 그리드로.
  const goToPapers = useCallback(() => {
    setMode("papers");
    setDrillExamId(null);
    setSearchInput("");
    setQ("");
    setFilters((prev) => ({ ...prev, types: new Set(), recons: new Set() }));
    setPage(1);
  }, []);

  // 문제별: 현재 시험지 단위 필터(연도/회차/학년)는 유지한 채 평면 문제 목록으로.
  const goToProblems = useCallback(() => {
    setMode("problems");
    setDrillExamId(null);
    setPage(1);
  }, []);

  // 시험지 카드 클릭 → 그 시험지의 문제로 드릴인.
  const drillIntoPaper = useCallback((examId: string, title: string) => {
    setDrillExamId(examId);
    setDrillTitle(title);
    setPage(1);
  }, []);

  // 드릴인 해제 → 시험지 목록으로.
  const exitDrill = useCallback(() => {
    setDrillExamId(null);
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

  // ── 시험지(paper) 단위 선택 ──
  // 시험지 카드의 체크박스 = 그 시험지의 모든 지문을 한 번에 담기/해제.
  // 시험지 요약(ExamPaper)은 지문 id 를 들고 있지 않으므로, examId 로 그 시험지의
  // 지문 id 를 한 번 받아 캐시한 뒤 selectedIds(지문 단위)에 합류시킨다.
  const paperIdsCache = useRef<Map<string, string[]>>(new Map());

  const ensurePaperIds = useCallback(
    async (examId: string): Promise<string[]> => {
      const cached = paperIdsCache.current.get(examId);
      if (cached) return cached;
      try {
        const res = await fetch(
          `/api/exam-passages?examIds=${encodeURIComponent(examId)}&pageSize=100`,
          { credentials: "include", cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as ExamPassageListResponse;
          const ids = data.items.map((it) => it.id);
          paperIdsCache.current.set(examId, ids);
          for (const it of data.items) recordCache.current.set(it.id, it);
          return ids;
        }
      } catch {
        /* 아래에서 빈 배열로 안내 */
      }
      return [];
    },
    [],
  );

  const togglePaper = useCallback(
    async (paper: ExamPaper) => {
      const ids = await ensurePaperIds(paper.examId);
      if (ids.length === 0) {
        toast.info("이 시험지의 지문을 불러오지 못했습니다.");
        return;
      }
      const allSelected = ids.every((id) => selectedIds.has(id));
      if (!allSelected) {
        const room = EXAM_MAX_IDS - selectedIds.size;
        const toAdd = ids.filter((id) => !selectedIds.has(id));
        if (toAdd.length > room) {
          toast.info(`한 번에 최대 ${EXAM_MAX_IDS}개까지 담을 수 있어요.`);
        }
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const sel = ids.every((id) => next.has(id));
        if (sel) {
          for (const id of ids) next.delete(id);
          return next;
        }
        for (const id of ids) {
          if (next.has(id)) continue;
          if (next.size >= EXAM_MAX_IDS) break;
          next.add(id);
        }
        return next;
      });
    },
    [ensurePaperIds, selectedIds],
  );

  // 시험지의 모든 지문이 선택돼 있으면 체크 표시(미열람 시험지는 캐시 전이라 false).
  const isPaperSelected = useCallback(
    (examId: string) => {
      const ids = paperIdsCache.current.get(examId);
      if (!ids || ids.length === 0) return false;
      return ids.every((id) => selectedIds.has(id));
    },
    [selectedIds],
  );

  // 보이는 시험지(papers) 전체를 한 번에 담기/해제 — 각 시험지 지문 id 를 확보 후 합류.
  const toggleSelectVisiblePapers = useCallback(
    async (visiblePapers: ExamPaper[]) => {
      if (visiblePapers.length === 0) return;
      const idLists = await Promise.all(
        visiblePapers.map((p) => ensurePaperIds(p.examId)),
      );
      const allIds = idLists.flat();
      if (allIds.length === 0) return;
      const allSelected = allIds.every((id) => selectedIds.has(id));
      if (!allSelected) {
        const room = EXAM_MAX_IDS - selectedIds.size;
        const toAdd = allIds.filter((id) => !selectedIds.has(id));
        if (toAdd.length > room) {
          toast.info(`한 번에 최대 ${EXAM_MAX_IDS}개까지 담을 수 있어요.`);
        }
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const sel = allIds.every((id) => next.has(id));
        if (sel) {
          for (const id of allIds) next.delete(id);
          return next;
        }
        for (const id of allIds) {
          if (next.has(id)) continue;
          if (next.size >= EXAM_MAX_IDS) break;
          next.add(id);
        }
        return next;
      });
    },
    [ensurePaperIds, selectedIds],
  );

  // ── 통합 전체선택 (시험지별/문제별 공통) ──
  const hasVisibleItems = browsingProblems ? items.length > 0 : papers.length > 0;

  const allVisibleSelected = useMemo(() => {
    if (browsingProblems) {
      return items.length > 0 && items.every((it) => selectedIds.has(it.id));
    }
    return (
      papers.length > 0 &&
      papers.every((p) => {
        const ids = paperIdsCache.current.get(p.examId);
        return (
          ids !== undefined &&
          ids.length > 0 &&
          ids.every((id) => selectedIds.has(id))
        );
      })
    );
  }, [browsingProblems, items, papers, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (browsingProblems) {
      toggleSelectPage();
      return;
    }
    void toggleSelectVisiblePapers(papers);
  }, [browsingProblems, toggleSelectPage, toggleSelectVisiblePapers, papers]);

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
    // 보기 모드 (시험지별 ⇄ 문제별, 드릴인)
    mode,
    browsingProblems,
    drillExamId,
    drillTitle,
    goToPapers,
    goToProblems,
    drillIntoPaper,
    exitDrill,
    // 데이터
    items,
    papers,
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
    // 시험지 단위 선택
    togglePaper,
    isPaperSelected,
    // 통합 전체선택
    toggleSelectAll,
    allVisibleSelected,
    hasVisibleItems,
  };
}

export type ExamPassageLibraryApi = ReturnType<typeof useExamPassageLibrary>;
