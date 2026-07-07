// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  CopyMinus,
  FileText,
  Plus,
  Folder,
  FolderX,
  Layers3,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import type {
  PassageSortOrder,
  PassageGridCols,
} from "./passage-list-client/filters-toolbar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmNative } from "@/lib/browser-confirm";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { PassageFileRow } from "@/components/workbench/passage-file-row";
import { PassageFileCard } from "@/components/workbench/passage-file-card";
import { DragSelect } from "@/components/ui/drag-select";
import {
  createPassageCollection,
  updatePassageCollection,
  deletePassageCollection,
  addPassagesToCollection,
  removePassagesFromCollection,
  findWorkbenchPassageDuplicates,
  bulkDeleteWorkbenchPassages,
  setPassageReviewed,
  bulkSetPassageReviewed,
  getWorkbenchPassages,
  getWorkbenchPassageIds,
} from "@/actions/workbench";

// Shared modules
import type { CollectionItem } from "./shared/types";
import { Pagination } from "./shared/pagination";
import { FolderSection } from "./shared/folder-section";
import { MoveOrCopyFolderPicker } from "./shared/move-or-copy-folder-picker";

// Hooks
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "./hooks/use-selection";
import { useUrlFilters } from "./hooks/use-url-filters";

// Local sub-components
import { PassageAnalysisModalWrapper } from "./passage-list-client/analysis-modal-wrapper";
import { DeepLinkBadges } from "./passage-list-client/deep-link-badges";
import { PassageFiltersToolbar } from "./passage-list-client/filters-toolbar";

// ─── Types ───────────────────────────────────────────────
interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: {
    id: string;
    updatedAt: Date;
    analysisData?: string | null;
  } | null;
  // 카드에 표시되는 "학습지 생성/수정 시각"용 최신 PRIME 보고서(서버가 take:1).
  reports?: {
    createdAt: Date | string;
    updatedAt: Date | string;
    lastEditedAt?: Date | string | null;
  }[];
  reviewedAt?: Date | string | null;
  _count: { questions: number; notes: number };
}

interface DupGroupPassage {
  id: string;
  title: string;
  contentPreview: string;
  wordCount: number;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date | string;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date | string } | null;
  _count: { questions: number; notes: number };
}

interface DupSummary {
  groups: Array<{ key: string; items: DupGroupPassage[] }>;
  groupCount: number;
  totalDuplicateCount: number;
  totalScanned: number;
}

interface PassageListProps {
  academyId: string;
  passagesData: {
    passages: PassageItem[];
    total: number;
    page: number;
    totalPages: number;
  };
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  filters: {
    page: number;
    schoolId?: string;
    grade?: number;
    semester?: string;
    publisher?: string;
    search?: string;
    sourceMaterialId?: string;
    collectionId?: string;
    /** 학습지 관리(영어) 페이지가 싣는 "생성 완료 학습지만" 게이트. */
    hasReport?: boolean;
    /** 서버 페치와 동일한 과목 스코프 — 국어 라우트 페이지가 "KOREAN" 을 싣는다. */
    subject?: "KOREAN";
  };
  collections: CollectionItem[];
  /** passageIds belonging to each collection, keyed by collectionId */
  collectionMembership: Record<string, Set<string>>;
  /** when entering from 시험지 인식 완료 화면, show a pinned source material badge */
  sourceMaterialBadge?: { id: string; label: string } | null;
  /** when entering from a collection deep-link, show the collection badge */
  collectionBadge?: { id: string; label: string } | null;
  /**
   * Route that URL-driven filters/pagination navigate to. Defaults to the
   * standalone 지문 관리 page. The 학습지 생성 page embeds this client below its
   * form and passes its own route so filtering stays on that page.
   * subjectScope="KOREAN" 이면 기본값이 국어 라우트(/director/korean/passages)로
   * 바뀐다 — 필터/페이지 이동이 영어 화면으로 튕기지 않는다.
   */
  basePath?: string;
  /**
   * 과목 스코프 — "KOREAN" 이면 국어 지문 관리(/director/korean/passages):
   * 전체선택 population 을 subject='KOREAN' 으로 좁히고(hasReport 게이트 없음),
   * URL 내비게이션도 국어 라우트에 머문다. 미전달 = 영어 기본(기존 UX 동일).
   */
  subjectScope?: "KOREAN";
  /**
   * When embedded below another page (e.g. 학습지 생성), the client must not own
   * a viewport-height scroll container. Instead it flows inside the page and its
   * folder header / toolbar stick to the window scroll so they stay pinned to
   * the top while the list scrolls.
   */
  embedded?: boolean;
  /**
   * 목록 상단(list 모드)에 끼워 넣을 로딩 큐 노드. 학습지 생성 페이지에서 진행 중인
   * 생성 작업을 이 목록 위에 로딩 카드로 보여줄 때 사용한다. 기본 미사용(무회귀).
   */
  loadingCards?: React.ReactNode;
  /** loadingCards 에 표시 중인 진행 항목 수. 0 보다 크면 빈 목록이어도 섹션을 띄운다. */
  loadingCount?: number;
}

