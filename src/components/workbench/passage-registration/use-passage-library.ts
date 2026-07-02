"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addPassagesToCollection,
  bulkDeleteWorkbenchPassages,
  createPassageCollection,
  removePassagesFromCollection,
} from "@/actions/workbench";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import type {
  PassageItem,
  PassageCollectionItem,
  FilterOptions,
  PassageAnalysisStatusFilter,
  PassageSortOrder,
} from "@/app/(director)/director/workbench/generate/generate-page-types";

const UNDO_TOAST_DURATION = 8000;

/** Build a passage title from the first non-empty line of pasted content. */
function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

interface UsePassageLibraryArgs {
  academyId: string;
  /** Switch the intake surface to the 내 지문함 (library) view. */
  onShowLibrary?: () => void;
  /**
   * 과목 스코프 — "KOREAN"=국어 지문(subject='KOREAN')만 로드·직접입력 저장·새
   * 폴더 생성. 미전달(undefined)=영어 기존 동작 그대로(로드 URL 바이트 동일,
   * INSERT 에 subject 미포함 → 무회귀). 웹툰 국어 라우트의 지문 picker 가 켠다.
   */
  subjectScope?: "KOREAN";
}

/**
 * 내 지문함 라이브러리 — 문제생성(generate-page-client)의 저장된 지문 intake 를
 * 그대로 이식한 훅. 직접 입력·파일업로드로 만들어진 Passage 를 불러와 필터·검색·
 * 선택·폴더(컬렉션) 관리까지 담당한다. 워크스페이스(필기·분석)로 넘기는 부분만
 * 학습지 페이지에서 별도로 붙인다.
 */
