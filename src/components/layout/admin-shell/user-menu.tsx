// @ts-nocheck
"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
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
  academyId: string;
  academyName: string;
}

interface UserMenuProps {
  staff: StaffSession;
  basePath: "/director" | "/teacher";
  collapsed: boolean;
}

export function UserMenu({ staff, basePath, collapsed }: UserMenuProps) {
  return (
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
  );
}
