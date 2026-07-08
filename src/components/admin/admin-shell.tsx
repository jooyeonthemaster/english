"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Gift,
  Coins,
  ChartNoAxesCombined,
  Radar,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Presentation,
  MessageSquare,
  LifeBuoy,
  Banknote,
  Megaphone,
  Image,
  Package,
  Ticket,
  TicketCheck,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand/brand-mark";
import { BusinessInfoBlock } from "@/components/legal/business-info-block";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AdminSession {
  adminId: string;
  name: string;
  email: string;
  role: string;
}

interface AdminShellProps {
  children: React.ReactNode;
  admin: AdminSession;
}

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

// 회원 관리 = 학원 관리 통합 뷰(회원 1명 = 학원 1곳, 상세에서 학원 콘텐츠까지).
// 가입 신청·설정 메뉴는 제거(설정은 빈 404였음). 라우트/데이터는 보존.
//
// 사이드바는 기능 도메인별로 그룹핑한다. 대시보드는 섹션 없이 단독 최상단,
// 나머지는 운영자가 자주 여는 순(고객 → 크레딧·결제 → 마케팅 → 고객지원)으로.
const DASHBOARD_ITEM: NavItem = {
  label: "대시보드",
  icon: LayoutDashboard,
  href: "/admin",
};

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "고객",
    items: [
      { label: "학원 · 회원 관리", icon: Users, href: "/admin/members" },
      { label: "활동 모니터링", icon: Radar, href: "/admin/activity" },
    ],
  },
  {
    title: "크레딧·결제",
    items: [
      { label: "상품 관리", icon: Package, href: "/admin/products" },
      { label: "프로모션 관리", icon: Ticket, href: "/admin/promotions" },
      { label: "결제 관리", icon: Coins, href: "/admin/credit-plans" },
      { label: "무통장입금", icon: Banknote, href: "/admin/credits/bank-deposits" },
      { label: "원가 분석", icon: ChartNoAxesCombined, href: "/admin/costs" },
    ],
  },
  {
    title: "마케팅",
    items: [
      { label: "추천·미션", icon: Gift, href: "/admin/referrals" },
      { label: "스모트 소식", icon: Megaphone, href: "/admin/announcements" },
      { label: "배너 관리", icon: Image, href: "/admin/banners" },
      { label: "실물 쿠폰", icon: TicketCheck, href: "/admin/coupons" },
    ],
  },
  {
    // 헬프센터 — 고객(원장)이 작성한 신청·문의를 운영자가 관리.
    title: "고객지원",
    items: [
      { label: "1:1 세미나", icon: Presentation, href: "/admin/seminars" },
      { label: "단체 세미나", icon: Users, href: "/admin/group-seminars" },
      { label: "피드백", icon: MessageSquare, href: "/admin/feedback" },
      { label: "문의 게시판", icon: LifeBuoy, href: "/admin/support" },
      { label: "사용 매뉴얼", icon: BookOpen, href: "/admin/manual" },
    ],
  },
];

// isActive/activeNavLabel 등은 평탄화한 전체 목록을 순회한다(그룹 구조와 무관).
const NAV_ITEMS: NavItem[] = [
  DASHBOARD_ITEM,
  ...NAV_SECTIONS.flatMap((s) => s.items),
];

const SIDEBAR_STORAGE_KEY = "yshin-admin-sidebar-collapsed";

