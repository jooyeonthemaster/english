"use client";

// ============================================================================
// 과제 목록 패널·행 카드 — 과제 관리 보드(assignments-board-client) 우측 목록
//
// 보드 본체의 500줄 계약 압박으로 목록 계층 전체를 분리했다:
//  - AssignmentListPanel: 카운트 행(선택 날짜 칩·정렬 세그먼트)+핀 그룹+목록
//  - AssignmentListCard: 행 카드(순수 프레젠테이션, 클릭 → onOpen)
//  - compareBoardRows/isActionNeeded: 같은 행 데이터 계약의 정렬·핀 판정
// 필터 상태(어떤 행이 보이는가)는 전부 보드 소관 — 여기는 표시만 담당한다.
// ============================================================================

import {
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  FileText,
  ListChecks,
  Plus,
  SpellCheck,
  Users,
  X,
} from "lucide-react";
import { StatusPill } from "@/components/layout/page-frame";
import type {
  StudyAssignmentKind,
  StudyAssignmentListRow,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { dDayLabel, seoulDayDiff } from "@/lib/study-assignments/status";
import { cn, formatRelativeTime } from "@/lib/utils";

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
};

const KIND_BADGE_TONES: Record<StudyAssignmentKind, string> = {
  EXAM: "bg-blue-50 text-blue-600 ring-blue-100",
  WORKSHEET: "bg-slate-100 text-slate-600 ring-slate-200",
  QUESTIONS: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  GRAMMAR: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

/** 필터/정렬 칩 활성·비활성 — 보드(종류·상태 칩)와 공유(설계 §2) */
export const CHIP_ACTIVE = "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm";
export const CHIP_IDLE =
  "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600";

/** "YYYY-MM-DD" → "7월 15일" */
export function selectedDateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
}

// ── 목록 정렬·핀 판정 (카드와 같은 행 계약 공유) ─────────────────────────────

export type BoardSortKey = "recent" | "due" | "progress";

export const BOARD_SORT_OPTIONS: { key: BoardSortKey; label: string }[] = [
  { key: "recent", label: "최신순" },
  { key: "due", label: "마감 임박순" },
  { key: "progress", label: "완료율 낮은순" },
];

/** "조치 필요" = 진행 중인데 기한 지남 미완료 학생이 있음 — 핀 그룹·OVERDUE 칩 공용 판정 */
export function isActionNeeded(r: StudyAssignmentListRow): boolean {
  return r.status === "ACTIVE" && r.overdueCount > 0;
}

/** 완료율(0~1) — 태스크 0건은 null(완료율 정렬 시 마지막) */
function donePctOf(r: StudyAssignmentListRow): number | null {
  return r.taskCount > 0 ? r.doneCount / r.taskCount : null;
}

/** 최신순 폴백 — ISO 문자열은 사전순 비교가 시간순과 일치 */
function byRecent(a: StudyAssignmentListRow, b: StudyAssignmentListRow): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * 목록 정렬 비교기 — 보드는 "핀 파티션 후 그룹 내 정렬" 규칙(플랜 합의)이라
 * 여기서는 그룹 안의 순서만 책임진다.
 */
export function compareBoardRows(
  a: StudyAssignmentListRow,
  b: StudyAssignmentListRow,
  key: BoardSortKey,
): number {
  if (key === "due") {
    // 기한 지남 최우선 → dueAt 임박순 → 마감 없음 마지막
    const rankOf = (r: StudyAssignmentListRow) => (isActionNeeded(r) ? 0 : r.dueAt ? 1 : 2);
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra - rb;
    if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    return byRecent(a, b);
  }
  if (key === "progress") {
    const pa = donePctOf(a);
    const pb = donePctOf(b);
    if (pa !== pb) {
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pa - pb;
    }
    return byRecent(a, b);
  }
  return byRecent(a, b);
}

// ── 목록 패널 (카운트 행 + 정렬 세그먼트 + 핀 그룹 + 목록) ──────────────────

