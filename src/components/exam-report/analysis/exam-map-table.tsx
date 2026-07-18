"use client";

// ============================================================================
// 채점 지도(ExamMap) — 시안 B(채점 지도 주인공). 강사가 AI 가 뽑은 정답·배점을
// **실제로 검증**하는 화면이며, 문항별 「확인」이 학생 관리 게이트의 유일한 근거다.
//
// 설계 근거(핸드오프 스펙):
//  - 「전체 검수 완료」류 일괄 확인 버튼 금지 — 22번 확인을 한 방에 없애면 아무도
//    검증하지 않게 된다. 확인은 행 단위(또는 Enter)로만.
//  - 배점 미추출 최악 케이스(22문항 0점) 대응: 종류별 일괄 입력 + **부분 합계**.
//    부분 합계는 **표시 전용** 계산이다 — 저장 총점(B1: 전 문항 non-null 일 때만
//    신뢰)은 서버 규칙 그대로 두어야 과거 총점 파괴 버그가 부활하지 않는다.
//  - "확인 필요"는 파랑(주황/앰버 금지), 확인 액션은 초록(워크벤치 버튼 색 규칙).
//  - 번호 칩 고정폭 금지 — "서답형 3" 류 다글자 번호가 세로로 깨진다(전역 원칙).
// ============================================================================

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  CircleCheck,
  ImageIcon,
  ListFilter,
  Loader2,
  Search,
  Wand2,
  X,
} from "lucide-react";
import type { ExamMapEntry, ExamQuestionKind } from "@/lib/exam-report/types";
import type { SaveState } from "./use-analysis-persistence";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ExamSourceFile } from "../ui-contracts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

const KIND_LABEL: Record<ExamQuestionKind, string> = {
  MC: "객관식",
  SHORT: "단답형",
  ESSAY: "서술형",
};

/** 표시 전용 소수 2자리 반올림 — 부동소수 합산이 "99.99999999999999점"으로 새는
 *  것을 화면에서만 정리한다(저장값·집계값은 건드리지 않는다). */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

type StatusFilter = "all" | "pending" | "confirmed" | "failed";

// ── 헤더 정렬 ───────────────────────────────────────────────────────────────
// 번호·유형·배점 = 값 오름/내림차순, 종류·검수 = 같은 값끼리 그룹(순서 정/역).
// 클릭 사이클: 오름 → 내림 → 해제(기본 = 시험지 순서). 정답 열은 정렬 없음.

type SortKey = "number" | "kind" | "type" | "points" | "review";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const KIND_ORDER: Record<ExamQuestionKind, number> = {
  MC: 0,
  SHORT: 1,
  ESSAY: 2,
};

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-2 py-2.5 font-medium",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap transition-colors hover:text-slate-800",
          active && "font-semibold text-slate-800",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ChevronsUpDown className="size-3 text-slate-300" />
        )}
      </button>
    </th>
  );
}

interface ExamMapTableProps {
  entries: ExamMapEntry[];
  /** 정답·배점 확인 완료 문항 번호 — 학생 관리 게이트의 근거 */
  confirmedNumbers: string[];
  /** 레거시 승계로 게이트가 열린 건 — 확인을 새로 강요하지 않는다 */
  grandfathered?: boolean;
  /** 분석 중 편집 잠금(저장은 더 이상 입력을 막지 않는다) */
  disabled: boolean;
  /** 저장 상태 — 잠금이 아니라 표시용 */
  saveState?: SaveState;
  /** E1 분석 진행 중 — 정답이 아직 없는 행에 '분석 중' 표시(정답은 E1b 도출). */
  analyzing?: boolean;
  /** 시험지 원본 대조용(정답 확인 필요 행 검토) — 분석 sourceFiles. */
  sourceFiles: ExamSourceFile[];
  /** 시험지 원본 분할 패널 토글 — 패널 자체는 상위(analysis-step)가 렌더. */
  sourcesOpen: boolean;
  onToggleSources: () => void;
  /** 분석 실패 문항 번호 — 상태점(빨강)·'분석 실패' 필터 근거 */
  failedNumbers?: string[];
  /** 현재 우측 패널에 열린 문항 */
  selectedNumber?: string | null;
  onEdit: (number: string, patch: Partial<ExamMapEntry>) => void;
  onToggleConfirm: (numbers: string[], confirmed: boolean) => void;
  onSelectNumber?: (number: string) => void;
}

