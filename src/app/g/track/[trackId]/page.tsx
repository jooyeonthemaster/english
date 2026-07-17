// 트랙 허브 — /g/track/[trackId]
// grammar: 19유닛 유닛맵(PART 0 기초 골격 + PART 1~3 수능 판별) + 다음 한 수.
// 나머지 3트랙: 준비 안내(무엇이 준비되는가 / 지금 대신 할 것) — 죽은 링크 금지.
// 규범: docs/study-os-spec.md §1 · §4.3

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { getChatRemainingToday } from "@/lib/grammar-drill/home";
import { loadStudentUnifiedTasks } from "@/lib/study-assignments/task-union";
import { GShell } from "@/components/grammar-drill/g-shell";
import { GRAMMAR_PARTS, GRAMMAR_UNITS } from "@/lib/grammar-drill/curriculum";
import { computeUnlockedUnits } from "@/lib/grammar-drill/engine";
import { getLessonBundle } from "@/lib/study-os/lesson-bundle";
import { isTrackId, TRACK_BY_ID } from "@/lib/study-os/tracks";
import type { GrammarLesson } from "@/lib/study-os/lesson-types";
import {
  GrammarTrackClient,
  type NextMove,
  type TrackPartMeta,
  type TrackUnitRow,
} from "./grammar-track-client";
import { PreparingTrack } from "./preparing-track";

export const dynamic = "force-dynamic";

