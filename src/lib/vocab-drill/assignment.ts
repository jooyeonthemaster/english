// 단어 훈련 — 과제 진행·풀 산정 (server-only)
//
// 과제의 "완료"는 시도 행 수가 아니라 **서로 다른 단어 수**로 판정한다 — 큐가 이미
// 푼 sense 를 다시 내지 않기 때문이다(queue.ts assignment 분기). 이 기준이 어긋나면
// 풀보다 큰 목표의 과제가 영원히 미완료로 남는다(적대검수 2026-08-04).
import "server-only";

import { prisma } from "@/lib/prisma";
import { countDeckPool, resolveDeckSenseIds } from "./content";
import type { VocabDeckSpec } from "./payload";

/**
 * 과제 spec 이 실제로 서빙할 수 있는 **서로 다른 sense 수**.
 * 큐 빌더(queue.ts assignment 분기)와 같은 술어를 써야 완료 판정이 어긋나지 않는다.
 */
export async function assignmentPoolSize(
  academyId: string,
  rawSpec: unknown,
): Promise<number> {
  const spec = (rawSpec ?? {}) as {
    deckIds?: string[];
    senseIds?: string[];
    tiers?: string[];
    difficulties?: number[];
  };
  if (spec.senseIds?.length) {
    // 은퇴 sense 는 서빙되지 않으므로 실측한다(길이만 세면 과대 계상).
    return prisma.vocabDrillSense.count({
      where: { id: { in: spec.senseIds.slice(0, 500) }, retiredAt: null },
    });
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
    return ids.size;
  }
  return countDeckPool({
    tiers: spec.tiers,
    difficulties: spec.difficulties,
    limit: 500,
  });
}

export async function advanceAssignment(studentId: string, assignmentId: string) {
  const assignment = await prisma.vocabDrillAssignment.findFirst({
    where: { id: assignmentId, studentId },
  });
  if (!assignment || assignment.status === "DONE") return;
  const spec = assignment.spec as { count?: number };
  const attempts = await prisma.vocabDrillAttempt.findMany({
    where: { studentId, assignmentId },
    select: { correct: true, timeMs: true, senseId: true },
    take: 1000,
  });
  /**
   * ★ 완료 판정은 **서로 다른 단어 수**로 한다 — 큐가 이미 푼 sense 를 다시 내지
   * 않기 때문이다(queue.ts assignment 분기). 시도 행 수로 재면, 풀이 목표보다
   * 작은 과제는 학생이 전부 풀어도 영원히 미완료로 남는다(적대검수 2026-08-04).
   * 목표도 실제 풀 크기로 상한을 둔다 — 배포 가드가 놓친 과제를 여기서 구제한다.
   */
  const distinct = new Set(attempts.map((a) => a.senseId)).size;
  const target = Math.max(
    1,
    Math.min(
      Number(spec?.count ?? 20),
      await assignmentPoolSize(assignment.academyId, assignment.spec),
    ),
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
      total: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
      timeMs: attempts.reduce((s, a) => s + a.timeMs, 0),
    };
  }
  if (Object.keys(data).length > 0) {
    await prisma.vocabDrillAssignment.update({
      where: { id: assignment.id },
      data,
    });
  }
}
