import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
// 표시는 KST 고정 — 서버(Vercel)는 UTC 라 결제일이 하루 이르게 찍힌다(paidAt UTC 15시 이후 6건).
import { formatKstDate } from "@/lib/admin-kst-format";
// 대기 상태(PENDING·WAITING_FOR_DEPOSIT) 자구는 결제 관리·무통장 화면과 같은 판정을 쓴다.
// 이 화면만 「입금대기」로 남아 2.5개월 지난 주문이 아직 입금을 기다리는 것처럼 보였다.
import {
  TOPUP_PROGRESS_ACTIVE_LABEL,
  TOPUP_PROGRESS_STALE_LABEL,
  classifyTopUpProgress,
  topUpStaleTitle,
} from "@/lib/admin-topup-progress";
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

interface StatusBadge {
  label: string;
  className: string;
  title?: string;
}

/**
 * 상태 배지 — 대기 상태만 「생성 경과」를 함께 본다(DB 상태는 바꾸지 않는다, 스펙 §9.2 D3).
 * 시간창 이내면 「진행 중」, 초과면 「미완료(이탈·만료)」.
 */
function statusBadge(
  status: string,
  createdAt: string,
  now: number,
): StatusBadge {
  const base = STATUS_META[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-500",
  };
  const progress = classifyTopUpProgress(status, createdAt, now);
  if (progress.state === "n/a") return base;
  if (progress.state === "in_progress") {
    return {
      label: TOPUP_PROGRESS_ACTIVE_LABEL,
      className: "bg-sky-50 text-sky-600",
      title: `원 상태: ${base.label}(${status}) · 생성 ${progress.windowMinutes}분 이내`,
    };
  }
  return {
    label: TOPUP_PROGRESS_STALE_LABEL,
    className: "bg-gray-100 text-gray-500",
    title: topUpStaleTitle(base.label, status, progress.windowMinutes),
  };
}

const METHOD_LABEL: Record<string, string> = {
  CARD: "카드",
  TRANSFER: "계좌이체",
  BANK_TRANSFER: "무통장입금",
  VIRTUAL_ACCOUNT: "가상계좌",
  EASY_PAY: "간편결제",
  MOBILE: "휴대폰",
};


export function PurchasesSection({
  purchases,
}: {
  purchases: MemberPurchaseItem[];
}) {
  // 렌더 1회당 기준 시각 하나 — 같은 목록 안에서 행마다 경과 판정이 갈리지 않게 한다.
  const now = Date.now();
  return (
    <SectionCard title="구입 상품 이력" icon={<ShoppingBag />}>
      {purchases.length === 0 ? (
        <p className="text-[12px] text-gray-400 py-3">구입 이력이 없습니다</p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto divide-y divide-gray-50 -mx-1">
          {purchases.map((p) => {
            const st = statusBadge(p.status, p.createdAt, now);
            return (
              <li key={p.id} className="px-1 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-gray-800 truncate">
                    {p.name}
                  </span>
                  <span
                    title={st.title}
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
                  <span className="ml-auto">{formatKstDate(p.purchasedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
