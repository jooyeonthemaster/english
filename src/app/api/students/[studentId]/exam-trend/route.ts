// ============================================================================
// /api/students/[studentId]/exam-trend — AI 추세변화 분석 (26-07-09 대개편 W7)
//
// POST: 응시 이력 집계(결정론, AI 0콜) → S4(report) 계열 모델 1콜 내러티브(합니다체)
//       → student_analytics.examTrendReport 저장. FAST 인라인 관례(generate 라우트 미러):
//   - requireStaff → Student 테넌트 가드(academyId 교차검증)
//   - 이력 0건 → 400 (과금·CAS 진입 전 차단)
//   - CAS: examTrendStatus {null,GENERATED,FAILED,좀비 GENERATING(10분+)}→GENERATING
//     (count≠1 → 409). 과금보다 CAS 를 먼저 잡는다 — 동시 요청 이중과금 차단
//     (한쪽은 409 로 무과금 이탈, exam-report generate 라우트와 동일 순서).
//   - 과금: WorkbenchAiJob(domain EXAM_TREND) + ensureWorkbenchAiJobCharged 5cr
//     (402 → examTrendStatus 원복 + 잡 FAILED)
//   - 실패: 전액 환불 + examTrendStatus FAILED + 잡 FAILED
// GET: 저장된 examTrendReport 반환(스태프 인증 + 테넌트 가드).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { InsufficientCreditsError, refundCredits } from "@/lib/credits";
import { ensureWorkbenchAiJobCharged } from "@/lib/workbench-ai-job-credit";
import { callExamReportJson, createExamReportUsage } from "@/lib/exam-report/llm";
import { getExamReportAiConfig } from "@/lib/exam-report/model-config";
import {
  EXAM_TREND_JOB_DOMAIN,
  aggregateStudentExamHistory,
  buildTrendPrompt,
  examTrendDocSchema,
  type ExamTrendReportEnvelope,
} from "@/lib/exam-scoring/trend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 라우트 시작 기준 데드라인 여유(마감 30s 전 컷 — 파싱·저장 몫). */
const DEADLINE_MARGIN_MS = 30_000;
const OPERATION = "EXAM_TREND_ANALYSIS" as const;
const TREND_COST = CREDIT_COSTS.EXAM_TREND_ANALYSIS;
/**
 * GENERATING 좀비 판정 창 — maxDuration(300s)+여유. 이보다 오래 GENERATING 이면
 * 서버 사망 잔재로 보고 재진입을 허용한다. ⚠️ StudentAnalytics.updatedAt 은
 * 다른 분석 쓰기(overallScore 등)로도 갱신되므로 좀비가 다소 연명할 수 있다
 * (보수 방향 — 이중 실행보다 안전).
 */
const STALE_GENERATING_MS = 10 * 60_000;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** 학생 로드 + 테넌트 가드 — 다른 학원 studentId 로는 존재 여부도 노출하지 않는다(404). */
async function loadStudent(studentId: string, academyId: string) {
  return prisma.student.findFirst({
    where: { id: studentId, academyId },
    select: { id: true, name: true },
  });
}

// ── GET: 저장된 추세 리포트 조회 ─────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { studentId } = await params;

  const student = await loadStudent(studentId, auth.academyId);
  if (!student) {
    return NextResponse.json(
      { error: "학생을 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const analytics = await prisma.studentAnalytics.findUnique({
    where: { studentId },
    select: {
      examTrendReport: true,
      examTrendStatus: true,
      examTrendGeneratedAt: true,
    },
  });

  return NextResponse.json({
    report: analytics?.examTrendReport ?? null,
    status: analytics?.examTrendStatus ?? null,
    generatedAt: analytics?.examTrendGeneratedAt ?? null,
  });
}

