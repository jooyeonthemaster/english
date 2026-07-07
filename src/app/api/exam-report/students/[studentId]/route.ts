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

  // ui-contracts ExamStudentDetail 직렬화 — report 는 envelope 의 current 만 노출
  // (previous 는 서버 보관, hasPreviousReport 로 롤백 가능 여부만 알림).
  const envelope = parseStudentReportEnvelope(student.report);
  const {
    academyId: _academyId,
    report: _report,
    responses: _responses,
    scoreSummary: _scoreSummary,
    readState: _readState,
    ...scalars
  } = student;
  return NextResponse.json({
    student: {
      ...scalars,
      reportStatus,
      responses: parseStudentResponses(student.responses),
      scoreSummary: parseScoreSummary(student.scoreSummary),
      readState: parseReadState(student.readState),
      report: envelope?.current ?? null,
      hasPreviousReport: envelope?.previous != null,
    },
  });
}
