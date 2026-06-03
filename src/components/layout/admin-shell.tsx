// @ts-nocheck
"use client";

import React, { useState, useEffect, useCallback, useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand/brand-mark";
import { BusinessInfoBlock } from "@/components/legal/business-info-block";
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
  // Clear navigating state when pathname changes
  useEffect(() => {
    setNavigatingTo(null);
  }, [pathname]);

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
  const isDashboardV2 = pathname === "/director/dashboard-v2";

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
            onMouseEnter={() => setPeekOpen(true)}
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
            onMouseEnter={collapsed && !peekOpen ? () => setPeekOpen(true) : undefined}
            onMouseLeave={isPeeking ? () => setPeekOpen(false) : undefined}
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
              staff={staff}
              basePath={basePath}
              collapsed={displayCollapsed}
              pathname={pathname}
              isDirector={isDirector}
              onNavClick={handleNavClick}
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
          {/* Page content */}
          <main
            className={cn(
              "flex-1 min-w-0 relative max-md:p-0",
              isDashboardV2 ? "p-2.5" : "p-6",
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
            <MaybeComingSoon pathname={pathname} basePath={basePath}>
              {children}
            </MaybeComingSoon>
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
