import { NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { isTaskLocked } from "@/lib/study-assignments/status";
import { loadOwnedStudentTask } from "@/lib/study-assignments/student-runtime";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** WORKSHEET 태스크 완료 확인 — 학생이 "확인 완료"를 누르면 DONE 마킹(멱등) */
export async function POST(
  _req: Request,
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
  if (task.kind !== "WORKSHEET") {
    return NextResponse.json({ ok: false, error: "WRONG_KIND" }, { status: 400 });
  }
  // CLOSED·공개 전(availableFrom 미래) 잠금 — dueAt 경과(늦은 제출)는 설계대로 허용.
  if (task.assignmentStatus === "CLOSED" || isTaskLocked(task.availableFrom, new Date())) {
    return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 403 });
  }
  if (task.taskStatus !== "DONE") {
    await prisma.studyAssignmentTask.update({
      where: { id: task.taskId },
      data: {
        status: "DONE",
        completedAt: new Date(),
        startedAt: task.startedAt ?? new Date(),
      },
    });
  }
  return NextResponse.json({ ok: true });
}
