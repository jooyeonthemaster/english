"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { getDefaultStaffDisplayTitle } from "@/lib/staff-display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: string;
  displayTitle?: string;
  academyId: string;
  academyName: string;
}

interface UserMenuProps {
  staff: StaffSession;
  basePath: "/director" | "/teacher";
  collapsed: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UserMenu({ staff, basePath, collapsed, onOpenChange }: UserMenuProps) {
  const displayTitle =
    staff.displayTitle?.trim() || getDefaultStaffDisplayTitle(staff.role);

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button
            type="button"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl outline-none transition-all duration-200 hover:bg-black/[0.04]"
            aria-label={`${staff.name} · ${displayTitle}`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-[11px] font-bold text-white">
              {getInitials(staff.name)}
            </div>
          </button>
        ) : (
          <button
            type="button"
            className="flex h-[46px] w-full items-center gap-2.5 rounded-xl border border-gray-200/60 bg-white/60 px-2.5 outline-none transition-all duration-200 hover:border-gray-300/70 hover:bg-white"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-[11px] font-bold text-white">
              {getInitials(staff.name)}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-semibold text-gray-800">
                  {staff.name}
                </span>
                <span
                  className="inline-flex h-[15px] max-w-[74px] shrink-0 items-center truncate rounded bg-blue-500/[0.08] px-1 text-[9.5px] font-semibold text-blue-500"
                  title={displayTitle}
                >
                  {displayTitle}
                </span>
              </div>
              <span className="mt-0.5 block truncate text-[10.5px] text-gray-400">
                {staff.academyName}
              </span>
            </div>
            <ChevronDown className="size-3 shrink-0 text-gray-300" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "bottom"}
        align="start"
        sideOffset={collapsed ? 12 : 6}
        className={cn(
          "z-[70] rounded-xl p-1.5",
          collapsed ? "w-56" : "w-[var(--radix-dropdown-menu-trigger-width)]",
        )}
      >
        <DropdownMenuLabel className="px-3 py-2 font-normal">
          <div className="flex flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[13px] font-semibold text-gray-900">
                {staff.name}
              </p>
              <span
                className="inline-flex h-[16px] max-w-[96px] shrink-0 items-center truncate rounded bg-blue-50 px-1.5 text-[10px] font-bold text-blue-600"
                title={displayTitle}
              >
                {displayTitle}
              </span>
            </div>
            <p className="truncate text-[11px] text-gray-400">{staff.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="h-9 rounded-lg text-[13px]">
          <Link href={`${basePath}/profile`} className="cursor-pointer">
            <User className="size-4" />
            내 프로필
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="h-9 cursor-pointer rounded-lg text-[13px]"
        >
          <LogOut className="size-4" />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
