// ============================================================================
// /g/w/[taskId]/study/[stageId] — 스테이지 플레이어 (몰입 풀스크린, 서버 가드)
//
// 세션 가드 → WORKSHEET 태스크 소유 검증 → 스터디 컨텍스트(컴파일) →
// 스테이지 확인 후 플레이어 렌더. 잠금·스터디 불가·스테이지 불일치는 전부
// 허브로 안전 복귀(redirect). 규범: docs/worksheet-study-spec.md §8.3.
// ============================================================================

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import {
  loadOwnedStudentTask,
  markTaskInProgress,
} from "@/lib/study-assignments/student-runtime";
import { loadStageFirstAttempts, loadStudyContext } from "@/lib/worksheet-study/server";
import { StudyPlayerClient } from "@/components/worksheet-study/player-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "학습 | SMOAT",
  robots: { index: false, follow: false },
};

export default async function StudyStagePage({
  params,
}: {
  params: Promise<{ taskId: string; stageId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { taskId, stageId } = await params;
  const task = await loadOwnedStudentTask(taskId, session.studentId, session.academyId);
  if (!task || task.kind !== "WORKSHEET") redirect("/g/tasks");

  const backHref = `/g/w/${task.taskId}`;
  const ctx = await loadStudyContext(task, session.academyId);
  // 잠금·스터디 불가 → 허브가 올바른 안내/폴백을 렌더한다
  if (!ctx.plan || ctx.locked) redirect(backHref);

  const stage = ctx.plan.stages.find((s) => s.id === stageId);
  if (!stage) redirect(backHref);

  await markTaskInProgress(task.taskId, session.studentId);

  // 다음 단계 — 현재 스테이지 뒤에서 첫 미완료, 없으면 앞쪽 미완료로 순환
  const order = ctx.plan.stages.map((s) => s.id);
  const from = order.indexOf(stage.id);
  const rotated = [...order.slice(from + 1), ...order.slice(0, from)];
  const nextId = rotated.find((id) => ctx.summary.stages[id]?.status !== "done") ?? null;
  const nextStageHref = nextId ? `/g/w/${task.taskId}/study/${nextId}` : null;

  const stageState = ctx.summary.stages[stage.id];
  const reviewMode = stageState?.status === "done" || task.taskStatus === "DONE";

  // 이어 풀기 — 중도 이탈한 스테이지에 한해 첫 시도 기록을 실어 보낸다.
  // 복습(완료 스테이지)은 처음부터가 맞으므로 싣지 않는다.
  const priorFirst =
    !reviewMode && ctx.stateId && stageState?.status === "in-progress"
      ? await loadStageFirstAttempts(ctx.stateId, stage.id)
      : [];

  return (
    <StudyPlayerClient
      taskId={task.taskId}
      stage={stage}
      planHash={ctx.plan.planHash}
      backHref={backHref}
      nextStageHref={nextStageHref}
      reviewMode={reviewMode}
      priorFirst={priorFirst}
    />
  );
}
