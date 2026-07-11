// ============================================================================
// /g/train — 훈련 탭 (서버 조립 → GShell + 클라이언트 렌더)
// 데이터는 홈과 동일한 buildHomePayload 재사용(유닛맵·복합세트가 포함됨).
// 과제 탭 배지는 통합 태스크 유니온의 미완료 수 — 실패해도 페이지는 살린다.
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { buildHomePayload } from "@/lib/grammar-drill/home";
import { loadStudentUnifiedTasks } from "@/lib/study-assignments/task-union";
import { GShell } from "@/components/grammar-drill/g-shell";
import { TrainClient } from "./train-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TrainPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const [home, taskRecords] = await Promise.all([
    buildHomePayload(session),
    loadStudentUnifiedTasks(session.studentId, session.academyId).catch(() => []),
  ]);
  const pendingTasks = taskRecords.filter((t) => t.status !== "DONE").length;

  return (
    <GShell
      studentName={home.studentName}
      academyName={home.academyName}
      tasksBadgeCount={pendingTasks}
      chatRemainingToday={home.chatRemainingToday}
    >
      <TrainClient home={home} />
    </GShell>
  );
}
