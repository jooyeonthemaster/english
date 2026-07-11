// ============================================================================
// /g/w/[taskId] — 학생 앱 학습지 뷰어 (서버 가드 + 문서 로드)
//
// 세션 가드 → WORKSHEET 태스크 소유 검증 → refId 로 PassageReport 로드
// (academyId 스코프·deletedAt null) → 문서 판별:
//   - generationPlan PRIME/PRIME_KO(또는 모양 폴백) → AnalysisReport 렌더
//   - 그 외 → Phase2 reportDocumentSchema(pages/blocks) 렌더
// 열람 진입 시 markTaskInProgress(멱등). 로드 실패는 친절한 안내로 종결 —
// 학생에게 스택/기술 문구를 노출하지 않는다. 문구는 전부 합니다체.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileX } from "lucide-react";
import { PRIME_REPORT_MARKERS } from "@/actions/workbench/passage-constants";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { reportDocumentSchema } from "@/lib/passage-report/schema";
import { prisma } from "@/lib/prisma";
import { isTaskLocked } from "@/lib/study-assignments/status";
import {
  loadOwnedStudentTask,
  markTaskInProgress,
} from "@/lib/study-assignments/student-runtime";
import { WViewerClient, type WorksheetViewerDoc } from "./w-viewer-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "학습지 | SMOAT",
  robots: { index: false, follow: false },
};

export default async function WorksheetViewerPage({
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
  // 학생 카드(actionHref null)와 동일 규칙. dueAt 지남은 잠그지 않으며,
  // 이미 완료(DONE)한 학습지는 CLOSED 이후에도 읽기 전용 재열람을 허용한다.
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

  const report = task.refId
    ? await prisma.passageReport.findFirst({
        where: { id: task.refId, academyId: session.academyId, deletedAt: null },
        select: { id: true, title: true, theme: true, pages: true, generationPlan: true },
      })
    : null;
  if (!report) {
    return <ViewerFallback title="학습지를 불러올 수 없습니다" />;
  }

  // ── 문서 판별 — PRIME 계열(A4 분석 보고서) vs Phase2(pages/blocks 자유 편집) ──
  let doc: WorksheetViewerDoc | null = null;
  if (PRIME_REPORT_MARKERS.includes(report.generationPlan)) {
    const prime = parseAnalysisReportForPreview(report.pages);
    if (prime) doc = { type: "PRIME", report: prime };
  } else {
    const parsed = reportDocumentSchema.safeParse({
      id: report.id,
      title: report.title,
      theme: report.theme,
      pages: report.pages,
    });
    if (parsed.success) {
      doc = { type: "PAGES", document: parsed.data };
    } else {
      // 마커가 어긋난 구버전 대비 — 모양이 PRIME 이면 PRIME 으로 구제.
      const prime = parseAnalysisReportForPreview(report.pages);
      if (prime) doc = { type: "PRIME", report: prime };
    }
  }
  if (!doc) {
    return <ViewerFallback title="학습지를 불러올 수 없습니다" />;
  }

  // 열람 시작 마킹 — ASSIGNED 일 때만 IN_PROGRESS 로 승격(멱등)
  await markTaskInProgress(task.taskId, session.studentId);

  return (
    <WViewerClient
      taskId={task.taskId}
      title={task.title}
      instructions={task.instructions}
      initialDone={task.taskStatus === "DONE"}
      doc={doc}
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
