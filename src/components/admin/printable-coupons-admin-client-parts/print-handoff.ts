import type { IssuedCouponCard } from "@/actions/admin/printable-coupons";

// 인쇄 핸드오프: 발급 응답의 카드(serial+qrImageUrl)를 localStorage에 실어
// bare 인쇄 탭으로 넘긴다(QR 토큰 미저장이라 재조회 불가 → 발급 즉시 인쇄).
// coupon-print-view.tsx 가 같은 접두사로 읽는다.
export const PRINT_STORAGE_PREFIX = "printable-coupon-print:";

export interface PrintHandoff {
  batchName: string;
  title: string;
  effectType: string;
  headline: string;
  description?: string; // 인쇄 카드 하단 안내 문구
  registerBy?: string; // 등록 마감일(표시용, 예 "2026. 7. 8.")
  creditExpiry?: string; // 지급 크레딧 만료일(표시용, CREDIT_GRANT)
  cards: IssuedCouponCard[];
}

export function openPrintTab(batchId: string, handoff: PrintHandoff) {
  try {
    localStorage.setItem(
      PRINT_STORAGE_PREFIX + batchId,
      JSON.stringify(handoff),
    );
  } catch {
    /* storage full/blocked — 인쇄 탭에서 안내 */
  }
  window.open(`/admin/coupons/print?batchId=${batchId}`, "_blank");
}
