// ============================================================================
// 통합 학습 과제 — /t 응시면 브리지 컨텍스트 (서버 전용)
//
// ExamSubmission → 소속 StudyAssignment 역참조. exam-scoring 내부는 절대
// 무수정(소비 전용) — /t/[token] 페이지가 loadTakingSession 이후 이 컨텍스트로
// duration 을 페이지 레벨에서 패치하고(instructions·dueAt 은 인트로 표시),
// 브리지가 없는 DIRECT 배포는 null 을 받아 기존 동작 그대로 둔다.
//
// 중복 브리지 규칙: 같은 submission 이 여러 과제에 브리지된 경우(재배포·복제
// 등) createdAt desc 최신 과제를 우선한다 — 가장 마지막 배포 의도가 응시
// 조건(제한시간·안내문·마감)의 정본이라는 규칙.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { examPayloadDurationMin } from "./types";

export interface TakingAssignmentContext {
  assignmentId: string;
  /** 과제 레벨 제한시간 오버라이드(분, 1~600) — payload.durationMin, 없으면 null */
  durationMin: number | null;
  /** 학생 노출 안내문(합니다체) — 인트로 카드 표시용 */
  instructions: string | null;
  dueAt: Date | null;
}

/**
 * submissionId 로 소속 과제의 응시 컨텍스트를 조회한다.
 * 호출자는 토큰 인증을 이미 통과한 /t 페이지 — submissionId 자체가 스코프이므로
 * academyId 재검증은 하지 않는다(태스크·과제 모두 FK 없는 soft-ref 2쿼리).
 */
export async function getTakingAssignmentContext(
  submissionId: string,
): Promise<TakingAssignmentContext | null> {
  const task = await prisma.studyAssignmentTask.findFirst({
    where: { examSubmissionId: submissionId },
    orderBy: { createdAt: "desc" },
    select: { assignmentId: true },
  });
  if (!task) return null;

  const assignment = await prisma.studyAssignment.findFirst({
    where: { id: task.assignmentId },
    select: { id: true, payload: true, instructions: true, dueAt: true },
  });
  if (!assignment) return null;

  return {
    assignmentId: assignment.id,
    durationMin: examPayloadDurationMin(assignment.payload),
    instructions: assignment.instructions,
    dueAt: assignment.dueAt,
  };
}
