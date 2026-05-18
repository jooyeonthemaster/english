"use server";

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// 시험 생성 화면에서 사용하는 보조 조회 함수들 (문제 은행 / 반 / 학교)
// ---------------------------------------------------------------------------

export async function getQuestionBank(
  academyId: string,
  filters?: {
    type?: string;
    difficulty?: string;
    search?: string;
  },
) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const where: Record<string, unknown> = { academyId };

  if (filters?.type && filters.type !== "ALL") where.type = filters.type;
  if (filters?.difficulty && filters.difficulty !== "ALL")
    where.difficulty = filters.difficulty;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  const questions = await prisma.question.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return questions;
}

export async function getClassesForFilter(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const classes = await prisma.class.findMany({
    where: { academyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return classes;
}

export async function getSchoolsForFilter(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const schools = await prisma.school.findMany({
    where: { academyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return schools;
}