interface LessonProgressRow {
  conceptId: string;
  lastBlockIndex: number;
  completedAt: Date | null;
  updatedAt: Date;
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ trackId: string }>;
}) {
  if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) redirect("/");
  const session = await getGrammarSession();
  if (!session) redirect("/g");

  const { trackId } = await params;
  if (!isTrackId(trackId)) redirect("/g/home");
  const track = TRACK_BY_ID.get(trackId)!;

  // 트랙 허브는 탭 루트다 — 반드시 셸(헤더·하단 탭바)로 감싼다.
  // 감싸지 않으면 "학습" 탭에 들어간 학생이 다른 탭으로 돌아갈 길을 잃는다.
  const [taskRecords, chatRemainingToday] = await Promise.all([
    loadStudentUnifiedTasks(session.studentId, session.academyId).catch(() => []),
    getChatRemainingToday(session.studentId).catch(() => undefined),
  ]);
  const shell = {
    studentName: session.studentName,
    academyName: session.academyName,
    tasksBadgeCount: taskRecords.filter((t) => t.status !== "DONE").length,
    chatRemainingToday,
  };

  if (track.status !== "LIVE" || track.id !== "grammar") {
    return (
      <GShell {...shell}>
        <PreparingTrack track={track} />
      </GShell>
    );
  }

  const [progresses, masteries, lessonProgress] = await Promise.all([
    prisma.grammarDrillUnitProgress.findMany({
      where: { studentId: session.studentId },
      select: { unitId: true, drillDoneAt: true, stage: true, bestTestScore: true },
    }),
    prisma.grammarDrillMastery.findMany({
      where: { studentId: session.studentId },
      select: { conceptId: true, masteryScore: true },
    }),
    prisma.grammarDrillLessonProgress.findMany({
      where: { studentId: session.studentId },
      select: {
        conceptId: true,
        lastBlockIndex: true,
        completedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const unlocked = computeUnlockedUnits(progresses);
  const lessons = getLessonBundle().lessonsById;
  const lpByConcept = new Map<string, LessonProgressRow>(
    lessonProgress.map((r) => [r.conceptId, r]),
  );
  const masteryByConcept = new Map(
    masteries.map((m) => [m.conceptId, m.masteryScore]),
  );

  const units: TrackUnitRow[] = GRAMMAR_UNITS.map((u) => {
    const progress = progresses.find((p) => p.unitId === u.id);
    const lessonConceptIds = u.conceptIds.filter((c) => lessons.has(c));
    const lessonsDone = lessonConceptIds.filter(
      (c) => lpByConcept.get(c)?.completedAt,
    ).length;
    const masterySum = u.conceptIds.reduce(
      (sum, c) => sum + (masteryByConcept.get(c) ?? 0),
      0,
    );
    const touchedAt = u.conceptIds.reduce((max, c) => {
      const t = lpByConcept.get(c)?.updatedAt?.getTime() ?? 0;
      return t > max ? t : max;
    }, 0);

    return {
      id: u.id,
      title: u.title,
      subtitle: u.subtitle,
      part: u.part,
      group: u.unlockGroup,
      frequency: u.frequency,
      frequencyNote: u.frequencyNote,
      stage: progress?.stage ?? "CONCEPT",
      stageSet: u.stageSet,
      locked: !unlocked.has(u.id),
      lessonsDone,
      lessonsTotal: lessonConceptIds.length,
      mastery: u.conceptIds.length
        ? Math.round(masterySum / u.conceptIds.length)
        : 0,
      bestTestScore: progress?.bestTestScore ?? null,
      touchedAt,
    };
  });

  const parts: TrackPartMeta[] = GRAMMAR_PARTS.map((p) => ({
    part: p.part,
    name: p.name,
    tagline: p.tagline,
  }));

  return (
    <GShell {...shell}>
      <GrammarTrackClient
        trackName={track.name}
        tagline={track.tagline}
        units={units}
        parts={parts}
        next={computeNextMove(units, lessons, lpByConcept)}
      />
    </GShell>
  );
}

// ── 다음 한 수 ───────────────────────────────────────────────────────────────
// 우선순위: ① 최근에 손댄 진행 중 유닛 → ② 열려 있는 첫 판별 유닛 →
// ③ 열려 있는 첫 기초 유닛 → ④ (전부 마스터) 마지막 유닛 복습.

function computeNextMove(
  units: TrackUnitRow[],
  lessons: Map<string, GrammarLesson>,
  lpByConcept: Map<string, LessonProgressRow>,
): NextMove {
  const open = units.filter((u) => !u.locked);
  const unfinished = open.filter((u) => u.stage !== "MASTERED");

  const active = [...unfinished]
    .filter((u) => u.touchedAt > 0)
    .sort((a, b) => b.touchedAt - a.touchedAt)[0];

  const target =
    active ??
    unfinished.find((u) => u.group === "JUDGE") ??
    unfinished[0] ??
    open[open.length - 1];

  return moveForUnit(target, lessons, lpByConcept);
}

function moveForUnit(
  unit: TrackUnitRow,
  lessons: Map<string, GrammarLesson>,
  lpByConcept: Map<string, LessonProgressRow>,
): NextMove {
  const curriculumUnit = GRAMMAR_UNITS.find((u) => u.id === unit.id)!;
  const lessonConceptIds = curriculumUnit.conceptIds.filter((c) =>
    lessons.has(c),
  );

  const resuming = lessonConceptIds.find((c) => {
    const lp = lpByConcept.get(c);
    return lp && !lp.completedAt && lp.lastBlockIndex > 0;
  });
  const fresh = lessonConceptIds.find((c) => !lpByConcept.get(c)?.completedAt);
  const conceptId = resuming ?? fresh;

  if (conceptId) {
    const lesson = lessons.get(conceptId)!;
    const seen = lpByConcept.get(conceptId)?.lastBlockIndex ?? 0;
    return {
      label: seen > 0 ? "개념 학습 이어서 하기" : "개념 학습 시작하기",
      sub: `${unit.title} · ${lesson.title}`,
      why:
        seen > 0
          ? `${seen + 1}번째 블록부터 이어집니다`
          : `${lesson.blocks.length}개 블록 · 약 ${lesson.estimatedMinutes}분`,
      href: `/g/unit/${unit.id}/lesson/${conceptId}`,
    };
  }

  if (unit.stage === "MASTERED") {
    return {
      label: "복습 드릴 풀기",
      sub: unit.title,
      why: "마스터한 유닛입니다 — 가장 오래 안 본 문항부터 나옵니다",
      href: `/g/drill?mode=drill&unitId=${unit.id}`,
    };
  }

  const mode = MODE_OF_STAGE[unit.stage] ?? "drill";
  return {
    label: MODE_LABEL[mode],
    sub: `${unit.title} · ${MODE_DESC[mode]}`,
    why: "개념 학습을 모두 마쳤습니다",
    href: `/g/drill?mode=${mode}&unitId=${unit.id}`,
  };
}

const MODE_OF_STAGE: Record<string, string> = {
  CONCEPT: "drill",
  DRILL: "drill",
  READING: "reading",
  WRITTEN: "written",
  TEST: "test",
};
const MODE_LABEL: Record<string, string> = {
  drill: "드릴 풀기",
  reading: "실전 독해 풀기",
  written: "서술형 풀기",
  test: "유닛 테스트 보기",
};
const MODE_DESC: Record<string, string> = {
  drill: "택일·OX 무한 훈련",
  reading: "미니 29번 · 수능 29번 지문",
  written: "직접 고쳐 쓰기",
  test: "10문항 종합 — 70점 이상이면 마스터",
};
