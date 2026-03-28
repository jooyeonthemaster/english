// @ts-nocheck — sessionRecord/lessonProgress models not yet in schema
"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import {
  DAILY_MISSION_TYPES,
  LEARNING_XP,
  STREAK_CONFIG,
} from "@/lib/learning-constants";
import type {
  DailyMissionStatus,
  RankingEntry,
  SchoolRankingEntry,
  AcademyRankingEntry,
} from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireStudent() {
  const session = await getStudentSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  return session;
}

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // Monday as start
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ---------------------------------------------------------------------------
// 1. getDailyMission — 오늘의 미션 상태
// ---------------------------------------------------------------------------

export async function getDailyMission(): Promise<DailyMissionStatus> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mission = await prisma.studentDailyMission.findUnique({
    where: { studentId_date: { studentId, date: today } },
  });

  const now = new Date();
  const activeMultiplier =
    mission?.multiplierActive &&
    mission.multiplierExpiresAt &&
    now < mission.multiplierExpiresAt
      ? mission.multiplierActive
      : null;

  return {
    date: today.toISOString().split("T")[0],
    easy: {
      label: DAILY_MISSION_TYPES.EASY.label,
      completed: mission?.easyCompleted ?? false,
      rewardMultiplier: DAILY_MISSION_TYPES.EASY.rewardMultiplier,
    },
    hard: {
      label: DAILY_MISSION_TYPES.HARD.label,
      completed: mission?.hardCompleted ?? false,
      rewardMultiplier: DAILY_MISSION_TYPES.HARD.rewardMultiplier,
      condition: DAILY_MISSION_TYPES.HARD.condition,
    },
    activeMultiplier,
    multiplierExpiresAt: mission?.multiplierExpiresAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// 2. checkDailyMission — 미션 달성 체크 (세션 완료 후 호출)
// ---------------------------------------------------------------------------

export async function checkDailyMission(): Promise<{
  easyJustCompleted: boolean;
  hardJustCompleted: boolean;
  multiplier: number | null;
}> {
  const session = await requireStudent();
  const studentId = session.studentId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 오늘 완료한 세션 수 + 평균 정답률
  const todaySessions = await prisma.sessionRecord.findMany({
    where: {
      studentId,
      completedAt: { gte: today, lt: tomorrow },
    },
    select: { score: true },
  });

  const sessionCount = todaySessions.length;
  const avgAccuracy =
    sessionCount > 0
      ? todaySessions.reduce((sum, s) => sum + s.score, 0) / sessionCount
      : 0;

  // 현재 미션 상태
  const existing = await prisma.studentDailyMission.findUnique({
    where: { studentId_date: { studentId, date: today } },
  });

  let easyJustCompleted = false;
  let hardJustCompleted = false;
  let multiplier: number | null = null;

  const easyMet = sessionCount >= DAILY_MISSION_TYPES.EASY.condition.sessionsRequired;
  const hardMet =
    sessionCount >= DAILY_MISSION_TYPES.HARD.condition.sessionsRequired &&
    avgAccuracy >= DAILY_MISSION_TYPES.HARD.condition.minAccuracy;

  // Easy 미션 달성
  if (easyMet && !(existing?.easyCompleted)) {
    easyJustCompleted = true;
    multiplier = DAILY_MISSION_TYPES.EASY.rewardMultiplier;
  }

  // Hard 미션 달성 (easy보다 우선)
  if (hardMet && !(existing?.hardCompleted)) {
    hardJustCompleted = true;
    multiplier = DAILY_MISSION_TYPES.HARD.rewardMultiplier;
  }

  if (easyJustCompleted || hardJustCompleted) {
    const expiresAt = new Date(Date.now() + LEARNING_XP.MULTIPLIER_DURATION_MS);

    await prisma.studentDailyMission.upsert({
      where: { studentId_date: { studentId, date: today } },
      create: {
        studentId,
        date: today,
        easyCompleted: easyMet,
        hardCompleted: hardMet,
        multiplierActive: multiplier,
        multiplierExpiresAt: expiresAt,
      },
      update: {
        easyCompleted: easyMet,
        hardCompleted: hardMet,
        multiplierActive: multiplier,
        multiplierExpiresAt: expiresAt,
      },
    });
  }

  return { easyJustCompleted, hardJustCompleted, multiplier };
}

// ---------------------------------------------------------------------------
// 3. getIndividualRanking — 개인 주간 XP 랭킹
// ---------------------------------------------------------------------------

export async function getIndividualRanking(): Promise<{
  top5: RankingEntry[];
  myRank: RankingEntry | null;
}> {
  const session = await requireStudent();
  const weekStart = getWeekStart();

  // 주간 XP 합계로 랭킹 (raw query로 효율적 처리)
  const rankings = await prisma.$queryRaw<
    { studentId: string; name: string; avatarUrl: string | null; weeklyXp: bigint }[]
  >`
    SELECT s.id as "studentId", s.name, s."avatarUrl",
           COALESCE(SUM(sr."xpEarned"), 0) as "weeklyXp"
    FROM students s
    LEFT JOIN session_records sr ON sr."studentId" = s.id
      AND sr."completedAt" >= ${weekStart}
    WHERE s.status = 'ACTIVE'
    GROUP BY s.id, s.name, s."avatarUrl"
    ORDER BY "weeklyXp" DESC
    LIMIT 100
  `;

  const entries: RankingEntry[] = rankings.map((r, i) => ({
    rank: i + 1,
    id: r.studentId,
    name: maskName(r.name),
    weeklyXp: Number(r.weeklyXp),
    avatarUrl: r.avatarUrl ?? undefined,
    isMe: r.studentId === session.studentId,
  }));

  const top5 = entries.slice(0, 5);
  const myRank = entries.find((e) => e.isMe) ?? null;

  return { top5, myRank };
}

// ---------------------------------------------------------------------------
// 4. getSchoolRanking — 학교 평균 XP 랭킹
// ---------------------------------------------------------------------------

export async function getSchoolRanking(): Promise<SchoolRankingEntry[]> {
  await requireStudent();
  const weekStart = getWeekStart();

  const rankings = await prisma.$queryRaw<
    { schoolId: string; schoolName: string; avgXp: number; studentCount: bigint }[]
  >`
    SELECT sc.id as "schoolId", sc.name as "schoolName",
           COALESCE(AVG(weekly.xp), 0) as "avgXp",
           COUNT(DISTINCT s.id) as "studentCount"
    FROM schools sc
    JOIN students s ON s."schoolId" = sc.id AND s.status = 'ACTIVE'
    LEFT JOIN (
      SELECT sr."studentId", SUM(sr."xpEarned") as xp
      FROM session_records sr
      WHERE sr."completedAt" >= ${weekStart}
      GROUP BY sr."studentId"
    ) weekly ON weekly."studentId" = s.id
    GROUP BY sc.id, sc.name
    HAVING COUNT(DISTINCT s.id) >= 1
    ORDER BY "avgXp" DESC
    LIMIT 20
  `;

  return rankings.map((r, i) => ({
    rank: i + 1,
    schoolId: r.schoolId,
    schoolName: r.schoolName,
    averageXp: Math.round(Number(r.avgXp)),
    studentCount: Number(r.studentCount),
  }));
}

// ---------------------------------------------------------------------------
// 5. getAcademyRanking — 학원 평균 XP 랭킹
// ---------------------------------------------------------------------------

export async function getAcademyRanking(): Promise<AcademyRankingEntry[]> {
  await requireStudent();
  const weekStart = getWeekStart();

  const rankings = await prisma.$queryRaw<
    { academyId: string; academyName: string; avgXp: number; studentCount: bigint }[]
  >`
    SELECT a.id as "academyId", a.name as "academyName",
           COALESCE(AVG(weekly.xp), 0) as "avgXp",
           COUNT(DISTINCT s.id) as "studentCount"
    FROM academies a
    JOIN students s ON s."academyId" = a.id AND s.status = 'ACTIVE'
    LEFT JOIN (
      SELECT sr."studentId", SUM(sr."xpEarned") as xp
      FROM session_records sr
      WHERE sr."completedAt" >= ${weekStart}
      GROUP BY sr."studentId"
    ) weekly ON weekly."studentId" = s.id
    GROUP BY a.id, a.name
    HAVING COUNT(DISTINCT s.id) >= 1
    ORDER BY "avgXp" DESC
    LIMIT 20
  `;

  return rankings.map((r, i) => ({
    rank: i + 1,
    academyId: r.academyId,
    academyName: r.academyName,
    averageXp: Math.round(Number(r.avgXp)),
    studentCount: Number(r.studentCount),
  }));
}

// ---------------------------------------------------------------------------
// 6. getStreakInfo — 스트릭 정보
// ---------------------------------------------------------------------------

export async function getStreakInfo() {
  const session = await requireStudent();

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { streak: true, streakFreezeCount: true, lastStudyDate: true },
  });

  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

  // 연속 출석 7일 달성 시 프리즈 충전 체크
  const canRechargeFreeze =
    student.streak > 0 &&
    student.streak % STREAK_CONFIG.FREEZE_RECHARGE_DAYS === 0 &&
    student.streakFreezeCount < STREAK_CONFIG.MAX_FREEZE_COUNT;

  return {
    streak: student.streak,
    freezeCount: student.streakFreezeCount,
    maxFreeze: STREAK_CONFIG.MAX_FREEZE_COUNT,
    lastStudyDate: student.lastStudyDate?.toISOString() ?? null,
    canRechargeFreeze,
  };
}

/** 이름 마스킹: 김제연 → 김** */
function maskName(name: string): string {
  if (name.length <= 1) return name;
  return name[0] + "*".repeat(name.length - 1);
}
