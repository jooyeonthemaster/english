// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
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
import { HelpChatbot } from "@/components/help-chatbot/help-chatbot";
import { CreditBadge } from "@/components/credits/credit-badge";

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

const SIDEBAR_STORAGE_KEY = "nara-sidebar-collapsed";

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
  const navGroups = getNavGroups(basePath);

  const filteredGroups: NavGroup[] = navGroups
    .filter((group) => !group.directorOnly || isDirector)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.directorOnly || isDirector),
    }));

  function isActive(href: string) {
    // Show navigating item as active immediately
    const effectivePath = navigatingTo || pathname;
    if (href === basePath) return effectivePath === basePath;
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

  // Auto-open menus whose children match current path
  useEffect(() => {
    const newOpen: Record<string, boolean> = {};
    for (const group of filteredGroups) {
      for (const item of group.items) {
        if (item.children && item.children.some((c) => pathname === c.href || pathname.startsWith(c.href))) {
          newOpen[item.href] = true;
        }
      }
    }
    setOpenMenus((prev) => ({ ...prev, ...newOpen }));
  }, [pathname]);

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
                NARA
              </span>
              {!collapsed && (
                <span className="text-[10px] text-gray-300 font-medium tracking-widest uppercase mt-0.5">
                  erp
                </span>
              )}
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 px-3">
            {filteredGroups.map((group, gi) => (
              <div key={gi} className={cn(gi > 0 && "mt-6")}>
                {group.title && !collapsed && (
                  <div className="px-3 mb-2">
                    <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.12em]">
                      {group.title}
                    </span>
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
                    const childActive = hasChildren && item.children!.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));

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
                                const effectivePath = navigatingTo || pathname;
                                const exactMatch = effectivePath === child.href;
                                const prefixMatch = effectivePath.startsWith(child.href + "/");
                                const siblingHasExactOrBetterMatch = item.children!.some(
                                  (other, oi) => oi !== ci && (effectivePath === other.href || effectivePath.startsWith(other.href + "/"))
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
                            ? "text-blue-600"
                            : "text-gray-400 hover:text-gray-700"
                        )}
                        style={active ? {
                          background: "rgba(59, 130, 246, 0.08)",
                          boxShadow: "0 1px 3px rgba(59, 130, 246, 0.06)",
                        } : undefined}
                      >
                        <Icon
                          className={cn(
                            "shrink-0 transition-colors duration-200",
                            active ? "text-blue-500" : "text-gray-350 group-hover/item:text-gray-500",
                            collapsed ? "size-[20px]" : "size-[17px]"
                          )}
                          strokeWidth={active ? 2 : 1.7}
                        />
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
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
          <div className="shrink-0 p-3">
            <button
              onClick={toggleSidebar}
              className={cn(
                "flex items-center justify-center w-full h-9 rounded-xl text-gray-300 hover:text-gray-500 hover:bg-black/[0.03] transition-all duration-200",
                collapsed && "w-10 mx-auto"
              )}
              aria-label={collapsed ? "사이드바 열기" : "사이드바 접기"}
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

        {/* ─── Main area ─── */}
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
            collapsed ? "ml-[72px]" : "ml-[220px]"
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
                {staff.academyName}
              </h2>
              <span className="inline-flex items-center h-[20px] px-2 text-[10px] font-semibold rounded-md text-blue-500 bg-blue-500/[0.08]">
                {staff.role === "DIRECTOR" ? "원장" : "강사"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Credit badge */}
              <CreditBadge />

              {/* Notification */}
              <button
                className="relative flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-black/[0.03] transition-all duration-200"
                aria-label="알림"
              >
                <Bell className="size-[17px]" strokeWidth={1.7} />
              </button>

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 h-9 pl-2 pr-2.5 rounded-xl hover:bg-black/[0.03] transition-all duration-200 outline-none">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-900 text-white text-[11px] font-bold">
                      {getInitials(staff.name)}
                    </div>
                    {!collapsed && (
                      <>
                        <span className="text-[13px] font-medium text-gray-600 hidden sm:block">
                          {staff.name}
                        </span>
                        <ChevronDown className="size-3 text-gray-300 hidden sm:block" />
                      </>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
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
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-6 relative">
            {isPending && (
              <div className="absolute inset-0 z-10 bg-[#F4F6F9]/60 flex items-start justify-center pt-32">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13px] text-slate-600 font-medium">로딩 중...</span>
                </div>
              </div>
            )}
            {children}
          </main>
        </div>

        {/* Help Chatbot */}
        <HelpChatbot />
      </div>
    </TooltipProvider>
  );
}
