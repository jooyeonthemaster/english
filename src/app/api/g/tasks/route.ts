import { NextResponse } from "next/server";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { loadStudentUnifiedTasks } from "@/lib/study-assignments/task-union";
import { toStudentTaskCard } from "@/lib/study-assignments/student-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 학생 앱 과제 목록 — 과제 소속 + 직접 배포(DIRECT) 유니온, 라이브 상태 포함 */
export async function GET() {
  const session = await getGrammarSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const now = new Date();
  const records = await loadStudentUnifiedTasks(session.studentId, session.academyId);
  const tasks = records.map((r) => toStudentTaskCard(r, now));
  return NextResponse.json({ ok: true, tasks });
}
