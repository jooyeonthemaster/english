// @ts-nocheck
"use client";

import Link from "next/link";
import { Megaphone, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreditBadge } from "@/components/credits/credit-badge";
import { NotificationBell } from "@/components/growth/notification-bell";
import { getSpecialAccount } from "@/lib/special-accounts";
import { requestOpenFeedback } from "@/lib/feedback-store";
import { UserMenu } from "./user-menu";

interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: string;
  academyId: string;
  academyName: string;
}

interface SidebarTopActionsProps {
  staff: StaffSession;
  basePath: "/director" | "/teacher";
  collapsed: boolean;
  pathname: string;
  isDirector: boolean;
  onNavClick: (href: string, e: React.MouseEvent) => void;
  onUserMenuOpenChange?: (open: boolean) => void;
}

export function SidebarTopActions({
  staff,
  basePath,
  collapsed,
  pathname,
  isDirector,
  onNavClick,
  onUserMenuOpenChange,
}: SidebarTopActionsProps) {
  const isSpecial = Boolean(getSpecialAccount(staff.email));

  return (
    <div
      className={cn(
        "shrink-0 border-b border-gray-200/50 transition-all duration-300",
        collapsed ? "px-2 pb-2 space-y-1" : "px-3 pb-3 space-y-1.5",
      )}
    >
      {/* User dropdown (merged with academy/role) */}
      <UserMenu
        staff={staff}
        basePath={basePath}
        collapsed={collapsed}
        onOpenChange={onUserMenuOpenChange}
      />

      {/* 공지사항 */}
      {isDirector &&
        (collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/director/notices"
                onClick={(e) => onNavClick("/director/notices", e)}
                className={cn(
                  "flex items-center justify-center h-9 w-10 mx-auto rounded-xl transition-all duration-200",
                  pathname.startsWith("/director/notices")
                    ? "bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.18)]"
                    : "text-blue-600 bg-blue-50/70 hover:bg-blue-100/70",
                )}
                aria-label="공지사항"
              >
                <Megaphone className="size-[16px]" strokeWidth={1.8} />
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={12}
              className="text-[12px] font-medium"
            >
              공지사항
            </TooltipContent>
          </Tooltip>
        ) : (
          <Link
            href="/director/notices"
            onClick={(e) => onNavClick("/director/notices", e)}
            className={cn(
              "flex items-center gap-2 h-9 px-3 rounded-xl text-[12.5px] font-semibold transition-all duration-200",
              pathname.startsWith("/director/notices")
                ? "bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.18)]"
                : "text-blue-600 bg-blue-50/70 hover:bg-blue-100/70",
            )}
          >
            <Megaphone className="size-[15px]" strokeWidth={1.8} />
            <span>공지사항</span>
          </Link>
        ))}

      {/* Credit + Notification */}
      <div
        className={cn(
          "flex items-center",
          collapsed ? "flex-col gap-1" : "justify-between gap-1",
        )}
      >
        <CreditBadge
          collapsed={collapsed}
          popoverSide="right"
          popoverAlign="start"
        />
        <NotificationBell
          collapsed={collapsed}
          popoverSide="right"
          popoverAlign="start"
          fullPageHref={isDirector ? "/director/notifications" : undefined}
        />
      </div>

      {/* 무료 크레딧 신청 (협업 피드백 이벤트) — opens the contact modal */}
      {isDirector &&
        !isSpecial &&
        (collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => requestOpenFeedback(2)}
                className="feedback-cta-glow flex items-center justify-center h-9 w-10 mx-auto rounded-xl bg-blue-600 text-white transition-colors duration-200 hover:bg-blue-700"
                aria-label="무료 크레딧 신청하기"
              >
                <Ticket className="size-[16px]" strokeWidth={1.9} />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={12}
              className="text-[12px] font-medium"
            >
              무료 크레딧 신청하기
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => requestOpenFeedback(2)}
            className="feedback-cta-glow flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[12.5px] font-bold text-white transition-colors duration-200 hover:bg-blue-700"
          >
            <Ticket className="size-[15px]" strokeWidth={1.9} />
            <span>무료 크레딧 신청하기</span>
          </button>
        ))}
    </div>
  );
}
