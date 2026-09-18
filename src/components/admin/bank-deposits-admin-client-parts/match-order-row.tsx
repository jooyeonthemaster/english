import { Button } from "@/components/ui/button";
import { Td, Tr } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import type { PendingOrder } from "./types";

/** "주문 연결" 을 누른 입금 행 바로 아래 펼쳐지는 주문 선택 줄 — 금액 일치 주문이 위로 온다. */
export function MatchOrderRow({
  amount,
  pendingOrders,
  busy,
  colSpan,
  onMatch,
}: {
  amount: number;
  pendingOrders: PendingOrder[];
  busy: boolean;
  colSpan: number;
  onMatch: (topUpId: string) => void;
}) {
  const sorted = [...pendingOrders].sort(
    (a, b) => Number(b.price === amount) - Number(a.price === amount),
  );
  return (
    <Tr className="bg-blue-50/30 hover:bg-blue-50/30">
      <Td colSpan={colSpan} className="whitespace-normal px-5 py-3">
        <p className="mb-2 text-[12px] font-semibold text-gray-600">
          연결할 입금 대기 주문 선택 (금액 일치 항목이 위에 표시됨)
        </p>
        {sorted.length === 0 ? (
          <p className="text-[12px] text-gray-400">입금 대기 중인 무통장입금 주문이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorted.map((o) => {
              const exact = o.price === amount;
              return (
                <Button
                  key={o.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onMatch(o.id)}
                  className={cn(
                    "h-auto w-full justify-between whitespace-normal py-2 text-left text-[12px] font-normal",
                    exact ? "border-blue-300" : "border-gray-200",
                  )}
                >
                  <span className="font-medium text-gray-700">
                    {o.academyName} · {o.depositorName ?? "이름없음"}
                  </span>
                  <span className="tabular-nums text-gray-500">
                    {o.price.toLocaleString("ko-KR")}원 · {o.creditAmount.toLocaleString("ko-KR")}C
                    {exact && <span className="ml-2 font-semibold text-blue-600">금액일치</span>}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </Td>
    </Tr>
  );
}
