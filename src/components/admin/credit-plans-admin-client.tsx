"use client";

import { type ComponentProps, useState } from "react";
import { Coins, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { CreditTopUpsAdminClient } from "./credit-topups-admin-client";
import { AdminPlansClient } from "./plans-admin-client";

type CreditClientProps = ComponentProps<typeof CreditTopUpsAdminClient>;
type PlansClientProps = ComponentProps<typeof AdminPlansClient>;

type TabKey = "credits" | "plans";

interface Props {
  creditData: Pick<
    CreditClientProps,
    "initialTopUps" | "initialStats" | "initialTopUpsTotal"
  >;
  plansData: PlansClientProps;
  initialTab?: TabKey;
}

// Subscription billing is disabled (NEXT_PUBLIC_SHOW_SUBSCRIPTION_BILLING).
// When off, the "구독 요금제" tab is hidden entirely and this surface is a
// single credit-product manager. Flip the flag to restore the tab — the
// AdminPlansClient code is preserved, not deleted.
const SHOW_PLANS = FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING;

const ALL_TABS: { key: TabKey; label: string; icon: typeof Coins }[] = [
  { key: "credits", label: "크레딧 결제", icon: Coins },
  { key: "plans", label: "구독 요금제", icon: CreditCard },
];

export function CreditPlansAdminClient({
  creditData,
  plansData,
  initialTab = "credits",
}: Props) {
  const tabs = SHOW_PLANS ? ALL_TABS : ALL_TABS.filter((t) => t.key === "credits");
  const [tab, setTab] = useState<TabKey>(
    SHOW_PLANS ? initialTab : "credits",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">결제 관리</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          포트원·무통장 충전 내역과 결제 상태를 관리합니다. (상품·프로모션은
          상품 관리 메뉴)
        </p>
      </div>

      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label="상품 · 결제 관리 탭"
          className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1"
        >
          {tabs.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-medium transition",
                  active
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800",
                )}
              >
                <Icon className="size-4" strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Keep both mounted so the credits realtime stream and each tab's local
          state (edits in progress, open detail panel) survive tab switches. */}
      <div className={cn(tab === "credits" ? "block" : "hidden")}>
        <CreditTopUpsAdminClient
          mode="payments"
          initialTopUps={creditData.initialTopUps}
          initialStats={creditData.initialStats}
          initialTopUpsTotal={creditData.initialTopUpsTotal}
          hideTitle
        />
      </div>
      {SHOW_PLANS && (
        <div className={cn(tab === "plans" ? "block" : "hidden")}>
          <AdminPlansClient initialPlans={plansData.initialPlans} />
        </div>
      )}
    </div>
  );
}
