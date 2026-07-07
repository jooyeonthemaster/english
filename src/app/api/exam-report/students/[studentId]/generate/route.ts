// ============================================================================
// POST /api/exam-report/students/[studentId]/generate
//   학생 1명의 상담 리포트(StudentReportDoc)를 생성한다. FAST 인라인 관례:
//   - requireStaff → 학생+부모 분석 소유·deletedAt 검증, 부모 status ANALYZED 게이트
//   - CAS: reportStatus {NONE,FAILED,GENERATED}→GENERATING (count≠1 → 409)
//   - 과금: WorkbenchAiJob(domain EXAM_STUDENT_REPORT) + ensureWorkbenchAiJobCharged
//           (402 → reportStatus 원복 + 잡 FAILED)
//   - 실행: grading(결정론 수치) → report-assemble(골격) → S4 내러티브(AI) →
//           mergeNarrative → (기존 있으면) mergePreservedFields + previous 슬롯 보관
//   - 실패: 전액 환불 + reportStatus FAILED + 잡 FAILED
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { InsufficientCreditsError, refundCredits } from "@/lib/credits";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { EXAM_STUDENT_REPORT_JOB_DOMAIN } from "@/lib/exam-report/types";
import type { ExamType } from "@/lib/exam-report/types";
import { reconcileStudentReport } from "@/lib/exam-report/reconcile";
import {
  parseExamAnalysisResult,
  parseExamMap,
  parseScoreSummary,
  parseStudentResponses,
} from "@/lib/exam-report/schemas";
import {
  parseStudentReportEnvelope,
  type StudentReportEnvelope,
} from "@/lib/exam-report/report-schema";
import {
  computeDataLevel,
  computeScoreSummary,
  normalizeResponses,
} from "@/lib/exam-report/grading";
import {
  assembleReportSkeleton,
  mergeNarrativeIntoDoc,
  mergePreservedFields,
} from "@/lib/exam-report/report-assemble";
import { generateStudentReportNarrative } from "@/lib/exam-report/report-generate";
import { createExamReportUsage } from "@/lib/exam-report/llm";
import type { ExamReportMeta } from "@/lib/exam-report/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 라우트 시작 기준 데드라인 여유(마감 30s 전 컷 — S4 파싱·저장 몫). */
const DEADLINE_MARGIN_MS = 30_000;
const OPERATION = "EXAM_STUDENT_REPORT" as const;
const REPORT_COST = CREDIT_COSTS.EXAM_STUDENT_REPORT;

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "시험",
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function formatDateLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function normalizeExamType(value: string): ExamType {
  return value === "MIDTERM" || value === "FINAL" || value === "MOCK" || value === "OTHER"
    ? value
    : "OTHER";
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const requestStartedAt = Date.now();
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { studentId } = await params;

  // ── 학생 + 부모 분석 로드(테넌트 가드) ──────────────────────────────────────
  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: auth.academyId, deletedAt: null },
    select: {
      id: true,
      examAnalysisId: true,
      studentName: true,
      responses: true,
      scoreSummary: true,
      gradingConfirmed: true,
      report: true,
      reportStatus: true,
      updatedAt: true,
      version: true,
      examAnalysis: {
        select: {
          id: true,
          title: true,
          schoolName: true,
          grade: true,
          examType: true,
          status: true,
          structure: true,
          analysis: true,
          deletedAt: true,
          academy: { select: { name: true } },
        },
      },
    },
  });

  if (!student || student.examAnalysis.deletedAt) {
    return NextResponse.json(
      { error: "학생 리포트를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 부모 분석이 ANALYZED 여야 리포트를 만들 수 있다(문항 분석 완료 전제).
  if (student.examAnalysis.status !== "ANALYZED") {
    return NextResponse.json(
      { error: "문항 분석이 완료된 후에 리포트를 생성할 수 있습니다.", code: "NOT_ANALYZED" },
      { status: 400 },
    );
  }

  // 정오표 확정 게이트(오독 방어선): 강사가 정오를 확정한 뒤에만 리포트를 생성한다.
  // 점수가 학부모 공유 리포트에 실리므로, 직접 API 호출을 포함해 서버에서 강제한다.
  if (student.gradingConfirmed !== true) {
    return NextResponse.json(
      { error: "정오표를 확정한 후에 리포트를 생성할 수 있습니다.", code: "NOT_CONFIRMED" },
      { status: 400 },
    );
  }

  const structure = parseExamMap(student.examAnalysis.structure);
  const analysis = parseExamAnalysisResult(student.examAnalysis.analysis);
  if (!structure || !analysis) {
    return NextResponse.json(
      { error: "시험지 구조·분석 데이터가 없습니다.", code: "STRUCTURE_MISSING" },
      { status: 400 },
    );
  }

  // ── 좀비 자기치유 후 CAS 진입 ──────────────────────────────────────────────
  const priorStatus = await reconcileStudentReport(student);

  const cas = await prisma.examReportStudent.updateMany({
    where: {
      id: studentId,
      academyId: auth.academyId,
      deletedAt: null,
      reportStatus: { in: ["NONE", "FAILED", "GENERATED"] },
    },
    data: { reportStatus: "GENERATING" },
  });
  if (cas.count !== 1) {
    return NextResponse.json(
      { error: "이미 리포트를 생성 중입니다.", code: "ALREADY_GENERATING" },
      { status: 409 },
    );
  }

  // ── 과금용 잡 생성 ─────────────────────────────────────────────────────────
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: auth.academyId,
      createdById: auth.id,
      domain: EXAM_STUDENT_REPORT_JOB_DOMAIN,
      status: "PROCESSING",
      title: `${student.studentName} — ${student.examAnalysis.title}`,
      requestedCount: 1,
      startedAt: new Date(),
      config: {
        fastPath: true,
        examAnalysisId: student.examAnalysisId,
        studentId: student.id,
      },
    },
  });

  let creditTxId: string | null = null;
  try {
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: auth.academyId,
      staffId: auth.id,
      operationType: OPERATION,
      metadata: {
        examAnalysisId: student.examAnalysisId,
        studentId: student.id,
        creditCost: REPORT_COST,
        fastPath: true,
      },
      creditCost: REPORT_COST,
    });
    creditTxId = credit.transactionId;
  } catch (err) {
    // 402 — 상태 원복(잡 실패), 환불 없음(차감 실패).
    await prisma.examReportStudent.updateMany({
      where: { id: studentId, academyId: auth.academyId },
      data: { reportStatus: priorStatus },
    });
    if (err instanceof InsufficientCreditsError) {
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: `Insufficient credits: have ${err.currentBalance}, need ${err.requiredCredits}`,
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "크레딧이 부족합니다.", balance: err.currentBalance, required: err.requiredCredits },
        { status: 402 },
      );
    }
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "리포트 생성을 시작하지 못했습니다.", code: "CHARGE_FAILED" },
      { status: 500 },
    );
  }

  // ── 생성 실행 ──────────────────────────────────────────────────────────────
  try {
    const responses = normalizeResponses(structure, parseStudentResponses(student.responses));
    const priorSummary = parseScoreSummary(student.scoreSummary);
    const scoreSummary = computeScoreSummary(structure, responses, {
      classAverage: priorSummary?.classAverage ?? null,
      gradeBand: priorSummary?.gradeBand ?? null,
    });
    const dataLevel = computeDataLevel(structure, responses, {
      classAverage: priorSummary?.classAverage ?? null,
    });

    const examMeta: ExamReportMeta = {
      title: student.examAnalysis.title,
      schoolName: student.examAnalysis.schoolName ?? undefined,
      grade: student.examAnalysis.grade ?? undefined,
      examType: normalizeExamType(student.examAnalysis.examType),
    };
    const examLabel =
      [student.examAnalysis.schoolName, student.examAnalysis.grade, EXAM_TYPE_LABEL[examMeta.examType]]
        .filter((part): part is string => Boolean(part && part.length > 0))
        .join(" ") || student.examAnalysis.title;
    const academyName = student.examAnalysis.academy.name;
    const dateLabel = formatDateLabel(new Date());

    const skeleton = assembleReportSkeleton({
      structure,
      analysis,
      responses,
      scoreSummary,
      dataLevel,
      studentName: student.studentName,
      examLabel,
      academyName,
      dateLabel,
    });

    const usage = createExamReportUsage();
    const narrative = await generateStudentReportNarrative({
      structure,
      analysis,
      responses,
      scoreSummary,
      dataLevel,
      studentName: student.studentName,
      examMeta,
      // 결정론 골격을 데이터로 전달 — S4 가 유형별 손실·함정 적중 m/n·개념 지도 등
      // 확정 집계를 근거로 서술한다(report-generate 는 report-assemble 미참조 계약).
      skeletonDoc: skeleton,
      deadlineAt: requestStartedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS,
      usage,
    });

    let mergedDoc = mergeNarrativeIntoDoc(skeleton, narrative);

    // 기존 리포트가 있으면 강사 수정본(테마·표지·hidden·총평) 보존 머지 +
    // 직전 current 를 previous 슬롯에 1개 보관(롤백 대상).
    const priorEnvelope = parseStudentReportEnvelope(student.report);
    let envelope: StudentReportEnvelope;
    if (priorEnvelope?.current) {
      mergedDoc = mergePreservedFields(mergedDoc, priorEnvelope.current);
      envelope = { current: mergedDoc, previous: priorEnvelope.current };
    } else {
      envelope = { current: mergedDoc };
    }

    // 최종 쓰기는 reportStatus 가 아직 GENERATING 일 때만 커밋한다(우리가 CAS 로 잡은 그 상태).
    // 생성이 진행되는 동안 리컨실이 좀비로 판정해 FAILED 로 되돌렸거나(장시간 실행) 상태가
    // 이탈한 경우 이 쓰기는 count 0 이 되어, 채점/편집 결과를 클로버하지 않고 폐기+환불한다.
    // version 을 증가시켜 클라이언트 버전 추적을 앞당겨 스퓨리어스 VERSION_CONFLICT 도 막는다.
    const finalWrite = await prisma.examReportStudent.updateMany({
      where: {
        id: studentId,
        academyId: auth.academyId,
        reportStatus: "GENERATING",
      },
      data: {
        report: toJson(envelope),
        reportStatus: "GENERATED",
        scoreSummary: toJson(scoreSummary),
        version: { increment: 1 },
      },
    });

    if (finalWrite.count === 0) {
      // 리컨실(또는 외부 상태 전이)이 GENERATING 을 벗어나게 만든 경우 — 결과를 버리고 환불.
      // reportStatus 는 건드리지 않는다(리컨실이 이미 FAILED 로 마감했다).
      if (creditTxId) {
        await refundCredits(
          auth.academyId,
          OPERATION,
          creditTxId,
          "학생 리포트 생성 중단(리컨실) — 전액 환불",
          REPORT_COST,
        ).catch((refundErr) => console.error("[exam-report] report refund failed", refundErr));
      }
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: "Report write skipped: reportStatus no longer GENERATING (reconciled)",
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "리포트 생성이 중단되었습니다. 크레딧은 환불됐어요. 다시 시도해주세요.",
          code: "REPORT_WRITE_SKIPPED",
        },
        { status: 409 },
      );
    }

    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successCount: 1,
        failedCount: 0,
        resultCount: 1,
        result: toJson({
          examAnalysisId: student.examAnalysisId,
          studentId: student.id,
          dataLevel,
          usage,
          fastPath: true,
          totalRunMs: Date.now() - requestStartedAt,
        }),
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ report: envelope });
  } catch (err) {
    // 실패: 전액 환불 + reportStatus FAILED + 잡 FAILED.
    if (creditTxId) {
      await refundCredits(
        auth.academyId,
        OPERATION,
        creditTxId,
        "학생 리포트 생성 실패 — 전액 환불",
        REPORT_COST,
      ).catch((refundErr) => console.error("[exam-report] report refund failed", refundErr));
    }
    await prisma.examReportStudent.updateMany({
      where: { id: studentId, academyId: auth.academyId },
      data: { reportStatus: "FAILED" },
    });
    await prisma.workbenchAiJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        failedCount: 1,
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    return NextResponse.json(
      {
        error: "일시적인 문제로 리포트를 완성하지 못했어요. 크레딧은 환불됐어요. 잠시 후 다시 시도해주세요.",
        code: "REPORT_GENERATION_FAILED",
      },
      { status: 502 },
    );
  }
}
