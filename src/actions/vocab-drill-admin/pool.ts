"use server";

// ============================================================================
// 단어 훈련 — 배정 풀 카운트 서버 액션 (과제 컴포저 라이브 검증)
//
// grammar-drill-admin countGrammarDrillPool 의 단어판. **술어를 자체 구현하지
// 않는다** — engine.assignmentPoolSize 를 그대로 부른다. 컴포저 배지가 약속한
// 숫자(= 서버가 문항 수를 클램프할 값 = 완료 판정 목표)가 세 곳에서 따로
// 계산되면 반드시 갈라진다(적대검수 2026-08-04: 덱 중복 sense 를 배지는 이중
// 계상, 엔진은 dedupe / senseIds 는 배지만 은퇴 sense 실측 → 셋 다 불일치).
// 산정 우선순위도 엔진 정의를 따른다: senseIds > deckIds > tiers/difficulties.
// 디렉터 인증 필수 — 학생 경로에서 절대 재사용하지 않는다.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { assignmentPoolSize } from "@/lib/vocab-drill/engine";
import type { VocabAssignmentPayload } from "@/lib/study-assignments/types";

/** countVocabDrillPoolAction 반환 — 컴포저 배지는 total 만 소비한다 */
export interface VocabPoolCount {
  total: number;
}

/**
 * 배정 스펙이 실제로 서빙할 수 있는 **서로 다른 sense 수**.
 * 은퇴(retired) sense 제외·덱 간 중복 제거·덱 limit 반영이 모두 엔진 술어에
 * 포함돼 있다. 0 이면 영원히 완료 불가한 과제이므로 배포가 거부되고,
 * count 보다 작으면 배포 시 서버가 문항 수를 이 값으로 클램프한다.
 */
export async function countVocabDrillPoolAction(
  spec: Omit<VocabAssignmentPayload, "count"> & { count?: number },
): Promise<VocabPoolCount> {
  const staff = await requireStaffAuth();

  const total = await assignmentPoolSize(staff.academyId, {
    // 상한은 학생 큐(buildVocabQueue assignment 모드)의 slice 와 동일
    ...(spec.senseIds?.length ? { senseIds: spec.senseIds.slice(0, 500) } : {}),
    ...(spec.deckIds?.length ? { deckIds: spec.deckIds.slice(0, 5) } : {}),
    ...(spec.tiers?.length ? { tiers: spec.tiers } : {}),
    ...(spec.difficulties?.length
      ? {
          difficulties: spec.difficulties
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 1 && d <= 5),
        }
      : {}),
  });
  return { total };
}