export function AssignmentListPanel({
  pinnedRows,
  restRows,
  now,
  refreshing,
  selectedDate,
  sortKey,
  onChangeSort,
  onClearDate,
  onCreateForDate,
  onOpen,
}: {
  /** "조치 필요"(기한 지남 미완료) 핀 그룹 — 보드가 파티션·정렬까지 마친 결과 */
  pinnedRows: StudyAssignmentListRow[];
  restRows: StudyAssignmentListRow[];
  now: Date;
  refreshing: boolean;
  /** 캘린더 선택 날짜 — "YYYY-MM-DD" | null */
  selectedDate: string | null;
  sortKey: BoardSortKey;
  onChangeSort: (key: BoardSortKey) => void;
  onClearDate: () => void;
  /** "+ 이 날짜 마감 과제" — 선택 날짜를 기본 마감으로 컴포저 오픈(U2 defaultDue) */
  onCreateForDate: (date: string) => void;
  onOpen: (id: string) => void;
}) {
  const visibleCount = pinnedRows.length + restRows.length;
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:h-full">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <p className="text-[12px] font-medium text-slate-400">
          과제 <span className="font-bold tabular-nums text-slate-600">{visibleCount}</span>건
          {refreshing ? <span className="ml-1.5">갱신 중…</span> : null}
        </p>
        {/* "조치 필요" 는 목록 위 별도 줄이 아니라 이 헤더 줄에 둔다 — 줄 수를 늘리지
            않고도 우선 신호가 먼저 읽힌다(핀 그룹은 카드 좌측 rose 보더로 계속 구분) */}
        {pinnedRows.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11.5px] font-bold text-rose-600">
            <CalendarClock className="size-3.5" aria-hidden />
            조치 필요 {pinnedRows.length}건
          </span>
        ) : null}
        {selectedDate ? (
          <>
            <button
              type="button"
              onClick={onClearDate}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
            >
              {selectedDateLabel(selectedDate)} 마감
              <X className="size-3" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onCreateForDate(selectedDate)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
            >
              <Plus className="size-3" aria-hidden />이 날짜 마감 과제
            </button>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="목록 정렬">
          {BOARD_SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onChangeSort(o.key)}
              aria-pressed={sortKey === o.key}
              className={cn(
                "h-7 rounded-md border px-2 text-[11.5px] font-semibold transition-colors",
                sortKey === o.key ? CHIP_ACTIVE : CHIP_IDLE,
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 영역만 내부 스크롤 — 헤더는 고정, 컬럼 아래 끝선이 캘린더와 맞는다 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {visibleCount === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-12">
            <ClipboardList className="size-8 text-slate-300" aria-hidden />
            <p className="text-[13px] text-slate-400">
              {selectedDate ? "이 날짜에 마감인 과제가 없습니다." : "조건에 맞는 과제가 없습니다."}
            </p>
          </div>
        ) : (
          <>
            {pinnedRows.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {pinnedRows.map((row) => (
                  <AssignmentListCard key={row.id} row={row} now={now} pinned onOpen={onOpen} />
                ))}
              </ul>
            ) : null}
            {restRows.length > 0 ? (
              <ul className={cn("flex flex-col gap-2", pinnedRows.length > 0 && "pt-1")}>
                {restRows.map((row) => (
                  <AssignmentListCard key={row.id} row={row} now={now} onOpen={onOpen} />
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ── 행 카드 ──────────────────────────────────────────────────────────────────

export function AssignmentListCard({
  row,
  now,
  pinned,
  onOpen,
}: {
  row: StudyAssignmentListRow;
  /** 렌더 시각 — D-day 계산 공유(부모가 렌더당 1회 생성) */
  now: Date;
  /** "조치 필요" 핀 그룹 소속 — rose 좌측 보더 강조 */
  pinned?: boolean;
  onOpen: (id: string) => void;
}) {
  const Icon = KIND_ICON[row.kind];
  const dueDiff = row.dueAt ? seoulDayDiff(now, new Date(row.dueAt)) : null;
  // 마감 경과(D+N 영역) — D-day 라벨 억제. rose "기한 지남"은 미완료 연체
  // (isActionNeeded — KPI·핀 그룹과 동일 판정)에만, 전원 완료·종료 행은
  // 날짜만 남긴다(N-17 — 같은 단어 다른 의미 병존 해소).
  const isOverdue = dueDiff !== null && dueDiff < 0;
  const dday = isOverdue ? null : dDayLabel(dueDiff);
  const donePct = row.taskCount > 0 ? Math.round((row.doneCount / row.taskCount) * 100) : 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className={cn(
          "w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/30",
          pinned && "border-l-2 border-l-rose-400",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
              KIND_BADGE_TONES[row.kind],
            )}
          >
            <Icon className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[13.5px] font-semibold text-slate-800">
                {row.title}
              </span>
              <StatusPill tone={STUDY_KIND_META[row.kind].tone}>
                {STUDY_KIND_META[row.kind].label}
              </StatusPill>
              {row.status === "CLOSED" ? <StatusPill tone="slate">종료</StatusPill> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-slate-400">
              <span className="inline-flex min-w-0 items-center gap-1">
                <Users className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{row.targetSummary ?? `${row.taskCount}명`}</span>
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>배포 {formatRelativeTime(row.createdAt)}</span>
              {row.inProgressCount > 0 ? (
                <span className="font-semibold text-blue-600">
                  진행 중 {row.inProgressCount}명
                </span>
              ) : null}
              {row.overdueCount > 0 ? (
                <span className="font-semibold text-rose-600">
                  기한 지남 {row.overdueCount}명
                </span>
              ) : null}
            </div>
            {/* 진행 미터 */}
            <div className="mt-2 flex items-center gap-2">
              <span
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={donePct}
                aria-label={`완료율 ${donePct}%`}
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"
              >
                <span
                  className={cn(
                    "block h-full rounded-full",
                    row.taskCount > 0 && row.doneCount === row.taskCount
                      ? "bg-emerald-500"
                      : "bg-blue-600",
                  )}
                  style={{ width: `${donePct}%` }}
                />
              </span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
                {row.doneCount}/{row.taskCount} 완료
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isOverdue && isActionNeeded(row) ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-rose-600">
                <CalendarClock className="size-3.5" aria-hidden />
                기한 지남
              </span>
            ) : dday ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums text-slate-600">
                <CalendarClock className="size-3.5" aria-hidden />
                {dday}
              </span>
            ) : !row.dueAt ? (
              <span className="text-[11px] text-slate-300">마감 없음</span>
            ) : null}
            {row.dueAt ? (
              <span className="text-[10.5px] text-slate-300">
                {new Date(row.dueAt).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "numeric",
                  day: "numeric",
                  weekday: "short",
                })}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
