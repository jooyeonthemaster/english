// ============================================================================
// 학생 관리(2단계) 게이트 — 정답·배점 문항별 확인 상태 판정 (서버·클라 공용 순수 함수)
//
// 배경: 기존 「정답·배점 확인 완료」·「전체 검수 완료」는 뱃지/카운터만 바꾸고
// 아무것도 막지 않아, 0/22 상태로 학생 전체를 잘못된 정답으로 채점할 수 있었다.
// 이제 **정답·배점 확인(mapConfirmedNumbers)** 만이 게이트의 근거다.
// 분석 검수(confirmedNumbers)는 리포트 서술용이라 게이트 조건이 아니다.
// ============================================================================

import type { ExamReviewState } from "./types";

/** 게이트 판정 입력 — 상세/목록 어디서든 만들 수 있는 최소 형태. */
export interface MapGateInput {
  /** examMap 의 전체 문항 번호("서답형 3" 같은 다글자 번호 포함) */
  questionNumbers: string[];
  reviewState: ExamReviewState;
  /** 소속 학생 수 — 레거시 승계 판정에만 쓴다 */
  studentCount: number;
}

export interface MapGateStatus {
  /** 확인 완료 문항 수(승계된 경우 전체 수로 채운다) */
  confirmedCount: number;
  /** 전체 문항 수 */
  totalCount: number;
  /** 열림 = 학생 관리 진입 허용 */
  open: boolean;
  /** 레거시 승계로 열린 경우 — UI 에서 "확인 필요" 유도를 하지 않는다 */
  grandfathered: boolean;
  /** 아직 확인되지 않은 문항 번호(순서 보존) — 힌트 글로우/스크롤 대상 */
  pendingNumbers: string[];
}

/**
 * 레거시 승계: 문항별 확인 이력이 **한 번도 없는** 건 중, 이미 학생이 붙었거나
 * 과거 일괄 「정답·배점 확인 완료」를 누른 건은 확인된 것으로 간주한다.
 * (게이트 도입 이전 운영 건이 배포 즉시 잠기는 것을 막는다.)
 *
 * `mapConfirmedNumbers` 가 비어 있을 때만 승계하므로, 22/22 확인 후 배점을 고쳐
 * 21/22 가 된 건은 배열이 비어있지 않아 승계 대상에서 빠지고 게이트가 다시 닫힌다
 * — 즉 "수정 후 재확인 강제"가 승계 규칙에 뚫리지 않는다.
 * (전 문항을 다시 미확인으로 되돌린 극단 케이스는 승계로 열리지만, 이미 채점된
 *  학생이 있는 건이므로 무해하다.)
 */
export function isMapGateGrandfathered(input: MapGateInput): boolean {
  const touched = (input.reviewState.mapConfirmedNumbers?.length ?? 0) > 0;
  if (touched) return false;
  return input.reviewState.mapConfirmed === true || input.studentCount > 0;
}

/** 게이트 상태 — 목록/워크스페이스/서버 가드가 모두 이 함수 하나만 쓴다. */
export function getMapGateStatus(input: MapGateInput): MapGateStatus {
  const totalCount = input.questionNumbers.length;
  if (isMapGateGrandfathered(input)) {
    return {
      confirmedCount: totalCount,
      totalCount,
      open: true,
      grandfathered: true,
      pendingNumbers: [],
    };
  }
  const confirmed = new Set(input.reviewState.mapConfirmedNumbers ?? []);
  const pendingNumbers = input.questionNumbers.filter((n) => !confirmed.has(n));
  const confirmedCount = totalCount - pendingNumbers.length;
  return {
    confirmedCount,
    totalCount,
    // 문항이 0개면(분석 전) 게이트는 닫힌 것으로 본다 — 확인할 근거 자체가 없다.
    open: totalCount > 0 && pendingNumbers.length === 0,
    grandfathered: false,
    pendingNumbers,
  };
}
