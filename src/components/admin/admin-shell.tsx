"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  UserPlus,
  Users,
  Coins,
  CreditCard,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const NAV_ITEMS = [
  { label: "대시보드", icon: LayoutDashboard, href: "/admin" },
  { label: "회원 관리", icon: Users, href: "/admin/members" },
  { label: "가입 신청", icon: UserPlus, href: "/admin/registrations" },
  { label: "학원 관리", icon: Building2, href: "/admin/academies" },
  { label: "크레딧", icon: Coins, href: "/admin/credits" },
  { label: "요금제", icon: CreditCard, href: "/admin/plans" },
  { label: "설정", icon: Settings, href: "/admin/settings" },
];

const SIDEBAR_STORAGE_KEY = "yshin-admin-sidebar-collapsed";

export function SuperAdminShell({ children, admin }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
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
    return effectivePath.startsWith(href);
  }

  function handleNavClick(href: string, e: React.MouseEvent) {
    e.preventDefault();
    if (href === pathname) return;
    setNavigatingTo(href);
    startTransition(() => {
      router.push(href);
    });
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (!mounted) {
    return (
      <div className="flex h-screen bg-[#F4F6F9]">
        <div className="w-[220px] shrink-0" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden bg-[#F4F6F9]">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
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
              <Shield className="size-5 text-blue-400" strokeWidth={2} />
              {!collapsed && (
                <span className="font-bold text-white tracking-tight text-[18px]">
                  영신ai
                  <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase ml-1.5">
                    admin
                  </span>
                </span>
              )}
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            <ul className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;

                const linkContent = (
                  <Link
                    href={item.href}
                    onClick={(e) => handleNavClick(item.href, e)}
                    className={cn(
                      "group/item relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200",
                      collapsed
                        ? "justify-center h-10 w-10 mx-auto"
                        : "h-[38px] px-3",
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
              })}
            </ul>
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
          className={cn(
            "flex-1 flex flex-col min-h-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
            collapsed ? "ml-[72px]" : "ml-[220px]",
          )}
        >
          {/* Top header */}
          <header
            className="sticky top-0 z-20 flex items-center justify-between h-[56px] px-6"
            style={{
              background: "rgba(244,246,249,0.75)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              borderBottom: "1px solid rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex items-center gap-3">
              <h2 className="text-[13px] font-semibold text-gray-600">
                최고 관리자 콘솔
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
                    <span className="text-[13px] font-medium text-gray-600">
                      {admin.name}
                    </span>
                    <ChevronDown className="size-3 text-gray-300" />
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
          <main className="flex-1 overflow-y-auto p-6 relative">
            {isPending && (
              <div className="absolute inset-0 z-10 bg-[#F4F6F9]/60 flex items-start justify-center pt-32">
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
    </TooltipProvider>
  );
}
