"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getNavGroups } from "@/components/layout/nav-config";
import {
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface TeacherSidebarProps {
  academyName: string;
}

export function TeacherSidebar({ academyName }: TeacherSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const navGroups = getNavGroups("/teacher");

  function isActive(href: string): boolean {
    if (href === "/teacher") {
      return pathname === "/teacher" || pathname === "/teacher/";
    }
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-[#F2F4F6] bg-white transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#3182F6]">
          <BookOpen className="size-4 text-white" />
        </div>
        {!collapsed && (
          <span className="truncate text-[15px] font-bold text-[#191F28]">
            {academyName}
          </span>
        )}
      </div>

      <Separator className="bg-[#F2F4F6]" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="강사 메뉴">
        {navGroups
          .filter((group) => !group.directorOnly)
          .map((group, gi) => (
            <div key={gi}>
              {group.title && !collapsed && (
                <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#8B95A1]">
                  {group.title}
                </p>
              )}
              {group.items
                .filter((item) => !item.directorOnly)
                .map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-[#E8F3FF] text-[#3182F6]"
                          : "text-[#6B7684] hover:bg-[#F7F8FA] hover:text-[#333D4B]",
                        collapsed && "justify-center px-0"
                      )}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="size-[18px] shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
            </div>
          ))}
      </nav>

      <Separator className="bg-[#F2F4F6]" />

      {/* Collapse toggle */}
      <div className="p-3">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={() => setCollapsed((prev) => !prev)}
          className={cn(
            "w-full text-[#8B95A1] hover:bg-[#F7F8FA] hover:text-[#333D4B]",
            collapsed && "size-9"
          )}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" />
              <span className="text-[13px]">접기</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
