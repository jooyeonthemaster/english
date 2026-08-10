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
  BookA,
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  FileText,
  ListChecks,
  Plus,
  SpellCheck,
  Users,
} from "lucide-react";
import { StatusPill } from "@/components/layout/page-frame";
import {
  SegmentPills,
  type SegmentPillOption,
} from "@/components/students/hub/analytics/kit";
import type {
  StudyAssignmentKind,
  StudyAssignmentListRow,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { dDayLabel, seoulDayDiff } from "@/lib/study-assignments/status";
import { TASK_STATUS_LABELS } from "@/lib/wording/director-glossary";
import { cn, formatRelativeTime } from "@/lib/utils";

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
  VOCAB: BookA,
};

const KIND_BADGE_TONES: Record<StudyAssignmentKind, string> = {
  EXAM: "bg-blue-50 text-blue-600 ring-blue-100",
  WORKSHEET: "bg-slate-100 text-slate-600 ring-slate-200",
  QUESTIONS: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  GRAMMAR: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  VOCAB: "bg-teal-50 text-teal-600 ring-teal-100",
};

/** 필터/정렬 칩 활성·비활성 — 보드(종류·상태 칩)와 공유(설계 §2) */
export const CHIP_ACTIVE = "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm";
// 비활성도 테두리·slate-600 을 유지한다 — 구 값(border-transparent + slate-400)은
// 대비 3.0:1 로 AA 미달이었고 "누를 수 있는 것"으로 읽히지도 않아 선택지가 캡션
// 문장처럼 보였다. kit FilterChip(§1.1 정본)의 비활성 관용과 동일 문자열.
export const CHIP_IDLE =
  "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

/** "YYYY-MM-DD" → "7월 15일" — 보드 툴바 활성 칩과 목록 캡션의 단일 소스 */
export function selectedDateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/**
 * 선택 날짜 축 캡션 — 캘린더/목록 매칭은 `dueAt ?? availableFrom` 이라
 * "마감"만 적으면 마감 없는(시작일) 과제가 섞여 라벨과 내용이 어긋난다.
 */
export const SELECTED_DATE_AXIS_HINT = "마감일 기준 · 마감 없는 과제는 시작일";

// ── 목록 정렬·핀 판정 (카드와 같은 행 계약 공유) ─────────────────────────────

export type BoardSortKey = "recent" | "due" | "progress";

/** SegmentPills(§1.1 정본) 계약 그대로 — 로컬 칩 재구현을 폐기하며 shape 을 맞췄다 */
export const BOARD_SORT_OPTIONS: SegmentPillOption<BoardSortKey>[] = [
  { value: "recent", label: "최신순" },
  { value: "due", label: "마감 임박순" },
  { value: "progress", label: "완료율 낮은순" },
];

