// ============================================================================
// /g/w/[taskId]/report — 학생 결과·취약점 리포트 (서버 가드 + 데이터 조립)
//
// 스터디 컨텍스트에서 요약·취약점을 읽고, 히트맵 시트용 문장 원문과 취약 단어
// 뜻은 컴파일된 plan(reading/vocab-flash 아이템)에서 파생한다 — 별도 재파싱 없음.
// 규범: docs/worksheet-study-spec.md §8.4.
// ============================================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { loadOwnedStudentTask } from "@/lib/study-assignments/student-runtime";
import { loadStudyContext } from "@/lib/worksheet-study/server";
import {
  WorksheetStudyReport,
  type ReportSentence,
  type ReportStageRow,
} from "./report-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "결과 리포트 | SMOAT",
  robots: { index: false, follow: false },
};

export default async function StudyReportPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { taskId } = await params;
  const task = await loadOwnedStudentTask(taskId, session.studentId, session.academyId);
  if (!task || task.kind !== "WORKSHEET") redirect("/g/tasks");

  const backHref = `/g/w/${task.taskId}`;
  const ctx = await loadStudyContext(task, session.academyId);
  // 잠금 규칙은 허브·뷰어·플레이어·이벤트 API 와 동일 — 공개 전·CLOSED 미완료는
  // 허브로 돌려보내 잠금 안내를 받게 한다(완료 과제 재열람은 ctx.locked=false).
  if (!ctx.plan || ctx.locked) redirect(backHref);

  const stages: ReportStageRow[] = ctx.plan.stages.map((s) => {
    const st = ctx.summary.stages[s.id];
    return {
      id: s.id,
      title: s.title,
      graded: s.graded,
      status: st?.status ?? "todo",
      score: st?.score,
      timeMs: st?.timeMs,
    };
  });

  // 히트맵 시트용 문장 원문 — reading 스테이지의 read 아이템(n>0)에서 파생
  const sentences: ReportSentence[] = [];
  const reading = ctx.plan.stages.find((s) => s.id === "reading");
  if (reading) {
    for (const it of reading.items) {
      if (it.type === "read" && it.n > 0) sentences.push({ n: it.n, en: it.en, ko: it.ko });
    }
  }

  return (
    <WorksheetStudyReport
      taskId={task.taskId}
      title={task.title}
      masteryPct={ctx.summary.masteryPct}
      // 종합 카드가 정답률과 진도를 병기해야 하므로 표본까지 통째로 넘긴다(2607 §3.4)
      mastery={ctx.summary.mastery}
      totalTimeMs={ctx.summary.totalTimeMs}
      stages={stages}
      weakness={ctx.summary.weakness}
      sentences={sentences}
      wordMeanings={ctx.plan.vocabMeanings}
    />
  );
}
