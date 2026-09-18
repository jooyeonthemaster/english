import { Banknote } from "lucide-react";
import { AdminEmptyState, SectionCard } from "@/components/admin/kit";
import { formatShortDateTime, type PendingOrder } from "./types";

/** 입금 대기 주문 패널 — 대시보드 "입금 대기"에서 진입(view=pending)했을 때만 상단에 보인다. */
export function PendingOrdersPanel({ orders }: { orders: PendingOrder[] }) {
  return (
    <SectionCard
      icon={Banknote}
      title={
        <span className="flex items-center gap-2">
          입금 대기 주문
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-700">
            {orders.length}건
          </span>
        </span>
      }
      description="입금 알림이 도착하면 아래 목록에서 해당 입금을 주문에 연결하세요."
    >
      {orders.length === 0 ? (
        <AdminEmptyState compact icon={Banknote} title="입금 대기 중인 무통장입금 주문이 없습니다" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {orders.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-2.5 text-[12px]"
            >
              <span className="font-medium text-gray-700">
                {o.academyName}
                <span className="ml-1.5 text-gray-400">· {o.depositorName ?? "입금자명 미입력"}</span>
              </span>
              <span className="tabular-nums text-gray-500">
                {o.price.toLocaleString("ko-KR")}원 · {o.creditAmount.toLocaleString("ko-KR")}C ·{" "}
                {formatShortDateTime(o.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
