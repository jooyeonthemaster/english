// ============================================================================
// /g/vocab-drill/me — 내 단어 기록 (서버 조립 → GShell + 클라이언트 렌더)
// 기록 본문은 클라이언트가 /api/vocab-drill/me 로 자체 로드(어법 /g/me 와 동일).
// 과제 탭 배지는 통합 태스크 유니온의 미완료 수 — 실패해도 페이지는 살린다.
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { getChatRemainingToday } from "@/lib/grammar-drill/home";
import { loadStudentUnifiedTasks } from "@/lib/study-assignments/task-union";
import { GShell } from "@/components/grammar-drill/g-shell";
import { VocabMeClient } from "./vocab-me-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function VocabMePage() {
  if (!FEATURE_FLAGS.ENABLE_VOCAB_DRILL) redirect("/");
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
      <VocabMeClient />
    </GShell>
  );
}
