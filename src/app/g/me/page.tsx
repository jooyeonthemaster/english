// ============================================================================
// /g/me — 내 기록 탭 (서버 조립 → GShell + 클라이언트 렌더)
// 기록 본문은 클라이언트가 /api/grammar-drill/me 로 자체 로드(기존 유지).
// 과제 탭 배지는 통합 태스크 유니온의 미완료 수 — 실패해도 페이지는 살린다.
// 오늘 질문 잔여(햄버거 시트)는 홈과 동일 헬퍼 — 실패 시 행 생략(undefined).
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { getChatRemainingToday } from "@/lib/grammar-drill/home";
import { loadStudentUnifiedTasks } from "@/lib/study-assignments/task-union";
import { GShell } from "@/components/grammar-drill/g-shell";
import { MeClient } from "./me-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MePage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const [taskRecords, chatRemainingToday] = await Promise.all([
    loadStudentUnifiedTasks(session.studentId, session.academyId).catch(() => []),
    getChatRemainingToday(session.studentId).catch(() => undefined),
  ]);
  const pendingTasks = taskRecords.filter((t) => t.status !== "DONE").length;

  return (
    <GShell
      studentName={session.studentName}
      academyName={session.academyName}
      tasksBadgeCount={pendingTasks}
      chatRemainingToday={chatRemainingToday}
    >
      <MeClient />
    </GShell>
  );
}
