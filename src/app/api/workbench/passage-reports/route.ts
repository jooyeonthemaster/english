import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { buildReportFromAnalysis, computeReportContentHash } from "@/lib/passage-report/adapter";
import { reportDocumentSchema, templateIdSchema } from "@/lib/passage-report/schema";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

// ────────────────────────────────────────────────────────────
// POST /api/workbench/passage-reports
// 빈 보고서 생성 또는 PassageAnalysis 기반 변환
// ────────────────────────────────────────────────────────────

const createBodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("EMPTY"),
    passageId: z.string().min(1),
    templateId: templateIdSchema,
    title: z.string().min(1).max(120).optional(),
  }),
  z.object({
    mode: z.literal("FROM_ANALYSIS"),
    passageId: z.string().min(1),
    templateId: templateIdSchema,
    title: z.string().min(1).max(120).optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "요청 검증 실패", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { passageId, templateId, title } = parsed.data;

  // 지문 권한 확인 — 같은 academy의 지문만 가능
  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    include: { analysis: true },
  });
  if (!passage || passage.academyId !== staff.academyId) {
    return NextResponse.json({ error: "지문을 찾을 수 없습니다." }, { status: 404 });
  }

  // FROM_ANALYSIS: 분석이 있어야 함
  if (parsed.data.mode === "FROM_ANALYSIS" && !passage.analysis) {
    return NextResponse.json(
      { error: "이 지문은 아직 분석이 완료되지 않았습니다. EMPTY 모드로 시작하세요." },
      { status: 400 },
    );
  }

  // 보고서 문서 빌드
  let documentTitle = title ?? `${passage.title} - 학습자료`;
  let document;
  let sourcedFromAnalysisId: string | null = null;

  if (parsed.data.mode === "FROM_ANALYSIS" && passage.analysis) {
    let analysisData: PassageAnalysisData;
    try {
      analysisData = JSON.parse(passage.analysis.analysisData) as PassageAnalysisData;
    } catch {
      return NextResponse.json(
        { error: "분석 데이터를 파싱할 수 없습니다." },
        { status: 500 },
      );
    }
    document = buildReportFromAnalysis({
      passage: {
        id: passage.id,
        title: passage.title,
        content: passage.content,
        publisher: passage.publisher,
        grade: passage.grade,
        semester: passage.semester,
        unit: passage.unit,
      },
      analysis: analysisData,
      templateId,
      title: documentTitle,
    });
    sourcedFromAnalysisId = passage.analysis.id;
  } else {
    // EMPTY: 템플릿 슬롯만 채우고 콘텐츠는 비워둠 (사용자가 채움)
    document = buildReportFromAnalysis({
      passage: {
        id: passage.id,
        title: passage.title,
        content: passage.content,
        publisher: passage.publisher,
        grade: passage.grade,
        semester: passage.semester,
        unit: passage.unit,
      },
      // 빈 분석 데이터로 호출 → 슬롯만 채워지고 데이터 없는 슬롯은 자동 스킵
      analysis: {
        sentences: [],
        vocabulary: [],
        grammarPoints: [],
        structure: { mainIdea: "", purpose: "", textType: "", paragraphSummaries: [], keyPoints: [] },
      },
      templateId,
      title: documentTitle,
    });
  }

  // 스키마 최종 검증
  const validation = reportDocumentSchema.safeParse(document);
  if (!validation.success) {
    return NextResponse.json(
      { error: "생성된 보고서가 스키마 검증에 실패했습니다.", details: validation.error.flatten() },
      { status: 500 },
    );
  }

  const contentHash = computeReportContentHash(validation.data);

  const report = await prisma.passageReport.create({
    data: {
      academyId: staff.academyId,
      passageId,
      title: documentTitle,
      status: "DRAFT",
      pages: validation.data.pages as never,
      theme: validation.data.theme as never,
      templateId,
      sourcedFromAnalysisId,
      contentHash,
      createdById: staff.id,
      lastEditedById: staff.id,
      lastEditedAt: new Date(),
    },
    select: {
      id: true,
      title: true,
      status: true,
      templateId: true,
      version: true,
      contentHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      id: report.id,
      title: report.title,
      status: report.status,
      templateId: report.templateId,
      version: report.version,
      contentHash: report.contentHash,
      passageId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    },
    { status: 201 },
  );
}

// ────────────────────────────────────────────────────────────
// GET /api/workbench/passage-reports?passageId=...
// 보고서 목록 (지문별 또는 academy 전체)
// ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const passageId = url.searchParams.get("passageId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 100);

  const where = {
    academyId: staff.academyId,
    deletedAt: null,
    ...(passageId ? { passageId } : {}),
  };

  const reports = await prisma.passageReport.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      passageId: true,
      title: true,
      status: true,
      templateId: true,
      version: true,
      lastEditedAt: true,
      createdAt: true,
      updatedAt: true,
      passage: {
        select: { id: true, title: true, grade: true, semester: true, unit: true },
      },
    },
  });

  return NextResponse.json({ reports });
}
