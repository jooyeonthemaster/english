// ============================================================================
// /g/tasks — 과제 탭 (서버 = 세션 가드만, 목록은 클라이언트가 /api/g/tasks fetch)
// GShell 은 클라이언트에서 감싼다 — 미완료 배지가 fetch 결과에서 파생되기 때문.
// 오늘 질문 잔여(햄버거 시트)만 서버에서 실어 보낸다 — 실패 시 행 생략.
// ============================================================================

import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { getChatRemainingToday } from "@/lib/grammar-drill/home";
import { TasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TasksPage() {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const chatRemainingToday = await getChatRemainingToday(session.studentId).catch(
    () => undefined,
  );

  return (
    <TasksClient
      studentId={session.studentId}
      studentName={session.studentName}
      academyName={session.academyName}
      chatRemainingToday={chatRemainingToday}
    />
  );
}
