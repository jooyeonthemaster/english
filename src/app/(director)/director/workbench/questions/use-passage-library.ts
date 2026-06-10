"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { toast } from "sonner";

import type { PastedPassageInput } from "../generate/intake/multi-passage-paste";
import type {
  FilterOptions,
  PassageAnalysisStatusFilter,
  PassageCollectionItem,
  PassageItem,
  PassageSortOrder,
} from "../generate/generate-page-types";

// 좌측 "대상 지문" 라이브러리 — 목록 로드/필터/정렬/선택/직접 입력(붙여넣기) 등록.
// 기본 문제 생성·커스텀 유형과 동일한 데이터/상태 묶음을 similar-question-generator-client
// 에서 분리한 훅. (이미지/PDF 추출 연동은 taskQueue·인테이크 뷰와 얽혀 컴포넌트에 남긴다.)

// 붙여넣기 지문 제목 — 첫 비어있지 않은 줄에서 추출(기본 문제 생성과 동일).
function derivePastedTitle(content: string): string {
  const firstLine = (content.split(/\r?\n/).find((l) => l.trim().length > 0) || content).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

export function usePassageLibrary({
  academyId,
  onPastedRegistered,
  pastedSuccessGuide,
}: {
  academyId: string;
  /** 붙여넣기 등록 성공 시(뷰 전환 등 컴포넌트 측 후처리). */
  onPastedRegistered: () => void;
  /** 붙여넣기 등록 성공 toast 의 기능별 안내 문구(예: "원본 문항을 올려 동형을 생성하세요."). */
  pastedSuccessGuide: string;
}) {
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [collections, setCollections] = useState<PassageCollectionItem[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(true);

  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] =
    useState<PassageAnalysisStatusFilter>("all");
  const [passageSortOrder, setPassageSortOrder] = useState<PassageSortOrder>("newest");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [contentModalPassage, setContentModalPassage] = useState<PassageItem | null>(null);
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);
  const [pasteSaving, setPasteSaving] = useState(false);

  // ── 목록 로드(기본/커스텀과 동일한 /api/passages/list) ──
  const loadPassages = useCallback(async () => {
    setLoadingPassages(true);
    try {
      const res = await fetch(`/api/passages/list?academyId=${academyId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      setPassages(data.passages || []);
      if (data.filters) setFilterOptions(data.filters);
      if (data.collections) setCollections(data.collections);
    } catch {
      /* ignore */
    } finally {
      setLoadingPassages(false);
    }
  }, [academyId]);

  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  const filteredPassages = useMemo(() => {
    const result = passages.filter((p) => {
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (analysisStatusFilter === "analyzed" && !p.analysis) return false;
      if (analysisStatusFilter === "unanalyzed" && p.analysis) return false;
      if (
        selectedCollectionId &&
        !p.collectionItems?.some((ci) => ci.collectionId === selectedCollectionId)
      ) {
        return false;
      }
      return true;
    });

    switch (passageSortOrder) {
      case "oldest":
        result.reverse();
        break;
      case "name_asc":
        result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        break;
      case "name_desc":
        result.sort((a, b) => b.title.localeCompare(a.title, "ko"));
        break;
      default:
        break;
    }
    return result;
  }, [
    passages,
    passageSearch,
    filterSchool,
    filterGrade,
    filterSemester,
    analysisStatusFilter,
    selectedCollectionId,
    passageSortOrder,
  ]);

  const passageStatusCounts = useMemo(
    () => ({
      all: passages.length,
      analyzed: passages.filter((p) => !!p.analysis).length,
      unanalyzed: passages.filter((p) => !p.analysis).length,
    }),
    [passages],
  );

  const activeFilterCount =
    [filterSchool, filterGrade, filterSemester].filter(Boolean).length +
    (analysisStatusFilter === "all" ? 0 : 1);

  const toggleCheckbox = useCallback((id: string, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleOpenAnalysisModal = useCallback(
    (passageId: string) => {
      const p = passages.find((pp) => pp.id === passageId);
      if (p) setContentModalPassage(p);
    },
    [passages],
  );

  // ── 직접 입력(붙여넣기) → 등록 후 선택(기본/커스텀과 동일) ──
  const handleCreatePastedPassages = useCallback(
    async (rows: PastedPassageInput[]) => {
      const cleaned = rows
        .map((r) => ({ title: r.title.trim(), content: r.content.trim() }))
        .filter((r) => r.content.length >= 20);
      if (cleaned.length === 0) {
        toast.error("지문이 너무 짧습니다. 최소 20자 이상 입력해주세요.");
        return;
      }
      setPasteSaving(true);
      try {
        const { createDirectInputPassageMaterial } = await import("@/actions/workbench");
        const createdIds: string[] = [];
        for (const r of cleaned) {
          const title = r.title || derivePastedTitle(r.content);
          const result = (await createDirectInputPassageMaterial({
            title,
            content: r.content,
          })) as { success: boolean; id?: string };
          if (result?.success && result.id) createdIds.push(result.id);
        }
        if (createdIds.length === 0) {
          toast.error("지문 등록에 실패했습니다.");
          return;
        }
        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");
        setSelectedIds(new Set(createdIds));
        onPastedRegistered();
        toast.success(
          createdIds.length === cleaned.length
            ? `${createdIds.length}개 지문이 등록되었습니다. ${pastedSuccessGuide}`
            : `${createdIds.length}/${cleaned.length}개 지문이 등록되었습니다. 일부는 실패했습니다.`,
        );
      } catch {
        toast.error("지문 등록 중 오류가 발생했습니다.");
      } finally {
        setPasteSaving(false);
      }
    },
    [loadPassages, onPastedRegistered, pastedSuccessGuide],
  );

  return {
    passages,
    filterOptions,
    collections,
    loadingPassages,
    loadPassages,
    selectedCollectionId,
    setSelectedCollectionId,
    passageSearch,
    setPassageSearch,
    filterSchool,
    setFilterSchool,
    filterGrade,
    setFilterGrade,
    filterSemester,
    setFilterSemester,
    analysisStatusFilter,
    setAnalysisStatusFilter,
    passageSortOrder,
    setPassageSortOrder,
    selectedIds,
    setSelectedIds,
    contentModalPassage,
    setContentModalPassage,
    detailPassage,
    setDetailPassage,
    pasteSaving,
    filteredPassages,
    passageStatusCounts,
    activeFilterCount,
    toggleCheckbox,
    selectAll,
    deselectAll,
    handleOpenAnalysisModal,
    handleCreatePastedPassages,
  };
}
