// @ts-nocheck — studySeason model not yet in schema (pending migration)
"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStaff() {
  const session = await auth();
  if (!session?.user) throw new Error("인증이 필요합니다.");
  return session.user as { id: string; academyId: string; role: string };
}

// ---------------------------------------------------------------------------
// 1. getSeasons — 시즌 목록 조회
// ---------------------------------------------------------------------------

export async function getSeasons() {
  const user = await requireStaff();

  const seasons = await prisma.studySeason.findMany({
    where: { academyId: user.academyId },
    include: {
      passages: {
        include: { passage: { select: { id: true, title: true } } },
        orderBy: { order: "asc" },
      },
      _count: { select: { sessionRecords: true, lessonProgress: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return seasons.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    grade: s.grade,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    isActive: s.isActive,
    passageCount: s.passages.length,
    passages: s.passages.map((sp) => ({
      id: sp.passageId,
      title: sp.passage.title,
      order: sp.order,
    })),
    totalSessions: s._count.sessionRecords,
    createdAt: s.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// 2. createSeason — 시즌 생성
// ---------------------------------------------------------------------------

export async function createSeason(data: {
  name: string;
  type: "EXAM_PREP" | "REGULAR";
  grade: number | null;
  startDate: string;
  endDate: string;
  passageIds: string[];
}) {
  const user = await requireStaff();

  const season = await prisma.studySeason.create({
    data: {
      academyId: user.academyId,
      name: data.name,
      type: data.type,
      grade: data.grade,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      createdById: user.id,
      passages: {
        create: data.passageIds.map((id, i) => ({
          passageId: id,
          order: i,
        })),
      },
    },
  });

  revalidatePath("/director/learning");
  return { id: season.id };
}

// ---------------------------------------------------------------------------
// 3. updateSeason — 시즌 수정
// ---------------------------------------------------------------------------

export async function updateSeason(
  seasonId: string,
  data: {
    name?: string;
    isActive?: boolean;
    startDate?: string;
    endDate?: string;
    grade?: number | null;
  }
) {
  const user = await requireStaff();

  await prisma.studySeason.update({
    where: { id: seasonId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
      ...(data.grade !== undefined && { grade: data.grade }),
    },
  });

  revalidatePath("/director/learning");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 4. updateSeasonPassages — 시즌 지문 배정 변경
// ---------------------------------------------------------------------------

export async function updateSeasonPassages(
  seasonId: string,
  passageIds: string[]
) {
  await requireStaff();

  // 기존 배정 삭제 후 재생성
  await prisma.seasonPassage.deleteMany({ where: { seasonId } });
  await prisma.seasonPassage.createMany({
    data: passageIds.map((id, i) => ({
      seasonId,
      passageId: id,
      order: i,
    })),
  });

  revalidatePath("/director/learning");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 5. getSeasonStudentProgress — 시즌별 학생 진도 조회
// ---------------------------------------------------------------------------

export async function getSeasonStudentProgress(seasonId: string) {
  const user = await requireStaff();

  const season = await prisma.studySeason.findUnique({
    where: { id: seasonId },
    include: { passages: true },
  });
  if (!season) throw new Error("시즌을 찾을 수 없습니다.");

  const totalPassages = season.passages.length;

  // 해당 학년 학생들의 진도 조회
  const students = await prisma.student.findMany({
    where: {
      academyId: user.academyId,
      status: "ACTIVE",
      ...(season.grade ? { grade: season.grade } : {}),
    },
    select: { id: true, name: true, grade: true },
    orderBy: { name: "asc" },
  });

  const progressList = await prisma.lessonProgress.findMany({
    where: { seasonId },
  });

  const progressByStudent = new Map<
    string,
    { completed: number; total: number; mastery: number }
  >();

  for (const student of students) {
    const studentProgress = progressList.filter((p) => p.studentId === student.id);
    const completed = studentProgress.filter(
      (p) => p.session1Done && p.session2Done && p.storiesDone
    ).length;
    const avgMastery =
      studentProgress.length > 0
        ? studentProgress.reduce((sum, p) => sum + p.masteryScore, 0) / studentProgress.length
        : 0;

    progressByStudent.set(student.id, {
      completed,
      total: totalPassages,
      mastery: Math.round(avgMastery),
    });
  }

  return students.map((s) => {
    const prog = progressByStudent.get(s.id);
    return {
      studentId: s.id,
      name: s.name,
      grade: s.grade,
      completedLessons: prog?.completed ?? 0,
      totalLessons: prog?.total ?? totalPassages,
      masteryScore: prog?.mastery ?? 0,
      progressPercent:
        totalPassages > 0
          ? Math.round(((prog?.completed ?? 0) / totalPassages) * 100)
          : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 6. getAvailablePassages — 배정 가능한 지문 목록
// ---------------------------------------------------------------------------

export async function getAvailablePassages(grade?: number) {
  const user = await requireStaff();

  const passages = await prisma.passage.findMany({
    where: {
      academyId: user.academyId,
      ...(grade ? { grade } : {}),
    },
    select: {
      id: true,
      title: true,
      grade: true,
      semester: true,
      publisher: true,
      _count: { select: { naeshinQuestions: true } },
    },
    orderBy: [{ grade: "asc" }, { order: "asc" }],
  });

  return passages.map((p) => ({
    id: p.id,
    title: p.title,
    grade: p.grade,
    semester: p.semester,
    publisher: p.publisher,
    questionCount: p._count.naeshinQuestions,
  }));
}
