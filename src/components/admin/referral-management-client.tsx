"use client";

// ============================================================================
// 추천·미션(/admin/referrals) — 추천 보상 심사와 미션 카탈로그·전체 공지를 한 화면에서 다룬다.
//   · 탭(추천 현황/보류 심사/미션 관리/공지 발송)은 ?tab= 에 보존(useUrlTab), 서버 페이지가 초기값을 넘긴다.
//   · 각 탭 화면은 referral-management-client-parts/ 로 분리. 서버 액션·데이터 흐름은 그대로.
// ============================================================================

import { useState, useTransition } from "react";
import { Gift, Megaphone, ShieldAlert, Target } from "lucide-react";
import {
  getHeldReferrals,
  getReferralOverview,
  type HeldReferralsResult,
  type MissionCatalogRow,
  type ReferralOverview,
} from "@/actions/admin/referrals";
import { AdminTabs, useUrlTab, type AdminTab } from "@/components/admin/kit";
import { AnnounceTab } from "./referral-management-client-parts/announce-tab";
import { HeldTab } from "./referral-management-client-parts/held-tab";
import { MissionsTab } from "./referral-management-client-parts/missions-tab";
import { OverviewTab } from "./referral-management-client-parts/overview-tab";
import {
  DEFAULT_REFERRAL_TAB,
  type ReferralTabKey,
} from "./referral-management-client-parts/tabs";

interface Props {
  overview: ReferralOverview;
  held: HeldReferralsResult;
  missions: MissionCatalogRow[];
  /** 서버 페이지가 ?tab= 을 해석해 넘긴 초기 탭 */
  initialTab?: ReferralTabKey;
}

export function ReferralManagementClient({
  overview: initialOverview,
  held: initialHeld,
  missions,
  initialTab = DEFAULT_REFERRAL_TAB,
}: Props) {
  const [tab, setTab] = useUrlTab<ReferralTabKey>("tab", initialTab, {
    defaultKey: DEFAULT_REFERRAL_TAB,
  });
  const [overview, setOverview] = useState(initialOverview);
  const [held, setHeld] = useState(initialHeld);
  const [pending, startTransition] = useTransition();

  function loadOverviewPage(page: number) {
    startTransition(async () => setOverview(await getReferralOverview({ page })));
  }
  function loadHeldPage(page: number) {
    startTransition(async () => setHeld(await getHeldReferrals({ page })));
  }

  const tabs: AdminTab<ReferralTabKey>[] = [
    { key: "overview", label: "추천 현황", icon: Gift, count: overview.total },
    { key: "held", label: "보류 심사", icon: ShieldAlert, badge: held.total },
    { key: "missions", label: "미션 관리", icon: Target, count: missions.length },
    { key: "announce", label: "공지 발송", icon: Megaphone },
  ];

  return (
    <div className="space-y-4">
      <AdminTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="추천·미션 화면" />

      {tab === "overview" && (
        <OverviewTab overview={overview} pending={pending} onPage={loadOverviewPage} />
      )}
      {tab === "held" && <HeldTab held={held} pending={pending} onPage={loadHeldPage} />}
      {tab === "missions" && <MissionsTab missions={missions} />}
      {tab === "announce" && <AnnounceTab />}
    </div>
  );
}
