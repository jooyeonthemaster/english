import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/admin/member-detail/atoms";
import type { MemberPurchaseItem } from "@/actions/admin-members";

const STATUS_META: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: "완료", className: "bg-emerald-50 text-emerald-600" },
  WAITING_FOR_DEPOSIT: { label: "입금대기", className: "bg-sky-50 text-sky-600" },
  PENDING: { label: "대기", className: "bg-gray-100 text-gray-500" },
  FAILED: { label: "실패", className: "bg-rose-50 text-rose-600" },
  CANCELLED: { label: "취소", className: "bg-gray-100 text-gray-500" },
  REFUNDED: { label: "환불", className: "bg-amber-50 text-amber-700" },
};

const METHOD_LABEL: Record<string, string> = {
  CARD: "카드",
  TRANSFER: "계좌이체",
  BANK_TRANSFER: "무통장입금",
  VIRTUAL_ACCOUNT: "가상계좌",
  EASY_PAY: "간편결제",
  MOBILE: "휴대폰",
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function PurchasesSection({
  purchases,
}: {
  purchases: MemberPurchaseItem[];
}) {
  return (
    <SectionCard title="구입 상품 이력" icon={<ShoppingBag />}>
      {purchases.length === 0 ? (
        <p className="text-[12px] text-gray-400 py-3">구입 이력이 없습니다</p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto divide-y divide-gray-50 -mx-1">
          {purchases.map((p) => {
            const st = STATUS_META[p.status] ?? {
              label: p.status,
              className: "bg-gray-100 text-gray-500",
            };
            return (
              <li key={p.id} className="px-1 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-gray-800 truncate">
                    {p.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      st.className,
                    )}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400 tabular-nums">
                  <span className="text-gray-600">
                    {p.price.toLocaleString("ko-KR")}원
                  </span>
                  <span>·</span>
                  <span>{p.creditAmount.toLocaleString("ko-KR")} C</span>
                  {p.paymentMethod && (
                    <>
                      <span>·</span>
                      <span>{METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}</span>
                    </>
                  )}
                  <span className="ml-auto">{formatDate(p.purchasedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
