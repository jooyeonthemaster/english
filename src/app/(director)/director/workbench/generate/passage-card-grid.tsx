"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  Search,
  Loader2,
  X,
  Check,
  CheckCircle2,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CornerUpLeft,
  Trash2,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderX,
  FilePen,
  GraduationCap,
  Layers,
} from "lucide-react";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { Badge } from "@/components/ui/badge";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { isDirectInputPassage } from "@/lib/passage-source";
import { PassageInlineTitle } from "@/components/workbench/passage-inline-title";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import { DragDropModePopover } from "@/components/workbench/shared/drag-drop-mode-popover";
import type { CollectionItem } from "@/components/workbench/shared/types";
import {
  resolveFolderCount,
  type ResolvedFolderCount,
} from "@/components/workbench/shared/folder-count";
import {
  type PassageCollectionItem,
  countWords,
} from "./generate-page-types";
import { DragSelect } from "@/components/ui/drag-select";
import { triggerHintGlow } from "@/lib/hint-glow";
import { DragHandle } from "@/components/ui/drag-handle";
import { PassageQuestionsSummary } from "./passage-questions-summary";
import { PassageReportsSummary } from "./passage-reports-summary";
import { PassageFilterPopover } from "./passage-filter-popover";
import { PassageSortSearchPopover } from "./passage-sort-search-popover";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "@/components/workbench/shared/card-click";
import {
  ANALYSIS_GLOW_ACK_STORAGE_KEY,
  RECENT_ANALYSIS_GLOW_WINDOW_MS,
} from "./passage-card-grid-constants";
import {
  analysisGlowKey,
  analysisUpdatedAtMs,
  formatMinuteTimestamp,
} from "./passage-card-grid-helpers";
import type {
  ParsedAnalysisSummary,
  PassageCardGridProps,
} from "./passage-card-grid-types";
import { useFolderWindowHeight } from "./use-folder-window-height";

// ─── Component ───────────────────────────────────────

