"use client";

// ============================================================================
// 어법 훈련 현황 테이블 — 클릭 정렬 헤더 + 행 다중 선택 + 정체 신호.
//
// 정렬·선택 상태는 부모(grammar-lab-list-client)가 소유하고, 여기는 표시와
// 이벤트 위임만 담당한다. 행 클릭/Enter·Space 는 학생 상세 허브 어법 탭으로.
// ============================================================================

import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";

import type { GrammarLabStudentRow } from "@/actions/grammar-drill-admin";
import { StatusPill } from "@/components/layout/page-frame";
import {
  CONCEPT_SKELETON_BY_ID,
  GRAMMAR_UNITS,
} from "@/lib/grammar-drill/curriculum";
import { cn, formatRelativeTime } from "@/lib/utils";

const TOTAL_UNITS = GRAMMAR_UNITS.length; // 12

export type SortKey =
  | "recent"
  | "attempts"
  | "accuracy"
  | "units"
  | "assignments"
  | "name";
export type SortDir = "asc" | "desc";

/** 헤더 최초 클릭 시 적용할 기본 방향 — 두 번째 클릭부터 토글 */
export const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  recent: "desc",
  attempts: "desc",
  accuracy: "asc", // 개입 우선순위 — 정답률 낮은 학생 먼저
  units: "desc",
  assignments: "desc",
  name: "asc",
};

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** 정체 학생 — 학습 이력은 있는데 7일 이상 무활동(개입 신호) */
export function isStalled(row: GrammarLabStudentRow): boolean {
  return (
    row.totalAttempts > 0 &&
    row.lastActiveAt !== null &&
    daysSince(row.lastActiveAt) >= 7
  );
}

function lastActiveMs(row: GrammarLabStudentRow): number {
  return row.lastActiveAt ? new Date(row.lastActiveAt).getTime() : 0;
}

export function sortRows(
  rows: GrammarLabStudentRow[],
  key: SortKey,
  dir: SortDir,
): GrammarLabStudentRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = [...rows];
  switch (key) {
    case "attempts":
      sorted.sort((a, b) => sign * (a.totalAttempts - b.totalAttempts));
      break;
    case "accuracy":
      // 이력 없는(null) 학생은 방향과 무관하게 항상 뒤로
      sorted.sort((a, b) => {
        if ((a.accuracy === null) !== (b.accuracy === null))
          return a.accuracy === null ? 1 : -1;
        return sign * ((a.accuracy ?? 0) - (b.accuracy ?? 0));
      });
      break;
    case "units":
      sorted.sort((a, b) => sign * (a.unitsMastered - b.unitsMastered));
      break;
    case "assignments":
      sorted.sort((a, b) => sign * (a.openAssignments - b.openAssignments));
      break;
    case "name":
      sorted.sort((a, b) => sign * a.name.localeCompare(b.name, "ko"));
      break;
    default:
      sorted.sort((a, b) => sign * (lastActiveMs(a) - lastActiveMs(b)));
  }
  return sorted;
}

function accuracyBarClass(accuracy: number): string {
  if (accuracy >= 70) return "bg-emerald-500";
  if (accuracy < 50) return "bg-rose-500";
  return "bg-blue-500";
}

