// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNavGroups, type NavGroup } from "./nav-config";
import { MaybeComingSoon } from "./maybe-coming-soon";
import { SidebarTopActions } from "./admin-shell/sidebar-top-actions";
import { NavItem } from "./admin-shell/nav-item";

interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: string;
  academyId: string;
  academyName: string;
}

interface AdminShellProps {
  children: React.ReactNode;
  staff: StaffSession;
  basePath: "/director" | "/teacher";
}

const SIDEBAR_STORAGE_KEY = "yshin-sidebar-collapsed";

export function AdminShell({ children, staff, basePath }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Clear navigating state when pathname changes
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

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const isDirector = staff.role === "DIRECTOR";
  const navGroups = useMemo(() => getNavGroups(basePath), [basePath]);

  const filteredGroups: NavGroup[] = useMemo(
    () =>
      navGroups
        .filter((group) => !group.comingSoon && (!group.directorOnly || isDirector))
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.directorOnly || isDirector),
        })),
    [isDirector, navGroups],
  );

  const routeMatches = useCallback((href: string, path: string) => {
    if (href === basePath) return path === basePath;
    const passageBankHref = `${basePath}/workbench/passages`;
    const passageImportHref = `${passageBankHref}/import`;
    if (
      href === passageBankHref &&
      (path === passageImportHref || path.startsWith(`${passageImportHref}/`))
    ) {
      return false;
    }
    return path === href || path.startsWith(`${href}/`);
  }, [basePath]);

  function isActive(href: string) {
    // Show navigating item as active immediately
    const effectivePath = navigatingTo || pathname;
    return routeMatches(href, effectivePath);
  }

  const handleNavClick = useCallback(
    (href: string, e: React.MouseEvent) => {
      e.preventDefault();
      if (href === pathname) return;
      setNavigatingTo(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [pathname, router],
  );

  // Auto-open menus whose children match current path
  useEffect(() => {
    const newOpen: Record<string, boolean> = {};
    for (const group of filteredGroups) {
      for (const item of group.items) {
        if (item.children && item.children.some((c) => routeMatches(c.href, pathname))) {
          newOpen[item.href] = true;
        }
      }
    }
    setOpenMenus((prev) => ({ ...prev, ...newOpen }));
  }, [filteredGroups, pathname, routeMatches]);

  const toggleMenu = useCallback((href: string) => {
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));
  }, []);

  const setOpenMenu = useCallback((href: string, open: boolean) => {
    setOpenMenus((prev) => ({ ...prev, [href]: open }));
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen bg-[#F4F6F9]">
        <div className="hidden w-[220px] shrink-0 md:block" />
        <div className="flex-1" />
      </div>
    );
  }

  const effectivePath = navigatingTo || pathname;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen overflow-hidden bg-[#F4F6F9]">
        {/* ─── Sidebar ─── */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] md:flex",
            collapsed ? "w-[72px]" : "w-[220px]"
          )}
          style={{
            background: "rgba(255,255,255,0.55)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            borderRight: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {/* Logo */}
          <div
            className={cn(
              "flex items-center h-[64px] shrink-0 transition-all duration-300",
              collapsed ? "justify-center px-0" : "px-6"
            )}
          >
            <Link
              href={basePath}
              className="flex items-center gap-2.5"
            >
              <span className={cn(
                "font-bold text-gray-900 tracking-tight transition-all duration-300",
                collapsed ? "text-[18px]" : "text-[20px]"
              )}>
                SMOAT
              </span>
              {!collapsed && (
                <span className="text-[10px] text-gray-300 font-medium tracking-widest uppercase mt-0.5">
                  erp
                </span>
              )}
            </Link>
          </div>

          {/* Top user actions */}
          <SidebarTopActions
            staff={staff}
            basePath={basePath}
            collapsed={collapsed}
            pathname={pathname}
            isDirector={isDirector}
            onNavClick={handleNavClick}
          />

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 px-3">
            {filteredGroups.map((group, gi) => (
              <div
                key={gi}
                className={cn(
                  gi > 0 && "mt-6",
                  group.comingSoon && "mt-8 pt-5",
                )}
                style={
                  group.comingSoon
                    ? {
                        borderTop: "1px dashed rgba(56, 189, 248, 0.25)",
                      }
                    : undefined
                }
              >
                {group.title && !collapsed && (
                  <div className="px-3 mb-2 flex items-center gap-2">
                    {group.comingSoon ? (
                      <>
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">
                          Coming Soon
                        </span>
                        <span
                          className="size-1.5 rounded-full bg-sky-500"
                          style={{ animation: "yshin-pulse 1.6s ease-in-out infinite" }}
                        />
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-300">
                        {group.title}
                      </span>
                    )}
                  </div>
                )}
                {group.title && collapsed && gi > 0 && (
                  <div className="mx-auto mb-3 w-5 border-t border-gray-200/50" />
                )}
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      collapsed={collapsed}
                      isOpen={!!openMenus[item.href]}
                      effectivePath={effectivePath}
                      routeMatches={routeMatches}
                      onNavClick={handleNavClick}
                      onToggleMenu={toggleMenu}
                      onSetOpenMenu={setOpenMenu}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Collapse toggle */}
          <div
            className={cn(
              "shrink-0 border-t border-gray-200/50 transition-all duration-300",
              collapsed ? "px-2 py-2" : "px-3 py-2.5"
            )}
          >
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleSidebar}
                    className="flex items-center justify-center h-10 w-10 mx-auto rounded-xl text-white bg-blue-600 border border-blue-600 hover:bg-blue-700 hover:border-blue-700 shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.35)] transition-all duration-200"
                    aria-label="사이드바 열기"
                  >
                    <PanelLeftOpen className="size-[18px]" strokeWidth={1.9} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12} className="text-[12px] font-medium">
                  사이드바 열기
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={toggleSidebar}
                className="group flex items-center justify-center gap-2 w-full h-10 rounded-xl text-white bg-blue-600 border border-blue-600 hover:bg-blue-700 hover:border-blue-700 shadow-[0_4px_12px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_16px_rgba(37,99,235,0.35)] transition-all duration-200"
                aria-label="사이드바 접기"
              >
                <PanelLeftClose className="size-[17px] text-white/90 group-hover:text-white transition-colors" strokeWidth={1.9} />
                <span className="text-[12px] font-semibold tracking-tight">사이드바 접기</span>
              </button>
            )}
          </div>
        </aside>

        {/* ─── Main area ─── */}
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 min-w-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
            collapsed ? "ml-[72px]" : "ml-[220px]",
            "max-md:ml-0"
          )}
        >
          {/* Page content */}
          <main className="flex-1 min-w-0 overflow-y-auto p-6 relative max-md:p-0">
            {isPending && (
              <div className="absolute inset-0 z-10 bg-[#F4F6F9]/60 flex items-start justify-center pt-32">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13px] text-slate-600 font-medium">로딩 중...</span>
                </div>
              </div>
            )}
            <MaybeComingSoon pathname={pathname} basePath={basePath}>
              {children}
            </MaybeComingSoon>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