// ─── Server action adapters ──────────────────────────────
// createCollection 은 컴포넌트 안에서 subjectScope 를 실어 감싼다(국어 라우트
// 폴더 생성 → subject='KOREAN' 저장). 나머지는 스코프 무관이라 그대로 공유.
const baseFolderActions = {
  updateCollection: updatePassageCollection,
  deleteCollection: deletePassageCollection,
  addToCollection: addPassagesToCollection,
  removeFromCollection: removePassagesFromCollection,
};

function useMeasuredHeight(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setHeight(Math.ceil(el.getBoundingClientRect().height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return [ref, height] as const;
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  title,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
  title: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

// ─── Main Component ──────────────────────────────────────
export function PassageListClient({
  academyId,
  passagesData,
  schools,
  filters,
  collections: initialCollections,
  collectionMembership: initialMembership,
  sourceMaterialBadge = null,
  collectionBadge = null,
  subjectScope,
  basePath = subjectScope === "KOREAN"
    ? "/director/korean/passages"
    : "/director/workbench/passages",
  embedded = false,
  loadingCards = null,
  loadingCount = 0,
}: PassageListProps) {
  const router = useRouter();
  // 과목별 카피 — 영어 기본 목록은 "학습지"(PRIME 보고서 게이트), 국어 목록은
  // 학습지 게이트 없이 지문 전체를 보여주므로 "지문"으로 부른다. 조사(을/를·이/가)가
  // 달라지는 문장은 통짜 삼항으로 분기해 영어 경로 문자열을 byte 단위로 보존한다.
  const koScope = subjectScope === "KOREAN";
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [gridCols, setGridCols] = usePersistedState<PassageGridCols>(
    "smoat:view-mode:passage-list",
    "grid3",
    (v): v is PassageGridCols =>
      v === "grid3" || v === "grid2" || v === "list",
  );
  const [sortOrder, setSortOrder] = useState<PassageSortOrder>("newest");
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [modalPassageId, setModalPassageId] = useState<string | null>(null);
  // 지문 카드 "상세 보기/수정" — 영어(기본)는 PRIME 분석 모달을 연다(기존 UX
  // 그대로). 국어는 그 모달이 전부 영어 전용 파이프라인(PRIME 학습지·AI 분석·
  // 실전 학습지 생성)이므로 국어 지문 상세 페이지로 라우팅한다.
  const openPassageDetail = useCallback(
    (id: string) => {
      if (subjectScope === "KOREAN") {
        router.push(`/director/korean/passages/${id}`);
        return;
      }
      setModalPassageId(id);
    },
    [router, subjectScope],
  );
  // 학습지 검수완료 토글 — 낙관적 상태. override 맵은 서버 reviewedAt 을 덮어쓰고,
  // busy 셋은 처리 중인 카드에 스피너를 띄운다.
  const [reviewOverrides, setReviewOverrides] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  const [reviewBusyIds, setReviewBusyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const handleToggleReview = useCallback(
    async (passageId: string, next: boolean) => {
      setReviewOverrides((prev) => {
        const m = new Map(prev);
        m.set(passageId, next);
        return m;
      });
      setReviewBusyIds((prev) => new Set(prev).add(passageId));
      try {
        const res = await setPassageReviewed(passageId, next);
        if (!res.success) {
          // 실패 → 낙관적 상태 롤백
          setReviewOverrides((prev) => {
            const m = new Map(prev);
            m.set(passageId, !next);
            return m;
          });
        }
      } catch {
        setReviewOverrides((prev) => {
          const m = new Map(prev);
          m.set(passageId, !next);
          return m;
        });
      } finally {
        setReviewBusyIds((prev) => {
          const s = new Set(prev);
          s.delete(passageId);
          return s;
        });
      }
    },
    [],
  );
  const [dupSummary, setDupSummary] = useState<DupSummary | null>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<"list" | "duplicates">("list");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkReviewing, setBulkReviewing] = useState(false);
  // "전체 페이지 선택" 진행 중 플래그 — 루트 목록은 20개 페이지네이션이라
  // selectAll()은 현재 페이지만 잡는다. 페이지 밖 지문까지 한 번에 선택하려면
  // 서버에서 현재 필터의 전체 id를 받아 selection 에 채운다.
  const [selectingAllPages, setSelectingAllPages] = useState(false);
  // Optimistic local removal — router.refresh() updates server-side props
  // eventually, but we hide deleted rows immediately so the user doesn't have
  // to wait (and so the duplicates view, which has its own client-side cache,
  // doesn't keep showing already-deleted items).
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  // 카드별 단건 삭제 진행 중 id (휴지통 버튼 스피너용).
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // ─── 폴더 진입 시 그 폴더의 학습지 전체를 서버에서 직접 조회 ───
  // 목록은 hasReport + 20개 페이지네이션이라, 폴더를 클라이언트에서만 필터링하면
  // 다른 페이지에 있는 폴더 멤버가 안 보여 "N개인데 폴더가 빔"이 된다. 폴더가
  // 활성화되면 collectionId로 스코프해 페이지 제한 없이 받아 그리드 소스로 쓴다.
  // (embedded = 학습지 생성 페이지 하단 블록은 기존 클라이언트 필터 유지)
  const [folderView, setFolderView] = useState<{
    collectionId: string;
    loading: boolean;
    passages: PassageItem[];
  } | null>(null);

  const loadDuplicates = useCallback(async () => {
    setDupLoading(true);
    setDupError(null);
    try {
      const result = await findWorkbenchPassageDuplicates(academyId, {
        analyzedOnly: true,
      });
      setDupSummary(result as DupSummary);
    } catch (err) {
      setDupError(
        err instanceof Error
          ? err.message
          : "중복 자료를 조회하지 못했습니다.",
      );
    } finally {
      setDupLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  // Hide optimistically-removed items from the cached duplicates summary so
  // the "중복 모아보기" view updates instantly after a delete. Groups that
  // shrink below 2 members are no longer duplicates and drop off too.
  const visibleDupSummary = useMemo<DupSummary | null>(() => {
    if (!dupSummary) return null;
    if (removedIds.size === 0) return dupSummary;
    const groups = dupSummary.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => !removedIds.has(it.id)),
      }))
      .filter((g) => g.items.length >= 2);
    const totalDuplicateCount = groups.reduce(
      (sum, g) => sum + (g.items.length - 1),
      0,
    );
    return {
      ...dupSummary,
      groups,
      groupCount: groups.length,
      totalDuplicateCount,
    };
  }, [dupSummary, removedIds]);

  const dupCountById = useMemo(() => {
    const map = new Map<string, number>();
    if (!visibleDupSummary) return map;
    for (const group of visibleDupSummary.groups) {
      const siblings = group.items.length - 1;
      for (const item of group.items) map.set(item.id, siblings);
    }
    return map;
  }, [visibleDupSummary]);

  // ─── Shared hooks ───
  const { updateFilter, goToPage } = useUrlFilters(basePath);

  // 폴더 생성만 과목 스코프를 실어 감싼다 — 국어 라우트에서 만든 폴더는
  // subject='KOREAN' 으로 저장돼 영어 폴더 목록에 절대 나타나지 않는다.
  // (영어 기본 경로는 subject 미전달 = 기존 INSERT 그대로, 무회귀.)
  const folderActions = useMemo(
    () => ({
      ...baseFolderActions,
      createCollection: (data: {
        name: string;
        description?: string;
        color?: string;
        parentId?: string;
      }) =>
        createPassageCollection(
          subjectScope === "KOREAN"
            ? { ...data, subject: "KOREAN" as const }
            : data,
        ),
    }),
    [subjectScope],
  );

  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    itemLabel: koScope ? "지문" : "학습지",
    // 폴더 배지를 하위 폴더까지 합산한 누적 수치로 표시(중복 제거).
    cumulativeCounts: true,
  });
  const { filterByActiveFolder } = folder;
  const folderActiveId = folder.activeFolder;

  // Fetch the active folder's full 학습지 set (server-scoped, unpaginated) so
  // the grid shows every member regardless of which list page they'd fall on.
  useEffect(() => {
    if (embedded || !folderActiveId) {
      setFolderView(null);
      return;
    }
    let cancelled = false;
    setFolderView({
      collectionId: folderActiveId,
      loading: true,
      passages: [],
    });
    getWorkbenchPassages(academyId, {
      collectionId: folderActiveId,
      // 폴더 안에서는 "담긴 멤버 전체"를 보여준다. 학습지(PRIME 보고서)가 아직
      // 없는 지문(업로드 직후 분석 대기 등)도 폴더에 담겼으면 그대로 노출해
      // "30개 넣었는데 27개만 보임"을 막는다. (루트 목록은 hasReport 유지)
      page: 1,
      limit: 1000,
      // 국어 라우트에서는 폴더 내용도 국어 지문 스코프로 조회한다 — 기본(영어)
      // 스코프는 subject='KOREAN' 지문을 제외하므로 이 한 줄이 없으면 국어
      // 폴더가 항상 비어 보인다. 영어 경로는 미전달(기존 동작 그대로).
      ...(subjectScope === "KOREAN" ? { subject: "KOREAN" as const } : {}),
    })
      .then((res) => {
        if (cancelled) return;
        setFolderView({
          collectionId: folderActiveId,
          loading: false,
          passages: res.passages,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFolderView({
          collectionId: folderActiveId,
          loading: false,
          passages: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [folderActiveId, embedded, academyId, subjectScope]);

  // Non-first members of each duplicate group, used when 중복 숨기기 is on.
  const duplicateMembersToHide = useMemo<Set<string>>(() => {
    const hidden = new Set<string>();
    if (!visibleDupSummary) return hidden;
    for (const group of visibleDupSummary.groups) {
      const sorted = [...group.items].sort(
        (a, b) =>
          new Date(b.createdAt as any).getTime() -
          new Date(a.createdAt as any).getTime(),
      );
      for (let i = 1; i < sorted.length; i += 1) hidden.add(sorted[i].id);
    }
    return hidden;
  }, [visibleDupSummary]);

  // Filter passages by active folder, hide optimistically-removed rows, then
  // sort. When 중복 숨기기 is on we also drop non-first members of each
  // duplicate group so the user sees one representative per group.
  const displayedPassages = useMemo(() => {
    // Inside a folder (standalone page) use the server-fetched folder set so
    // members on other list pages still appear; filterByActiveFolder still runs
    // as an optimistic membership mask (instant drag-in/out without refetch).
    const sourceList =
      !embedded && folderActiveId
        ? folderView?.collectionId === folderActiveId
          ? folderView.passages
          : []
        : passagesData.passages;
    const base = filterByActiveFolder(sourceList).filter(
      (p) =>
        !removedIds.has(p.id) &&
        !(hideDuplicates && duplicateMembersToHide.has(p.id)),
    );
    // 카드에 찍히는 "학습지 생성/수정 시각"과 동일한 기준으로 정렬한다.
    // (passage-file-card 의 cardTimestamp 규칙: 최신 PRIME 보고서의
    //  lastEditedAt > updatedAt > createdAt, 없으면 지문 생성 시각)
    // 정렬 키와 표시 날짜가 어긋나면 최신순/오래된순이 뒤죽박죽으로 보인다.
    const effectiveTime = (p: PassageItem): number => {
      const report = p.reports?.[0];
      const raw =
        report?.lastEditedAt ??
        report?.updatedAt ??
        report?.createdAt ??
        p.createdAt;
      return new Date(raw).getTime();
    };
    const sorted = [...base];
    sorted.sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          return effectiveTime(b) - effectiveTime(a);
        case "oldest":
          return effectiveTime(a) - effectiveTime(b);
        case "name_asc":
          return (a.title || "").localeCompare(b.title || "", "ko");
        case "name_desc":
          return (b.title || "").localeCompare(a.title || "", "ko");
        default:
          return 0;
      }
    });
    return sorted;
  }, [
    filterByActiveFolder,
    passagesData.passages,
    embedded,
    folderActiveId,
    folderView,
    removedIds,
    hideDuplicates,
    duplicateMembersToHide,
    sortOrder,
  ]);

  const passageIds = useMemo(
    () => displayedPassages.map((p) => p.id),
    [displayedPassages],
  );

  const selection = useSelection(passageIds);

  // 루트 목록(폴더 밖)에서 현재 필터에 해당하는 모든 페이지의 지문을 한 번에
  // 선택한다. 폴더 안에서는 folderView가 이미 전체 멤버(≤1000)를 로드하므로
  // 기존 selection.selectAll()로 충분해 이 동선이 필요 없다.
  const handleSelectAllPages = useCallback(async () => {
    if (selectingAllPages) return;
    setSelectingAllPages(true);
    try {
      const result = await getWorkbenchPassageIds(academyId, {
        ...filters,
        page: undefined,
        limit: undefined,
        // 루트 목록 모집단과 동일하게 맞춘다 — 영어(기본): 생성 완료된
        // 학습지(PRIME 보고서)만 / 국어: subject='KOREAN' 전체(학습지 게이트 없음,
        // 국어 라우트 서버 페치와 동일 기준).
        ...(subjectScope === "KOREAN"
          ? { subject: "KOREAN" as const, hasReport: undefined }
          : { hasReport: true }),
      });
      if (!result.success) {
        toast.error(result.error || "전체 선택에 실패했습니다.");
        return;
      }
      const ids = result.ids.filter(
        (id) =>
          !removedIds.has(id) &&
          !(hideDuplicates && duplicateMembersToHide.has(id)),
      );
      if (ids.length === 0) {
        toast.error(
          koScope ? "선택할 지문이 없습니다." : "선택할 학습지가 없습니다.",
        );
        return;
      }
      selection.setSelectedIds(new Set(ids));
      toast.success(`${ids.length}편을 전체 페이지에서 선택했습니다.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "전체 선택에 실패했습니다.",
      );
    } finally {
      setSelectingAllPages(false);
    }
  }, [
    academyId,
    filters,
    removedIds,
    hideDuplicates,
    duplicateMembersToHide,
    selectingAllPages,
    selection,
    subjectScope,
    koScope,
  ]);

  // Stats
  const totalCount = passagesData.total;

  // 헤더 체크박스 = "전체 선택"(현재 페이지가 아니라 현재 스코프 전체).
  // - 폴더 안: 멤버 전체가 이미 페이지 제한 없이 로드돼 있으므로 selectAll(=표시분 전체).
  // - 루트(전체): 페이지네이션이라 다음 페이지까지 포함해 getWorkbenchPassageIds 로 전부 선택.
  // 이미 전체가 선택돼 있으면 해제. → 하위 폴더/루트 어디서든 전체 선택→폴더 이동 일관 동작.
  const isAllSelectedAcrossScope =
    selection.selectedIds.size > 0 &&
    (folder.activeFolder
      ? selection.isAllSelected
      : totalCount > 0 && selection.selectedIds.size >= totalCount);
  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelectedAcrossScope) {
      selection.clearSelection();
      return;
    }
    if (!folder.activeFolder && totalCount > displayedPassages.length) {
      void handleSelectAllPages();
    } else {
      selection.selectAll();
    }
  }, [
    isAllSelectedAcrossScope,
    folder.activeFolder,
    totalCount,
    displayedPassages.length,
    handleSelectAllPages,
    selection,
  ]);

  // ─── Folder action wrappers (pass selectedIds from selection hook) ───
  const onAddToFolder = useCallback(
    async (collectionId: string) => {
      const success = await folder.handleAddToFolder(
        collectionId,
        selection.selectedIds,
      );
      if (success) {
        selection.clearSelection();
      }
    },
    [folder, selection],
  );

  const onMoveToFolder = useCallback(
    async (collectionId: string) => {
      if (selection.selectedIds.size === 0) return;
      const anyId = selection.selectedIds.values().next().value as
        | string
        | undefined;
      if (!anyId) return;
      const success = await folder.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selection.selectedIds,
      );
      if (success) selection.clearSelection();
    },
    [folder, selection],
  );

  const onRemoveFromFolder = useCallback(async () => {
    const success = await folder.handleRemoveFromFolder(selection.selectedIds);
    if (success) selection.clearSelection();
  }, [folder, selection]);

  const onDragToFolder = useCallback(
    (
      itemId: string,
      folderId: string,
      copy: boolean,
      keepFolderIds: string[] = [],
    ) => {
      folder
        .handleDragToFolder(
          itemId,
          folderId,
          copy,
          selection.selectedIds,
          keepFolderIds,
        )
        .then((success) => {
          if (success) selection.clearSelection();
        });
    },
    [folder, selection],
  );

  // Folders the dragged item (or whole selection, if the item is selected)
  // currently belongs to — powers the "keep in this folder" toggles when moving.
  const getItemFolders = useCallback(
    (itemId: string) => {
      const ids = selection.selectedIds.has(itemId)
        ? selection.selectedIds
        : new Set([itemId]);
      return folder.collections
        .filter((c) =>
          [...ids].some((id) => folder.membership[c.id]?.has(id)),
        )
        .map((c) => ({ id: c.id, name: c.name }));
    },
    [folder.collections, folder.membership, selection.selectedIds],
  );

  const onDragToRoot = useCallback(
    (itemId: string, copy: boolean) => {
      if (copy || !folder.activeFolder) return;
      const ids = selection.selectedIds.has(itemId)
        ? selection.selectedIds
        : new Set([itemId]);
      folder.handleRemoveFromFolder(ids).then((success) => {
        if (success) selection.clearSelection();
      });
    },
    [folder, selection],
  );

  const onFolderClick = useCallback(
    (folderId: string) => {
      folder.setActiveFolder(folderId);
      selection.clearSelection();
    },
    [folder, selection],
  );

  const handleSearch = useCallback(
    (value: string) => updateFilter("search", value),
    [updateFilter],
  );

  const togglePageMode = useCallback(() => {
    setPageMode((mode) => (mode === "duplicates" ? "list" : "duplicates"));
  }, []);

  const toggleHideDuplicates = useCallback(() => {
    setHideDuplicates((v) => !v);
  }, []);

  // ─── Combined filters + view toggle bar (rendered in stickyFooter) ───
  const filtersToolbar = (
    <PassageFiltersToolbar
      filters={filters}
      schools={schools}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={(value) => handleSearch(value ?? searchValue)}
      updateFilter={updateFilter}
      sortOrder={sortOrder}
      onSortOrderChange={setSortOrder}
      pageMode={pageMode}
      onTogglePageMode={togglePageMode}
      hideDuplicates={hideDuplicates}
      onToggleHideDuplicates={toggleHideDuplicates}
      duplicateGroupCount={visibleDupSummary?.groupCount ?? 0}
      totalDuplicateCount={visibleDupSummary?.totalDuplicateCount ?? 0}
      duplicatesLoading={dupLoading}
      gridCols={gridCols}
      setGridCols={setGridCols}
    />
  );

  // ─── "Add to folder" extra action for SelectionToolbar ───
  const addToFolderAction = (
    <MoveOrCopyFolderPicker
      collections={folder.collections}
      activeFolder={folder.activeFolder}
      selectedCount={selection.selectedIds.size}
      onCopy={onAddToFolder}
      onMove={onMoveToFolder}
      compact
    />
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteWorkbenchPassages(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === result.requested) {
        toast.success(
          koScope
            ? `${result.deleted}편의 지문을 삭제했습니다.`
            : `${result.deleted}편의 학습지를 삭제했습니다.`,
        );
      } else if (result.deleted === 0) {
        toast.error(
          koScope ? "삭제된 지문이 없습니다." : "삭제된 학습지가 없습니다.",
        );
      } else {
        toast.warning(
          `${result.deleted}편 삭제됨, ${result.requested - result.deleted}편 누락`,
        );
      }
      // Mark as removed immediately so the grid and duplicates view update
      // without waiting for router.refresh() to round-trip.
      setRemovedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      selection.clearSelection();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }, [selection, bulkDeleting, router, koScope]);

  // 카드 우상단 휴지통 — 단건 삭제(확인 후). 일괄 삭제와 동일한 서버 액션을
  // [id] 하나로 호출하고, 낙관적으로 카드를 즉시 감춘다.
  const handleDeleteOne = useCallback(
    async (id: string) => {
      if (deletingIds.has(id)) return;
      if (
        !window.confirm(
          koScope
            ? "이 지문을 삭제할까요? 되돌릴 수 없습니다."
            : "이 학습지를 삭제할까요? 되돌릴 수 없습니다.",
        )
      )
        return;
      setDeletingIds((prev) => new Set(prev).add(id));
      try {
        const result = await bulkDeleteWorkbenchPassages([id]);
        if (!result.success || result.deleted === 0) {
          toast.error(result.error || "삭제에 실패했습니다.");
          return;
        }
        toast.success(koScope ? "지문을 삭제했습니다." : "학습지를 삭제했습니다.");
        setRemovedIds((prev) => new Set(prev).add(id));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [deletingIds, router, koScope],
  );

  // 선택한 학습지 일괄 검수완료 — 미검수가 하나라도 있으면 검수완료로, 모두
  // 검수완료 상태면 검수취소로 토글한다. 낙관적 상태(reviewOverrides)도 갱신.
  const handleBulkReview = useCallback(async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0 || bulkReviewing) return;
    const allReviewed = ids.every(
      (id) =>
        reviewOverrides.get(id) ??
        !!passagesData.passages.find((p) => p.id === id)?.reviewedAt,
    );
    const next = !allReviewed;
    setBulkReviewing(true);
    setReviewOverrides((prev) => {
      const m = new Map(prev);
      for (const id of ids) m.set(id, next);
      return m;
    });
    try {
      const result = await bulkSetPassageReviewed(ids, next);
      if (!result.success) {
        toast.error(result.error || "검수 상태 변경에 실패했습니다.");
        setReviewOverrides((prev) => {
          const m = new Map(prev);
          for (const id of ids) m.set(id, !next);
          return m;
        });
        return;
      }
      toast.success(
        next
          ? `${result.count}편을 검수완료 처리했습니다.`
          : `${result.count}편의 검수를 취소했습니다.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "검수 상태 변경에 실패했습니다.");
      setReviewOverrides((prev) => {
        const m = new Map(prev);
        for (const id of ids) m.set(id, !next);
        return m;
      });
    } finally {
      setBulkReviewing(false);
    }
  }, [
    selection.selectedIds,
    bulkReviewing,
    reviewOverrides,
    passagesData.passages,
  ]);

  const bulkReviewAction = (
    <button
      type="button"
      onClick={handleBulkReview}
      disabled={selection.selectedIds.size === 0 || bulkReviewing}
      title="검수완료"
      aria-label="검수완료"
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-emerald-300 bg-white text-emerald-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {bulkReviewing ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="w-3.5 h-3.5" />
      )}
    </button>
  );

  const bulkDeleteAction = (
    <button
      type="button"
      onClick={() => {
        if (selection.selectedIds.size === 0 || bulkDeleting) return;
        const ok = confirmNative(
          koScope
            ? `선택한 지문 ${selection.selectedIds.size}편을 삭제하시겠습니까?`
            : `선택한 학습지 ${selection.selectedIds.size}편을 삭제하시겠습니까?`,
          koScope
            ? "이 작업은 되돌릴 수 없습니다. 지문에 연결된 분석/문제 데이터도 함께 삭제될 수 있습니다."
            : "이 작업은 되돌릴 수 없습니다. 학습지에 연결된 분석/문제 데이터도 함께 삭제될 수 있습니다.",
        );
        if (ok) void handleBulkDelete();
      }}
      disabled={selection.selectedIds.size === 0 || bulkDeleting}
      title="삭제"
      aria-label="삭제"
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {bulkDeleting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
    </button>
  );

  const selectionActions = (
    <>
      {addToFolderAction}
      {bulkReviewAction}
      {bulkDeleteAction}
    </>
  );

  const modalPassage = modalPassageId
    ? passagesData.passages.find((x) => x.id === modalPassageId)
    : null;

  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(true);
  const passageListBoundaryRef = useRef<HTMLDivElement | null>(null);
  // 모바일 페이지 넘김 시 목록 상단(스티키 헤더 포함)으로 부드럽게 스크롤.
  const listSectionRef = useRef<HTMLElement>(null);

  const toolbarRow = (
    <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-2">
          <SelectAllCheckbox
            checked={isAllSelectedAcrossScope}
            indeterminate={
              selection.selectedIds.size > 0 && !isAllSelectedAcrossScope
            }
            disabled={displayedPassages.length === 0 || selectingAllPages}
            onChange={handleToggleSelectAll}
            title={
              isAllSelectedAcrossScope
                ? `전체 ${selection.selectedIds.size}편 선택됨 — 클릭 시 해제`
                : `전체 ${totalCount}편 선택`
            }
            ariaLabel={
              isAllSelectedAcrossScope ? "전체 해제" : "전체 페이지 선택"
            }
          />
          {!embedded &&
          !folder.activeFolder &&
          pageMode === "list" &&
          passagesData.total > displayedPassages.length ? (
            <button
              type="button"
              onClick={() => void handleSelectAllPages()}
              disabled={selectingAllPages}
              // 모바일에선 숨김 — 헤더 체크박스가 이미 '스코프 전체 선택'을 하므로 중복.
              // (데스크톱은 lg: 로 기존 그대로 노출, PC 무변경)
              className="hidden whitespace-nowrap text-xs font-medium text-blue-600 underline-offset-2 hover:underline disabled:opacity-50 lg:inline-block"
              title={
                koScope
                  ? "현재 필터의 모든 페이지에 있는 지문을 선택"
                  : "현재 필터의 모든 페이지에 있는 학습지를 선택"
              }
            >
              {selectingAllPages
                ? "선택 중…"
                : `전체 ${passagesData.total}편 선택`}
            </button>
          ) : null}
          <div
            className={
              "flex items-center gap-3 " +
              (selection.selectedIds.size > 0
                ? ""
                : "pointer-events-none opacity-50")
            }
            aria-disabled={selection.selectedIds.size === 0}
          >
            {selectionActions}
            {folder.activeFolder ? (
              <button
                type="button"
                onClick={onRemoveFromFolder}
                title="폴더에서 삭제"
                aria-label="폴더에서 삭제"
                className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
              >
                <FolderX className="h-3.5 w-3.5" />
                폴더에서 삭제
              </button>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {filtersToolbar}
        </div>
      </div>
  );

  return (
    <div className={embedded ? "flex flex-col" : "flex flex-col h-[calc(100vh-64px)]"}>
      {/* ─── Deep-link filter badges (sourceMaterial / collection) ─── */}
      <DeepLinkBadges
        sourceMaterialBadge={sourceMaterialBadge}
        collectionBadge={collectionBadge}
        updateFilter={updateFilter}
      />

      {/* ─── Content ─── */}
      <div
        className={
          embedded
            ? "pb-4"
            : "-mx-6 flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pb-4 sm:px-8"
        }
      >
        {passagesData.passages.length === 0 && loadingCount === 0 ? (
          koScope ? (
            // 국어 빈 상태 — 국어 지문은 문제 생성 화면에서 붙여넣어 등록한다.
            // 영어 학습지 등록 경로(/passages/create)로 절대 보내지 않는다.
            <div className="mt-2 bg-white rounded-xl border text-center py-20">
              <Folder className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">등록된 국어 지문이 없습니다</p>
              <p className="text-sm text-slate-400 mt-1">
                국어 문제 생성에서 지문을 붙여넣으면 여기에 쌓입니다
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Link href="/director/korean/generate">
                  <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    국어 지문 등록
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
          <div className="mt-2 bg-white rounded-xl border text-center py-20">
            <Folder className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">등록된 학습지가 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">
              학습지를 등록하여 AI 문제 생성을 시작하세요
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Link href="/director/workbench/passages/create">
                <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  학습지 등록
                </Button>
              </Link>
            </div>
          </div>
          )
        ) : (
          <section
            ref={listSectionRef}
            className="mt-2 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div
              ref={folderStickyRef}
              className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
            >
              <FolderSection
                embedded
                childFolders={folder.childFolders}
                activeFolder={folder.activeFolder}
                dragItemType="passage"
                dragItemIdKey="passageId"
                itemCountLabel={koScope ? "지문" : "학습지"}
                showNewFolder={folder.showNewFolder}
                newFolderName={folder.newFolderName}
                onNewFolderNameChange={folder.setNewFolderName}
                onShowNewFolder={folder.setShowNewFolder}
                onCreateFolder={folder.handleCreateFolder}
                onNavigateToFolder={onFolderClick}
                onRenameFolder={folder.handleRenameFolder}
                onDeleteFolder={folder.handleDeleteFolder}
                onDragToFolder={onDragToFolder}
                onDragToRoot={onDragToRoot}
                getItemFolders={getItemFolders}
                breadcrumbPath={folder.breadcrumbPath}
                onNavigateToRoot={() => {
                  folder.setActiveFolder(null);
                  selection.clearSelection();
                }}
                // 폴더 안에서도 루트와 동일한 작은 칩(FolderChip)으로 통일 —
                // 큰 카드(useCardInsideFolder)는 루트 칩과 크기·글자 크기가 달라
                // 이질감이 있었다.
                useCardInsideFolder={false}
                rootLabel={koScope ? "전체 지문" : "전체 학습지"}
                enableFolderControls
                allFolders={folder.collections}
                storageKey={koScope ? "korean-passages" : "passages"}
                treatRootAsFolder
                pageHeader={{
                  icon: <FileText className="h-3.5 w-3.5" />,
                  parentLabel: koScope ? "국어 지문 관리" : "학습지 관리",
                  title: koScope ? "전체 지문" : "전체 학습지",
                  totalCount,
                  itemLabel: koScope ? "지문" : "학습지",
                  itemUnit: "편",
                }}
              />
            </div>

            <div
              style={{ top: folderStickyHeight > 0 ? folderStickyHeight - 1 : 0 }}
              className="sticky z-20 shrink-0 border-y border-slate-200 bg-slate-50 px-4 py-2 shadow-[0_6px_8px_-4px_rgba(15,23,42,0.08)]"
            >
              {toolbarRow}
            </div>

            <div
              ref={passageListBoundaryRef}
              className="min-w-0 px-4 pb-3 pt-3 sm:px-5"
            >
            {/* 학습지 생성 진행 중 로딩 큐 (list 모드에서만, 생성 페이지가 주입) */}
            {pageMode === "list" && loadingCards}
            {pageMode === "duplicates" ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
                    <Layers3 className="h-3.5 w-3.5 text-slate-400" />
                    중복 그룹 모아보기
                    {visibleDupSummary ? (
                      <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                        그룹 {visibleDupSummary.groupCount}개 · 중복{" "}
                        {koScope ? "지문" : "학습지"}{" "}
                        {visibleDupSummary.totalDuplicateCount}편
                      </span>
                    ) : null}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPageMode("list")}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                    목록으로
                  </button>
                </div>

                {dupLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[13px]">중복 자료 분석 중...</span>
                  </div>
                ) : dupError ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <p className="text-[12px] text-red-600">{dupError}</p>
                    <button
                      type="button"
                      onClick={() => void loadDuplicates()}
                      className="mt-1 h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : !visibleDupSummary ||
                  visibleDupSummary.groups.length === 0 ? (
                  <div className="rounded-xl border bg-white py-16 text-center">
                    <CopyMinus className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                    <p className="font-medium text-slate-500">
                      중복 자료가 없습니다
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      총 {visibleDupSummary?.totalScanned ?? 0}편의{" "}
                      {koScope ? "지문을" : "학습지를"} 검사했습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visibleDupSummary.groups.map((group, groupIndex) => (
                      <section
                        key={group.key}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/40 px-4 py-2.5">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                            <Copy className="h-3 w-3" />
                          </span>
                          <h4 className="text-[12.5px] font-bold text-slate-800">
                            그룹 {groupIndex + 1}
                          </h4>
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700">
                            {group.items.length}편 동일
                          </span>
                          <span className="ml-auto max-w-[400px] truncate font-mono text-[10.5px] text-slate-400">
                            {group.items[0]?.title ?? "(제목 없음)"}
                          </span>
                        </header>
                        <div className="p-3">
                          <DragSelect
                            className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3"
                            value={selection.selectedIds}
                            onChange={selection.setSelectedIds}
                            boundaryRef={passageListBoundaryRef}
                          >
                            {group.items.map((p) => {
                              const adapted = {
                                id: p.id,
                                title: p.title,
                                content: p.contentPreview,
                                grade: p.grade,
                                semester: p.semester,
                                unit: p.unit,
                                publisher: p.publisher,
                                difficulty: p.difficulty,
                                tags: p.tags,
                                createdAt: new Date(p.createdAt as any),
                                school: p.school,
                                analysis: p.analysis
                                  ? {
                                      id: p.analysis.id,
                                      updatedAt: new Date(
                                        p.analysis.updatedAt as any,
                                      ),
                                      analysisData: null,
                                    }
                                  : null,
                                _count: p._count,
                              };
                              return (
                                <PassageFileCard
                                  key={p.id}
                                  passage={adapted}
                                  selected={selection.selectedIds.has(p.id)}
                                  onToggleSelect={selection.toggleSelect}
                                  onViewDetail={openPassageDetail}
                                  dupCount={group.items.length - 1}
                                  onDelete={handleDeleteOne}
                                  deleteBusy={deletingIds.has(p.id)}
                                />
                              );
                            })}
                          </DragSelect>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {displayedPassages.length === 0 ? (
                  // 진행 중 로딩 큐가 위에 떠 있으면(loadingCount>0) 빈 안내는 숨긴다.
                  loadingCount > 0 ? null : !embedded &&
                    folderActiveId &&
                    (folderView?.collectionId !== folderActiveId ||
                      folderView?.loading) ? (
                    // 폴더 내용 서버 조회 중 — "비어 있음"을 잘못 깜빡이지 않도록 로딩 표시.
                    <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-[13px]">폴더 내용을 불러오는 중...</span>
                    </div>
                  ) : (
                  <div className="py-12 text-center">
                    <FileText className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                    <p className="text-[13px] text-slate-400">
                      {folder.activeFolder
                        ? koScope
                          ? "이 폴더에 지문이 없습니다."
                          : "이 폴더에 학습지가 없습니다."
                        : koScope
                          ? "등록된 국어 지문이 없습니다."
                          : "등록된 학습지가 없습니다."}
                    </p>
                    {folder.activeFolder && (
                      <p className="mt-1 text-[12px] text-slate-400">
                        {koScope ? "지문을" : "학습지를"} 드래그하거나 선택 후
                        &quot;폴더에 추가&quot;를 사용하세요.
                      </p>
                    )}
                  </div>
                  )
                ) : gridCols === "list" ? (
                  <DragSelect
                    className="space-y-1.5"
                    value={selection.selectedIds}
                    onChange={selection.setSelectedIds}
                    boundaryRef={passageListBoundaryRef}
                  >
                    {displayedPassages.map((p) => (
                      <PassageFileRow
                        key={p.id}
                        passage={p}
                        selected={selection.selectedIds.has(p.id)}
                        onToggleSelect={selection.toggleSelect}
                        onViewDetail={openPassageDetail}
                      />
                    ))}
                  </DragSelect>
                ) : (
                  <DragSelect
                    className={
                      gridCols === "grid2"
                        ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                        : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    }
                    value={selection.selectedIds}
                    onChange={selection.setSelectedIds}
                    boundaryRef={passageListBoundaryRef}
                  >
                    {displayedPassages.map((p) => (
                      <PassageFileCard
                        key={p.id}
                        passage={p}
                        selected={selection.selectedIds.has(p.id)}
                        onToggleSelect={selection.toggleSelect}
                        onViewDetail={openPassageDetail}
                        onEdit={openPassageDetail}
                        reviewed={reviewOverrides.get(p.id) ?? !!p.reviewedAt}
                        onToggleReview={handleToggleReview}
                        reviewBusy={reviewBusyIds.has(p.id)}
                        dupCount={dupCountById.get(p.id) ?? 0}
                        onDelete={handleDeleteOne}
                        deleteBusy={deletingIds.has(p.id)}
                      />
                    ))}
                  </DragSelect>
                )}
              </div>
            )}
            </div>
          </section>
        )}

        {/* Pagination */}
        {pageMode === "list" && !folder.activeFolder && (
          <Pagination
            page={passagesData.page}
            totalPages={passagesData.totalPages}
            onGoToPage={goToPage}
            scrollTargetRef={listSectionRef}
          />
        )}
      </div>

      {/* ─── Analysis Modal ─── */}
      {modalPassage && (
        <PassageAnalysisModalWrapper
          passage={modalPassage}
          onClose={() => setModalPassageId(null)}
        />
      )}
    </div>
  );
}
