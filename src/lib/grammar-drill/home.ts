// ============================================================================
// 어법 드릴 — 홈 대시보드 조립 (서버 전용)
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  GRAMMAR_UNITS,
  CONCEPT_SKELETON_BY_ID,
  JUDGE_UNIT_IDS,
  unitLabel,
} from "./curriculum";
import { getGrammarBundle } from "./bundle";
import { computeUnlockedUnits } from "./engine";
import { getLessonBundle } from "@/lib/study-os/lesson-bundle";
import type { GrammarDrillSession } from "./auth";
import type {
  HomeGrammarSummary,
  HomeNextStep,
  HomePayload,
  HomeUnitCard,
} from "./payload";

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

  const [
    masteries,
    progresses,
    todayAttempts,
    recentDays,
    assignments,
    chatToday,
    mixedAttempts,
    lessonRows,
  ] = await Promise.all([
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
      // 레슨 진행 — 오늘의 한 수(레슨 이어보기)와 유닛별 개념 학습 집계의 근거
      prisma.grammarDrillLessonProgress.findMany({
        where: { studentId },
        select: {
          unitId: true,
          conceptId: true,
          blocksSeen: true,
          blocksTotal: true,
          lastBlockIndex: true,
          completedAt: true,
        },
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

  // ── 레슨 진행 인덱스 ──
  // 레슨은 개념별 JSON 저작물이라 아직 없는 개념이 있다(팬아웃 진행 중).
  // 없는 개념은 집계에서 제외하고, 진입은 드릴로 폴백한다(죽은 링크 금지).
  const lessons = getLessonBundle().lessonsById;
  const lessonRowByConcept = new Map(lessonRows.map((r) => [r.conceptId, r]));
  const lessonConceptIds = (unitId: string) =>
    (GRAMMAR_UNITS.find((u) => u.id === unitId)?.conceptIds ?? []).filter((c) =>
      lessons.has(c),
    );

  const units: HomeUnitCard[] = GRAMMAR_UNITS.map((u) => {
    const progress = progresses.find((p) => p.unitId === u.id);
    const masteryAvg =
      u.conceptIds.reduce((s, c) => s + scoreOf(c), 0) / u.conceptIds.length;
    const lessonIds = lessonConceptIds(u.id);
    return {
      unitId: u.id,
      title: u.title,
      subtitle: u.subtitle,
      part: u.part,
      frequency: u.frequency,
      stage: unlocked.has(u.id) ? (progress?.stage ?? "CONCEPT") : "LOCKED",
      masteryAvg: Math.round(masteryAvg),
      attempted: attemptsOf(u.id),
      lessonsTotal: lessonIds.length,
      lessonsDone: lessonIds.filter(
        (c) => lessonRowByConcept.get(c)?.completedAt != null,
      ).length,
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

  // 복합 세트 잠금: set1=u01~u05 드릴 게이트, set2=u06~u09, final=판별 12유닛.
  // ⚠️ final 은 **판별 유닛(JUDGE)만** 본다 — PART 0 기초 유닛(b01~b07)이 커리큘럼에
  // 합류하면서 GRAMMAR_UNITS 가 19개가 됐고, 전 유닛 조건으로 두면 기존 학생의
  // final 세트가 소급 재잠금된다(무회귀 위반).
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
          : JUDGE_UNIT_IDS.every(drillDone);
    return {
      setId: s.setId,
      title: s.title,
      unlocked: scopeDone,
      solved: s.itemIds.filter((id) => mixedSolvedIds.has(id)).length,
    };
  });

  // ── 오늘의 한 수 (학습 후보) ──
  const conceptTitle = (cid: string) =>
    lessons.get(cid)?.title ?? CONCEPT_SKELETON_BY_ID.get(cid)?.title ?? cid;

  const unitCardById = new Map(units.map((u) => [u.unitId, u]));
  const hasActivity = (unitId: string) => {
    const p = progresses.find((x) => x.unitId === unitId);
    if (p && (p.stage !== "CONCEPT" || p.conceptDoneAt)) return true;
    if (attemptsOf(unitId) > 0) return true;
    return lessonRows.some((r) => r.unitId === unitId);
  };

  const openUnits = GRAMMAR_UNITS.filter(
    (u) => unlocked.has(u.id) && unitCardById.get(u.id)?.stage !== "MASTERED",
  );
  const currentUnit =
    openUnits.find((u) => hasActivity(u.id)) ?? openUnits[0] ?? null;

  const nextStep = ((): HomeNextStep => {
    // ② 진행 중 유닛의 다음 단계 — 레슨이 남아 있으면 언제나 레슨이 먼저다
    if (currentUnit && hasActivity(currentUnit.id)) {
      const step = unitNextStep(currentUnit.id);
      if (step) return step;
    }

    // ③ 취약 개념 복습
    const weak = weakest.find((w) => w.score < 70);
    if (weak) {
      return {
        label: "취약 개념 집중 드릴",
        target: `${unitLabel(weak.unitId)} · ${weak.title}`,
        reason: `숙달도 ${weak.score} — 지금 가장 약한 개념입니다`,
        href: `/g/drill?mode=drill&unitId=${weak.unitId}&conceptId=${weak.conceptId}`,
        kind: "DRILL",
        cta: "집중 드릴 시작",
      };
    }

    // ④ 다음 유닛 개념 학습
    if (currentUnit) {
      const step = unitNextStep(currentUnit.id);
      if (step) return step;
    }

    // ⑤ 복합 세트 → 오늘의 드릴
    const openSet = mixedSets.find((s) => s.unlocked);
    if (openSet) {
      return {
        label: "누적 복합 세트 풀기",
        target: openSet.title,
        reason: "모든 유닛을 마쳤습니다. 섞어서 판별합니다",
        href: `/g/drill?mode=mixed&setId=${openSet.setId}`,
        kind: "MIXED",
        cta: "복합 세트 시작",
      };
    }
    return {
      label: "오늘의 드릴",
      target: "취약 개념 자동 편성",
      reason: "숙달도가 낮은 개념부터 다시 나옵니다",
      href: "/g/drill?mode=smart",
      kind: "REVIEW",
      cta: "드릴 시작",
    };
  })();

  /** 유닛 하나의 "다음 한 수" — 레슨 우선, 그다음 단계별 훈련 */
  function unitNextStep(unitId: string): HomeNextStep | null {
    const card = unitCardById.get(unitId);
    const unit = GRAMMAR_UNITS.find((u) => u.id === unitId);
    if (!card || !unit) return null;
    const lessonIds = lessonConceptIds(unitId);

    // 이어보기 — 열람했지만 완료하지 않은 레슨
    const resuming = lessonIds.find((c) => {
      const r = lessonRowByConcept.get(c);
      return r && !r.completedAt && r.blocksSeen > 0;
    });
    const target = resuming ?? lessonIds.find((c) => !lessonRowByConcept.get(c)?.completedAt);
    if (target) {
      const r = lessonRowByConcept.get(target);
      const resumed = Boolean(resuming && r);
      return {
        label: resumed ? "개념 학습 이어서 하기" : "개념 학습 시작하기",
        target: `${unitLabel(unitId)} · ${conceptTitle(target)}`,
        reason: resumed
          ? `${r!.blocksSeen}/${r!.blocksTotal} 블록까지 봤습니다`
          : card.lessonsDone > 0
            ? `이 유닛의 개념 ${card.lessonsDone}/${card.lessonsTotal}개를 마쳤습니다`
            : `${unit.subtitle} — 여기서 시작합니다`,
        href: `/g/unit/${unitId}/lesson/${target}`,
        kind: "LESSON",
        cta: resumed ? "이어서 하기" : "학습 시작",
      };
    }

    // 레슨을 다 마쳤다 → 유닛 단계에 맞는 훈련
    const stage = card.stage === "LOCKED" ? "CONCEPT" : card.stage;
    const mode =
      stage === "READING"
        ? "reading"
        : stage === "WRITTEN"
          ? "written"
          : stage === "TEST"
            ? "test"
            : "drill";
    const spec = TRAIN_SPEC[mode];
    return {
      label: spec.label,
      target: `${unitLabel(unitId)} · ${unit.title}`,
      reason:
        lessonIds.length > 0
          ? "개념 학습을 모두 마쳤습니다"
          : "이 유닛의 훈련을 이어 갑니다",
      href: `/g/drill?mode=${mode}&unitId=${unitId}`,
      kind: spec.kind,
      cta: spec.cta,
    };
  }

  const lessonsTotal = GRAMMAR_UNITS.reduce(
    (s, u) => s + (unitCardById.get(u.id)?.lessonsTotal ?? 0),
    0,
  );
  const lessonsDone = GRAMMAR_UNITS.reduce(
    (s, u) => s + (unitCardById.get(u.id)?.lessonsDone ?? 0),
    0,
  );
  const grammar: HomeGrammarSummary = {
    unitsTotal: GRAMMAR_UNITS.length,
    unitsUnlocked: unlocked.size,
    unitsMastered: units.filter((u) => u.stage === "MASTERED").length,
    lessonsTotal,
    lessonsDone,
    progressPct:
      lessonsTotal > 0 ? Math.round((lessonsDone / lessonsTotal) * 100) : 0,
    currentUnitId: currentUnit?.id ?? null,
    currentUnitTitle: currentUnit?.title ?? null,
  };

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
    nextStep,
    grammar,
  };
}

/** 훈련 모드별 라벨 — 유닛 허브(unit-hub-client)의 문구와 같은 결로 유지한다 */
const TRAIN_SPEC: Record<
  string,
  { label: string; cta: string; kind: HomeNextStep["kind"] }
> = {
  drill: { label: "드릴 풀기", cta: "드릴 시작", kind: "DRILL" },
  reading: { label: "실전 독해 풀기", cta: "독해 시작", kind: "READING" },
  written: { label: "서술형 풀기", cta: "서술형 시작", kind: "WRITTEN" },
  test: { label: "유닛 테스트 보기", cta: "테스트 시작", kind: "TEST" },
};
