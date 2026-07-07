"use client";

import {
  Search,
  X,
  ChevronDown,
  Check,
  ChevronLeft,
  LayoutGrid,
  FileText,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { reconLabel, examLabel } from "@/lib/exam-passages/format";
import type { ExamPassageLibraryApi } from "./use-exam-passage-library";

const DEFAULT_EXAMS = ["수능", "9월", "6월", "예비"];

type Opt<T> = { value: T; label: string; count?: number };

/**
 * 통일된 facet 드롭다운 — 라벨 + 선택 개수 배지 + 셰브론. 열면 체크리스트(또는 연도
 * 그리드)와 개수를 보여준다. 적용된 선택은 아래 '적용된 필터' 칩으로도 노출된다.
 */
function FilterMenu<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  onClear,
  variant = "list",
}: {
  label: string;
  options: Opt<T>[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  onClear: () => void;
  variant?: "list" | "grid";
}) {
  const count = selected.size;
  const active = count > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? `${label} 필터, ${count}개 선택됨` : `${label} 필터`}
          className={
            // 모바일(base): flex-1 로 한 줄에서 5개 균등 분배(줄바꿈 방지) + 컴팩트 패딩.
            // 데스크톱(lg): 기존 자연폭·패딩 그대로.
            "inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-2 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:flex-none lg:shrink-0 lg:justify-start lg:gap-1.5 lg:px-2.5 " +
            (active
              ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
          }
        >
          {label}
          {active ? (
            <span
              aria-hidden="true"
              className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white"
            >
              {count}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={variant === "grid" ? "w-[264px] p-2.5" : "w-60 p-1.5"}
      >
        <div className="mb-1 flex items-center justify-between px-1.5 pt-0.5">
          <span className="text-[11px] font-bold text-slate-500">{label}</span>
          {active ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded px-1 text-[10.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              해제
            </button>
          ) : null}
        </div>

        {variant === "grid" ? (
          <div className="grid grid-cols-4 gap-1">
            {options.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  aria-pressed={on}
                  className={
                    "h-7 rounded-md border text-[11.5px] font-semibold transition " +
                    (on
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {options.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  aria-pressed={on}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition " +
                    (on
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-50")
                  }
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={
                        "flex size-4 shrink-0 items-center justify-center rounded border transition " +
                        (on
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 text-transparent")
                      }
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="truncate">{o.label}</span>
                  </span>
                  {typeof o.count === "number" ? (
                    <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
                      {o.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** 적용된 필터 제거형 칩. */
function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 pl-2 pr-1 text-[11px] font-semibold text-blue-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} 필터 제거`}
        className="flex size-4 items-center justify-center rounded text-blue-500 transition hover:bg-blue-100 hover:text-blue-700"
      >
        <X className="size-3" strokeWidth={2.5} />
      </button>
    </span>
  );
}

export function ExamFilterBar({ api }: { api: ExamPassageLibraryApi }) {
  const { facets, filters } = api;
  const grades = facets?.grades ?? ["고3", "고2", "고1"];
  const gradeCounts = facets?.counts.grade ?? {};
  const exams = facets?.exams ?? DEFAULT_EXAMS;
  const examCounts = facets?.counts.exam ?? {};
  const typeGroups = facets?.typeGroups ?? [];
  const typeCounts = facets?.counts.typeGroup ?? {};
  const years = facets?.years ?? [];
  const reconKinds = facets?.reconKinds ?? [];
  const reconCounts = facets?.counts.reconstructionKind ?? {};

  // '적용된 필터' 칩 — 드롭다운과 동일 순서(연도 → 회차 → 학년 → 유형 → 복원).
  const activeChips: { key: string; label: string; remove: () => void }[] = [
    ...[...filters.years]
      .sort((a, b) => b - a)
      .map((v) => ({
        key: `year-${v}`,
        label: `${v}학년도`,
        remove: () => api.toggleYear(v),
      })),
    ...[...filters.exams].map((v) => ({
      key: `exam-${v}`,
      label: examLabel(v),
      remove: () => api.toggleExam(v),
    })),
    ...[...filters.grades].map((v) => ({
      key: `grade-${v}`,
      label: v,
      remove: () => api.toggleGrade(v),
    })),
    ...[...filters.types].map((v) => ({
      key: `type-${v}`,
      label: v,
      remove: () => api.toggleType(v),
    })),
    ...[...filters.recons].map((v) => ({
      key: `recon-${v}`,
      label: reconLabel(v),
      remove: () => api.toggleRecon(v),
    })),
  ];

  return (
    <div className="shrink-0 space-y-2 border-b border-slate-100 bg-white px-3 py-2.5">
      {/* 통합 툴바 — 체크박스 | 필터 | 검색창(길게·반응형) | 시험지별·문제별.
          모바일(<lg)은 줄바꿈해 토글·'← 시험지' 뒤로 버튼이 화면 밖으로 밀려
          잘리지 않게 한다(검색창은 아래 전체폭으로 내림). PC 는 기존 한 줄 유지. */}
      <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap">
        {/* 체크박스 + facet 드롭다운 5개를 한 묶음으로. 모바일(base)은 전체폭
            한 줄에 flex-1 균등 분배(줄바꿈 방지), 데스크톱(lg:contents)은 래퍼를
            투명화해 기존 한 줄 인라인 레이아웃을 그대로 둔다. */}
        <div className="flex w-full min-w-0 items-center gap-1 lg:contents">
        {/* 전체선택 체크박스 — 상시 노출(시험지별/문제별 공통, 맨 왼쪽) */}
        <input
          type="checkbox"
          checked={api.allVisibleSelected}
          onChange={api.toggleSelectAll}
          disabled={!api.hasVisibleItems}
          title="전체 선택"
          aria-label="전체 선택"
          className="size-4 shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {/* facet 드롭다운 — 연도 → 회차 → 학년 → 유형 → 복원 */}
        <FilterMenu
          label="연도"
          variant="grid"
          options={years.map((y) => ({ value: y, label: String(y) }))}
          selected={filters.years}
          onToggle={api.toggleYear}
          onClear={() => filters.years.forEach((v) => api.toggleYear(v))}
        />
        <FilterMenu
          label="회차"
          options={exams.map((ex) => ({
            value: ex,
            label: examLabel(ex),
            count: examCounts[ex],
          }))}
          selected={filters.exams}
          onToggle={api.toggleExam}
          onClear={() => filters.exams.forEach((v) => api.toggleExam(v))}
        />
        <FilterMenu
          label="학년"
          options={grades.map((g) => ({
            value: g,
            label: g,
            count: gradeCounts[g],
          }))}
          selected={filters.grades}
          onToggle={api.toggleGrade}
          onClear={() => filters.grades.forEach((v) => api.toggleGrade(v))}
        />
        <FilterMenu
          label="유형"
          options={typeGroups.map((tg) => ({
            value: tg,
            label: tg,
            count: typeCounts[tg],
          }))}
          selected={filters.types}
          onToggle={api.toggleType}
          onClear={() => filters.types.forEach((v) => api.toggleType(v))}
        />
        <FilterMenu
          label="복원"
          options={reconKinds.map((rk) => ({
            value: rk,
            label: reconLabel(rk),
            count: reconCounts[rk],
          }))}
          selected={filters.recons}
          onToggle={api.toggleRecon}
          onClear={() => filters.recons.forEach((v) => api.toggleRecon(v))}
        />
        </div>

        {/* 검색창 + 토글/뒤로 묶음 — 모바일은 전체폭 한 줄로 내려(order-last)
            검색창과 '← 시험지' 뒤로 버튼을 같은 줄에 둔다. lg:contents 로
            데스크톱에선 래퍼를 투명화해 기존 한 줄 레이아웃을 유지한다. */}
        <div className="flex min-w-0 items-center gap-1.5 max-lg:order-last max-lg:w-full lg:contents">
        {/* 검색창 — 남는 공간을 채워 길게(반응형). 모바일에선 이 줄의 오른쪽
            끝으로 보낸다(order-2), 토글/뒤로 버튼은 왼쪽(order-1). */}
        <div className="relative min-w-0 flex-1 max-lg:order-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={api.searchInput}
            onChange={(e) => api.setSearchInput(e.target.value)}
            placeholder="지문 내용·연도·유형 검색 (예: climate, 2024, 빈칸)"
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
          />
          {api.searchInput ? (
            <button
              type="button"
              onClick={() => api.setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="검색어 지우기"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* 시험지별 ⇄ 문제별 (드릴인 중엔 ← 시험지 back) */}
        {api.drillExamId ? (
          <button
            type="button"
            onClick={api.exitDrill}
            className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 max-lg:order-1"
          >
            <ChevronLeft className="size-3.5" />
            시험지
          </button>
        ) : (
          <div className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 max-lg:order-1">
            <button
              type="button"
              onClick={api.goToPapers}
              aria-pressed={!api.browsingProblems}
              className={
                "inline-flex h-full items-center gap-1 px-2.5 text-[11.5px] font-semibold transition " +
                (!api.browsingProblems
                  ? "bg-blue-50 text-blue-700"
                  : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700")
              }
            >
              <LayoutGrid className="size-3.5" />
              시험지별
            </button>
            <div className="h-full w-px bg-slate-200" />
            <button
              type="button"
              onClick={api.goToProblems}
              aria-pressed={api.browsingProblems}
              className={
                "inline-flex h-full items-center gap-1 px-2.5 text-[11.5px] font-semibold transition " +
                (api.browsingProblems
                  ? "bg-blue-50 text-blue-700"
                  : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700")
              }
            >
              <FileText className="size-3.5" />
              문제별
            </button>
          </div>
        )}
        </div>
      </div>

      {/* 적용된 필터 칩 */}
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
            적용된 필터
          </span>
          {activeChips.map((chip) => (
            <ActiveChip key={chip.key} label={chip.label} onRemove={chip.remove} />
          ))}
          <button
            type="button"
            onClick={api.clearFilters}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-3" />
            모두 지우기
          </button>
        </div>
      ) : null}
    </div>
  );
}
