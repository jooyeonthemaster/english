import type { StatusMap } from "./tone";
import { MANUAL_COMPLETE_LABEL } from "@/lib/credit-topup-status";

// 결제·크레딧 도메인 라벨.

/** CreditTopUp.status */
export const TOPUP_STATUS: StatusMap = {
  PENDING: { label: "결제 대기", tone: "blue" },
  WAITING_FOR_DEPOSIT: { label: "입금 대기", tone: "sky" },
  COMPLETED: { label: "충전 완료", tone: "emerald" },
  FAILED: { label: "실패", tone: "rose" },
  CANCELLED: { label: "결제 취소", tone: "gray" },
  REFUNDED: { label: "환불", tone: "amber" },
};

/** 수동 충전 완료(status=COMPLETED + customData.manualGrant) 표시 */
export const TOPUP_MANUAL_COMPLETE = { label: MANUAL_COMPLETE_LABEL, tone: "teal" as const };

/** CreditTopUp.paymentMethod */
export const PAYMENT_METHOD: Record<string, string> = {
  CARD: "카드",
  EASY_PAY: "간편결제",
  TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
  MOBILE: "휴대폰",
  BANK_TRANSFER: "무통장입금",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHOD[method] ?? method;
}

/** BankDepositNotification.status */
export const BANK_DEPOSIT_STATUS: StatusMap = {
  UNMATCHED: { label: "미매칭", tone: "amber" },
  AMBIGUOUS: { label: "확인 필요", tone: "rose" },
  FAILED: { label: "처리 실패", tone: "rose" },
  MATCHED: { label: "지급 완료", tone: "emerald" },
  MANUAL_GRANT: { label: "수동지급", tone: "teal" },
  IGNORED: { label: "무시됨", tone: "gray" },
};

/** CreditTransaction.type — 라벨은 admin-members-labels 와 같게 유지 */
export const TRANSACTION_TYPE: StatusMap = {
  ALLOCATION: { label: "월 정기 지급", tone: "blue" },
  CONSUMPTION: { label: "사용", tone: "gray" },
  TOP_UP: { label: "충전", tone: "emerald" },
  ADJUSTMENT: { label: "수동 조정", tone: "violet" },
  REFUND: { label: "환불", tone: "amber" },
  RESET: { label: "초기화", tone: "gray" },
  ROLLOVER: { label: "이월", tone: "sky" },
  EXPIRATION: { label: "소멸", tone: "rose" },
};