function accuracyTextClass(accuracy: number): string {
  if (accuracy >= 70) return "text-emerald-600";
  if (accuracy < 50) return "text-rose-600";
  return "text-slate-600";
}

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onSortChange,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      className="px-4 py-2.5 font-medium"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSortChange(k)}
        className={cn(
          "inline-flex items-center gap-1 rounded outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-300",
          active && "text-blue-600",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="size-3" aria-hidden />
          ) : (
            <ChevronDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}

export function GrammarLabTable({
  rows,
  sortKey,
  sortDir,
  onSortChange,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
  onOpenWeakestPopover,
  emptyMessage,
}: {
  /** 필터·정렬이 이미 적용된 표시 행 */
  rows: GrammarLabStudentRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;
  selected: Set<string>;
  onToggleSelect: (studentId: string) => void;
  /** 현재 표시 행 전체 선택/해제 */
  onToggleSelectAll: () => void;
  onRowClick: (studentId: string) => void;
  onOpenWeakestPopover: (
    e: React.MouseEvent<HTMLButtonElement>,
    row: GrammarLabStudentRow,
  ) => void;
  emptyMessage: string;
}) {
  const allSelected =
    rows.length > 0 && rows.every((s) => selected.has(s.studentId));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1024px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-[12px] text-slate-500">
            <th className="w-10 px-3 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="표시된 학생 전체 선택"
                className="size-3.5 accent-blue-600"
              />
            </th>
            <SortableTh label="학생" k="name" sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
            <SortableTh label="누적 풀이" k="attempts" sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
            <SortableTh label="정답률" k="accuracy" sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
            <SortableTh label="유닛 진행" k="units" sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
            <th className="px-4 py-2.5 font-medium">취약 개념</th>
            <SortableTh label="미완료 배정" k="assignments" sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
            <SortableTh label="최근 학습" k="recent" sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange} />
            <th className="w-9 px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-14 text-center text-[13px] text-slate-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((s) => (
              <tr
                key={s.studentId}
                onClick={() => onRowClick(s.studentId)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  if (e.target !== e.currentTarget) return; // 내부 컨트롤 포커스는 제외
                  e.preventDefault();
                  onRowClick(s.studentId);
                }}
                className="group cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-blue-50/40 focus-visible:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300"
              >
                <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.studentId)}
                    onChange={() => onToggleSelect(s.studentId)}
                    aria-label={`${s.name} 선택`}
                    className="size-3.5 accent-blue-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/director/students/${s.studentId}?tab=grammar`}
                    onClick={(e) => e.stopPropagation()}
                    className="block min-w-0"
                  >
                    <p className="truncate font-semibold text-slate-800">
                      {s.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {s.grade}학년 · {s.studentCode}
                    </p>
                    {s.classes.length > 0 ? (
                      <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-400">
                        {s.classes.map((c) => c.name).join(" · ")}
                      </p>
                    ) : null}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">
                  {s.totalAttempts > 0 ? (
                    s.totalAttempts.toLocaleString()
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.accuracy === null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            accuracyBarClass(s.accuracy),
                          )}
                          style={{ width: `${s.accuracy}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-[12px] font-semibold tabular-nums",
                          accuracyTextClass(s.accuracy),
                        )}
                      >
                        {s.accuracy}%
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.unitsStarted === 0 ? (
                    <span className="text-slate-300">미시작</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{
                              width: `${Math.min(100, Math.round((s.unitsMastered / TOTAL_UNITS) * 100))}%`,
                            }}
                          />
                        </div>
                        <span className="text-[12px] tabular-nums text-slate-600">
                          <span className="font-semibold text-slate-800">
                            {s.unitsMastered}
                          </span>
                          /{TOTAL_UNITS}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        마스터 · 진입 {s.unitsStarted}유닛
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.weakest ? (
                    <button
                      type="button"
                      onClick={(e) => onOpenWeakestPopover(e, s)}
                      className="inline-flex max-w-[220px] cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                      title={
                        CONCEPT_SKELETON_BY_ID.get(s.weakest.conceptId)
                          ?.oneLiner ?? s.weakest.title
                      }
                    >
                      <span className="truncate">{s.weakest.title}</span>
                      <span className="shrink-0 rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold tabular-nums text-rose-600">
                        {s.weakest.score}점
                      </span>
                    </button>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.openAssignments > 0 ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <StatusPill tone="blue" pulse>
                        {s.openAssignments}건
                      </StatusPill>
                      {s.oldestOpenAssignmentAt &&
                        daysSince(s.oldestOpenAssignmentAt) >= 1 && (
                          <span className="whitespace-nowrap text-[11px] text-slate-400">
                            최장 {daysSince(s.oldestOpenAssignmentAt)}일 경과
                          </span>
                        )}
                    </div>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-500">
                  {s.lastActiveAt ? (
                    <div className="flex flex-col items-start gap-1">
                      <span>{formatRelativeTime(s.lastActiveAt)}</span>
                      {isStalled(s) ? (
                        <StatusPill tone="rose">
                          {daysSince(s.lastActiveAt)}일 무활동
                        </StatusPill>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-2 py-3">
                  <ChevronRight
                    className="size-4 text-slate-300 transition-colors group-hover:text-blue-500"
                    aria-hidden
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
