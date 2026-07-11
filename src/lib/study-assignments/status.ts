// ============================================================================
// 통합 학습 과제 — 라이브 상태 계산 규칙 (플레인 모듈, 순수 함수만)
//
// 계약(설계 §3): EXAM 은 ExamSubmission.status, GRAMMAR 는
// GrammarDrillAssignment.status 조인이 정본이고, WORKSHEET/QUESTIONS 는
// 태스크 행 status 자체가 정본. 마감(dueAt)은 잠금이 아니라 표시 개념 —
// 늦은 제출을 막지 않는다(rose 톤 "기한 지남" 배지만).
// ============================================================================

import type { StudyTaskStatus } from "./types";

/** ExamSubmission.status → 태스크 라이브 상태 */
export function resolveExamLiveStatus(submissionStatus: string): StudyTaskStatus {
  if (submissionStatus === "SUBMITTED" || submissionStatus === "GRADED") return "DONE";
  if (submissionStatus === "IN_PROGRESS") return "IN_PROGRESS";
  return "ASSIGNED";
}

/** GrammarDrillAssignment.status → 태스크 라이브 상태 */
export function resolveGrammarLiveStatus(gaStatus: string): StudyTaskStatus {
  if (gaStatus === "DONE") return "DONE";
  if (gaStatus === "IN_PROGRESS") return "IN_PROGRESS";
  return "ASSIGNED";
}

/** 마감 지남 여부 — DONE 이면 항상 false */
export function isTaskOverdue(
  dueAt: Date | null,
  liveStatus: StudyTaskStatus,
  now: Date,
): boolean {
  if (!dueAt || liveStatus === "DONE") return false;
  return dueAt.getTime() < now.getTime();
}

/** availableFrom 미래 여부(학생 진입 잠금) */
export function isTaskLocked(availableFrom: Date | null, now: Date): boolean {
  if (!availableFrom) return false;
  return availableFrom.getTime() > now.getTime();
}

/** 서울 기준 달력일 차이 — dueAt 이 오늘이면 0, 내일 1, 어제 -1 */
export function seoulDayDiff(from: Date, to: Date): number {
  return Math.round(
    (seoulDayIndex(to) - seoulDayIndex(from)) / 1,
  );
}

/** 서울 자정 기준 epoch 일 인덱스 */
function seoulDayIndex(d: Date): number {
  // KST = UTC+9 고정(서머타임 없음) — epoch(ms)+9h 를 일 단위로 내림.
  return Math.floor((d.getTime() + 9 * 3_600_000) / 86_400_000);
}

/** D-day 라벨 — "D-3" | "D-DAY" | "D+2" | null(마감 없음) */
export function dDayLabel(dDay: number | null): string | null {
  if (dDay === null) return null;
  if (dDay === 0) return "D-DAY";
  return dDay > 0 ? `D-${dDay}` : `D+${Math.abs(dDay)}`;
}

/**
 * 마감 정밀 카운트다운 — 24시간 이내 미래는 "4시간 32분 남음"/"38분 남음",
 * 지난 지 24시간 이내는 "2시간 전 마감"/"38분 전 마감", 그 외(먼 미래·오래 지남·
 * 무마감·파손 ISO)는 null. 순수 함수 — 틱은 소비처(60초 interval)가 돌린다.
 */
export function dueCountdownText(dueAtIso: string | null, now: Date): string | null {
  if (!dueAtIso) return null;
  const due = new Date(dueAtIso).getTime();
  if (Number.isNaN(due)) return null;
  const diff = due - now.getTime();
  const DAY = 86_400_000;
  if (diff > 0 && diff <= DAY) {
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (hours > 0) return mins > 0 ? `${hours}시간 ${mins}분 남음` : `${hours}시간 남음`;
    return `${Math.max(mins, 1)}분 남음`;
  }
  if (diff <= 0 && -diff <= DAY) {
    const hours = Math.floor(-diff / 3_600_000);
    if (hours > 0) return `${hours}시간 전 마감`;
    return `${Math.max(Math.floor(-diff / 60_000), 1)}분 전 마감`;
  }
  return null;
}
