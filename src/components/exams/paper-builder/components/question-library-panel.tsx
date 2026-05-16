import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Group,
  Search,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DIFFICULTY_META, SUBTYPE_LABELS, TYPE_LABELS } from "../constants";
import { countWords, parseOptions, parseTags, questionPreview } from "../paper-item-utils";
import type { BuilderQuestion, QuestionCollection } from "../types";

interface QuestionLibraryPanelProps {
  paperItemsCount: number;
  filteredQuestions: BuilderQuestion[];
  selectedQuestionIds: Set<string>;
  collections: QuestionCollection[];
  search: string;
  setSearch: (value: string) => void;
  showFilters: boolean;
  setShowFilters: (value: boolean | ((prev: boolean) => boolean)) => void;
  questionType: string;
  setQuestionType: (value: string) => void;
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
  questionType,
  setQuestionType,
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
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="문제, 지문, 태그로 검색..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>
          <button
            onClick={() => setShowFilters((value) => !value)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-all",
              showFilters || difficulty !== "ALL" || questionType !== "ALL" || approvedOnly || starredOnly
                ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100"
                : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            필터
          </button>
          <div className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[12px] font-semibold text-slate-600">{filteredQuestions.length}</span>
            <span className="text-[11px] text-slate-400">개</span>
          </div>
        </div>

        {showFilters && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
            <select
              value={questionType}
              onChange={(event) => setQuestionType(event.target.value)}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600"
            >
              <option value="ALL">전체 유형</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600"
            >
              <option value="ALL">전체 난이도</option>
              <option value="BASIC">기본</option>
              <option value="INTERMEDIATE">중급</option>
              <option value="KILLER">킬러</option>
            </select>
            <button
              onClick={() => setApprovedOnly((value) => !value)}
              className={cn(
                "h-7 rounded-md border px-2 text-[11px] font-semibold",
                approvedOnly ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500",
              )}
            >
              승인 문제만
            </button>
            <button
              onClick={() => setStarredOnly((value) => !value)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold",
                starredOnly ? "border-yellow-300 bg-yellow-50 text-yellow-700" : "border-slate-200 text-slate-500",
              )}
            >
              <Star className={cn("h-3 w-3", starredOnly && "fill-yellow-400")} />
              중요
            </button>
            <button
              onClick={() => {
                setDifficulty("ALL");
                setQuestionType("ALL");
                setApprovedOnly(false);
                setStarredOnly(false);
              }}
              className="ml-auto flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              <X className="h-3 w-3" />
              초기화
            </button>
          </div>
        )}

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
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
            {filteredQuestions.map((question) => {
              const selected = selectedQuestionIds.has(question.id);
              const diff = DIFFICULTY_META[question.difficulty];
              const tags = parseTags(question.tags);
              const options = parseOptions(question.options);
              return (
                <article
                  key={question.id}
                  className={cn(
                    "group relative flex min-h-[250px] flex-col rounded-xl border bg-white p-4 transition-all duration-200 hover:shadow-md",
                    selected ? "border-blue-400 bg-blue-50/20 ring-1 ring-blue-300/30" : "border-slate-200",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <button
                        onClick={() => onToggleQuestion(question)}
                        className={cn(
                          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded transition-all",
                          selected
                            ? "border border-blue-600 bg-blue-600 text-white"
                            : "border border-slate-300 bg-white text-transparent hover:border-blue-400 hover:text-blue-400",
                        )}
                        aria-label={selected ? "문제 선택 해제" : "문제 선택"}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate text-[13px] font-semibold text-slate-800">
                            {question.passage?.title || SUBTYPE_LABELS[question.subType || ""] || "독립 문제"}
                          </h3>
                          {question.starred && <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-500" />}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {TYPE_LABELS[question.type] || question.type}
                          </span>
                          {question.subType && (
                            <span className="text-[10px] font-medium text-blue-600">
                              {SUBTYPE_LABELS[question.subType] || question.subType}
                            </span>
                          )}
                          {diff && (
                            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", diff.className)}>
                              {diff.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onShowDetail(question)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg opacity-0 transition-opacity hover:bg-slate-100 group-hover:opacity-100"
                      title="상세 보기"
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  </div>

                  {question.passage && (
                    <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                      {question.passage.content}
                    </p>
                  )}

                  <p className="mt-2.5 line-clamp-4 whitespace-pre-line text-[12px] font-medium leading-relaxed text-slate-700">
                    {questionPreview(question.questionText)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {question.approved ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        승인
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        <Clock className="h-3 w-3" />
                        검토 전
                      </span>
                    )}
                    {question.passage && (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        <BookOpen className="h-3 w-3" />
                        {countWords(question.passage.content)} words
                      </span>
                    )}
                    {options.length > 0 && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                        선택지 {options.length}
                      </span>
                    )}
                    {question._count.examLinks > 0 && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        사용 {question._count.examLinks}
                      </span>
                    )}
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <span key={tag} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex-1" />
                  <button
                    onClick={() => onToggleQuestion(question)}
                    className={cn(
                      "mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[11px] font-semibold transition-colors",
                      selected
                        ? "border-blue-300 bg-blue-600 text-white hover:bg-blue-700"
                        : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
                    )}
                  >
                    {selected ? "선택됨" : "시험지에 추가"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
