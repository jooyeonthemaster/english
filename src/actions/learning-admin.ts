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
    include: {
      passages: {
        include: { passage: { select: { id: true, title: true } } },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!season) throw new Error("시즌을 찾을 수 없습니다.");

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

  const totalPassages = season.passages.length;
  // 지문당 최대 세션 = 카테고리 4 × 5 + 마스터리 1 = 21
  const maxSessionsPerPassage = 21;
  const totalMaxSessions = totalPassages * maxSessionsPerPassage;

  return students.map((student) => {
    const studentProg = progressList.filter((p) => p.studentId === student.id);
    const progMap = new Map(studentProg.map((p) => [p.passageId, p]));

    // 지문별 상세 진도
    const passageDetails = season.passages.map((sp) => {
      const p = progMap.get(sp.passageId);
      return {
        passageId: sp.passageId,
        passageTitle: sp.passage.title,
        vocabDone: p?.vocabDone ?? 0,
        interpDone: p?.interpDone ?? 0,
        grammarDone: p?.grammarDone ?? 0,
        compDone: p?.compDone ?? 0,
        masteryPassed: p?.masteryPassed ?? false,
        masteryScore: p?.masteryScore ?? 0,
        totalDone: (p?.vocabDone ?? 0) + (p?.interpDone ?? 0) + (p?.grammarDone ?? 0) + (p?.compDone ?? 0) + (p?.masteryPassed ? 1 : 0),
      };
    });

    const totalSessionsDone = passageDetails.reduce((sum, d) => sum + d.totalDone, 0);
    const masteryPassedCount = passageDetails.filter((d) => d.masteryPassed).length;

    return {
      studentId: student.id,
      name: student.name,
      grade: student.grade,
      completedLessons: masteryPassedCount,
      totalLessons: totalPassages,
      totalSessionsDone,
      totalMaxSessions,
      progressPercent: totalMaxSessions > 0 ? Math.round((totalSessionsDone / totalMaxSessions) * 100) : 0,
      passageDetails,
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

// ---------------------------------------------------------------------------
// 7. deleteSeason — 시즌 삭제
// ---------------------------------------------------------------------------

export async function deleteSeason(seasonId: string) {
  await requireStaff();

  // SeasonPassage는 cascade 삭제됨
  // LessonProgress, SessionRecord의 seasonId는 optional이므로 null로 처리
  await prisma.lessonProgress.updateMany({
    where: { seasonId },
    data: { seasonId: null },
  });
  await prisma.sessionRecord.updateMany({
    where: { seasonId },
    data: { seasonId: null },
  });

  await prisma.studySeason.delete({ where: { id: seasonId } });

  revalidatePath("/director/learning");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 8. removeSeasonPassage — 시즌에서 지문 개별 제거
// ---------------------------------------------------------------------------

export async function removeSeasonPassage(seasonId: string, passageId: string) {
  await requireStaff();

  await prisma.seasonPassage.deleteMany({
    where: { seasonId, passageId },
  });

  // 순서 재정렬
  const remaining = await prisma.seasonPassage.findMany({
    where: { seasonId },
    orderBy: { order: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].order !== i) {
      await prisma.seasonPassage.update({
        where: { id: remaining[i].id },
        data: { order: i },
      });
    }
  }

  revalidatePath("/director/learning");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 9. reorderSeasonPassages — 시즌 지문 순서 변경
// ---------------------------------------------------------------------------

export async function reorderSeasonPassages(
  seasonId: string,
  passageIds: string[]
) {
  await requireStaff();

  for (let i = 0; i < passageIds.length; i++) {
    await prisma.seasonPassage.updateMany({
      where: { seasonId, passageId: passageIds[i] },
      data: { order: i },
    });
  }

  revalidatePath("/director/learning");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 10. addSeasonPassage — 시즌에 지문 개별 추가
// ---------------------------------------------------------------------------

export async function addSeasonPassage(seasonId: string, passageId: string) {
  await requireStaff();

  const maxOrder = await prisma.seasonPassage.findFirst({
    where: { seasonId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.seasonPassage.create({
    data: {
      seasonId,
      passageId,
      order: (maxOrder?.order ?? -1) + 1,
    },
  });

  revalidatePath("/director/learning");
  return { success: true };
}
