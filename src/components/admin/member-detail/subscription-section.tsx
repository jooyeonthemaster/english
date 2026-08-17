import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  DefList,
  DefRow,
  SectionCard,
} from "@/components/admin/member-detail/atoms";
import {
  subscriptionStatusClass,
  subscriptionStatusLabel,
  tierBadgeClass,
} from "@/components/admin/member-detail/badges";
import type { MemberDetail } from "@/actions/admin-members";

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

type SubItem = MemberDetail["subscriptions"][number];

export function SubscriptionSection({
  activeSubscription,
}: {
  activeSubscription: SubItem | null;
}) {
  return (
    <SectionCard title="구독" icon={<CreditCard />}>
      {activeSubscription ? (
        <DefList>
          <DefRow
            label="플랜"
            value={
              <Badge
                variant="secondary"
                className={cn(
                  "text-[11px] font-medium border-0 px-2",
                  tierBadgeClass(activeSubscription.planTier),
                )}
              >
                {activeSubscription.planName}
              </Badge>
            }
          />
          <DefRow
            label="상태"
            value={
              <Badge
                variant="secondary"
                className={cn(
                  "text-[11px] font-medium border-0 px-2",
                  subscriptionStatusClass(activeSubscription.status),
                )}
              >
                {subscriptionStatusLabel(activeSubscription.status)}
              </Badge>
            }
          />
          <DefRow
            label="월 요금"
            value={
              <span className="tabular-nums">
                {activeSubscription.monthlyPrice.toLocaleString("ko-KR")}원
              </span>
            }
          />
          <DefRow
            label="월 크레딧"
            value={
              <span className="tabular-nums">
                {activeSubscription.monthlyCredits.toLocaleString("ko-KR")} C
              </span>
            }
          />
          <DefRow
            label="현재 주기"
            value={
              <span className="text-[11px] text-gray-600 tabular-nums">
                {formatDate(activeSubscription.currentPeriodStart)} ~{" "}
                {formatDate(activeSubscription.currentPeriodEnd)}
              </span>
            }
          />
          {activeSubscription.cancelledAt && (
            <DefRow
              label="취소일"
              value={
                <span className="text-rose-600 tabular-nums">
                  {formatDate(activeSubscription.cancelledAt)}
                </span>
              }
            />
          )}
        </DefList>
      ) : (
        <p className="text-[12px] text-gray-400 py-3">활성 구독이 없습니다</p>
      )}
    </SectionCard>
  );
}
