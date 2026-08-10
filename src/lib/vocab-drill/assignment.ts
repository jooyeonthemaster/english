// 단어 훈련 — 과제 진행·풀 산정 (server-only)
//
// 과제의 "완료"는 시도 행 수가 아니라 **풀 안의 서로 다른 단어 수**로 판정한다.
//   · 시도 행 수 기준: 풀 < 목표인 과제가 영원히 미완료(적대검수 2026-08-04 1차)
//   · 풀 무검증 distinct: 풀 밖 쉬운 단어 20개를 골라 제출해 완료 자가부여
//     (적대검수 2026-08-04 2차 — FLASH 유입구는 engine.ts 제출 가드가 봉인,
//      여기는 판정 자체를 방어하는 두 번째 겹이다)
import "server-only";

import { prisma } from "@/lib/prisma";
import { GRADED_ITEM_TYPES } from "./constants";
import { resolveDeckSenseIds } from "./content";
import type { VocabDeckSpec } from "./payload";

interface AssignmentSpecShape {
  deckIds?: string[];
  senseIds?: string[];
  tiers?: string[];
  difficulties?: number[];
  count?: number;
}

/**
 * 과제 spec 이 실제로 서빙할 수 있는 sense id 목록 — 큐 빌더(queue.ts
 * assignment 분기)와 같은 우선순위(senseIds > deckIds > 조건)를 쓴다.
 * 완료 판정·풀 크기·배포 가드가 전부 이 하나에서 파생돼야 어긋나지 않는다.
 */
export async function assignmentPoolSenseIds(
  academyId: string,
  rawSpec: unknown,
): Promise<string[]> {
  const spec = (rawSpec ?? {}) as AssignmentSpecShape;
  if (spec.senseIds?.length) {
    // 은퇴 sense 는 서빙되지 않으므로 실측한다(길이만 세면 과대 계상).
    const rows = await prisma.vocabDrillSense.findMany({
      where: { id: { in: spec.senseIds.slice(0, 500) }, retiredAt: null },
      select: { id: true },
      take: 500,
    });
    return rows.map((r) => r.id);
  }
  if (spec.deckIds?.length) {
    const decks = await prisma.vocabDrillDeck.findMany({
      where: { id: { in: spec.deckIds.slice(0, 5) }, academyId },
      select: { spec: true },
    });
    const ids = new Set<string>();
    for (const d of decks) {
      for (const id of await resolveDeckSenseIds(d.spec as VocabDeckSpec)) {
        ids.add(id); // 덱이 겹치면 같은 sense 가 두 번 세이지 않게
      }
    }
    return [...ids];
  }
  return resolveDeckSenseIds({
    tiers: spec.tiers,
    difficulties: spec.difficulties,
    limit: 500,
  });
}

/** 과제 풀 크기 — 배포 가드(mutations)용. 정본은 assignmentPoolSenseIds. */
export async function assignmentPoolSize(
  academyId: string,
  rawSpec: unknown,
): Promise<number> {
  return (await assignmentPoolSenseIds(academyId, rawSpec)).length;
}

export async function advanceAssignment(studentId: string, assignmentId: string) {
  const assignment = await prisma.vocabDrillAssignment.findFirst({
    where: { id: assignmentId, studentId },
  });
  if (!assignment || assignment.status === "DONE") return;
  const spec = assignment.spec as { count?: number };
  const [attempts, poolIdArr] = await Promise.all([
    prisma.vocabDrillAttempt.findMany({
      // 채점 유형만 — FLASH 자기평가는 진행이 아니다(큐 doneIds 와 동일 술어).
      where: {
        studentId,
        assignmentId,
        itemType: { in: GRADED_ITEM_TYPES },
      },
      select: { correct: true, timeMs: true, senseId: true },
      take: 1000,
    }),
    assignmentPoolSenseIds(assignment.academyId, assignment.spec),
  ]);
  /**
   * ★ 풀 안의 서로 다른 단어 수로 판정한다. 풀 밖 senseId 제출(쉬운 단어 골라
   * 완료 자가부여)과 시도 행 인플레를 동시에 차단하고, 점수 요약도 풀 안
   * 시도만 계상한다 — 선생님이 보는 결과가 과제 내용과 일치해야 한다.
   */
  const poolIds = new Set(poolIdArr);
  const inPool = attempts.filter((a) => poolIds.has(a.senseId));
  const distinct = new Set(inPool.map((a) => a.senseId)).size;
  const target = Math.max(
    1,
    Math.min(Number(spec?.count ?? 20), poolIds.size),
  );
  const data: Record<string, unknown> = {};
  if (assignment.status === "ASSIGNED") {
    data.status = "IN_PROGRESS";
    data.startedAt = new Date();
  }
  if (distinct >= target) {
    data.status = "DONE";
    data.completedAt = new Date();
    data.resultSummary = {
      total: inPool.length,
      correct: inPool.filter((a) => a.correct).length,
      timeMs: inPool.reduce((s, a) => s + a.timeMs, 0),
    };
  }
  if (Object.keys(data).length > 0) {
    await prisma.vocabDrillAssignment.update({
      where: { id: assignment.id },
      data,
    });
  }
}
