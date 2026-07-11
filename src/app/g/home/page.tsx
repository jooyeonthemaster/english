// ============================================================================
// /g/home — 홈 탭 (서버 조립 → GShell + 클라이언트 렌더)
//
// 기존 홈 페이로드(buildHomePayload)에 통합 과제 유니온을 더해 "오늘의 학습"
// 대시보드를 구성한다. 과제 카드는 /api/g/tasks 와 동일한 StudentTaskCard
// 계약(toStudentTaskCard)으로 서버에서 조립 — 탭 배지도 같은 응답에서 계산.
// 과제 조회 실패 시에도 홈은 살린다(빈 목록 폴백).
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { buildHomePayload } from "@/lib/grammar-drill/home";
import { loadStudentUnifiedTasks } from "@/lib/study-assignments/task-union";
import { toStudentTaskCard } from "@/lib/study-assignments/student-cards";
import { GShell } from "@/components/grammar-drill/g-shell";
import { HomeClient } from "./home-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GrammarDrillHomePage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const [home, taskRecords] = await Promise.all([
    buildHomePayload(session),
    loadStudentUnifiedTasks(session.studentId, session.academyId).catch(() => []),
  ]);
  const now = new Date();
  const tasks = taskRecords.map((r) => toStudentTaskCard(r, now));
  const pendingTasks = tasks.filter((t) => t.status !== "DONE").length;

  return (
    <GShell
      studentName={home.studentName}
      academyName={home.academyName}
      tasksBadgeCount={pendingTasks}
      chatRemainingToday={home.chatRemainingToday}
    >
      <HomeClient studentId={session.studentId} home={home} tasks={tasks} />
    </GShell>
  );
}
