/**
 * 충전 주문 상태 표시 공유 모듈 (클라이언트 안전 — prisma/server-only 의존 없음)
 *
 * "수동 충전 완료"는 별도 status 값이 아니라 status=COMPLETED + customData.manualGrant
 * 마커로 표현한다. 이렇게 하면 매출 집계(operations-cost 의 status:"COMPLETED" 필터),
 * 어드민 통계, 고객 화면의 완료 판정이 전부 기존 경로를 그대로 타고, 표시 계층에서만
 * 라벨이 갈린다. 새 status 문자열을 도입하면 매출 쿼리 한 곳만 놓쳐도 조용히 매출이
 * 누락되므로 의도적으로 피했다.
 */

export const MANUAL_COMPLETE_LABEL = "수동 충전 완료";
export const MANUAL_COMPLETE_STYLE = "bg-teal-50 text-teal-700";

export type ManualGrantInfo = {
  /** 처리한 관리자 id */
  adminId: string;
  /** 수동 완료 처리를 실행한 시각(ISO) */
  at: string;
  /** 관리자 메모(사유) */
  note: string | null;
  /** 실제 입금 시각으로 기록한 값(ISO) — 매출 집계 버킷의 기준이 된다 */
  paidAt: string | null;
  /** 이미 지급된 크레딧 거래를 연결한 경우 그 id */
  linkedCreditTransactionId: string | null;
  /** 중복집계 방지를 위해 연결한 입금알림 id */
  linkedNotificationId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** customData 에서 수동지급 마커를 읽는다. 없으면 null. */
export function readManualGrant(customData: unknown): ManualGrantInfo | null {
  const cd = asRecord(customData);
  const mg = asRecord(cd?.manualGrant);
  if (!mg) return null;
  return {
    adminId: str(mg.adminId) ?? "",
    at: str(mg.at) ?? "",
    note: str(mg.note),
    paidAt: str(mg.paidAt),
    linkedCreditTransactionId: str(mg.linkedCreditTransactionId),
    linkedNotificationId: str(mg.linkedNotificationId),
  };
}

export function isManualGrantTopUp(customData: unknown): boolean {
  return readManualGrant(customData) !== null;
}

/**
 * COMPLETED 주문의 표시 라벨/스타일을 고른다. 수동지급이면 "수동 충전 완료".
 * 완료가 아닌 상태는 호출부의 기존 라벨 테이블이 그대로 처리한다.
 */
export function resolveCompletedDisplay(params: {
  status: string;
  manualGrant: boolean;
  fallbackLabel: string;
  fallbackStyle: string;
}): { label: string; style: string } {
  if (params.status === "COMPLETED" && params.manualGrant) {
    return { label: MANUAL_COMPLETE_LABEL, style: MANUAL_COMPLETE_STYLE };
  }
  return { label: params.fallbackLabel, style: params.fallbackStyle };
}
