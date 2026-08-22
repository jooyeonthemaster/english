// ============================================================================
// 클래스 스튜디오 — 결과 집계 헬퍼 (server-only)
//
// 평균 첫 시도 정답률은 저장 스냅샷(masteryPct)이 아니라 stageStates 재계산이
// 정본이다(worksheet-study-spec §5.1) — 목록 카드·이력·「자세히」 모달이 같은
// 원천을 쓰게 하는 단일 함수. (적대검수 2026-08-09 정합)
// ============================================================================

import "server-only";

import { prisma } from "@/lib/prisma";
import { computeStudyMastery } from "@/lib/worksheet-study/grade";

/**
 * assignmentId → 평균 첫 시도 정답률(%). 정답률 기록이 없는 학생은 평균에서 제외,
 * 전원 기록 없으면 null. 각 학생의 firstTryPct 를 stageStates 에서 재계산해 평균낸다.
 */
export async function avgFirstTryPctByAssignment(
  academyId: string,
  assignmentIds: string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (assignmentIds.length === 0) return out;
  const states = await prisma.worksheetStudyState.findMany({
    where: { academyId, assignmentId: { in: assignmentIds } },
    select: { assignmentId: true, stageStates: true },
  });
  const acc = new Map<string, { sum: number; n: number }>();
  for (const s of states) {
    const raw =
      s.stageStates && typeof s.stageStates === "object" && !Array.isArray(s.stageStates)
        ? (s.stageStates as Parameters<typeof computeStudyMastery>[0])
        : {};
    const mastery = computeStudyMastery(raw);
    if (mastery.firstTryPct === null) continue;
    const cur = acc.get(s.assignmentId) ?? { sum: 0, n: 0 };
    cur.sum += mastery.firstTryPct;
    cur.n += 1;
    acc.set(s.assignmentId, cur);
  }
  for (const id of assignmentIds) {
    const a = acc.get(id);
    out.set(id, a && a.n > 0 ? Math.round(a.sum / a.n) : null);
  }
  return out;
}
