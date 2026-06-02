import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, FilePlus2, FileText, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuestionBankCard } from "@/components/workbench/question-bank-card";
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
  duplicateSelectedQuestionIds: Set<string>;
  // 체크박스 다중 선택(드래그 대상) 토글/일괄설정 — 미리보기 포함 여부와 무관.
  onToggleSelect: (questionId: string) => void;
  onApproveDuplicateSelect: (questionId: string) => void;
  setSelectedQuestionIds: (next: Set<string>) => void;
  // 선택된(체크된) 문항을 시험지(미리보기) 끝에 한 번에 삽입한다.
  onInsertSelected: (duplicateQuestionIds: Set<string>) => void;
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
  duplicateSelectedQuestionIds,
  onToggleSelect,
  onApproveDuplicateSelect,
  setSelectedQuestionIds,
  onInsertSelected,
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
}: QuestionLibraryPanelProps) {
  const [gridColumns, setGridColumns] = useState<QuestionGridCols>(2);
  const [libraryView, setLibraryView] = useState<"questions" | "passages">("questions");
  const [expandedPassageIds, setExpandedPassageIds] = useState<Record<string, boolean>>({});
  const questionById = useMemo(
    () => new Map(filteredQuestions.map((question) => [question.id, question])),
    [filteredQuestions],
  );
  const usedQuestionIds = useMemo(
    () =>
      new Set(
        Array.from(paperQuestionCounts.entries())
          .filter(([, count]) => count > 0)
          .map(([id]) => id),
      ),
    [paperQuestionCounts],
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
      if (usedQuestionIds.has(id) && !duplicateSelectedQuestionIds.has(id)) return;
      onToggleSelect(id);
    },
    [duplicateSelectedQuestionIds, onToggleSelect, usedQuestionIds],
  );

  // 다중 드래그 페이로드: 선택된(체크된) 카드를 끌면 선택 전체를 "체크한 순서대로",
  // 선택되지 않은 카드를 끌면 그 카드 하나만 끌고 간다. selectedQuestionIds는 Set이라
  // 체크한 순서대로 id가 쌓이므로 Array.from()이 곧 체크 순서다. effect 재구독을
  // 피하려고 최신 선택 집합은 ref로 읽는다.
  const selectedIdsRef = useRef(selectedQuestionIds);
  useEffect(() => {
    selectedIdsRef.current = selectedQuestionIds;
  }, [selectedQuestionIds]);
  const buildDragQuestionIds = useCallback((draggedId: string) => {
    if (usedQuestionIds.has(draggedId) && !duplicateSelectedQuestionIds.has(draggedId)) {
      return [];
    }
    const set = selectedIdsRef.current;
    if (!set.has(draggedId)) return [draggedId];
    return Array.from(set).filter(
      (id) => !usedQuestionIds.has(id) || duplicateSelectedQuestionIds.has(id),
    );
  }, [duplicateSelectedQuestionIds, usedQuestionIds]);

  const buildDuplicateDragQuestionIds = useCallback(
    (draggedId: string) =>
      buildDragQuestionIds(draggedId).filter((id) =>
        duplicateSelectedQuestionIds.has(id),
      ),
    [buildDragQuestionIds, duplicateSelectedQuestionIds],
  );

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
  const selectableFilteredQuestions = filteredQuestions.filter(
    (q) => !usedQuestionIds.has(q.id) || duplicateSelectedQuestionIds.has(q.id),
  );
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

  return (
    <section className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white">
      {/* 파일(폴더) 관리 — questions 페이지와 동일한 FolderSection. 상위/하위 폴더
          탐색 + 드래그로 담기 + 폴더 생성/이름변경/삭제를 그대로 제공한다. */}
      <div className="shrink-0 border-b border-slate-100">
        <FolderSection
          embedded
          treatRootAsFolder
          useCardInsideFolder
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
          {/* 전체 선택 체크박스 */}
          <input
            type="checkbox"
            checked={allFilteredSelected}
            ref={(el) => {
              if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
            }}
            onChange={toggleSelectAllFiltered}
            disabled={selectableFilteredQuestions.length === 0}
            title="전체 선택"
            aria-label="전체 선택"
            className="size-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          />

          {/* 시험지에 삽입 — 선택된 문항을 미리보기 끝에 한 번에 추가.
              아무것도 선택되지 않으면 옅은 파랑으로 음영(비활성), 하나라도
              선택되면 짙은 파랑으로 활성화된다. */}
          {(() => {
            const selectedCount = selectedQuestionIds.size;
            const hasSelection = selectedCount > 0;
            return (
              <button
                type="button"
                onClick={() => onInsertSelected(duplicateSelectedQuestionIds)}
                disabled={!hasSelection}
                title={hasSelection ? "선택한 문항을 시험지에 삽입" : "문항을 먼저 선택하세요"}
                className={cn(
                  "mr-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-colors",
                  hasSelection
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                    : "cursor-not-allowed bg-blue-50 text-blue-300",
                )}
              >
                <FilePlus2 className="size-3.5 shrink-0" />
                시험지에 삽입
                {hasSelection && (
                  <span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-white/25 px-1 text-[10px] font-bold tabular-nums">
                    {selectedCount}
                  </span>
                )}
              </button>
            );
          })()}

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

      <div id="exam-question-bank-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-4">
        {filteredQuestions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <FileText className="h-9 w-9 text-slate-300" />
            <p className="text-[13px] font-semibold text-slate-500">문제가 없습니다</p>
            <p className="text-[12px] text-slate-400">문제 생성 탭에서 먼저 문제를 만들거나 필터를 조정해주세요.</p>
          </div>
        ) : libraryView === "passages" ? (
          <PassageGroupedView
            passages={groupedPassages}
            gridCols={gridColumns}
            viewSize={viewSize}
            selectedIds={selectedQuestionIds}
            setSelectedIds={applySelectedQuestionIds}
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
            getDragQuestionIds={buildDragQuestionIds}
            selectionOrder={selectionOrder}
            disabledIds={usedQuestionIds}
            duplicateSelectedIds={duplicateSelectedQuestionIds}
            usageCounts={paperQuestionCounts}
            onApproveDuplicateSelect={onApproveDuplicateSelect}
            getDuplicateDragQuestionIds={buildDuplicateDragQuestionIds}
            expandedPassageIds={expandedPassageIds}
            setExpandedPassageIds={setExpandedPassageIds}
          />
        ) : (
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
              const duplicateSelected = duplicateSelectedQuestionIds.has(question.id);
              const disabled = usageCount > 0 && !duplicateSelected;
              const selected = selectedQuestionIds.has(question.id);
              return (
                <QuestionBankCard
                  key={question.id}
                  q={question}
                  num={index + 1}
                  selected={selected}
                  onToggle={() => {
                    if (!disabled) onToggleSelect(question.id);
                  }}
                  onDetail={() => onShowDetail(question)}
                  viewSize={viewSize}
                  showManagementActions={false}
                  enableDrag={!disabled}
                  compactUsageLabel
                  cardClickSelects
                  showDetailButton
                  getDragQuestionIds={buildDragQuestionIds}
                  getDuplicateDragQuestionIds={buildDuplicateDragQuestionIds}
                  selectionIndex={selectionOrder.get(question.id)}
                  selectionDisabled={disabled}
                  duplicateCount={usageCount > 1 ? usageCount : undefined}
                  onDuplicateSelectConfirm={
                    disabled ? () => onApproveDuplicateSelect(question.id) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
