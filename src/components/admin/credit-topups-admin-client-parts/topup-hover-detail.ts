import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatDateTime } from "@/lib/utils";

// 결제 관리 충전 내역 행 → 호버 상세. 목록에 이미 실려 온 값만 쓴다(추가 조회 없음).

type TopUpRowLike = {
  id: string;
  orderName: string | null;
  price: number;
  paidAmount: number | null;
  creditAmount: number;
  paymentMethod: string | null;
  paymentId: string | null;
  portoneStatus: string | null;
  failureCode?: string | null;
  failureMessage: string | null;
  receiptUrl: string | null;
  createdAt: Date | string;
  paidAt: Date | string | null;
  completedAt: Date | string | null;
  cancelledAt?: Date | string | null;
  academy: {
    name: string;
    slug: string;
    creditBalance: { balance: number; bonusCredits: number } | null;
    staff: Array<{ name: string; email: string }>;
  };
  creditTransaction: { balanceAfter: number } | null;
};

const dt = (v: Date | string | null | undefined) => (v ? formatDateTime(v) : null);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function topUpRowDetail(
  topUp: TopUpRowLike,
  labels: { status: string; payMethod: string },
): AdminDetail {
  const director = topUp.academy.staff[0];
  return {
    title: `${topUp.academy.name} · ${topUp.creditAmount.toLocaleString("ko-KR")}C 충전`,
    subtitle: `주문 ${topUp.id.slice(-8).toUpperCase()} · ${labels.status}`,
    fields: detailFields([
      ["상태", labels.status],
      ["결제 금액", won(topUp.price)],
      ["실결제액", topUp.paidAmount !== null && topUp.paidAmount !== topUp.price && won(topUp.paidAmount)],
      ["지급 크레딧", `${topUp.creditAmount.toLocaleString("ko-KR")}C`],
      ["결제수단", labels.payMethod],
      ["실패·취소 사유", topUp.failureMessage, true],
      ["주문 생성", dt(topUp.createdAt)],
      ["결제 시각", dt(topUp.paidAt)],
      ["충전 완료", dt(topUp.completedAt)],
      ["취소 시각", dt(topUp.cancelledAt)],
      ["원장", director ? `${director.name} · ${director.email}` : null],
      [
        "학원 현재 잔액",
        topUp.academy.creditBalance &&
          `${topUp.academy.creditBalance.balance.toLocaleString("ko-KR")}C (보너스 ${topUp.academy.creditBalance.bonusCredits.toLocaleString("ko-KR")}C)`,
      ],
      ["충전 후 잔액", topUp.creditTransaction && `${topUp.creditTransaction.balanceAfter.toLocaleString("ko-KR")}C`],
      ["상품명", topUp.orderName, true],
      ["포트원 상태", topUp.portoneStatus],
      ["실패 코드", topUp.failureCode],
      ["포트원 결제 ID", topUp.paymentId, true],
      ["영수증", topUp.receiptUrl ? "있음 (클릭 → 상세에서 열기)" : null],
    ]),
  };
}
