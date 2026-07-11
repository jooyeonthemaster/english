// ============================================================================
// 통합 학습 과제 — 학생 앱 태스크 런타임 헬퍼 (서버 전용)
//
// /g/q·/g/w 페이지(서버 컴포넌트)와 /api/g/tasks/* 라우트가 공유하는
// 태스크 로드·소유 검증·진행 마킹 정본. 태스크는 반드시 세션 학생 소유 +
// ARCHIVED 아님을 검증한다. 정답성 데이터는 questions-runtime 계약을 따른다.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  QuestionsAssignmentPayload,
  StudyAssignmentKind,
} from "./types";
import { isStudyAssignmentKind } from "./types";

export interface OwnedStudentTask {
  taskId: string;
  assignmentId: string;
  kind: StudyAssignmentKind;
  title: string;
  instructions: string | null;
  dueAt: Date | null;
  availableFrom: Date;
  assignmentStatus: string;
  refId: string | null;
  payload: unknown;
  taskStatus: string;
  responses: unknown;
  result: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** 세션 학생 소유 태스크 로드 — 없거나 ARCHIVED 면 null */
export async function loadOwnedStudentTask(
  taskId: string,
  studentId: string,
  academyId: string,
): Promise<OwnedStudentTask | null> {
  const task = await prisma.studyAssignmentTask.findFirst({
    where: { id: taskId, studentId, academyId },
  });
  if (!task) return null;
  const assignment = await prisma.studyAssignment.findFirst({
    where: { id: task.assignmentId, academyId },
  });
  if (!assignment || assignment.status === "ARCHIVED") return null;
  if (!isStudyAssignmentKind(assignment.kind)) return null;
  return {
    taskId: task.id,
    assignmentId: assignment.id,
    kind: assignment.kind,
    title: assignment.title,
    instructions: assignment.instructions,
    dueAt: assignment.dueAt,
    availableFrom: assignment.availableFrom,
    assignmentStatus: assignment.status,
    refId: assignment.refId,
    payload: assignment.payload,
    taskStatus: task.status,
    responses: task.responses,
    result: task.result,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

/** 열람/풀이 시작 마킹 — ASSIGNED 일 때만 IN_PROGRESS 로 승격(멱등) */
export async function markTaskInProgress(taskId: string, studentId: string): Promise<void> {
  await prisma.studyAssignmentTask.updateMany({
    where: { id: taskId, studentId, status: "ASSIGNED" },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
}

export function questionIdsOf(task: OwnedStudentTask): string[] {
  const payload = (task.payload ?? {}) as Partial<QuestionsAssignmentPayload>;
  return Array.isArray(payload.questionIds) ? payload.questionIds.filter(Boolean) : [];
}
