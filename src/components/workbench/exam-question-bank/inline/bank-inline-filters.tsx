"use client";

// 인라인 기출 브라우저 — 필터 바 + 활성 칩 줄(정본 §11.3 F-2 「체계적인 필터」 · §11.13.3 아이콘 필터).
//
//   1줄: [🔍 검색 ………………………] [2005 ▾] ~ [2027 ▾]
//   2줄: [📅 시험 ▾][🏛 출제기관 ▾][🎓 학년 ▾][🏷 유형 ▾][🏅 배점 ▾]   ← FilterMenu(narrowHost) 5개 균등 분배, 항상 한 줄
//        좁으면(컨테이너 < 30rem) 라벨을 접고 [📅 ▾][🏛 ▾][🎓 ▾][🏷 ▾][🏅 ▾] — 아이콘 + 카운트 배지 + ▾ 만
//   칩:  [2025~2027학년도 ×][6월 모평 ×][빈칸추론 ×] … [초기화]
//
// - 뷰포트 유틸(sm:/lg:) 금지 — 조판 중 중앙 열은 420px 고정(뷰포트는 그대로다). 라벨 접힘 축은 이 필터 바
//   루트의 `@container`(content-box 폭) 다. 2줄 배치는 폭과 무관하게 고정이라 420px 에서도 붕괴하지 않는다.
//   검색 input 은 `min-w-[160px] flex-1` 로 짜부라지지 않는다.
// - 5개 메뉴 줄은 가로 스크롤 절대 금지 — flex-1 균등 분배 + 라벨 `min-w-0 truncate` + 배지·▾·아이콘 shrink-0.
//   접힌 버튼 최소 폭은 래퍼의 `[&>button]:min-w-10`(PopoverTrigger asChild 는 래퍼 DOM 을 만들지 않아 버튼이
//   직계 자식이다) — 공유 FilterMenu 의 `min-w-0` 은 손대지 않는다(passage-library 폰 5열 무회귀).
//   폭 산식(420px 열): 컨텐츠 396 − 간격 16 = 380 / 5 = 76px ≥ 아이콘 14 + 간격 4 + ▾ 14 + 패딩 16 = 48(+배지 20).
//   라벨 복귀(30rem=480): 464 / 5 ≈ 93px — 「출제기관」(≈48) 은 딱 맞고, 배지가 켜지면 truncate 로 「출제기…」.
// - FilterMenu 는 `selected: Set` 을 요구한다 — 배열 필터를 useMemo 로 Set 화(매 렌더 새 Set 금지).
// - 옵션 순서는 정준 순서(EXAM_BANK_EXAMS·EXAM_BANK_TYPE_GROUPS)로 세우고 facet 에만 있는 값은 뒤에 붙인다.
// - 호버로 상태를 바꾸는 코드 없음(§11.1).
// - 두 컴포넌트는 memo — prop 은 훅이 useMemo 로 돌려주는 `api` 하나뿐이라, 행 체크(pickedBankIds 변화)로
//   패널이 다시 그려져도 필터 바(Popover 5개)는 재렌더되지 않는다(§11.1 팬아웃 처방). 아이콘 엘리먼트는 모듈
//   상수로 1회 생성 — 렌더마다 새 엘리먼트를 만들어 memo 를 뚫지 않는다(FilterMenu 는 memo 가 아니지만 습관).
// - 검색 X 버튼의 `data-exam-bank-clear` 는 globals.css 폰 밀도 예외(`button:not([data-exam-bank-clear])`)의
//   계약 속성 — input 안에 겹쳐 앉은 버튼이라 40px 로 키우면 input 을 덮는다. 지우지 마라.

import { CalendarDays, GraduationCap, Hash, Landmark, Search, Tags, X } from "lucide-react";
import { memo, useMemo } from "react";

import { FilterMenu } from "@/components/workbench/exam-passage-library/exam-filter-bar";
import { examLabel } from "@/lib/exam-passages/format";
import { EXAM_BANK_EXAMS, EXAM_BANK_TYPE_GROUPS } from "@/lib/exam-passages/question-bank-types";
import type { ExamBankInlineApi } from "./use-exam-bank-inline";

const SELECT_CLS =
  "h-8 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white px-1.5 text-[11.5px] font-medium text-slate-600 tabular-nums outline-none transition-colors hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

