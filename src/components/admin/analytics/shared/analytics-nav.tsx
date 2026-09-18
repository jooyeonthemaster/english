"use client";

// 유입 분석 탭 내비 — 공용 쿼리(기간·필터)를 유지한 채 이동.
// 규약(docs/ADMIN-UI-CONVENTION.md §3 「하위 화면 전환 = AdminTabs」): 직접 만든 세그먼트를 버리고
// 공용 AdminTabs 를 쓴다. 우리 탭은 ?tab= 이 아니라 **경로 이동형 링크**라 useUrlTab 대신
// AdminTab.href 형(원가 분석 CostTabs 와 같은 링크 탭)을 쓰고, href 마다 공용 쿼리를 붙여
// 기간·필터가 탭을 건너 살아남게 한다(withSharedQuery — 이게 빠지면 탭 이동마다 기본 7일로 리셋).

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  Compass,
  FileText,
  Link2,
  MonitorSmartphone,
  Radio,
  Route,
  Settings2,
  Target,
} from "lucide-react";
import { AdminTabs, type AdminTab } from "@/components/admin/kit";
import { useAnalyticsParams, withSharedQuery } from "./use-analytics-params";

export type AnalyticsTabKey =
  | "overview"
  | "realtime"
  | "acquisition"
  | "pages"
  | "audience"
  | "conversions"
  | "sessions"
  | "links"
  | "setup";

/** 경로 탭 정의 — href 는 쿼리 없는 기본 경로. 실제 링크는 공용 쿼리를 붙여 만든다. */
export const ANALYTICS_TABS: ReadonlyArray<AdminTab<AnalyticsTabKey> & { href: string }> = [
  { key: "overview", label: "개요", icon: Activity, href: "/admin/analytics" },
  { key: "realtime", label: "실시간", icon: Radio, href: "/admin/analytics/realtime" },
  { key: "acquisition", label: "유입 경로", icon: Compass, href: "/admin/analytics/acquisition" },
  { key: "pages", label: "페이지", icon: FileText, href: "/admin/analytics/pages" },
  { key: "audience", label: "방문자·시간대", icon: MonitorSmartphone, href: "/admin/analytics/audience" },
  { key: "conversions", label: "전환·가입", icon: Target, href: "/admin/analytics/conversions" },
  { key: "sessions", label: "방문 여정", icon: Route, href: "/admin/analytics/sessions" },
  { key: "links", label: "추적 링크", icon: Link2, href: "/admin/analytics/links" },
  { key: "setup", label: "픽셀·검색엔진", icon: Settings2, href: "/admin/analytics/setup" },
];

/** 경로 → 활성 탭. 개요는 정확히 일치할 때만(나머지 경로가 전부 그 아래에 있다). */
function resolveActiveTab(pathname: string): AnalyticsTabKey {
  const hit = ANALYTICS_TABS.find((tab) =>
    tab.key === "overview" ? pathname === tab.href : pathname.startsWith(tab.href),
  );
  return hit?.key ?? "overview";
}

export function AnalyticsNav() {
  const pathname = usePathname();
  const { sharedQuery } = useAnalyticsParams();
  const tabs = useMemo(
    () => ANALYTICS_TABS.map((tab) => ({ ...tab, href: withSharedQuery(tab.href, sharedQuery) })),
    [sharedQuery],
  );
  return (
    <AdminTabs
      ariaLabel="유입 분석 화면"
      tabs={tabs}
      value={resolveActiveTab(pathname)}
    />
  );
}
