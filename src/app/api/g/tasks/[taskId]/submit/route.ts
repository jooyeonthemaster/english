import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { gradeQuestionsSubmission } from "@/lib/study-assignments/questions-runtime";
import { isTaskLocked } from "@/lib/study-assignments/status";
import {
  loadOwnedStudentTask,
  questionIdsOf,
} from "@/lib/study-assignments/student-runtime";
import type { StudentInput } from "@/lib/exam-scoring/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QUESTIONS 태스크 제출 — 서버 결정론 채점(AI 0콜) 후 태스크 완료.
 * body: { answers: Record<questionId, StudentInput> }
 * 이미 DONE 이면 409(재제출은 선생님 초기화 경유 — v1 재응시 없음).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { taskId } = await ctx.params;
  const task = await loadOwnedStudentTask(taskId, session.studentId, session.academyId);
  if (!task) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  if (task.kind !== "QUESTIONS") {
    return NextResponse.json({ ok: false, error: "WRONG_KIND" }, { status: 400 });
  }
  // CLOSED·공개 전(availableFrom 미래) 잠금 — dueAt 경과(늦은 제출)는 설계대로 허용.
  if (task.assignmentStatus === "CLOSED" || isTaskLocked(task.availableFrom, new Date())) {
    return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 403 });
  }
  if (task.taskStatus === "DONE") {
    return NextResponse.json({ ok: false, error: "ALREADY_DONE" }, { status: 409 });
  }

  let answers: Record<string, StudentInput | null> = {};
  try {
    const body = (await req.json()) as { answers?: Record<string, StudentInput | null> };
    answers = body.answers ?? {};
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const questionIds = questionIdsOf(task);
  if (questionIds.length === 0) {
    return NextResponse.json({ ok: false, error: "EMPTY_SET" }, { status: 400 });
  }

  const outcome = await gradeQuestionsSubmission(session.academyId, questionIds, answers);
  if (outcome.missingOrderNums.length > 0) {
    return NextResponse.json(
      { ok: false, error: "INCOMPLETE", missingOrderNums: outcome.missingOrderNums },
      { status: 400 },
    );
  }

  // CAS — 동시 제출 경합 시 한 요청만 DONE 전이(비원자 재제출 차단).
  const updated = await prisma.studyAssignmentTask.updateMany({
    where: { id: task.taskId, studentId: session.studentId, status: { not: "DONE" } },
    data: {
      status: "DONE",
      completedAt: new Date(),
      startedAt: task.startedAt ?? new Date(),
      responses: outcome.responses as unknown as Prisma.InputJsonValue,
      result: outcome.summary as unknown as Prisma.InputJsonValue,
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ ok: false, error: "ALREADY_DONE" }, { status: 409 });
  }

  // 학생 피드백 — 문항별 판정(정답 텍스트는 미포함: result.status 만)
  const perQuestion = outcome.responses.map((r) => ({
    questionId: r.questionId,
    orderNum: r.orderNum,
    status: r.result?.status ?? "NEEDS_REVIEW",
  }));
  return NextResponse.json({ ok: true, summary: outcome.summary, perQuestion });
}
