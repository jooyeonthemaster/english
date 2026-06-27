import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 커스텀 유형 생성 결과 — customTypeId 컬럼(인덱스)로 정확히 묶어 최근순 반환(결과 패널용).
// customTypeId 미지정 시 학원 전체 커스텀 생성분(structuredData._customQuestionGen=true).
//
// 반환 형태는 공유 QuestionCard / BottomQueueSection 이 그대로 쓰도록 QuestionCardItem 호환.
// 커스텀 문항도 실제 Question 이라 검수/삭제/편집은 공유 워크벤치 액션을 재사용한다(매핑만 여기서).

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 200)
    : 100;

  const customTypeId = req.nextUrl.searchParams.get("customTypeId")?.trim() || null;

  const rows = await prisma.question.findMany({
    where: {
      academyId: staff.academyId,
      deletedAt: null,
      // 장문 세트 멤버는 단독 카드로 노출하지 않음(공유 결과 패널과 동일 규칙).
      inSet: false,
      ...(customTypeId
        ? { customTypeId }
        : { structuredData: { path: ["_customQuestionGen"], equals: true } }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      subType: true,
      questionText: true,
      options: true,
      correctAnswer: true,
      difficulty: true,
      tags: true,
      aiGenerated: true,
      approved: true,
      createdAt: true,
      structuredData: true,
      customTypeId: true,
      passage: {
        select: {
          id: true,
          title: true,
          content: true,
          grade: true,
          semester: true,
          publisher: true,
          school: { select: { id: true, name: true } },
        },
      },
      explanation: {
        select: {
          id: true,
          content: true,
          keyPoints: true,
          wrongOptionExplanations: true,
        },
      },
    },
  });

  const questions = rows.map((row) => ({
    id: row.id,
    type: row.type,
    subType: row.subType,
    questionText: row.questionText,
    options: row.options,
    correctAnswer: row.correctAnswer,
    difficulty: row.difficulty,
    tags: row.tags,
    aiGenerated: row.aiGenerated,
    approved: row.approved,
    createdAt: row.createdAt,
    customTypeId: row.customTypeId ?? null,
    passage: row.passage
      ? {
          id: row.passage.id,
          title: row.passage.title,
          content: row.passage.content,
          grade: row.passage.grade ?? null,
          semester: row.passage.semester ?? null,
          publisher: row.passage.publisher ?? null,
          school: row.passage.school ?? null,
        }
      : null,
    explanation: row.explanation
      ? {
          id: row.explanation.id,
          content: row.explanation.content,
          keyPoints: row.explanation.keyPoints ?? null,
          wrongOptionExplanations: row.explanation.wrongOptionExplanations ?? null,
        }
      : null,
    structuredData: row.structuredData ?? null,
  }));

  return NextResponse.json({ questions });
}
