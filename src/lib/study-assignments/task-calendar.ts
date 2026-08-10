// ============================================================================
// 학생 과제 → 월 캘린더 어댑터 (학생 상세 과제 탭 달력 뷰 전용)
//
// 과제 달력 보드(AssignmentsBoardClient)를 통째로 임베드하지 않고
// 프레젠테이션 컴포넌트 AssignmentsCalendar 만 재사용하기 위한 변환 계층이다.
// 보드 임베드가 기각된 이유(규범: docs/student-hub-uiux-2607-spec.md §4.1):
//   · 보드의 syncUrl 이 학생 상세의 ?tab=tasks 를 지운다
//   · listStudyAssignments({studentId}) 는 DIRECT(고아 응시·어법 배포)를 못 잡아
//     같은 화면 상·하단의 건수가 어긋난다
//   · 서버 조회 2콜이 추가로 강제된다
//
// 캘린더가 실제로 읽는 필드는 5개뿐이다(assignments-calendar.tsx:100-106, 188,
// 236, 262-310): id · dueAt · availableFrom · kind · title. 나머지는 타입을
// 만족시키기 위한 안전한 더미이며 캘린더 렌더에 관여하지 않는다.
// ============================================================================

import type { StudentStudyTaskRow, StudyAssignmentListRow } from "./types";

/** 서울(UTC+9) 달력일 키 — "YYYY-MM-DD". assignments-calendar 의 seoulDateKey 와 동일 규칙 */
function seoulDay(date: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

/**
 * 이 과제가 캘린더에서 차지하는 날짜의 원천 ISO.
 *
 * DIRECT 배포(고아 ExamSubmission·GrammarDrillAssignment)는 서버가 dueAt·
 * availableFrom 을 하드 null 로 내려보내므로(task-union.ts:298-299, 346-347)
 * assignedAt 폴백이 **필수**다. 폴백이 없으면 new Date(null) → 1970-01-01 로
 * 버킷되어 어느 달에도 나타나지 않고 조용히 사라진다.
 */
function taskDateSource(t: StudentStudyTaskRow): string {
  return t.dueAt ?? t.availableFrom ?? t.assignedAt;
}

/** 캘린더 버킷 키 — "YYYY-MM-DD". 목록 필터도 반드시 이 함수를 쓴다(축 일치 계약) */
export function taskDateKey(t: StudentStudyTaskRow): string {
  return seoulDay(taskDateSource(t));
}

/** 캘린더 월 키 — "YYYY-MM" */
export function taskMonthKey(t: StudentStudyTaskRow): string {
  return taskDateKey(t).slice(0, 7);
}

/** 서울 기준 현재 달 — "YYYY-MM" */
export function seoulMonthKey(now: Date = new Date()): string {
  return seoulDay(now).slice(0, 7);
}

/**
 * 학생 과제 행 → 캘린더 행.
 *
 * dueAt 이 있으면 마감 셀(채운 도트 + 실선 칩), 없으면 시작 셀(아웃라인 도트 +
 * 점선 「시작」 칩)로 떨어진다. 마감 없는 DIRECT 배포는 배포일이 곧 시작일이다.
 */
export function taskToCalendarRow(t: StudentStudyTaskRow): StudyAssignmentListRow {
  const done = t.liveStatus === "DONE";
  return {
    // 캘린더는 id 를 React key 로만 쓴다 — 학생 태스크는 taskId 가 유일키
    id: t.taskId,
    kind: t.kind,
    title: t.title,
    refId: null,
    status: done ? "CLOSED" : "ACTIVE",
    // dueAt 이 없을 때만 참조되는 축이라 assignedAt 폴백이 실질 기본값이다
    availableFrom: t.availableFrom ?? t.assignedAt,
    dueAt: t.dueAt,
    targetSummary: null,
    instructions: null,
    createdAt: t.assignedAt,
    taskCount: 1,
    doneCount: done ? 1 : 0,
    inProgressCount: t.liveStatus === "IN_PROGRESS" ? 1 : 0,
    overdueCount: t.overdue ? 1 : 0,
  };
}

/** 목록과 캘린더가 같은 모집단을 보도록 — 항상 같은 배열에서 변환한다 */
export function tasksToCalendarRows(rows: StudentStudyTaskRow[]): StudyAssignmentListRow[] {
  return rows.map(taskToCalendarRow);
}

/** 이 학생의 과제가 존재하는 달 목록(오름차순) — 빈 달로 시작하지 않도록 초기 월을 고를 때 쓴다 */
export function taskMonths(rows: StudentStudyTaskRow[]): string[] {
  return [...new Set(rows.map(taskMonthKey))].sort();
}

/**
 * 달력 초기 월 — 서울 현재 달에 과제가 하나도 없으면 가장 가까운(최근 과거 우선)
 * 과제가 있는 달로 착지시킨다. 빈 달을 먼저 보여주는 헛걸음을 막는다.
 */
export function initialTaskMonth(rows: StudentStudyTaskRow[], now: Date = new Date()): string {
  const current = seoulMonthKey(now);
  const months = taskMonths(rows);
  if (months.length === 0 || months.includes(current)) return current;
  const past = months.filter((m) => m < current);
  return past.length > 0 ? past[past.length - 1] : months[0];
}
