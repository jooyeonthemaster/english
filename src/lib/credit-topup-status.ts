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

// ── 결제 취소 분류 ──────────────────────────────────────────────────────────
// 포트원은 "사용자가 결제창에서 취소"도 status=FAILED 로 돌려준다. 그대로 FAILED 로
// 저장하면 카드 한도·잔액 부족 같은 진짜 실패와 섞여 "확인 필요"가 부풀고 정작
// 봐야 할 실패가 묻힌다. 그래서 사용자 취소는 CANCELLED(결제 취소)로 분리한다.

type PortOneFailureLike = {
  reason?: string | null;
  pgCode?: string | null;
  pgMessage?: string | null;
} | null | undefined;

/** 결제창 이탈로 자동 정리할 때 남기는 사유. */
export const ABANDONED_CHECKOUT_MESSAGE =
  "결제창 이탈 — 결제가 진행되지 않아 자동으로 취소 처리했습니다";

/**
 * 실측(2026-09) 포트원 사유 표기:
 *  - "사용자가 결제를 취소하셨습니다" (V2)
 *  - "[3001] 사용자 결제 취소", "[3001] 사용자가 결제를 취소하였습니다." (다날)
 * 진짜 실패 예: "3133, 잔액이 부족합니다", "고객통합한도 초과", "지원하지 않는 기능".
 */
export function isUserCancelledFailure(failure: PortOneFailureLike): boolean {
  if (!failure) return false;
  if (failure.pgCode?.trim() === "3001") return true;
  const text = [failure.reason, failure.pgMessage].filter(Boolean).join(" ");
  return /사용자[^.]{0,10}취소/.test(text);
}

export function mapPortOneStatusToTopUpStatus(
  portoneStatus: string,
  currentStatus: string,
  failure?: PortOneFailureLike,
) {
  if (portoneStatus === "VIRTUAL_ACCOUNT_ISSUED") return "WAITING_FOR_DEPOSIT";
  if (portoneStatus === "FAILED") {
    return isUserCancelledFailure(failure) ? "CANCELLED" : "FAILED";
  }
  if (portoneStatus === "CANCELLED" || portoneStatus === "PARTIAL_CANCELLED") {
    return currentStatus === "COMPLETED" ? "REFUNDED" : "CANCELLED";
  }
  return currentStatus === "COMPLETED" ? currentStatus : "PENDING";
}
