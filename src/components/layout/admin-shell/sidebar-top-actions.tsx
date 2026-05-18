// @ts-nocheck
"use client";

import Link from "next/link";
import { Bell, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreditBadge } from "@/components/credits/credit-badge";
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
}

export function SidebarTopActions({
  staff,
  basePath,
  collapsed,
  pathname,
  isDirector,
  onNavClick,
}: SidebarTopActionsProps) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-gray-200/50 transition-all duration-300",
        collapsed ? "px-2 pb-2 space-y-1" : "px-3 pb-3 space-y-1.5",
      )}
    >
      {/* User dropdown (merged with academy/role) */}
      <UserMenu staff={staff} basePath={basePath} collapsed={collapsed} />

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
            <TooltipContent
              side="right"
              sideOffset={12}
              className="text-[12px] font-medium"
            >
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
  );
}
