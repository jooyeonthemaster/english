// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNavGroups, type NavGroup } from "./nav-config";
import { MaybeComingSoon } from "./maybe-coming-soon";
import { SidebarTopActions } from "./admin-shell/sidebar-top-actions";
import { NavItem } from "./admin-shell/nav-item";
import { useReviewDrawer } from "./review-drawer-context";
import { useSidebarFocus } from "./sidebar-focus-context";
import { MarqueeBoundaryContext } from "./marquee-boundary-context";
import {
  STAFF_PROFILE_UPDATED_EVENT,
  type StaffProfileUpdatedDetail,
} from "@/lib/staff-profile-events";

interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: string;
  displayTitle?: string;
  academyId: string;
  academyName: string;
}

interface AdminShellProps {
  children: React.ReactNode;
  staff: StaffSession;
  basePath: "/director" | "/teacher";
}

const SIDEBAR_STORAGE_KEY = "yshin-sidebar-collapsed";
const SIDEBAR_WIDTH_STORAGE_KEY = "yshin-sidebar-width";
const SIDEBAR_DEFAULT_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 300;
const SIDEBAR_DRAG_THRESHOLD = 4;

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export function AdminShell({ children, staff, basePath }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [displayStaff, setDisplayStaff] = useState(staff);
  const [isPending, startTransition] = useTransition();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // When the sidebar is collapsed, hovering the collapsed sidebar area
  // temporarily "peeks" the full sidebar as an overlay (without pushing content).
  // It stays open until the mouse fully leaves the sidebar.
  const [peekOpen, setPeekOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarScrolling, setSidebarScrolling] = useState(false);
  const [mounted, setMounted] = useState(false);
  const suppressSidebarHandleClickRef = React.useRef(false);
  const sidebarScrollTimeoutRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null);
  // 마키(영역 드래그)의 기본 시작 영역 = 사이드바를 제외한 본문(<main>). 컨텍스트로
  // 내려, 페이지별 배선 없이 어느 페이지에서든 본문 어디서나 드래그를 시작하게 한다.
  const mainContentRef = React.useRef<HTMLElement>(null);
  // Clear navigating state when pathname changes
  useEffect(() => {
    setNavigatingTo(null);
  }, [pathname]);

  useEffect(() => {
    setDisplayStaff(staff);
  }, [staff]);

  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<StaffProfileUpdatedDetail>).detail;
      if (!detail) return;
      setDisplayStaff((current) => ({
        ...current,
        ...(detail.name !== undefined ? { name: detail.name } : {}),
        ...(detail.email !== undefined ? { email: detail.email } : {}),
        ...(detail.academyName !== undefined ? { academyName: detail.academyName } : {}),
        ...(detail.displayTitle !== undefined ? { displayTitle: detail.displayTitle } : {}),
      }));
    };

    window.addEventListener(STAFF_PROFILE_UPDATED_EVENT, handleProfileUpdate);
    return () => window.removeEventListener(STAFF_PROFILE_UPDATED_EVENT, handleProfileUpdate);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      setSidebarWidth(clampSidebarWidth(storedWidth));
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarScrollTimeoutRef.current) {
        window.clearTimeout(sidebarScrollTimeoutRef.current);
      }
    };
  }, []);

  // When the sidebar is pinned open (not collapsed), peek is irrelevant.
  useEffect(() => {
    if (!collapsed) setPeekOpen(false);
  }, [collapsed]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const handleSidebarHandleClick = useCallback(() => {
    if (suppressSidebarHandleClickRef.current) {
      suppressSidebarHandleClickRef.current = false;
      return;
    }
    toggleSidebar();
  }, [toggleSidebar]);

  const handleSidebarResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (collapsed) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      suppressSidebarHandleClickRef.current = false;

      const startX = event.clientX;
      const startWidth = sidebarWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      let didDrag = false;
      let latestWidth = startWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        if (!didDrag) {
          if (Math.abs(deltaX) < SIDEBAR_DRAG_THRESHOLD) return;
          didDrag = true;
          suppressSidebarHandleClickRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }

        moveEvent.preventDefault();
        latestWidth = clampSidebarWidth(startWidth + deltaX);
        setSidebarWidth(latestWidth);
      };

      const finish = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (didDrag) {
          document.body.style.cursor = previousCursor;
          document.body.style.userSelect = previousUserSelect;
          localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(latestWidth));
          window.setTimeout(() => {
            suppressSidebarHandleClickRef.current = false;
          }, 0);
        }
      };

      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [collapsed, sidebarWidth],
  );

  const handleSidebarScroll = useCallback(() => {
    setSidebarScrolling(true);
    if (sidebarScrollTimeoutRef.current) {
      window.clearTimeout(sidebarScrollTimeoutRef.current);
    }
    sidebarScrollTimeoutRef.current = window.setTimeout(() => {
      setSidebarScrolling(false);
      sidebarScrollTimeoutRef.current = null;
    }, 900);
  }, []);

  // When a review drawer is open — or a workspace (e.g. 시험지 빌더) requests it
  // because both of its side panels are open — force-collapse the sidebar so the
  // main workspace has more room. On release we restore whatever the user had set
  // manually, so a manually-collapsed sidebar stays collapsed.
  const { isOpen: drawerOpen, width: drawerWidth } = useReviewDrawer();
  const { collapseRequested } = useSidebarFocus();
  const shouldForceCollapse = drawerOpen || collapseRequested;
  const preForceCollapsedRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    if (shouldForceCollapse) {
      if (preForceCollapsedRef.current === null) {
        preForceCollapsedRef.current = collapsed;
      }
      if (!collapsed) setCollapsed(true);
    } else if (preForceCollapsedRef.current !== null) {
      setCollapsed(preForceCollapsedRef.current);
      preForceCollapsedRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldForceCollapse]);

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  // 사이드바 상단 사용자 메뉴(드롭다운)가 열려 있는 동안엔 hover-peek 전환을 동결한다.
  // 포털로 뜬 메뉴 위로 커서가 가는 순간 사이드바에 mouseleave가 발생 → peek가 닫히고
  // 접힘/펼침 트리거 버튼이 교체돼 열려 있던 메뉴가 즉시 닫힌다(=버튼이 안 눌리는 듯 보임).
  // sidebarHoverRef로 실제 커서의 사이드바 안/밖 여부를 추적해, 메뉴를 닫을 때 peek를 복구한다.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarHoverRef = React.useRef(false);
  const handleUserMenuOpenChange = useCallback((open: boolean) => {
    setUserMenuOpen(open);
    if (!open) setPeekOpen(sidebarHoverRef.current);
  }, []);

  const isDirector = displayStaff.role === "DIRECTOR";
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
    // 튜터 운영 홈(/tutor)은 학생·클래스·기기·원비 허브다. 하위 /tutor/programs,
    // /tutor/distributions, /tutor/monitor 는 별도 nav 항목이므로 자손까지
    // active 로 번지지 않게 정확히 일치(+ 학생 상세 /students/* 는 허브 소속)로 본다.
    const tutorHubHref = `${basePath}/tutor`;
    if (href === tutorHubHref) {
      return (
        path === tutorHubHref ||
        path === `${basePath}/students` ||
        path.startsWith(`${basePath}/students/`)
      );
    }
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

  const handleMobileNavClick = useCallback(
    (href: string, e: React.MouseEvent) => {
      setMobileNavOpen(false);
      handleNavClick(href, e);
    },
    [handleNavClick],
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
  const isDashboardV2 = pathname === "/director/dashboard-v2";
  const activeNavLabel = (() => {
    for (const group of filteredGroups) {
      for (const item of group.items) {
        const exactChild = item.children?.find((child) => child.href === effectivePath);
        if (exactChild) return exactChild.label;
        const activeChild = item.children?.find((child) => routeMatches(child.href, effectivePath));
        if (activeChild) return activeChild.label;
        if (routeMatches(item.href, effectivePath)) return item.label;
      }
    }
    return basePath === "/director" ? "원장 콘솔" : "교사 콘솔";
  })();

  // `isPeeking`: collapsed sidebar temporarily expanded via collapsed-area hover.
  // `displayCollapsed`: whether to render the sidebar visually collapsed (narrow,
  // icons only). During a peek we render it visually expanded even though the
  // underlying `collapsed` state is still true.
  const isPeeking = collapsed && peekOpen;
  const displayCollapsed = collapsed && !isPeeking;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen flex-col bg-[#F4F6F9]">
       <div className="flex flex-1">
        {/* Left-edge hover trigger kept for edge-only entries; the collapsed
            sidebar itself also opens the temporary peek on hover. */}
        {collapsed && !peekOpen && (
          <div
            aria-hidden
            onMouseEnter={() => {
              sidebarHoverRef.current = true;
              if (!userMenuOpen) setPeekOpen(true);
            }}
            className="fixed left-0 top-0 z-40 hidden h-screen w-1.5 md:block"
          />
        )}
        {/* ─── Sidebar ─── */}
        <div
          className={cn(
            "sticky top-0 hidden h-screen self-start shrink-0 md:flex",
            isPeeking ? "z-[60]" : collapsed ? "z-30" : null,
          )}
        >
          {/* While collapsed, the sidebar is rendered as an absolute overlay so
              that peeking it open only animates the overlay's width — the content
              to the right keeps the same reserved space (this spacer) and never
              reflows when the peek opens or closes. */}
          {collapsed && (
            <div className="shrink-0" style={{ width: SIDEBAR_COLLAPSED_WIDTH }} />
          )}
          <div
            className={cn(
              "flex h-full min-h-0",
              collapsed && "absolute left-0 top-0 z-50",
            )}
            onMouseEnter={() => {
              sidebarHoverRef.current = true;
              if (collapsed && !peekOpen && !userMenuOpen) setPeekOpen(true);
            }}
            onMouseLeave={() => {
              sidebarHoverRef.current = false;
              if (isPeeking && !userMenuOpen) setPeekOpen(false);
            }}
            style={
              collapsed
                ? {
                    // Opaque backdrop so the overlaid sidebar (incl. the drag-bar
                    // strip) doesn't show the content behind it.
                    background: "var(--sidebar-solid)",
                    ...(isPeeking
                      ? { boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }
                      : {}),
                  }
                : undefined
            }
          >
          <aside
            className="flex h-full shrink-0 flex-col transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
            style={{
              width: displayCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth,
              background: "var(--sidebar-glass)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              borderRight: "1px solid var(--sidebar-edge)",
            }}
          >
            {/* Logo */}
            <div
              className={cn(
                "flex items-center h-[64px] shrink-0 transition-all duration-300",
                displayCollapsed ? "justify-center px-0" : "px-6"
              )}
            >
              <Link
                href={basePath}
                className="flex items-center gap-2.5"
              >
                <BrandIcon
                  className={cn("shrink-0", displayCollapsed ? "size-9" : "size-8")}
                  markClassName={displayCollapsed ? "size-[21px]" : "size-[20px]"}
                />
                {!displayCollapsed && (
                  <span className="text-[20px] font-bold tracking-tight text-gray-900 transition-all duration-300">
                    SMOAT
                  </span>
                )}
                {!displayCollapsed && (
                  <span className="text-[10px] text-gray-300 font-medium tracking-widest uppercase mt-0.5">
                    erp
                  </span>
                )}
              </Link>
            </div>

            {/* Top user actions */}
            <SidebarTopActions
              staff={displayStaff}
              basePath={basePath}
              collapsed={displayCollapsed}
              pathname={pathname}
              isDirector={isDirector}
              onNavClick={handleNavClick}
              onUserMenuOpenChange={handleUserMenuOpenChange}
            />

            {/* Navigation */}
            <nav
              className={cn(
                "min-h-0 flex-1 overflow-y-auto sidebar-scroll sidebar-scroll-left py-3 px-3",
                sidebarScrolling && "is-scrolling",
              )}
              onScroll={handleSidebarScroll}
            >
              <div className="sidebar-scroll-content">
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
                    {group.title && !displayCollapsed && (
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
                    {group.title && displayCollapsed && gi > 0 && (
                      <div className="mx-auto mb-3 w-5 border-t border-gray-200/50" />
                    )}
                    <ul className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavItem
                          key={item.href}
                          item={item}
                          active={isActive(item.href)}
                          collapsed={displayCollapsed}
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
              </div>
            </nav>
          </aside>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onPointerDown={handleSidebarResizePointerDown}
                onClick={handleSidebarHandleClick}
                title={
                  collapsed
                    ? "사이드바열기"
                    : "드래그하여 폭 조절 · 클릭하여 사이드바닫기"
                }
                aria-label={collapsed ? "사이드바열기" : "사이드바닫기"}
                aria-expanded={!collapsed}
                className={cn(
                  "group/sidebar-handle relative flex h-full min-h-0 w-2 shrink-0 touch-none select-none items-center justify-center",
                  collapsed ? "cursor-pointer" : "cursor-col-resize",
                )}
              >
                <span className="h-full w-px bg-slate-200 transition-colors group-hover/sidebar-handle:bg-sky-300" />
                <span className="absolute right-0 z-10 flex h-7 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors group-hover/sidebar-handle:border-sky-300 group-hover/sidebar-handle:text-sky-500 group-active/sidebar-handle:bg-sky-50">
                  {collapsed ? (
                    <PanelLeftOpen className="h-3.5 w-3.5" strokeWidth={1.9} />
                  ) : (
                    <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.9} />
                  )}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="text-[12px] font-medium">
              {collapsed ? "사이드바열기" : "드래그하여 폭 조절 · 클릭하여 사이드바닫기"}
            </TooltipContent>
          </Tooltip>
          </div>
        </div>

        {/* ─── Main area ─── */}
        <div
          className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
          style={drawerOpen && drawerWidth > 0 ? { marginRight: drawerWidth } : undefined}
        >
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-3 backdrop-blur-xl md:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-[0.98]"
                  aria-label="메뉴 열기"
                >
                  <Menu className="size-5" strokeWidth={2} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[min(92vw,360px)] gap-0 border-r border-slate-200 bg-white p-0"
              >
                <SheetHeader className="border-b border-slate-100 px-4 py-4 text-left">
                  <SheetTitle className="flex items-center gap-2.5">
                    <BrandIcon className="size-8 shrink-0" markClassName="size-[20px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[17px] font-bold tracking-tight text-slate-950">
                        SMOAT
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-slate-400">
                        {displayStaff.academyName}
                      </span>
                    </span>
                  </SheetTitle>
                </SheetHeader>

                <SidebarTopActions
                  staff={displayStaff}
                  basePath={basePath}
                  collapsed={false}
                  pathname={pathname}
                  isDirector={isDirector}
                  onNavClick={handleMobileNavClick}
                />

                <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="모바일 메뉴">
                  {filteredGroups.map((group, gi) => (
                    <div key={gi} className={cn(gi > 0 && "mt-5")}>
                      {group.title ? (
                        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          {group.title}
                        </p>
                      ) : null}
                      <ul className="space-y-1">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const active = isActive(item.href);
                          const childActive = item.children?.some((child) =>
                            routeMatches(child.href, effectivePath),
                          );
                          const itemActive = active || childActive;

                          if (item.children?.length) {
                            return (
                              <li key={item.href}>
                                <div
                                  className={cn(
                                    "flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-bold",
                                    itemActive ? "bg-blue-50 text-blue-700" : "text-slate-700",
                                  )}
                                >
                                  <Icon className="size-5 shrink-0" strokeWidth={itemActive ? 2 : 1.8} />
                                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                  {item.beta ? (
                                    <span className="rounded border border-blue-200 bg-blue-50 px-1 py-px text-[9px] font-black leading-none text-blue-500">
                                      BETA
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 space-y-0.5 pl-6">
                                  {item.children.map((child) => {
                                    const childIsActive = routeMatches(child.href, effectivePath);
                                    return (
                                      <Link
                                        key={child.href}
                                        href={child.href}
                                        onClick={(e) => handleMobileNavClick(child.href, e)}
                                        className={cn(
                                          "flex min-h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold",
                                          childIsActive
                                            ? "bg-blue-600 text-white"
                                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                                        )}
                                      >
                                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                        {child.beta ? (
                                          <span
                                            className={cn(
                                              "rounded border px-1 py-px text-[9px] font-black leading-none",
                                              childIsActive
                                                ? "border-white/30 bg-white/15 text-white"
                                                : "border-blue-200 bg-blue-50 text-blue-500",
                                            )}
                                          >
                                            BETA
                                          </span>
                                        ) : null}
                                      </Link>
                                    );
                                  })}
                                </div>
                              </li>
                            );
                          }

                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={(e) => handleMobileNavClick(item.href, e)}
                                className={cn(
                                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-bold",
                                  itemActive
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-slate-700 hover:bg-slate-50",
                                )}
                              >
                                <Icon className="size-5 shrink-0" strokeWidth={itemActive ? 2 : 1.8} />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {item.beta ? (
                                  <span
                                    className={cn(
                                      "rounded border px-1 py-px text-[9px] font-black leading-none",
                                      itemActive
                                        ? "border-white/30 bg-white/15 text-white"
                                        : "border-blue-200 bg-blue-50 text-blue-500",
                                    )}
                                  >
                                    BETA
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1 px-3 text-center">
              <div className="truncate text-[15px] font-bold text-slate-900">{activeNavLabel}</div>
              <div className="truncate text-[11px] font-medium text-slate-400">
                {basePath === "/director" ? "원장" : "교사"} 워크스페이스
              </div>
            </div>
            <div className="size-10" aria-hidden />
          </header>

          {/* Page content */}
          <main
            ref={mainContentRef}
            className={cn(
              "flex-1 min-w-0 relative",
              isDashboardV2 ? "p-2.5" : "p-4 md:p-6",
            )}
          >
            {isPending && (
              <div className="fixed inset-0 z-10 bg-[#F4F6F9]/60 flex items-start justify-center pt-32 pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13px] text-slate-600 font-medium">로딩 중...</span>
                </div>
              </div>
            )}
            <MarqueeBoundaryContext.Provider value={mainContentRef}>
              <MaybeComingSoon pathname={pathname} basePath={basePath}>
                {children}
              </MaybeComingSoon>
            </MarqueeBoundaryContext.Provider>
          </main>
        </div>
       </div>
        {!isDashboardV2 && (
          <BusinessInfoBlock
            compact
            className="border-t border-slate-200 bg-white"
          />
        )}
      </div>
    </TooltipProvider>
  );
}
