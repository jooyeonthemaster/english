// ============================================================================
// GET /api/t/enroll/[enrollToken]/roster?q= — 자기등록 이름 검색 (무세션 공개)
//
// 공유 QR 랜딩(/t/e/[enrollToken])의 학생 자기식별용 이름 검색. proxy.ts 매처에
// /api 최상위가 없어 미들웨어가 돌지 않는다 — 토큰 = 접근권한, 스태프 인증 없음.
//
// 보안 계약(설계 §6.9):
//  - 전량 덤프 금지: 검색어(q) 최소 1자 필수. q 없으면 빈 목록(로스터 노출은
//    검색 기반만). 결과 상한 20.
//  - 스코프 한정: exam.classId 있으면 그 반 등록(ENROLLED) 학생, 없으면 학원
//    ACTIVE 학생. 반드시 enrollEnabled=true 인 시험만(비활성/미존재/국어는 404).
//  - 응답 화이트리스트: { id, name, grade, schoolName } 만 — 학생코드·연락처 등
//    식별·사칭에 쓰일 수 있는 필드는 절대 미포함(코드 확인은 POST 자기등록에서).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 검색 결과 상한 — 감독 시험 전제(코드 확인이 사칭 제출 차단)라 미리보기 수준으로 캡. */
const MAX_RESULTS = 20;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ enrollToken: string }> },
) {
  const { enrollToken } = await params;
  // 형식 불일치 토큰은 존재 여부를 구분하지 않고 404 통일(무차별 탐색 억제).
  if (!isValidShareToken(enrollToken)) {
    return NextResponse.json(
      { error: "등록 링크를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 검색어 최소 1자 — 없으면 전량 덤프 방지를 위해 빈 목록으로 응대(에러 아님).
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ students: [] });
  }

  const exam = await prisma.exam.findFirst({
    where: { enrollToken, enrollEnabled: true },
    select: { id: true, academyId: true, classId: true, subject: true },
  });
  // 미존재·비활성·국어(배포 차단 이중 방어)는 존재를 구분하지 않고 404.
  if (!exam || exam.subject === "KOREAN") {
    return NextResponse.json(
      { error: "등록 링크가 만료되었거나 존재하지 않습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const where: Prisma.StudentWhereInput = {
    academyId: exam.academyId,
    status: "ACTIVE",
    name: { contains: q, mode: "insensitive" },
  };
  if (exam.classId) {
    // classId 는 이 학원 스코프 안에서만 매칭되므로(등록은 자기 학원 반에만 존재)
    // 반 스코프 시험지는 그 반 등록 학생으로 자연 한정된다.
    where.classEnrollments = { some: { classId: exam.classId, status: "ENROLLED" } };
  }

  const rows = await prisma.student.findMany({
    where,
    select: { id: true, name: true, grade: true, school: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: MAX_RESULTS,
  });

  // 공개면 화이트리스트 — id/이름/학년/학교명만(그 외 식별 필드 전면 제외).
  const students = rows.map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade,
    schoolName: s.school?.name ?? null,
  }));
  return NextResponse.json({ students });
}
