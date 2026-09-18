"use client";

// 유입 분석 탭 내비 — 공용 쿼리(기간·필터)를 유지한 채 이동.

import Link from "next/link";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalyticsParams, withSharedQuery } from "./use-analytics-params";

export const ANALYTICS_TABS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/admin/analytics", label: "개요", icon: Activity },
  { href: "/admin/analytics/realtime", label: "실시간", icon: Radio },
  { href: "/admin/analytics/acquisition", label: "유입 경로", icon: Compass },
  { href: "/admin/analytics/pages", label: "페이지", icon: FileText },
  { href: "/admin/analytics/audience", label: "방문자·시간대", icon: MonitorSmartphone },
  { href: "/admin/analytics/conversions", label: "전환·가입", icon: Target },
  { href: "/admin/analytics/sessions", label: "방문 여정", icon: Route },
  { href: "/admin/analytics/links", label: "추적 링크", icon: Link2 },
  { href: "/admin/analytics/setup", label: "픽셀·검색엔진", icon: Settings2 },
];

export function AnalyticsNav() {
  const pathname = usePathname();
  const { sharedQuery } = useAnalyticsParams();
  return (
    <nav className="-mx-1 overflow-x-auto" aria-label="유입 분석 메뉴">
      <ul className="flex min-w-max items-center gap-1 px-1 pb-1">
        {ANALYTICS_TABS.map((tab) => {
          const active = tab.href === "/admin/analytics" ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={withSharedQuery(tab.href, sharedQuery)}
                prefetch={false}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                  active
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-white hover:text-gray-900",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