export function PassageCardGrid({
  passages,
  filteredPassages,
  filterOptions,
  collections,
  loadingPassages,
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
  passageSortOrder = "newest",
  setPassageSortOrder,
  passageStatusCounts,
  activeFilterCount,
  selectedCollectionId,
  setSelectedCollectionId,
  selectedIds,
  setSelectedIds,
  toggleCheckbox,
  selectAll,
  deselectAll,
  onCopySelectedToCollection,
  onMoveSelectedToCollection,
  onMovePassagesToCollection,
  onCopyPassagesToCollection,
  onCreateCollection,
  onRenameCollection,
  onRemovePassagesFromFolder,
  onRemoveSelectedFromCollection,
  onDeleteSelectedPassages,
  passageBulkAction = null,
  genMode,
  totalQuestions,
  handleBatchGenerate,
  selectionActionText,
  selectionActionDisabled,
  questionsByPassage,
  onOpenQuestionDetail,
  learningGeneratingPassageIds,
  learningCompletedPassageIds,
  loadingCards,
  freshAnalysisPassageIds,
  onFreshAnalysisAcknowledged,
  reviewBulkActionRunning = false,
  onBulkCompleteExtractionReview,
  onBulkGenerateLearning,
  learningBulkActionRunning = false,
  learningCreditCostPerPassage = 0,
  onEditSelected,
  workspacePassageIds,
  workspaceActive = false,
  handleOpenAnalysisModal,
  onViewPassageContent,
  onPassageRenamed,
  lastViewedPassageId,
  openPassageDetailId,
  onToggleExtractionReview,
  reviewActionPassageIds,
}: PassageCardGridProps) {
  const [showSearch, setShowSearch] = useState(() => passageSearch.length > 0);
  const {
    folderWindowHeight,
    folderWindowCollapsed,
    setFolderWindowCollapsed,
    beginFolderWindowResize,
    resetFolderWindowHeight,
  } = useFolderWindowHeight();
  const [draggingPassageIds, setDraggingPassageIds] = useState<string[]>([]);
  const [dropTargetCollectionId, setDropTargetCollectionId] = useState<
    string | null
  >(null);
  // When a card is dropped on a folder and copy is available, defer the
  // move/copy decision to a chooser popover anchored at the drop point.
  const [pendingFolderDrop, setPendingFolderDrop] = useState<{
    ids: string[];
    collectionId: string;
    folderName: string;
    anchor: { x: number; y: number };
    currentFolders: { id: string; name: string }[];
  } | null>(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  // 폴더 칩 더블클릭 → 인라인 이름 변경(관리 페이지 폴더와 동일 동작).
  const [renamingCollectionId, setRenamingCollectionId] = useState<
    string | null
  >(null);
  const [renameName, setRenameName] = useState("");
  const startRenameCollection = (id: string, name: string) => {
    setRenameName(name);
    setRenamingCollectionId(id);
  };
  const commitRenameCollection = (id: string) => {
    const trimmed = renameName.trim();
    const current = collections.find((c) => c.id === id)?.name;
    if (trimmed && trimmed !== current) void onRenameCollection?.(id, trimmed);
    setRenamingCollectionId(null);
  };
  const [lastCreatedCollectionId, setLastCreatedCollectionId] = useState<
    string | null
  >(null);
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();
  const passageDragRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // 마키(영역 드래그) 시작 영역을 "학습지 관리" 패널 전체(헤더·폴더·필터·그리드)로 넓힌다.
  // 아래 "생성/검수결과" 패널과는 boundary 가 분리돼 서로 섞이지 않는다.
  const marqueeBoundaryRef = useRef<HTMLDivElement>(null);
  // 네이티브 드래그(폴더 이동)는 손잡이 엘리먼트에만 등록한다 → 카드 본문은 영역 선택용.
  const passageHandleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [mountedAtMs] = useState(() => Date.now());
  const [acknowledgedAnalysisGlowKeys, setAcknowledgedAnalysisGlowKeys] =
    useState<Set<string>>(() => {
      if (typeof window === "undefined") return new Set();
      try {
        const raw = window.localStorage.getItem(ANALYSIS_GLOW_ACK_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
          ? new Set(parsed.filter((v): v is string => typeof v === "string"))
          : new Set();
      } catch {
        return new Set();
      }
    });
  const folderDropRefs = useRef<Map<string, HTMLElement>>(new Map());
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  // '다음으로(워크스페이스)'가 비활(선택 0개)일 때 눌리면 이 안의 지문 카드들을
  // 글로우해 "지문을 먼저 고르세요"를 유도한다.
  const cardZoneRef = useRef<HTMLDivElement>(null);
  const allVisibleSelected =
    filteredPassages.length > 0 &&
    filteredPassages.every((passage) => selectedIds.has(passage.id));
  const someVisibleSelected = filteredPassages.some((passage) =>
    selectedIds.has(passage.id),
  );
  const selectedCollection = useMemo(
    () =>
      selectedCollectionId.length > 0
        ? collections.find(
            (collection) => collection.id === selectedCollectionId,
          )
        : null,
    [collections, selectedCollectionId],
  );
  const breadcrumbPath = useMemo(() => {
    if (!selectedCollection) return [] as PassageCollectionItem[];
    const path: PassageCollectionItem[] = [];
    const byId = new Map(
      collections.map((collection) => [collection.id, collection]),
    );
    let current: PassageCollectionItem | undefined = selectedCollection;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  }, [collections, selectedCollection]);
  const childCollections = useMemo(
    () =>
      collections.filter((collection) =>
        selectedCollectionId
          ? collection.parentId === selectedCollectionId
          : collection.parentId == null,
      ),
    [collections, selectedCollectionId],
  );
  const parentCollectionId = selectedCollection?.parentId ?? "";

  // 폴더별 누적(하위 폴더 포함) 카운트. 관리 페이지와 동일하게 카드 장수(중복
  // 포함)를 헤드라인으로, 중복 건수를 보조로 보여준다. 멤버십은 전체 지문의
  // collectionItems에서 파생(이 화면은 academy 전체 지문을 로드하므로 완전).
  const folderCountById = useMemo(() => {
    const membership = new Map<string, Set<string>>();
    for (const p of passages) {
      for (const ci of p.collectionItems ?? []) {
        let set = membership.get(ci.collectionId);
        if (!set) {
          set = new Set<string>();
          membership.set(ci.collectionId, set);
        }
        set.add(p.id);
      }
    }
    const childrenOf = new Map<string, string[]>();
    for (const c of collections) {
      if (!c.parentId) continue;
      let arr = childrenOf.get(c.parentId);
      if (!arr) {
        arr = [];
        childrenOf.set(c.parentId, arr);
      }
      arr.push(c.id);
    }
    const result = new Map<string, ResolvedFolderCount>();
    for (const c of collections) {
      const seen = new Set<string>();
      const visited = new Set<string>();
      let raw = 0;
      const stack = [c.id];
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const m = membership.get(id);
        if (m) {
          raw += m.size;
          for (const x of m) seen.add(x);
        }
        for (const k of childrenOf.get(id) ?? []) stack.push(k);
      }
      const direct = membership.get(c.id)?.size ?? c._count.items;
      result.set(
        c.id,
        resolveFolderCount({
          id: c.id,
          parentId: c.parentId ?? null,
          name: c.name,
          description: null,
          color: null,
          _count: { items: direct, children: (childrenOf.get(c.id) ?? []).length },
          totalItems: raw,
          duplicateCount: raw - seen.size,
        } as CollectionItem),
      );
    }
    return result;
  }, [collections, passages]);
  const movePickerCollections = useMemo<CollectionItem[]>(() => {
    const childCountByParent = new Map<string, number>();
    for (const collection of collections) {
      if (!collection.parentId) continue;
      childCountByParent.set(
        collection.parentId,
        (childCountByParent.get(collection.parentId) ?? 0) + 1,
      );
    }
    return collections.map((collection) => ({
      id: collection.id,
      parentId: collection.parentId ?? null,
      name: collection.name,
      description: null,
      color: null,
      createdAt: null,
      _count: {
        items: collection._count.items,
        children: childCountByParent.get(collection.id) ?? 0,
      },
    }));
  }, [collections]);
  const canManageSelectedPassages =
    !!onCopySelectedToCollection &&
    !!onMoveSelectedToCollection &&
    !!onDeleteSelectedPassages;
  const canRemoveSelectedFromCollection =
    !!selectedCollectionId && !!onRemoveSelectedFromCollection;
  const selectedReviewDraftPassages = useMemo(
    () =>
      passages.filter(
        (passage) =>
          selectedIds.has(passage.id) && passage.extractionReviewDraft,
      ),
    [passages, selectedIds],
  );
  const selectedPendingReviewPassages = useMemo(
    () =>
      selectedReviewDraftPassages.filter(
        (passage) =>
          passage.extractionReviewDraft?.reviewStatus !== "COMMITTED",
      ),
    [selectedReviewDraftPassages],
  );
  const firstPendingReviewPassageId = useMemo(
    () =>
      filteredPassages.find(
        (passage) =>
          passage.extractionReviewDraft &&
          passage.extractionReviewDraft.reviewStatus !== "COMMITTED",
      )?.id ?? null,
    [filteredPassages],
  );
  // 일괄 학습자료 생성 대상: 선택된 지문 중 이미 생성이 돌고 있는 것 제외.
  const selectedLearningTargets = useMemo(
    () =>
      passages.filter(
        (passage) =>
          selectedIds.has(passage.id) &&
          !learningGeneratingPassageIds?.has(passage.id),
      ),
    [learningGeneratingPassageIds, passages, selectedIds],
  );
  const learningBulkCreditCost =
    selectedLearningTargets.length * learningCreditCostPerPassage;
  const firstLearningTargetPassageId = useMemo(
    () =>
      filteredPassages.find(
        (passage) => !learningGeneratingPassageIds?.has(passage.id),
      )?.id ?? null,
    [filteredPassages, learningGeneratingPassageIds],
  );
  const copySelectedToCollection = onCopySelectedToCollection ?? (() => {});
  const moveSelectedToCollection = onMoveSelectedToCollection ?? (() => {});
  const removeSelectedFromCollection =
    onRemoveSelectedFromCollection ?? (() => {});
  const deleteSelectedPassages = onDeleteSelectedPassages ?? (() => {});

  useEffect(() => {
    if (!showNewFolderInput) return;
    window.requestAnimationFrame(() => {
      newFolderInputRef.current?.focus();
      newFolderInputRef.current?.select();
    });
  }, [showNewFolderInput]);

  useEffect(() => {
    if (
      lastCreatedCollectionId &&
      !collections.some(
        (collection) => collection.id === lastCreatedCollectionId,
      )
    ) {
      setLastCreatedCollectionId(null);
    }
  }, [collections, lastCreatedCollectionId]);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || !onCreateCollection || creatingFolder) return;

    setCreatingFolder(true);
    try {
      const id = await onCreateCollection(name, selectedCollectionId || null);
      if (!id) return;
      setLastCreatedCollectionId(id);
      setNewFolderName("");
      setShowNewFolderInput(false);
      dispatchGenerateTourMilestone("passage-folder-created");
    } finally {
      setCreatingFolder(false);
    }
  }, [creatingFolder, newFolderName, onCreateCollection, selectedCollectionId]);

  useEffect(() => {
    if (!selectAllCheckboxRef.current) return;
    selectAllCheckboxRef.current.indeterminate =
      someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  // 파란 글로우: 방금 "추출"이 끝난 지문 (freshAnalysisPassageIds prop).
  // 초록 글로우: 방금 "학습자료 생성(분석)"이 끝난 지문 — 이번 세션의
  // learningCompletedPassageIds + 최근 분석 완료 자동 감지(새로고침 후에도
  // 30분 창 동안 유지, 클릭 ack 는 localStorage 에 남는다).
  const learningGlowPassageIds = useMemo(() => {
    const next = new Set<string>();
    for (const passage of passages) {
      if (learningCompletedPassageIds?.has(passage.id)) {
        next.add(passage.id);
        continue;
      }

      if (!passage.analysis) continue;
      const key = analysisGlowKey(passage);
      if (!key || acknowledgedAnalysisGlowKeys.has(key)) continue;

      const updatedAtMs = analysisUpdatedAtMs(passage);
      if (updatedAtMs == null) continue;

      const completedAfterPageOpen = updatedAtMs >= mountedAtMs - 10_000;
      const completedRecently =
        mountedAtMs - updatedAtMs <= RECENT_ANALYSIS_GLOW_WINDOW_MS;
      if (completedAfterPageOpen || completedRecently) {
        next.add(passage.id);
      }
    }
    return next;
  }, [
    acknowledgedAnalysisGlowKeys,
    learningCompletedPassageIds,
    mountedAtMs,
    passages,
  ]);

  const glowingPassageIds = useMemo(() => {
    const next = new Set<string>();
    for (const passage of passages) {
      if (
        freshAnalysisPassageIds?.has(passage.id) &&
        !learningGlowPassageIds.has(passage.id)
      ) {
        next.add(passage.id);
      }
    }
    return next;
  }, [freshAnalysisPassageIds, learningGlowPassageIds, passages]);

  const firstLearningResultPassageId = useMemo(() => {
    const completedPassage = filteredPassages.find((passage) =>
      learningCompletedPassageIds?.has(passage.id),
    );
    if (completedPassage) return completedPassage.id;

    return (
      filteredPassages.find((passage) => learningGlowPassageIds.has(passage.id))
        ?.id ?? null
    );
  }, [filteredPassages, learningCompletedPassageIds, learningGlowPassageIds]);

  const openPassageCard = async (id: string) => {
    const passage = filteredPassages.find((item) => item.id === id);
    if (!passage) return;
    const isLearningResult =
      learningCompletedPassageIds?.has(id) || learningGlowPassageIds.has(id);
    onFreshAnalysisAcknowledged?.(id);
    const glowKey = analysisGlowKey(passage);
    if (glowKey) {
      setAcknowledgedAnalysisGlowKeys((prev) => {
        if (prev.has(glowKey)) return prev;
        const next = new Set(prev);
        next.add(glowKey);
        try {
          window.localStorage.setItem(
            ANALYSIS_GLOW_ACK_STORAGE_KEY,
            JSON.stringify([...next].slice(-500)),
          );
        } catch {
          /* ignore */
        }
        return next;
      });
    }
    // 추출/입력 원본(draft)이 있는 지문은 분석 완료 여부와 무관하게 상세
    // 모달(원문·복원문 비교 + 마킹 + 학습자료 생성 단계)을 연다 — 학습자료가
    // 이미 있으면 그 안의 "학습자료 다시 열기"로 한 번에 볼 수 있다. 분석이
    // 끝났다고 곧장 보고서로 점프하면 비교·마킹 단계가 사라진 것처럼 보인다.
    if (
      onViewPassageContent &&
      (!passage.analysis || passage.extractionReviewDraft)
    ) {
      onViewPassageContent(passage);
      if (isLearningResult) {
        dispatchGenerateTourMilestone("learning-detail-opened");
      }
      return;
    }
    await handleOpenAnalysisModal(id);
    if (isLearningResult) {
      dispatchGenerateTourMilestone("learning-detail-opened");
    }
  };

  const handleCardKeyDown = (
    id: string,
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === " ") {
      event.preventDefault();
      toggleCheckbox(id);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    void openPassageCard(id);
  };

  const handlePassageCardClick = (
    id: string,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.detail > 1 || shouldIgnoreCardSelectionClick(event)) return;
    scheduleCardSelectionClick(() => toggleCheckbox(id));
  };

  const handlePassageCardDoubleClick = (
    id: string,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    cancelPendingCardSelectionClick();
    clearCardTextSelection();
    if (shouldIgnoreCardDoubleClick(event)) return;
    void openPassageCard(id);
  };

  const getDragPassageIds = useCallback(
    (id: string) => (selectedIds.has(id) ? [...selectedIds] : [id]),
    [selectedIds],
  );

  useEffect(() => {
    if (!onMovePassagesToCollection || passageBulkAction !== null) return;
    const cleanupFns: Array<() => void> = [];

    for (const passage of filteredPassages) {
      const element = passageHandleRefs.current.get(passage.id);
      if (!element) continue;

      cleanupFns.push(
        draggable({
          element,
          getInitialData: () => {
            const ids = getDragPassageIds(passage.id);
            return {
              type: ids.length > 1 ? "passage-bulk" : "passage",
              passageId: passage.id,
              passageIds: ids,
            };
          },
          // 2개 이상을 선택한 채 드래그하면 카드들이 하나로 겹쳐지는
          // 스택 프리뷰 + 개수 배지를 띄운다 (단일 드래그는 브라우저 기본).
          onGenerateDragPreview: ({ nativeSetDragImage }) => {
            const count = getDragPassageIds(passage.id).length;
            const source = passageDragRefs.current.get(passage.id);
            if (!source) return;
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: ({ container }) => {
                const rect = container.getBoundingClientRect();
                return { x: Math.min(120, rect.width / 2), y: 24 };
              },
              render: ({ container }) => {
                const rect = source.getBoundingClientRect();
                const wrapper = document.createElement("div");
                wrapper.style.position = "relative";
                wrapper.style.width = `${rect.width}px`;
                wrapper.style.height = `${rect.height}px`;
                const backCount = Math.min(2, count - 1);
                for (let i = backCount; i >= 1; i--) {
                  const back = document.createElement("div");
                  back.style.position = "absolute";
                  back.style.inset = "0";
                  back.style.transform = `translate(${i * 6}px, ${i * 6}px)`;
                  back.style.borderRadius = "12px";
                  back.style.background = "white";
                  back.style.border = "1px solid rgb(226, 232, 240)";
                  back.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
                  wrapper.appendChild(back);
                }
                const clone = source.cloneNode(true) as HTMLElement;
                clone.style.position = "relative";
                clone.style.width = `${rect.width}px`;
                clone.style.margin = "0";
                clone.style.opacity = "1";
                clone.style.transform = "none";
                wrapper.appendChild(clone);
                if (count > 1) {
                  const badge = document.createElement("div");
                  badge.textContent = String(count);
                  badge.style.position = "absolute";
                  badge.style.top = "-10px";
                  badge.style.right = "-10px";
                  badge.style.minWidth = "28px";
                  badge.style.height = "28px";
                  badge.style.padding = "0 8px";
                  badge.style.borderRadius = "14px";
                  badge.style.background = "#2563eb";
                  badge.style.color = "white";
                  badge.style.fontSize = "13px";
                  badge.style.fontWeight = "700";
                  badge.style.display = "flex";
                  badge.style.alignItems = "center";
                  badge.style.justifyContent = "center";
                  badge.style.boxShadow = "0 4px 12px rgba(37,99,235,0.35)";
                  badge.style.fontVariantNumeric = "tabular-nums";
                  wrapper.appendChild(badge);
                }
                container.appendChild(wrapper);
              },
            });
          },
          onDragStart: ({ source }) => {
            const sourceIds = Array.isArray(source.data.passageIds)
              ? source.data.passageIds.filter(
                  (id): id is string => typeof id === "string",
                )
              : [passage.id];
            setDraggingPassageIds(sourceIds);
          },
          onDrop: () => {
            setDraggingPassageIds([]);
            setDropTargetCollectionId(null);
          },
        }),
      );
    }

    return () => cleanupFns.forEach((cleanup) => cleanup());
  }, [
    filteredPassages,
    getDragPassageIds,
    onMovePassagesToCollection,
    passageBulkAction,
  ]);

  useEffect(() => {
    if (!onMovePassagesToCollection || passageBulkAction !== null) return;
    const cleanupFns: Array<() => void> = [];

    for (const [collectionId, element] of folderDropRefs.current.entries()) {
      cleanupFns.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) =>
            source.data.type === "passage" ||
            source.data.type === "passage-bulk",
          onDragEnter: () => setDropTargetCollectionId(collectionId),
          onDragLeave: () =>
            setDropTargetCollectionId((current) =>
              current === collectionId ? null : current,
            ),
          onDrop: ({ source, location }) => {
            setDropTargetCollectionId(null);
            setDraggingPassageIds([]);

            const sourceIds = Array.isArray(source.data.passageIds)
              ? source.data.passageIds.filter(
                  (id): id is string => typeof id === "string",
                )
              : typeof source.data.passageId === "string"
                ? [source.data.passageId]
                : [];
            const ids = Array.from(new Set(sourceIds));
            if (ids.length === 0) return;

            // "전체 지문"(루트) 상위 버튼에 떨어뜨리면 현재 폴더에서 빼낸다.
            if (collectionId === "__to_root__") {
              void onRemovePassagesFromFolder?.(ids, selectedCollectionId);
              return;
            }

            // With copy available, ask the user 복사 vs 이동 right at the drop
            // point (drag used to silently move, removing from other folders —
            // confusing when reusing the same passage across students). Without
            // it, keep the legacy immediate-move behaviour.
            if (onCopyPassagesToCollection) {
              const input = location?.current?.input;
              const folderName =
                collections.find((c) => c.id === collectionId)?.name ?? "폴더";
              // Folders the dragged items currently belong to (union), minus the
              // target — so the move chooser can offer "keep here" per folder.
              const idSet = new Set(ids);
              const currentFolderIds = new Set<string>();
              for (const passage of passages) {
                if (!idSet.has(passage.id)) continue;
                for (const item of passage.collectionItems ?? []) {
                  if (item.collectionId !== collectionId) {
                    currentFolderIds.add(item.collectionId);
                  }
                }
              }
              const currentFolders = collections
                .filter((c) => currentFolderIds.has(c.id))
                .map((c) => ({ id: c.id, name: c.name }));
              setPendingFolderDrop({
                ids,
                collectionId,
                folderName,
                anchor: {
                  x: input?.clientX ?? window.innerWidth / 2,
                  y: input?.clientY ?? window.innerHeight / 2,
                },
                currentFolders,
              });
              return;
            }

            void onMovePassagesToCollection(ids, collectionId);
          },
        }),
      );
    }

    return () => cleanupFns.forEach((cleanup) => cleanup());
  }, [
    childCollections,
    collections,
    passages,
    onMovePassagesToCollection,
    onCopyPassagesToCollection,
    onRemovePassagesFromFolder,
    selectedCollectionId,
    passageBulkAction,
  ]);

  const renderFolderChip = (
    key: string,
    label: string,
    count: number,
    active: boolean,
    onClick: () => void,
    dropCollectionId?: string,
    tourTarget?: string,
    countInfo?: ResolvedFolderCount,
  ) => {
    const isDropTarget =
      !!dropCollectionId && dropTargetCollectionId === dropCollectionId;

    // 인라인 이름 변경 모드 — 칩 자리에 입력창을 띄운다.
    if (
      onRenameCollection &&
      dropCollectionId &&
      renamingCollectionId === dropCollectionId
    ) {
      return (
        <div
          key={key}
          className="flex w-[64px] flex-col items-center justify-center rounded-lg border-2 border-blue-400 bg-white px-1 py-1 shadow-lg ring-2 ring-blue-200/50"
        >
          <Folder className="mb-0.5 size-3 text-slate-500" aria-hidden="true" />
          <input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRenameCollection(dropCollectionId);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setRenamingCollectionId(null);
              }
            }}
            onBlur={() => commitRenameCollection(dropCollectionId)}
            className="w-full rounded border border-blue-300 bg-white px-1 py-0.5 text-center text-[9px] font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            maxLength={30}
          />
        </div>
      );
    }

    return (
      <button
        key={key}
        ref={
          dropCollectionId
            ? (node) => {
                if (node) folderDropRefs.current.set(dropCollectionId, node);
                else folderDropRefs.current.delete(dropCollectionId);
              }
            : undefined
        }
        type="button"
        data-generate-tour={tourTarget}
        onClick={onClick}
        onDoubleClick={(e) => {
          if (onRenameCollection && dropCollectionId) {
            e.stopPropagation();
            startRenameCollection(dropCollectionId, label);
          }
        }}
        title={onRenameCollection && dropCollectionId ? `${label} (더블클릭하여 이름 변경)` : label}
        className={
          "group relative flex w-[64px] cursor-pointer flex-col items-center justify-center rounded-lg border px-1 py-1 shadow-sm transition-all " +
          (active || isDropTarget
            ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200/60 shadow-md"
            : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md") +
          (isDropTarget ? " scale-105" : "")
        }
      >
        {active || isDropTarget ? (
          <FolderOpen
            className="mb-0.5 size-3 text-blue-600"
            aria-hidden="true"
          />
        ) : (
          <Folder className="mb-0.5 size-3 text-blue-500" aria-hidden="true" />
        )}
        <span
          className={
            "max-w-[56px] truncate text-center text-[9.5px] font-bold leading-tight " +
            (active || isDropTarget ? "text-blue-700" : "text-slate-800")
          }
        >
          {label}
        </span>
        <span
          title={countInfo?.tooltip}
          className={
            "flex items-center gap-0.5 text-[8.5px] tabular-nums " +
            (countInfo?.includesSubfolders || active || isDropTarget
              ? "text-blue-500"
              : "text-slate-400")
          }
        >
          {countInfo?.includesSubfolders ? (
            <Layers className="size-2" aria-hidden="true" />
          ) : null}
          {countInfo ? countInfo.display : count}개
        </span>
        {countInfo?.note ? (
          <span
            title={countInfo.tooltip}
            className={
              "text-[7px] font-semibold leading-none " +
              (countInfo.noteTone === "duplicate"
                ? "text-amber-500"
                : "text-blue-400")
            }
          >
            {countInfo.note}
          </span>
        ) : null}
      </button>
    );
  };

  const renderParentChip = () => {
    const isDropTarget =
      !!parentCollectionId && dropTargetCollectionId === parentCollectionId;

    return (
      <button
        ref={(node) => {
          // 상위가 실제 폴더면 그 id로, "전체 지문"(루트)이면 sentinel로 등록 →
          // 드롭 시 현재 폴더에서 빼낸다.
          const key = parentCollectionId || "__to_root__";
          if (node) folderDropRefs.current.set(key, node);
          else folderDropRefs.current.delete(key);
        }}
        type="button"
        onClick={() => setSelectedCollectionId(parentCollectionId)}
        title={parentCollectionId ? "상위 폴더로 이동" : "전체 지문으로 이동"}
        className={
          "group relative flex size-[48px] cursor-pointer flex-col items-center justify-center rounded-lg border bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-blue-600 hover:shadow-md " +
          (isDropTarget
            ? "scale-105 border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-200/60"
            : "border-slate-200")
        }
      >
        <CornerUpLeft className="mb-0.5 size-3.5" aria-hidden="true" />
        <span className="text-[9.5px] font-semibold">상위</span>
      </button>
    );
  };

  return (
    <div
      ref={marqueeBoundaryRef}
      className="flex flex-1 min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white"
    >
      {/* ─── 지문 폴더 (탐색/필터 전용) ─── */}
      <div className="shrink-0 border-b border-slate-100">
        <div className="flex min-w-0 items-center gap-2 px-5 pt-3 pb-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <FolderOpen className="h-3.5 w-3.5" />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="shrink-0 truncate text-[12px] font-medium text-slate-400">
              학습지 관리 ·
            </span>
            <button
              type="button"
              onClick={() => setSelectedCollectionId("")}
              className={
                "shrink-0 cursor-pointer truncate text-[12px] transition-colors hover:text-blue-700 " +
                (breadcrumbPath.length === 0
                  ? "font-bold text-slate-900"
                  : "font-medium text-slate-500")
              }
            >
              전체 지문
            </button>
            {breadcrumbPath.map((folder, index) => {
              const current = index === breadcrumbPath.length - 1;
              return (
                <span
                  key={folder.id}
                  className="flex min-w-0 items-center gap-1"
                >
                  <ChevronRight
                    className="size-3 shrink-0 text-slate-300"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedCollectionId(folder.id)}
                    className={
                      "cursor-pointer truncate text-[12px] transition-colors hover:text-blue-700 " +
                      (current
                        ? "font-bold text-slate-900"
                        : "font-medium text-slate-500")
                    }
                  >
                    {folder.name}
                  </button>
                </span>
              );
            })}
          </div>

          {/* 정렬 필터 + 검색 (팝오버) */}
          {setPassageSortOrder ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <PassageSortSearchPopover
                passageSortOrder={passageSortOrder}
                setPassageSortOrder={setPassageSortOrder}
                passageSearch={passageSearch}
                setPassageSearch={setPassageSearch}
              />
            </div>
          ) : null}

          {folderWindowCollapsed ? (
            <button
              type="button"
              onClick={() => setFolderWindowCollapsed(false)}
              aria-expanded={false}
              title="지문 폴더 펼치기"
              className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
            >
              <ChevronDown className="size-3.5" aria-hidden="true" />
              <span>펼치기</span>
            </button>
          ) : null}
        </div>

        {!folderWindowCollapsed ? (
          <>
            <div
              style={{ height: `${folderWindowHeight}px` }}
              data-generate-tour="library-folder-window"
              className="min-h-0 overflow-y-auto bg-slate-50/70 px-5 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                {selectedCollectionId
                  ? renderParentChip()
                  : renderFolderChip(
                      "__all__",
                      "전체 지문",
                      passages.length,
                      true,
                      () => setSelectedCollectionId(""),
                    )}
                {childCollections.map((c) =>
                  renderFolderChip(
                    c.id,
                    c.name,
                    c._count.items,
                    false,
                    () => setSelectedCollectionId(c.id),
                    c.id,
                    c.id === lastCreatedCollectionId
                      ? "library-folder-created-drop-target"
                      : undefined,
                    folderCountById.get(c.id),
                  ),
                )}
                {onCreateCollection ? (
                  showNewFolderInput ? (
                    <form
                      data-generate-tour="library-folder-create-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleCreateFolder();
                      }}
                      className="flex h-[48px] w-[142px] items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2 shadow-sm ring-2 ring-blue-100/60"
                    >
                      <FolderPlus
                        className="size-3.5 shrink-0 text-blue-600"
                        aria-hidden="true"
                      />
                      <input
                        ref={newFolderInputRef}
                        data-generate-tour="library-folder-name-input"
                        value={newFolderName}
                        onChange={(event) =>
                          setNewFolderName(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setShowNewFolderInput(false);
                            setNewFolderName("");
                          }
                        }}
                        placeholder="폴더 이름"
                        disabled={creatingFolder}
                        className="min-w-0 flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!newFolderName.trim() || creatingFolder}
                        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
                        aria-label="폴더 생성"
                        title="폴더 생성"
                      >
                        {creatingFolder ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check className="size-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      data-generate-tour="library-folder-create-button"
                      onClick={() => {
                        setNewFolderName("");
                        setShowNewFolderInput(true);
                      }}
                      className="group flex size-[48px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-white px-1 py-1 text-blue-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
                      title="새 폴더 추가"
                      aria-label="새 폴더 추가"
                    >
                      <FolderPlus className="mb-0.5 size-3.5" />
                      <span className="text-[9.5px] font-bold">추가</span>
                    </button>
                  )
                ) : null}
              </div>
            </div>
            <div className="relative flex shrink-0 items-center justify-end px-4 pb-0 pt-0">
              <div
                onPointerDown={beginFolderWindowResize}
                onDoubleClick={resetFolderWindowHeight}
                role="separator"
                aria-orientation="horizontal"
                title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
                className="group/vhandle absolute left-1/2 top-1/2 inline-flex h-3 w-[200px] -translate-x-1/2 -translate-y-1/2 cursor-row-resize items-center justify-center px-1 select-none"
              >
                <div className="h-0.5 w-full rounded-full bg-slate-200 transition-colors group-hover/vhandle:bg-blue-400 group-active/vhandle:bg-blue-500" />
              </div>
              <button
                type="button"
                onClick={() => setFolderWindowCollapsed(true)}
                aria-expanded
                title="지문 폴더 접기"
                className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
              >
                <ChevronUp className="size-3.5" aria-hidden="true" />
                <span>접기</span>
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* Search & filter bar — @container: 패널 폭에 따라 일괄 액션 버튼이
          라벨→아이콘만으로 단계적으로 줄어든다 (뷰포트가 아닌 패널 기준). */}
      <div
        className="@container px-5 py-3 border-b border-slate-100 shrink-0"
        data-generate-tour="library-toolbar"
      >
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="flex min-h-9 shrink-0 items-center gap-x-1.5 gap-y-1.5 py-1 pl-2 pr-0 transition-colors">
            <input
              ref={selectAllCheckboxRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() =>
                allVisibleSelected ? deselectAll() : selectAll()
              }
              disabled={filteredPassages.length === 0}
              title={
                allVisibleSelected
                  ? "선택 해제"
                  : `${filteredPassages.length}개 전체 선택`
              }
              aria-label={allVisibleSelected ? "선택 해제" : "전체 선택"}
              className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {/* '워크스페이스에서 지문 편집 / 추가' 버튼은 내 지문함 하단의
                가로 전체 보라색 버튼으로 내렸다 (목록 아래 큰 액션 바). */}
            {canManageSelectedPassages ? (
              <div
                className={
                  "flex items-center gap-3 @max-[30rem]:gap-1.5 " +
                  (selectedIds.size > 0 ? "" : "pointer-events-none opacity-50")
                }
                aria-disabled={selectedIds.size === 0}
              >
                <MoveOrCopyFolderPicker
                  collections={movePickerCollections}
                  activeFolder={selectedCollectionId || null}
                  selectedCount={selectedIds.size}
                  onCopy={copySelectedToCollection}
                  onMove={moveSelectedToCollection}
                  disabled={
                    selectedIds.size === 0 || passageBulkAction !== null
                  }
                  compact
                />
                {onBulkCompleteExtractionReview ? (
                  <button
                    type="button"
                    onClick={() =>
                      onBulkCompleteExtractionReview(
                        selectedReviewDraftPassages,
                      )
                    }
                    data-generate-tour="library-review-complete"
                    disabled={
                      selectedPendingReviewPassages.length === 0 ||
                      reviewBulkActionRunning ||
                      passageBulkAction !== null
                    }
                    title={
                      selectedPendingReviewPassages.length > 0
                        ? `검수필요 ${selectedPendingReviewPassages.length}개 검수완료`
                        : "선택한 자료 중 검수필요 항목이 없습니다"
                    }
                    className={
                      // per-card 토글과 동일한 빨강/초록 언어: 선택 중 검수필요가
                      // 있으면 빨강(클릭 시 완료, hover 초록 미리보기), 없으면 초록(완료).
                      "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2.5 text-[11px] font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                      (selectedPendingReviewPassages.length > 0
                        ? "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
                        : "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700")
                    }
                  >
                    {reviewBulkActionRunning ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}
                    <span className="@max-[30rem]:hidden">검수완료</span>
                  </button>
                ) : null}
                {onBulkGenerateLearning ? (
                  <button
                    type="button"
                    onClick={() =>
                      onBulkGenerateLearning(selectedLearningTargets)
                    }
                    data-generate-tour="library-learning-generate"
                    disabled={
                      selectedLearningTargets.length === 0 ||
                      learningBulkActionRunning ||
                      passageBulkAction !== null
                    }
                    title={
                      selectedLearningTargets.length > 0
                        ? `선택한 ${selectedLearningTargets.length}개 지문의 학습자료를 생성합니다 (크레딧 ${learningBulkCreditCost} 소모)`
                        : "학습자료를 생성할 지문을 선택하세요"
                    }
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {learningBulkActionRunning ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <GraduationCap
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}
                    <span className="@max-[30rem]:hidden">학습자료 생성</span>
                    {selectedLearningTargets.length > 0 ? (
                      <CreditCostChip
                        amount={learningBulkCreditCost}
                        className="rounded bg-slate-100 px-1 py-px text-[10px] text-slate-600 @max-[36rem]:hidden"
                      />
                    ) : null}
                  </button>
                ) : null}
                {canRemoveSelectedFromCollection ? (
                  <button
                    type="button"
                    onClick={removeSelectedFromCollection}
                    disabled={
                      selectedIds.size === 0 || passageBulkAction !== null
                    }
                    title="폴더에서 삭제"
                    aria-label="폴더에서 삭제"
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {passageBulkAction === "remove" ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <FolderX className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={deleteSelectedPassages}
                  disabled={
                    selectedIds.size === 0 || passageBulkAction !== null
                  }
                  title="삭제"
                  aria-label="삭제"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {passageBulkAction === "delete" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            ) : null}
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <PassageFilterPopover
              activeFilterCount={activeFilterCount}
              filterOptions={filterOptions}
              filterSchool={filterSchool}
              setFilterSchool={setFilterSchool}
              filterGrade={filterGrade}
              setFilterGrade={setFilterGrade}
              filterSemester={filterSemester}
              setFilterSemester={setFilterSemester}
              analysisStatusFilter={analysisStatusFilter}
              setAnalysisStatusFilter={setAnalysisStatusFilter}
              passageStatusCounts={passageStatusCounts}
            />
            <button
              type="button"
              onClick={() => setShowSearch((open) => !open)}
              aria-expanded={showSearch}
              title={passageSearch ? "검색어 적용 중" : "검색"}
              aria-label="검색"
              className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                showSearch || passageSearch
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-input bg-transparent text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Search className="size-3.5 shrink-0" aria-hidden="true" />
              {passageSearch ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
                />
              ) : null}
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="mt-1.5 border-t border-slate-100 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="지문 제목 또는 내용으로 검색..."
                value={passageSearch}
                onChange={(e) => setPassageSearch(e.target.value)}
                className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-7 text-[12px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
              {passageSearch ? (
                <button
                  type="button"
                  onClick={() => setPassageSearch("")}
                  className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="검색어 지우기"
                  title="검색어 지우기"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Passage card grid -- scrollable */}
      <div ref={cardZoneRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* 이미지·PDF 추출 중 지문 로딩 카드(완료되면 실제 카드로 교체) */}
        {loadingCards}
        {loadingPassages ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-[12px] text-slate-400">
              지문 불러오는 중...
            </span>
          </div>
        ) : filteredPassages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <FileText className="w-8 h-8 text-slate-300" />
            <span className="text-[13px] text-slate-400 font-medium">
              {passages.length === 0
                ? "등록된 지문이 없습니다"
                : "검색 결과가 없습니다"}
            </span>
          </div>
        ) : (
          // boundaryRef: "학습지 관리" 패널 전체에서 드래그를 시작할 수 있게 한다(카드만 선택).
          <DragSelect
            className="min-h-full"
            value={selectedIds}
            onChange={setSelectedIds}
            boundaryRef={marqueeBoundaryRef}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {filteredPassages.map((p, cardIndex) => {
                // Parse analysis
                let aData: ParsedAnalysisSummary | null = null;
                if (p.analysis?.analysisData) {
                  try {
                    aData =
                      typeof p.analysis.analysisData === "string"
                        ? JSON.parse(p.analysis.analysisData)
                        : p.analysis.analysisData;
                  } catch {}
                }
                const mainIdea = aData?.structure?.mainIdea;
                const isChecked = selectedIds.has(p.id);
                const isInWorkspace = workspacePassageIds?.has(p.id) ?? false;
                const hasAnalysis = !!p.analysis;
                const isLearningGenerating =
                  learningGeneratingPassageIds?.has(p.id) ?? false;
                const isLearningGlow =
                  !isLearningGenerating && learningGlowPassageIds.has(p.id);
                const isGlowing =
                  !isLearningGenerating &&
                  !isLearningGlow &&
                  glowingPassageIds.has(p.id);
                // 상세를 열어봤다가 닫은 카드 — 생성/추출 글로우가 없을 때만,
                // 그리고 지금 열려 있는 카드가 아닐 때만 배경을 한 번 반짝인다.
                const isRecentlyViewed =
                  !isGlowing &&
                  !isLearningGlow &&
                  !isLearningGenerating &&
                  lastViewedPassageId != null &&
                  lastViewedPassageId === p.id &&
                  openPassageDetailId !== p.id;
                const reviewDraft = p.extractionReviewDraft ?? null;
                const hasReviewDraft = reviewDraft != null;
                const isReviewCommitted =
                  reviewDraft?.reviewStatus === "COMMITTED";
                const reviewStampLabel = isReviewCommitted
                  ? "검수완료"
                  : "검수필요";

                return (
                  <div
                    key={p.id}
                    data-drag-item-id={p.id}
                    data-generate-tour={
                      p.id === firstLearningResultPassageId
                        ? "passage-learning-result-card"
                        : cardIndex === 0
                          ? "passage-card"
                          : undefined
                    }
                    ref={(node) => {
                      if (node) passageDragRefs.current.set(p.id, node);
                      else passageDragRefs.current.delete(p.id);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.title} 상세 보기`}
                    onMouseDown={preventCardDoubleClickTextSelection}
                    onClick={(e) => handlePassageCardClick(p.id, e)}
                    onDoubleClick={(e) => handlePassageCardDoubleClick(p.id, e)}
                    onKeyDown={(e) => handleCardKeyDown(p.id, e)}
                    className={`group relative flex h-[300px] flex-col overflow-hidden rounded-xl border bg-white p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
                      isChecked
                        ? "border-blue-400 ring-2 ring-blue-300/30"
                        : hasReviewDraft && !isReviewCommitted
                          ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)] hover:border-red-300/80"
                          : hasAnalysis
                            ? "border-slate-200"
                            : "border-slate-200"
                    } ${
                      draggingPassageIds.includes(p.id)
                        ? "opacity-60 ring-2 ring-blue-200"
                        : ""
                    } ${
                      isGlowing
                        ? "!border-blue-400 !ring-2 !ring-blue-400/60 !shadow-[0_0_0_1px_rgba(37,99,235,0.45),0_0_36px_12px_rgba(37,99,235,0.36)] hover:!shadow-[0_0_0_1px_rgba(37,99,235,0.55),0_0_42px_14px_rgba(37,99,235,0.46)] motion-safe:animate-pulse"
                        : ""
                    } ${
                      isLearningGlow
                        ? "!border-blue-400 !ring-2 !ring-blue-400/60 !shadow-[0_0_0_1px_rgba(37,99,235,0.45),0_0_36px_12px_rgba(37,99,235,0.36)] hover:!shadow-[0_0_0_1px_rgba(37,99,235,0.55),0_0_42px_14px_rgba(37,99,235,0.46)] motion-safe:animate-pulse"
                        : ""
                    } ${
                      isLearningGenerating
                        ? "learning-generating-glow !border-blue-200 !shadow-[0_0_24px_4px_rgba(37,99,235,0.18)]"
                        : ""
                    } ${
                      isRecentlyViewed
                        ? "motion-safe:animate-[card-recently-viewed-flash_1.2s_ease-out]"
                        : ""
                    } outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white`}
                  >
                    {isInWorkspace ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1 bg-blue-500"
                      />
                    ) : null}
                    {/* Header with handle + checkbox */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {/* Drag handle (folder 이동) — passageBulkAction 중에는 숨김 */}
                        {passageBulkAction === null && (
                          <DragHandle
                            ref={(node) => {
                              if (node)
                                passageHandleRefs.current.set(p.id, node);
                              else passageHandleRefs.current.delete(p.id);
                            }}
                            data-generate-tour={
                              cardIndex === 0
                                ? "passage-card-drag-handle"
                                : undefined
                            }
                            className="mt-0.5 shrink-0"
                          />
                        )}
                        {/* Checkbox */}
                        <button
                          type="button"
                          aria-pressed={isChecked}
                          aria-label={`${p.title} passage ${isChecked ? "deselect" : "select"}`}
                          data-generate-tour={
                            p.id === firstPendingReviewPassageId
                              ? "passage-review-checkbox"
                              : p.id === firstLearningTargetPassageId
                                ? "passage-learning-checkbox"
                                : cardIndex === 0
                                  ? "passage-card-checkbox"
                                  : undefined
                          }
                          onClick={(e) => toggleCheckbox(p.id, e)}
                          className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                            isChecked
                              ? "bg-blue-600 text-white border border-blue-600"
                              : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
                          }`}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <PassageInlineTitle
                            passageId={p.id}
                            title={p.title}
                            onRenamed={onPassageRenamed}
                          />
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {(() => {
                              const created = formatMinuteTimestamp(
                                p.createdAt,
                              );
                              if (!created) return null;
                              const updated = formatMinuteTimestamp(
                                p.updatedAt,
                              );
                              return (
                                <span
                                  className="text-[10px] tabular-nums text-slate-400"
                                  title={
                                    updated && updated !== created
                                      ? `등록 ${created} · 수정 ${updated}`
                                      : `등록 ${created}`
                                  }
                                >
                                  {created}
                                </span>
                              );
                            })()}
                            {isLearningGenerating && (
                              <span
                                className="learning-generating-text text-[10.5px] font-bold whitespace-nowrap"
                                title="이 지문의 학습자료가 백그라운드에서 생성되고 있습니다"
                              >
                                학습자료 생성중
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Content preview — 남는 세로 공간을 채워, 학습자료 요약 유무와
                        상관없이 카드 높이가 일관되게 보이도록 flex-1 로 늘린다. */}
                    <div className="mt-2.5 min-h-0 flex-1 overflow-hidden">
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {p.content}
                      </p>
                    </div>

                    {/* Main idea + Meta */}
                    <div className="mt-3 space-y-2">
                      {mainIdea && (
                        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                          {mainIdea}
                        </p>
                      )}
                      {(p.school || p.grade || p.semester) && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {p.school && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-5 px-1.5 font-medium"
                            >
                              {p.school.name}
                            </Badge>
                          )}
                          {p.grade && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] h-5 px-1.5"
                            >
                              {p.grade}학년
                            </Badge>
                          )}
                          {p.semester && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] h-5 px-1.5"
                            >
                              {p.semester === "FIRST" ? "1학기" : "2학기"}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 생성된 문제 · 학습자료 토글 — 카드 가로 전체 폭으로 한 줄 위 */}
                    <div className="w-full">
                      <PassageQuestionsSummary
                        questions={questionsByPassage?.get(p.id) ?? []}
                        onOpenQuestion={onOpenQuestionDetail}
                      />
                      <PassageReportsSummary
                        passageId={p.id}
                        reports={p.reports ?? []}
                        onOpen={handleOpenAnalysisModal}
                      />
                    </div>

                    {/* 카드 맨 아래 액션 줄: 검수(완료/취소) · 상세보기 */}
                    <div className="mt-3 flex items-end gap-1.5">
                      {hasReviewDraft
                        ? (() => {
                            const reviewBusy =
                              reviewActionPassageIds?.has(p.id) ?? false;
                            const interactive = !!onToggleExtractionReview;
                            return (
                              <button
                                type="button"
                                aria-pressed={isReviewCommitted}
                                aria-label={reviewStampLabel}
                                disabled={!interactive || reviewBusy}
                                title={
                                  interactive
                                    ? isReviewCommitted
                                      ? "검수완료 — 누르면 검수필요로 되돌립니다"
                                      : "검수필요 — 누르면 검수완료로 표시합니다"
                                    : reviewStampLabel
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (reviewBusy) return;
                                  onToggleExtractionReview?.(p);
                                }}
                                className={
                                  "inline-flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11px] font-semibold bg-white transition-colors disabled:pointer-events-none disabled:opacity-50 " +
                                  (isReviewCommitted
                                    ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                    : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                                }
                              >
                                {reviewBusy ? (
                                  <Loader2
                                    className="w-3 h-3 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <CheckCircle2
                                    className="w-3 h-3"
                                    aria-hidden="true"
                                  />
                                )}
                                {isReviewCommitted ? "검수완료" : "미검수"}
                              </button>
                            );
                          })()
                        : null}
                      <CardDetailIconButton
                        className="size-7 shrink-0 rounded-md"
                        iconClassName="size-3.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openPassageCard(p.id);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </DragSelect>
        )}
      </div>

      {/* ── 내 지문함 하단 액션 바 — 가로 전체 보라색 버튼 ──
          선택한 지문을 워크스페이스로 보내 편집하거나(없을 때) 작업 중인
          워크스페이스에 추가한다(있을 때). 목록 아래 항상 보이는 큰 버튼. */}
      {onEditSelected ? (
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3">
          <button
            type="button"
            // aria-disabled — 비활처럼 보이되 클릭은 살려, 선택 0개일 때 누르면 지문
            // 카드들을 글로우해 "지문을 먼저 고르세요"를 유도한다.
            aria-disabled={selectedIds.size === 0 || passageBulkAction !== null}
            onClick={() => {
              if (passageBulkAction !== null) return;
              if (selectedIds.size === 0) {
                // 이미 워크스페이스에 들어가 있는 지문은 제외하고, '추가할 수 있는'
                // 카드만 글로우해 선택을 유도한다(시각적 소음 방지로 앞 24개만).
                const root = cardZoneRef.current;
                const cards = root
                  ? Array.from(
                      root.querySelectorAll<HTMLElement>("[data-drag-item-id]"),
                    )
                      .filter((el) => {
                        const id = el.getAttribute("data-drag-item-id");
                        return (
                          id != null &&
                          !(workspacePassageIds?.has(id) ?? false)
                        );
                      })
                      .slice(0, 24)
                  : [];
                triggerHintGlow(cards);
                return;
              }
              onEditSelected();
            }}
            data-generate-tour="library-edit-selected"
            title={
              selectedIds.size > 0
                ? workspaceActive
                  ? `선택한 ${selectedIds.size}개 지문을 작업 중인 워크스페이스에 추가합니다.`
                  : `선택한 ${selectedIds.size}개 지문을 워크스페이스에서 편집합니다. 편집·AI 변형 후 문제를 생성하세요.`
                : "워크스페이스에서 편집할 지문을 선택하세요"
            }
            // 비활 상태도 회색이 아니라 흐릿한 파란색으로(다른 '다음으로' 버튼과 통일).
            className={
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-bold text-white shadow-sm transition-colors " +
              (selectedIds.size === 0 || passageBulkAction !== null
                ? "cursor-not-allowed bg-blue-300 shadow-none"
                : "cursor-pointer bg-blue-600 hover:bg-blue-700")
            }
          >
            <FilePen className="h-5 w-5" aria-hidden="true" />
            <span>
              {workspaceActive
                ? "추가하기"
                : "다음으로 (워크스페이스)"}
            </span>
            {selectedIds.size > 0 ? (
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[12px] font-bold tabular-nums">
                {selectedIds.size}개
              </span>
            ) : null}
          </button>
        </div>
      ) : null}
      <DragDropModePopover
        key={
          pendingFolderDrop
            ? `${pendingFolderDrop.collectionId}:${pendingFolderDrop.anchor.x}:${pendingFolderDrop.anchor.y}`
            : "none"
        }
        pending={
          pendingFolderDrop
            ? {
                itemId: pendingFolderDrop.ids[0],
                folderId: pendingFolderDrop.collectionId,
                folderName: pendingFolderDrop.folderName,
                anchor: pendingFolderDrop.anchor,
                currentFolders: pendingFolderDrop.currentFolders,
                // 폴더 안에서 드래그할 때만 "이동"(현재 폴더에서 빼서 옮김)을
                // 제공한다. 루트(전체 지문)면 undefined → 단일 "담기"만 노출.
                sourceFolderName: selectedCollection?.name,
              }
            : null
        }
        itemLabel="지문"
        onChoose={({ copy }) => {
          if (pendingFolderDrop) {
            const { ids, collectionId } = pendingFolderDrop;
            if (copy) {
              void onCopyPassagesToCollection?.(ids, collectionId);
            } else {
              // 이동 = "지금 보고 있는 폴더"에서만 빼고 옮긴다(관리 페이지와 동일).
              // 다른 폴더의 사본은 keepFolderIds로 보존하고 현재 폴더만 제거한다.
              // (루트에선 빼낼 현재 폴더가 없어 팝오버가 단일 "담기"만 띄운다.)
              const keepFolderIds = pendingFolderDrop.currentFolders
                .map((f) => f.id)
                .filter((id) => id !== selectedCollectionId);
              void onMovePassagesToCollection?.(ids, collectionId, keepFolderIds);
            }
          }
          setPendingFolderDrop(null);
        }}
        onCancel={() => setPendingFolderDrop(null)}
      />
    </div>
  );
}
