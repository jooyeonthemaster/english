// ============================================================================
// /g/w/[taskId] — 학습지 진입점: 스터디 허브 또는 원본 뷰어 (서버 분기)
//
// 분기(docs/worksheet-study-spec.md §8.1):
//  1) 태스크 없음/종류 불일치 → 안내
//  2) 잠금(공개 전·CLOSED 미완료) → 잠금 안내 (현행 유지)
//  3) 스터디 불가(문서가 영어 PRIME 아님 / mode "off" / 채점 스테이지 < 2)
//     → 기존 A4 뷰어 그대로 렌더(무회귀 — 기존 UX 픽셀 동일)
//  4) 그 외 → 스터디 허브(단계 맵·이어하기·원본 CTA)
// 열람 진입 시 markTaskInProgress(멱등). 문구는 전부 합니다체.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileX } from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { dDayLabel, isTaskLocked, seoulDayDiff } from "@/lib/study-assignments/status";
import {
  loadOwnedStudentTask,
  markTaskInProgress,
} from "@/lib/study-assignments/student-runtime";
import { loadStudyContext } from "@/lib/worksheet-study/server";
import { loadWorksheetViewerDoc } from "./doc-loader";
import { WorksheetStudyHub, type HubStageRow } from "./hub-client";
import { WViewerClient } from "./w-viewer-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "학습지 | SMOAT",
  robots: { index: false, follow: false },
};

export default async function WorksheetEntryPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { taskId } = await params;
  const task = await loadOwnedStudentTask(taskId, session.studentId, session.academyId);
  if (!task || task.kind !== "WORKSHEET") {
    return <ViewerFallback title="학습지를 열 수 없습니다" />;
  }

  // 예정(availableFrom 미래)·선생님이 마감한(CLOSED) 과제는 진입 잠금 —
  // 이미 완료(DONE)한 학습지는 CLOSED 이후에도 재열람을 허용한다(현행 유지).
  if (
    task.taskStatus !== "DONE" &&
    (isTaskLocked(task.availableFrom, new Date()) || task.assignmentStatus === "CLOSED")
  ) {
    return (
      <ViewerFallback
        title="아직 열람할 수 없는 학습지입니다"
        message="열람 기간이 아니거나 마감된 과제입니다. 궁금한 점은 선생님께 문의해 주세요."
      />
    );
  }

  const ctx = await loadStudyContext(task, session.academyId);

  // ── 스터디 불가 → 기존 뷰어 그대로 (무회귀 경로) ──────────────────────────
  if (!ctx.plan) {
    const loaded = await loadWorksheetViewerDoc(task.refId, session.academyId);
    if (!loaded) {
      return <ViewerFallback title="학습지를 불러올 수 없습니다" />;
    }
    await markTaskInProgress(task.taskId, session.studentId);
    return (
      <WViewerClient
        taskId={task.taskId}
        title={task.title}
        instructions={task.instructions}
        initialDone={task.taskStatus === "DONE"}
        doc={loaded.doc}
      />
    );
  }

  // ── 스터디 허브 ────────────────────────────────────────────────────────────
  await markTaskInProgress(task.taskId, session.studentId);

  const stages: HubStageRow[] = ctx.plan.stages.map((s) => {
    const st = ctx.summary.stages[s.id];
    return {
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      estMin: s.estMin,
      itemCount: s.items.length,
      graded: s.graded,
      status: st?.status ?? "todo",
      score: st?.score,
    };
  });
  const doneCount = stages.filter((s) => s.status === "done").length;
  const dDay = task.dueAt ? dDayLabel(seoulDayDiff(new Date(), task.dueAt)) : null;
  const taskDone = task.taskStatus === "DONE";

  return (
    <WorksheetStudyHub
      taskId={task.taskId}
      title={task.title}
      instructions={task.instructions}
      dDay={dDay}
      stages={stages}
      masteryPct={ctx.summary.masteryPct}
      // 정답률만 넘기면 히어로가 진도를 못 보여준다 — 표본·진도까지 통째로 넘긴다(2607 §3.4)
      mastery={ctx.summary.mastery}
      doneCount={doneCount}
      taskDone={taskDone}
      requiredMode={ctx.config.required}
      legacyCompleteAllowed={!ctx.config.required}
      initialLegacyDone={taskDone}
    />
  );
}

/** 로드 실패/잠금 안내 — 학생 친화 문구(합니다체) + 과제 목록 복귀 */
function ViewerFallback({
  title,
  message = "학습지를 불러올 수 없습니다. 선생님께 문의해 주세요.",
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
      >
        <FileX className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="gd-t-lg font-bold tracking-tight">{title}</h1>
      <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
        {message}
      </p>
      <Link href="/g/tasks" className="gd-btn gd-btn-ghost mt-2 px-5">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        과제 목록으로 돌아가기
      </Link>
    </div>
  );
}
