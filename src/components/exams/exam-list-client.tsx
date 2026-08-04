// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  GraduationCap,
  Grid2x2,
  Grid3x3,
  List,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  addExamsToCollection,
  bulkDeleteExams,
  createExamCollection,
  deleteExam,
  deleteExamCollection,
  removeExamsFromCollection,
  updateExamCollection,
} from "@/actions/exams";
import {
  getExamDeploymentSummaries,
  type ExamDeploymentSummary,
} from "@/actions/exams/deployment-summary";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { confirmNative } from "@/lib/browser-confirm";

// Shared folder modules
import type { CollectionItem } from "@/components/workbench/shared/types";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import { Pagination } from "@/components/workbench/shared/pagination";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";

// Hooks
import { useSelection } from "@/components/workbench/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useMobilePagination } from "@/hooks/use-mobile-pagination";

// Exam card
import { ExamFileCard } from "./exam-file-card";
import { ExamQuickViewDialog } from "./exam-quick-view-dialog";
import { SimilarExamBlueprintModal } from "@/app/(director)/director/workbench/exams/similar/_components/similar-exam-blueprint-modal";

import { ExamListRow } from "./exam-list-client-parts/exam-list-row";
import { DragSelect } from "@/components/ui/drag-select";
import { FiltersToolbar } from "./exam-list-client-parts/filters-toolbar";
import type { ClassOption, ExamItem } from "./exam-list-client-parts/types";

// 과제 배포 컴포저(통합 배포 위저드) — 카드/행 "과제 배포" 액션의 착륙점.
import { AssignmentComposer } from "@/components/study-assignments/assignment-composer";

interface Props {
  exams: ExamItem[];
  classes: ClassOption[];
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
  /**
   * 과목 컨텍스트 — "KOREAN"=국어 시험지 목록(/director/korean/exams)에서
   * 재사용될 때. 편집 진입 URL 에 ?scope=KOREAN 을 부착해 빌더의 좌측 문제
   * 피커/폴더가 국어 스코프로 열리게 한다. 미지정=영어 목록(종전과 동일).
   */
  subjectScope?: "KOREAN";
}

// ---------------------------------------------------------------------------
// Server action adapters
// ---------------------------------------------------------------------------
const folderActions = {
  createCollection: createExamCollection,
  updateCollection: updateExamCollection,
  deleteCollection: deleteExamCollection,
  addToCollection: addExamsToCollection,
  removeFromCollection: removeExamsFromCollection,
};

type ExamViewMode = "grid-3" | "grid-2" | "list";

// 라벨에 "시험" 스코프를 명시 — 바로 위 폴더 섹션 헤더의 폴더 보기 전환
// 버튼("그리드/목록 보기")과 상하로 나란히 노출되므로 대상이 구분되게 한다.
const EXAM_VIEW_OPTIONS = [
  { value: "grid-3", label: "시험 3열 보기", Icon: Grid3x3 },
  { value: "grid-2", label: "시험 2열 보기", Icon: Grid2x2 },
  { value: "list", label: "시험 목록 보기", Icon: List },
] satisfies ReadonlyArray<ViewModeCycleOption<ExamViewMode>>;

// 열 수 → Tailwind 그리드 클래스. 목록은 별도 렌더라 여기서 다루지 않는다.
const EXAM_GRID_COL_CLASS: Record<"grid-3" | "grid-2", string> = {
  "grid-3": "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  "grid-2": "grid-cols-1 sm:grid-cols-2",
};

// ---------------------------------------------------------------------------
// 폴더 영역 기본 높이 시드 — 폴더가 1행뿐일 때의 빈 밴드 제거.
// FolderSection(enableFolderControls, storageKey="exams")은 저장된 값이 없으면
// 156px 고정 높이로 시작해 1행(칩 80px + 상하 패딩 16px = 96px) 아래 ~60px 가
// 빈 밴드로 남는다. 공유 컴포넌트는 자동 수축을 지원하지 않으므로, 저장된
// 높이가 "없을 때만" 1행 콘텐츠 높이를 기본값으로 심는다. 유저가 리사이즈
// 핸들로 조절한 값은 그대로 저장·우선된다(리사이즈 기능 무회귀).
// ---------------------------------------------------------------------------
const FOLDER_LIST_HEIGHT_KEY = "smoat:folder-section:exams:list-height";
const FOLDER_ONE_ROW_HEIGHT = 96;
if (typeof window !== "undefined") {
  try {
    if (window.localStorage.getItem(FOLDER_LIST_HEIGHT_KEY) === null) {
      window.localStorage.setItem(
        FOLDER_LIST_HEIGHT_KEY,
        String(FOLDER_ONE_ROW_HEIGHT),
      );
    }
  } catch {
    /* localStorage 접근 불가(사파리 시크릿 등) — 기본 높이로 동작 */
  }
}

