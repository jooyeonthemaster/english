import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 동형 문제 생성 결과 목록 — 백그라운드 워커(question-job-runner)가 저장한 Question 중
// structuredData._similarQuestionGen=true 인 것을 최근순으로 반환(하단 작업 목록 패널용).

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

  // jobId 로 특정 잡 결과만 정확히 조회(동시 실행 잡들이 createdAt 범위로 섞여 잡히던 문제 해결).
  // 미지정 시 기존 동작(학원 전체 최신 동형 문항). 옛 문항은 컬럼이 null 이라 jobId 조회에 안 잡힘.
  const jobId = req.nextUrl.searchParams.get("jobId")?.trim() || null;

  const rows = await prisma.question.findMany({
    where: {
      academyId: staff.academyId,
      structuredData: { path: ["_similarQuestionGen"], equals: true },
      ...(jobId ? { similarQuestionGenJobId: jobId } : {}),
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
      similarQuestionGenJobId: true,
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
      // 결과 귀속: 어느 생성 잡에서 나온 문항인지. 옛 문항/비-동형은 null.
      jobId: row.similarQuestionGenJobId ?? null,
      // 어떤 모델로 분석했는지(모델 비교 테스트 구분용). 옛 문항은 null.
      analysisModel:
        sd && typeof sd === "object" ? (sd._similarAnalysisModel as string | null) ?? null : null,
      passageTitle: row.passage?.title ?? null,
      explanation: row.explanation?.content ?? null,
      // 원본 문항 분석(분석 정보 모달용). 없을 수 있음.
      analysis: sd && typeof sd === "object" ? sd._similarSourceAnalysis ?? null : null,
    };
  });

  return NextResponse.json({ questions });
}
