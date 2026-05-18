"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import { unstable_cache } from "next/cache";
import type { LessonItem, SeasonInfo } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

// ---------------------------------------------------------------------------
// 1. getActiveSeason — 현재 활성 시즌 조회
// ---------------------------------------------------------------------------

export async function getActiveSeason(): Promise<SeasonInfo | null> {
  const session = await requireStudent();
  const now = new Date();

  const season = await prisma.studySeason.findFirst({
    where: {
      academyId: session.academyId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ grade: session.grade }, { grade: null }],
    },
    include: { passages: { orderBy: { order: "asc" } } },
    orderBy: [{ type: "asc" }, { startDate: "desc" }],
  });

  if (!season) return null;

  // 완료 = 마스터리 통과
  const completedCount = await prisma.lessonProgress.count({
    where: {
      studentId: session.studentId,
      seasonId: season.id,
      masteryPassed: true,
    },
  });

  const dDay =
    season.type === "EXAM_PREP"
      ? Math.ceil((season.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return {
    id: season.id,
    name: season.name,
    type: season.type as "EXAM_PREP" | "REGULAR",
    startDate: season.startDate.toISOString(),
    endDate: season.endDate.toISOString(),
    dDay,
    totalLessons: season.passages.length,
    completedLessons: completedCount,
  };
}

// ---------------------------------------------------------------------------
// 2. getLessonList — 레슨 목록 (카테고리별 진행도)
// ---------------------------------------------------------------------------

export async function getLessonList(seasonId: string): Promise<LessonItem[]> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const [seasonPassages, progressList] = await Promise.all([
    prisma.seasonPassage.findMany({
      where: { seasonId },
      include: { passage: { select: { id: true, title: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId, seasonId },
    }),
  ]);

  const progressMap = new Map(progressList.map((p) => [p.passageId, p]));

  return seasonPassages.map((sp) => {
    const prog = progressMap.get(sp.passageId);
    const catProgress = {
      VOCAB: prog?.vocabDone ?? 0,
      INTERPRETATION: prog?.interpDone ?? 0,
      GRAMMAR: prog?.grammarDone ?? 0,
      COMPREHENSION: prog?.compDone ?? 0,
    };

    const masteryUnlocked =
      catProgress.VOCAB >= 1 &&
      catProgress.INTERPRETATION >= 1 &&
      catProgress.GRAMMAR >= 1 &&
      catProgress.COMPREHENSION >= 1;

    const totalSessionsDone =
      catProgress.VOCAB + catProgress.INTERPRETATION +
      catProgress.GRAMMAR + catProgress.COMPREHENSION +
      (prog?.masteryPassed ? 1 : 0);

    return {
      passageId: sp.passageId,
      passageTitle: sp.passage.title,
      order: sp.order,
      categoryProgress: catProgress,
      masteryUnlocked,
      masteryPassed: prog?.masteryPassed ?? false,
      masteryScore: prog?.masteryScore ?? 0,
      masteryAttempts: prog?.masteryAttempts ?? 0,
      isCompleted: prog?.masteryPassed ?? false,
      totalSessionsDone,
    };
  });
}

// ---------------------------------------------------------------------------
// 2-1. getLearnPageData — 학습 홈 통합 로드
// ---------------------------------------------------------------------------

export async function getLearnPageData() {
  const session = await requireStudent();
  const { getDailyMission, getStreakInfo } = await import("@/actions/learning-gamification");

  // 시즌+레슨은 캐싱 (cookies 접근 불가 → 인자로 전달)
  const cachedSeasonLessons = unstable_cache(
    async (studentId: string, academyId: string, grade: number) => {
      const seasonData = await _getActiveSeason(studentId, academyId, grade);
      const lessons = seasonData ? await _getLessonList(studentId, seasonData.id) : [];
      return { season: seasonData, lessons };
    },
    [`learn-${session.studentId}`],
    { revalidate: 120, tags: [`student-${session.studentId}`] }
  );

  const [{ season: seasonData, lessons }, missionData, streakData] = await Promise.all([
    cachedSeasonLessons(session.studentId, session.academyId, session.grade),
    getDailyMission(),
    getStreakInfo(),
  ]);

  return { season: seasonData, mission: missionData, streak: streakData, lessons };
}

// 캐시용 내부 함수 (cookies 미사용)
async function _getActiveSeason(studentId: string, academyId: string, grade: number): Promise<SeasonInfo | null> {
  const now = new Date();
  const season = await prisma.studySeason.findFirst({
    where: {
      academyId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ grade }, { grade: null }],
    },
    include: { passages: { orderBy: { order: "asc" } } },
    orderBy: [{ type: "asc" }, { startDate: "desc" }],
  });
  if (!season) return null;

  const completedCount = await prisma.lessonProgress.count({
    where: { studentId, seasonId: season.id, masteryPassed: true },
  });

  const dDay = season.type === "EXAM_PREP"
    ? Math.ceil((season.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    id: season.id,
    name: season.name,
    type: season.type as "EXAM_PREP" | "REGULAR",
    startDate: season.startDate.toISOString(),
    endDate: season.endDate.toISOString(),
    dDay,
    totalLessons: season.passages.length,
    completedLessons: completedCount,
  };
}

async function _getLessonList(studentId: string, seasonId: string): Promise<LessonItem[]> {
  const [seasonPassages, progressList] = await Promise.all([
    prisma.seasonPassage.findMany({
      where: { seasonId },
      include: { passage: { select: { id: true, title: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId, seasonId },
    }),
  ]);

  const progressMap = new Map(progressList.map((p) => [p.passageId, p]));

  return seasonPassages.map((sp) => {
    const prog = progressMap.get(sp.passageId);
    const catProgress = {
      VOCAB: prog?.vocabDone ?? 0,
      INTERPRETATION: prog?.interpDone ?? 0,
      GRAMMAR: prog?.grammarDone ?? 0,
      COMPREHENSION: prog?.compDone ?? 0,
    };
    const masteryUnlocked =
      catProgress.VOCAB >= 1 && catProgress.INTERPRETATION >= 1 &&
      catProgress.GRAMMAR >= 1 && catProgress.COMPREHENSION >= 1;
    const totalSessionsDone =
      catProgress.VOCAB + catProgress.INTERPRETATION +
      catProgress.GRAMMAR + catProgress.COMPREHENSION +
      (prog?.masteryPassed ? 1 : 0);

    return {
      passageId: sp.passageId,
      passageTitle: sp.passage.title,
      order: sp.order,
      categoryProgress: catProgress,
      masteryUnlocked,
      masteryPassed: prog?.masteryPassed ?? false,
      masteryScore: prog?.masteryScore ?? 0,
      masteryAttempts: prog?.masteryAttempts ?? 0,
      isCompleted: prog?.masteryPassed ?? false,
      totalSessionsDone,
    };
  });
}
