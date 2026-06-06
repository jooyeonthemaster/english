import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 커스텀 유형 생성 결과 — customTypeId 컬럼(인덱스)로 정확히 묶어 최근순 반환(결과 패널용).
// customTypeId 미지정 시 학원 전체 커스텀 생성분(structuredData._customQuestionGen=true).

function readOptions(value: string | null): Array<{ label: string; text: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((o, i) => {
        if (!o || typeof o !== "object") return null;
        const row = o as Record<string, unknown>;
        return {
          label:
            typeof row.label === "string" && row.label.trim()
              ? row.label.trim()
              : String(i + 1),
          text: typeof row.text === "string" ? row.text : "",
        };
      })
      .filter((o): o is { label: string; text: string } => o !== null);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 100)
    : 30;

  const customTypeId = req.nextUrl.searchParams.get("customTypeId")?.trim() || null;

  const rows = await prisma.question.findMany({
    where: {
      academyId: staff.academyId,
      ...(customTypeId
        ? { customTypeId }
        : { structuredData: { path: ["_customQuestionGen"], equals: true } }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      subType: true,
      questionText: true,
      options: true,
      correctAnswer: true,
      difficulty: true,
      points: true,
      createdAt: true,
      structuredData: true,
      customTypeId: true,
      passage: { select: { title: true } },
      explanation: { select: { content: true } },
    },
  });

  const questions = rows.map((row) => {
    const sd = (row.structuredData ?? null) as Record<string, unknown> | null;
    return {
      id: row.id,
      subType: row.subType,
      questionText: row.questionText,
      options: readOptions(row.options),
      correctAnswer: row.correctAnswer,
      difficulty: row.difficulty,
      points: row.points,
      createdAt: row.createdAt,
      customTypeId: row.customTypeId ?? null,
      // 생성 티어(② 빌트인 / ④ generic) — 디버깅/품질 추적용.
      tier:
        sd && typeof sd === "object" ? (sd._customTypeTier as string | null) ?? null : null,
      passageTitle: row.passage?.title ?? null,
      explanation: row.explanation?.content ?? null,
    };
  });

  return NextResponse.json({ questions });
}
