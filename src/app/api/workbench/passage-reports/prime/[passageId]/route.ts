import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { generateAnalysisReportCore } from "@/lib/passage-report/analysis-report/generate";
import { analysisReportSchema } from "@/lib/passage-report/analysis-report/schema";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

const PRIME_MARKER = "PRIME";

/**
 * GET — 기존 PRIME 분석 보고서 조회 (있으면 모달이 바로 렌더)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  const row = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: PRIME_MARKER, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, pages: true, updatedAt: true },
  });
  if (!row) return NextResponse.json({ report: null });

  const parsed = analysisReportSchema.safeParse(row.pages);
  if (!parsed.success) return NextResponse.json({ report: null });
  return NextResponse.json({ report: parsed.data, reportId: row.id, updatedAt: row.updatedAt });
}

/**
 * PATCH — 편집기에서 수정한 PRIME 보고서를 저장 (크레딧 차감 없음, 재생성 아님)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const { passageId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const parsed = analysisReportSchema.safeParse((body as { report?: unknown })?.report);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `보고서 형식이 올바르지 않습니다: ${parsed.error.issues[0]?.message ?? ""}` },
      { status: 400 },
    );
  }
  const report = parsed.data;

  const existing = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: PRIME_MARKER, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "수정할 보고서를 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.passageReport.update({
    where: { id: existing.id },
    data: {
      title: report.meta.titleKo,
      pages: report as never,
      theme: { themeId: report.themeId } as never,
      lastEditedById: staff.id,
      lastEditedAt: new Date(),
      version: { increment: 1 },
    },
    select: { id: true },
  });

  return NextResponse.json({ report, reportId: updated.id });
}

/**
 * POST — 지문으로 PRIME A4 분석 보고서 생성 (크레딧 차감) → 저장 → 반환
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
      id: true, academyId: true, title: true, content: true,
      grade: true, school: { select: { type: true } },
    },
  });
  if (!passage || passage.academyId !== staff.academyId) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  const academy = await prisma.academy.findUnique({
    where: { id: staff.academyId },
    select: { name: true },
  });

  const cost = CREDIT_COSTS.PASSAGE_ANALYSIS;
  let tx: { transactionId: string };
  try {
    tx = await deductCredits(staff.academyId, "PASSAGE_ANALYSIS", staff.id, { passageId, kind: "PRIME_REPORT" }, cost);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "크레딧이 부족합니다", balance: err.currentBalance, required: err.requiredCredits },
        { status: 402 },
      );
    }
    throw err;
  }

  let result;
  try {
    // 기본 분석 = 메인 보고서(5섹션)만 1회 호출. 실전 학습지(06)는 옵트인 별도 생성.
    result = await generateAnalysisReportCore({
      passageContent: passage.content,
      schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
      grade: passage.grade,
      brand: academy?.name ?? "ENGLISH READING LAB",
    });
  } catch (e) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "PRIME 생성 예외", cost);
    return NextResponse.json({ error: `생성 중 오류: ${String(e).slice(0, 200)}` }, { status: 500 });
  }

  if (!result.ok) {
    await refundCredits(staff.academyId, "PASSAGE_ANALYSIS", tx.transactionId, "PRIME 생성 실패", cost);
    return NextResponse.json({ error: `보고서 생성 실패: ${result.error}` }, { status: 502 });
  }

  const report = result.report;

  // 기존 PRIME 보고서 있으면 갱신, 없으면 생성 (passage당 1개)
  const existing = await prisma.passageReport.findFirst({
    where: { passageId, academyId: staff.academyId, generationPlan: PRIME_MARKER, deletedAt: null },
    select: { id: true, version: true },
  });

  const data = {
    title: report.meta.titleKo,
    status: "PUBLISHED",
    pages: report as never, // AnalysisReport JSON 전체를 pages(Json)에 저장
    theme: { themeId: report.themeId } as never,
    templateId: "prime",
    generationPlan: PRIME_MARKER,
    lastEditedById: staff.id,
    lastEditedAt: new Date(),
  };

  let reportId: string;
  if (existing) {
    const u = await prisma.passageReport.update({
      where: { id: existing.id },
      data: { ...data, version: { increment: 1 } },
      select: { id: true },
    });
    reportId = u.id;
  } else {
    const c = await prisma.passageReport.create({
      data: { academyId: staff.academyId, passageId, createdById: staff.id, ...data },
      select: { id: true },
    });
    reportId = c.id;
  }

  return NextResponse.json({ report, reportId });
}
