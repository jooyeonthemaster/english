import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { computeReportContentHash } from "@/lib/passage-report/adapter";
import { pageSchema, reportThemeSchema } from "@/lib/passage-report/schema";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

// ────────────────────────────────────────────────────────────
// GET /api/workbench/passage-reports/[id]
// 단일 보고서 (편집 화면 진입 시)
// ────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const report = await prisma.passageReport.findUnique({
    where: { id },
    include: {
      passage: {
        select: {
          id: true,
          title: true,
          content: true,
          grade: true,
          semester: true,
          unit: true,
          publisher: true,
        },
      },
    },
  });

  if (!report || report.academyId !== staff.academyId || report.deletedAt) {
    return NextResponse.json({ error: "보고서를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    id: report.id,
    title: report.title,
    status: report.status,
    templateId: report.templateId,
    pages: report.pages,
    theme: report.theme,
    version: report.version,
    contentHash: report.contentHash,
    lastEditedAt: report.lastEditedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    passage: report.passage,
  });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/workbench/passage-reports/[id]
// 자동저장 — 낙관적 락 (version mismatch → 409)
// ────────────────────────────────────────────────────────────

const patchBodySchema = z.object({
  pages: z.array(pageSchema).optional(),
  theme: reportThemeSchema.optional(),
  title: z.string().min(1).max(120).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  version: z.number().int().nonnegative(), // expected current version (낙관적 락)
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "요청 검증 실패", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { pages, theme, title, status, version } = parsed.data;

  // 권한 + 현재 상태 조회 (낙관적 락 확인)
  const current = await prisma.passageReport.findUnique({
    where: { id },
    select: {
      id: true,
      academyId: true,
      version: true,
      pages: true,
      theme: true,
      deletedAt: true,
    },
  });
  if (!current || current.academyId !== staff.academyId || current.deletedAt) {
    return NextResponse.json({ error: "보고서를 찾을 수 없습니다." }, { status: 404 });
  }
  if (current.version !== version) {
    return NextResponse.json(
      {
        error: "다른 탭에서 수정되었습니다. 새로고침 후 다시 시도하세요.",
        currentVersion: current.version,
      },
      { status: 409 },
    );
  }

  // contentHash 갱신 (pages 또는 theme가 변경됐을 때)
  const nextPages = pages ?? current.pages;
  const nextTheme = theme ?? current.theme;
  const nextHash = computeReportContentHash({
    pages: nextPages as never,
    theme: nextTheme as never,
  });

  // 원자적 업데이트 (version도 함께 증가 — UPDATE ... WHERE version = $expected)
  const updated = await prisma.passageReport.update({
    where: { id, version },
    data: {
      ...(pages !== undefined ? { pages: pages as never } : {}),
      ...(theme !== undefined ? { theme: theme as never } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(status !== undefined ? {
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : undefined,
      } : {}),
      contentHash: nextHash,
      version: { increment: 1 },
      lastEditedById: staff.id,
      lastEditedAt: new Date(),
    },
    select: {
      id: true,
      version: true,
      contentHash: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    id: updated.id,
    version: updated.version,
    contentHash: updated.contentHash,
    updatedAt: updated.updatedAt,
  });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/workbench/passage-reports/[id]
// Soft delete
// ────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const current = await prisma.passageReport.findUnique({
    where: { id },
    select: { id: true, academyId: true, deletedAt: true },
  });
  if (!current || current.academyId !== staff.academyId || current.deletedAt) {
    return NextResponse.json({ error: "보고서를 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.passageReport.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });

  return NextResponse.json({ ok: true });
}
