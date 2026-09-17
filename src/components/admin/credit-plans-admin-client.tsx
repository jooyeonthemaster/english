"use client";

import { type ComponentProps, useCallback, useRef, useState } from "react";
import { Banknote, Coins, CreditCard, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminTabs, PageHeader, TONE_SOFT, useUrlTab, type AdminTab } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { CreditTopUpsAdminClient, type PaymentsLiveState } from "./credit-topups-admin-client";
import { AdminPlansClient } from "./plans-admin-client";
import { BankDepositsAdminClient } from "./bank-deposits-admin-client";

type CreditClientProps = ComponentProps<typeof CreditTopUpsAdminClient>;
type PlansClientProps = ComponentProps<typeof AdminPlansClient>;

export type CreditPlansTabKey = "credits" | "deposits" | "plans";

interface Props {
  creditData: Pick<CreditClientProps, "initialTopUps" | "initialStats" | "initialTopUpsTotal">;
  plansData: PlansClientProps;
  depositsData: {
    /** 입금 확인 탭 초기 필터(대시보드 "미확인 입금" 등에서 진입) */
    initialStatus?: string;
    focusPending?: boolean;
    /** 탭 배지 초기값 — 처리 필요 입금 건수 */
    initialActionCount: number;
  };
  initialTab?: CreditPlansTabKey;
}

// Subscription billing is disabled (NEXT_PUBLIC_SHOW_SUBSCRIPTION_BILLING).
// When off, the "구독 요금제" tab is hidden entirely and this surface is a
// single credit-product manager. Flip the flag to restore the tab — the
// AdminPlansClient code is preserved, not deleted.
const SHOW_PLANS = FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING;

// 탭 전환 시 ?status=·?view= (입금 확인 탭 진입 필터)는 지운다.
const URL_TAB_OPTIONS: { defaultKey: CreditPlansTabKey; clearParams: string[] } = {
  defaultKey: "credits",
  clearParams: ["status", "view"],
};

export function CreditPlansAdminClient({
  creditData,
  plansData,
  depositsData,
  initialTab = "credits",
}: Props) {
  const [tab, setTab] = useUrlTab<CreditPlansTabKey>(
    "tab",
    initialTab === "plans" && !SHOW_PLANS ? "credits" : initialTab,
    URL_TAB_OPTIONS,
  );
  // 입금 확인 탭은 처음 열 때 마운트(불필요한 조회 방지), 이후엔 유지해 필터·진행 상태 보존.
  const [depositsMounted, setDepositsMounted] = useState(tab === "deposits");
  const [depositActionCount, setDepositActionCount] = useState(depositsData.initialActionCount);
  const handleDepositCount = useCallback((n: number) => setDepositActionCount(n), []);

  // 충전 내역 탭의 실시간 연결 상태·새로고침을 페이지 머리(PageHeader.actions)에서 보여준다.
  const [live, setLive] = useState<PaymentsLiveState>({ connected: false, refreshing: false });
  const refreshRef = useRef<() => void>(() => {});

  const tabs: AdminTab<CreditPlansTabKey>[] = [
    { key: "credits", label: "충전 내역", icon: Coins },
    { key: "deposits", label: "입금 확인", icon: Banknote, badge: depositActionCount },
    ...(SHOW_PLANS
      ? [{ key: "plans" as const, label: "구독 요금제", icon: CreditCard }]
      : []),
  ];

  const selectTab = (key: CreditPlansTabKey) => {
    setTab(key);
    if (key === "deposits") setDepositsMounted(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="결제 관리"
        description="충전 내역과 무통장 입금 확인을 관리합니다. (상품·프로모션은 상품 관리 메뉴)"
        actions={
          <>
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium",
                live.connected ? TONE_SOFT.blue : TONE_SOFT.gray,
              )}
            >
              <Radio className="size-3.5" strokeWidth={2} />
              {live.connected ? "연결됨" : "대기 중"}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => refreshRef.current()}>
              <RefreshCw className={cn("size-4", live.refreshing && "animate-spin")} strokeWidth={2} />
              새로고침
            </Button>
          </>
        }
      />

      {tabs.length > 1 && (
        <AdminTabs tabs={tabs} value={tab} onChange={selectTab} ariaLabel="결제 관리 탭" />
      )}

      {/* Keep both mounted so the credits realtime stream and each tab's local
          state (edits in progress, open detail panel) survive tab switches. */}
      <div className={cn(tab === "credits" ? "block" : "hidden")}>
        <CreditTopUpsAdminClient
          initialTopUps={creditData.initialTopUps}
          initialStats={creditData.initialStats}
          initialTopUpsTotal={creditData.initialTopUpsTotal}
          onLiveStateChange={setLive}
          refreshRef={refreshRef}
        />
      </div>
      {depositsMounted && (
        <div className={cn(tab === "deposits" ? "block" : "hidden")}>
          <BankDepositsAdminClient
            initialStatus={depositsData.initialStatus}
            focusPending={depositsData.focusPending}
            onActionCountChange={handleDepositCount}
            hideTitle
          />
        </div>
      )}
      {SHOW_PLANS && (
        <div className={cn(tab === "plans" ? "block" : "hidden")}>
          <AdminPlansClient initialPlans={plansData.initialPlans} />
        </div>
      )}
    </div>
  );
}
