import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { generateLearningWorksheet } from "@/lib/passage-report/analysis-report/generate";
import { analysisReportSchema, type AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import { prisma } from "@/lib/prisma";

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
      content: true,
      grade: true,
      school: { select: { type: true } },
    },
  });
  if (!passage || passage.academyId !== staff.academyId) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
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
    return NextResponse.json({ error: `생성 중 오류: ${String(e).slice(0, 200)}` }, { status: 500 });
  }

  if (!worksheet.ok) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "실전 학습지 생성 실패", cost);
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

  return NextResponse.json({ report: mergedReport, reportId: updated.id });
}
