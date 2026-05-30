import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  Columns2,
  FileText,
  Filter,
  FolderOpen,
  Group,
  List,
  Rows3,
  Search,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QuestionBankCard } from "@/components/workbench/question-bank-card";
import { PassageGroupedView } from "@/components/workbench/question-bank-passage-view";
import { TypeFilterPopover } from "@/components/workbench/question-type-filter";
import type { BuilderQuestion, QuestionCollection } from "../types";

const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "BASIC", label: "기본" },
  { value: "INTERMEDIATE", label: "중급" },
  { value: "KILLER", label: "킬러" },
];

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/40",
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

interface QuestionLibraryPanelProps {
  paperItemsCount: number;
  filteredQuestions: BuilderQuestion[];
  selectedQuestionIds: Set<string>;
  collections: QuestionCollection[];
  search: string;
  setSearch: (value: string) => void;
  showFilters: boolean;
  setShowFilters: (value: boolean | ((prev: boolean) => boolean)) => void;
  selectedSubTypes: string[];
  setSelectedSubTypes: (value: string[]) => void;
  difficulty: string;
  setDifficulty: (value: string) => void;
  approvedOnly: boolean;
  setApprovedOnly: (value: boolean | ((prev: boolean) => boolean)) => void;
  starredOnly: boolean;
  setStarredOnly: (value: boolean | ((prev: boolean) => boolean)) => void;
  selectedCollectionId: string;
  setSelectedCollectionId: (value: string) => void;
  onToggleQuestion: (question: BuilderQuestion) => void;
  onSelectAllFiltered: () => void;
  onRegroupByPassage: () => void;
  onClearPaper: () => void;
  onShowDetail: (question: BuilderQuestion) => void;
}

