// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  LogOut,
  User,
  ChevronDown,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
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
import { getNavGroups, type NavGroup } from "./nav-config";
import { CreditBadge } from "@/components/credits/credit-badge";
import { MaybeComingSoon } from "./maybe-coming-soon";

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

  function handleNavClick(href: string, e: React.MouseEvent) {
    e.preventDefault();
    if (href === pathname) return;
    setNavigatingTo(href);
    startTransition(() => {
      router.push(href);
    });
  }

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
        {/* ─── Sidebar ─── */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
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
                영신ai
              </span>
              {!collapsed && (
                <span className="text-[10px] text-gray-300 font-medium tracking-widest uppercase mt-0.5">
                  erp
                </span>
              )}
            </Link>
          </div>

          {/* Top user actions */}
          <div
            className={cn(
              "shrink-0 border-b border-gray-200/50 transition-all duration-300",
              collapsed ? "px-2 pb-2 space-y-1" : "px-3 pb-3 space-y-1.5"
            )}
          >
            {/* User dropdown (merged with academy/role) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {collapsed ? (
                  <button
                    className="flex items-center justify-center h-10 w-10 mx-auto rounded-xl hover:bg-black/[0.04] transition-all duration-200 outline-none"
                    aria-label={`${staff.name} · ${staff.academyName}`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-900 text-white text-[11px] font-bold">
                      {getInitials(staff.name)}
                    </div>
                  </button>
                ) : (
                  <button className="flex items-center gap-2.5 w-full h-[46px] px-2.5 rounded-xl bg-white/60 border border-gray-200/60 hover:border-gray-300/70 hover:bg-white transition-all duration-200 outline-none">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-900 text-white text-[11px] font-bold shrink-0">
                      {getInitials(staff.name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold text-gray-800 truncate">
                          {staff.name}
                        </span>
                        <span className="inline-flex items-center h-[15px] px-1 text-[9.5px] font-semibold rounded text-blue-500 bg-blue-500/[0.08] shrink-0">
                          {staff.role === "DIRECTOR" ? "원장" : "강사"}
                        </span>
                      </div>
                      <span className="block text-[10.5px] text-gray-400 truncate mt-0.5">
                        {staff.academyName}
                      </span>
                    </div>
                    <ChevronDown className="size-3 text-gray-300 shrink-0" />
                  </button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-56 rounded-xl p-1.5"
              >
                <DropdownMenuLabel className="font-normal px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[13px] font-semibold text-gray-900">
                      {staff.name}
                    </p>
                    <p className="text-[11px] text-gray-400">{staff.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="rounded-lg h-9 text-[13px]">
                  <Link href={`${basePath}/profile`} className="cursor-pointer">
                    <User className="size-4" />
                    내 프로필
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="cursor-pointer rounded-lg h-9 text-[13px]"
                >
                  <LogOut className="size-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 공지사항 */}
            {isDirector && (
              collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/director/notices"
                      onClick={(e) => handleNavClick("/director/notices", e)}
                      className={cn(
                        "flex items-center justify-center h-9 w-10 mx-auto rounded-xl transition-all duration-200",
                        pathname.startsWith("/director/notices")
                          ? "bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.18)]"
                          : "text-blue-600 bg-blue-50/70 hover:bg-blue-100/70"
                      )}
                      aria-label="공지사항"
                    >
                      <Megaphone className="size-[16px]" strokeWidth={1.8} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={12} className="text-[12px] font-medium">
                    공지사항
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href="/director/notices"
                  onClick={(e) => handleNavClick("/director/notices", e)}
                  className={cn(
                    "flex items-center gap-2 h-9 px-3 rounded-xl text-[12.5px] font-semibold transition-all duration-200",
                    pathname.startsWith("/director/notices")
                      ? "bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.18)]"
                      : "text-blue-600 bg-blue-50/70 hover:bg-blue-100/70"
                  )}
                >
                  <Megaphone className="size-[15px]" strokeWidth={1.8} />
                  <span>공지사항</span>
                </Link>
              )
            )}

            {/* Credit + Notification */}
            <div
              className={cn(
                "flex items-center",
                collapsed ? "flex-col gap-1" : "justify-between gap-1"
              )}
            >
              <CreditBadge
                collapsed={collapsed}
                popoverSide="right"
                popoverAlign="start"
              />
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex items-center justify-center h-9 w-10 mx-auto rounded-xl text-gray-400 hover:text-gray-600 hover:bg-black/[0.04] transition-all duration-200"
                      aria-label="알림"
                    >
                      <Bell className="size-[16px]" strokeWidth={1.7} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={12} className="text-[12px] font-medium">
                    알림
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button
                  className="flex items-center justify-center h-9 w-9 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-black/[0.04] transition-all duration-200"
                  aria-label="알림"
                >
                  <Bell className="size-[16px]" strokeWidth={1.7} />
                </button>
              )}
            </div>
          </div>

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
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    const hasChildren = item.children && item.children.length > 0;
                    const isOpen = openMenus[item.href];
                    const effectivePath = navigatingTo || pathname;
                    const childActive = hasChildren && item.children!.some((c) => routeMatches(c.href, effectivePath));

                    // Parent button for items with children (expanded sidebar)
                    if (hasChildren && !collapsed) {
                      return (
                        <li key={item.href}>
                          <div
                            className={cn(
                              "group/item relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full h-[38px] px-3",
                              active || childActive
                                ? "text-blue-600"
                                : "text-gray-400 hover:text-gray-700"
                            )}
                            style={(active || childActive) ? {
                              background: "rgba(59, 130, 246, 0.08)",
                              boxShadow: "0 1px 3px rgba(59, 130, 246, 0.06)",
                            } : undefined}
                          >
                            {/* Clickable label area → navigates to page + opens submenu */}
                            <Link
                              href={item.href}
                              onClick={(e) => {
                                if (!isOpen) setOpenMenus((prev) => ({ ...prev, [item.href]: true }));
                                handleNavClick(item.href, e);
                              }}
                              className="flex items-center gap-3 flex-1 min-w-0"
                            >
                              <Icon
                                className={cn(
                                  "shrink-0 transition-colors duration-200 size-[17px]",
                                  active || childActive ? "text-blue-500" : "text-gray-350 group-hover/item:text-gray-500"
                                )}
                                strokeWidth={active || childActive ? 2 : 1.7}
                              />
                              <span className="truncate">{item.label}</span>
                            </Link>
                            {/* Toggle button → only toggles submenu */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleMenu(item.href); }}
                              className="p-1 -mr-1 rounded hover:bg-black/[0.04] transition-colors"
                            >
                              <ChevronDown
                                className={cn(
                                  "size-3.5 shrink-0 transition-transform duration-200",
                                  active || childActive ? "text-blue-400" : "text-gray-300 group-hover/item:text-gray-400",
                                  isOpen ? "rotate-0" : "-rotate-90"
                                )}
                              />
                            </button>
                          </div>
                          {/* Sub-menu */}
                          <div
                            className={cn(
                              "overflow-hidden transition-all duration-200",
                              isOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
                            )}
                          >
                            <div className="ml-2 mr-1 mt-1 bg-gray-50/80 rounded-lg py-1.5 px-2 space-y-0.5">
                              {item.children!.map((child, ci) => {
                                const exactMatch = effectivePath === child.href;
                                const prefixMatch = routeMatches(child.href, effectivePath) && !exactMatch;
                                const siblingHasExactOrBetterMatch = item.children!.some(
                                  (other, oi) => oi !== ci && routeMatches(other.href, effectivePath)
                                    && other.href.length > child.href.length
                                );
                                const childIsActive = exactMatch || (prefixMatch && !siblingHasExactOrBetterMatch);
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={(e) => handleNavClick(child.href, e)}
                                    className={cn(
                                      "block px-3 py-1.5 text-[12px] rounded-md transition-colors",
                                      childIsActive
                                        ? "text-blue-600 font-semibold bg-white shadow-sm"
                                        : "text-gray-500 hover:text-blue-600 hover:font-medium hover:bg-white"
                                    )}
                                  >
                                    {child.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </li>
                      );
                    }

                    // Regular link (no children, or collapsed mode)
                    const isComingSoon = !!item.comingSoon;
                    const linkContent = (
                      <Link
                        href={item.href}
                        onClick={(e) => handleNavClick(item.href, e)}
                        className={cn(
                          "group/item relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200",
                          collapsed
                            ? "justify-center h-10 w-10 mx-auto"
                            : "h-[38px] px-3",
                          isComingSoon
                            ? active
                              ? "text-sky-700"
                              : "text-slate-500 hover:text-sky-700"
                            : active
                              ? "text-blue-600"
                              : "text-gray-400 hover:text-gray-700",
                        )}
                        style={
                          active && !isComingSoon
                            ? {
                                background: "rgba(59, 130, 246, 0.08)",
                                boxShadow: "0 1px 3px rgba(59, 130, 246, 0.06)",
                              }
                            : active && isComingSoon
                              ? {
                                  background: "rgba(56, 189, 248, 0.1)",
                                  boxShadow: "0 1px 3px rgba(56, 189, 248, 0.08)",
                                }
                              : undefined
                        }
                      >
                        <Icon
                          className={cn(
                            "shrink-0 transition-colors duration-200",
                            isComingSoon
                              ? active
                                ? "text-sky-500"
                                : "text-slate-400 group-hover/item:text-sky-500"
                              : active
                                ? "text-blue-500"
                                : "text-gray-350 group-hover/item:text-gray-500",
                            collapsed ? "size-[20px]" : "size-[17px]",
                          )}
                          strokeWidth={active ? 2 : 1.7}
                        />
                        {!collapsed && (
                          <>
                            <span className="truncate flex-1">{item.label}</span>
                            {isComingSoon && (
                              <span
                                className={cn(
                                  "size-1.5 rounded-full shrink-0 transition-all",
                                  active
                                    ? "bg-sky-500"
                                    : "bg-sky-300 group-hover/item:bg-sky-500",
                                )}
                                style={{
                                  boxShadow: active
                                    ? "0 0 8px rgba(56, 189, 248, 0.6)"
                                    : undefined,
                                }}
                              />
                            )}
                          </>
                        )}
                      </Link>
                    );

                    if (collapsed) {
                      return (
                        <li key={item.href}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {linkContent}
                            </TooltipTrigger>
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
            collapsed ? "ml-[72px]" : "ml-[220px]"
          )}
        >
          {/* Page content */}
          <main className="flex-1 min-w-0 overflow-y-auto p-6 relative">
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
