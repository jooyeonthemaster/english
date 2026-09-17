import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatDateTime } from "@/lib/utils";

// 입금 확인 목록 행 → 호버/클릭 상세. 목록에 이미 실려 온 값만 쓴다(추가 조회 없음).
// 목록에서 잘리는 원문 전체·입금 시각·수신 경로·연결 주문 ID를 보여준다.

type DepositRowLike = {
  id: string;
  amount: number;
  depositorName: string | null;
  bankName: string | null;
  status: string;
  source: string;
  rawText: string;
  note: string | null;
  matchedTopUpId: string | null;
  matchedAcademy: string | null;
  occurredAt: string | null;
  receivedAt: string;
};

const dt = (v: string | null) => (v ? formatDateTime(v) : null);

export function depositRowDetail(n: DepositRowLike, statusLabel: string): AdminDetail {
  return {
    title: `${n.amount.toLocaleString("ko-KR")}원 입금 · ${n.depositorName ?? "입금자명 없음"}`,
    subtitle: `입금 알림 ${n.id.slice(-8).toUpperCase()} · ${statusLabel}`,
    // 호버 미리보기는 앞 8개만 보이므로 목록에서 잘리거나 없는 값(원문 전체·시각·연결 주문)을 앞에 둔다.
    fields: detailFields([
      ["문자 원문", n.rawText, true],
      ["입금 시각(은행)", dt(n.occurredAt)],
      ["수신 시각", dt(n.receivedAt)],
      ["연결 학원", n.matchedAcademy],
      ["연결 주문 ID", n.matchedTopUpId, true],
      ["비고", n.note, true],
      ["수신 경로", n.source],
      ["상태", statusLabel],
      ["금액", `${n.amount.toLocaleString("ko-KR")}원`],
      ["입금자명", n.depositorName],
      ["은행", n.bankName],
    ]),
  };
}
