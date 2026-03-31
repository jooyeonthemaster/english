// @ts-nocheck — sessionRecord/lessonProgress models pending
"use server";

import { prisma } from "@/lib/prisma";
import { getStudentSession } from "@/lib/auth-student";
import {
  QUEST_POOL,
  LEARNING_XP,
  STREAK_CONFIG,
  type QuestMissionType,
} from "@/lib/learning-constants";
import type {
  DailyMissionStatus,
  DailyQuestStatus,
  QuestItem,
  QuestProgressUpdate,
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

function getTodayRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { today, tomorrow };
}

/** 날짜 기반 시드로 퀘스트 2개 선택 (EASY 1 + HARD 1, 학생별 다른 조합) */
function pickDailyQuests(studentId: string, date: Date) {
  const dateStr = date.toISOString().split("T")[0];
  const seed = hashCode(`${studentId}-${dateStr}`);

  const easy = QUEST_POOL.filter((q) => q.difficulty === "EASY");
  const hard = QUEST_POOL.filter((q) => q.difficulty === "HARD");

  return [
    easy[Math.abs(seed) % easy.length],
    hard[Math.abs(seed >> 8) % hard.length],
  ];
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// 1. getDailyQuests — 오늘의 퀘스트 3개 조회 (없으면 자동 생성)
// ---------------------------------------------------------------------------

export async function getDailyQuests(): Promise<DailyQuestStatus> {
  const session = await requireStudent();
  const studentId = session.studentId;
  const { today } = getTodayRange();

  let quests = await prisma.dailyQuest.findMany({
    where: { studentId, date: today },
    orderBy: { difficulty: "asc" },
  });

  // Lazy Creation: 오늘 퀘스트가 없으면 자동 생성
  if (quests.length === 0) {
    const templates = pickDailyQuests(studentId, today);
    await prisma.dailyQuest.createMany({
      data: templates.map((t) => ({
        studentId,
        date: today,
        missionType: t.missionType,
        difficulty: t.difficulty,
        label: t.label,
        target: t.target,
        rewardType: t.rewardType,
        rewardValue: t.rewardValue,
      })),
    });
    quests = await prisma.dailyQuest.findMany({
      where: { studentId, date: today },
      orderBy: { difficulty: "asc" },
    });
  }

  const now = new Date();
  const questItems: QuestItem[] = quests.map((q) => ({
    id: q.id,
    missionType: q.missionType,
    difficulty: q.difficulty as "EASY" | "MEDIUM" | "HARD",
    label: q.label,
    target: q.target,
    progress: q.progress,
    completed: q.completed,
    rewardType: q.rewardType as "MULTIPLIER" | "BONUS_XP",
    rewardValue: q.rewardValue,
    rewardClaimed: q.rewardClaimed,
    multiplierExpiresAt: q.multiplierExpiresAt?.toISOString() ?? null,
    completedAt: q.completedAt?.toISOString() ?? null,
  }));

  // 현재 활성 배율 중 가장 높은 값
  const activeMultipliers = quests
    .filter(
      (q) =>
        q.rewardType === "MULTIPLIER" &&
        q.rewardClaimed &&
        q.multiplierExpiresAt &&
        now < q.multiplierExpiresAt
    )
    .map((q) => q.rewardValue);

  const activeMultiplier = activeMultipliers.length > 0
    ? Math.max(...activeMultipliers)
    : null;

  const latestExpiry = quests
    .filter((q) => q.multiplierExpiresAt && now < q.multiplierExpiresAt)
    .sort((a, b) => b.multiplierExpiresAt!.getTime() - a.multiplierExpiresAt!.getTime())[0];

  return {
    date: today.toISOString().split("T")[0],
    quests: questItems,
    activeMultiplier,
    multiplierExpiresAt: latestExpiry?.multiplierExpiresAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// 2. updateQuestProgress — 세션 완료 후 퀘스트 진행도 업데이트
// ---------------------------------------------------------------------------

export async function updateQuestProgress(
  sessionScore: number,
  sessionXp: number,
  sessionType: string
): Promise<QuestProgressUpdate[]> {
  const session = await requireStudent();
  const studentId = session.studentId;
  const { today, tomorrow } = getTodayRange();

  // 퀘스트 조회 (미완료만)
  let quests = await prisma.dailyQuest.findMany({
    where: { studentId, date: today },
  });

  // 퀘스트 없으면 생성
  if (quests.length === 0) {
    await getDailyQuests();
    quests = await prisma.dailyQuest.findMany({
      where: { studentId, date: today },
    });
  }

  // 오늘 세션 통계 조회
  const todaySessions = await prisma.sessionRecord.findMany({
    where: { studentId, completedAt: { gte: today, lt: tomorrow } },
    select: { score: true, sessionType: true, xpEarned: true },
  });

  const todayVocabTests = await prisma.vocabTestResult.count({
    where: { studentId, takenAt: { gte: today, lt: tomorrow } },
  });

  const sessionCount = todaySessions.length;
  const avgAccuracy = sessionCount > 0
    ? Math.round(todaySessions.reduce((s, r) => s + r.score, 0) / sessionCount)
    : 0;
  const totalXpToday = todaySessions.reduce((s, r) => s + r.xpEarned, 0);
  const perfectCount = todaySessions.filter((s) => s.score === 100).length;
  const grammarSessionCount = todaySessions.filter(
    (s) => s.sessionType === "GRAMMAR_FOCUS"
  ).length;

  const updates: QuestProgressUpdate[] = [];

  for (const quest of quests) {
    if (quest.completed) continue;

    const prevProgress = quest.progress;
    let newProgress = prevProgress;

    switch (quest.missionType as QuestMissionType) {
      case "SESSION_COUNT":
        newProgress = sessionCount;
        break;
      case "XP_EARN":
        newProgress = totalXpToday;
        break;
      case "PERFECT":
        newProgress = perfectCount;
        break;
      case "STREAK_KEEP":
        newProgress = sessionCount > 0 ? 1 : 0;
        break;
      case "ACCURACY":
        newProgress = avgAccuracy;
        break;
      case "VOCAB_TEST":
        newProgress = todayVocabTests;
        break;
      case "CATEGORY_FOCUS":
        newProgress = grammarSessionCount;
        break;
    }

    const justCompleted = !quest.completed && newProgress >= quest.target;

    // DB 업데이트
    const updateData: Record<string, unknown> = {
      progress: Math.min(newProgress, quest.target),
    };

    if (justCompleted) {
      updateData.completed = true;
      updateData.completedAt = new Date();
      updateData.rewardClaimed = true;

      if (quest.rewardType === "MULTIPLIER") {
        updateData.multiplierExpiresAt = new Date(
          Date.now() + LEARNING_XP.MULTIPLIER_DURATION_MS
        );
      }

      // BONUS_XP 보상 즉시 지급
      if (quest.rewardType === "BONUS_XP") {
        await prisma.student.update({
          where: { id: studentId },
          data: { xp: { increment: quest.rewardValue } },
        });
      }
    }

    await prisma.dailyQuest.update({
      where: { id: quest.id },
      data: updateData,
    });

    // 진행도가 바뀌었거나 방금 완료된 경우만 포함
    if (newProgress !== prevProgress || justCompleted) {
      updates.push({
        questId: quest.id,
        label: quest.label,
        previousProgress: prevProgress,
        newProgress: Math.min(newProgress, quest.target),
        target: quest.target,
        justCompleted,
        rewardType: quest.rewardType as "MULTIPLIER" | "BONUS_XP",
        rewardValue: quest.rewardValue,
      });
    }
  }

  return updates;
}

// ---------------------------------------------------------------------------
// 3. getActiveMultiplier — 현재 활성 배율 조회 (submitSession에서 사용)
// ---------------------------------------------------------------------------

export async function getActiveMultiplier(studentId: string): Promise<number> {
  const { today } = getTodayRange();
  const now = new Date();

  const activeQuests = await prisma.dailyQuest.findMany({
    where: {
      studentId,
      date: today,
      rewardType: "MULTIPLIER",
      rewardClaimed: true,
      multiplierExpiresAt: { gt: now },
    },
    select: { rewardValue: true },
  });

  if (activeQuests.length === 0) return 1;
  return Math.max(...activeQuests.map((q) => q.rewardValue));
}

// ---------------------------------------------------------------------------
// 4. getDailyMission — 레거시 호환 (기존 UI에서 호출)
// ---------------------------------------------------------------------------

export async function getDailyMission(): Promise<DailyMissionStatus> {
  const questStatus = await getDailyQuests();

  const easyQuest = questStatus.quests.find((q) => q.difficulty === "EASY");
  const hardQuest = questStatus.quests.find((q) => q.difficulty === "HARD");

  return {
    date: questStatus.date,
    easy: {
      label: easyQuest?.label ?? "세션 1개 완료하기",
      completed: easyQuest?.completed ?? false,
      rewardMultiplier: easyQuest?.rewardValue ?? 1.2,
    },
    hard: {
      label: hardQuest?.label ?? "세션 3개 완료하기",
      completed: hardQuest?.completed ?? false,
      rewardMultiplier: hardQuest?.rewardValue ?? 2.0,
      condition: { sessionsRequired: 3, minAccuracy: 80 },
    },
    activeMultiplier: questStatus.activeMultiplier,
    multiplierExpiresAt: questStatus.multiplierExpiresAt,
  };
}

// ---------------------------------------------------------------------------
// 5. checkDailyMission — 레거시 호환 (세션 완료 후 호출)
// ---------------------------------------------------------------------------

export async function checkDailyMission(): Promise<{
  easyJustCompleted: boolean;
  hardJustCompleted: boolean;
  multiplier: number | null;
}> {
  // 새 시스템에서는 updateQuestProgress가 대체하므로 빈 응답
  return { easyJustCompleted: false, hardJustCompleted: false, multiplier: null };
}

// ---------------------------------------------------------------------------
// 6. getIndividualRanking — 개인 주간 XP 랭킹
// ---------------------------------------------------------------------------

export async function getIndividualRanking(): Promise<{
  top5: RankingEntry[];
  myRank: RankingEntry | null;
}> {
  const session = await requireStudent();
  const weekStart = getWeekStart();

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
// 7. getSchoolRanking
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
// 8. getAcademyRanking
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
// 9. getStreakInfo
// ---------------------------------------------------------------------------

export async function getStreakInfo() {
  const session = await requireStudent();

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { streak: true, streakFreezeCount: true, lastStudyDate: true },
  });

  if (!student) throw new Error("학생 정보를 찾을 수 없습니다.");

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
