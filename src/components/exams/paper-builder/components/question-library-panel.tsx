import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, FileText, Filter, Rows3, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuestionBankCard } from "@/components/workbench/question-bank-card";
import { DragSelect } from "@/components/ui/drag-select";
import { PassageGroupedView } from "@/components/workbench/question-bank-passage-view";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { QuestionFiltersToolbar } from "@/components/workbench/question-bank-client/filters-toolbar";
import {
  GridToggle,
  type QuestionGridCols,
} from "@/components/workbench/question-bank-client/grid-toggle";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import type { CollectionItem } from "@/components/workbench/shared/types";
import type { BuilderQuestion } from "../types";

const LIBRARY_VIEW_OPTIONS = [
  { value: "questions", label: "문제별", Icon: Rows3 },
  { value: "passages", label: "지문별", Icon: FileText },
] satisfies ReadonlyArray<ViewModeCycleOption<"questions" | "passages">>;

interface QuestionLibraryPanelProps {
  filteredQuestions: BuilderQuestion[];
  selectedQuestionIds: Set<string>;
  search: string;
  setSearch: (value: string) => void;
  selectedSubTypes: string[];
  setSelectedSubTypes: (value: string[]) => void;
  difficulty: string;
  setDifficulty: (value: string) => void;
  approvedFilter: "ALL" | "pending" | "approved";
  setApprovedFilter: (value: "ALL" | "pending" | "approved") => void;
  starredOnly: boolean;
  setStarredOnly: (value: boolean | ((prev: boolean) => boolean)) => void;
  sort: string;
  setSort: (value: string) => void;
  statusCounts: { all: number; pending: number; approved: number };
  paperQuestionCounts: Map<string, number>;
  // 시험지 미리보기에서 현재 클릭한 문항 id. 해당 카드를 진한 파랑 테두리로 강조하고,
  // 목록에서 보이지 않으면 스크롤로 끌어온다.
  activeQuestionId?: string | null;
  // 체크박스/카드 선택 즉시 시험지 미리보기에 추가한다.
  onToggleSelect: (questionId: string) => void;
  setSelectedQuestionIds: (next: Set<string>) => void;
  onShowDetail: (question: BuilderQuestion) => void;
  // ─── 파일(폴더) 관리 — questions 페이지의 FolderSection 구조 ───
  totalQuestionCount: number;
  childFolders: CollectionItem[];
  activeFolder: string | null;
  breadcrumbPath: CollectionItem[];
  showNewFolder: boolean;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onShowNewFolder: (show: boolean) => void;
  onCreateFolder: () => void;
  onNavigateToFolder: (id: string) => void;
  onNavigateToRoot: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onDragToFolder: (itemId: string, folderId: string, copy: boolean) => void;
  onDragToRoot: (itemId: string, copy: boolean) => void;
  /**
   * 마키(영역 드래그) 시작 영역을 이 패널 바깥(시험지 미리보기창 포함, 빌더 전체)까지
   * 넓히기 위한 boundary. 빌더 루트에서 내려준다.
   */
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
}