/**
 * 「기한 지남」 = 진행 중인데 기한 지남 미완료 학생이 있음 — KPI 타일·상태 필터·
 * 핀 그룹·카드 배지가 전부 공유하는 단일 술어(노출 라벨도 한 단어로 통일했다).
 */
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
  onCreateForDate,
  onOpen,
}: {
  /** 기한 지남(미완료 연체) 핀 그룹 — 보드가 파티션·정렬까지 마친 결과 */
  pinnedRows: StudyAssignmentListRow[];
  restRows: StudyAssignmentListRow[];
  now: Date;
  refreshing: boolean;
  /** 캘린더 선택 날짜 — "YYYY-MM-DD" | null */
  selectedDate: string | null;
  sortKey: BoardSortKey;
  onChangeSort: (key: BoardSortKey) => void;
  /** "이 날짜 마감으로 새 과제" — 선택 날짜를 기본 마감으로 컴포저 오픈(U2 defaultDue) */
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
        {/* 연체 요약은 목록 위 별도 줄이 아니라 이 헤더 줄에 둔다 — 줄 수를 늘리지
            않고도 우선 신호가 먼저 읽힌다(핀 그룹은 카드 좌측 rose 보더로 계속 구분).
            라벨은 KPI 타일·상태 필터·카드 배지와 같은 glossary 단어를 쓴다 —
            같은 술어(isActionNeeded)에 「조치 필요」/「기한 지남」 두 이름이 한 화면에
            공존해 원장이 서로 다른 두 지표로 읽던 문제를 없앤다. */}
        {pinnedRows.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11.5px] font-bold text-rose-600">
            <CalendarClock className="size-3.5" aria-hidden />
            {TASK_STATUS_LABELS.OVERDUE} {pinnedRows.length}건
          </span>
        ) : null}
        {selectedDate ? (
          <>
            {/* 해제 칩은 툴바 활성 칩 줄(§5.2 B-3 정본)에만 둔다 — 여기 있던 두 번째
                해제 칩은 같은 필터를 다른 문구(「…마감」)로 중복 노출했다. 대신
                축을 밝히는 캡션만 남긴다(마감 없는 과제는 시작일로 매칭된다). */}
            <span className="text-[12px] text-slate-400">
              {selectedDateLabel(selectedDate)} · {SELECTED_DATE_AXIS_HINT}
            </span>
            <button
              type="button"
              onClick={() => onCreateForDate(selectedDate)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
            >
              <Plus className="size-3" aria-hidden />이 날짜 마감으로 새 과제
            </button>
          </>
        ) : null}
        {/* 정렬은 §1.1 정본 SegmentPills 로 — 로컬 칩 나열은 필터와 구분되지 않았고
            같은 카드 안 「학생|반」 세그먼트와 관용이 갈렸다. 좌측 캡션으로 이 세
            단어가 정렬 축임을 밝힌다. */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[12px] text-slate-400">정렬</span>
          <SegmentPills<BoardSortKey>
            options={BOARD_SORT_OPTIONS}
            value={sortKey}
            onChange={onChangeSort}
            ariaLabel="목록 정렬"
          />
        </div>
      </div>

      {/* 목록 영역만 내부 스크롤 — 헤더는 고정, 컬럼 아래 끝선이 캘린더와 맞는다.
          하단 페이드는 "더 있다"는 유일한 신호가 잘린 카드 조각뿐이던 문제를 보완 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-3 pr-0.5">
          {visibleCount === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-12">
              <ClipboardList className="size-8 text-slate-300" aria-hidden />
              <p className="text-[13px] text-slate-400">
                {selectedDate ? "이 날짜의 과제가 없습니다." : "조건에 맞는 과제가 없습니다."}
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
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent"
        />
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
  /** 기한 지남 핀 그룹 소속 — rose 좌측 보더 강조 */
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
  // 서버(queries.ts)는 연체를 라이브 상태와 직교로 세므로 overdueCount 가
  // inProgressCount 를 부분 포함한다 — 그대로 나란히 찍으면 taskCount 1인 과제에
  // 「진행 중 1명 + 기한 지남 1명」(=2명)이 뜨고 바로 아래 「0/1 완료」와 모순됐다.
  // 서버 계약은 그대로 두고 표시층에서 배타 분해한다: 합 ≤ taskCount-doneCount.
  // 연체 술어는 KPI·상태 필터와 같은 isActionNeeded — 종료 과제는 연체 축에서
  // 빠지므로(필터로 눌러도 안 나온다) 카드에도 rose 「기한 지남」을 찍지 않는다.
  const remainingCount = Math.max(0, row.taskCount - row.doneCount);
  const overdueCount = isActionNeeded(row) ? Math.min(row.overdueCount, remainingCount) : 0;
  const pendingCount = remainingCount - overdueCount;
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
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-slate-400">
              <span className="inline-flex min-w-0 items-center gap-1">
                <Users className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{row.targetSummary ?? `${row.taskCount}명`}</span>
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>배포 {formatRelativeTime(row.createdAt)}</span>
              {pendingCount > 0 ? (
                <span className="font-semibold text-blue-600">미완료 {pendingCount}명</span>
              ) : null}
              {overdueCount > 0 ? (
                <span className="font-semibold text-rose-600">
                  {TASK_STATUS_LABELS.OVERDUE} {overdueCount}명
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
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-slate-500">
                {row.doneCount}/{row.taskCount} 완료
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isOverdue && isActionNeeded(row) ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-rose-600">
                <CalendarClock className="size-3.5" aria-hidden />
                {TASK_STATUS_LABELS.OVERDUE}
              </span>
            ) : dday ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums text-slate-600">
                <CalendarClock className="size-3.5" aria-hidden />
                {dday}
              </span>
            ) : !row.dueAt ? (
              <span className="text-[12px] text-slate-400">마감 없음</span>
            ) : null}
            {/* 마감일은 보드에서 가장 중요한 정보인데 가장 작고 흐린 글자였다
                (10.5px·slate-300 = 대비 1.9:1) — 보조 하한 12px·slate-500 로 */}
            {row.dueAt ? (
              <span className="text-[12px] text-slate-500">
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
