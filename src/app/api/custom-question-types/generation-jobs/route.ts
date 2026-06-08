import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { kickCustomQuestionGenWorker } from "@/lib/custom-question-types/job-runner";
import { getActiveCustomTypeSpec } from "@/lib/custom-question-types/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — 커스텀 유형으로 문항 생성 작업을 큐에 등록(비동기). GET — 작업 목록(폴링).

const bodySchema = z.object({
  customTypeId: z.string().trim().min(1).max(80),
  // 동형을 입힐 지문(passageId[]). 지문당 countPerPassage 개씩 생성.
  passageIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
  countPerPassage: z.number().int().min(1).max(10).optional(),
  gradeInfo: z.string().trim().max(40).optional(),
  // 생성 시 난이도 override(미지정 시 유형 정의의 난이도 사용).
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).optional(),
  // 생성 시 유형 정의 임시 override(이 배치만). 미지정 필드는 정의 그대로.
  // optionCount/correctAnswerCount/multipleAnswers = 공통 선지 구조, params = 유형 고유 수치(빈칸 수 등) key→value.
  overrides: z
    .object({
      optionCount: z.number().int().min(0).max(20).optional(),
      correctAnswerCount: z.number().int().min(0).max(20).optional(),
      params: z.record(z.string(), z.number().int().min(0).max(50)).optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const uniquePassageIds = [...new Set(parsed.data.passageIds)];

  // 유형이 이 학원 소유 + 활성 버전 보유 확인.
  const active = await getActiveCustomTypeSpec(staff.academyId, parsed.data.customTypeId);
  if (!active) {
    return NextResponse.json({ error: "커스텀 유형을 찾을 수 없습니다." }, { status: 400 });
  }

  // 지문이 이 학원 소유인지 확인.
  const ownedCount = await prisma.passage.count({
    where: { academyId: staff.academyId, id: { in: uniquePassageIds } },
  });
  if (ownedCount !== uniquePassageIds.length) {
    return NextResponse.json({ error: "선택한 지문이 올바르지 않습니다." }, { status: 400 });
  }

  const job = await prisma.customQuestionGenerationJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      customTypeId: parsed.data.customTypeId,
      status: "PENDING",
      passageIds: uniquePassageIds,
      countPerPassage: parsed.data.countPerPassage ?? 1,
      gradeInfo: parsed.data.gradeInfo ?? null,
      difficulty: parsed.data.difficulty ?? null,
      ...(parsed.data.overrides ? { overrides: parsed.data.overrides } : {}),
      passageCount: uniquePassageIds.length,
    },
    select: { id: true },
  });

  // 인-프로세스 워커 가동(논블로킹).
  kickCustomQuestionGenWorker();

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}

function normalizeLimit(raw: string | null): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 30) : 12;
}

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 폴링도 워커를 깨운다(서버 재시작 후 cold-start 복구). pump 는 멱등.
  kickCustomQuestionGenWorker();

  // 선택 유형의 잡만 정확히(인덱스된 customTypeId 컬럼). 미지정 시 학원 전체.
  // 클라이언트단 필터로 top-N 윈도우에서 진행 중 잡이 밀려나 폴링이 멈추는 문제 방지.
  const customTypeId = req.nextUrl.searchParams.get("customTypeId")?.trim() || null;

  const jobs = await prisma.customQuestionGenerationJob.findMany({
    where: {
      academyId: staff.academyId,
      deletedAt: null,
      ...(customTypeId ? { customTypeId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: normalizeLimit(req.nextUrl.searchParams.get("limit")),
    select: {
      id: true,
      status: true,
      customTypeId: true,
      passageCount: true,
      countPerPassage: true,
      totalCount: true,
      savedCount: true,
      skippedCount: true,
      errorMessage: true,
      gradeInfo: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ jobs });
}