/** 라벨 접힘 축 = 필터 바 루트 @container. 30rem 미만이면 아이콘·배지·▾ 만 남는다(§11.13.3). */
const MENU_LABEL_CLS = "hidden @[30rem]:inline";
const MENU_ICON_CLS = "size-3.5 shrink-0";
// 아이콘은 라벨의 시각 대체물이라 접근 트리에선 숨긴다(접근 이름은 FilterMenu 의 aria-label 이 진다).
const ICON_EXAM = <CalendarDays className={MENU_ICON_CLS} aria-hidden="true" />;
const ICON_BOARD = <Landmark className={MENU_ICON_CLS} aria-hidden="true" />;
const ICON_GRADE = <GraduationCap className={MENU_ICON_CLS} aria-hidden="true" />;
const ICON_TYPE = <Tags className={MENU_ICON_CLS} aria-hidden="true" />;
const ICON_QNUM = <Hash className="size-3.5 shrink-0" aria-hidden="true" />;

const GRADE_ORDER = ["고3", "고2", "고1"] as const;
const BOARD_ORDER = ["대학수학능력시험", "수능모의평가", "학력평가"] as const;

/** 출제기관 칩 자구(메뉴는 정식 명칭, 칩은 짧게). */
function boardChipLabel(board: string): string {
  switch (board) {
    case "대학수학능력시험":
      return "수능";
    case "수능모의평가":
      return "모평";
    case "학력평가":
      return "학평";
    default:
      return board;
  }
}

/** 정준 순서로 세우고, 정준에 없는 값은 뒤에(데이터가 우선). */
function ordered(values: readonly string[], order: readonly string[]): string[] {
  return [...order.filter((v) => values.includes(v)), ...values.filter((v) => !order.includes(v))];
}

function parseYear(v: string): number | null {
  const n = Number(v);
  return v === "" || !Number.isFinite(n) ? null : n;
}

