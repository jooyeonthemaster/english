import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { generateLearningWorksheet } from "@/lib/passage-report/analysis-report/generate";
import { isKoreanPassage } from "@/lib/passage-report/analysis-report/ko-entry";
import { analysisReportSchema, type AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import { prisma } from "@/lib/prisma";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PRIME_MARKER = "PRIME";

/**
 * POST — 기존 PRIME 분석 보고서에 "06 실전 학습지"(learning-worksheet) 섹션을
 * 옵트인으로 추가 생성·병합한다.
 *
 * 기본 분석(5섹션)은 generateAnalysisReportCore 1회 호출로 끝나고, 이 라우트가
 * 워크북(어법 선택·어휘 빈칸·배열) + 수능추론 5문항을 별도 2회 호출로 생성해 붙인다.
 * 멱등: learning-worksheet 섹션이 이미 있으면 교체(=재생성), 없으면 추가.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    select: {
      id: true,
      academyId: true,
      title: true,
      content: true,
      grade: true,
      subject: true,
      school: { select: { type: true } },
    },
  });
  if (!passage || passage.academyId !== staff.academyId) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  // PRIME_KO 게이트 — 실전 학습지(영어 워크북·수능추론)는 영어 전용 생성기라 국어 지문 차단.
  // 국어 분석 보고서(PRIME_KO)에는 확인 문제(ko-check-quiz)가 이미 포함된다.
  if (isKoreanPassage(passage)) {
    return NextResponse.json(
      { error: "국어 지문은 실전 학습지(영어 워크북)를 지원하지 않습니다. 국어 분석 보고서에 확인 문제가 포함돼 있어요." },
      { status: 400 },
    );
  }

  // 메인 분석 보고서(5섹션)가 있어야 워크시트를 그 위에 붙일 수 있다.
  const existing = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: PRIME_MARKER, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, pages: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "먼저 분석 보고서를 생성하세요." }, { status: 404 });
  }
  const parsedReport = analysisReportSchema.safeParse(existing.pages);
  if (!parsedReport.success) {
    return NextResponse.json({ error: "분석 보고서 형식이 올바르지 않습니다." }, { status: 422 });
  }
  const baseReport: AnalysisReport = parsedReport.data;

  // ── 잡 수명주기(검수 M3) — 동기 실행이라 잡이 없으면 진행 상태가 서버 어디에도 없어,
  // 생성 중 새로고침·타 스태프 화면에서 버튼이 재활성돼 5크레딧 이중 차감 창이 열린다.
  // 지문당 활성 1잡 검사로 부분 분석(fast 라우트)과도 상호 배제된다(스펙 §3.4 특례 ③).
  await cleanupStaleWorkbenchAiJobs({
    academyId: staff.academyId,
    domain: "PASSAGE_ANALYSIS",
    passageId: passage.id,
  });
  const active = await prisma.workbenchAiJob.findFirst({
    where: {
      academyId: staff.academyId,
      domain: "PASSAGE_ANALYSIS",
      passageId: passage.id,
      status: { in: ["PENDING", "PROCESSING"] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json(
      { error: "이미 진행 중인 생성이 있습니다. 완료된 뒤 다시 시도해 주세요." },
      { status: 409 },
    );
  }

  const cost = CREDIT_COSTS.PASSAGE_ANALYSIS;
  let tx: { transactionId: string };
  try {
    tx = await deductCredits(
      staff.academyId,
      "PASSAGE_ANALYSIS",
      staff.id,
      { passageId, kind: "PRACTICE_WORKBOOK" },
      cost,
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
        { status: 402 },
      );
    }
    throw err;
  }

  // 과금 직후·생성(수 분) 직전에 잡을 연다 — config.includeWorksheet 는
  // getStudioPassageDetail 의 실전 생성 중 판정(worksheetJobActive)이 읽는 키다.
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      domain: "PASSAGE_ANALYSIS",
      status: "PROCESSING",
      title: passage.title,
      passageId: passage.id,
      mode: "FULL",
      requestedCount: 1,
      startedAt: new Date(),
      config: { includeWorksheet: true, worksheetOnly: true },
    },
  });
  const closeJob = async (data: Record<string, unknown>) => {
    await prisma.workbenchAiJob
      .update({ where: { id: job.id }, data: { ...data, completedAt: new Date() } })
      .catch((e) => console.error("worksheet job close failed", e));
  };

  let worksheet;
  try {
    worksheet = await generateLearningWorksheet(
      {
        passageContent: passage.content,
        schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
        grade: passage.grade,
      },
      baseReport,
    );
  } catch (e) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "실전 학습지 생성 예외", cost);
    await closeJob({ status: "FAILED", failedCount: 1, errorMessage: String(e).slice(0, 300) });
    return NextResponse.json({ error: `생성 중 오류: ${String(e).slice(0, 200)}` }, { status: 500 });
  }

  if (!worksheet.ok) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "실전 학습지 생성 실패", cost);
    await closeJob({ status: "FAILED", failedCount: 1, errorMessage: worksheet.error.slice(0, 300) });
    return NextResponse.json({ error: `실전 학습지 생성 실패: ${worksheet.error}` }, { status: 502 });
  }

  // 멱등 병합: 기존 learning-worksheet 섹션 제거 후 새로 추가.
  const mergedReport: AnalysisReport = {
    ...baseReport,
    sections: [
      ...baseReport.sections.filter((s) => s.kind !== "learning-worksheet"),
      worksheet.section,
    ],
  };

  const updated = await prisma.passageReport.update({
    where: { id: existing.id },
    data: {
      pages: mergedReport as never,
      lastEditedById: staff.id,
      lastEditedAt: new Date(),
      version: { increment: 1 },
    },
    select: { id: true },
  });

  await closeJob({
    status: "COMPLETED",
    successCount: 1,
    resultCount: 1,
    result: { worksheetOnly: true, reportId: updated.id },
  });

  return NextResponse.json({ report: mergedReport, reportId: updated.id });
}
