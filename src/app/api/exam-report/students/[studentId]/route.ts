// ============================================================================
// GET /api/exam-report/students/[studentId]
//   채점·리포트 화면 로드용 학생 상세. responses/scoreSummary/report/reportStatus/
//   shareToken/shareEnabled/version 을 내려보낸다. 부모 분석의 structure/analysis 는
//   포함하지 않는다(클라가 분석 상세 GET 과 조합). 진입 시 reconcileStudentReport.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { reconcileStudentReport } from "@/lib/exam-report/reconcile";
import {
  parseReadState,
  parseScoreSummary,
  parseStudentResponses,
} from "@/lib/exam-report/schemas";
import { parseStudentReportEnvelope } from "@/lib/exam-report/report-schema";
import type { ExamSubmissionMeta } from "@/components/exam-report/ui-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { studentId } = await params;

  const student = await prisma.examReportStudent.findFirst({
    // academyId 를 where 에 포함 — 타테넌트 리소스는 존재 자체를 비노출(404 통일).
    where: { id: studentId, academyId: auth.academyId, deletedAt: null },
    select: {
      id: true,
      examAnalysisId: true,
      academyId: true,
      studentName: true,
      studentMeta: true,
      sourceFiles: true,
      readState: true,
      responses: true,
      scoreSummary: true,
      gradingConfirmed: true,
      report: true,
      reportStatus: true,
      shareToken: true,
      shareEnabled: true,
      sharedAt: true,
      answerToken: true,
      answerEnabled: true,
      answerSubmittedAt: true,
      examSubmissionId: true,
      studentId: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!student) {
    return NextResponse.json(
      { error: "학생 리포트를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 진입 시 리컨실 — 내부에서 stale 아니면 즉시 현 상태 반환. GENERATING 좀비 자기치유.
  const reportStatus = await reconcileStudentReport(student);

  // INTERNAL 응시 메타(응시일·마감·과제) — 분석 탭 헤더 소스. relation-free 라
  // 명시 조인: ExamSubmission(exam.academyId 로 테넌트 가드) → StudyAssignmentTask
  // (examSubmissionId soft-ref) → StudyAssignment(dueAt/title). 제출 링크가 없거나
  // (사진 업로드 리포트) 조인 실패면 null — UI 는 부재를 허용한다.
  let submissionMeta: ExamSubmissionMeta | null = null;
  if (student.examSubmissionId) {
    const submission = await prisma.examSubmission.findFirst({
      where: {
        id: student.examSubmissionId,
        exam: { academyId: auth.academyId },
      },
      select: {
        id: true,
        status: true,
        mode: true,
        assignedAt: true,
        startedAt: true,
        submittedAt: true,
        gradedAt: true,
      },
    });
    if (submission) {
      const task = await prisma.studyAssignmentTask.findFirst({
        where: {
          examSubmissionId: submission.id,
          academyId: auth.academyId,
          // 로스터 학생 축을 함께 걸어 [studentId,...] 인덱스를 태운다
          // (examSubmissionId 는 비인덱스 — 브리지가 두 축을 같은 학생으로 기록).
          ...(student.studentId ? { studentId: student.studentId } : {}),
        },
        orderBy: { createdAt: "desc" }, // 재배포 시 최신 과제의 마감이 정본
        select: { assignmentId: true },
      });
      const assignment = task
        ? await prisma.studyAssignment.findFirst({
            where: { id: task.assignmentId, academyId: auth.academyId },
            select: { dueAt: true, title: true },
          })
        : null;
      submissionMeta = {
        submissionId: submission.id,
        status: submission.status,
        mode: submission.mode,
        assignedAt: submission.assignedAt?.toISOString() ?? null,
        // startedAt 은 @default(now()) — 실제 응시 시작 전(ASSIGNED)에는 의미가
        // 없으므로 상태로 걸러 노출한다.
        startedAt:
          submission.status !== "ASSIGNED" && submission.startedAt
            ? submission.startedAt.toISOString()
            : null,
        submittedAt: submission.submittedAt?.toISOString() ?? null,
        gradedAt: submission.gradedAt?.toISOString() ?? null,
        dueAt: assignment?.dueAt?.toISOString() ?? null,
        assignmentTitle: assignment?.title ?? null,
      };
    }
  }

  // ui-contracts ExamStudentDetail 직렬화 — report 는 envelope 의 current 만 노출
  // (previous 는 서버 보관, hasPreviousReport 로 롤백 가능 여부만 알림).
  const envelope = parseStudentReportEnvelope(student.report);
  const {
    academyId: _academyId,
    report: _report,
    responses: _responses,
    scoreSummary: _scoreSummary,
    readState: _readState,
    examSubmissionId: _examSubmissionId,
    studentId: _rosterStudentId,
    ...scalars
  } = student;
  return NextResponse.json({
    student: {
      ...scalars,
      reportStatus,
      submissionMeta,
      responses: parseStudentResponses(student.responses),
      scoreSummary: parseScoreSummary(student.scoreSummary),
      readState: parseReadState(student.readState),
      report: envelope?.current ?? null,
      hasPreviousReport: envelope?.previous != null,
    },
  });
}