function BankInlineFiltersImpl({ api }: { api: ExamBankInlineApi }) {
  const { filters, facets } = api;
  const years = useMemo(() => [...(facets?.years ?? [])].sort((a, b) => b - a), [facets]);
  const exams = useMemo(() => ordered(facets?.exams ?? [...EXAM_BANK_EXAMS], EXAM_BANK_EXAMS), [facets]);
  const boards = useMemo(() => ordered(facets?.boards ?? [...BOARD_ORDER], BOARD_ORDER), [facets]);
  const grades = useMemo(() => ordered(facets?.grades ?? [...GRADE_ORDER], GRADE_ORDER), [facets]);
  const typeGroups = useMemo(
    () => ordered(facets?.typeGroups ?? [...EXAM_BANK_TYPE_GROUPS], EXAM_BANK_TYPE_GROUPS),
    [facets],
  );
  const counts = facets?.counts;

  const examSet = useMemo(() => new Set(filters.exams), [filters.exams]);
  const boardSet = useMemo(() => new Set(filters.boards), [filters.boards]);
  const gradeSet = useMemo(() => new Set(filters.grades), [filters.grades]);
  const typeSet = useMemo(() => new Set(filters.typeGroups), [filters.typeGroups]);
  const qNumSet = useMemo(() => new Set(filters.qNums), [filters.qNums]);
  // 장문은 "43~45" 범위 하나로 선택하고, 긴 범위 버튼은 두 칸을 사용한다.
  const qNumOptions = useMemo(() => (facets?.qNums ?? []).map((n) => ({
    value: n, label: String(n), count: counts?.qNum?.[String(n)], wide: typeof n === "string",
  })), [facets, counts]);

  const { toggleIn, clearKey, toggleQNum, setYearRange } = api;

  return (
    // @container: 라벨 접힘 축은 이 루트의 폭(뷰포트 아님) — 조판이 열리면 중앙 열이 420px 로 눌리지만 뷰포트는
    // 그대로다. 패널 루트에도 @container 가 있지만 @[30rem] 은 가장 가까운 컨테이너(여기)로 해석된다.
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 @container" data-exam-bank-filters>
      <div className="relative min-w-[160px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={filters.q}
          onChange={(e) => api.setQuery(e.target.value)}
          placeholder="본문·발문·선지·회차 검색"
          aria-label="기출 검색"
          data-exam-bank-search
          className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
        />
        {filters.q ? (
          <button
            type="button"
            onClick={() => api.setQuery("")}
            aria-label="검색어 지우기"
            data-exam-bank-clear
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <select
          aria-label="학년도 시작"
          value={filters.yearFrom ?? ""}
          onChange={(e) => setYearRange(parseYear(e.target.value), filters.yearTo)}
          className={SELECT_CLS}
        >
          <option value="">시작</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-400" aria-hidden="true">
          ~
        </span>
        <select
          aria-label="학년도 끝"
          value={filters.yearTo ?? ""}
          onChange={(e) => setYearRange(filters.yearFrom, parseYear(e.target.value))}
          className={SELECT_CLS}
        >
          <option value="">끝</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* 5개 메뉴 — 항상 한 줄(flex-nowrap), 넘침 없음(각 버튼 flex-1 min-w-0, 접힌 최소 폭 40). */}
      <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 [&>button]:min-w-10" data-exam-bank-filter-menus>
        <FilterMenu
          narrowHost
          label="시험"
          title="시험"
          icon={ICON_EXAM}
          labelClassName={MENU_LABEL_CLS}
          options={exams.map((v) => ({ value: v, label: examLabel(v), count: counts?.exam[v] }))}
          selected={examSet}
          onToggle={(v) => toggleIn("exams", v)}
          onClear={() => clearKey("exams")}
        />
        <FilterMenu
          narrowHost
          label="출제기관"
          title="출제기관"
          icon={ICON_BOARD}
          labelClassName={MENU_LABEL_CLS}
          options={boards.map((v) => ({ value: v, label: v, count: counts?.board[v] }))}
          selected={boardSet}
          onToggle={(v) => toggleIn("boards", v)}
          onClear={() => clearKey("boards")}
        />
        <FilterMenu
          narrowHost
          label="학년"
          title="학년"
          icon={ICON_GRADE}
          labelClassName={MENU_LABEL_CLS}
          options={grades.map((v) => ({ value: v, label: v, count: counts?.grade[v] }))}
          selected={gradeSet}
          onToggle={(v) => toggleIn("grades", v)}
          onClear={() => clearKey("grades")}
        />
        <FilterMenu
          narrowHost
          label="유형"
          title="유형"
          icon={ICON_TYPE}
          labelClassName={MENU_LABEL_CLS}
          variant="grid"
          options={typeGroups.map((v) => ({ value: v, label: v, count: counts?.typeGroup[v] }))}
          selected={typeSet}
          onToggle={(v) => toggleIn("typeGroups", v)}
          onClear={() => clearKey("typeGroups")}
        />
        <FilterMenu
          narrowHost
          label="번호"
          title="문항 번호"
          icon={ICON_QNUM}
          labelClassName={MENU_LABEL_CLS}
          variant="grid"
          dense
          options={qNumOptions}
          selected={qNumSet}
          onToggle={toggleQNum}
          onClear={() => clearKey("qNums")}
        />
      </div>
    </div>
  );
}

export const BankInlineFilters = memo(BankInlineFiltersImpl);

/** 활성 필터 칩(값별 ×) + 「초기화」. 활성 필터가 없으면 null(줄 자체가 사라진다). */
function BankInlineActiveChipsImpl({ api }: { api: ExamBankInlineApi }) {
  const { filters, hasActiveFilters, toggleIn, toggleQNum, setYearRange, setQuery, resetFilters } = api;
  if (!hasActiveFilters) return null;

  const chips: { key: string; label: string; remove: () => void }[] = [];
  const q = filters.q.trim();
  if (q) chips.push({ key: "q", label: `“${q}”`, remove: () => setQuery("") });
  if (filters.yearFrom !== null || filters.yearTo !== null) {
    const from = filters.yearFrom;
    const to = filters.yearTo;
    const label = from !== null && to !== null ? (from === to ? `${from}학년도` : `${from}~${to}학년도`) : from !== null ? `${from}학년도~` : `~${to}학년도`;
    chips.push({ key: "years", label, remove: () => setYearRange(null, null) });
  }
  for (const v of filters.exams) chips.push({ key: `exam-${v}`, label: examLabel(v), remove: () => toggleIn("exams", v) });
  for (const v of filters.boards) chips.push({ key: `board-${v}`, label: boardChipLabel(v), remove: () => toggleIn("boards", v) });
  for (const v of filters.grades) chips.push({ key: `grade-${v}`, label: v, remove: () => toggleIn("grades", v) });
  for (const v of filters.typeGroups) chips.push({ key: `type-${v}`, label: v, remove: () => toggleIn("typeGroups", v) });
  for (const v of filters.qNums) chips.push({ key: `qnum-${v}`, label: `${v}번`, remove: () => toggleQNum(v) });

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 pb-2" data-exam-bank-active-chips>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 pl-2 pr-0.5 text-[11px] font-semibold text-blue-700"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.remove}
            aria-label={`${chip.label} 필터 제거`}
            className="flex size-4 shrink-0 items-center justify-center rounded text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={resetFilters}
        data-exam-bank-reset-filters
        className="inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="size-3" />
        초기화
      </button>
    </div>
  );
}

export const BankInlineActiveChips = memo(BankInlineActiveChipsImpl);