/** 저장 상태 표시 — 입력을 막지 않고 "저장됨/저장 중/실패"만 조용히 알린다. */
function SaveIndicator({ state }: { state?: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        저장 중
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-700">
        <AlertCircle className="h-3 w-3" />
        저장 실패
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] text-slate-400">
      <Check className="h-3 w-3 text-emerald-500" />
      자동 저장됨
    </span>
  );
}

/** 상태 필터 필 — 어드민 필터 규약(Toss형 rounded-full, 활성 slate-900) 톤. */
function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-colors",
        active
          ? "bg-slate-900 text-white"
          : "cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200",
      )}
    >
      {label}
      <span
        className={cn(
          "text-[11px] tabular-nums",
          active ? "text-white/70" : "text-slate-400",
        )}
      >
        {count}
      </span>
    </button>
  );
}

/** 행 선택 체크박스 — 시험지 관리 카드의 18px 사각 체크박스 규격(선택=파랑). */
function RowCheckbox({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded transition-all disabled:cursor-not-allowed disabled:opacity-40",
        checked
          ? "border border-blue-600 bg-blue-600 text-white"
          : "border border-slate-300 bg-white text-transparent hover:border-blue-400 hover:text-blue-400",
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}

export function ExamMapTable({
  entries,
  confirmedNumbers,
  grandfathered = false,
  disabled,
  saveState,
  analyzing = false,
  sourceFiles,
  sourcesOpen,
  onToggleSources,
  failedNumbers = [],
  selectedNumber = null,
  onEdit,
  onToggleConfirm,
  onSelectNumber,
}: ExamMapTableProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("all");
  // 일괄 검수용 선택 — 행 체크박스로 고른 문항 번호. (행 로컬 selected=패널
  // 열림 여부와 다른 축이라 이름을 구분한다.)
  const [checkedRows, setCheckedRows] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<SortState>(null);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev?.key !== key
        ? { key, dir: "asc" }
        : prev.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  };

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.order - b.order),
    [entries],
  );

  const confirmedSet = useMemo(
    () => new Set(confirmedNumbers.map(numberKey)),
    [confirmedNumbers],
  );
  const failedSet = useMemo(
    () => new Set(failedNumbers.map(numberKey)),
    [failedNumbers],
  );
  const isConfirmed = (e: ExamMapEntry) =>
    grandfathered || confirmedSet.has(numberKey(e.number));

  // 부분 합계(표시 전용) — 입력된 배점만 먼저 더한다. 저장 총점은 B1 규칙을 따르므로
  // 전 문항이 채워지기 전까지 서버 총점은 갱신되지 않는다(그래서 화면에서 계산한다).
  const enteredPoints = sorted.filter((e) => e.points != null);
  const partialSum = round2(
    enteredPoints.reduce((sum, e) => sum + (e.points ?? 0), 0),
  );
  const missingPoints = sorted.length - enteredPoints.length;
  const confirmedCount = sorted.filter(isConfirmed).length;

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of sorted) set.add(e.typeLabel || "유형 미상");
    return [...set];
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((e) => {
      if (typeFilter !== "ALL" && (e.typeLabel || "유형 미상") !== typeFilter) {
        return false;
      }
      if (status === "confirmed" && !isConfirmed(e)) return false;
      if (status === "pending" && isConfirmed(e)) return false;
      if (status === "failed" && !failedSet.has(numberKey(e.number))) return false;
      if (!q) return true;
      return `${e.number} ${e.typeLabel ?? ""} ${e.brief ?? ""} ${e.correctAnswer ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, query, typeFilter, status, confirmedSet, failedSet, grandfathered]);

  // 헤더 정렬 적용 — 동률은 항상 시험지 순서(order)로 안정화한다.
  const displayed = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    const confirmedRank = (e: ExamMapEntry) =>
      grandfathered || confirmedSet.has(numberKey(e.number)) ? 1 : 0;
    const cmp = (a: ExamMapEntry, b: ExamMapEntry): number => {
      switch (sort.key) {
        case "number":
          return (a.order - b.order) * dir;
        case "kind":
          return (
            (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) * dir || a.order - b.order
          );
        case "type":
          return (
            (a.typeLabel || "유형 미상").localeCompare(
              b.typeLabel || "유형 미상",
              "ko",
            ) * dir || a.order - b.order
          );
        case "points": {
          // 미입력(null)은 방향과 무관하게 항상 마지막 — 입력 대상이 묻히지 않게.
          if (a.points == null && b.points == null) return a.order - b.order;
          if (a.points == null) return 1;
          if (b.points == null) return -1;
          return (a.points - b.points) * dir || a.order - b.order;
        }
        case "review":
          // 오름 = 미검수 먼저(할 일 우선), 내림 = 검수됨 먼저.
          return (
            (confirmedRank(a) - confirmedRank(b)) * dir || a.order - b.order
          );
      }
    };
    return [...filtered].sort(cmp);
  }, [filtered, sort, confirmedSet, grandfathered]);

  /** 확인 후 다음 미확인 행의 배점 칸으로 포커스를 옮긴다(Enter 흐름). */
  const focusNextRow = (fromNumber: string) => {
    const idx = displayed.findIndex((e) => e.number === fromNumber);
    const next = displayed.slice(idx + 1).find((e) => !isConfirmed(e));
    if (!next) return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-map-row="${CSS.escape(next.number)}"] [data-cell="points"]`,
      );
      el?.focus();
      el?.select();
    });
  };

  const confirmRow = (e: ExamMapEntry) => {
    if (!isConfirmed(e)) onToggleConfirm([e.number], true);
    focusNextRow(e.number);
  };

  // ── 일괄 검수 선택 ────────────────────────────────────────────────────────
  // 전체선택은 **화면에 보이는(필터 적용된) 행**만 대상으로 한다 — 필터를 걸어
  // 좁혀놓고 전체선택했는데 안 보이는 행까지 검수되면 사고다.
  // 실효 선택 = 체크된 행 ∪ 현재 우측 패널에 열린 행(selectedNumber).
  // "열린 행"은 곧 선택된 행이므로 체크 표시·일괄 대상에 함께 포함해, 체크만 되고
  // 일괄에선 빠지는 오해를 없앤다.
  const isRowSelected = (number: string) =>
    checkedRows.has(number) || number === selectedNumber;
  const selectedCount =
    checkedRows.size +
    (selectedNumber && !checkedRows.has(selectedNumber) ? 1 : 0);

  const toggleRow = (number: string) => {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((e) => isRowSelected(e.number));
  const toggleAllVisible = () => {
    setCheckedRows((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const e of filtered) next.delete(e.number);
      else for (const e of filtered) next.add(e.number);
      return next;
    });
  };
  const bulkConfirm = () => {
    const target = new Set(checkedRows);
    if (selectedNumber) target.add(selectedNumber);
    if (target.size === 0) return;
    onToggleConfirm([...target], true);
    setCheckedRows(new Set());
  };

  return (
    // data-exam-map-panel: 학생 관리 게이트에 막힌 클릭이 "여기부터 하세요"로
    // 시선을 끌 때의 힌트 글로우 대상(workspace-client handleGateBlocked).
    // 높이: h-full 로 부모(분석 스텝의 지도+총평 행)가 준 높이를 채우되,
    // max-h-[calc(100vh-2rem)] 상한으로 우측 패널과 아래 끝선을 맞춘다.
    // 문항이 적으면 내용만큼만 차지한다(상한이지 고정 높이가 아니다).
    <section
      data-exam-map-panel=""
      className="flex h-full max-h-[calc(100vh-2rem)] min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      {/* 헤더 — 제목 + 미입력 고지 + 부분 합계 + 저장 상태 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <h3 className="text-[14px] font-bold text-slate-900">채점 지도</h3>
        {missingPoints > 0 && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-bold text-blue-700">
            배점 {missingPoints}개 미입력
          </span>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          <span className="whitespace-nowrap text-[11px] text-slate-400">
            {missingPoints > 0 ? "입력한 문항만 먼저 합산 ·" : "합계"}
          </span>
          <span className="whitespace-nowrap text-[15px] font-extrabold tabular-nums text-slate-900">
            {partialSum}점
          </span>
          <SaveIndicator state={saveState} />
        </div>
      </div>

      {/* 툴바 — 좌: 배점 일괄 입력 / 우: 필터·검색 아이콘 팝오버(분석 현황
          보드와 동일 규격: size-7 + 활성 파란 점). 유형 드롭다운·상태 필은
          필터 팝오버 안으로 접는다(유형 라벨은 AI 생성이라 거의 고유 → 칩 벽 금지). */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        {/* 전체선택 — 화면에 보이는(필터된) 행만 대상. 일괄 액션(배점 입력·검수)
            바로 왼쪽에 두어 "고르고 → 적용" 흐름이 좌→우로 읽히게 한다. */}
        <div className="flex h-7 shrink-0 items-center pr-0.5">
          <RowCheckbox
            checked={allVisibleSelected}
            disabled={disabled || filtered.length === 0}
            onChange={toggleAllVisible}
            ariaLabel="전체 선택"
          />
        </div>

        <BulkPointsPopover
          entries={sorted}
          selectedNumbers={[...checkedRows]}
          disabled={disabled}
          onApply={(numbers, points) => {
            for (const n of numbers) onEdit(n, { points });
          }}
        />

        {/* 일괄 검수 완료 — 체크박스로 고른 문항을 한 번에 검수. 선택이 없으면
            비활성. 문제 관리 툴바의 「검수완료」 버튼과 동일 규격:
            h-7 · text-[11px] font-semibold · shadow-sm · 초록 아웃라인. */}
        <button
          type="button"
          disabled={disabled || selectedCount === 0}
          onClick={bulkConfirm}
          title={
            selectedCount === 0
              ? "검수할 문항을 선택하세요"
              : `선택한 ${selectedCount}문항 검수완료`
          }
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-500 bg-white px-2.5 text-[11px] font-semibold text-emerald-600 shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CircleCheck className="h-3.5 w-3.5" />
          검수완료
          {selectedCount > 0 && (
            <span className="tabular-nums">{selectedCount}</span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-1.5">
        {/* 시험지 원본 분할 패널 토글 — 패널 자체는 상위(analysis-step)가 렌더.
            자료 계열 버튼이라 활성색은 파랑(워크벤치 버튼 색 규칙). 툴바의 다른
            버튼(검수완료)과 동일 규격: h-7 · text-[11px] · font-semibold. */}
        {sourceFiles.length > 0 && (
          <button
            type="button"
            onClick={onToggleSources}
            aria-pressed={sourcesOpen}
            title="시험지 원본 대조"
            className={cn(
              "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors",
              sourcesOpen
                ? "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-input bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            시험지 원본
          </button>
        )}
        {/* 필터 — 유형 + 상태(개수 포함) */}
        <Popover>
          <PopoverTrigger
            title="필터"
            aria-label="필터"
            className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ListFilter className="size-3.5 shrink-0" />
            {(typeFilter !== "ALL" || status !== "all") && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
              />
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-600">
                  유형
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600 shadow-xs outline-none focus:border-blue-400"
                >
                  <option value="ALL">유형 전체</option>
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-600">
                  상태
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <FilterPill
                    label="전체"
                    count={sorted.length}
                    active={status === "all"}
                    onClick={() => setStatus("all")}
                  />
                  <FilterPill
                    label="미검수"
                    count={sorted.length - confirmedCount}
                    active={status === "pending"}
                    onClick={() => setStatus("pending")}
                  />
                  <FilterPill
                    label="검수됨"
                    count={confirmedCount}
                    active={status === "confirmed"}
                    onClick={() => setStatus("confirmed")}
                  />
                  {failedSet.size > 0 && (
                    <FilterPill
                      label="분석 실패"
                      count={failedSet.size}
                      active={status === "failed"}
                      onClick={() => setStatus("failed")}
                    />
                  )}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* 검색 — 번호·유형·정답(로컬 즉시 필터) */}
        <Popover>
          <PopoverTrigger
            title="검색"
            aria-label="검색"
            className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Search className="size-3.5 shrink-0" />
            {query && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
              />
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-600">
                검색
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="번호 · 유형 · 정답 검색"
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pr-7 pl-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="검색 지우기"
                    onClick={() => setQuery("")}
                    className="absolute top-1/2 right-1.5 inline-flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </div>

      {/* 내부 스크롤 + sticky 헤더. xl+ 에서는 행 높이(뷰포트 기준)를 flex-1 로 꽉
          채워 7~8행만 보이던 답답함 제거(유저 피드백) — 60vh 고정 캡은 xl 미만
          (행 높이 미지정)에서만 유지한다.
          sticky 는 th 단위 적용(thead 적용 시 브라우저별 배경/보더 유실 방지). */}
      <div className="max-h-[70vh] min-h-0 flex-1 overflow-x-auto overflow-y-auto xl:max-h-none">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-500">
              {/* 체크박스 열 — 전체선택은 툴바로 옮겼고, 여기선 행 체크박스와의
                  열 정렬만 유지한다(헤더 셀은 비움). */}
              <th
                className="sticky top-0 z-10 w-9 border-b border-slate-100 bg-slate-50 px-2 py-2.5"
                aria-label="선택"
              />
              {/* 번호 컬럼 고정폭(w-16) 금지 — "서답형 3" 류 다글자 번호가 한 글자씩
                  세로로 깨지던 원인. 칩 nowrap + 자동폭으로 콘텐츠에 맞춘다. */}
              <SortableTh
                label="번호"
                sortKey="number"
                sort={sort}
                onSort={toggleSort}
                className="whitespace-nowrap"
              />
              <SortableTh
                label="종류"
                sortKey="kind"
                sort={sort}
                onSort={toggleSort}
                className="w-24"
              />
              <SortableTh
                label="유형 · 발문"
                sortKey="type"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTh
                label="배점"
                sortKey="points"
                sort={sort}
                onSort={toggleSort}
                className="w-[76px]"
              />
              <th className="sticky top-0 z-10 w-[168px] border-b border-slate-100 bg-slate-50 px-2 py-2.5 font-medium">
                정답
              </th>
              <SortableTh
                label="검수"
                sortKey="review"
                sort={sort}
                onSort={toggleSort}
                className="w-[62px]"
              />
            </tr>
          </thead>
          <tbody>
            {displayed.map((e) => {
              const low = e.answerConfidence === "LOW";
              const failed = failedSet.has(numberKey(e.number));
              const confirmed = isConfirmed(e);
              const selected = selectedNumber === e.number;
              return (
                <tr
                  key={e.number}
                  data-map-row={e.number}
                  onClick={() => onSelectNumber?.(e.number)}
                  className={cn(
                    "relative border-b border-slate-50 align-middle transition-colors last:border-0",
                    // 미검수 = 옅은 분홍으로 **행 전체** 표시(앱 규약: 미검수=분홍).
                    // 아직 손대지 않은 문항이 스캔만으로 바로 눈에 들어오게 한다.
                    !confirmed
                      ? "bg-rose-50/70 hover:bg-rose-50"
                      : selected
                        ? "bg-blue-50/50"
                        : "hover:bg-slate-50/80",
                    selected && "z-10 bg-blue-50/50",
                  )}
                  // 선택(열린) 행 = **사방 파란 테두리**(inset ring). arbitrary
                  // box-shadow 는 turbopack JIT 함정이 있어 인라인 style 로 못박는다.
                  // 배경(미검수 분홍)은 그대로 두고 테두리로만 선택을 얹어, 열어봐도
                  // "미검수"라는 사실이 사라지지 않는다.
                  style={
                    selected
                      ? { boxShadow: "inset 0 0 0 2px #3B82F6" }
                      : undefined
                  }
                >
                  {/* 일괄 검수 선택 체크박스 — 행 클릭(패널 열기)과 충돌하지 않게
                      stopPropagation. */}
                  <td
                    className="px-2 py-2 text-center"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <RowCheckbox
                      checked={isRowSelected(e.number)}
                      disabled={disabled}
                      onChange={() => toggleRow(e.number)}
                      ariaLabel={`${e.number}번 선택`}
                    />
                  </td>
                  {/* (상태 점 제거) 검수 상태는 우측 「검수」 버튼이 이미 말해준다
                      — 초록 테두리=검수완료 / 분홍=미검수. 점은 중복이었다.
                      분석 실패만 유형 칸 칩으로 남긴다(다른 축이라 신호가 필요). */}
                  <td className="px-2 py-2">
                    {/* 번호 칩은 반드시 nowrap — 다글자 번호 줄바꿈 깨짐 방지(전역 원칙). */}
                    <span className="inline-flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 text-[11.5px] font-bold tabular-nums text-slate-700">
                      {e.number}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={e.kind}
                      disabled={disabled}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(ev) =>
                        onEdit(e.number, {
                          kind: ev.target.value as ExamQuestionKind,
                        })
                      }
                      className="h-7 w-full rounded-md border border-slate-200 bg-white px-1.5 text-xs font-semibold text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:opacity-50"
                    >
                      {(["MC", "SHORT", "ESSAY"] as ExamQuestionKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <div className="truncate text-xs font-bold text-slate-800">
                      {e.typeLabel || <span className="text-slate-400">유형 미상</span>}
                    </div>
                    {e.brief && (
                      <div
                        className="mt-0.5 truncate text-[11px] text-slate-400"
                        style={{ fontFamily: EXAM_FONT }}
                        title={e.brief}
                      >
                        {e.brief}
                      </div>
                    )}
                    {failed && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-medium text-rose-700">
                        분석 실패 · 눌러서 재분석
                      </div>
                    )}
                    {low && !confirmed && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-700">
                        정답 검수 필요
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <NumberCell
                      value={e.points}
                      disabled={disabled}
                      onCommit={(next) => onEdit(e.number, { points: next })}
                      onEnter={() => confirmRow(e)}
                    />
                  </td>
                  <td className="px-2 py-2">
                    {analyzing && !e.correctAnswer ? (
                      // 정답은 E1b 가 도출한다 — 아직 없는 행은 '분석 중'으로 표시.
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
                        분석 중
                      </span>
                    ) : (
                      <TextCell
                        value={e.correctAnswer ?? ""}
                        disabled={disabled}
                        placeholder={e.kind === "MC" ? "1~5" : "모범답"}
                        onCommit={(next) =>
                          onEdit(e.number, { correctAnswer: next || undefined })
                        }
                        onEnter={() => confirmRow(e)}
                      />
                    )}
                  </td>
                  {/* (분석 열 제거) 행을 클릭하면 우측 패널이 열리므로 별도 열이
                      불필요하다. 실패 문항의 「재분석(무료)」도 그 패널이 제공한다. */}
                  {/* 검수 — 게이트의 유일한 근거. 문제 은행 카드의 검수완료 버튼과
                      동일 규격: 배경은 항상 흰색, 검수완료=초록 테두리, 미검수=분홍
                      (hover 시 초록으로 미리보기 → 떼면 복귀). */}
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-pressed={confirmed}
                      aria-label={confirmed ? "검수완료" : "검수필요"}
                      title={
                        grandfathered
                          ? "이전에 검수된 시험지예요"
                          : confirmed
                            ? "검수완료 — 누르면 검수를 취소합니다"
                            : "검수필요 — 누르면 검수완료로 표시합니다"
                      }
                      disabled={disabled}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onToggleConfirm([e.number], !confirmed);
                      }}
                      className={cn(
                        "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        confirmed
                          ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600",
                      )}
                    >
                      <CircleCheck className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <p className="text-[12.5px] font-medium text-slate-500">
                    조건에 맞는 문항이 없습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setTypeFilter("ALL");
                      setStatus("all");
                    }}
                    className="mt-2 text-[12px] font-semibold text-blue-600 hover:underline"
                  >
                    필터 초기화
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 키보드 힌트 — 저장을 기다릴 필요가 없다는 걸 명시(잠금 없음) */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-400">
        <span>
          <Kbd>Enter</Kbd> 검수 후 다음 행
        </span>
        <span>
          <Kbd>Tab</Kbd> 다음 칸
        </span>
        <span>저장을 기다리지 않아도 돼요 — 입력은 잠기지 않고 자동 저장됩니다</span>
      </div>
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block rounded border border-b-2 border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600">
      {children}
    </kbd>
  );
}

// ── 배점 일괄 입력 ───────────────────────────────────────────────────────────
// 배점이 통째로 미추출된 최악 케이스(22문항 0점)에서 22번 수동 입력을 피하게 한다.
// 적용 범위 2가지: (1) 종류별 전체(객관식/단답·서술) (2) 체크박스로 고른 문항만.
// onApply 는 대상 번호 목록을 명시적으로 받아 호출부가 그 문항들만 갱신한다.
function BulkPointsPopover({
  entries,
  selectedNumbers,
  disabled,
  onApply,
}: {
  entries: ExamMapEntry[];
  /** 체크박스로 선택된 문항 번호 — 있으면 "선택 범위" 모드가 열린다 */
  selectedNumbers: string[];
  disabled: boolean;
  onApply: (numbers: string[], points: number) => void;
}) {
  const hasSelection = selectedNumbers.length > 0;
  // 선택이 있으면 기본은 "선택 범위"(방금 고른 걸 바로 쓰려는 의도), 없으면 종류별.
  const [scope, setScope] = useState<"kind" | "selected">(
    hasSelection ? "selected" : "kind",
  );
  const [mcPoints, setMcPoints] = useState("");
  const [subPoints, setSubPoints] = useState("");
  const [selPoints, setSelPoints] = useState("");

  const mcNumbers = entries.filter((e) => e.kind === "MC").map((e) => e.number);
  const subNumbers = entries.filter((e) => e.kind !== "MC").map((e) => e.number);
  const num = (v: string) => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const mcNum = num(mcPoints);
  const subNum = num(subPoints);
  const selNum = num(selPoints);

  // 열 때마다 현재 선택 유무에 맞춰 기본 모드를 재설정(닫았다 다시 열면 최신 의도 반영).
  const onOpenChange = (open: boolean) => {
    if (open) setScope(hasSelection ? "selected" : "kind");
  };

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {/* 옆 「검수완료」 버튼과 동일 규격(h-7 · text-[11px] · px-2.5 · 아이콘
            h-3.5). 확인 액션이 아니라 도구라 초록 대신 슬레이트 아웃라인. */}
        <button
          type="button"
          disabled={disabled}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" />
          배점 일괄 입력
          {hasSelection && (
            <span className="tabular-nums text-blue-600">
              {selectedNumbers.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[290px] p-3.5">
        <h5 className="mb-2.5 text-[12px] font-extrabold text-slate-900">
          배점 일괄 입력
        </h5>

        {/* 적용 범위 세그먼트 — 선택된 문항이 있을 때만 노출(없으면 종류별만). */}
        {hasSelection && (
          <div className="mb-2.5 flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {(
              [
                ["selected", `선택 ${selectedNumbers.length}문항`],
                ["kind", "종류별 전체"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={scope === key}
                onClick={() => setScope(key)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors",
                  scope === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "cursor-pointer text-slate-500 hover:text-slate-700",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {scope === "kind" ? (
          <>
            <div className="flex flex-col gap-2">
              <BulkRow
                label={`객관식 ${mcNumbers.length}문항`}
                value={mcPoints}
                onChange={setMcPoints}
                total={mcNum != null ? round2(mcNum * mcNumbers.length) : null}
              />
              <BulkRow
                label={`단답·서술 ${subNumbers.length}문항`}
                value={subPoints}
                onChange={setSubPoints}
                total={subNum != null ? round2(subNum * subNumbers.length) : null}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={mcNum == null && subNum == null}
              onClick={() => {
                if (mcNum != null) onApply(mcNumbers, mcNum);
                if (subNum != null) onApply(subNumbers, subNum);
              }}
              className="mt-3 h-8 w-full bg-slate-900 text-[11.5px] font-bold hover:bg-slate-800"
            >
              {entries.length}개 문항에 적용
            </Button>
          </>
        ) : (
          <>
            <BulkRow
              label={`선택한 ${selectedNumbers.length}문항`}
              value={selPoints}
              onChange={setSelPoints}
              total={selNum != null ? round2(selNum * selectedNumbers.length) : null}
            />
            <Button
              type="button"
              size="sm"
              disabled={selNum == null}
              onClick={() => {
                if (selNum != null) onApply(selectedNumbers, selNum);
              }}
              className="mt-3 h-8 w-full bg-slate-900 text-[11.5px] font-bold hover:bg-slate-800"
            >
              선택 {selectedNumbers.length}개 문항에 적용
            </Button>
          </>
        )}

        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          적용 후에도 문항별로 수정할 수 있어요. 합계가 목표 점수와 다르면 헤더의
          합계로 바로 확인됩니다.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function BulkRow({
  label,
  value,
  onChange,
  total,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  total: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-600">
      <span className="whitespace-nowrap">{label}</span>
      <span className="flex-1" />
      <span className="text-slate-400">×</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="—"
        className="h-6 w-11 rounded-md border border-slate-200 bg-blue-50/50 text-center text-[12px] font-bold tabular-nums text-blue-700 outline-none focus:border-blue-400"
      />
      <span className="whitespace-nowrap text-slate-400">점</span>
      {total != null && (
        <span className="w-12 text-right text-[11.5px] font-bold tabular-nums text-slate-700">
          {total}점
        </span>
      )}
    </div>
  );
}

// ── 인라인 편집 셀(blur 커밋 + Enter 확인) ──────────────────────────────────

function NumberCell({
  value,
  disabled,
  onCommit,
  onEnter,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (next: number | null) => void;
  onEnter?: () => void;
}) {
  // 표시 전용 반올림 — 저장값이 부동소수여도 셀에는 정리된 값을 보인다.
  const initial = value == null ? "" : String(round2(value));
  const [draft, setDraft] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    setDraft(initial);
  }
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === synced.trim()) return;
    const parsed = trimmed === "" ? null : Number(trimmed);
    // 배점은 음수가 될 수 없다 — 음수 입력은 0 으로 바닥 처리(총점 오염 방지).
    const next =
      parsed != null && Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    setSynced(next == null ? "" : String(next));
    setDraft(next == null ? "" : String(next));
    onCommit(next);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      data-cell="points"
      value={draft}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        commit();
        onEnter?.();
      }}
      className={cn(
        "h-7 w-full rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:opacity-50",
        // 미입력 = "확인 필요"는 파랑(주황/앰버 금지)
        draft.trim() === ""
          ? "border-blue-300 bg-blue-50/50 placeholder:font-semibold placeholder:text-blue-400"
          : "border-slate-200",
      )}
      placeholder="0"
    />
  );
}

function TextCell({
  value,
  disabled,
  placeholder,
  onCommit,
  onEnter,
}: {
  value: string;
  disabled: boolean;
  placeholder?: string;
  onCommit: (next: string) => void;
  onEnter?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const commit = () => {
    const next = draft.trim();
    if (next === synced.trim()) return;
    setSynced(next);
    setDraft(next);
    onCommit(next);
  };
  return (
    <input
      type="text"
      data-cell="answer"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        commit();
        onEnter?.();
      }}
      className={cn(
        "h-7 w-full rounded-md border bg-white px-1.5 text-[12.5px] text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:opacity-50",
        draft.trim() === ""
          ? "border-blue-300 bg-blue-50/50 placeholder:font-semibold placeholder:text-blue-400"
          : "border-slate-200",
      )}
    />
  );
}
