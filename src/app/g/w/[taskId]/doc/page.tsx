// ============================================================================
// /g/w/[taskId]/doc — 원본 A4 학습지 뷰어 (서버 가드 + 문서 로드)
//
// 기존 /g/w/[taskId] 뷰어를 그대로 옮긴 라우트 — 스터디 허브에서 "원본 학습지
// 보기"로 진입한다. 스터디 필수 모드(required)면 하단 완료 버튼 대신 학습 복귀
// 안내를 보여준다(완료는 단계 완료로만). 그 외에는 기존 뷰어와 동일(무회귀).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileX } from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { isTaskLocked } from "@/lib/study-assignments/status";
import {
  loadOwnedStudentTask,
  markTaskInProgress,
} from "@/lib/study-assignments/student-runtime";
import { resolveStudyConfig } from "@/lib/worksheet-study/types";
import { loadWorksheetViewerDoc } from "../doc-loader";
import { WViewerClient } from "../w-viewer-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "학습지 | SMOAT",
  robots: { index: false, follow: false },
};

export default async function WorksheetDocPage({
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
    return <DocFallback title="학습지를 열 수 없습니다" />;
  }

  if (
    task.taskStatus !== "DONE" &&
    (isTaskLocked(task.availableFrom, new Date()) || task.assignmentStatus === "CLOSED")
  ) {
    return (
      <DocFallback
        title="아직 열람할 수 없는 학습지입니다"
        message="열람 기간이 아니거나 마감된 과제입니다. 궁금한 점은 선생님께 문의해 주세요."
      />
    );
  }

  const loaded = await loadWorksheetViewerDoc(task.refId, session.academyId);
  if (!loaded) {
    return <DocFallback title="학습지를 불러올 수 없습니다" />;
  }

  await markTaskInProgress(task.taskId, session.studentId);

  const config = resolveStudyConfig(task.payload);
  const studyRequired = config.mode !== "off" && config.required;

  return (
    <WViewerClient
      taskId={task.taskId}
      title={task.title}
      instructions={task.instructions}
      initialDone={task.taskStatus === "DONE"}
      doc={loaded.doc}
      backHref={`/g/w/${task.taskId}`}
      completion={studyRequired && task.taskStatus !== "DONE" ? "study" : "button"}
    />
  );
}

/** 로드 실패/잠금 안내 — 학생 친화 문구(합니다체) + 과제 목록 복귀 */
function DocFallback({
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
