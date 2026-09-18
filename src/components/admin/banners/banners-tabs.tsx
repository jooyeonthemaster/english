"use client";

import type { ReactNode } from "react";
import { AdminTabs, useUrlTab, type AdminTab } from "@/components/admin/kit";

export type BannersTabKey = "landing" | "app";

const TABS: ReadonlyArray<AdminTab<BannersTabKey>> = [
  { key: "landing", label: "랜딩페이지" },
  { key: "app", label: "앱" },
];

/**
 * 배너 관리 상단 탭. 랜딩페이지 배너와 앱(로그인) 배너를 구분해 보여준다.
 * 탭 상태는 ?tab= 에 보존되고(새로고침 유지), 초기값은 서버 페이지가 searchParams 로 넘긴다.
 * 서버에서 렌더된 목록 요소를 slot 으로 받아 탭에 따라 노출한다(둘 다 마운트 유지 — 프리필 효과 때문).
 */
export function BannersTabs({
  initialTab,
  landing,
  app,
}: {
  initialTab: BannersTabKey;
  landing: ReactNode;
  app: ReactNode;
}) {
  const [tab, setTab] = useUrlTab<BannersTabKey>("tab", initialTab, { defaultKey: "landing" });

  return (
    <div className="space-y-6">
      <AdminTabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="배너 종류" />
      <div className={tab === "landing" ? "space-y-6" : "hidden"}>{landing}</div>
      <div className={tab === "app" ? "space-y-6" : "hidden"}>{app}</div>
    </div>
  );
}