export function SuperAdminShell({ children, admin }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setNavigatingTo(null);
  }, [pathname]);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
    setMounted(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  function isActive(href: string) {
    const effectivePath = navigatingTo || pathname;
    if (href === "/admin") return effectivePath === "/admin";
    if (!effectivePath.startsWith(href)) return false;
    // A more specific sibling (e.g. /admin/credits/bank-deposits) takes priority
    // over its parent (/admin/credits) so only one nav item highlights.
    const moreSpecificMatch = NAV_ITEMS.some(
      (item) =>
        item.href !== href &&
        item.href.startsWith(href) &&
        effectivePath.startsWith(item.href),
    );
    return !moreSpecificMatch;
  }

  function handleNavClick(href: string, e: React.MouseEvent) {
    e.preventDefault();
    if (href === pathname) return;
    setNavigatingTo(href);
    startTransition(() => {
      router.push(href);
    });
  }

  function handleMobileNavClick(href: string, e: React.MouseEvent) {
    setMobileNavOpen(false);
    handleNavClick(href, e);
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const activeNavLabel =
    NAV_ITEMS.find((item) => isActive(item.href))?.label ?? "관리자 콘솔";

  // 데스크톱 사이드바 항목 — 접힘 상태에선 아이콘만 + 툴팁, 펼침 상태에선 라벨까지.
  function renderNavItem(item: NavItem) {
    const active = isActive(item.href);
    const Icon = item.icon;
    const linkContent = (
      <Link
        href={item.href}
        onClick={(e) => handleNavClick(item.href, e)}
        className={cn(
          "group/item relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200",
          collapsed ? "justify-center h-10 w-10 mx-auto" : "h-[38px] px-3",
          active
            ? "text-white bg-white/[0.1]"
            : "text-slate-400 hover:text-white hover:bg-white/[0.05]",
        )}
      >
        <Icon
          className={cn(
            "shrink-0 transition-colors duration-200",
            active
              ? "text-blue-400"
              : "text-slate-500 group-hover/item:text-slate-300",
            collapsed ? "size-[20px]" : "size-[17px]",
          )}
          strokeWidth={active ? 2 : 1.7}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <li key={item.href}>
          <Tooltip>
            <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={12}
              className="text-[12px] font-medium"
            >
              {item.label}
            </TooltipContent>
          </Tooltip>
        </li>
      );
    }

    return <li key={item.href}>{linkContent}</li>;
  }

  // 모바일 시트 항목 — 항상 펼침(라벨 표시).
  function renderMobileNavItem(item: NavItem) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={(e) => handleMobileNavClick(item.href, e)}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-bold transition-colors",
            active
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          <Icon
            className={cn(
              "size-5 shrink-0",
              active ? "text-blue-400" : "text-slate-500",
            )}
            strokeWidth={active ? 2 : 1.8}
          />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
      </li>
    );
  }

  if (!mounted) {
    return (
      <div className="flex h-screen bg-[#F4F6F9]">
        <div className="hidden w-[220px] shrink-0 md:block" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen flex-col bg-[#F4F6F9]">
       <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen self-start shrink-0 flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] md:flex",
            collapsed ? "w-[72px]" : "w-[220px]",
          )}
          style={{
            background: "rgba(15, 23, 42, 0.97)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Logo */}
          <div
            className={cn(
              "flex items-center h-[64px] shrink-0 transition-all duration-300",
              collapsed ? "justify-center px-0" : "px-6",
            )}
          >
            <Link href="/admin" className="flex items-center gap-2.5">
              <BrandIcon
                className={cn("shrink-0 bg-blue-600 shadow-none", collapsed ? "size-9" : "size-8")}
                markClassName={collapsed ? "size-[21px]" : "size-[20px]"}
              />
              {!collapsed && (
                <span className="font-bold text-white tracking-tight text-[18px]">
                  SMOAT
                  <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase ml-1.5">
                    admin
                  </span>
                </span>
              )}
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            {/* 대시보드 — 섹션 없이 단독 최상단 */}
            <ul className="space-y-0.5">{renderNavItem(DASHBOARD_ITEM)}</ul>

            {/* 기능 도메인별 그룹 — 펼침=섹션 헤더, 접힘=구분선 */}
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="mt-4">
                {collapsed ? (
                  <div
                    className="mx-auto mb-2 h-px w-6 bg-white/[0.08]"
                    aria-hidden
                  />
                ) : (
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {section.title}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {section.items.map((item) => renderNavItem(item))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Collapse toggle */}
          <div className="shrink-0 p-3">
            <button
              onClick={toggleSidebar}
              className={cn(
                "flex items-center justify-center w-full h-9 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-all duration-200",
                collapsed && "w-10 mx-auto",
              )}
              aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-[17px]" />
              ) : (
                <>
                  <PanelLeftClose className="size-[17px]" />
                  <span className="ml-2 text-[11px] font-medium">접기</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main area */}
        <div
          className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
        >
          {/* Top header */}
          <header
            className="sticky top-0 z-20 flex items-center justify-between h-[56px] px-3 md:px-6"
            style={{
              background: "rgba(244,246,249,0.75)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              borderBottom: "1px solid rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-[0.98] md:hidden"
                    aria-label="관리자 메뉴 열기"
                  >
                    <Menu className="size-5" strokeWidth={2} />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[min(92vw,340px)] gap-0 border-r border-slate-800 bg-slate-950 p-0 text-white"
                >
                  <SheetHeader className="border-b border-white/10 px-4 py-4 text-left">
                    <SheetTitle className="flex items-center gap-2.5 text-white">
                      <BrandIcon className="size-8 shrink-0 bg-blue-600 shadow-none" markClassName="size-[20px]" />
                      <span className="min-w-0">
                        <span className="block truncate text-[17px] font-bold tracking-tight">
                          SMOAT
                          <span className="ml-1.5 text-[10px] font-medium uppercase tracking-widest text-slate-400">
                            admin
                          </span>
                        </span>
                        <span className="block truncate text-[11px] font-semibold text-slate-500">
                          {admin.name}
                        </span>
                      </span>
                    </SheetTitle>
                  </SheetHeader>

                  <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="관리자 모바일 메뉴">
                    {/* 대시보드 — 섹션 없이 단독 최상단 */}
                    <ul className="space-y-1">
                      {renderMobileNavItem(DASHBOARD_ITEM)}
                    </ul>

                    {/* 기능 도메인별 그룹 */}
                    {NAV_SECTIONS.map((section) => (
                      <div key={section.title} className="mt-4">
                        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {section.title}
                        </p>
                        <ul className="space-y-1">
                          {section.items.map((item) => renderMobileNavItem(item))}
                        </ul>
                      </div>
                    ))}
                  </nav>

                  <div className="border-t border-white/10 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileNavOpen(false);
                        void handleLogout();
                      }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-[13px] font-bold text-red-300 hover:bg-red-500/10"
                    >
                      <LogOut className="size-4" />
                      로그아웃
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
              <h2 className="text-[13px] font-semibold text-gray-600">
                <span className="md:hidden">{activeNavLabel}</span>
                <span className="hidden md:inline">최고 관리자 콘솔</span>
              </h2>
              <span className="inline-flex items-center h-[20px] px-2 text-[10px] font-semibold rounded-md text-blue-600 bg-blue-500/[0.08]">
                {admin.role === "SUPER_ADMIN" ? "최고 관리자" : "지원"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 h-9 pl-2 pr-2.5 rounded-xl hover:bg-black/[0.03] transition-all duration-200 outline-none">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-900 text-white text-[11px] font-bold">
                      {admin.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden text-[13px] font-medium text-gray-600 sm:inline">
                      {admin.name}
                    </span>
                    <ChevronDown className="hidden size-3 text-gray-300 sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
                  <DropdownMenuLabel className="font-normal px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[13px] font-semibold text-gray-900">
                        {admin.name}
                      </p>
                      <p className="text-[11px] text-gray-400">{admin.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={handleLogout}
                    className="cursor-pointer rounded-lg h-9 text-[13px]"
                  >
                    <LogOut className="size-4" />
                    로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 md:p-6 relative">
            {isPending && (
              <div className="fixed inset-0 z-10 bg-[#F4F6F9]/60 flex items-start justify-center pt-32 pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13px] text-slate-600 font-medium">
                    로딩 중...
                  </span>
                </div>
              </div>
            )}
            {children}
          </main>
        </div>
       </div>
        <BusinessInfoBlock
          compact
          className="border-t border-slate-200 bg-white"
        />
      </div>
    </TooltipProvider>
  );
}