// ── POST: 추세 리포트 생성(5cr) ──────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const requestStartedAt = Date.now();
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { studentId } = await params;

  const student = await loadStudent(studentId, auth.academyId);
  if (!student) {
    return NextResponse.json(
      { error: "학생을 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // ── 응시 이력 집계(결정론) — 0건이면 과금·CAS 진입 전에 차단 ────────────────
  const history = await aggregateStudentExamHistory(studentId, auth.academyId);
  if (history.length === 0) {
    return NextResponse.json(
      {
        error: "채점이 완료된 응시 기록이 없습니다. 시험 응시와 채점을 완료한 후 다시 시도해 주십시오.",
        code: "NO_HISTORY",
      },
      { status: 400 },
    );
  }

  // ── StudentAnalytics 행 확보(1:1 upsert 대용) + 직전 상태 스냅샷 ─────────────
  // upsert(update:{}) 는 @updatedAt 만 갱신해 좀비 GENERATING 의 신선도를 연장하는
  // 함정이 있어(재시도할수록 좀비가 영생) findUnique→create 경합 흡수로 대체한다.
  let analytics = await prisma.studentAnalytics.findUnique({
    where: { studentId },
    select: { examTrendStatus: true },
  });
  if (!analytics) {
    await prisma.studentAnalytics
      .create({ data: { studentId } })
      .catch(() => undefined); // P2002(동시 생성 경합) — 이미 있으면 그대로 진행
    analytics = { examTrendStatus: null };
  }
  const priorStatus = analytics.examTrendStatus;

  // ── CAS 진입: GENERATING 선점(이미 생성 중이면 409 — 무과금 이탈) ────────────
  const staleBefore = new Date(Date.now() - STALE_GENERATING_MS);
  const cas = await prisma.studentAnalytics.updateMany({
    where: {
      studentId,
      OR: [
        { examTrendStatus: null },
        { examTrendStatus: { in: ["GENERATED", "FAILED"] } },
        // 좀비 자기치유: 마감(300s)을 한참 지난 GENERATING 은 사망 잔재로 간주
        { examTrendStatus: "GENERATING", updatedAt: { lt: staleBefore } },
      ],
    },
    data: { examTrendStatus: "GENERATING" },
  });
  if (cas.count !== 1) {
    return NextResponse.json(
      { error: "이미 추세 분석을 생성 중입니다.", code: "ALREADY_GENERATING" },
      { status: 409 },
    );
  }

  // ── 과금용 잡 생성 + 5cr 차감(멱등) ─────────────────────────────────────────
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: auth.academyId,
      createdById: auth.id,
      domain: EXAM_TREND_JOB_DOMAIN,
      status: "PROCESSING",
      title: `${student.name} — AI 추세변화 분석`,
      requestedCount: 1,
      startedAt: new Date(),
      config: { fastPath: true, studentId, sittings: history.length },
    },
  });

  let creditTxId: string | null = null;
  try {
    const credit = await ensureWorkbenchAiJobCharged({
      jobId: job.id,
      academyId: auth.academyId,
      staffId: auth.id,
      operationType: OPERATION,
      metadata: { studentId, sittings: history.length, creditCost: TREND_COST },
      creditCost: TREND_COST,
    });
    creditTxId = credit.transactionId;
  } catch (err) {
    // 402/차감 실패 — 상태 원복(환불 없음: 차감 자체가 안 됨).
    // 직전이 좀비 GENERATING 이었다면 GENERATING 으로 되돌리지 않고 FAILED 로 마감.
    await prisma.studentAnalytics.updateMany({
      where: { studentId, examTrendStatus: "GENERATING" },
      data: { examTrendStatus: priorStatus === "GENERATING" ? "FAILED" : priorStatus },
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
        {
          error: "크레딧이 부족합니다.",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
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
      { error: "추세 분석을 시작하지 못했습니다.", code: "CHARGE_FAILED" },
      { status: 500 },
    );
  }

  // ── 생성 실행: S4(report) 계열 1콜 → zod 검증 → 저장 ────────────────────────
  try {
    const usage = createExamReportUsage();
    const { systemPrompt, userPrompt } = buildTrendPrompt(history, student.name);
    const doc = await callExamReportJson({
      stage: "report", // S4 내러티브 계열 그대로(model-config — 모델 인하 금지 주석 준수)
      systemPrompt,
      userPrompt,
      schema: examTrendDocSchema,
      deadlineAt: requestStartedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS,
      usage,
    });

    const envelope: ExamTrendReportEnvelope = {
      doc,
      history, // 생성 시점 집계 스냅샷 — UI 차트/전환 하이라이트 소스
      generatedAt: new Date().toISOString(), // 서버 시각(클라이언트 시각 불신)
      model: getExamReportAiConfig("report").model,
      usage,
    };

    // 최종 쓰기는 아직 GENERATING(우리가 CAS 로 잡은 상태)일 때만 커밋 — 상태 이탈
    // 시 결과 폐기+환불(다른 실행 결과 클로버 방지, generate 라우트 §finalWrite 미러).
    const finalWrite = await prisma.studentAnalytics.updateMany({
      where: { studentId, examTrendStatus: "GENERATING" },
      data: {
        examTrendReport: toJson(envelope),
        examTrendStatus: "GENERATED",
        examTrendGeneratedAt: new Date(),
      },
    });

    if (finalWrite.count === 0) {
      if (creditTxId) {
        await refundCredits(
          auth.academyId,
          OPERATION,
          creditTxId,
          "추세 분석 생성 중단(상태 이탈) — 전액 환불",
          TREND_COST,
        ).catch((refundErr) => console.error("[exam-trend] refund failed", refundErr));
      }
      await prisma.workbenchAiJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: "Trend write skipped: examTrendStatus no longer GENERATING",
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          error: "추세 분석 생성이 중단되었습니다. 크레딧은 환불되었습니다. 다시 시도해 주십시오.",
          code: "TREND_WRITE_SKIPPED",
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
          studentId,
          sittings: history.length,
          usage,
          fastPath: true,
          totalRunMs: Date.now() - requestStartedAt,
        }),
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ report: envelope });
  } catch (err) {
    // 실패: 전액 환불 + examTrendStatus FAILED + 잡 FAILED.
    if (creditTxId) {
      await refundCredits(
        auth.academyId,
        OPERATION,
        creditTxId,
        "추세 분석 생성 실패 — 전액 환불",
        TREND_COST,
      ).catch((refundErr) => console.error("[exam-trend] refund failed", refundErr));
    }
    await prisma.studentAnalytics.updateMany({
      where: { studentId },
      data: { examTrendStatus: "FAILED" },
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
        error: "일시적인 문제로 추세 분석을 완성하지 못했습니다. 크레딧은 환불되었습니다. 잠시 후 다시 시도해 주십시오.",
        code: "TREND_GENERATION_FAILED",
      },
      { status: 502 },
    );
  }
}
