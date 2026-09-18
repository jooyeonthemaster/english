import { formatDateTime } from "@/lib/utils";

// 입금 확인 탭이 쓰는 API 응답 타입.

export type DepositNotification = {
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

export type PendingOrder = {
  id: string;
  price: number;
  creditAmount: number;
  depositorName: string | null;
  academyName: string;
  createdAt: string;
};

// 시각 표기는 KST 고정 포매터(lib/utils)를 쓴다 — toLocale* 는 서버(UTC)·브라우저(KST) 결과가
// 달라 hydration 이 깨진다.
export function formatShortDateTime(value: string) {
  return formatDateTime(value);
}