export function QuestionLibraryPanel({
  filteredQuestions,
  selectedQuestionIds,
  search,
  setSearch,
  selectedSubTypes,
  setSelectedSubTypes,
  difficulty,
  setDifficulty,
  approvedFilter,
  setApprovedFilter,
  starredOnly,
  setStarredOnly,
  sort,
  setSort,
  statusCounts,
  paperQuestionCounts,
  activeQuestionId,
  onToggleSelect,
  setSelectedQuestionIds,
  onShowDetail,
  totalQuestionCount,
  childFolders,
  activeFolder,
  breadcrumbPath,
  showNewFolder,
  newFolderName,
  onNewFolderNameChange,
  onShowNewFolder,
  onCreateFolder,
  onNavigateToFolder,
  onNavigateToRoot,
  onRenameFolder,
  onDeleteFolder,
  onDragToFolder,
  onDragToRoot,
  marqueeBoundaryRef,
}: QuestionLibraryPanelProps) {
  const [gridColumns, setGridColumns] = useState<QuestionGridCols>(2);
  const [libraryView, setLibraryView] = useState<"questions" | "passages">("questions");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 시험지 미리보기에서 문항을 클릭하면 좌측 목록의 해당 카드로 스크롤한다(이미 보이는
  // 경우엔 가만히 둔다). 지문별 보기에서 접혀 있는 그룹은 카드가 DOM에 없을 수 있어
  // 스크롤 대상이 없으면 조용히 넘어간다.
  useEffect(() => {
    if (!activeQuestionId) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-question-card-id="${CSS.escape(activeQuestionId)}"]`,
    );
    if (!target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const fullyVisible =
      targetRect.top >= containerRect.top &&
      targetRect.bottom <= containerRect.bottom;
    if (fullyVisible) return;
    container.scrollTo({
      top:
        container.scrollTop +
        targetRect.top -
        containerRect.top -
        (containerRect.height - targetRect.height) / 2,
      behavior: "smooth",
    });
  }, [activeQuestionId, libraryView, gridColumns]);
  const [expandedPassageIds, setExpandedPassageIds] = useState<Record<string, boolean>>({});
  const questionById = useMemo(
    () => new Map(filteredQuestions.map((question) => [question.id, question])),
    [filteredQuestions],
  );
  const groupedPassages = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        title: string;
        grade: number | null;
        semester: string | null;
        unit: string | null;
        publisher: string | null;
        school: { id: string; name: string } | null;
        analysis: { id: string; updatedAt: Date } | null;
        totalQuestionCount: number;
        questions: BuilderQuestion[];
      }
    >();

    for (const question of filteredQuestions) {
      const passage = question.passage;
      const key = passage?.id ?? "__no_passage__";
      const group = groups.get(key) ?? {
        id: key,
        title: passage?.title || "지문 없는 문제",
        grade: passage?.grade ?? null,
        semester: passage?.semester ?? null,
        unit: null,
        publisher: passage?.publisher ?? null,
        school: passage?.school ?? null,
        analysis: null,
        totalQuestionCount: 0,
        questions: [],
      };
      group.questions.push(question);
      group.totalQuestionCount = group.questions.length;
      groups.set(key, group);
    }

    return Array.from(groups.values());
  }, [filteredQuestions]);

  const applySelectedQuestionIds = useCallback(
    (nextSelectedIds: Set<string>) => {
      setSelectedQuestionIds(nextSelectedIds);
    },
    [setSelectedQuestionIds],
  );

  const toggleQuestionById = useCallback(
    (id: string) => {
      onToggleSelect(id);
    },
    [onToggleSelect],
  );

  const buildDragQuestionIds = useCallback((draggedId: string) => [draggedId], []);

  // 체크한 순서를 카드에 1,2,3… 번호로 보여 주기 위한 맵(드롭 순서 = 이 순서).
  const selectionOrder = useMemo(() => {
    const map = new Map<string, number>();
    let index = 1;
    for (const id of selectedQuestionIds) map.set(id, index++);
    return map;
  }, [selectedQuestionIds]);

  // questions 페이지의 QuestionFiltersToolbar(유형·난이도·정렬·중요 + 검색)를
  // 그대로 재사용하기 위해 로컬 상태를 toolbar가 기대하는 인터페이스로 맞춘다.
  const toolbarFilters = useMemo(
    () => ({
      subType: selectedSubTypes.join(",") || undefined,
      difficulty: difficulty === "ALL" ? undefined : difficulty,
      starred: starredOnly ? true : undefined,
      sort,
    }),
    [selectedSubTypes, difficulty, starredOnly, sort],
  );

  const updateFilter = useCallback(
    (key: string, value: string) => {
      if (key === "difficulty") setDifficulty(value);
      else if (key === "sort") setSort(value === "ALL" ? "newest" : value);
      else if (key === "starred") setStarredOnly(value === "true");
    },
    [setDifficulty, setSort, setStarredOnly],
  );

  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      if ("subType" in updates) {
        const next = updates.subType;
        setSelectedSubTypes(
          !next || next === "ALL" ? [] : next.split(",").filter(Boolean),
        );
      }
    },
    [setSelectedSubTypes],
  );

  // 3열은 카드를 한 단계 작게(md), 2열/목록은 기본(lg)로 — questions 페이지 동일.
  const viewSize: "lg" | "md" = gridColumns === 3 ? "md" : "lg";

  // 전체 선택 — 현재 필터된 문제 전체의 선택 상태.
  const selectableFilteredQuestions = filteredQuestions;
  const allFilteredSelected =
    selectableFilteredQuestions.length > 0 &&
    selectableFilteredQuestions.every((q) => selectedQuestionIds.has(q.id));
  const someFilteredSelected = selectableFilteredQuestions.some((q) =>
    selectedQuestionIds.has(q.id),
  );
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(selectableFilteredQuestions.map((q) => q.id));
      applySelectedQuestionIds(
        new Set(
          Array.from(selectedQuestionIds).filter((id) => !filteredIdSet.has(id)),
        ),
      );
    } else {
      applySelectedQuestionIds(
        new Set([
          ...Array.from(selectedQuestionIds),
          ...selectableFilteredQuestions.map((q) => q.id),
        ]),
      );
    }
  };

  // ─── 지금 화면을 좁히고 있는 필터를 사람이 읽을 수 있게 요약한다 ───
  // statusCounts.all 은 검수상태 세그먼트를 제외한 모든 필터(폴더·유형·난이도·중요·
  // 검색)를 적용한 개수다. 즉 "이 위치에 실제로 들어있는 문항 수". 따라서
  // filteredQuestions.length 가 0인데 statusCounts.all 이 0보다 크면, 검수상태(또는
  // 다른) 필터가 가린 것이며 폴더 배지(전체 멤버 수)와 어긋나 보이게 된다.
  const statusFilterActive = approvedFilter !== "ALL";
  const statusLabel = approvedFilter === "pending" ? "미검수" : "검수완료";
  // 검수상태 필터로 가려진(반대 상태) 문항 수.
  const statusHiddenCount =
    approvedFilter === "pending"
      ? statusCounts.approved
      : approvedFilter === "approved"
        ? statusCounts.pending
        : 0;
  const otherFilters: { label: string; clear: () => void }[] = [];
  if (search.trim())
    otherFilters.push({ label: `검색 "${search.trim()}"`, clear: () => setSearch("") });
  if (difficulty !== "ALL")
    otherFilters.push({ label: "난이도", clear: () => setDifficulty("ALL") });
  if (selectedSubTypes.length > 0)
    otherFilters.push({ label: "유형", clear: () => setSelectedSubTypes([]) });
  if (starredOnly)
    otherFilters.push({ label: "중요만", clear: () => setStarredOnly(false) });
  const anyFilterActive = statusFilterActive || otherFilters.length > 0;
  const locationLabel = activeFolder ? "이 폴더" : "전체 문제";
  const clearAllFilters = () => {
    setApprovedFilter("ALL");
    setSearch("");
    setDifficulty("ALL");
    setSelectedSubTypes([]);
    setStarredOnly(false);
  };

  return (
    <section className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white">
      {/* 마키(영역 드래그) 선택 — 패널 어디서든(폴더바·툴바·카드 사이 여백·카드 아래
          빈 공간) 드래그를 시작할 수 있게 패널 전체를 감싼다. 단, 실제 선택은
          data-drag-item-id 가 붙은 "카드"에만 적용된다. 버튼/입력/링크 등 상호작용
          요소와 네이티브 드래그(폴더 이동) 위에서 시작하면 마키는 켜지지 않는다. */}
      <DragSelect
        value={selectedQuestionIds}
        onChange={applySelectedQuestionIds}
        boundaryRef={marqueeBoundaryRef}
        className="flex min-h-0 flex-1 flex-col"
      >
      {/* 파일(폴더) 관리 — questions 페이지와 동일한 FolderSection. 상위/하위 폴더
          탐색 + 드래그로 담기 + 폴더 생성/이름변경/삭제를 그대로 제공한다. */}
      <div className="shrink-0 border-b border-slate-100">
        <FolderSection
          embedded
          treatRootAsFolder
          useCardInsideFolder={false}
          resizableGrid
          storageKey="exam-question-folders"
          dragItemType="question"
          dragItemIdKey="questionId"
          itemCountLabel="문제"
          rootLabel="전체 문제"
          childFolders={childFolders}
          activeFolder={activeFolder}
          breadcrumbPath={breadcrumbPath}
          allFolders={childFolders}
          showNewFolder={showNewFolder}
          newFolderName={newFolderName}
          onNewFolderNameChange={onNewFolderNameChange}
          onShowNewFolder={onShowNewFolder}
          onCreateFolder={onCreateFolder}
          onNavigateToFolder={onNavigateToFolder}
          onNavigateToRoot={onNavigateToRoot}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onDragToFolder={onDragToFolder}
          onDragToRoot={onDragToRoot}
          pageHeader={{
            icon: <Database className="h-3.5 w-3.5" />,
            parentLabel: "문제 관리",
            title: "전체 문제",
            totalCount: totalQuestionCount,
            itemLabel: "문제",
            itemUnit: "문항",
          }}
        />
      </div>

      {/* 보기/필터 — questions 페이지 toolbar 우측 클러스터와 동일한 구성:
          검수상태 세그먼트 · 문제별/지문별 · 필터(유형·난이도·정렬·중요) · 검색 · 2/3/목록. */}
      <div className="shrink-0 border-b border-slate-100 px-4 py-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* 현재 필터된 미삽입 문제를 한 번에 추가한다. */}
          <input
            type="checkbox"
            checked={allFilteredSelected}
            ref={(el) => {
              if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
            }}
            onChange={toggleSelectAllFiltered}
            disabled={selectableFilteredQuestions.length === 0}
            title="현재 목록 문제 전체 추가"
            aria-label="현재 목록 문제 전체 추가"
            className="mr-auto size-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          />

          {/* 검수 상태 — 전체 / 미검수 / 검수완료 */}
          <ViewModeCycleButton
            value={approvedFilter}
            options={([
              { value: "ALL", label: "전체", count: statusCounts.all },
              { value: "pending", label: "미검수", count: statusCounts.pending },
              { value: "approved", label: "검수완료", count: statusCounts.approved },
            ] as const).map(({ value, label, count }) => ({
              value,
              label,
              content: (
                <>
                  {label} <span className="text-slate-400">{count}</span>
                </>
              ),
            }))}
            onChange={setApprovedFilter}
          />

          {/* 문제별 / 지문별 */}
          <ViewModeCycleButton
            value={libraryView}
            options={LIBRARY_VIEW_OPTIONS}
            showLabel
            onChange={setLibraryView}
          />

          {/* 필터(유형·난이도·정렬·중요) + 검색 — questions 페이지 컴포넌트 재사용 */}
          <QuestionFiltersToolbar
            filters={toolbarFilters}
            searchValue={search}
            onSearchChange={setSearch}
            onSearchSubmit={() => undefined}
            updateFilter={updateFilter}
            updateFilters={updateFilters}
          />

          {/* 보기 모드 — 단일 버튼으로 2열 → 3열 → 목록 순환 */}
          <GridToggle gridCols={gridColumns} setGridCols={setGridColumns} />
        </div>
      </div>

      {/* 필터 상태 배너 — "지금 무엇만 보고 있는지"를 항상 명확히 알린다.
          검수상태(미검수/검수완료) 또는 다른 필터가 켜져 있으면 결과가 있든 없든
          상단에 띠로 표시해, 폴더 배지 개수와 화면 개수가 어긋나도 혼란이 없게 한다. */}
      {anyFilterActive && (
        <div className="shrink-0 border-b border-blue-100 bg-blue-50/70 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <Filter className="size-3.5 shrink-0 text-blue-500" />
            {statusFilterActive ? (
              <span className="font-semibold text-blue-700">
                지금 ‘{statusLabel}’ 문항만 표시 중
                {statusHiddenCount > 0 && (
                  <span className="font-normal text-blue-500">
                    {" "}· {approvedFilter === "pending" ? "검수완료" : "미검수"} {statusHiddenCount}개 숨김
                  </span>
                )}
              </span>
            ) : (
              <span className="font-semibold text-blue-700">필터가 적용되어 있습니다</span>
            )}
            {otherFilters.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200"
              >
                {f.label}
                <button
                  type="button"
                  onClick={f.clear}
                  aria-label={`${f.label} 필터 해제`}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto shrink-0 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-700"
            >
              전체 보기
            </button>
          </div>
        </div>
      )}

      <div ref={scrollContainerRef} id="exam-question-bank-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-4">
        {filteredQuestions.length === 0 ? (
          anyFilterActive && statusCounts.all > 0 ? (
            // 실제로는 문항이 있는데 필터가 전부 가린 경우 — 왜 비었는지 명확히 설명.
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Filter className="h-9 w-9 text-blue-300" />
              <div className="space-y-1">
                <p className="text-[13px] font-semibold text-slate-600">
                  필터에 가려진 문항이 있습니다
                </p>
                <p className="text-[12px] leading-relaxed text-slate-500">
                  {locationLabel}에는 <span className="font-semibold text-slate-700">{statusCounts.all}개</span> 문항이 있지만,
                  {statusFilterActive ? (
                    <>
                      {" "}현재 <span className="font-semibold text-blue-600">‘{statusLabel}’만 보기</span>로 설정돼 있어
                      표시할 문항이 없습니다.
                      <br />
                      (미검수 {statusCounts.pending}개 · 검수완료 {statusCounts.approved}개)
                    </>
                  ) : (
                    <> 적용된 필터 때문에 표시할 문항이 없습니다.</>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {statusFilterActive && (
                  <button
                    type="button"
                    onClick={() => setApprovedFilter("ALL")}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                  >
                    검수 상태 ‘전체’로 보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  필터 모두 해제
                </button>
              </div>
            </div>
          ) : (
            // 필터와 무관하게 정말로 문항이 없는 경우.
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <FileText className="h-9 w-9 text-slate-300" />
              <p className="text-[13px] font-semibold text-slate-500">문제가 없습니다</p>
              <p className="text-[12px] text-slate-400">
                {activeFolder
                  ? "이 폴더에 담긴 문항이 없습니다. 문제를 드래그해 담아보세요."
                  : "문제 생성 탭에서 먼저 문제를 만들어주세요."}
              </p>
            </div>
          )
        ) : libraryView === "passages" ? (
          <PassageGroupedView
            passages={groupedPassages}
            gridCols={gridColumns}
            viewSize={viewSize}
            selectedIds={selectedQuestionIds}
            setSelectedIds={applySelectedQuestionIds}
            marqueeBoundaryRef={marqueeBoundaryRef}
            onToggleSelect={toggleQuestionById}
            onDelete={() => undefined}
            onApprove={() => undefined}
            onToggleStar={() => undefined}
            onEdit={(id) => {
              const question = questionById.get(id);
              if (question) onShowDetail(question);
            }}
            onDetail={(id) => {
              const question = questionById.get(id);
              if (question) onShowDetail(question);
            }}
            showManagementActions={false}
            showStar={false}
            enableDrag
            compactUsageLabel
            cardClickSelects
            showDetailButton
            selectedCardHighlight={false}
            dragRequiresSelection
            getDragQuestionIds={buildDragQuestionIds}
            selectionOrder={selectionOrder}
            activeQuestionId={activeQuestionId}
            usageCounts={paperQuestionCounts}
            collapsible
            expandedPassageIds={expandedPassageIds}
            setExpandedPassageIds={setExpandedPassageIds}
          />
        ) : (
          // 마키 시작은 패널 전체(상위 DragSelect)에서 처리하므로 여기선 그리드만 둔다.
          <div
            className={cn(
              "grid gap-3",
              gridColumns === 2
                ? "grid-cols-2"
                : gridColumns === 3
                  ? "grid-cols-3"
                  : "grid-cols-1",
            )}
          >
            {filteredQuestions.map((question, index) => {
              const usageCount = paperQuestionCounts.get(question.id) || 0;
              const selected = selectedQuestionIds.has(question.id);
              return (
                <QuestionBankCard
                  key={question.id}
                  q={question}
                  num={index + 1}
                  selected={selected}
                  onToggle={() => {
                    onToggleSelect(question.id);
                  }}
                  onDetail={() => onShowDetail(question)}
                  viewSize={viewSize}
                  showManagementActions={false}
                  enableDrag
                  compactUsageLabel
                  cardClickSelects
                  showDetailButton
                  dragRequiresSelection
                  getDragQuestionIds={buildDragQuestionIds}
                  selectionIndex={selectionOrder.get(question.id)}
                  active={activeQuestionId === question.id}
                  duplicateCount={usageCount > 1 ? usageCount : undefined}
                  selectedCardHighlight={false}
                  collapsible
                />
              );
            })}
          </div>
        )}
      </div>
      </DragSelect>
    </section>
  );
}
