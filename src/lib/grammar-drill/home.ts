// ============================================================================
// 어법 드릴 — 홈 대시보드 조립 (서버 전용)
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { GRAMMAR_UNITS, CONCEPT_SKELETON_BY_ID } from "./curriculum";
import { getGrammarBundle } from "./bundle";
import { computeUnlockedUnits } from "./engine";
import type { GrammarDrillSession } from "./auth";
import type { HomePayload } from "./payload";

export const CHAT_DAILY_LIMIT = 40;

/** 서울(UTC+9) 자정 기준 그 날의 시작(UTC Date). */
export function seoulDayStart(now = new Date()): Date {
  const SEOUL = 9 * 60 * 60 * 1000;
  return new Date(Math.floor((now.getTime() + SEOUL) / 86_400_000) * 86_400_000 - SEOUL);
}

function seoulDayKey(d: Date): number {
  const SEOUL = 9 * 60 * 60 * 1000;
  return Math.floor((d.getTime() + SEOUL) / 86_400_000);
}

/** 서울 일 인덱스 → 요일(0=일 … 6=토). epoch day 0(1970-01-01)은 목요일. */
function seoulDayOfWeek(dayKey: number): number {
  return (dayKey + 4) % 7;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 오늘 질문 잔여 — 햄버거 시트 표시용 경량 헬퍼(count 1쿼리).
 * home 외 탭(/g/me·/g/tasks)이 병렬 로드해 GShell 로 관통시킨다.
 */
export async function getChatRemainingToday(studentId: string): Promise<number> {
  const used = await prisma.grammarDrillChatMessage.count({
    where: { studentId, role: "user", createdAt: { gte: seoulDayStart() } },
  });
  return Math.max(0, CHAT_DAILY_LIMIT - used);
}

export async function buildHomePayload(
  session: GrammarDrillSession,
): Promise<HomePayload> {
  const { studentId } = session;
  const dayStart = seoulDayStart();

  const [masteries, progresses, todayAttempts, recentDays, assignments, chatToday, mixedAttempts] =
    await Promise.all([
      prisma.grammarDrillMastery.findMany({ where: { studentId } }),
      prisma.grammarDrillUnitProgress.findMany({ where: { studentId } }),
      prisma.grammarDrillAttempt.findMany({
        where: { studentId, createdAt: { gte: dayStart } },
        select: { correct: true },
      }),
      prisma.grammarDrillAttempt.findMany({
        where: {
          studentId,
          createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.grammarDrillAssignment.findMany({
        where: { studentId, status: { not: "DONE" } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.grammarDrillChatMessage.count({
        where: { studentId, role: "user", createdAt: { gte: dayStart } },
      }),
      prisma.grammarDrillAttempt.findMany({
        where: { studentId, source: "MIXED" },
        select: { itemId: true },
        distinct: ["itemId"],
      }),
    ]);

  const totalSolved = await prisma.grammarDrillAttempt.count({ where: { studentId } });

  // 연속 학습일 — 최근 60일 시도에서 서울 기준 연속 일수
  const dayKeys = new Set(recentDays.map((a) => seoulDayKey(a.createdAt)));
  const todayKey = seoulDayKey(new Date());
  let streakDays = 0;
  let cursor = dayKeys.has(todayKey) ? todayKey : todayKey - 1;
  while (dayKeys.has(cursor)) {
    streakDays++;
    cursor--;
  }

  // 주간 학습 리듬 — 이번 주(월요일 시작) 7일의 활동 여부. recentDays(60일
  // 프리로드) 재사용이라 추가 쿼리 0 — 파생 표시 값만 additive 로 얹는다.
  const weekStartKey = todayKey - ((seoulDayOfWeek(todayKey) + 6) % 7);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = weekStartKey + i;
    return {
      weekday: WEEKDAY_LABELS[seoulDayOfWeek(key)],
      active: dayKeys.has(key),
      isToday: key === todayKey,
    };
  });
  const weekActiveDays = week.filter((d) => d.active).length;

  const unlocked = computeUnlockedUnits(progresses);
  const scoreOf = (cid: string) =>
    masteries.find((m) => m.conceptId === cid)?.masteryScore ?? 0;
  const attemptsOf = (unitId: string) =>
    masteries
      .filter((m) => m.unitId === unitId)
      .reduce((s, m) => s + m.attempts, 0);

  const units = GRAMMAR_UNITS.map((u) => {
    const progress = progresses.find((p) => p.unitId === u.id);
    const masteryAvg =
      u.conceptIds.reduce((s, c) => s + scoreOf(c), 0) / u.conceptIds.length;
    return {
      unitId: u.id,
      title: u.title,
      subtitle: u.subtitle,
      part: u.part,
      frequency: u.frequency,
      stage: unlocked.has(u.id) ? (progress?.stage ?? "CONCEPT") : "LOCKED",
      masteryAvg: Math.round(masteryAvg),
      attempted: attemptsOf(u.id),
    };
  });

  const weakest = masteries
    .filter((m) => m.attempts >= 3)
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 3)
    .map((m) => ({
      conceptId: m.conceptId,
      title: CONCEPT_SKELETON_BY_ID.get(m.conceptId)?.title ?? m.conceptId,
      unitId: m.unitId,
      score: Math.round(m.masteryScore),
    }));

  const assignmentCards = await Promise.all(
    assignments.map(async (a) => {
      const spec = a.spec as { count?: number };
      const total = Math.max(1, Number(spec?.count ?? 10));
      const done = await prisma.grammarDrillAttempt.count({
        where: { studentId, assignmentId: a.id },
      });
      return {
        id: a.id,
        title: a.title,
        note: a.note,
        status: a.status,
        total,
        done: Math.min(done, total),
      };
    }),
  );

  // 복합 세트 잠금: set1=u01~u05 드릴 게이트, set2=u06~u09, final=전 유닛
  const drillDone = (unitId: string) =>
    Boolean(progresses.find((p) => p.unitId === unitId)?.drillDoneAt);
  const bundle = getGrammarBundle();
  const mixedSolvedIds = new Set(mixedAttempts.map((a) => a.itemId));
  const mixedSets = bundle.mixedSets.map((s) => {
    const scopeDone =
      s.setId === "set1"
        ? ["u01", "u02", "u03", "u04", "u05"].every(drillDone)
        : s.setId === "set2"
          ? ["u06", "u07", "u08", "u09"].every(drillDone)
          : GRAMMAR_UNITS.every((u) => drillDone(u.id));
    return {
      setId: s.setId,
      title: s.title,
      unlocked: scopeDone,
      solved: s.itemIds.filter((id) => mixedSolvedIds.has(id)).length,
    };
  });

  return {
    studentName: session.studentName,
    academyName: session.academyName,
    todaySolved: todayAttempts.length,
    todayCorrect: todayAttempts.filter((a) => a.correct).length,
    totalSolved,
    streakDays,
    week,
    weekActiveDays,
    units,
    weakest,
    assignments: assignmentCards,
    mixedSets,
    chatRemainingToday: Math.max(0, CHAT_DAILY_LIMIT - chatToday),
  };
}
