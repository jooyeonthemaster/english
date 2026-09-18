"use client";

// 이 학원 결제 이력 — 항목 목록. 768px 미만은 표 대신 행 카드로 떨어뜨린다.
// (표는 열이 6개라 390px 에서 상태·주문금액·크레딧·결제수단이 전부 가로 스크롤 뒤로 숨었다.)

import { ScrollableX } from "@/components/admin/analytics/shared/scrollable-x";
import { cn } from "@/lib/utils";
import { DISPLAY_TIMEZONE, formatKstDateTimeShort } from "@/lib/admin-kst-format";
import {
  TOPUP_PROGRESS_STALE_LABEL,
  classifyTopUpProgress,
  topUpStaleTitle,
} from "@/lib/admin-topup-progress";

export type HistoryItem = {
  id: string;
  orderNo: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  price: number;
  paidAmount: number | null;
  creditAmount: number;
  paymentMethod: string | null;
  orderName: string | null;
};

const STATUS_META: Record<string, { label: string; style: string }> = {
  PENDING: { label: "결제 대기", style: "bg-blue-50 text-blue-700" },
  WAITING_FOR_DEPOSIT: { label: "입금 대기", style: "bg-sky-50 text-sky-700" },
  COMPLETED: { label: "충전 완료", style: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "실패", style: "bg-rose-50 text-rose-700" },
  CANCELLED: { label: "취소", style: "bg-gray-100 text-gray-600" },
  REFUNDED: { label: "환불 확인", style: "bg-amber-50 text-amber-700" },
};

const PAY_METHOD_LABELS: Record<string, string> = {
  CARD: "카드",
  EASY_PAY: "간편결제",
  TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
  MOBILE: "휴대폰",
  BANK_TRANSFER: "무통장입금",
};

const PAID_STATUSES = new Set(["COMPLETED", "REFUNDED"]);

// 결제 시각을 주문 일시 뒤에 짧게 덧붙인다 — 같은 날이면 시:분만(KST 기준으로 판정).
const KST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: DISPLAY_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function paidSuffix(createdAt: string, paidAt: string): string {
  const created = new Date(createdAt);
  const paid = new Date(paidAt);
  if (Number.isNaN(paid.getTime())) return "-";
  return KST_DAY.format(created) === KST_DAY.format(paid)
    ? KST_TIME.format(paid)
    : formatKstDateTimeShort(paid);
}

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function payMethod(value: string | null): string {
  if (!value) return "-";
  return PAY_METHOD_LABELS[value] ?? value;
}

/** 표·카드·상단 카드가 같은 판정·같은 자구를 쓴다(admin-topup-progress.ts). */
function statusDisplay(item: HistoryItem): { label: string; style: string; title?: string } {
  const meta = STATUS_META[item.status] ?? {
    label: item.status,
    style: "bg-gray-100 text-gray-600",
  };
  const progress = classifyTopUpProgress(item.status, item.createdAt);
  if (progress.state !== "stale") return meta;
  return {
    label: TOPUP_PROGRESS_STALE_LABEL,
    style: "bg-gray-100 text-gray-500",
    title: topUpStaleTitle(meta.label, item.status, progress.windowMinutes),
  };
}

function StatusBadge({ item }: { item: HistoryItem }) {
  const status = statusDisplay(item);
  return (
    <span
      title={status.title}
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold",
        status.style,
      )}
    >
      {status.label}
    </span>
  );
}

function OrderedAt({ item }: { item: HistoryItem }) {
  return (
    <>
      {formatKstDateTimeShort(item.createdAt)}
      {item.paidAt && (
        <span className="ml-1 text-[11px] text-gray-400" title="결제 시각(KST)">
          (결제 {paidSuffix(item.createdAt, item.paidAt)})
        </span>
      )}
    </>
  );
}

interface Props {
  items: HistoryItem[];
  currentTopUpId: string;
  onSelectTopUp: (topUpId: string) => void;
}

export function AcademyPaymentHistoryItems({ items, currentTopUpId, onSelectTopUp }: Props) {
  const select = (item: HistoryItem) => {
    if (item.id !== currentTopUpId) onSelectTopUp(item.id);
  };

  return (
    <>
      {/* ≤767px: 행 카드(주문번호·일시 / 상태·주문금액) — 가로 스크롤 없음 */}
      <ul className="max-h-72 space-y-1.5 overflow-y-auto md:hidden">
        {items.map((item) => {
          const current = item.id === currentTopUpId;
          const paid = PAID_STATUSES.has(item.status);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => select(item)}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition",
                  current
                    ? "border-blue-200 bg-blue-50/80"
                    : "border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/30",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "text-[12px] font-semibold tabular-nums",
                      current ? "text-blue-700" : "text-gray-700",
                    )}
                  >
                    {item.orderNo}
                  </span>
                  <span className="text-[11px] tabular-nums text-gray-500">
                    <OrderedAt item={item} />
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge item={item} />
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
                        paid ? "text-gray-900" : "text-gray-400",
                      )}
                      title={paid ? undefined : "미결제 주문 — 매출 아님"}
                    >
                      {won(item.price)}
                    </span>
                    <span className="text-[11px] tabular-nums text-blue-700">
                      {item.creditAmount.toLocaleString("ko-KR")}C
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {payMethod(item.paymentMethod)}
                    </span>
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* ≥768px: 표(좁아지면 가로 스크롤 + 「더 있다」 단서) */}
      <ScrollableX
        className="hidden md:block"
        scrollerClassName="max-h-60 overflow-y-auto rounded-lg border border-gray-100"
      >
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="text-[11px] font-semibold text-gray-400">
              <th className="px-3 py-2">주문번호</th>
              <th className="px-3 py-2">주문 일시</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2 text-right">주문금액</th>
              <th className="px-3 py-2 text-right">크레딧</th>
              <th className="px-3 py-2">결제수단</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => {
              const current = item.id === currentTopUpId;
              const paid = PAID_STATUSES.has(item.status);
              return (
                <tr
                  key={item.id}
                  onClick={() => select(item)}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "transition",
                    current ? "bg-blue-50/80" : "cursor-pointer hover:bg-blue-50/30",
                  )}
                >
                  <td
                    className={cn(
                      "px-3 py-2 text-[12px] font-medium tabular-nums",
                      current
                        ? "border-l-2 border-blue-500 text-blue-700"
                        : "border-l-2 border-transparent text-gray-600",
                    )}
                    title={item.orderName ?? undefined}
                  >
                    {item.orderNo}
                  </td>
                  <td className="px-3 py-2 text-[12px] tabular-nums text-gray-500">
                    <OrderedAt item={item} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge item={item} />
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right text-[13px] font-semibold tabular-nums",
                      paid ? "text-gray-900" : "text-gray-400",
                    )}
                    title={paid ? undefined : "미결제 주문 — 매출 아님"}
                  >
                    {won(item.price)}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] font-medium tabular-nums text-blue-700">
                    {item.creditAmount.toLocaleString("ko-KR")}C
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-500">
                    {payMethod(item.paymentMethod)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollableX>
    </>
  );
}