export function QuestionLibraryPanel({
  paperItemsCount,
  filteredQuestions,
  selectedQuestionIds,
  collections,
  search,
  setSearch,
  showFilters,
  setShowFilters,
  selectedSubTypes,
  setSelectedSubTypes,
  difficulty,
  setDifficulty,
  approvedOnly,
  setApprovedOnly,
  starredOnly,
  setStarredOnly,
  selectedCollectionId,
  setSelectedCollectionId,
  onToggleQuestion,
  onSelectAllFiltered,
  onRegroupByPassage,
  onClearPaper,
  onShowDetail,
}: QuestionLibraryPanelProps) {
  const [gridColumns, setGridColumns] = useState<1 | 2>(1);
  const [libraryView, setLibraryView] = useState<"questions" | "passages">("questions");
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
      const allIds = new Set([
        ...Array.from(selectedQuestionIds),
        ...Array.from(nextSelectedIds),
      ]);

      for (const id of allIds) {
        if (selectedQuestionIds.has(id) === nextSelectedIds.has(id)) continue;
        const question = questionById.get(id);
        if (question) onToggleQuestion(question);
      }
    },
    [onToggleQuestion, questionById, selectedQuestionIds],
  );

  const toggleQuestionById = useCallback(
    (id: string) => {
      const question = questionById.get(id);
      if (question) onToggleQuestion(question);
    },
    [onToggleQuestion, questionById],
  );

  const activeFilterCount =
    (difficulty !== "ALL" ? 1 : 0) +
    (approvedOnly ? 1 : 0) +
    (starredOnly ? 1 : 0);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white">
      {paperItemsCount > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-blue-200 bg-blue-50 px-5 py-2">
          <span className="text-[12px] font-bold text-blue-700">{paperItemsCount}문항 선택</span>
          <span className="h-4 w-px bg-blue-200" />
          <button onClick={onSelectAllFiltered} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">
            현재 목록 추가
          </button>
          <button onClick={onRegroupByPassage} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800">
            <Group className="h-3 w-3" />
            지문별 자동 그룹화
          </button>
          <div className="flex-1" />
          <button onClick={onClearPaper} className="text-[11px] font-semibold text-blue-500 hover:text-blue-800">
            전체 비우기
          </button>
        </div>
      )}

      <div className="shrink-0 border-b border-slate-100 px-5 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="문제, 지문, 태그로 검색..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <TypeFilterPopover
            currentSubTypes={selectedSubTypes}
            onApply={setSelectedSubTypes}
          />

          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger
              className={cn(
                "relative flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium outline-none transition-all",
                activeFilterCount > 0
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              필터
              {activeFilterCount > 0 && (
                <span className="ml-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-4 text-white">
                  {activeFilterCount}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-800">
                  <Filter className="h-3.5 w-3.5 text-slate-500" />
                  난이도 · 상태
                </span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setDifficulty("ALL");
                      setApprovedOnly(false);
                      setStarredOnly(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                    초기화
                  </button>
                )}
              </div>
              <div className="space-y-3 p-3">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                    난이도
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <FilterPill
                        key={opt.value}
                        active={difficulty === opt.value}
                        onClick={() => setDifficulty(opt.value)}
                      >
                        {opt.label}
                      </FilterPill>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                    상태
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <FilterPill
                      active={approvedOnly}
                      onClick={() => setApprovedOnly((value) => !value)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      승인 문제만
                    </FilterPill>
                    <FilterPill
                      active={starredOnly}
                      onClick={() => setStarredOnly((value) => !value)}
                    >
                      <Star className={cn("h-3 w-3", starredOnly && "fill-current")} />
                      중요
                    </FilterPill>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setLibraryView("questions")}
              aria-pressed={libraryView === "questions"}
              title="문제별 보기"
              className={cn(
                "flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors",
                libraryView === "questions"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
              )}
            >
              <Rows3 className="h-3.5 w-3.5" />
              문제별
            </button>
            <button
              type="button"
              onClick={() => setLibraryView("passages")}
              aria-pressed={libraryView === "passages"}
              title="지문별 보기"
              className={cn(
                "flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors",
                libraryView === "passages"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              지문별
            </button>
          </div>
          <div className="flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setGridColumns(1)}
              aria-pressed={gridColumns === 1}
              title="1열 보기"
              className={cn(
                "flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors",
                gridColumns === 1
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
              )}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setGridColumns(2)}
              aria-pressed={gridColumns === 2}
              title="2열 보기"
              className={cn(
                "flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors",
                gridColumns === 2
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
              )}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="ml-auto flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[12px] font-semibold text-slate-600">{filteredQuestions.length}</span>
            <span className="text-[11px] text-slate-400">문항</span>
          </div>
        </div>

        {collections.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2.5">
            <button
              onClick={() => setSelectedCollectionId("")}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-all",
                !selectedCollectionId
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              전체 문제
            </button>
            {collections.map((collection) => (
              <button
                key={collection.id}
                onClick={() => setSelectedCollectionId(selectedCollectionId === collection.id ? "" : collection.id)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-all",
                  selectedCollectionId === collection.id
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <FolderOpen className="h-3 w-3" />
                {collection.name}
                <span className="text-[10px] text-slate-400">{collection._count.items}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div id="exam-question-bank-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
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
            viewSize="lg"
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
            showManagementActions={false}
            showStar={false}
            enableDrag
            expandedPassageIds={expandedPassageIds}
            setExpandedPassageIds={setExpandedPassageIds}
          />
        ) : (
          <div className={cn("grid gap-3", gridColumns === 2 ? "grid-cols-2" : "grid-cols-1")}>
            {filteredQuestions.map((question, index) => {
              const selected = selectedQuestionIds.has(question.id);
              return (
                <QuestionBankCard
                  key={question.id}
                  q={question}
                  num={index + 1}
                  selected={selected}
                  onToggle={() => onToggleQuestion(question)}
                  onEdit={() => onShowDetail(question)}
                  viewSize="lg"
                  showManagementActions={false}
                  enableDrag
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
