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
  onOpenChange?: (open: boolean) => void;
}

export function UserMenu({ staff, basePath, collapsed, onOpenChange }: UserMenuProps) {
  return (
    // modal=false: 기본 모달 드롭다운은 body에 pointer-events:none + 스크롤 락을 걸어
    // 사이드바 위에 커서가 있어도 합성 mouseleave를 유발한다. 그러면 admin-shell의 peek
    // 닫기(onMouseLeave)가 발동→접힘→재호버→펼침이 반복돼 사이드바가 깜빡인다. 비모달로
    // 두면 이 부작용이 사라지고, 바깥 클릭·ESC 닫힘은 그대로 동작한다.
    // onOpenChange: 메뉴가 열린 동안 admin-shell이 peek 전환을 동결하도록 알린다.
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
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
        // 접힘: 아이콘 옆(오른쪽)으로 펼침. 펼침: 버튼 바로 아래로 드롭해
        // 본문 위에 둥둥 뜨지 않고 트리거에 붙어 보이게 한다.
        side={collapsed ? "right" : "bottom"}
        align="start"
        sideOffset={collapsed ? 12 : 6}
        // z-[70]: peek(hover로 펼친) 사이드바 오버레이가 z-[60]이라, 그보다 위에 둬야
        // 펼침 상태에서 버튼 아래로 드롭된 메뉴가 사이드바 뒤에 가려지지 않는다.
        className={cn(
          "z-[70] rounded-xl p-1.5",
          collapsed ? "w-56" : "w-[var(--radix-dropdown-menu-trigger-width)]",
        )}
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
