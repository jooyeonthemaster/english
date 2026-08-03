// ============================================================================
// /g/home — 홈 탭 (서버 조립 → GShell + 클라이언트 렌더)
//
// 기존 홈 페이로드(buildHomePayload)에 통합 과제 유니온을 더해 "오늘의 학습"
// 대시보드를 구성한다. 과제 카드는 /api/g/tasks 와 동일한 StudentTaskCard
// 계약(toStudentTaskCard)으로 서버에서 조립 — 탭 배지도 같은 응답에서 계산.
// 과제 조회 실패 시에도 홈은 살린다(빈 목록 폴백).
// ============================================================================

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
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

  const [home, taskRecords, vocabProgress] = await Promise.all([
    buildHomePayload(session),
    loadStudentUnifiedTasks(session.studentId, session.academyId).catch(() => []),
    loadVocabProgress(session.studentId).catch(() => null),
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
      <HomeClient
        studentId={session.studentId}
        home={home}
        tasks={tasks}
        vocabProgress={vocabProgress}
      />
    </GShell>
  );
}

// ── 어휘 트랙 카드 진행 요약 — 실패해도 홈은 살린다(null 폴백) ──
async function loadVocabProgress(
  studentId: string,
): Promise<{ pct: number; done: number; total: number; nextLabel: string } | null> {
  if (!FEATURE_FLAGS.ENABLE_VOCAB_DRILL) return null;
  const [stat, due] = await Promise.all([
    prisma.vocabDrillStat.findUnique({ where: { studentId } }),
    prisma.vocabDrillMastery.count({
      where: { studentId, dueAt: { lte: new Date() } },
    }),
  ]);
  const sensesSeen = stat?.sensesSeen ?? 0;
  const sensesMastered = stat?.sensesMastered ?? 0;
  return {
    pct: sensesSeen
      ? Math.round((sensesMastered / Math.max(sensesSeen, 1)) * 100)
      : 0,
    done: sensesMastered,
    total: sensesSeen,
    nextLabel: due > 0 ? `복습 ${due}개 대기` : "오늘의 드릴",
  };
}