export function usePassageLibrary({
  academyId,
  onShowLibrary,
  subjectScope,
}: UsePassageLibraryArgs) {
  // ── Passage data ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [loadingPassages, setLoadingPassages] = useState(true);
  const [freshAnalysisPassageIds, setFreshAnalysisPassageIds] = useState<
    Set<string>
  >(() => new Set());
  // 이번 세션에서 추출 완료된 지문 id — 추출한 순서 그대로 그리드 맨 앞에 고정.
  const [recentExtractionPassageIds, setRecentExtractionPassageIds] = useState<
    string[]
  >([]);

  // ── Collections ──
  const [collections, setCollections] = useState<PassageCollectionItem[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [passageBulkAction, setPassageBulkAction] = useState<
    "move" | "remove" | "delete" | null
  >(null);

  // ── Search/filter state ──
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] =
    useState<PassageAnalysisStatusFilter>("all");
  const [passageSortOrder, setPassageSortOrder] =
    useState<PassageSortOrder>("newest");

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pasteSaving, setPasteSaving] = useState(false);

  // ── Load passages ──
  const loadPassages = useCallback(async () => {
    setLoadingPassages(true);
    try {
      // 국어 스코프면 scope=KOREAN 을 실어 국어 지문만 받는다(전체선택 population 도
      // 서버에서 동일 스코프로 좁혀짐). 미전달(영어)은 파라미터를 붙이지 않아 URL 이
      // 기존과 바이트 동일 → 무회귀.
      const scopeQuery = subjectScope === "KOREAN" ? "&scope=KOREAN" : "";
      const response = await fetch(
        `/api/passages/list?academyId=${academyId}&includeUnreviewed=true${scopeQuery}`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "지문 목록을 불러오지 못했습니다.");
      }
      setPassages(data.passages || []);
      if (data.filters) setFilterOptions(data.filters);
      if (data.collections) setCollections(data.collections);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "지문 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingPassages(false);
    }
  }, [academyId, subjectScope]);

  const filteredPassages = useMemo(() => {
    const result = passages.filter((p) => {
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (
          !p.title.toLowerCase().includes(q) &&
          !p.content.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (analysisStatusFilter === "analyzed" && !p.analysis) return false;
      if (analysisStatusFilter === "unanalyzed" && p.analysis) return false;
      if (
        selectedCollectionId &&
        !p.collectionItems?.some(
          (ci) => ci.collectionId === selectedCollectionId,
        )
      )
        return false;
      return true;
    });

    // 카드에 보이는 날짜는 "등록일(createdAt)" 이므로 최신순/오래된순도
    // createdAt 기준으로 정렬한다. (서버 도착 순서는 updatedAt desc 라, 그대로
    // 두면 수정된 지문이 옛 등록일을 단 채 위로 올라와 순서가 어긋나 보인다.)
    const createdTime = (p: PassageItem) =>
      p.createdAt ? new Date(p.createdAt).getTime() : 0;
    switch (passageSortOrder) {
      case "oldest":
        result.sort((a, b) => createdTime(a) - createdTime(b));
        break;
      case "name_asc":
        result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        break;
      case "name_desc":
        result.sort((a, b) => b.title.localeCompare(a.title, "ko"));
        break;
      case "newest":
      default:
        result.sort((a, b) => createdTime(b) - createdTime(a));
        // 방금 추출된 지문은 "추출한 순서" 그대로 맨 앞에 고정한다.
        if (recentExtractionPassageIds.length > 0) {
          const pinRank = new Map(
            recentExtractionPassageIds.map((id, i) => [id, i]),
          );
          const pinned: PassageItem[] = [];
          const rest: PassageItem[] = [];
          for (const p of result) {
            (pinRank.has(p.id) ? pinned : rest).push(p);
          }
          pinned.sort((a, b) => pinRank.get(a.id)! - pinRank.get(b.id)!);
          return [...pinned, ...rest];
        }
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
    recentExtractionPassageIds,
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

  // ── Selection helpers ──
  const toggleCheckbox = useCallback((id: string, e?: React.MouseEvent) => {
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

  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const acknowledgeFreshAnalysisPassage = useCallback((passageId: string) => {
    setFreshAnalysisPassageIds((prev) => {
      if (!prev.has(passageId)) return prev;
      const next = new Set(prev);
      next.delete(passageId);
      return next;
    });
  }, []);

  // 추출 완료(자동 승격) → 라이브러리 측 상태 갱신. 필터를 풀어 갓 추출된
  // (미분석) 카드가 숨지 않게 하고, 새 배치를 그리드 맨 앞에 고정한다.
  const applyExtractionPromotion = useCallback(
    (passageIds: string[]) => {
      setPassageSearch("");
      setSelectedCollectionId("");
      setAnalysisStatusFilter("all");
      if (passageIds.length > 0) {
        setFreshAnalysisPassageIds((prev) => {
          const next = new Set(prev);
          passageIds.forEach((id) => next.add(id));
          return next;
        });
        setRecentExtractionPassageIds((prev) => [
          ...passageIds,
          ...prev.filter((id) => !passageIds.includes(id)),
        ]);
      }
      onShowLibrary?.();
    },
    [onShowLibrary],
  );

  // ── Direct input → create Passages → land in 내 지문함 ──
  const handleCreatePastedPassages = useCallback(
    async (rows: { title: string; content: string }[]) => {
      const cleaned = rows
        .map((r) => ({ title: r.title.trim(), content: r.content.trim() }))
        .filter((r) => r.content.length >= 20);
      if (cleaned.length === 0) {
        toast.error("지문이 너무 짧습니다. 최소 20자 이상 입력해주세요.");
        return false;
      }
      setPasteSaving(true);
      try {
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const createdIds: string[] = [];
        // Sequential: the action assigns passageOrder = last+1, so concurrent
        // calls could collide on the (jobId, passageOrder) unique.
        for (const r of cleaned) {
          const title = r.title || derivePastedTitle(r.content);
          const result = await createDirectInputPassageMaterial({
            title,
            content: r.content,
            // 국어 스코프면 subject='KOREAN' 으로 저장 → 국어 지문함에만 나타난다.
            // 미전달(영어)은 subject 없이 기존 INSERT(무회귀).
            ...(subjectScope === "KOREAN"
              ? { subject: "KOREAN" as const }
              : {}),
          });
          if (result?.success && result.id) createdIds.push(result.id);
        }
        if (createdIds.length === 0) {
          toast.error("지문 등록에 실패했습니다.");
          return false;
        }

        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");
        setSelectedIds(new Set(createdIds));
        onShowLibrary?.();
        toast.success(
          createdIds.length === cleaned.length
            ? `${createdIds.length}개 지문이 '내 지문함'에 등록되었습니다. 선택해 워크스페이스로 보내세요.`
            : `${createdIds.length}/${cleaned.length}개 지문이 등록되었습니다. 일부는 실패했습니다.`,
        );
        return true;
      } catch {
        toast.error("지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setPasteSaving(false);
      }
    },
    [loadPassages, onShowLibrary, subjectScope],
  );

  // ── Collections ──
  const handleCreatePassageCollection = useCallback(
    async (name: string, parentId?: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const result = await createPassageCollection({
        name: trimmed,
        parentId: parentId || undefined,
        ...(subjectScope === "KOREAN" ? { subject: "KOREAN" as const } : {}),
      });
      if (!result.success) {
        toast.error(result.error || "폴더 생성 실패");
        return null;
      }
      const created: PassageCollectionItem = {
        id: result.id,
        parentId: parentId || null,
        name: trimmed,
        _count: { items: 0 },
      };
      setCollections((prev) =>
        [...prev.filter((c) => c.id !== result.id), created]
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      toast.success(`"${trimmed}" 폴더를 만들었습니다.`);
      void loadPassages();
      return result.id;
    },
    [loadPassages, subjectScope],
  );

  const handleCopyPassagesToCollection = useCallback(
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
        const targetPassages = passages.filter((p) => idSet.has(p.id));
        const idsToAdd = ids.filter(
          (id) =>
            !targetPassages
              .find((p) => p.id === id)
              ?.collectionItems?.some((ci) => ci.collectionId === collectionId),
        );
        if (idsToAdd.length === 0) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }
        const result = await addPassagesToCollection(collectionId, idsToAdd);
        if (!result.success) {
          toast.error(result.error || "폴더에 복사하지 못했습니다.");
          return;
        }
        const folderName =
          collections.find((c) => c.id === collectionId)?.name || "폴더";
        const countLabel =
          idsToAdd.length > 1 ? `${idsToAdd.length}개 지문이` : "지문이";
        const undoFolderCopy = async () => {
          setPassageBulkAction("move");
          try {
            const undo = await removePassagesFromCollection(
              collectionId,
              idsToAdd,
            );
            if (!undo.success) {
              toast.error(undo.error || "폴더 복사를 실행 취소하지 못했습니다.");
              return;
            }
            await loadPassages();
            toast.success("폴더 복사를 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 복사를 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };
        toast.success(`${countLabel} "${folderName}"에 복사되었습니다`, {
          duration: UNDO_TOAST_DURATION,
          action: { label: "실행 취소", onClick: () => void undoFolderCopy() },
        });
        // Clear only the copied ids from the selection (a bare drag of an
        // unselected card must not wipe an unrelated selection).
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        await loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더에 복사하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages],
  );

  const handleCopySelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      await handleCopyPassagesToCollection([...selectedIds], collectionId);
    },
    [handleCopyPassagesToCollection, selectedIds],
  );

  const handleMovePassagesToCollection = useCallback(
    async (
      passageIds: string[],
      collectionId: string,
      keepFolderIds: string[] = [],
    ) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
        const keepSet = new Set(keepFolderIds);
        const selectedPassages = passages.filter((p) => idSet.has(p.id));
        const previousMembership = new Map<string, string[]>();
        for (const p of selectedPassages) {
          for (const ci of p.collectionItems ?? []) {
            const list = previousMembership.get(ci.collectionId) ?? [];
            list.push(p.id);
            previousMembership.set(ci.collectionId, list);
          }
        }
        // Keep the item in folders the user ticked — only remove from the rest.
        const sourceCollectionIds = [...previousMembership.keys()].filter(
          (id) => id !== collectionId && !keepSet.has(id),
        );
        const targetExistingIds = new Set(
          previousMembership.get(collectionId) ?? [],
        );
        const idsToAdd = ids.filter((id) => !targetExistingIds.has(id));
        const hasFolderChanges =
          idsToAdd.length > 0 || sourceCollectionIds.length > 0;
        if (!hasFolderChanges) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }
        const removeResults = await Promise.all(
          sourceCollectionIds.map((sourceId) =>
            removePassagesFromCollection(
              sourceId,
              previousMembership.get(sourceId) ?? [],
            ),
          ),
        );
        const failedRemove = removeResults.find((r) => !r.success);
        if (failedRemove) {
          toast.error(
            failedRemove.error || "폴더 이동 중 일부 제거에 실패했습니다.",
          );
          return;
        }
        if (idsToAdd.length > 0) {
          const addResult = await addPassagesToCollection(
            collectionId,
            idsToAdd,
          );
          if (!addResult.success) {
            toast.error(addResult.error || "폴더로 이동하지 못했습니다.");
            return;
          }
        }
        const folderName =
          collections.find((c) => c.id === collectionId)?.name || "폴더";
        const countLabel = ids.length > 1 ? `${ids.length}개 지문이` : "지문이";
        const undoFolderMove = async () => {
          setPassageBulkAction("move");
          try {
            const undoResults = await Promise.all([
              ...(idsToAdd.length > 0
                ? [removePassagesFromCollection(collectionId, idsToAdd)]
                : []),
              ...sourceCollectionIds.map((sourceId) =>
                addPassagesToCollection(
                  sourceId,
                  previousMembership.get(sourceId) ?? [],
                ),
              ),
            ]);
            const failedUndo = undoResults.find((r) => !r.success);
            if (failedUndo) {
              toast.error(
                failedUndo.error || "폴더 이동을 실행 취소하지 못했습니다.",
              );
              return;
            }
            await loadPassages();
            toast.success("폴더 이동을 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 이동을 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };
        toast.success(`${countLabel} "${folderName}"(으)로 이동되었습니다`, {
          duration: UNDO_TOAST_DURATION,
          action: { label: "실행 취소", onClick: () => void undoFolderMove() },
        });
        setPassages((prev) =>
          prev.map((p) => {
            if (!idSet.has(p.id)) return p;
            const collectionItems = (p.collectionItems ?? []).filter(
              (ci) => !sourceCollectionIds.includes(ci.collectionId),
            );
            if (!collectionItems.some((ci) => ci.collectionId === collectionId))
              collectionItems.push({ collectionId });
            return { ...p, collectionItems };
          }),
        );
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        void loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더로 이동하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages],
  );

  const handleMoveSelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      await handleMovePassagesToCollection([...selectedIds], collectionId);
    },
    [handleMovePassagesToCollection, selectedIds],
  );

  const handleRemoveSelectedPassagesFromCollection = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
    const collectionId = selectedCollectionId;
    if (!collectionId || ids.length === 0 || passageBulkAction) return;
    setPassageBulkAction("remove");
    try {
      const idSet = new Set(ids);
      const idsToRemove = passages
        .filter(
          (p) =>
            idSet.has(p.id) &&
            p.collectionItems?.some((ci) => ci.collectionId === collectionId),
        )
        .map((p) => p.id);
      if (idsToRemove.length === 0) {
        toast.info("이 폴더에서 제거할 지문이 없습니다.");
        return;
      }
      const result = await removePassagesFromCollection(
        collectionId,
        idsToRemove,
      );
      if (!result.success) {
        toast.error(result.error || "폴더에서 삭제하지 못했습니다.");
        return;
      }
      const undoFolderRemove = async () => {
        setPassageBulkAction("remove");
        try {
          const undo = await addPassagesToCollection(collectionId, idsToRemove);
          if (!undo.success) {
            toast.error(undo.error || "폴더 삭제를 실행 취소하지 못했습니다.");
            return;
          }
          await loadPassages();
          toast.success("폴더 삭제를 실행 취소했습니다.");
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "폴더 삭제를 실행 취소하지 못했습니다.",
          );
        } finally {
          setPassageBulkAction(null);
        }
      };
      toast.success(`${idsToRemove.length}개 지문을 폴더에서 삭제했습니다.`, {
        duration: UNDO_TOAST_DURATION,
        action: { label: "실행 취소", onClick: () => void undoFolderRemove() },
      });
      setSelectedIds(new Set());
      await loadPassages();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "폴더에서 삭제하지 못했습니다.",
      );
    } finally {
      setPassageBulkAction(null);
    }
  }, [loadPassages, passageBulkAction, passages, selectedCollectionId, selectedIds]);

  const handleDeleteSelectedPassages = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
    if (ids.length === 0 || passageBulkAction) return;
    if (!window.confirm(`${ids.length}개 지문을 삭제하시겠습니까?`)) return;
    setPassageBulkAction("delete");
    try {
      const result = await bulkDeleteWorkbenchPassages(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === 0) {
        toast.error("삭제된 지문이 없습니다.");
      } else if (result.deleted === result.requested) {
        toast.success(`${result.deleted}개 지문을 삭제했습니다.`);
      } else {
        toast.warning(
          `${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`,
        );
      }
      setPassages((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelectedIds(new Set());
      await loadPassages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setPassageBulkAction(null);
    }
  }, [loadPassages, passageBulkAction, selectedIds]);

  return {
    // data
    passages,
    setPassages,
    filteredPassages,
    filterOptions,
    collections,
    setCollections,
    loadingPassages,
    passageStatusCounts,
    activeFilterCount,
    // filters
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
    selectedCollectionId,
    setSelectedCollectionId,
    passageBulkAction,
    // selection
    selectedIds,
    setSelectedIds,
    toggleCheckbox,
    selectAll,
    deselectAll,
    // extraction glow / ordering
    freshAnalysisPassageIds,
    setFreshAnalysisPassageIds,
    acknowledgeFreshAnalysisPassage,
    recentExtractionPassageIds,
    setRecentExtractionPassageIds,
    applyExtractionPromotion,
    // direct input
    pasteSaving,
    handleCreatePastedPassages,
    // loading + collection handlers
    loadPassages,
    handleCreatePassageCollection,
    handleCopySelectedPassagesToCollection,
    handleCopyPassagesToCollection,
    handleMovePassagesToCollection,
    handleMoveSelectedPassagesToCollection,
    handleRemoveSelectedPassagesFromCollection,
    handleDeleteSelectedPassages,
  };
}