// ---------------------------------------------------------------------------
// Shared chrome helpers (mirrors question-bank-client)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 시험 관리 메인 페이지
// ---------------------------------------------------------------------------
export function ExamListClient({
  exams,
  classes,
  collections: initialCollections,
  collectionMembership: initialMembership,
  subjectScope,
}: Props) {
  const router = useRouter();
  // 편집 진입 URL — 국어 목록은 국어 전용 편집 경로(/director/korean/exams)로 착륙시켜
  // 공유 영어 경로에 착륙하지 않게 한다(유저 확정: 시험지 경로 완전 분리). 영어 불변.
  const examEditHref = (id: string) =>
    subjectScope === "KOREAN"
      ? `/director/korean/exams/${id}/edit`
      : `/director/workbench/exams/${id}/edit`;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [viewType, setViewType] = usePersistedState<ExamViewMode>(
    "smoat:view-mode:exam-list",
    "grid-3",
    (v): v is ExamViewMode =>
      v === "grid-3" || v === "grid-2" || v === "list",
  );
  const [quickViewExamId, setQuickViewExamId] = useState<string | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  // 과제 배포 컴포저 대상 시험지 — null 이면 닫힘(EXAM 프리셋 고정 진입).
  const [assignExam, setAssignExam] = useState<{
    id: string;
    title: string;
    questionCount: number;
  } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // 동형 생성 시험지의 분석 정보(설정의 patternProfile 기반).
  const [analysisExam, setAnalysisExam] = useState(null);
  // Optimistically hide deleted exams until router.refresh() updates props —
  // same pattern as passage-list-client / question-bank-client.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // ─── Folder manager ───
  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    itemLabel: "시험",
    // 폴더 배지를 하위 폴더까지 합산한 누적 수치로 표시(중복 제거).
    cumulativeCounts: true,
  });
  const { filterByActiveFolder } = folder;

  // ─── Client-side filtering ───
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (removedIds.has(exam.id)) return false;
      if (search && !exam.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "ALL" && exam.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && exam.status !== statusFilter) return false;
      if (classFilter !== "ALL" && exam.class?.id !== classFilter) return false;
      return true;
    });
  }, [exams, removedIds, search, typeFilter, statusFilter, classFilter]);

  // ─── Filter by active folder ───
  const displayedExams = useMemo(
    () => filterByActiveFolder(filteredExams),
    [filterByActiveFolder, filteredExams],
  );

  const examIds = useMemo(() => displayedExams.map((e) => e.id), [displayedExams]);
  const selection = useSelection(examIds);

  // ─── 모바일 전용: 폴더(전체 시험 포함)마다 한 페이지 10개 제한 ───
  // 데스크톱은 useMobilePagination 이 전체를 그대로 반환해 변화 없음.
  // 폴더 이동·검색·필터가 바뀌면 resetKey 로 1페이지로 되돌린다.
  const {
    isMobile,
    page: mobilePage,
    setPage: setMobilePage,
    totalPages: mobileTotalPages,
    visibleItems: visibleExams,
    scrollTargetRef: listSectionRef,
  } = useMobilePagination(displayedExams, {
    resetKey: `${folder.activeFolder ?? "root"}|${search}|${typeFilter}|${statusFilter}|${classFilter}`,
  });

  // ─── 배포 현황 미니 배지(ENABLE_EXAM_DEPLOYMENT) ───
  // 목록 렌더를 블로킹하지 않도록 마운트 후 현재 화면에 보이는 카드 id 만 요약을
  // 조회한다. 이미 요청한 id 는 재요청하지 않고(페이지 넘김 누적), 실패하면 배지만
  // 미표시하고 다음 목록 변화 때 재시도한다. 로드 전엔 prop 이 undefined → 배지 없음.
  const [deploymentSummaries, setDeploymentSummaries] = useState<
    Record<string, ExamDeploymentSummary>
  >({});
  const requestedDeploymentIdsRef = useRef<Set<string>>(new Set());
  const visibleExamIdsKey = useMemo(
    () => visibleExams.map((e) => e.id).join(","),
    [visibleExams],
  );
  useEffect(() => {
    if (!FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT) return;
    const ids = visibleExamIdsKey
      .split(",")
      .filter((id) => id && !requestedDeploymentIdsRef.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) requestedDeploymentIdsRef.current.add(id);
    getExamDeploymentSummaries(ids)
      .then((result) => {
        if (!result.success || !result.data) {
          throw new Error(result.error || "배포 현황 조회 실패");
        }
        setDeploymentSummaries((prev) => ({ ...prev, ...result.data }));
      })
      .catch(() => {
        // 배지는 부가 정보 — 토스트 없이 조용히 물러나고 재시도 여지만 남긴다.
        for (const id of ids) requestedDeploymentIdsRef.current.delete(id);
      });
  }, [visibleExamIdsKey]);

  // ─── Folder action wrappers ───
  const onAddToFolder = useCallback(
    async (collectionId: string) => {
      const success = await folder.handleAddToFolder(collectionId, selection.selectedIds);
      if (success) {
        selection.clearSelection();
      }
    },
    [folder, selection],
  );

  const onMoveToFolder = useCallback(
    async (collectionId: string) => {
      if (selection.selectedIds.size === 0) return;
      const anyId = selection.selectedIds.values().next().value as string | undefined;
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
    (itemId: string, folderId: string, copy: boolean) => {
      folder
        .handleDragToFolder(itemId, folderId, copy, selection.selectedIds)
        .then((success) => {
          if (success) selection.clearSelection();
        });
    },
    [folder, selection],
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

  const openQuickView = useCallback((examId: string) => {
    setQuickViewExamId(examId);
    setQuickViewOpen(true);
  }, []);

  // ─── 과제 배포(U5) — 시험지 → AssignmentComposer preset EXAM 진입 ───
  // 국어 목록(subjectScope="KOREAN")은 서버 가드(createStudyAssignment KOREAN
  // 거부)와 대칭으로 버튼을 비활성한다(툴팁 안내). 영어 목록엔 국어 시험지가
  // 서버 필터로 애초에 없다.
  const assignLocked = subjectScope === "KOREAN";
  const openAssignComposer = useCallback(
    (examId: string) => {
      const exam = exams.find((e) => e.id === examId);
      if (!exam) return;
      setAssignExam({
        id: exam.id,
        title: exam.title,
        questionCount: exam._count?.questions ?? 0,
      });
    },
    [exams],
  );

  // ─── Delete handler ───
  async function handleDelete(targetId: string) {
    if (!targetId) return;
    if (
      !confirmNative(
        "시험을 삭제하시겠습니까?",
        "이 작업은 되돌릴 수 없습니다. 시험과 관련된 모든 데이터가 삭제됩니다.",
      )
    ) {
      return;
    }
    const result = await deleteExam(targetId);
    if (result.success) {
      toast.success("시험이 삭제되었습니다.");
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.add(targetId);
        return next;
      });
      router.refresh();
    } else {
      toast.error(result.error || "삭제에 실패했습니다.");
    }
  }

  // ─── Bulk delete handler ───
  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    if (
      !confirmNative(
        `선택한 시험 ${ids.length}부를 삭제하시겠습니까?`,
        "이 작업은 되돌릴 수 없습니다. 초안 상태의 시험만 삭제되며, 배포된 시험은 자동으로 건너뜁니다.",
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteExams(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === result.requested) {
        toast.success(`${result.deleted}부의 시험을 삭제했습니다.`);
      } else if (result.deleted === 0) {
        // Only DRAFT exams are deletable — surface that as a more helpful
        // message than the generic "no rows" path.
        if (result.skippedNonDraft > 0) {
          toast.error("초안 상태의 시험만 삭제할 수 있습니다.");
        } else {
          toast.error("삭제된 시험이 없습니다.");
        }
      } else {
        const missing = result.requested - result.deleted;
        const reason =
          result.skippedNonDraft > 0
            ? `(${result.skippedNonDraft}부는 초안이 아니어서 제외됨)`
            : "";
        toast.warning(
          `${result.deleted}부 삭제됨, ${missing}부 누락 ${reason}`.trim(),
        );
      }
      // Hide only the ids that the server confirmed it could delete. If the
      // server skipped non-DRAFT exams, leave them visible since they're
      // still real rows the user might still want to act on.
      if (result.deleted > 0) {
        // We don't know exactly which subset got deleted when deleted <
        // requested. In that rare case fall back to optimistically hiding
        // every requested id; router.refresh() restores anything the server
        // actually kept.
        const idsToHide =
          result.deleted === result.requested ? ids : ids;
        setRemovedIds((prev) => {
          const next = new Set(prev);
          for (const id of idsToHide) next.add(id);
          return next;
        });
      }
      selection.clearSelection();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }, [selection, bulkDeleting, router]);

  const totalCount = exams.length;

  // ─── 동형 생성 시험지 분석 정보 ───
  // exam.settings 의 similarExam.patternProfile 이 있으면 동형 생성물 → 분석 정보 노출.
  const analysisByExamId = useMemo(() => {
    const map = new Map();
    for (const exam of exams) {
      try {
        const parsed = exam.settings ? JSON.parse(exam.settings) : null;
        const blueprint = parsed?.similarExam?.patternProfile;
        if (blueprint) {
          map.set(exam.id, {
            blueprint,
            generatedCount: exam._count?.questions ?? null,
            title: exam.title,
          });
        }
      } catch {
        /* settings 파싱 실패 무시 */
      }
    }
    return map;
  }, [exams]);
  const handleShowAnalysis = useCallback(
    (id: string) => {
      const analysis = analysisByExamId.get(id);
      if (analysis) setAnalysisExam(analysis);
    },
    [analysisByExamId],
  );

  // ─── Sticky measurement so the toolbar row pins below the folder card ───
  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(true);

  // ─── Selection-gated bulk actions (left side of toolbar) ───
  const selectionExtraActions = (
    <>
      <MoveOrCopyFolderPicker
        collections={folder.collections}
        activeFolder={folder.activeFolder}
        selectedCount={selection.selectedIds.size}
        onCopy={onAddToFolder}
        onMove={onMoveToFolder}
        // 모바일은 아이콘 전용(텍스트 제거). 데스크톱은 기존 텍스트 버튼 유지.
        compact={isMobile}
      />

      {/* Bulk delete — 모바일은 아이콘 전용, 데스크톱은 텍스트 유지 */}
      <button
        type="button"
        onClick={() => void handleBulkDelete()}
        disabled={selection.selectedIds.size === 0 || bulkDeleting}
        title="삭제"
        aria-label="삭제"
        className={
          isMobile
            ? "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            : "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {bulkDeleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
        {isMobile ? null : "삭제"}
      </button>
    </>
  );

  // ─── Toolbar row (mirrors question-bank-client) ───
  const toolbarRow = (
    <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-nowrap">
        <SelectAllCheckbox
          checked={selection.isAllSelected && selection.selectedIds.size > 0}
          indeterminate={
            selection.selectedIds.size > 0 && !selection.isAllSelected
          }
          disabled={displayedExams.length === 0}
          onChange={selection.selectAll}
          title={`${selection.selectedIds.size}부 선택`}
          ariaLabel={selection.isAllSelected ? "전체 해제" : "전체 선택"}
        />
        <div
          className={
            "flex min-w-0 flex-wrap items-center gap-1.5 md:flex-nowrap md:gap-3 " +
            (selection.selectedIds.size > 0
              ? ""
              : "pointer-events-none opacity-50")
          }
          aria-disabled={selection.selectedIds.size === 0}
        >
          {selectionExtraActions}
          {folder.activeFolder ? (
            <button
              type="button"
              onClick={onRemoveFromFolder}
              title="폴더에서 삭제"
              aria-label="폴더에서 삭제"
              className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              폴더에서 삭제
            </button>
          ) : null}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        <FiltersToolbar
          search={search}
          setSearch={setSearch}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          classes={classes}
        />
        <ViewModeCycleButton
          value={viewType}
          options={EXAM_VIEW_OPTIONS}
          onChange={setViewType}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]">
      {/* ─── Content ─── */}
      <div className="-mx-6 flex-1 bg-[#F4F6F9] px-6 pt-2 pb-4 sm:px-8">
        {exams.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">등록된 시험이 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">
              시험을 만들어 문제를 관리하세요
            </p>
          </div>
        ) : (
          <section
            ref={listSectionRef}
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {/* Sticky layer 1 — folder section (page identity + folders) */}
            <div
              ref={folderStickyRef}
              className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
            >
              <FolderSection
                embedded
                childFolders={folder.childFolders}
                activeFolder={folder.activeFolder}
                dragItemType="exam"
                dragItemIdKey="examId"
                itemCountLabel="시험"
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
                breadcrumbPath={folder.breadcrumbPath}
                onNavigateToRoot={() => {
                  folder.setActiveFolder(null);
                  selection.clearSelection();
                }}
                useCardInsideFolder={false}
                rootLabel="전체 시험"
                enableFolderControls
                allFolders={folder.collections}
                storageKey="exams"
                treatRootAsFolder
                pageHeader={{
                  icon: <GraduationCap className="h-3.5 w-3.5" />,
                  parentLabel: "시험 관리",
                  title: "전체 시험",
                  totalCount,
                  itemLabel: "시험",
                  itemUnit: "부",
                }}
              />
            </div>

            {/* Sticky layer 2 — selection + filter toolbar */}
            <div
              style={{ top: folderStickyHeight }}
              className="sticky z-20 shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90"
            >
              {toolbarRow}
            </div>

            {/* Cards / list */}
            <div className="min-w-0 px-4 pb-3 pt-3 sm:px-5">
              {displayedExams.length === 0 ? (
                <div className="py-12 text-center">
                  <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {folder.activeFolder
                      ? "이 폴더에 시험이 없습니다."
                      : "조건에 맞는 시험이 없습니다."}
                  </p>
                  {folder.activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">
                      시험을 드래그하거나 선택 후 &quot;폴더에 추가&quot;를
                      사용하세요.
                    </p>
                  )}
                </div>
              ) : viewType !== "list" ? (
                <DragSelect deferCommit
                  className={`grid min-w-0 ${EXAM_GRID_COL_CLASS[viewType]} gap-3`}
                  value={selection.selectedIds}
                  onChange={selection.setSelectedIds}
                >
                  {visibleExams.map((exam) => (
                    <ExamFileCard
                      key={exam.id}
                      exam={exam}
                      selected={selection.selectedIds.has(exam.id)}
                      onToggleSelect={selection.toggleSelect}
                      onClick={openQuickView}
                      onEdit={(id) =>
                        router.push(examEditHref(id))
                      }
                      onDelete={handleDelete}
                      onShowAnalysis={
                        analysisByExamId.has(exam.id) ? handleShowAnalysis : undefined
                      }
                      onAssign={openAssignComposer}
                      assignLocked={assignLocked}
                      deploymentSummary={deploymentSummaries[exam.id]}
                    />
                  ))}
                </DragSelect>
              ) : (
                /* List view — with drag support */
                <DragSelect deferCommit
                  className="space-y-1.5"
                  value={selection.selectedIds}
                  onChange={selection.setSelectedIds}
                >
                  {visibleExams.map((exam) => (
                    <ExamListRow
                      key={exam.id}
                      exam={exam}
                      selected={selection.selectedIds.has(exam.id)}
                      onToggleSelect={selection.toggleSelect}
                      onClick={openQuickView}
                      onEdit={(id) =>
                        router.push(examEditHref(id))
                      }
                      onDelete={handleDelete}
                      onShowAnalysis={
                        analysisByExamId.has(exam.id) ? handleShowAnalysis : undefined
                      }
                      onAssign={openAssignComposer}
                      assignLocked={assignLocked}
                    />
                  ))}
                </DragSelect>
              )}

              {/* 모바일 전용 페이지 넘김 — 폴더당 10개씩(데스크톱은 렌더 안 함) */}
              {isMobile && displayedExams.length > 0 && (
                <div className="pt-3">
                  <Pagination
                    page={mobilePage}
                    totalPages={mobileTotalPages}
                    onGoToPage={setMobilePage}
                    scrollTargetRef={listSectionRef}
                  />
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <ExamQuickViewDialog
        examId={quickViewExamId}
        open={quickViewOpen}
        onOpenChange={setQuickViewOpen}
      />

      {/* 과제 배포 컴포저 — EXAM 프리셋 고정(기본 태블릿 응시).
          완료 시 목록 새로고침 + 과제 관리 딥링크 토스트. */}
      <AssignmentComposer
        open={assignExam !== null}
        onClose={() => setAssignExam(null)}
        preset={
          assignExam
            ? {
                kind: "EXAM",
                content: {
                  refId: assignExam.id,
                  title: assignExam.title,
                  meta: `${assignExam.questionCount}문항`,
                },
                examMode: "TABLET",
              }
            : null
        }
        onCreated={(assignmentId) => {
          router.refresh();
          toast("과제 관리에서 배포 현황을 확인할 수 있습니다.", {
            action: {
              label: "과제 관리에서 보기",
              onClick: () =>
                router.push(`/director/students/assignments?open=${assignmentId}`),
            },
          });
        }}
      />

      {analysisExam && (
        <SimilarExamBlueprintModal
          blueprint={analysisExam.blueprint}
          generatedCount={analysisExam.generatedCount}
          title={analysisExam.title}
          onClose={() => setAnalysisExam(null)}
        />
      )}
    </div>
  );
}
