import "server-only";

// ============================================================================
// 레슨 진행 엔진 — 이어보기·완료 판정·유닛 단계 승급 연결
// 규범: docs/study-os-spec.md §6.2
//
// 승급 규칙(변경): 기존에는 concept_check 큐를 끝까지 넘기기만 하면 CONCEPT→DRILL
// 이 무조건 통과됐다(정답률 무관). 이제는 **유닛의 모든 개념 레슨이 완료**되어야
// markConceptDone 이 불린다. 다만 이미 conceptDoneAt 이 있는 학생은 재잠금하지
// 않는다(무회귀).
// ============================================================================

import { prisma } from "@/lib/prisma";
import { UNIT_BY_ID } from "@/lib/grammar-drill/curriculum";
import { markConceptDone } from "@/lib/grammar-drill/engine";
import { getLesson } from "./lesson-bundle";
import { applyGrowth } from "./stats-store";
import type { GameEvent, GrowthReport } from "./stats";

export interface LessonProgressState {
  conceptId: string;
  lastBlockIndex: number;
  blocksSeen: number;
  blocksTotal: number;
  checkCorrect: number;
  checkTotal: number;
  confidence: number | null;
  note: string | null;
  completedAt: Date | null;
}

export async function getLessonProgress(
  studentId: string,
  conceptId: string,
): Promise<LessonProgressState | null> {
  const row = await prisma.grammarDrillLessonProgress.findUnique({
    where: { studentId_conceptId: { studentId, conceptId } },
  });
  if (!row) return null;
  return {
    conceptId: row.conceptId,
    lastBlockIndex: row.lastBlockIndex,
    blocksSeen: row.blocksSeen,
    blocksTotal: row.blocksTotal,
    checkCorrect: row.checkCorrect,
    checkTotal: row.checkTotal,
    confidence: row.confidence,
    note: row.note,
    completedAt: row.completedAt,
  };
}

export async function getUnitLessonProgress(
  studentId: string,
  unitId: string,
): Promise<Map<string, LessonProgressState>> {
  const rows = await prisma.grammarDrillLessonProgress.findMany({
    where: { studentId, unitId },
  });
  return new Map(
    rows.map((r) => [
      r.conceptId,
      {
        conceptId: r.conceptId,
        lastBlockIndex: r.lastBlockIndex,
        blocksSeen: r.blocksSeen,
        blocksTotal: r.blocksTotal,
        checkCorrect: r.checkCorrect,
        checkTotal: r.checkTotal,
        confidence: r.confidence,
        note: r.note,
        completedAt: r.completedAt,
      },
    ]),
  );
}

export interface SaveLessonProgressInput {
  studentId: string;
  academyId: string;
  conceptId: string;
  /** 지금까지 도달한 블록 index (0-based) */
  lastBlockIndex: number;
  blocksSeen: number;
  /** 이번 세션에서 푼 레슨 문항 결과 (누적이 아니라 델타) */
  checkDelta?: { correct: number; total: number };
  secondsDelta?: number;
  confidence?: number | null;
  note?: string | null;
  /** true 면 레슨 완료 처리 */
  complete?: boolean;
  /** v2 — 게임 블록 결과 신고(서버가 블록 실존·타입 검증 후 XP 반영) */
  gameEvents?: GameEvent[];
}

export interface SaveLessonResult {
  ok: true;
  completed: boolean;
  /** 이 레슨 완료로 유닛 개념 학습 단계가 승급했으면 unitId */
  unitConceptDone: string | null;
  /** 유닛의 남은 미완료 개념 수 */
  remainingConcepts: number;
  /** v2 — 이번 저장으로 얻은 성장(완료 화면 연출용). 성장 0 이면 null */
  growth: GrowthReport | null;
}

export async function saveLessonProgress(
  input: SaveLessonProgressInput,
): Promise<SaveLessonResult | null> {
  const lesson = getLesson(input.conceptId);
  if (!lesson) return null;
  const unit = UNIT_BY_ID.get(lesson.unitId);
  if (!unit) return null;

  const blocksTotal = lesson.blocks.length;
  const lastBlockIndex = Math.max(
    0,
    Math.min(blocksTotal - 1, Math.trunc(input.lastBlockIndex)),
  );
  const blocksSeen = Math.max(0, Math.min(blocksTotal, Math.trunc(input.blocksSeen)));
  const secondsDelta = Math.max(0, Math.min(60 * 60, Math.trunc(input.secondsDelta ?? 0)));
  const confidence =
    input.confidence == null ? null : Math.max(1, Math.min(3, Math.trunc(input.confidence)));
  const note = input.note == null ? null : input.note.slice(0, 1000);

  const existing = await prisma.grammarDrillLessonProgress.findUnique({
    where: { studentId_conceptId: { studentId: input.studentId, conceptId: input.conceptId } },
  });

  const completed = Boolean(input.complete) || Boolean(existing?.completedAt);

  // v2 성장 판정 — 이번 호출이 "완주 사건"인가(최초/재수련). 중복·연타 방어는 stats-store 원장이 한다.
  const completionEvent: "first" | "replay" | null = input.complete
    ? existing?.completedAt
      ? "replay"
      : "first"
    : null;

  const data = {
    academyId: input.academyId,
    studentId: input.studentId,
    unitId: lesson.unitId,
    conceptId: input.conceptId,
    blocksTotal,
    // 이어보기 지점·열람 블록 수는 뒤로 가지 않는다(되감기해도 진행률이 줄지 않게)
    lastBlockIndex: Math.max(existing?.lastBlockIndex ?? 0, lastBlockIndex),
    blocksSeen: Math.max(existing?.blocksSeen ?? 0, blocksSeen),
    checkCorrect: (existing?.checkCorrect ?? 0) + (input.checkDelta?.correct ?? 0),
    checkTotal: (existing?.checkTotal ?? 0) + (input.checkDelta?.total ?? 0),
    secondsSpent: (existing?.secondsSpent ?? 0) + secondsDelta,
    confidence: confidence ?? existing?.confidence ?? null,
    note: note ?? existing?.note ?? null,
    completedAt: completed ? (existing?.completedAt ?? new Date()) : null,
  };

  await prisma.grammarDrillLessonProgress.upsert({
    where: { studentId_conceptId: { studentId: input.studentId, conceptId: input.conceptId } },
    create: data,
    update: data,
  });

  // ── 유닛 개념 학습 완료 판정 ──
  let unitConceptDone: string | null = null;
  const unitRows = await prisma.grammarDrillLessonProgress.findMany({
    where: { studentId: input.studentId, unitId: lesson.unitId },
    select: { conceptId: true, completedAt: true },
  });
  const doneIds = new Set(
    unitRows.filter((r) => r.completedAt).map((r) => r.conceptId),
  );
  const remainingConcepts = unit.conceptIds.filter((cid) => !doneIds.has(cid)).length;

  if (remainingConcepts === 0) {
    const advanced = await markConceptDone(
      input.studentId,
      input.academyId,
      lesson.unitId,
    );
    if (advanced) unitConceptDone = lesson.unitId;
  }

  // v2 성장 반영 — 실패해도 학습 저장을 막지 않는다(스텟은 다음 저장에서 따라잡는다)
  let growth: GrowthReport | null = null;
  try {
    growth = await applyGrowth({
      studentId: input.studentId,
      academyId: input.academyId,
      conceptId: input.conceptId,
      completion: completionEvent,
      checkDelta: input.checkDelta,
      gameEvents: input.gameEvents,
    });
  } catch {
    growth = null;
  }

  return { ok: true, completed, unitConceptDone, remainingConcepts, growth };
}
